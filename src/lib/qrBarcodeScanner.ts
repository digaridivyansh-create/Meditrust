import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export interface DecodedBarcodeResult {
  rawText: string;
  format: string;
  isUrl: boolean;
  urlAudit?: {
    url: string;
    host: string;
    riskLevel: 'safe_https' | 'caution_unverified' | 'suspicious';
    notes: string[];
  };
  gs1?: {
    gtin?: string;
    batchNumber?: string;
    expiryDate?: string;
    serialNumber?: string;
  };
  authenticityDisclaimer: string;
}

export interface ImageQualityReport {
  width: number;
  height: number;
  sharpnessScore: number;
  brightnessScore: number;
  rating: 'good' | 'fair' | 'poor';
  warnings: string[];
}

const SUSPICIOUS_SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'cutt.ly',
  'rb.gy',
  'shorturl.at',
]);

function inspectDecodedUrl(raw: string): DecodedBarcodeResult['urlAudit'] | undefined {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return undefined;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const notes: string[] = [];
    let riskLevel: 'safe_https' | 'caution_unverified' | 'suspicious' = 'caution_unverified';

    if (parsed.protocol !== 'https:') {
      riskLevel = 'suspicious';
      notes.push('Uses unencrypted HTTP instead of HTTPS.');
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      riskLevel = 'suspicious';
      notes.push('Points directly to a raw IP address instead of a verified manufacturer domain.');
    }
    if (SUSPICIOUS_SHORTENERS.has(host)) {
      riskLevel = 'suspicious';
      notes.push('Uses a generic URL shortener that obscures the true destination.');
    }
    if (host.split('.').length > 4 || host.includes('--')) {
      riskLevel = 'suspicious';
      notes.push('Unusual domain structure detected; verify carefully before opening.');
    }

    if (notes.length === 0) {
      riskLevel = 'safe_https';
      notes.push(
        `HTTPS link to "${host}". Verify that this domain officially belongs to the printed manufacturer—QR URLs can be cloned on counterfeit cartons.`
      );
    }

    return {
      url: parsed.toString(),
      host,
      riskLevel,
      notes,
    };
  } catch {
    return {
      url: trimmed,
      host: 'invalid-url',
      riskLevel: 'suspicious',
      notes: ['Malformed URL payload in QR code.'],
    };
  }
}

/**
 * Parses common GS1-128 / GS1 DataMatrix / GS1 Digital Link fields:
 *  - (01) GTIN (14 digits)
 *  - (17) Expiry Date (YYMMDD -> YYYY-MM-DD)
 *  - (10) Batch / Lot Number
 *  - (21) Serial Number
 */
