import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileBarChart2,
  GitBranch,
  Package,
  Pencil,
  ShieldAlert,
  TrendingDown,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { FeatureSpotlight, MEDIA_ASSETS } from '../../components/EditorialMedia';
import { CLINICAL_QUOTES } from '../../lib/i18n';
import { computeExpiryStatus, formatTimestamp } from '../../lib/utils';
import { VerificationStatusLabel } from '../../components/StatusIndicator';
import { PharmacistAiCommandBar } from '../../components/PharmacistAiCommandBar';
import { PredictiveAnalyticsPanel } from '../../components/PredictiveAnalyticsPanel';

export function PharmacyDashboardPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { profile, data, updateProfileFields } = useAuth();
  const { t } = useLanguage();
  const nearDays = profile?.nearExpiryDays || 90;

  const [editingDetails, setEditingDetails] = useState(false);
  const [pharmacyNameInput, setPharmacyNameInput] = useState('');
  const [licenseInput, setLicenseInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const openDetailsEditor = () => {
    setPharmacyNameInput(profile?.pharmacyName || '');
    setLicenseInput(profile?.licenseNumber || '');
    setCityInput(profile?.city || '');
    setDetailsError('');
    setDetailsSaved(false);
    setEditingDetails(true);
  };

  const handleSavePharmacyDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDetails(true);
    setDetailsError('');
    setDetailsSaved(false);
    try {
      await updateProfileFields({
        pharmacyName: pharmacyNameInput.trim(),
        licenseNumber: licenseInput.trim(),
        city: cityInput.trim(),
      });
      setDetailsSaved(true);
      setEditingDetails(false);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : 'Unable to save pharmacy details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const totalUnits = data.batches.reduce((sum, b) => sum + b.quantityOnHand, 0);
  const totalValue = data.batches.reduce((sum, b) => sum + b.quantityOnHand * b.unitPrice, 0);
  const lowStockBatches = data.batches.filter(
    (b) => b.quantityOnHand <= b.reorderThreshold
  );
  const expiredBatches = data.batches.filter(
    (b) => computeExpiryStatus(b.expiryDate, nearDays) === 'expired'
  );
  const nearExpiryBatches = data.batches.filter(
    (b) => computeExpiryStatus(b.expiryDate, nearDays) === 'near_expiry'
  );
  const validBatches = data.batches.filter(
    (b) => computeExpiryStatus(b.expiryDate, nearDays) === 'valid'
  );
  const flaggedScans = data.scans.filter(
    (s) => s.reviewStatus === 'pending_review' || s.reviewStatus === 'escalated'
  );

  const totalBatchCount = Math.max(1, data.batches.length);
  const validPct = Math.round((validBatches.length / totalBatchCount) * 100);
  const nearPct = Math.round((nearExpiryBatches.length / totalBatchCount) * 100);
  const expPct = Math.round((expiredBatches.length / totalBatchCount) * 100);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#0D7377] mb-1">
            <span>
              {profile?.pharmacyName || t('Authorized Pharmacy', 'अधिकृत फार्मेसी')} ·{' '}
              {t('License', 'लाइसेंस')}{' '}
              <span className="font-mono">{profile?.licenseNumber || 'Not set'}</span>
              {profile?.city ? ` · ${profile.city}` : ''}
            </span>
            <button
              type="button"
              onClick={openDetailsEditor}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-[#0D7377] underline underline-offset-2 cursor-pointer"
            >
              <Pencil className="w-3 h-3" />
              <span>{t('Edit Details', 'विवरण बदलें')}</span>
            </button>
            {detailsSaved && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                <CheckCircle2 className="w-3 h-3" />
                <span>{t('Saved', 'सहेजा गया')}</span>
              </span>
            )}
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
            {t('Pharmacy Operations Dashboard', 'फार्मेसी संचालन डैशबोर्ड')}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {t(
              `Tenant-isolated stock health, near-expiry horizon (${nearDays}-day window), and verification review activity.`,
              `सुरक्षित फार्मेसी स्टॉक स्थिति, नज़दीकी एक्सपायरी निगरानी (${nearDays} दिन की सीमा), और सत्यापन समीक्षा गतिविधियाँ।`
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('inventory')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Package className="w-4 h-4" />
            <span>{t('Receive / Manage Stock', 'स्टॉक प्राप्त / प्रबंधन करें')}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('review')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4 text-[#0D7377]" />
            <span>{t('Verification Queue', 'सत्यापन कतार')}</span>
          </button>
        </div>
      </div>

      {/* Inline Editable Pharmacy Details Panel */}
      {editingDetails && (
        <form
          onSubmit={handleSavePharmacyDetails}
          className="bg-white border border-teal-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-sm font-bold text-[#0B1B2B]">
                {t('Update Pharmacy Profile Details', 'फार्मेसी प्रोफ़ाइल विवरण अपडेट करें')}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  'Enter any custom pharmacy name, drug license/registration number, and city.',
                  'अपनी पसंद का फार्मेसी नाम, ड्रग लाइसेंस नंबर और शहर दर्ज करें।'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingDetails(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Close editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {detailsError && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {detailsError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('Pharmacy / Store Name', 'फार्मेसी / स्टोर का नाम')}
              </label>
              <input
                type="text"
                maxLength={160}
                value={pharmacyNameInput}
                onChange={(e) => setPharmacyNameInput(e.target.value)}
                placeholder={t('Enter any pharmacy name', 'फार्मेसी का नाम लिखें')}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('Drug License / Reg. No.', 'ड्रग लाइसेंस / पंजीकरण संख्या')}
              </label>
              <input
                type="text"
                maxLength={80}
                value={licenseInput}
                onChange={(e) => setLicenseInput(e.target.value)}
                placeholder={t('Enter any license no.', 'लाइसेंस संख्या लिखें')}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('City / Region', 'शहर / क्षेत्र')}
              </label>
              <input
                type="text"
                maxLength={100}
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                placeholder={t('Enter any city', 'शहर का नाम लिखें')}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingDetails(false)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              {t('Cancel', 'रद्द करें')}
            </button>
            <button
              type="submit"
              disabled={savingDetails}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] disabled:opacity-60 cursor-pointer"
            >
              {savingDetails ? t('Saving...', 'सहेजा जा रहा है...') : t('Save Details', 'विवरण सहेजें')}
            </button>
          </div>
        </form>
      )}

      {/* Editorial Visual & Clinical Quote */}
      <FeatureSpotlight
        imageSrc={MEDIA_ASSETS.pharmacyDispensary}
        imageAlt="Modern licensed pharmacy dispensary with organized medicine cabinets"
        {...CLINICAL_QUOTES.features.pharmacyDashboard}
        compact
      />

      {/* Live AI Pharmacy Operations Agent */}
      <PharmacistAiCommandBar onNavigate={onNavigate} />

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <button
          type="button"
          onClick={() => onNavigate('inventory')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <p className="text-xs font-medium text-slate-500">
            {t('Active Batches / Stock Units', 'सक्रिय बैच / स्टॉक इकाइयाँ')}
          </p>
          <p className="font-mono text-3xl font-semibold text-[#0B1B2B] tabular-nums mt-2">
            {totalUnits.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 font-mono tabular-nums mt-2">
            {data.batches.length} {t('batches', 'बैच')} · Est. ₹{totalValue.toLocaleString()}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('inventory')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <p className="text-xs font-medium text-slate-500">
            {t('Low-Stock Batches', 'कम-स्टॉक बैच')}
          </p>
          <p
            className={`font-mono text-3xl font-semibold tabular-nums mt-2 ${
              lowStockBatches.length > 0 ? 'text-amber-700' : 'text-[#0B1B2B]'
            }`}
          >
            {lowStockBatches.length}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {t('At or below reorder threshold', 'रीऑर्डर सीमा पर या नीचे')}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('reports')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <p className="text-xs font-medium text-slate-500">
            {t('Near-Expiry & Expired', 'नज़दीकी एक्सपायरी और समाप्त')}
          </p>
          <p
            className={`font-mono text-3xl font-semibold tabular-nums mt-2 ${
              expiredBatches.length > 0
                ? 'text-rose-700'
                : nearExpiryBatches.length > 0
                  ? 'text-amber-700'
                  : 'text-[#0B1B2B]'
            }`}
          >
            {nearExpiryBatches.length + expiredBatches.length}
          </p>
          <p className="text-xs text-slate-500 font-mono tabular-nums mt-2">
            {expiredBatches.length} {t('expired', 'समाप्त')} · {nearExpiryBatches.length}{' '}
            {t(`within ${nearDays}d`, `${nearDays} दिन के भीतर`)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('review')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <p className="text-xs font-medium text-slate-500">
            {t('Verification Exceptions', 'सत्यापन समीक्षा मामले')}
          </p>
          <p
            className={`font-mono text-3xl font-semibold tabular-nums mt-2 ${
              flaggedScans.length > 0 ? 'text-rose-700' : 'text-[#0B1B2B]'
            }`}
          >
            {flaggedScans.length}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {t('Scans awaiting pharmacist review', 'फार्मासिस्ट समीक्षा हेतु लंबित स्कैन')}
          </p>
        </button>
      </div>

      {/* Predictive Inventory Analytics & Restocking Forecast */}
      <PredictiveAnalyticsPanel />

      {/* Expiry Horizon Distribution */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
              Batch Shelf-Life Distribution
            </h3>
            <p className="text-xs text-slate-500">
              Deterministic expiry classification across {data.batches.length} registered batch(es)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
            <span className="text-emerald-700">Valid: {validBatches.length}</span>
            <span className="text-amber-700">Near Expiry: {nearExpiryBatches.length}</span>
            <span className="text-rose-700">Expired: {expiredBatches.length}</span>
          </div>
        </div>

        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
          {data.batches.length === 0 ? (
            <div className="w-full bg-slate-200" />
          ) : (
            <>
              <div
                style={{ width: `${validPct}%` }}
                className="bg-emerald-600 transition-all duration-300"
              />
              <div
                style={{ width: `${nearPct}%` }}
                className="bg-amber-500 transition-all duration-300"
              />
              <div
                style={{ width: `${expPct}%` }}
                className="bg-rose-600 transition-all duration-300"
              />
            </>
          )}
        </div>
      </section>

      {/* Operations Split: Recent Ledger + Priority Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                Recent Immutable Stock Movements
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Append-only transaction ledger (receipts, dispenses, adjustments, reconciliations)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D7377] hover:underline whitespace-nowrap cursor-pointer"
            >
              <span>Open ledger</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {data.ledger.length === 0 ? (
            <div className="p-10 text-center">
              <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-[#0B1B2B]">No stock receipts recorded yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Register your first incoming medicine shipment in Inventory & Ledger—manually or by
                scanning a pack with Gemini OCR.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('inventory')}
                className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] cursor-pointer"
              >
                Receive First Stock Batch
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.ledger.slice(0, 6).map((entry) => (
                <div
                  key={entry.id}
                  className="px-6 py-3.5 flex items-center justify-between gap-4 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[#0B1B2B] truncate">
                      {entry.medicineName} ·{' '}
                      <span className="font-mono text-slate-500">{entry.batchNumber}</span>
                    </p>
                    <p className="text-slate-500 mt-0.5 truncate">
                      {entry.movementType} · {entry.reason} · by {entry.actorName}
                    </p>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <p
                      className={`font-semibold ${
                        entry.quantityDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {entry.quantityDelta >= 0 ? `+${entry.quantityDelta}` : entry.quantityDelta}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Bal: {entry.resultingBalance} · {formatTimestamp(entry.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="lg:col-span-5 space-y-6">
          {/* Action Watchlist */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                  Priority Batch Watchlist
                </h3>
              </div>
              <span className="font-mono text-xs text-slate-500">
                {expiredBatches.length + nearExpiryBatches.length + lowStockBatches.length} item(s)
              </span>
            </div>

            {expiredBatches.length + nearExpiryBatches.length + lowStockBatches.length === 0 ? (
              <div className="p-6 text-xs text-slate-500">
                All registered batches are currently above reorder thresholds and within shelf life.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {[...expiredBatches, ...nearExpiryBatches, ...lowStockBatches]
                  .filter((b, i, arr) => arr.findIndex((x) => x.id === b.id) === i)
                  .slice(0, 5)
                  .map((b) => {
                    const exp = computeExpiryStatus(b.expiryDate, nearDays);
                    return (
                      <div key={b.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#0B1B2B] truncate">
                            {b.medicineName}
                          </p>
                          <p className="font-mono text-[11px] text-slate-500 mt-0.5 tabular-nums">
                            Batch {b.batchNumber} · Exp {b.expiryDate} · Qty {b.quantityOnHand}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {exp === 'expired' ? (
                            <span className="text-xs font-semibold text-rose-700">Expired</span>
                          ) : exp === 'near_expiry' ? (
                            <span className="text-xs font-semibold text-amber-700">Near Expiry</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                              <TrendingDown className="w-3.5 h-3.5" />
                              Low Stock
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>

          {/* Quick Links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => onNavigate('traceability')}
              className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
            >
              <GitBranch className="w-5 h-5 text-[#0D7377] mb-2.5" />
              <p className="text-sm font-semibold text-[#0B1B2B]">Batch Traceability</p>
              <p className="text-xs text-slate-500 mt-1">
                {data.traceEvents.length} recorded custody hand-offs
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
            >
              <FileBarChart2 className="w-5 h-5 text-[#0D7377] mb-2.5" />
              <p className="text-sm font-semibold text-[#0B1B2B]">Compliance Reports</p>
              <p className="text-xs text-slate-500 mt-1">
                {data.auditEvents.length} immutable audit entries
              </p>
            </button>
          </div>

          {flaggedScans.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-[#0B1B2B]">Latest Verification Flag</p>
                <button
                  type="button"
                  onClick={() => onNavigate('review')}
                  className="text-xs font-semibold text-[#0D7377] hover:underline cursor-pointer"
                >
                  Review now
                </button>
              </div>
              <p className="text-sm font-semibold text-[#0B1B2B]">{flaggedScans[0].medicineName}</p>
              <div className="mt-1.5">
                <VerificationStatusLabel status={flaggedScans[0].verificationStatus} compact />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
