import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Crop,
  FileSearch,
  QrCode,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { createSafetyAlert, logAuditEvent, saveMedicineScan } from '../../lib/firestoreService';
import { fileToBase64AndHash, VERIFICATION_STATUS_META } from '../../lib/utils';
import {
  decodeBarcodeFromImageUrl,
  transformPackImage,
  type DecodedBarcodeResult,
  type ImageQualityReport,
} from '../../lib/qrBarcodeScanner';
import { ExpiryStatusLabel, VerificationStatusLabel } from '../../components/StatusIndicator';
import { FeatureSpotlight, MEDIA_ASSETS } from '../../components/EditorialMedia';
import { CLINICAL_QUOTES } from '../../lib/i18n';
import type { ConfidenceLevel, ExpiryStatus, PortalRole, RecallNotice, VerificationStatus } from '../../types';

interface ExtractedFields {
  medicineName: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  batchNumber: string;
  mfgDate: string;
  expiryDate: string;
  licenseInfo: string;
  identifiers: string;
  visualObservations: string[];
  confidence: {
    medicineName: ConfidenceLevel;
    batchNumber: ConfidenceLevel;
    expiryDate: ConfidenceLevel;
    manufacturer: ConfidenceLevel;
    overall: ConfidenceLevel;
  };
}

interface VerificationResponse {
  checkedAt: string;
  verificationStatus: VerificationStatus;
  expiryStatus: ExpiryStatus;
  expiryDetails: {
    status: ExpiryStatus;
    daysRemaining: number | null;
    parsedIsoDate: string | null;
    summary: string;
  };
  sourceName: string;
  sourceEvidence: string;
  safetyNotices: string;
  recalls: RecallNotice[];
  fdaLabelSummary: {
    brandName: string;
    genericName: string;
    manufacturerName: string;
    route: string;
    effectiveTime: string;
    labelExcerpt: string;
  } | null;
  limitations: string;
  nextStep: string;
}

const EMPTY_FIELDS: ExtractedFields = {
  medicineName: '',
  genericName: '',
  strength: '',
  dosageForm: '',
  manufacturer: '',
  batchNumber: '',
  mfgDate: '',
  expiryDate: '',
  licenseInfo: '',
  identifiers: '',
  visualObservations: [],
  confidence: {
    medicineName: 'medium',
    batchNumber: 'medium',
    expiryDate: 'medium',
    manufacturer: 'medium',
    overall: 'medium',
  },
};

