import {
  ArrowRight,
  Bell,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  MessageSquareText,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { ExpiryStatusLabel, VerificationStatusLabel } from '../../components/StatusIndicator';
import { FeatureSpotlight, MEDIA_ASSETS } from '../../components/EditorialMedia';
import { CLINICAL_QUOTES } from '../../lib/i18n';
import { formatTimestamp } from '../../lib/utils';
import { logPrescriptionDose } from '../../lib/firestoreService';
import { useState } from 'react';

export function PatientDashboardPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { profile, data } = useAuth();
  const { t } = useLanguage();
  const [loggingId, setLoggingId] = useState<string | null>(null);

  const patientScans = data.scans.filter((s) => s.portalRole === 'patient');
  const activeRx = data.prescriptions.filter((p) => p.status === 'active');
  const patientDocs = data.documents.filter((d) => d.portalRole === 'patient');
  const openAlerts = data.alerts.filter(
    (a) => a.portalRole === 'patient' && a.status !== 'resolved'
  );

  const handleQuickDose = async (rxId: string, count: number) => {
    setLoggingId(rxId);
    try {
      await logPrescriptionDose(rxId, count);
    } finally {
      setLoggingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Greeting Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-[#0D7377] mb-1">
            {t('Personal Medicine Safety Overview', 'व्यक्तिगत दवा सुरक्षा अवलोकन')}
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
            {t('Welcome back,', 'वापसी पर स्वागत है,')} {profile?.displayName}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {t(
              'Inspect medicine packs, track active prescriptions, and verify medical documents with source-backed evidence.',
              'दवा पैक की जाँच करें, सक्रिय पर्चे ट्रैक करें और प्रमाण-आधारित तथ्यों के साथ मेडिकल दस्तावेज़ सत्यापित करें।'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('scanner')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>{t('Scan Medicine Pack', 'दवा पैक स्कैन करें')}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('assistant')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <MessageSquareText className="w-4 h-4 text-[#0D7377]" />
            <span>{t('Ask AI Assistant', 'एआई सहायक से पूछें')}</span>
          </button>
        </div>
      </div>

      {/* Editorial Visual & Clinical Quote */}
      <FeatureSpotlight
        imageSrc={MEDIA_ASSETS.patientCare}
        imageAlt="Family caregiver and elder organizing prescription medicines at home"
        {...CLINICAL_QUOTES.features.patientDashboard}
        compact
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <button
          type="button"
          onClick={() => onNavigate('scanner')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <p className="text-xs font-medium text-slate-500">
            {t('Medicine Scans Logged', 'दर्ज दवा स्कैन')}
          </p>
          <p className="font-mono text-3xl font-semibold text-[#0B1B2B] tabular-nums mt-2">
            {patientScans.length}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {patientScans.filter((s) => s.verificationStatus === 'mismatch_suspicious').length}{' '}
            {t('flagged for attention', 'ध्यान देने हेतु चिह्नित')}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('prescriptions')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <p className="text-xs font-medium text-slate-500">
            {t('Active Prescriptions', 'सक्रिय पर्चे')}
          </p>
          <p className="font-mono text-3xl font-semibold text-[#0B1B2B] tabular-nums mt-2">
            {activeRx.length}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {data.prescriptions.reduce((acc, p) => acc + (p.adherenceCount || 0), 0)}{' '}
            {t('total doses recorded', 'कुल खुराक दर्ज')}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('documents')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <p className="text-xs font-medium text-slate-500">
            {t('Verified Documents', 'सत्यापित दस्तावेज़')}
          </p>
          <p className="font-mono text-3xl font-semibold text-[#0B1B2B] tabular-nums mt-2">
            {patientDocs.length}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {t('SHA-256 fingerprinted records', 'SHA-256 फिंगरप्रिंट रिकॉर्ड')}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('alerts')}
          className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <p className="text-xs font-medium text-slate-500">
            {t('Open Safety Alerts', 'सक्रिय सुरक्षा अलर्ट')}
          </p>
          <p
            className={`font-mono text-3xl font-semibold tabular-nums mt-2 ${
              openAlerts.length > 0 ? 'text-rose-700' : 'text-[#0B1B2B]'
            }`}
          >
            {openAlerts.length}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {t('Expiry, mismatch & recall notices', 'एक्सपायरी, विसंगति एवं रिकॉल नोटिस')}
          </p>
        </button>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Recent Medicine Scans */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                Recent Medicine Scans
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Every record retains source provenance and expiry evaluation
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D7377] hover:underline whitespace-nowrap cursor-pointer"
            >
              <span>Full history</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {patientScans.length === 0 ? (
            <div className="p-10 text-center">
              <Camera className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-[#0B1B2B]">No medicine scans yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Capture or upload a medicine carton, blister pack, or label to extract fields and
                check openFDA drug labeling and recalls.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('scanner')}
                className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors cursor-pointer"
              >
                Start First Scan
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {patientScans.slice(0, 5).map((scan) => (
                <div
                  key={scan.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0B1B2B] truncate">
                      {scan.medicineName}
                      {scan.strength ? ` · ${scan.strength}` : ''}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                      Batch {scan.batchNumber || 'Unrecorded'} · Exp {scan.expiryDate || 'Unknown'} ·{' '}
                      {formatTimestamp(scan.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col sm:items-end gap-1 shrink-0">
                    <VerificationStatusLabel status={scan.verificationStatus} compact />
                    <ExpiryStatusLabel status={scan.expiryStatus} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Active Prescriptions & Safety Alerts */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-[#0D7377]" />
                <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                  Active Prescriptions
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('prescriptions')}
                className="text-xs font-semibold text-[#0D7377] hover:underline cursor-pointer"
              >
                Manage all
              </button>
            </div>

            {activeRx.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-slate-500 mb-3">
                  No active prescriptions tracked yet. Add manually or parse a prescription PDF/photo.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('prescriptions')}
                  className="px-3.5 py-2 text-xs font-semibold text-[#0B1B2B] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Open Prescription Tracker
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeRx.slice(0, 4).map((rx) => (
                  <div key={rx.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0B1B2B] truncate">
                        {rx.medicineName}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {rx.dosage} · {rx.frequency} ·{' '}
                        <span className="font-mono tabular-nums">{rx.adherenceCount} logged</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={loggingId === rx.id}
                      onClick={() => void handleQuickDose(rx.id, rx.adherenceCount)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0D7377] bg-teal-50/70 border border-teal-200 rounded-lg hover:bg-teal-100/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{loggingId === rx.id ? 'Saving...' : 'Log Dose'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-rose-700" />
                <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                  Active Safety Alerts
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('alerts')}
                className="text-xs font-semibold text-[#0D7377] hover:underline cursor-pointer"
              >
                View recalls
              </button>
            </div>

            {openAlerts.length === 0 ? (
              <div className="p-6 text-xs text-slate-500">
                No open safety alerts on your account. You can search live openFDA recall notices on
                the Safety & Recalls page.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {openAlerts.slice(0, 3).map((alert) => (
                  <div key={alert.id} className="px-6 py-4 flex items-start gap-3">
                    <ShieldAlert
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        alert.severity === 'critical' ? 'text-rose-700' : 'text-amber-700'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#0B1B2B]">{alert.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                        {alert.triggerDetails}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <FileCheck2 className="w-5 h-5 text-[#0D7377] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#0B1B2B]">Verify a Document or Leaflet</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload prescriptions, pharmacy bills, or leaflets for SHA-256 hashing & OCR.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('documents')}
              className="px-3.5 py-2 text-xs font-semibold text-[#0B1B2B] border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