export function parseGs1Identifiers(raw: string): DecodedBarcodeResult['gs1'] | undefined {
  const clean = raw.replace(/\u001d/g, '|').trim();
  const out: NonNullable<DecodedBarcodeResult['gs1']> = {};

  // 1. GS1 Digital Link URL style: /01/<gtin>/10/<lot>/21/<serial>?17=<yymmdd>
  const dlGtin = clean.match(/\/01\/(\d{8,14})/);
  if (dlGtin) out.gtin = dlGtin[1];
  const dlLot = clean.match(/\/10\/([^/?&|#]+)/);
  if (dlLot) out.batchNumber = decodeURIComponent(dlLot[1]);
  const dlSer = clean.match(/\/21\/([^/?&|#]+)/);
  if (dlSer) out.serialNumber = decodeURIComponent(dlSer[1]);
  const dlExp = clean.match(/[?&]17=(\d{6})/);
  if (dlExp) {
    const yy = Number(dlExp[1].slice(0, 2));
    const mm = dlExp[1].slice(2, 4);
    const dd = dlExp[1].slice(4, 6);
    out.expiryDate = `20${String(yy).padStart(2, '0')}-${mm}-${dd === '00' ? '28' : dd}`;
  }

  // 2. Human-readable bracketed GS1 style: (01)...(17)...(10)...(21)...
  const pGtin = clean.match(/\(01\)(\d{8,14})/);
  if (pGtin && !out.gtin) out.gtin = pGtin[1];
  const pExp = clean.match(/\(17\)(\d{6})/);
  if (pExp && !out.expiryDate) {
    const yy = pExp[1].slice(0, 2);
    const mm = pExp[1].slice(2, 4);
    const dd = pExp[1].slice(4, 6);
    out.expiryDate = `20${yy}-${mm}-${dd === '00' ? '28' : dd}`;
  }
  const pLot = clean.match(/\(10\)([^(\s|]+)/);
  if (pLot && !out.batchNumber) out.batchNumber = pLot[1];
  const pSer = clean.match(/\(21\)([^(\s|]+)/);
  if (pSer && !out.serialNumber) out.serialNumber = pSer[1];

  // 3. Compact GS1 DataMatrix string starting with 01 + 14-digit GTIN
  if (!out.gtin && /^01\d{14}/.test(clean)) {
    out.gtin = clean.slice(2, 16);
    const rest = clean.slice(16);
    const expMatch = rest.match(/17(\d{6})/);
    if (expMatch) {
      const yy = expMatch[1].slice(0, 2);
      const mm = expMatch[1].slice(2, 4);
      const dd = expMatch[1].slice(4, 6);
      out.expiryDate = `20${yy}-${mm}-${dd === '00' ? '28' : dd}`;
    }
    const lotMatch = rest.match(/10([A-Za-z0-9\-_]{2,20})/);
    if (lotMatch) out.batchNumber = lotMatch[1];
  }

  // 4. Plain EAN-13 / GTIN-14 barcode
  if (!out.gtin && /^\d{12,14}$/.test(clean)) {
    out.gtin = clean;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function buildReader(): BrowserMultiFormatReader {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.PDF_417,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}

/**
 * Decodes QR codes, GS1 DataMatrix, EAN-13, and Code-128 barcodes from a data URL or image URL.
 */
export async function decodeBarcodeFromImageUrl(imageUrl: string): Promise<DecodedBarcodeResult | null> {
  const reader = buildReader();
  try {
    const result = await reader.decodeFromImageUrl(imageUrl);
    if (!result) return null;
    const rawText = result.getText();
    const formatIndex = result.getBarcodeFormat();
    const format = BarcodeFormat[formatIndex] || 'BARCODE';
    const urlAudit = inspectDecodedUrl(rawText);
    const gs1 = parseGs1Identifiers(rawText);

    return {
      rawText,
      format,
      isUrl: Boolean(urlAudit),
      urlAudit,
      gs1,
      authenticityDisclaimer:
        'A readable QR or barcode confirms printed encoding only—it does NOT prove physical authenticity because codes can be copied onto counterfeit packs.',
    };
  } catch {
    return null;
  }
}

/**
 * Deterministic canvas image quality inspection (sharpness via gradient variance + brightness/glare).
 */
export function analyzePackImageQuality(canvas: HTMLCanvasElement): ImageQualityReport {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx || w < 10 || h < 10) {
    return {
      width: w,
      height: h,
      sharpnessScore: 0,
      brightnessScore: 0,
      rating: 'poor',
      warnings: ['Image dimensions are too small for reliable OCR.'],
    };
  }

  // Sample down to max 240px wide for instant deterministic metric calculation
  const sampleW = Math.min(240, w);
  const sampleH = Math.max(20, Math.round((h / w) * sampleW));
  const tmp = document.createElement('canvas');
  tmp.width = sampleW;
  tmp.height = sampleH;
  const tctx = tmp.getContext('2d');
  if (!tctx) {
    return { width: w, height: h, sharpnessScore: 50, brightnessScore: 128, rating: 'fair', warnings: [] };
  }
  tctx.drawImage(canvas, 0, 0, sampleW, sampleH);
  const { data } = tctx.getImageData(0, 0, sampleW, sampleH);

  const gray = new Float32Array(sampleW * sampleH);
  let brightnessSum = 0;
  let blownPixels = 0;
  for (let i = 0; i < gray.length; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = lum;
    brightnessSum += lum;
    if (lum > 248) blownPixels++;
  }
  const brightnessScore = Math.round(brightnessSum / gray.length);
  const blownRatio = blownPixels / gray.length;

  // 4-neighbor Laplacian variance for sharpness
  let lapSum = 0;
  let lapSqSum = 0;
  let count = 0;
  for (let y = 1; y < sampleH - 1; y++) {
    for (let x = 1; x < sampleW - 1; x++) {
      const idx = y * sampleW + x;
      const lap =
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx - sampleW] +
        gray[idx + sampleW] -
        4 * gray[idx];
      lapSum += lap;
      lapSqSum += lap * lap;
      count++;
    }
  }
  const mean = count > 0 ? lapSum / count : 0;
  const variance = count > 0 ? lapSqSum / count - mean * mean : 0;
  const sharpnessScore = Math.min(100, Math.round(Math.sqrt(Math.max(0, variance)) * 2.2));

  const warnings: string[] = [];
  if (w < 480 || h < 360) {
    warnings.push('Low resolution image — move camera closer to the batch & expiry text.');
  }
  if (sharpnessScore < 18) {
    warnings.push('Image looks slightly blurry — hold steady or refocus before OCR.');
  }
  if (brightnessScore < 55) {
    warnings.push('Image is quite dark — improve lighting on the printed label.');
  }
  if (brightnessScore > 225 || blownRatio > 0.25) {
    warnings.push('Strong glare/overexposure detected — tilt the blister foil slightly to reduce reflection.');
  }

  const rating: ImageQualityReport['rating'] =
    warnings.length === 0 ? 'good' : warnings.length === 1 ? 'fair' : 'poor';

  return {
    width: w,
    height: h,
    sharpnessScore,
    brightnessScore,
    rating,
    warnings,
  };
}

/**
 * Applies rotation (0/90/180/270) and optional percentage crop box to an image data URL,
 * returning a clean JPEG data URL + base64 payload + quality report.
 */
export async function transformPackImage(
  sourceDataUrl: string,
  rotationDeg: number,
  cropBox: { xPct: number; yPct: number; wPct: number; hPct: number }
): Promise<{ dataUrl: string; base64: string; mimeType: 'image/jpeg'; quality: ImageQualityReport }> {
  const img = new Image();
  img.src = sourceDataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not load image for transformation.'));
  });

  const normRot = ((rotationDeg % 360) + 360) % 360;
  const swap = normRot === 90 || normRot === 270;
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = swap ? img.naturalHeight : img.naturalWidth;
  rotCanvas.height = swap ? img.naturalWidth : img.naturalHeight;

  const rctx = rotCanvas.getContext('2d');
  if (!rctx) throw new Error('Canvas 2D context unavailable.');
  rctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rctx.rotate((normRot * Math.PI) / 180);
  rctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  // Apply crop box on rotated canvas
  const sx = Math.round((cropBox.xPct / 100) * rotCanvas.width);
  const sy = Math.round((cropBox.yPct / 100) * rotCanvas.height);
  const sw = Math.max(40, Math.round((cropBox.wPct / 100) * rotCanvas.width));
  const sh = Math.max(40, Math.round((cropBox.hPct / 100) * rotCanvas.height));

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const outCanvas = document.createElement('canvas');
  outCanvas.width = Math.max(40, Math.round(sw * scale));
  outCanvas.height = Math.max(40, Math.round(sh * scale));

  const octx = outCanvas.getContext('2d');
  if (!octx) throw new Error('Canvas 2D context unavailable.');
  octx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, outCanvas.width, outCanvas.height);

  const quality = analyzePackImageQuality(outCanvas);
  const dataUrl = outCanvas.toDataURL('image/jpeg', 0.9);
  const base64 = dataUrl.split(',')[1] || '';

  return { dataUrl, base64, mimeType: 'image/jpeg', quality };
}
