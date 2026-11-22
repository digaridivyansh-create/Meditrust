import { useState } from 'react';
import { Camera, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { FeatureSpotlight, MEDIA_ASSETS } from '../../components/EditorialMedia';
import { CLINICAL_QUOTES } from '../../lib/i18n';
import { logAuditEvent, updateScanReview } from '../../lib/firestoreService';
import { formatTimestamp } from '../../lib/utils';
import { ExpiryStatusLabel, VerificationStatusLabel } from '../../components/StatusIndicator';
import { MedicineScannerPage } from '../patient/MedicineScannerPage';
import type { MedicineScan, ReviewStatus } from '../../types';

export function VerificationReviewPage({ onOpenAssistant }: { onOpenAssistant: () => void }) {
  const { user, profile, data } = useAuth();
  const { t } = useLanguage();
  const [mode, setMode] = useState<'queue' | 'scanner'>('queue');
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewStatus>('all');
  const [selectedScan, setSelectedScan] = useState<MedicineScan | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const queueItems = data.scans.filter((s) => {
    if (statusFilter !== 'all' && s.reviewStatus !== statusFilter) return false;
    return true;
  });

  const handleResolveAction = async (nextStatus: ReviewStatus) => {
    if (!user || !selectedScan) return;
    setSaving(true);
    try {
      await updateScanReview(selectedScan.id, nextStatus, notes);
      await logAuditEvent({
        ownerId: user.uid,
        portalRole: 'pharmacist',
        actorName: profile?.displayName || 'Pharmacist',
        action: `SCAN_REVIEW_${nextStatus.toUpperCase()}`,
        targetType: 'scan',
        targetId: selectedScan.id,
        details: `Pharmacist marked ${selectedScan.medicineName} (Batch ${selectedScan.batchNumber || 'N/A'}) as ${nextStatus}. Notes: ${notes || 'None'}`,
      });
      setSelectedScan({ ...selectedScan, reviewStatus: nextStatus, reviewerNotes: notes });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
            {t('Verification Review & Escalation Queue', 'सत्यापन समीक्षा एवं एस्केलेशन कतार')}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {t(
              'Inspect inconclusive or mismatched scans, record documented reviewer notes, escalate suspected counterfeit packs, or scan incoming stock directly.',
              'अस्पष्ट या असंगत स्कैन की समीक्षा करें, टिप्पणी दर्ज करें, संदिग्ध नकली पैक को क्वारंटाइन करें या नया स्टॉक स्कैन करें।'
            )}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => setMode('queue')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'queue'
                ? 'bg-white text-[#0B1B2B] shadow-xs'
                : 'text-slate-600 hover:text-[#0B1B2B]'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>
              {t('Review Queue', 'समीक्षा कतार')} ({data.scans.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode('scanner')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'scanner'
                ? 'bg-white text-[#0B1B2B] shadow-xs'
                : 'text-slate-600 hover:text-[#0B1B2B]'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{t('Scan & Verify Pack', 'पैक स्कैन एवं जाँच')}</span>
          </button>
        </div>
      </div>

      {mode === 'queue' && (
        <FeatureSpotlight
          imageSrc={MEDIA_ASSETS.pharmacistLab}
          imageAlt="Pharmacist reviewing flagged medicine verification cases"
          {...CLINICAL_QUOTES.features.review}
          compact
        />
      )}

      {mode === 'scanner' ? (
        <MedicineScannerPage portalRole="pharmacist" onOpenAssistant={onOpenAssistant} />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All Scans' },
                { id: 'pending_review', label: 'Pending Review' },
                { id: 'escalated', label: 'Escalated' },
                { id: 'quarantined', label: 'Quarantined' },
                { id: 'cleared', label: 'Cleared' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-white text-[#0B1B2B] shadow-xs'
                    : 'text-slate-600 hover:text-[#0B1B2B]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              {queueItems.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-[#0B1B2B]">
                    No verification cases in this filter
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Use &ldquo;Scan &amp; Verify Pack&rdquo; to inspect incoming cartons against
                    openFDA and your pharmacy batch ledger.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {queueItems.map((scan) => (
                    <button
                      key={scan.id}
                      type="button"
                      onClick={() => {
                        setSelectedScan(scan);
                        setNotes(scan.reviewerNotes || '');
                      }}
                      className={`w-full text-left px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors cursor-pointer ${
                        selectedScan?.id === scan.id ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0B1B2B] truncate">
                          {scan.medicineName}
                          {scan.strength ? ` · ${scan.strength}` : ''}
                        </p>
                        <p className="font-mono text-xs text-slate-500 mt-0.5 tabular-nums">
                          Batch {scan.batchNumber || 'Unrecorded'} · Review:{' '}
                          <span className="uppercase">{scan.reviewStatus.replace('_', ' ')}</span> ·{' '}
                          {formatTimestamp(scan.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-col sm:items-end gap-1 shrink-0">
                        <VerificationStatusLabel status={scan.verificationStatus} compact />
                        <ExpiryStatusLabel status={scan.expiryStatus} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
              {!selectedScan ? (
                <p className="text-xs text-slate-500 py-10 text-center">
                  Select a scan case to review extracted OCR fields, source evidence, and commit an
                  audited resolution or escalation.
                </p>
              ) : (
                <div className="space-y-4 text-xs">
                  <div className="pb-3 border-b border-slate-200">
                    <VerificationStatusLabel status={selectedScan.verificationStatus} />
                    <h3 className="font-display text-lg font-bold text-[#0B1B2B] mt-1.5">
                      {selectedScan.medicineName}
                    </h3>
                    <p className="font-mono text-[11px] text-slate-500">
                      Scan ID: {selectedScan.id} · OCR Confidence: {selectedScan.confidenceSummary}
                      {selectedScan.userCorrected ? ' · Human-corrected' : ''}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-slate-500">Manufacturer</p>
                      <p className="font-medium text-[#0B1B2B]">
                        {selectedScan.manufacturer || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Batch Number</p>
                      <p className="font-mono font-medium text-[#0B1B2B]">
                        {selectedScan.batchNumber || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Expiry Date</p>
                      <p className="font-mono font-medium text-[#0B1B2B]">
                        {selectedScan.expiryDate || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Review State</p>
                      <p className="font-mono font-semibold text-[#0D7377] uppercase">
                        {selectedScan.reviewStatus.replace('_', ' ')}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-500 mb-0.5">Source Evidence</p>
                    <p className="text-slate-700 leading-relaxed">
                      {selectedScan.sourceName}: {selectedScan.sourceEvidence}
                    </p>
                  </div>

                  {selectedScan.safetyNotices && (
                    <div>
                      <p className="font-semibold text-slate-500 mb-0.5">Safety / Recall Notices</p>
                      <p className="text-slate-700 leading-relaxed">{selectedScan.safetyNotices}</p>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <label className="block font-semibold text-slate-700">
                      Pharmacist Resolution / Escalation Notes
                    </label>
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Document invoice cross-check, physical seal inspection, or manufacturer quality escalation ticket..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleResolveAction('cleared')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 cursor-pointer"
                      >
                        Mark Cleared
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleResolveAction('quarantined')}
                        className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 rounded-lg hover:bg-amber-200 cursor-pointer"
                      >
                        Quarantine Stock
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleResolveAction('escalated')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 cursor-pointer"
                      >
                        Escalate to Manufacturer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
