import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Plus,
  Search,
  Trash2,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { FeatureSpotlight, MEDIA_ASSETS } from '../../components/EditorialMedia';
import { CLINICAL_QUOTES } from '../../lib/i18n';
import {
  createPrescription,
  deletePrescription,
  logAuditEvent,
  logPrescriptionDose,
  saveVerifiedDocument,
  updatePrescriptionStatus,
} from '../../lib/firestoreService';
import { fileToBase64AndHash, formatTimestamp } from '../../lib/utils';
import type { Prescription } from '../../types';

export function PrescriptionTrackerPage() {
  const { user, profile, data } = useAuth();
  const { t } = useLanguage();
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'paused' | 'flagged'>('all');
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const [medicineName, setMedicineName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('Twice daily after meals');
  const [prescriberName, setPrescriberName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [linkedBatchNumber, setLinkedBatchNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const filtered = data.prescriptions.filter((rx) => {
    if (filter !== 'all' && rx.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        rx.medicineName.toLowerCase().includes(q) ||
        (rx.prescriberName || '').toLowerCase().includes(q) ||
        (rx.linkedBatchNumber || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleAddPrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg('');
    setSuccessMsg('');
    setSaving(true);
    try {
      const id = await createPrescription({
        ownerId: user.uid,
        medicineName,
        dosage,
        frequency,
        prescriberName,
        clinicName,
        issueDate,
        endDate,
        linkedBatchNumber,
        notes,
        status: 'active',
      });
      await logAuditEvent({
        ownerId: user.uid,
        portalRole: 'patient',
        actorName: profile?.displayName || 'Patient',
        action: 'PRESCRIPTION_ADDED',
        targetType: 'prescription',
        targetId: id,
        details: `Added prescription for ${medicineName} (${dosage}, ${frequency}).`,
      });
      setMedicineName('');
      setDosage('');
      setPrescriberName('');
      setClinicName('');
      setEndDate('');
      setLinkedBatchNumber('');
      setNotes('');
      setShowAddForm(false);
      setSuccessMsg('Prescription saved to your personal tracker.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save prescription.');
    } finally {
      setSaving(false);
    }
  };

  // Real AI Prescription Import from Image/PDF
  const handleImportPrescriptionFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setErrorMsg('');
    setSuccessMsg('');
    setImporting(true);
    try {
      const { base64, sha256 } = await fileToBase64AndHash(file);
      const res = await fetch('/api/v1/documents/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType: file.type,
          fileName: file.name,
          documentType: 'prescription',
          sha256Hash: sha256,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not parse uploaded prescription.');

      await saveVerifiedDocument({
        ownerId: user.uid,
        portalRole: 'patient',
        documentTitle: json.documentTitle || file.name,
        documentType: 'prescription',
        fileName: file.name,
        fileMimeType: file.type,
        sha256Hash: sha256,
        issuerName: json.issuerName,
        documentDate: json.documentDate,
        extractedSummary: json.extractedSummary,
        extractedEntities: json.extractedEntities,
        anomalies: json.anomalies,
        verificationStatus: json.verificationStatus || 'needs_review',
        confidenceLevel: json.confidenceLevel || 'medium',
      });

      const meds = Array.isArray(json.prescribedMedicines) ? json.prescribedMedicines : [];
      if (meds.length === 0) {
        setSuccessMsg(
          'Prescription document fingerprinted and saved to Document Verification. No individual dosage lines were detected automatically—add them manually below.'
        );
        setShowAddForm(true);
      } else {
        for (const med of meds.slice(0, 8)) {
          if (med.medicineName) {
            await createPrescription({
              ownerId: user.uid,
              medicineName: med.medicineName,
              dosage: med.dosage || 'As directed',
              frequency: med.frequency || 'Per prescription',
              prescriberName: json.issuerName || '',
              issueDate: json.documentDate || new Date().toISOString().slice(0, 10),
              sourceDocumentHash: sha256,
              notes: 'Extracted via MediTrust Document OCR — verify against physical prescription.',
              status: 'active',
            });
          }
        }
        setSuccessMsg(
          `Extracted and added ${Math.min(meds.length, 8)} medicine(s) from "${file.name}" with SHA-256 fingerprint.`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to import prescription file.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleStatusChange = async (rx: Prescription, status: Prescription['status']) => {
    await updatePrescriptionStatus(rx.id, { status });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
            {t('Prescription Tracking Dashboard', 'पर्चा एवं खुराक ट्रैकिंग डैशबोर्ड')}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {t(
              'Organize prescribed medicines, log daily adherence doses, link scanned batch numbers, or auto-extract prescriptions from a photo or PDF.',
              'डॉक्टर द्वारा लिखी दवाइयाँ व्यवस्थित करें, दैनिक खुराक दर्ज करें, बैच नंबर जोड़ें या फोटो/PDF से पर्चा स्वतः निकालें।'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap">
            {importing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0D7377]" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-[#0D7377]" />
            )}
            <span>
              {importing
                ? t('Extracting Prescription...', 'पर्चा पढ़ा जा रहा है...')
                : t('Import Prescription (Photo / PDF)', 'पर्चा अपलोड करें (फोटो / PDF)')}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={importing}
              onChange={(e) => void handleImportPrescriptionFile(e)}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('Add Prescription', 'नया पर्चा जोड़ें')}</span>
          </button>
        </div>
      </div>

      <FeatureSpotlight
        imageSrc={MEDIA_ASSETS.patientCare}
        imageAlt="Organizing daily prescription records and medicine strips at home"
        {...CLINICAL_QUOTES.features.prescriptions}
        compact
      />

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Add Prescription Panel */}
      {showAddForm && (
        <form
          onSubmit={handleAddPrescription}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
              New Prescription Record
            </h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-500 hover:text-[#0B1B2B] cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Medicine Name *
              </label>
              <input
                type="text"
                required
                maxLength={180}
                value={medicineName}
                onChange={(e) => setMedicineName(e.target.value)}
                placeholder="e.g., Metformin Hydrochloride"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Dosage *</label>
              <input
                type="text"
                required
                maxLength={120}
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                placeholder="e.g., 500 mg tablet"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Schedule / Frequency *
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="e.g., Once daily after breakfast"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Prescribing Clinician
              </label>
              <input
                type="text"
                maxLength={140}
                value={prescriberName}
                onChange={(e) => setPrescriberName(e.target.value)}
                placeholder="Dr. Meera Nair"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Clinic / Hospital
              </label>
              <input
                type="text"
                maxLength={160}
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder="City Health Outpatient Clinic"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Linked Pack Batch No.
              </label>
              <input
                type="text"
                maxLength={80}
                value={linkedBatchNumber}
                onChange={(e) => setLinkedBatchNumber(e.target.value)}
                placeholder="Optional batch number"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Date</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Refill / End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
              <input
                type="text"
                maxLength={800}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Take with water; avoid skipping"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Prescription'}
            </button>
          </div>
        </form>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(['all', 'active', 'completed', 'paused', 'flagged'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize whitespace-nowrap transition-colors cursor-pointer ${
                filter === tab
                  ? 'bg-white text-[#0B1B2B] shadow-xs'
                  : 'text-slate-600 hover:text-[#0B1B2B]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicine, doctor, batch..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
          />
        </div>
      </div>

      {/* Prescription Table / List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#0B1B2B]">No prescriptions found</p>
            <p className="text-xs text-slate-500 mt-1">
              Add your active prescriptions manually or upload a prescription image/PDF for
              structured extraction.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F8FAFC] text-xs font-semibold text-slate-500">
                  <th className="py-3 px-5">Medicine & Dosage</th>
                  <th className="py-3 px-4">Prescriber</th>
                  <th className="py-3 px-4">Batch / Ref</th>
                  <th className="py-3 px-4">Adherence</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((rx) => (
                  <tr key={rx.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-5">
                      <p className="font-semibold text-[#0B1B2B]">{rx.medicineName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {rx.dosage} · {rx.frequency}
                      </p>
                      {rx.notes && <p className="text-xs text-slate-500 mt-1">{rx.notes}</p>}
                    </td>
                    <td className="py-4 px-4 text-xs text-slate-600">
                      <p className="font-medium text-[#0B1B2B]">{rx.prescriberName || '—'}</p>
                      <p className="text-slate-500">{rx.clinicName || rx.issueDate || ''}</p>
                    </td>
                    <td className="py-4 px-4 font-mono text-xs text-slate-600">
                      {rx.linkedBatchNumber || 'Unlinked'}
                      {rx.endDate && (
                        <p className="text-[11px] text-slate-400 mt-0.5">Until {rx.endDate}</p>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <p className="font-mono text-xs font-semibold text-[#0B1B2B] tabular-nums">
                        {rx.adherenceCount} doses
                      </p>
                      {rx.lastTakenAt && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Last: {formatTimestamp(rx.lastTakenAt)}
                        </p>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <select
                        value={rx.status}
                        onChange={(e) =>
                          void handleStatusChange(rx, e.target.value as Prescription['status'])
                        }
                        className="text-xs font-semibold bg-white border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:border-[#0D7377]"
                      >
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                        <option value="flagged">Flagged</option>
                      </select>
                    </td>
                    <td className="py-4 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        {rx.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => void logPrescriptionDose(rx.id, rx.adherenceCount)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#0D7377] bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Log Dose</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void deletePrescription(rx.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-700 transition-colors cursor-pointer"
                          aria-label={`Delete ${rx.medicineName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
