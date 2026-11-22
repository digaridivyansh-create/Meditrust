import React, { useState } from 'react';
import { CheckCircle2, Download, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { deleteMedicineScan } from '../../lib/firestoreService';
import { downloadTextFile, formatTimestamp, toCsv } from '../../lib/utils';
import { ExpiryStatusLabel, VerificationStatusLabel } from '../../components/StatusIndicator';
import type { MedicineScan, PreferredLanguage } from '../../types';

export function PatientSettingsPage() {
  const { profile, data, updateProfileFields } = useAuth();
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [selectedScan, setSelectedScan] = useState<MedicineScan | null>(null);
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [preferredLanguage, setPreferredLanguage] = useState<PreferredLanguage>(
    profile?.preferredLanguage || 'en'
  );
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const scans = data.scans.filter((s) => s.portalRole === 'patient');
  const filtered = scans.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.medicineName.toLowerCase().includes(q) ||
      (s.batchNumber || '').toLowerCase().includes(q) ||
      (s.manufacturer || '').toLowerCase().includes(q)
    );
  });

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await updateProfileFields({
        displayName: displayName.trim() || profile?.displayName || 'User',
        preferredLanguage,
      });
      setSavedNotice(true);
    } finally {
      setSaving(false);
    }
  };

  const handleExportHistory = () => {
    const rows = scans.map((s) => ({
      scanId: s.id,
      medicineName: s.medicineName,
      genericName: s.genericName || '',
      strength: s.strength || '',
      manufacturer: s.manufacturer || '',
      batchNumber: s.batchNumber || '',
      expiryDate: s.expiryDate || '',
      expiryStatus: s.expiryStatus,
      verificationStatus: s.verificationStatus,
      sourceName: s.sourceName,
      createdAt: formatTimestamp(s.createdAt),
    }));
    downloadTextFile(`meditrust-patient-scans-${Date.now()}.csv`, toCsv(rows));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
            {t('Scan History & Privacy Controls', 'स्कैन इतिहास और गोपनीयता नियंत्रण')}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {t(
              'Inspect full evidence trails for your past medicine scans, export your records, or update your language and retention preferences.',
              'अपने पिछले दवा स्कैन के पूर्ण प्रमाण देखें, रिकॉर्ड CSV में डाउनलोड करें या अपनी भाषा और गोपनीयता सेटिंग्स बदलें।'
            )}
          </p>
        </div>

        <button
          type="button"
          disabled={scans.length === 0}
          onClick={handleExportHistory}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t('Export Scan CSV', 'स्कैन CSV डाउनलोड करें')}</span>
        </button>
      </div>

      {/* Scan History & Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
              Personal Scan Archive ({filtered.length})
            </h3>
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter scans..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No saved scans match your filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((scan) => (
                <div
                  key={scan.id}
                  onClick={() => setSelectedScan(scan)}
                  className={`px-5 py-4 flex items-center justify-between gap-4 cursor-pointer transition-colors ${
                    selectedScan?.id === scan.id ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0B1B2B] truncate">
                      {scan.medicineName}
                    </p>
                    <p className="font-mono text-xs text-slate-500 mt-0.5 tabular-nums">
                      Batch {scan.batchNumber || 'N/A'} · Exp {scan.expiryDate || 'N/A'} ·{' '}
                      {formatTimestamp(scan.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <VerificationStatusLabel status={scan.verificationStatus} compact />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteMedicineScan(scan.id);
                        if (selectedScan?.id === scan.id) setSelectedScan(null);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-700 cursor-pointer"
                      aria-label={`Delete scan ${scan.medicineName}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          {!selectedScan ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              Select any scan record to inspect full source provenance, limitations, and extracted
              fields.
            </p>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2 mb-1.5">
                  <VerificationStatusLabel status={selectedScan.verificationStatus} />
                  <span className="text-slate-300">·</span>
                  <ExpiryStatusLabel status={selectedScan.expiryStatus} />
                </div>
                <h4 className="font-display text-lg font-bold text-[#0B1B2B]">
                  {selectedScan.medicineName}
                </h4>
                <p className="text-slate-500 font-mono mt-0.5">ID: {selectedScan.id}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-slate-500">Generic</p>
                  <p className="font-medium text-[#0B1B2B]">{selectedScan.genericName || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Manufacturer</p>
                  <p className="font-medium text-[#0B1B2B]">{selectedScan.manufacturer || '—'}</p>
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
              </div>
              <div>
                <p className="text-slate-500 font-semibold">Source & Evidence</p>
                <p className="text-slate-700 mt-0.5 leading-relaxed">
                  {selectedScan.sourceName} — {selectedScan.sourceEvidence}
                </p>
              </div>
              {selectedScan.safetyNotices && (
                <div>
                  <p className="text-slate-500 font-semibold">Safety Notices</p>
                  <p className="text-slate-700 mt-0.5 leading-relaxed">
                    {selectedScan.safetyNotices}
                  </p>
                </div>
              )}
              {selectedScan.nextStep && (
                <div>
                  <p className="text-slate-500 font-semibold">Recommended Next Step</p>
                  <p className="font-medium text-[#0B1B2B] mt-0.5 leading-relaxed">
                    {selectedScan.nextStep}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Account & Privacy Settings */}
      <form
        onSubmit={handleSavePreferences}
        className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-4"
      >
        <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
          Account & Language Preferences
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Display Name</label>
            <input
              type="text"
              maxLength={120}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Default Assistant Language
            </label>
            <select
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value as PreferredLanguage)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
            >
              <option value="en">English</option>
              <option value="hi">Hindi (हिन्दी)</option>
              <option value="hinglish">Hinglish</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">
            Records are strictly isolated to UID {profile?.uid.slice(0, 10)}...
          </span>
          <div className="flex items-center gap-3">
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Saved</span>
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
