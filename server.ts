import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { registerAccountWorkspaceRoutes } from './server/accountStore.ts';
import {
  runPharmacistAiAgent,
  type PharmacyWorkspaceSnapshot,
} from './server/pharmacistAiAgent.ts';
import {
  findMedicineInCatalogue,
  NORMALIZED_MEDICINE_CATALOGUE,
} from './src/lib/medicineDataset.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_DOC_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_BASE64_LENGTH = 14 * 1024 * 1024; // ~10MB decoded

const GEMINI_MODEL_FALLBACKS = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Please check Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseGeminiErrorDetails(err: unknown): { code: number; status: string; message: string } {
  const raw = err instanceof Error ? err.message : String(err || 'AI service error');
  const errObj = err as { status?: number; code?: number } | null;
  let code = typeof errObj?.status === 'number' ? errObj.status : typeof errObj?.code === 'number' ? errObj.code : 500;
  let status = '';
  let message = raw;

  try {
    const jsonStart = raw.indexOf('{');
    if (jsonStart !== -1) {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { code?: number; status?: string; message?: string };
      };
      if (parsed.error) {
        if (typeof parsed.error.code === 'number') code = parsed.error.code;
        if (typeof parsed.error.status === 'string') status = parsed.error.status;
        if (typeof parsed.error.message === 'string') message = parsed.error.message;
      }
    }
  } catch {
    // Keep raw message if not JSON
  }

  return { code, status, message };
}

function isRetryableGeminiError(err: unknown): boolean {
  const { code, status, message } = parseGeminiErrorDetails(err);
  if (code === 503 || code === 500 || code === 502 || code === 504 || code === 429) return true;
  if (status === 'UNAVAILABLE' || status === 'RESOURCE_EXHAUSTED' || status === 'INTERNAL') return true;
  return /high demand|overloaded|unavailable|temporarily|rate limit|503|429|timeout|fetch failed/i.test(message);
}

function formatGeminiErrorResponse(err: unknown, fallbackMessage: string): { httpStatus: number; error: string } {
  const { code, status, message } = parseGeminiErrorDetails(err);
  if (code === 503 || status === 'UNAVAILABLE' || /high demand|overloaded/i.test(message)) {
    return {
      httpStatus: 503,
      error: 'The AI service is temporarily busy due to high demand. Please wait a few seconds and try again.',
    };
  }
  if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
    return {
      httpStatus: 429,
      error: 'AI request rate limit reached. Please wait a moment and retry, or check your API quota in Settings > Secrets.',
    };
  }
  if (code === 403 || status === 'PERMISSION_DENIED') {
    return {
      httpStatus: 403,
      error: 'Gemini API access was denied. Please check your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (code === 400 && /API_KEY_INVALID|API key not valid/i.test(message)) {
    return {
      httpStatus: 400,
      error: 'Invalid Gemini API key. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  return {
    httpStatus: code >= 400 && code < 600 ? code : 500,
    error: message || fallbackMessage,
  };
}

async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
): Promise<{ response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>; modelUsed: string }> {
  let lastError: unknown;

  for (const model of GEMINI_MODEL_FALLBACKS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          ...params,
          model,
        });
        return { response, modelUsed: model };
      } catch (err) {
        lastError = err;
        const retryable = isRetryableGeminiError(err);
        if (!retryable) {
          throw err;
        }
        // Short exponential backoff before retry or failing over to next model
        const delayMs = attempt === 0 ? 700 : 1200;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

function sanitizeQueryTerm(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

interface ExpiryEvaluation {
  status: 'valid' | 'near_expiry' | 'expired' | 'ambiguous';
  daysRemaining: number | null;
  parsedIsoDate: string | null;
  summary: string;
}

function evaluateExpiryDate(rawDate: string | undefined, nearExpiryDays = 90): ExpiryEvaluation {
  if (!rawDate || !rawDate.trim()) {
    return {
      status: 'ambiguous',
      daysRemaining: null,
      parsedIsoDate: null,
      summary: 'Expiry date was not provided or could not be extracted. Confirm directly on the physical pack before use.',
    };
  }

  const trimmed = rawDate.trim();
  let parsed: Date | null = null;

  // Match YYYY-MM-DD
  const isoFull = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoFull) {
    parsed = new Date(Date.UTC(Number(isoFull[1]), Number(isoFull[2]) - 1, Number(isoFull[3])));
  }

  // Match YYYY-MM (end of month)
  if (!parsed) {
    const isoMonth = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
    if (isoMonth) {
      const y = Number(isoMonth[1]);
      const m = Number(isoMonth[2]);
      if (m >= 1 && m <= 12) {
        parsed = new Date(Date.UTC(y, m, 0));
      }
    }
  }

  // Match MM/YYYY or MM-YYYY or MM/YY
  if (!parsed) {
    const mmYyyy = trimmed.match(/^(\d{1,2})[-/](\d{2,4})$/);
    if (mmYyyy) {
      const m = Number(mmYyyy[1]);
      let y = Number(mmYyyy[2]);
      if (y < 100) y += 2000;
      if (m >= 1 && m <= 12) {
        parsed = new Date(Date.UTC(y, m, 0));
      }
    }
  }

  // Match Month Name YYYY (e.g., OCT 2026, Nov-2027)
  if (!parsed) {
    const months: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    };
    const named = trimmed.toLowerCase().match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s\-/]+(\d{2,4})$/);
    if (named) {
      const m = months[named[1]];
      let y = Number(named[2]);
      if (y < 100) y += 2000;
      parsed = new Date(Date.UTC(y, m, 0));
    }
  }

  if (!parsed || Number.isNaN(parsed.getTime())) {
    return {
      status: 'ambiguous',
      daysRemaining: null,
      parsedIsoDate: null,
      summary: `Expiry text "${trimmed}" could not be deterministically parsed. Human confirmation required.`,
    };
  }

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffMs = parsed.getTime() - todayUtc.getTime();
  const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const parsedIsoDate = parsed.toISOString().slice(0, 10);

  if (daysRemaining < 0) {
    return {
      status: 'expired',
      daysRemaining,
      parsedIsoDate,
      summary: `Expired ${Math.abs(daysRemaining)} day(s) ago (expiry date ${parsedIsoDate}). Do not consume or dispense.`,
    };
  }

  if (daysRemaining <= nearExpiryDays) {
    return {
      status: 'near_expiry',
      daysRemaining,
      parsedIsoDate,
      summary: `Approaching expiry in ${daysRemaining} day(s) (expiry date ${parsedIsoDate}). Review dispensing window.`,
    };
  }

  return {
    status: 'valid',
    daysRemaining,
    parsedIsoDate,
    summary: `Within shelf life: ${daysRemaining} day(s) remaining until ${parsedIsoDate}.`,
  };
}