export function MedicineScannerPage({
  portalRole = 'patient',
  onOpenAssistant,
}: {
  portalRole?: PortalRole;
  onOpenAssistant?: () => void;
}) {
  const { user, profile, data } = useAuth();
  const { t } = useLanguage();
  const [step, setStep] = useState<'capture' | 'prepare' | 'confirm' | 'result'>('capture');
  const [rawSourceUrl, setRawSourceUrl] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [cropPreset, setCropPreset] = useState<'full' | 'center' | 'label'>('full');
  const [imageQuality, setImageQuality] = useState<ImageQualityReport | null>(null);
  const [decodedCode, setDecodedCode] = useState<DecodedBarcodeResult | null>(null);
  const [decodingQr, setDecodingQr] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [fields, setFields] = useState<ExtractedFields>(EMPTY_FIELDS);
  const [initialExtracted, setInitialExtracted] = useState<ExtractedFields | null>(null);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [savedScanId, setSavedScanId] = useState<string | null>(null);

  // Live Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const getCropBox = (preset: 'full' | 'center' | 'label') => {
    if (preset === 'center') return { xPct: 12, yPct: 12, wPct: 76, hPct: 76 };
    if (preset === 'label') return { xPct: 5, yPct: 22, wPct: 90, hPct: 56 };
    return { xPct: 0, yPct: 0, wPct: 100, hPct: 100 };
  };

  const refreshPreparedPreview = async (
    sourceUrl: string,
    nextRot: number,
    nextPreset: 'full' | 'center' | 'label'
  ) => {
    setDecodingQr(true);
    try {
      const transformed = await transformPackImage(sourceUrl, nextRot, getCropBox(nextPreset));
      setPreviewUrl(transformed.dataUrl);
      setImageQuality(transformed.quality);
      const qr = await decodeBarcodeFromImageUrl(transformed.dataUrl);
      setDecodedCode(qr);
    } catch {
      setPreviewUrl(sourceUrl);
    } finally {
      setDecodingQr(false);
    }
  };

  const startCamera = async () => {
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 60);
    } catch {
      setErrorMsg(
        t(
          'Camera access was blocked or unavailable. You can upload a photo directly instead.',
          'कैमरा अनुमति उपलब्ध नहीं है। आप सीधे फोटो अपलोड कर सकते हैं।'
        )
      );
    }
  };

  const enterPrepareStage = async (sourceDataUrl: string) => {
    setErrorMsg('');
    setRawSourceUrl(sourceDataUrl);
    setRotationDeg(0);
    setCropPreset('full');
    setDecodedCode(null);
    setImageQuality(null);
    setStep('prepare');
    await refreshPreparedPreview(sourceDataUrl, 0, 'full');
  };

  const runOcrFromPrepared = async () => {
    if (!rawSourceUrl) return;
    setErrorMsg('');
    setExtracting(true);
    try {
      const transformed = await transformPackImage(
        rawSourceUrl,
        rotationDeg,
        getCropBox(cropPreset)
      );
      setPreviewUrl(transformed.dataUrl);
      setImageQuality(transformed.quality);

      const res = await fetch('/api/v1/scans/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: transformed.base64,
          mimeType: transformed.mimeType,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to analyze medicine packaging.');
      }

      const gs1 = decodedCode?.gs1;
      const qrSummary = decodedCode
        ? `[${decodedCode.format}] ${decodedCode.rawText.slice(0, 140)}`
        : '';

      const extracted: ExtractedFields = {
        ...EMPTY_FIELDS,
        ...(json.fields || {}),
        batchNumber: json.fields?.batchNumber || gs1?.batchNumber || '',
        expiryDate: json.fields?.expiryDate || gs1?.expiryDate || '',
        identifiers:
          [json.fields?.identifiers, gs1?.gtin ? `GTIN:${gs1.gtin}` : '', qrSummary]
            .filter(Boolean)
            .join(' | ')
            .slice(0, 240),
        confidence: {
          ...EMPTY_FIELDS.confidence,
          ...(json.fields?.confidence || {}),
        },
        visualObservations: [
          ...(Array.isArray(json.fields?.visualObservations) ? json.fields.visualObservations : []),
          ...(transformed.quality.warnings || []),
        ],
      };
      setFields(extracted);
      setInitialExtracted(extracted);
      setStep('confirm');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'OCR extraction failed.');
    } finally {
      setExtracting(false);
    }
  };

  const proceedWithQrOnly = () => {
    const gs1 = decodedCode?.gs1;
    const qrSummary = decodedCode ? `[${decodedCode.format}] ${decodedCode.rawText.slice(0, 160)}` : '';
    const seeded: ExtractedFields = {
      ...EMPTY_FIELDS,
      batchNumber: gs1?.batchNumber || '',
      expiryDate: gs1?.expiryDate || '',
      identifiers: [gs1?.gtin ? `GTIN:${gs1.gtin}` : '', qrSummary].filter(Boolean).join(' | '),
    };
    setFields(seeded);
    setInitialExtracted(seeded);
    setStep('confirm');
  };

  const captureCameraFrame = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
    await enterPrepareStage(dataUrl);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMsg('Please upload a JPEG, PNG, or WebP photograph of the medicine pack.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Image must be smaller than 10 MB.');
      return;
    }
    try {
      const { dataUrl } = await fileToBase64AndHash(file);
      await enterPrepareStage(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to read image.');
    } finally {
      e.target.value = '';
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!fields.medicineName.trim() && !fields.genericName.trim()) {
      setErrorMsg('Enter at least the Medicine Brand Name or Generic Salt to run verification.');
      return;
    }

    setErrorMsg('');
    setVerifying(true);
    try {
      const res = await fetch('/api/v1/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicineName: fields.medicineName,
          genericName: fields.genericName,
          strength: fields.strength,
          manufacturer: fields.manufacturer,
          batchNumber: fields.batchNumber,
          expiryDate: fields.expiryDate,
          nearExpiryDays: profile?.nearExpiryDays || 90,
          pharmacyBatches: data.batches.map((b) => ({
            batchNumber: b.batchNumber,
            medicineName: b.medicineName,
            manufacturer: b.manufacturer,
            expiryDate: b.expiryDate,
            supplierName: b.supplierName,
            recallFlagged: b.recallFlagged,
          })),
        }),
      });
      const json = (await res.json()) as VerificationResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || 'Verification engine failed.');
      }

      const userCorrected = Boolean(
        initialExtracted &&
          (initialExtracted.medicineName !== fields.medicineName ||
            initialExtracted.batchNumber !== fields.batchNumber ||
            initialExtracted.expiryDate !== fields.expiryDate ||
            initialExtracted.manufacturer !== fields.manufacturer)
      );

      const needsQueue =
        json.verificationStatus === 'mismatch_suspicious' ||
        json.verificationStatus === 'needs_review' ||
        json.expiryStatus === 'expired';

      const scanId = await saveMedicineScan({
        ownerId: user.uid,
        portalRole,
        medicineName: fields.medicineName || fields.genericName,
        genericName: fields.genericName,
        strength: fields.strength,
        dosageForm: fields.dosageForm,
        manufacturer: fields.manufacturer,
        batchNumber: fields.batchNumber,
        mfgDate: fields.mfgDate,
        expiryDate: fields.expiryDate,
        licenseInfo: fields.licenseInfo,
        identifiers: fields.identifiers,
        confidenceSummary: fields.confidence.overall || 'medium',
        verificationStatus: json.verificationStatus,
        expiryStatus: json.expiryStatus,
        sourceName: json.sourceName,
        sourceEvidence: json.sourceEvidence,
        safetyNotices: json.safetyNotices,
        limitations: json.limitations,
        nextStep: json.nextStep,
        userCorrected,
        reviewStatus: needsQueue ? 'pending_review' : 'none',
      });

      await logAuditEvent({
        ownerId: user.uid,
        portalRole,
        actorName: profile?.displayName || 'User',
        action: 'MEDICINE_SCAN_VERIFIED',
        targetType: 'scan',
        targetId: scanId,
        details: `Verified ${fields.medicineName || fields.genericName} (Batch: ${fields.batchNumber || 'N/A'}) -> ${json.verificationStatus} / expiry: ${json.expiryStatus}.`,
      });

      // Automatically trigger safety alert for expired packs or suspicious mismatches
      if (json.expiryStatus === 'expired' || json.verificationStatus === 'mismatch_suspicious') {
        await createSafetyAlert({
          ownerId: user.uid,
          portalRole,
          alertType: json.verificationStatus === 'mismatch_suspicious' ? 'mismatch' : 'expired',
          severity: 'critical',
          title:
            json.verificationStatus === 'mismatch_suspicious'
              ? `Mismatch / Recall Flag: ${fields.medicineName || fields.genericName}`
              : `Expired Medicine Scanned: ${fields.medicineName || fields.genericName}`,
          triggerDetails: `${json.sourceEvidence} ${json.expiryDetails.summary}`.trim(),
          affectedProduct: fields.medicineName || fields.genericName,
          affectedBatch: fields.batchNumber,
          sourceReference: json.sourceName,
        });
      }

      setSavedScanId(scanId);
      setResult(json);
      setStep('result');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to complete verification.');
    } finally {
      setVerifying(false);
    }
  };

  const resetScanner = () => {
    stopCamera();
    setRawSourceUrl('');
    setPreviewUrl('');
    setRotationDeg(0);
    setCropPreset('full');
    setImageQuality(null);
    setDecodedCode(null);
    setFields(EMPTY_FIELDS);
    setInitialExtracted(null);
    setResult(null);
    setSavedScanId(null);
    setErrorMsg('');
    setStep('capture');
  };

  return (
    <div className="space-y-6">
      {/* Header + Progress Stepper */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
            {t(
              'AI Medicine Scanner, QR/Barcode & Authenticity Check',
              'एआई दवा स्कैनर, QR/बारकोड और प्रामाणिकता जाँच'
            )}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {t(
              'Crop/rotate pack photos, decode QR/GS1 barcodes, extract label fields with Vision OCR, and verify against normalized Indian/global catalogues, openFDA, and expiry rules.',
              'दवा पैक की फोटो क्रॉप/रोटेट करें, QR/GS1 बारकोड डिकोड करें, विज़न ओसीआर से विवरण निकालें, और भारतीय/वैश्विक कैटलॉग व openFDA से सत्यापित करें।'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className={step === 'capture' ? 'text-[#0D7377] font-semibold' : 'text-slate-400'}>
            {t('01. Capture', '01. फोटो')}
          </span>
          <span className="text-slate-300">/</span>
          <span className={step === 'prepare' ? 'text-[#0D7377] font-semibold' : 'text-slate-400'}>
            {t('02. Crop & QR', '02. क्रॉप व QR')}
          </span>
          <span className="text-slate-300">/</span>
          <span className={step === 'confirm' ? 'text-[#0D7377] font-semibold' : 'text-slate-400'}>
            {t('03. Confirm', '03. पुष्टि')}
          </span>
          <span className="text-slate-300">/</span>
          <span className={step === 'result' ? 'text-[#0D7377] font-semibold' : 'text-slate-400'}>
            {t('04. Evidence', '04. रिपोर्ट')}
          </span>
        </div>
      </div>

      <FeatureSpotlight
        imageSrc={MEDIA_ASSETS.packScanner}
        imageAlt="Scanning a medicine blister strip and carton label on a counter"
        {...CLINICAL_QUOTES.features.scanner}
        compact
      />

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-sm text-rose-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: CAPTURE OR MANUAL ENTRY */}
      {step === 'capture' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold text-[#0B1B2B] mb-2">
                Capture or Upload Medicine Packaging
              </h3>
              <p className="text-sm text-slate-600 mb-6">
                Photograph the carton, blister strip, or bottle label clearly in even lighting so
                brand name, batch number, and expiry date are legible.
              </p>

              {cameraActive ? (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-video border border-slate-200">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void captureCameraFrame()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Capture Frame & Run OCR</span>
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      <span>Cancel Camera</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-[#F8FAFC]">
                  {extracting ? (
                    <div className="py-6 space-y-3">
                      <RefreshCw className="w-8 h-8 text-[#0D7377] animate-spin mx-auto" />
                      <p className="text-sm font-semibold text-[#0B1B2B]">
                        Running Gemini Vision OCR & Field Extraction...
                      </p>
                      <p className="text-xs text-slate-500">
                        Detecting medicine name, strength, manufacturer, batch/lot, and expiry date.
                      </p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-[#0B1B2B]">
                        Upload a pack photo or use your device camera
                      </p>
                      <p className="text-xs text-slate-500 mt-1 mb-6">
                        Supports JPEG, PNG, and WebP up to 10 MB
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <label className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors cursor-pointer">
                          <Upload className="w-4 h-4" />
                          <span>Upload Pack Image</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => void handleFileUpload(e)}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void startCamera()}
                          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <Camera className="w-4 h-4 text-[#0D7377]" />
                          <span>Open Live Camera</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="pt-6 mt-6 border-t border-slate-200 flex items-center justify-between gap-4">
              <p className="text-xs text-slate-500">
                {t(
                  'Prefer entering label fields directly without an image?',
                  'क्या आप बिना फोटो के सीधे विवरण दर्ज करना चाहते हैं?'
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  setInitialExtracted(null);
                  setStep('confirm');
                }}
                className="text-xs font-semibold text-[#0D7377] hover:underline whitespace-nowrap cursor-pointer"
              >
                {t('Enter Fields Manually', 'सीधे विवरण दर्ज करें')}
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#0D7377] mb-3">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                  How Verification Works
                </h3>
              </div>
              <ol className="space-y-3.5 text-sm text-slate-600 mt-4">
                <li>
                  <span className="font-mono text-xs text-slate-400 mr-2">01.</span>
                  Vision OCR extracts printed label fields and reports honest confidence levels.
                </li>
                <li>
                  <span className="font-mono text-xs text-slate-400 mr-2">02.</span>
                  You review and correct any blurry batch numbers or expiry dates before checking.
                </li>
                <li>
                  <span className="font-mono text-xs text-slate-400 mr-2">03.</span>
                  Our backend evaluates expiry deterministically and queries live openFDA Drug Label
                  and Recall Enforcement APIs alongside your authorized batch ledger.
                </li>
                <li>
                  <span className="font-mono text-xs text-slate-400 mr-2">04.</span>
                  You receive an auditable Evidence Card showing exact status, source, timestamp, and
                  coverage limits—never a fabricated green &ldquo;genuine&rdquo; stamp.
                </li>
              </ol>
            </div>

            <div className="mt-6 p-4 rounded-lg bg-[#F8FAFC] border border-slate-200 text-xs text-slate-600 leading-relaxed">
              <strong className="text-[#0B1B2B]">Evidence Principle:</strong> A readable QR code or
              clean carton photo is never proof of physical authenticity on its own.
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: IMAGE CROP / ROTATE, QUALITY CHECK & QR / BARCODE DECODER */}
      {step === 'prepare' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-lg font-semibold text-[#0B1B2B]">
                  {t('Crop, Rotate & QR/Barcode Scan', 'क्रॉप, रोटेट और QR/बारकोड स्कैन')}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t(
                    'Orient the pack label clearly before running Gemini Vision OCR.',
                    'जेमिनी विज़न OCR चलाने से पहले दवा पैक को सीधा और साफ़ सेट करें।'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={resetScanner}
                className="text-xs font-semibold text-slate-500 hover:text-[#0B1B2B] cursor-pointer"
              >
                {t('Retake / Choose Another', 'दूसरी फोटो चुनें')}
              </button>
            </div>

            {/* Live Transformed Preview */}
            <div className="rounded-xl border border-slate-200 bg-slate-950 overflow-hidden flex items-center justify-center min-h-[280px] max-h-[420px]">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Prepared medicine pack"
                  className="max-h-[400px] w-auto object-contain"
                />
              ) : (
                <RefreshCw className="w-6 h-6 text-teal-300 animate-spin" />
              )}
            </div>

            {/* Rotate & Crop Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = (rotationDeg + 270) % 360;
                    setRotationDeg(next);
                    void refreshPreparedPreview(rawSourceUrl, next, cropPreset);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('Rotate Left', 'बाएँ घुमाएँ')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = (rotationDeg + 90) % 360;
                    setRotationDeg(next);
                    void refreshPreparedPreview(rawSourceUrl, next, cropPreset);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>{t('Rotate Right', 'दाएँ घुमाएँ')}</span>
                </button>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
                <Crop className="w-3.5 h-3.5 text-slate-500 mx-1.5" />
                {(
                  [
                    { id: 'full', label: t('Full Frame', 'पूर्ण फोटो') },
                    { id: 'center', label: t('Center Focus', 'केंद्र क्रॉप') },
                    { id: 'label', label: t('Label Strip', 'लेबल क्रॉप') },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setCropPreset(preset.id);
                      void refreshPreparedPreview(rawSourceUrl, rotationDeg, preset.id);
                    }}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                      cropPreset === preset.id
                        ? 'bg-white text-[#0B1B2B] shadow-xs'
                        : 'text-slate-600 hover:text-[#0B1B2B]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={extracting}
                onClick={proceedWithQrOnly}
                className="text-xs font-semibold text-slate-600 hover:text-[#0D7377] underline cursor-pointer"
              >
                {t('Skip OCR & Edit Fields Manually', 'OCR छोड़ें और विवरण स्वयं भरें')}
              </button>

              <button
                type="button"
                disabled={extracting}
                onClick={() => void runOcrFromPrepared()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] disabled:opacity-60 transition-colors cursor-pointer"
              >
                {extracting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('Running Vision OCR...', 'विज़न OCR चल रहा है...')}</span>
                  </>
                ) : (
                  <>
                    <FileSearch className="w-4 h-4" />
                    <span>{t('Run Vision OCR & Extract Fields', 'विज़न OCR चलाएँ और विवरण निकालें')}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Image Quality Check + ZXing QR / GS1 Barcode Inspector */}
          <div className="lg:col-span-5 space-y-5">
            {/* Deterministic Image Quality Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-sm font-semibold text-[#0B1B2B]">
                  {t('Image Quality Pre-Check', 'इमेज गुणवत्ता पूर्व-जाँच')}
                </h4>
                {imageQuality && (
                  <span
                    className={`font-mono text-xs font-semibold uppercase ${
                      imageQuality.rating === 'good'
                        ? 'text-emerald-700'
                        : imageQuality.rating === 'fair'
                          ? 'text-amber-700'
                          : 'text-rose-700'
                    }`}
                  >
                    {imageQuality.rating}
                  </span>
                )}
              </div>

              {imageQuality ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums bg-[#F8FAFC] p-3 rounded-lg border border-slate-200">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Resolution</p>
                      <p className="font-semibold text-[#0B1B2B]">
                        {imageQuality.width}×{imageQuality.height}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Sharpness</p>
                      <p className="font-semibold text-[#0B1B2B]">{imageQuality.sharpnessScore}/100</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Exposure</p>
                      <p className="font-semibold text-[#0B1B2B]">{imageQuality.brightnessScore}/255</p>
                    </div>
                  </div>
                  {imageQuality.warnings.length > 0 ? (
                    <ul className="space-y-1.5 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      {imageQuality.warnings.map((w, idx) => (
                        <li key={idx}>• {w}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {t(
                          'Sharpness and lighting look suitable for pharmaceutical label OCR.',
                          'फोटो की स्पष्टता और रोशनी OCR जाँच के लिए उपयुक्त है।'
                        )}
                      </span>
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-500">Analyzing image clarity...</p>
              )}
            </div>

            {/* Live ZXing QR / DataMatrix / EAN / GS1 Barcode Inspector */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-[#0D7377]" />
                  <h4 className="font-display text-sm font-semibold text-[#0B1B2B]">
                    {t('QR / Barcode & GS1 Decoder', 'QR / बारकोड और GS1 डिकोडर')}
                  </h4>
                </div>
                {decodingQr && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0D7377]" />}
              </div>

              {decodedCode ? (
                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-lg bg-teal-50/70 border border-teal-200 space-y-1">
                    <p className="font-mono text-[11px] font-semibold text-[#0D7377]">
                      {decodedCode.format}
                    </p>
                    <p className="font-mono text-xs text-[#0B1B2B] break-all">
                      {decodedCode.rawText}
                    </p>
                  </div>

                  {decodedCode.gs1 && (
                    <div className="grid grid-cols-2 gap-2 bg-[#F8FAFC] p-3 rounded-lg border border-slate-200 font-mono text-[11px]">
                      {decodedCode.gs1.gtin && (
                        <div>
                          <span className="text-slate-500 block">GTIN (01)</span>
                          <span className="font-semibold text-[#0B1B2B]">{decodedCode.gs1.gtin}</span>
                        </div>
                      )}
                      {decodedCode.gs1.batchNumber && (
                        <div>
                          <span className="text-slate-500 block">Batch (10)</span>
                          <span className="font-semibold text-[#0B1B2B]">{decodedCode.gs1.batchNumber}</span>
                        </div>
                      )}
                      {decodedCode.gs1.expiryDate && (
                        <div>
                          <span className="text-slate-500 block">Expiry (17)</span>
                          <span className="font-semibold text-[#0B1B2B]">{decodedCode.gs1.expiryDate}</span>
                        </div>
                      )}
                      {decodedCode.gs1.serialNumber && (
                        <div>
                          <span className="text-slate-500 block">Serial (21)</span>
                          <span className="font-semibold text-[#0B1B2B]">{decodedCode.gs1.serialNumber}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {decodedCode.urlAudit && (
                    <div
                      className={`p-3 rounded-lg border space-y-1 ${
                        decodedCode.urlAudit.riskLevel === 'suspicious'
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : 'bg-amber-50/70 border-amber-200 text-amber-950'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          URL Audit ({decodedCode.urlAudit.host}) —{' '}
                          {decodedCode.urlAudit.riskLevel === 'suspicious'
                            ? 'Suspicious Link'
                            : 'Verify Official Domain'}
                        </span>
                      </div>
                      {decodedCode.urlAudit.notes.map((n, idx) => (
                        <p key={idx} className="leading-relaxed">
                          {n}
                        </p>
                      ))}
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {decodedCode.authenticityDisclaimer}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t(
                    'No QR, DataMatrix, EAN-13, or Code-128 barcode was detected in this crop. Try rotating or selecting Center Focus if a barcode is printed on the pack, or proceed directly to Vision OCR.',
                    'इस फोटो में कोई QR, DataMatrix या बारकोड नहीं मिला। यदि पैक पर बारकोड है तो रोटेट/क्रॉप करके पुनः प्रयास करें या सीधे विज़न OCR चलाएँ।'
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: MANDATORY HUMAN CONFIRMATION */}
      {step === 'confirm' && (
        <form onSubmit={handleVerifySubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-lg font-semibold text-[#0B1B2B]">
                  Review & Confirm Extracted Fields
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verify medicine name, batch number, and expiry date against the physical pack
                  before querying authoritative sources.
                </p>
              </div>
              <button
                type="button"
                onClick={resetScanner}
                className="text-xs font-medium text-slate-500 hover:text-[#0B1B2B] whitespace-nowrap cursor-pointer"
              >
                Retake / Restart
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Medicine / Brand Name *
                  </label>
                  {initialExtracted && (
                    <span className="font-mono text-[11px] text-slate-500">
                      OCR: {fields.confidence.medicineName}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  maxLength={180}
                  value={fields.medicineName}
                  onChange={(e) => setFields({ ...fields, medicineName: e.target.value })}
                  placeholder="e.g., Advil, Augmentin, Lipitor, Tylenol"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Generic Name / Active Salt
                </label>
                <input
                  type="text"
                  maxLength={180}
                  value={fields.genericName}
                  onChange={(e) => setFields({ ...fields, genericName: e.target.value })}
                  placeholder="e.g., Ibuprofen, Amoxicillin, Acetaminophen"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Strength</label>
                <input
                  type="text"
                  maxLength={80}
                  value={fields.strength}
                  onChange={(e) => setFields({ ...fields, strength: e.target.value })}
                  placeholder="e.g., 500 mg"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Dosage Form
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={fields.dosageForm}
                  onChange={(e) => setFields({ ...fields, dosageForm: e.target.value })}
                  placeholder="e.g., Film-coated tablet, Capsule, Syrup"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Batch / Lot Number</label>
                  {initialExtracted && (
                    <span className="font-mono text-[11px] text-slate-500">
                      OCR: {fields.confidence.batchNumber}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  maxLength={80}
                  value={fields.batchNumber}
                  onChange={(e) => setFields({ ...fields, batchNumber: e.target.value })}
                  placeholder="e.g., BN-2026-8412"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Manufacturer / Marketer
                  </label>
                  {initialExtracted && (
                    <span className="font-mono text-[11px] text-slate-500">
                      OCR: {fields.confidence.manufacturer}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  maxLength={180}
                  value={fields.manufacturer}
                  onChange={(e) => setFields({ ...fields, manufacturer: e.target.value })}
                  placeholder="Printed manufacturer name"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Manufacturing Date
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={fields.mfgDate}
                  onChange={(e) => setFields({ ...fields, mfgDate: e.target.value })}
                  placeholder="YYYY-MM or MM/YYYY"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Expiry Date</label>
                  {initialExtracted && (
                    <span className="font-mono text-[11px] text-slate-500">
                      OCR: {fields.confidence.expiryDate}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  maxLength={40}
                  value={fields.expiryDate}
                  onChange={(e) => setFields({ ...fields, expiryDate: e.target.value })}
                  placeholder="e.g., 2027-08 or 08/2027"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mfg License / NDC Code
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={fields.licenseInfo}
                  onChange={(e) => setFields({ ...fields, licenseInfo: e.target.value })}
                  placeholder="Optional license or NDC identifier"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Barcode / GTIN / QR Payload
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={fields.identifiers}
                  onChange={(e) => setFields({ ...fields, identifiers: e.target.value })}
                  placeholder="Visible code digits or QR text"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={verifying}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] disabled:opacity-60 transition-colors cursor-pointer"
              >
                <FileSearch className="w-4 h-4" />
                <span>
                  {verifying ? 'Querying Verification Engine...' : 'Confirm & Run Verification Check'}
                </span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-5">
            {previewUrl && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-700 mb-2">Captured Pack Reference</p>
                <img
                  src={previewUrl}
                  alt="Uploaded medicine pack preview"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-64 object-contain rounded-lg bg-slate-100 border border-slate-200"
                />
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-[#0B1B2B] mb-2">
                Packaging Vision Observations
              </p>
              {fields.visualObservations.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No image anomalies noted. Confirm every extracted number directly against the pack.
                </p>
              ) : (
                <ul className="space-y-2 text-xs text-slate-600">
                  {fields.visualObservations.map((obs, i) => (
                    <li key={i} className="leading-relaxed">
                      · {obs}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </form>
      )}

      {/* STEP 3: TRANSPARENT EVIDENCE RESULT CARD */}
      {step === 'result' && result && (
        <div className="space-y-6">
          <div
            className={`rounded-xl border p-6 sm:p-8 ${VERIFICATION_STATUS_META[result.verificationStatus].surfaceBg} ${VERIFICATION_STATUS_META[result.verificationStatus].borderColor}`}
          >
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 mb-5 border-b border-slate-200/80">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <VerificationStatusLabel status={result.verificationStatus} />
                  <span className="text-slate-300">·</span>
                  <ExpiryStatusLabel status={result.expiryStatus} />
                </div>
                <h3 className="font-display text-2xl font-bold text-[#0B1B2B]">
                  {fields.medicineName || fields.genericName}
                  {fields.strength ? ` ${fields.strength}` : ''}
                </h3>
                <p className="text-xs text-slate-600 font-mono mt-1 tabular-nums">
                  Batch: {fields.batchNumber || 'Not provided'} · Exp:{' '}
                  {result.expiryDetails.parsedIsoDate || fields.expiryDate || 'Unknown'} · Checked:{' '}
                  {new Date(result.checkedAt).toLocaleString()}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={resetScanner}
                  className="px-4 py-2 text-xs font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Scan Another Pack
                </button>
                {onOpenAssistant && (
                  <button
                    type="button"
                    onClick={onOpenAssistant}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1B2B] rounded-lg hover:bg-slate-800 cursor-pointer"
                  >
                    Explain in Hindi / English
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Authoritative Source Checked</p>
                  <p className="text-sm font-medium text-[#0B1B2B] mt-0.5">{result.sourceName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Verification Evidence</p>
                  <p className="text-sm text-slate-700 leading-relaxed mt-0.5">
                    {result.sourceEvidence}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Expiry Evaluation</p>
                  <p className="text-sm text-slate-700 leading-relaxed mt-0.5">
                    {result.expiryDetails.summary}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Safety & Recall Notices</p>
                  <p className="text-sm text-slate-700 leading-relaxed mt-0.5">
                    {result.safetyNotices}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Recommended Next Step</p>
                  <p className="text-sm font-semibold text-[#0B1B2B] leading-relaxed mt-0.5">
                    {result.nextStep}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Coverage Limitations</p>
                  <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                    {result.limitations}
                  </p>
                </div>
              </div>
            </div>

            {savedScanId && (
              <div className="mt-5 pt-4 border-t border-slate-200/80 flex items-center gap-2 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  Saved to your persistent scan history and audit trail (Record ID:{' '}
                  <span className="font-mono">{savedScanId}</span>).
                </span>
              </div>
            )}
          </div>

          {/* Official openFDA Drug Label Reference (if found) */}
          {result.fdaLabelSummary && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
                <h4 className="font-display text-base font-semibold text-[#0B1B2B]">
                  openFDA Reference Drug Label Details
                </h4>
                <span className="font-mono text-xs text-slate-500">
                  Effective: {result.fdaLabelSummary.effectiveTime}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs mb-4">
                <div>
                  <p className="text-slate-500">Registered Brand</p>
                  <p className="font-semibold text-[#0B1B2B] mt-0.5">
                    {result.fdaLabelSummary.brandName}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Generic Substance</p>
                  <p className="font-semibold text-[#0B1B2B] mt-0.5">
                    {result.fdaLabelSummary.genericName}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Listed Manufacturer</p>
                  <p className="font-semibold text-[#0B1B2B] mt-0.5">
                    {result.fdaLabelSummary.manufacturerName}
                  </p>
                </div>
              </div>
              {result.fdaLabelSummary.labelExcerpt && (
                <p className="text-xs text-slate-600 leading-relaxed bg-[#F8FAFC] p-3.5 rounded-lg border border-slate-200">
                  {result.fdaLabelSummary.labelExcerpt}
                </p>
              )}
            </div>
          )}

          {/* Matched openFDA Recall Notices (if any) */}
          {result.recalls.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h4 className="font-display text-base font-semibold text-[#0B1B2B] mb-4">
                Related FDA Enforcement / Recall Notices ({result.recalls.length})
              </h4>
              <div className="divide-y divide-slate-100">
                {result.recalls.map((rec) => (
                  <div key={rec.recallNumber} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 mb-1">
                      <span className="font-semibold text-rose-700">{rec.recallNumber}</span>
                      <span>·</span>
                      <span>{rec.classification}</span>
                      <span>·</span>
                      <span>{rec.status}</span>
                      <span>·</span>
                      <span>{rec.recallingFirm}</span>
                    </div>
                    <p className="text-xs font-medium text-[#0B1B2B]">{rec.reasonForRecall}</p>
                    {rec.codeInfo && (
                      <p className="text-xs text-slate-500 font-mono mt-1">Lots: {rec.codeInfo}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
