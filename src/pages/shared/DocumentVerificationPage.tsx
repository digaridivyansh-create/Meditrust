import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileCheck2,
  Fingerprint,
  RefreshCw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { FeatureSpotlight, MEDIA_ASSETS } from '../../components/EditorialMedia';
import { CLINICAL_QUOTES } from '../../lib/i18n';
import {
  createSafetyAlert,
  logAuditEvent,
  saveVerifiedDocument,
  updateVerifiedDocumentReview,
} from '../../lib/firestoreService';
import { downloadTextFile, fileToBase64AndHash, formatTimestamp } from '../../lib/utils';
import { VerificationStatusLabel } from '../../components/StatusIndicator';
import type { DocumentType, PortalRole, VerificationStatus, VerifiedDocument } from '../../types';

export function DocumentVerificationPage({ portalRole }: { portalRole: PortalRole }) {
  const { user, profile, data } = useAuth();
  const { t } = useLanguage();
  const [selectedType, setSelectedType] = useState<DocumentType>(
    portalRole === 'pharmacist' ? 'invoice' : 'prescription'
  );
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<VerifiedDocument | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  const docs = data.documents.filter((d) => d.portalRole === portalRole);

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      setErrorMsg('Supported formats: PDF, JPEG, PNG, or WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Document file must be smaller than 10 MB.');
      return;
    }

    setErrorMsg('');
    setVerifying(true);
    try {
      const { base64, sha256 } = await fileToBase64AndHash(file);
      const res = await fetch('/api/v1/documents/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType: file.type,
          fileName: file.name,
          documentType: selectedType,
          sha256Hash: sha256,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Document verification failed.');

      const validTypes: DocumentType[] = ['prescription', 'invoice', 'leaflet', 'coa', 'lab_report', 'other'];
      const detectedType: DocumentType = validTypes.includes(json.detectedType)
        ? json.detectedType
        : selectedType;

      const docId = await saveVerifiedDocument({
        ownerId: user.uid,
        portalRole,
        documentTitle: json.documentTitle || file.name,
        documentType: detectedType,
        fileName: file.name,
        fileMimeType: file.type,
        sha256Hash: sha256,
        issuerName: json.issuerName,
        documentDate: json.documentDate,
        extractedSummary: json.extractedSummary,
        extractedEntities: json.extractedEntities || [],
        anomalies: json.anomalies || [],
        verificationStatus: json.verificationStatus || 'needs_review',
        confidenceLevel: json.confidenceLevel || 'medium',
      });

      await logAuditEvent({
        ownerId: user.uid,
        portalRole,
        actorName: profile?.displayName || 'User',
        action: 'DOCUMENT_VERIFIED',
        targetType: 'verified_document',
        targetId: docId,
        details: `Fingerprinted ${file.name} (SHA-256 ${sha256.slice(0, 12)}...) -> ${json.verificationStatus}.`,
      });

      if (json.verificationStatus === 'mismatch_suspicious') {
        await createSafetyAlert({
          ownerId: user.uid,
          portalRole,
          alertType: 'document_flag',
          severity: 'warning',
          title: `Document Anomalies Detected: ${json.documentTitle || file.name}`,
          triggerDetails: (json.anomalies || []).join(' | ') || 'Document requires manual inspection.',
          affectedProduct: json.documentTitle || file.name,
          sourceReference: `SHA-256: ${sha256.slice(0, 16)}`,
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to verify document.');
    } finally {
      setVerifying(false);
      e.target.value = '';
    }
  };

  const handleUpdateReview = async (status: VerificationStatus) => {
    if (!selectedDoc || !user) return;
    setSavingReview(true);
    try {
      await updateVerifiedDocumentReview(selectedDoc.id, status, reviewNotes);
      await logAuditEvent({
        ownerId: user.uid,
        portalRole,
        actorName: profile?.displayName || 'Reviewer',
        action: 'DOCUMENT_REVIEW_UPDATED',
        targetType: 'verified_document',
        targetId: selectedDoc.id,
        details: `Updated status to ${status}. Notes: ${reviewNotes || 'None'}.`,
      });
      setSelectedDoc({ ...selectedDoc, verificationStatus: status, reviewNotes });
    } finally {
      setSavingReview(false);
    }
  };

  const exportCertificate = (docItem: VerifiedDocument) => {
    const payload = {
      platform: 'MediTrust AI Secure Document Verification',
      recordId: docItem.id,
      documentTitle: docItem.documentTitle,
      documentType: docItem.documentType,
      fileName: docItem.fileName,
      sha256Fingerprint: docItem.sha256Hash,
      issuerName: docItem.issuerName || 'Unrecorded',
      documentDate: docItem.documentDate || 'Unrecorded',
      verificationStatus: docItem.verificationStatus,
      confidenceLevel: docItem.confidenceLevel,
      extractedEntities: docItem.extractedEntities || [],
      anomalies: docItem.anomalies || [],
      reviewNotes: docItem.reviewNotes || '',
      exportedAt: new Date().toISOString(),
      disclaimer:
        'Cryptographic SHA-256 hash proves file integrity from upload time. Legal issuer authenticity requires confirmation with the issuing entity.',
    };
    downloadTextFile(
      `meditrust-doc-evidence-${docItem.id}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    );
  };

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-slate-200">
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
          {portalRole === 'pharmacist'
            ? t(
                'Secure Invoice, CoA & Document Verification',
                'सुरक्षित इनवॉइस, CoA एवं दस्तावेज़ सत्यापन'
              )
            : t('Secure Medical Document Verification', 'सुरक्षित मेडिकल दस्तावेज़ सत्यापन')}
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          {t(
            'Compute a tamper-evident SHA-256 cryptographic fingerprint, extract structured clinical or supplier entities via OCR, and flag missing signatures or inconsistencies.',
            'छेड़छाड़-रोधी SHA-256 क्रिप्टोग्राफिक फिंगरप्रिंट बनाएँ, ओसीआर से विवरण निकालें और संदिग्ध विसंगतियों की पहचान करें।'
          )}
        </p>
      </div>

      <FeatureSpotlight
        imageSrc={
          portalRole === 'pharmacist'
            ? MEDIA_ASSETS.pharmacyDispensary
            : MEDIA_ASSETS.heroVerification
        }
        imageAlt="Document verification and clinical audit inspection"
        {...CLINICAL_QUOTES.features.documents}
        compact
      />

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Upload & Fingerprint Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2 text-[#0D7377]">
            <Fingerprint className="w-5 h-5" />
            <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
              Upload Document for Cryptographic Hashing & Inspection
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Files are hashed locally using Web Crypto SHA-256 before server-side document parsing.
            AI identifies visible fields and anomalies; human confirmation remains mandatory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as DocumentType)}
            className="px-3.5 py-2.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
          >
            <option value="prescription">Prescription</option>
            <option value="invoice">Supplier / Pharmacy Invoice</option>
            <option value="coa">Certificate of Analysis (CoA)</option>
            <option value="leaflet">Product Information Leaflet</option>
            <option value="lab_report">Lab / Quality Report</option>
            <option value="other">Other Document</option>
          </select>

          <label className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors cursor-pointer whitespace-nowrap">
            {verifying ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span>{verifying ? 'Hashing & Analyzing...' : 'Upload PDF / Image'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={verifying}
              onChange={(e) => void handleUploadDocument(e)}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Document Registry & Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
              Verified Document Ledger ({docs.length})
            </h3>
            <span className="font-mono text-xs text-slate-500">SHA-256 Indexed</span>
          </div>

          {docs.length === 0 ? (
            <div className="p-12 text-center">
              <FileCheck2 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-[#0B1B2B]">No documents verified yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Upload a prescription, pharmacy invoice, leaflet, or CoA above to generate an
                auditable verification record.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {docs.map((docItem) => {
                const isSelected = selectedDoc?.id === docItem.id;
                return (
                  <button
                    key={docItem.id}
                    type="button"
                    onClick={() => {
                      setSelectedDoc(docItem);
                      setReviewNotes(docItem.reviewNotes || '');
                    }}
                    className={`w-full text-left px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected ? 'bg-teal-50/60' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0B1B2B] truncate">
                        {docItem.documentTitle}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {docItem.documentType.toUpperCase()} · {docItem.issuerName || 'Issuer unrecorded'} ·{' '}
                        {formatTimestamp(docItem.createdAt)}
                      </p>
                      <p className="font-mono text-[11px] text-slate-400 mt-1 truncate">
                        SHA-256: {docItem.sha256Hash}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col sm:items-end gap-1">
                      <VerificationStatusLabel status={docItem.verificationStatus} compact />
                      <span className="font-mono text-[11px] text-slate-500">
                        {(docItem.anomalies || []).length} flag(s)
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Document Evidence Detail Pane */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          {!selectedDoc ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Select a document from the ledger to inspect its SHA-256 fingerprint, extracted
              entities, anomalies, and reviewer controls.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
                <div className="min-w-0">
                  <VerificationStatusLabel status={selectedDoc.verificationStatus} />
                  <h4 className="font-display text-lg font-bold text-[#0B1B2B] mt-1.5">
                    {selectedDoc.documentTitle}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedDoc.fileName} · Confidence: {selectedDoc.confidenceLevel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => exportCertificate(selectedDoc)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1B2B] border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JSON Proof</span>
                </button>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">
                  Cryptographic SHA-256 Fingerprint
                </p>
                <p className="font-mono text-[11px] text-[#0B1B2B] bg-[#F8FAFC] border border-slate-200 rounded-lg p-2.5 break-all">
                  {selectedDoc.sha256Hash}
                </p>
              </div>

              {selectedDoc.extractedSummary && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Extracted Summary</p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {selectedDoc.extractedSummary}
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">
                  Extracted Entities ({(selectedDoc.extractedEntities || []).length})
                </p>
                {(selectedDoc.extractedEntities || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No structured entities extracted.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-slate-700 font-mono">
                    {(selectedDoc.extractedEntities || []).map((ent, idx) => (
                      <li key={idx}>· {ent}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">
                  Detected Anomalies / Missing Fields ({(selectedDoc.anomalies || []).length})
                </p>
                {(selectedDoc.anomalies || []).length === 0 ? (
                  <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>No visual structure anomalies flagged during parsing.</span>
                  </p>
                ) : (
                  <ul className="space-y-1.5 text-xs text-rose-800 bg-rose-50/70 border border-rose-200 rounded-lg p-3">
                    {(selectedDoc.anomalies || []).map((anom, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{anom}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Reviewer Confirmation Notes
                </label>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Record issuer callback confirmation, invoice cross-check, or escalation reason..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={savingReview}
                    onClick={() => void handleUpdateReview('verified_match')}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 cursor-pointer"
                  >
                    Confirm Match
                  </button>
                  <button
                    type="button"
                    disabled={savingReview}
                    onClick={() => void handleUpdateReview('needs_review')}
                    className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 rounded-lg hover:bg-amber-200 cursor-pointer"
                  >
                    Mark Needs Review
                  </button>
                  <button
                    type="button"
                    disabled={savingReview}
                    onClick={() => void handleUpdateReview('mismatch_suspicious')}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 cursor-pointer"
                  >
                    Flag Suspicious
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