async function fetchWithTimeout(url: string, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MediTrust-AI-Platform/1.0',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function queryOpenFdaLabel(nameQuery: string) {
  const clean = sanitizeQueryTerm(nameQuery);
  if (!clean) return { available: true, found: false, record: null as Record<string, unknown> | null };
  const encoded = encodeURIComponent(`openfda.brand_name:"${clean}" OR openfda.generic_name:"${clean}"`);
  const url = `https://api.fda.gov/drug/label.json?search=${encoded}&limit=2`;
  try {
    const res = await fetchWithTimeout(url, 6000);
    if (res.status === 404) {
      return { available: true, found: false, record: null };
    }
    if (!res.ok) {
      return { available: false, found: false, record: null, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
    if (json.results && json.results.length > 0) {
      return { available: true, found: true, record: json.results[0] };
    }
    return { available: true, found: false, record: null };
  } catch (err) {
    return {
      available: false,
      found: false,
      record: null,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

interface RecallItem {
  recallNumber: string;
  status: string;
  classification: string;
  productDescription: string;
  reasonForRecall: string;
  recallingFirm: string;
  codeInfo: string;
  reportDate: string;
}

async function queryOpenFdaRecalls(
  queryTerm: string,
  limit = 5
): Promise<{ available: boolean; recalls: RecallItem[]; error?: string }> {
  const clean = sanitizeQueryTerm(queryTerm);
  if (!clean) return { available: true, recalls: [] };
  const encoded = encodeURIComponent(
    `product_description:"${clean}" OR openfda.brand_name:"${clean}" OR openfda.generic_name:"${clean}" OR code_info:"${clean}"`
  );
  const url = `https://api.fda.gov/drug/enforcement.json?search=${encoded}&limit=${Math.min(Math.max(limit, 1), 15)}`;
  try {
    const res = await fetchWithTimeout(url, 6000);
    if (res.status === 404) {
      return { available: true, recalls: [] };
    }
    if (!res.ok) {
      return { available: false, recalls: [], error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const normalized: RecallItem[] = (json.results || []).map((item) => ({
      recallNumber: String(item.recall_number || 'N/A'),
      status: String(item.status || 'Unknown'),
      classification: String(item.classification || 'Unclassified'),
      productDescription: String(item.product_description || '').slice(0, 320),
      reasonForRecall: String(item.reason_for_recall || '').slice(0, 360),
      recallingFirm: String(item.recalling_firm || 'Unknown firm'),
      codeInfo: String(item.code_info || '').slice(0, 220),
      reportDate: String(item.report_date || ''),
    }));
    return { available: true, recalls: normalized };
  } catch (err) {
    return {
      available: false,
      recalls: [],
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  // 1. Health & Connector Readiness (supports ?probe=true for live Admin Console latency checks)
  app.get('/api/v1/health', async (req, res) => {
    const probe = req.query.probe === 'true';
    let openFdaLatencyMs: number | null = null;
    let openFdaLiveOk = true;

    if (probe) {
      const start = Date.now();
      try {
        const fdaRes = await fetchWithTimeout(
          'https://api.fda.gov/drug/enforcement.json?limit=1',
          4000
        );
        openFdaLatencyMs = Date.now() - start;
        openFdaLiveOk = fdaRes.ok;
      } catch {
        openFdaLatencyMs = Date.now() - start;
        openFdaLiveOk = false;
      }
    }

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      activeAiModels: GEMINI_MODEL_FALLBACKS,
      catalogueSize: NORMALIZED_MEDICINE_CATALOGUE.length,
      openFdaLatencyMs,
      connectors: {
        geminiVisionOcr: Boolean(process.env.GEMINI_API_KEY),
        openFdaDrugLabel: openFdaLiveOk,
        openFdaRecallFeed: openFdaLiveOk,
        normalizedMedicineCatalogue: true,
        qrBarcodeGs1Decoder: true,
        videoFrameInspection: Boolean(process.env.GEMINI_API_KEY),
        pharmacistAiFunctionCalling: Boolean(process.env.GEMINI_API_KEY),
        manufacturerSerializationApi: false,
        cdscoLiveApi: false,
      },
    });
  });

  // 1b. Normalized Medicine Reference Catalogue Search
  app.get('/api/v1/catalogue', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const items = q
      ? NORMALIZED_MEDICINE_CATALOGUE.filter(
          (m) =>
            m.brandName.toLowerCase().includes(q) ||
            m.genericName.toLowerCase().includes(q) ||
            m.manufacturer.toLowerCase().includes(q) ||
            m.therapeuticClass.toLowerCase().includes(q) ||
            m.aliases.some((a) => a.toLowerCase().includes(q))
        )
      : NORMALIZED_MEDICINE_CATALOGUE;
    res.json({
      count: items.length,
      totalCatalogue: NORMALIZED_MEDICINE_CATALOGUE.length,
      items,
    });
  });

  // 2. AI Medicine Pack OCR & Structured Field Extraction
  app.post('/api/v1/scans/extract', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };

      if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.length > MAX_BASE64_LENGTH) {
        res.status(400).json({ error: 'Valid base64 image payload (under 10MB) is required.' });
        return;
      }
      if (!mimeType || !ALLOWED_IMAGE_MIMES.has(mimeType)) {
        res.status(400).json({ error: 'Unsupported image type. Use JPEG, PNG, or WebP.' });
        return;
      }

      const ai = getGeminiClient();
      const { response, modelUsed } = await generateContentWithFallback(ai, {
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            {
              text: [
                'Inspect this medicine carton, blister strip, bottle, or pharmaceutical label carefully.',
                'Extract ONLY what is visibly printed on the packaging. Do NOT guess or fabricate missing fields; return empty string "" when unreadable or absent.',
                'Never declare the medicine genuine or counterfeit based on image appearance alone.',
                'Provide honest per-field extraction confidence (high, medium, or low) and note any visual quality issues (blur, glare, cropped text, unreadable batch/expiry).',
              ].join(' '),
            },
          ],
        },
        config: {
          systemInstruction:
            'You are a precision pharmaceutical OCR and packaging inspection extractor for MediTrust AI. Extract visible label text accurately without hallucinating fields. Never assert authenticity from an image.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              medicineName: { type: Type.STRING, description: 'Printed brand or product name.' },
              genericName: { type: Type.STRING, description: 'Active ingredient / salt / generic composition.' },
              strength: { type: Type.STRING, description: 'Dosage strength e.g. 500 mg, 650 mg, 10 mg/5 mL.' },
              dosageForm: { type: Type.STRING, description: 'Tablet, capsule, syrup, injection, ointment, etc.' },
              manufacturer: { type: Type.STRING, description: 'Printed manufacturer or marketer name.' },
              batchNumber: { type: Type.STRING, description: 'Printed batch or lot number.' },
              mfgDate: { type: Type.STRING, description: 'Printed manufacturing date.' },
              expiryDate: { type: Type.STRING, description: 'Printed expiry date (prefer YYYY-MM or MM/YYYY).' },
              licenseInfo: { type: Type.STRING, description: 'Mfg license number, NDC, or regulatory code.' },
              identifiers: { type: Type.STRING, description: 'Visible barcode digits, GTIN, serial, or QR text.' },
              visualObservations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Objective observations about print clarity, glare, occlusion, or missing text.',
              },
              confidence: {
                type: Type.OBJECT,
                properties: {
                  medicineName: { type: Type.STRING, description: 'high, medium, or low' },
                  batchNumber: { type: Type.STRING, description: 'high, medium, or low' },
                  expiryDate: { type: Type.STRING, description: 'high, medium, or low' },
                  manufacturer: { type: Type.STRING, description: 'high, medium, or low' },
                  overall: { type: Type.STRING, description: 'high, medium, or low' },
                },
                required: ['medicineName', 'batchNumber', 'expiryDate', 'manufacturer', 'overall'],
              },
            },
            required: [
              'medicineName',
              'genericName',
              'strength',
              'dosageForm',
              'manufacturer',
              'batchNumber',
              'mfgDate',
              'expiryDate',
              'licenseInfo',
              'identifiers',
              'visualObservations',
              'confidence',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        extractedAt: new Date().toISOString(),
        extractionModel: modelUsed,
        fields: parsed,
      });
    } catch (err) {
      const formatted = formatGeminiErrorResponse(err, 'Failed to extract medicine fields.');
      res.status(formatted.httpStatus).json({ error: formatted.error });
    }
  });

  // 3. Deterministic + Live openFDA + Registry Evidence Verification Engine
  app.post('/api/v1/verifications', async (req, res) => {
    try {
      const {
        medicineName = '',
        genericName = '',
        strength = '',
        manufacturer = '',
        batchNumber = '',
        expiryDate = '',
        nearExpiryDays = 90,
        pharmacyBatches = [],
      } = req.body as {
        medicineName?: string;
        genericName?: string;
        strength?: string;
        manufacturer?: string;
        batchNumber?: string;
        expiryDate?: string;
        nearExpiryDays?: number;
        pharmacyBatches?: Array<{
          batchNumber: string;
          medicineName: string;
          manufacturer: string;
          expiryDate: string;
          supplierName: string;
          recallFlagged?: boolean;
        }>;
      };

      if (!medicineName.trim() && !genericName.trim()) {
        res.status(400).json({ error: 'Medicine name or generic composition is required for verification.' });
        return;
      }

      const checkedAt = new Date().toISOString();
      const expiryEval = evaluateExpiryDate(expiryDate, Number(nearExpiryDays) || 90);

      // Query openFDA Drug Label & Recall Enforcement concurrently
      const primaryQuery = medicineName.trim() || genericName.trim();
      const [labelPrimary, recallPrimary] = await Promise.all([
        queryOpenFdaLabel(primaryQuery),
        queryOpenFdaRecalls(primaryQuery, 5),
      ]);

      let labelResult = labelPrimary;
      if (labelResult.available && !labelResult.found && genericName.trim() && genericName.trim() !== primaryQuery) {
        const genericFirstTerm = genericName.split(/[,/+]/)[0].trim();
        if (genericFirstTerm) {
          labelResult = await queryOpenFdaLabel(genericFirstTerm);
        }
      }

      // Check local authorized pharmacy batches if provided
      const normalizedBatch = batchNumber.trim().toLowerCase();
      const matchedRegistryBatch = normalizedBatch
        ? pharmacyBatches.find((b) => b.batchNumber.trim().toLowerCase() === normalizedBatch)
        : undefined;

      let registryMismatchReason = '';
      if (matchedRegistryBatch) {
        const batchExp = evaluateExpiryDate(matchedRegistryBatch.expiryDate);
        if (
          expiryEval.parsedIsoDate &&
          batchExp.parsedIsoDate &&
          expiryEval.parsedIsoDate !== batchExp.parsedIsoDate
        ) {
          registryMismatchReason = `Expiry date conflict: scanned pack shows ${expiryEval.parsedIsoDate}, whereas authorized pharmacy batch record ${matchedRegistryBatch.batchNumber} records ${batchExp.parsedIsoDate}.`;
        } else if (
          manufacturer.trim() &&
          matchedRegistryBatch.manufacturer.trim() &&
          !matchedRegistryBatch.manufacturer.toLowerCase().includes(manufacturer.trim().toLowerCase().slice(0, 6)) &&
          !manufacturer.toLowerCase().includes(matchedRegistryBatch.manufacturer.trim().toLowerCase().slice(0, 6))
        ) {
          registryMismatchReason = `Manufacturer conflict: scanned pack states "${manufacturer}", whereas pharmacy batch ledger lists "${matchedRegistryBatch.manufacturer}".`;
        } else if (matchedRegistryBatch.recallFlagged) {
          registryMismatchReason = `Batch ${matchedRegistryBatch.batchNumber} is flagged as recalled/quarantined in the authorized pharmacy ledger.`;
        }
      }

      // Check if any openFDA recall explicitly matches the batch/lot code
      const batchRecallHit = normalizedBatch
        ? recallPrimary.recalls.find((r) => String(r.codeInfo || '').toLowerCase().includes(normalizedBatch))
        : undefined;

      // Match against curated Normalized Indian (CDSCO/IP) & Global Reference Catalogue
      const catalogueMatch = findMedicineInCatalogue(medicineName, genericName);

      // Determine explicit non-binary status strictly following MediTrust AI principles
      let verificationStatus:
        | 'verified_match'
        | 'mismatch_suspicious'
        | 'needs_review'
        | 'not_found'
        | 'provider_unavailable' = 'not_found';

      const evidenceNotes: string[] = [];
      const safetyNotes: string[] = [];
      let sourceName = 'openFDA Drug Label & Recall Enforcement API';

      if (matchedRegistryBatch) {
        sourceName = 'Authorized Pharmacy Batch Ledger + openFDA API';
      } else if (catalogueMatch) {
        sourceName = 'MediTrust Normalized Medicine Catalogue (CDSCO/IP) + openFDA API';
      }

      if (expiryEval.status === 'expired') {
        safetyNotes.push(`EXPIRED: ${expiryEval.summary}`);
      } else if (expiryEval.status === 'near_expiry') {
        safetyNotes.push(`NEAR EXPIRY: ${expiryEval.summary}`);
      } else if (expiryEval.status === 'ambiguous') {
        safetyNotes.push(`EXPIRY UNVERIFIED: ${expiryEval.summary}`);
      }

      if (batchRecallHit) {
        safetyNotes.push(
          `RECALL MATCH (${batchRecallHit.recallNumber} · ${batchRecallHit.classification}): ${batchRecallHit.reasonForRecall}`
        );
      } else if (recallPrimary.recalls.length > 0) {
        safetyNotes.push(
          `${recallPrimary.recalls.length} FDA enforcement/recall notice(s) exist for related product names (e.g., ${recallPrimary.recalls[0].recallNumber}: ${recallPrimary.recalls[0].reasonForRecall.slice(0, 140)}). Verify lot numbers carefully.`
        );
      } else if (recallPrimary.available) {
        safetyNotes.push('No matching FDA recall enforcement notices found for this query at check time.');
      } else {
        safetyNotes.push('FDA recall feed was temporarily unavailable during this check.');
      }

      if (catalogueMatch) {
        safetyNotes.push(`Catalogue Guidance (${catalogueMatch.scheduleClass}): ${catalogueMatch.safetyHighlights}`);
      }

      let fdaSummary: Record<string, string> | null = null;
      if (labelResult.found && labelResult.record) {
        const openfda = (labelResult.record.openfda || {}) as Record<string, string[]>;
        const brand = openfda.brand_name?.[0] || primaryQuery;
        const generic = openfda.generic_name?.[0] || genericName || 'Not listed';
        const mfg = openfda.manufacturer_name?.[0] || 'Not listed in openFDA';
        const route = openfda.route?.[0] || 'Not listed';
        const warningsArr = (labelResult.record.warnings ||
          labelResult.record.boxed_warning ||
          labelResult.record.indications_and_usage ||
          []) as string[];
        fdaSummary = {
          brandName: brand,
          genericName: generic,
          manufacturerName: mfg,
          route,
          effectiveTime: String(labelResult.record.effective_time || 'Unknown'),
          labelExcerpt: (warningsArr[0] || '').slice(0, 360),
        };
        evidenceNotes.push(
          `openFDA Drug Label match: ${brand} (${generic}), listed manufacturer: ${mfg}, label effective date: ${fdaSummary.effectiveTime}.`
        );
      } else if (catalogueMatch) {
        fdaSummary = {
          brandName: catalogueMatch.brandName,
          genericName: catalogueMatch.genericName,
          manufacturerName: catalogueMatch.manufacturer,
          route: `${catalogueMatch.dosageForm} · ${catalogueMatch.packSize}`,
          effectiveTime: catalogueMatch.region,
          labelExcerpt: `${catalogueMatch.therapeuticClass}. ${catalogueMatch.storageCondition} ${catalogueMatch.safetyHighlights}`,
        };
        evidenceNotes.push(
          `Normalized Reference Catalogue match (${catalogueMatch.productId}): ${catalogueMatch.brandName} (${catalogueMatch.genericName}, ${catalogueMatch.strength}), reference manufacturer: ${catalogueMatch.manufacturer} (${catalogueMatch.region}).`
        );
      }

      if (registryMismatchReason || batchRecallHit) {
        verificationStatus = 'mismatch_suspicious';
        if (registryMismatchReason) evidenceNotes.push(registryMismatchReason);
        if (batchRecallHit) {
          evidenceNotes.push(`Lot/batch "${batchNumber}" appeared in openFDA Recall ${batchRecallHit.recallNumber}.`);
        }
      } else if (matchedRegistryBatch && !registryMismatchReason) {
        verificationStatus = 'verified_match';
        evidenceNotes.push(
          `Exact batch match confirmed in Authorized Pharmacy Batch Ledger (Batch ${matchedRegistryBatch.batchNumber}, Supplier: ${matchedRegistryBatch.supplierName}, Expiry: ${matchedRegistryBatch.expiryDate}).`
        );
      } else if (!labelResult.available && !recallPrimary.available && !catalogueMatch) {
        verificationStatus = 'provider_unavailable';
        evidenceNotes.push('External openFDA verification endpoints did not respond within timeout. No result was invented.');
      } else if (labelResult.found || catalogueMatch) {
        verificationStatus = 'needs_review';
        evidenceNotes.push(
          'Product metadata matched reference records, but pack-level batch serialization could not be confirmed because no direct manufacturer serialization API is connected for this batch.'
        );
      } else {
        verificationStatus = 'not_found';
        evidenceNotes.push(
          `No matching drug label was returned by openFDA or the normalized reference catalogue for "${primaryQuery}".`
        );
      }

      if (expiryEval.status === 'ambiguous' && verificationStatus === 'verified_match') {
        verificationStatus = 'needs_review';
      }

      const limitations =
        'openFDA covers US-registered drug labels and FDA enforcement notices; it is not a global pack-level anti-counterfeit registry. Individual pack serialization requires an authorized manufacturer or regulator API connector.';

      let nextStep = 'Confirm pack details with a licensed pharmacist before use.';
      if (verificationStatus === 'mismatch_suspicious' || expiryEval.status === 'expired') {
        nextStep =
          'Do not consume or dispense this pack. Quarantine the product, retain the invoice and packaging, and escalate to your pharmacist, manufacturer quality desk, or drug control authority.';
      } else if (verificationStatus === 'verified_match' && expiryEval.status === 'valid') {
        nextStep =
          'Batch matched internal pharmacy receipt records and shelf life is valid. Inspect physical tamper seal and follow prescriber instructions.';
      } else if (verificationStatus === 'needs_review') {
        nextStep =
          'Reference product information was found, but pack-level batch authenticity requires pharmacist review or manufacturer verification.';
      } else if (verificationStatus === 'provider_unavailable') {
        nextStep =
          'Retry verification when connectivity resumes, or ask a licensed pharmacist to cross-check supplier invoice and batch records.';
      }

      res.json({
        checkedAt,
        verificationStatus,
        expiryStatus: expiryEval.status,
        expiryDetails: expiryEval,
        sourceName,
        sourceEvidence: evidenceNotes.join(' '),
        safetyNotices: safetyNotes.join(' | '),
        recalls: recallPrimary.recalls,
        fdaLabelSummary: fdaSummary,
        limitations,
        nextStep,
        checkedInputs: {
          medicineName,
          genericName,
          strength,
          manufacturer,
          batchNumber,
          expiryDate,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification check failed.';
      res.status(500).json({ error: message });
    }
  });

  // 4. Live openFDA Drug Recall Feed Search
  app.get('/api/v1/recalls', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    try {
      if (!q) {
        const resFda = await fetchWithTimeout(
          'https://api.fda.gov/drug/enforcement.json?sort=report_date:desc&limit=8',
          6000
        );
        if (!resFda.ok) {
          res.status(502).json({ available: false, recalls: [], error: `openFDA returned HTTP ${resFda.status}` });
          return;
        }
        const json = (await resFda.json()) as { results?: Array<Record<string, unknown>> };
        const recalls = (json.results || []).map((item) => ({
          recallNumber: String(item.recall_number || 'N/A'),
          status: String(item.status || 'Unknown'),
          classification: String(item.classification || 'Unclassified'),
          productDescription: String(item.product_description || '').slice(0, 320),
          reasonForRecall: String(item.reason_for_recall || '').slice(0, 360),
          recallingFirm: String(item.recalling_firm || 'Unknown firm'),
          codeInfo: String(item.code_info || '').slice(0, 220),
          reportDate: String(item.report_date || ''),
        }));
        res.json({ available: true, source: 'openFDA Drug Enforcement API', fetchedAt: new Date().toISOString(), recalls });
        return;
      }

      const result = await queryOpenFdaRecalls(q, 10);
      res.json({
        available: result.available,
        source: 'openFDA Drug Enforcement API',
        fetchedAt: new Date().toISOString(),
        recalls: result.recalls,
        error: result.error,
      });
    } catch (err) {
      res.status(502).json({
        available: false,
        recalls: [],
        error: err instanceof Error ? err.message : 'Unable to reach openFDA recall service.',
      });
    }
  });

  // 5. Secure Document Verification & Prescription/Invoice Extraction
  app.post('/api/v1/documents/verify', async (req, res) => {
    try {
      const { fileBase64, mimeType, fileName, documentType, sha256Hash } = req.body as {
        fileBase64?: string;
        mimeType?: string;
        fileName?: string;
        documentType?: string;
        sha256Hash?: string;
      };

      if (!fileBase64 || typeof fileBase64 !== 'string' || fileBase64.length > MAX_BASE64_LENGTH) {
        res.status(400).json({ error: 'Valid base64 document payload (under 10MB) is required.' });
        return;
      }
      if (!mimeType || !ALLOWED_DOC_MIMES.has(mimeType)) {
        res.status(400).json({ error: 'Unsupported file format. Upload PDF, JPEG, PNG, or WebP.' });
        return;
      }

      const ai = getGeminiClient();
      const { response, modelUsed } = await generateContentWithFallback(ai, {
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: fileBase64,
              },
            },
            {
              text: `Analyze this uploaded healthcare or pharmacy document (expected type: ${documentType || 'auto-detect'}, file: ${fileName || 'upload'}). Extract issuer, dates, mentioned medicines/batches/invoice numbers, and inspect for completeness or anomalies (e.g., missing prescriber/issuer signature, missing license/GST/batch references, illegible dates, conflicting totals). Never declare cryptographic or legal authenticity from visual inspection alone; flag what requires human/source confirmation.`,
            },
          ],
        },
        config: {
          systemInstruction:
            'You are the Secure Document Verification parser for MediTrust AI. Return accurate structured extraction from uploaded prescriptions, pharmacy invoices, product leaflets, lab reports, or Certificates of Analysis. Never fabricate missing numbers or claim legal authenticity without authoritative issuer verification.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              documentTitle: { type: Type.STRING, description: 'Concise descriptive title for the document.' },
              detectedType: {
                type: Type.STRING,
                description: 'One of: prescription, invoice, leaflet, coa, lab_report, other',
              },
              issuerName: { type: Type.STRING, description: 'Doctor, clinic, hospital, supplier, or manufacturer name.' },
              documentDate: { type: Type.STRING, description: 'Printed date on document if legible.' },
              extractedSummary: { type: Type.STRING, description: 'Concise plain-language summary of visible document contents.' },
              extractedEntities: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Key medicines, batch numbers, invoice IDs, or license numbers extracted (max 15).',
              },
              prescribedMedicines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    medicineName: { type: Type.STRING },
                    dosage: { type: Type.STRING },
                    frequency: { type: Type.STRING },
                  },
                  required: ['medicineName', 'dosage', 'frequency'],
                },
                description: 'Structured medicines list if this document is a prescription.',
              },
              anomalies: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Missing fields, inconsistencies, illegible areas, or potential tampering indicators.',
              },
              confidenceLevel: { type: Type.STRING, description: 'high, medium, or low' },
            },
            required: [
              'documentTitle',
              'detectedType',
              'issuerName',
              'documentDate',
              'extractedSummary',
              'extractedEntities',
              'prescribedMedicines',
              'anomalies',
              'confidenceLevel',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        documentTitle: string;
        detectedType: string;
        issuerName: string;
        documentDate: string;
        extractedSummary: string;
        extractedEntities: string[];
        prescribedMedicines: Array<{ medicineName: string; dosage: string; frequency: string }>;
        anomalies: string[];
        confidenceLevel: 'high' | 'medium' | 'low';
      };

      const anomalies = Array.isArray(parsed.anomalies) ? parsed.anomalies.filter(Boolean).slice(0, 15) : [];
      const extractedEntities = Array.isArray(parsed.extractedEntities)
        ? parsed.extractedEntities.filter(Boolean).slice(0, 20)
        : [];

      // Deterministic status assignment — never auto-certify genuine from image alone
      let verificationStatus: 'needs_review' | 'mismatch_suspicious' | 'not_found' = 'needs_review';
      if (anomalies.length >= 2 || anomalies.some((a) => /tamper|alter|mismatch|forged|conflict/i.test(a))) {
        verificationStatus = 'mismatch_suspicious';
      } else if (!parsed.issuerName && extractedEntities.length === 0) {
        verificationStatus = 'not_found';
      }

      res.json({
        verifiedAt: new Date().toISOString(),
        verificationModel: modelUsed,
        sha256Hash: sha256Hash || '',
        verificationStatus,
        ...parsed,
        anomalies,
        extractedEntities,
        limitations:
          'AI document extraction checks visible structure, completeness, and SHA-256 file integrity. Legal/issuer authenticity requires confirmation against the issuing clinic, supplier, or regulator.',
      });
    } catch (err) {
      const formatted = formatGeminiErrorResponse(err, 'Document verification failed.');
      res.status(formatted.httpStatus).json({ error: formatted.error });
    }
  });

  // 6. Multilingual Multimodal Grounded AI Assistant (English / Hindi / Hinglish)
  app.post('/api/v1/chat', async (req, res) => {
    try {
      const {
        message,
        language = 'en',
        portalRole = 'patient',
        groundingContext = '',
        history = [],
        attachmentBase64,
        attachmentMimeType,
        videoFrames = [],
      } = req.body as {
        message?: string;
        language?: 'en' | 'hi' | 'hinglish';
        portalRole?: 'patient' | 'pharmacist';
        groundingContext?: string;
        history?: Array<{ sender: 'user' | 'assistant'; content: string }>;
        attachmentBase64?: string;
        attachmentMimeType?: string;
        videoFrames?: Array<{ timestamp: string; base64: string; mimeType: string }>;
      };

      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Message text is required.' });
        return;
      }

      const languageRule =
        language === 'hi'
          ? 'Respond in clear, natural Hindi (Devanagari script). Keep medicine brand names, batch numbers, and official status labels legible.'
          : language === 'hinglish'
            ? 'Respond in clear, everyday Hinglish (Hindi written in Roman script mixed naturally with clear English medical terms).'
            : 'Respond in clear, plain English.';

      const roleRule =
        portalRole === 'pharmacist'
          ? 'The user is an authorized pharmacist. Focus on batch verification evidence, expiry management, recall handling, supplier documentation, and escalation workflows.'
          : 'The user is a patient or caregiver. Explain medicine label fields, expiry details, verification status meanings, and safe next steps clearly without jargon.';

      const videoRule =
        Array.isArray(videoFrames) && videoFrames.length > 0
          ? '6. VIDEO FRAME INSPECTION: You are receiving key frames sampled at explicit timestamps from an uploaded video. Report timestamped observations (e.g., [00:00], [00:04]) ONLY for what is visible in each frame; NEVER infer unseen events between sampled frames.'
          : '';

      const systemInstruction = [
        'You are the MediTrust AI Grounded Medicine Safety Assistant.',
        languageRule,
        roleRule,
        'NON-NEGOTIABLE SAFETY & EVIDENCE RULES:',
        '1. Never declare a medicine genuine or authentic based solely on an image, video, QR code, or user description.',
        '2. Never override a deterministic verification status (verified_match, mismatch_suspicious, needs_review, not_found, provider_unavailable).',
        '3. Clearly separate: (a) Verified / Extracted Facts from the provided record or upload, (b) General Educational Information, and (c) Limitations & Safe Next Steps.',
        '4. Never diagnose medical conditions, prescribe medicines, or recommend starting, stopping, or changing prescription dosages. Refer personal treatment decisions to a licensed doctor or pharmacist.',
        '5. If the user asks about a suspected counterfeit, expired medicine, or adverse event, advise stopping use, retaining packaging/invoice, and consulting a licensed pharmacist/clinician or reporting to official drug safety authorities.',
        videoRule,
        groundingContext ? `\nAUTHORIZED GROUNDING CONTEXT:\n${groundingContext.slice(0, 4000)}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (attachmentBase64 && attachmentMimeType) {
        if (!ALLOWED_DOC_MIMES.has(attachmentMimeType) || attachmentBase64.length > MAX_BASE64_LENGTH) {
          res.status(400).json({ error: 'Unsupported or oversized attachment (max 10MB; JPEG, PNG, WebP, or PDF).' });
          return;
        }
        parts.push({
          inlineData: {
            mimeType: attachmentMimeType,
            data: attachmentBase64,
          },
        });
      }

      if (Array.isArray(videoFrames) && videoFrames.length > 0) {
        const boundedFrames = videoFrames.slice(0, 6);
        for (const frame of boundedFrames) {
          if (
            frame &&
            typeof frame.base64 === 'string' &&
            ALLOWED_IMAGE_MIMES.has(frame.mimeType) &&
            frame.base64.length <= 4 * 1024 * 1024
          ) {
            parts.push({ text: `Sampled video frame at timestamp [${frame.timestamp || '00:00'}]:` });
            parts.push({
              inlineData: {
                mimeType: frame.mimeType,
                data: frame.base64,
              },
            });
          }
        }
      }

      const recentHistory = history
        .slice(-6)
        .map((h) => `${h.sender === 'user' ? 'User' : 'Assistant'}: ${h.content.slice(0, 600)}`)
        .join('\n');

      parts.push({
        text: recentHistory
          ? `Conversation so far:\n${recentHistory}\n\nCurrent user question: ${message.trim()}`
          : message.trim(),
      });

      const ai = getGeminiClient();
      const { response, modelUsed } = await generateContentWithFallback(ai, {
        contents: { parts },
        config: {
          systemInstruction,
        },
      });

      res.json({
        reply: response.text ?? 'Unable to generate a response at this time.',
        model: modelUsed,
        respondedAt: new Date().toISOString(),
      });
    } catch (err) {
      const formatted = formatGeminiErrorResponse(err, 'AI assistant request failed.');
      res.status(formatted.httpStatus).json({ error: formatted.error });
    }
  });

  // 7. Pharmacist AI Operations Agent (Real Gemini Function Calling for Inventory, Alerts, Custody & POs)
  app.post('/api/v1/pharmacist/ai-agent', async (req, res) => {
    try {
      const {
        message,
        language = 'en',
        history = [],
        snapshot,
      } = req.body as {
        message?: string;
        language?: 'en' | 'hi' | 'hinglish';
        history?: Array<{ sender: 'user' | 'assistant'; content: string }>;
        snapshot?: PharmacyWorkspaceSnapshot;
      };

      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Pharmacist command or question is required.' });
        return;
      }

      const safeSnapshot: PharmacyWorkspaceSnapshot = {
        pharmacyName: snapshot?.pharmacyName || 'Authorized Pharmacy',
        licenseNumber: snapshot?.licenseNumber || '',
        city: snapshot?.city || '',
        nearExpiryDays: typeof snapshot?.nearExpiryDays === 'number' ? snapshot.nearExpiryDays : 90,
        batches: Array.isArray(snapshot?.batches) ? snapshot.batches.slice(0, 80) : [],
        openAlerts: Array.isArray(snapshot?.openAlerts) ? snapshot.openAlerts.slice(0, 40) : [],
        pendingReviewScansCount: Number(snapshot?.pendingReviewScansCount) || 0,
      };

      const ai = getGeminiClient();
      const result = await runPharmacistAiAgent({
        ai,
        generateWithFallback: generateContentWithFallback,
        message: message.trim(),
        language,
        history: Array.isArray(history) ? history : [],
        snapshot: safeSnapshot,
      });

      res.json({
        reply: result.reply,
        proposedActions: result.proposedActions,
        purchaseOrder: result.purchaseOrder,
        riskAudit: result.riskAudit,
        model: result.modelUsed,
        respondedAt: new Date().toISOString(),
      });
    } catch (err) {
      const formatted = formatGeminiErrorResponse(err, 'Pharmacist AI operations request failed.');
      res.status(formatted.httpStatus).json({ error: formatted.error });
    }
  });

  // 8. Predictive Inventory Procurement Brief (Grounded in Deterministic Forecast Numbers)
  app.post('/api/v1/pharmacist/predictive-insights', async (req, res) => {
    try {
      const {
        language = 'en',
        pharmacyName = 'Authorized Pharmacy',
        horizonDays = 30,
        leadTimeDays = 5,
        forecasts = [],
        missingEssentials = [],
      } = req.body as {
        language?: 'en' | 'hi' | 'hinglish';
        pharmacyName?: string;
        horizonDays?: number;
        leadTimeDays?: number;
        forecasts?: Array<{
          medicineName: string;
          usableStock: number;
          dailyBurnRate: number;
          velocitySource: string;
          daysUntilStockout: number | null;
          riskLevel: string;
          recommendedOrderQty: number;
          estimatedOrderCostInr: number;
          restockReason: string;
        }>;
        missingEssentials?: Array<{ brandName: string; therapeuticClass: string; suggestedInitialQty: number }>;
      };

      const languageRule =
        language === 'hi'
          ? 'Respond in crisp, natural Hindi (Devanagari script) keeping medicine names, quantities, and INR figures clear.'
          : language === 'hinglish'
            ? 'Respond in clear Hinglish (Hindi in Roman script mixed with pharmacy terms).'
            : 'Respond in crisp, executive clinical pharmacy English.';

      const forecastLines = forecasts
        .slice(0, 20)
        .map(
          (f) =>
            `- ${f.medicineName}: usable=${f.usableStock}, burn=${f.dailyBurnRate}/day (${f.velocitySource}), stockoutIn=${f.daysUntilStockout ?? 'N/A'}d, risk=${f.riskLevel}, orderQty=${f.recommendedOrderQty}, estCost=INR ${f.estimatedOrderCostInr}, reason=${f.restockReason}`
        )
        .join('\n');

      const missingLines = missingEssentials
        .slice(0, 8)
        .map((m) => `- ${m.brandName} (${m.therapeuticClass}) — suggest initial ${m.suggestedInitialQty} units`)
        .join('\n');

      const ai = getGeminiClient();
      const { response, modelUsed } = await generateContentWithFallback(ai, {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Pharmacy: ${pharmacyName}\nForecast Horizon: ${horizonDays} days | Supplier Lead Time: ${leadTimeDays} days\n\nCOMPUTED INVENTORY FORECASTS:\n${forecastLines || '(No batches stocked yet)'}\n\nMISSING COMMON ESSENTIAL MEDICATIONS:\n${missingLines || '(All tracked essentials stocked)'}\n\nProvide a concise 3-4 bullet operational restocking brief: (1) Immediate Priority Restocks, (2) Expiry-to-Replenishment Overlap Warnings, (3) Budget & Supplier Ordering Tip. Never invent numbers outside the data provided.`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: `You are the Predictive Supply Chain Analyst for MediTrust AI. ${languageRule} Base every number strictly on the deterministic forecast table provided. Keep the brief under 140 words and formatted as clean bullet points.`,
        },
      });

      res.json({
        brief: (response.text || '').trim(),
        model: modelUsed,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      const formatted = formatGeminiErrorResponse(err, 'Unable to generate AI procurement brief.');
      res.status(formatted.httpStatus).json({ error: formatted.error });
    }
  });

  // Mount server-backed Email/Password authentication and per-account persistent workspace routes
  registerAccountWorkspaceRoutes(app);

  // Mount Vite middleware in development or serve static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  const mountStaticDist = () => {
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  };

  if (isProd) {
    mountStaticDist();
  } else {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn('Vite dev middleware unavailable, falling back to static dist:', viteErr);
      mountStaticDist();
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MediTrust AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MediTrust AI server:', err);
  process.exit(1);
});
