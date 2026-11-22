import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  RefreshCw,
  Search,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { FeatureSpotlight, MEDIA_ASSETS } from '../../components/EditorialMedia';
import { CLINICAL_QUOTES } from '../../lib/i18n';
import { updateAlertStatus } from '../../lib/firestoreService';
import { formatTimestamp } from '../../lib/utils';
import type { RecallNotice } from '../../types';

export function SafetyRecallsPage() {
  const { data } = useAuth();
  const { t } = useLanguage();
  const [recallQuery, setRecallQuery] = useState('');
  const [recalls, setRecalls] = useState<RecallNotice[]>([]);
  const [recallsLoading, setRecallsLoading] = useState(false);
  const [recallsError, setRecallsError] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');

  const patientAlerts = data.alerts.filter((a) => a.portalRole === 'patient');

  const loadRecalls = async (q: string) => {
    setRecallsLoading(true);
    setRecallsError('');
    try {
      const url = q.trim()
        ? `/api/v1/recalls?q=${encodeURIComponent(q.trim())}`
        : '/api/v1/recalls';
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || !json.available) {
        throw new Error(json.error || 'openFDA recall service temporarily unavailable.');
      }
      setRecalls(json.recalls || []);
      setFetchedAt(json.fetchedAt || '');
    } catch (err) {
      setRecallsError(err instanceof Error ? err.message : 'Unable to fetch recall notices.');
      setRecalls([]);
    } finally {
      setRecallsLoading(false);
    }
  };

  useEffect(() => {
    void loadRecalls('');
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadRecalls(recallQuery);
  };

  return (
    <div className="space-y-8">
      <div className="pb-5 border-b border-slate-200">
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
          {t('Safety Alerts & Official Recall Monitor', 'सुरक्षा अलर्ट और आधिकारिक रिकॉल मॉनिटर')}
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          {t(
            'Review alerts triggered by your scanned packs or documents, and query live official openFDA drug recall enforcement notices.',
            'अपने स्कैन किए गए पैक या दस्तावेज़ों से जुड़े अलर्ट देखें, और लाइव आधिकारिक openFDA दवा रिकॉल सूचनाएँ खोजें।'
          )}
        </p>
      </div>

      <FeatureSpotlight
        imageSrc={MEDIA_ASSETS.packScanner}
        imageAlt="Inspecting medicine batch labels for safety alerts and recalls"
        {...CLINICAL_QUOTES.features.recalls}
        compact
      />

      {/* Personal Alerts */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#0D7377]" />
            <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
              Your Account Safety Alerts ({patientAlerts.length})
            </h3>
          </div>
          <span className="text-xs text-slate-500">Resolved alerts are locked for audit history</span>
        </div>

        {patientAlerts.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No personal expiry, mismatch, or document alerts have been triggered on your account.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {patientAlerts.map((alert) => (
              <div
                key={alert.id}
                className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {alert.severity === 'critical' ? (
                    <ShieldAlert className="w-4 h-4 text-rose-700 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0B1B2B]">{alert.title}</p>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {alert.triggerDetails}
                    </p>
                    <p className="font-mono text-[11px] text-slate-400 mt-1.5">
                      Status: {alert.status.toUpperCase()} · Batch: {alert.affectedBatch || 'N/A'} ·{' '}
                      {formatTimestamp(alert.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {alert.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => void updateAlertStatus(alert.id, 'acknowledged')}
                      className="px-3 py-1.5 text-xs font-semibold text-[#0B1B2B] border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Acknowledge
                    </button>
                  )}
                  {alert.status !== 'resolved' ? (
                    <button
                      type="button"
                      onClick={() => void updateAlertStatus(alert.id, 'resolved')}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] cursor-pointer"
                    >
                      Mark Resolved
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Resolved</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Live openFDA Recall Feed */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
              Live openFDA Drug Recall & Enforcement Feed
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Source: Official US FDA Enforcement API{' '}
              {fetchedAt ? `· Fetched ${new Date(fetchedAt).toLocaleTimeString()}` : ''}
            </p>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={recallQuery}
                onChange={(e) => setRecallQuery(e.target.value)}
                placeholder="Search medicine name or lot number..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>
            <button
              type="submit"
              disabled={recallsLoading}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1B2B] rounded-lg hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              Search Feed
            </button>
          </form>
        </div>

        {recallsLoading ? (
          <div className="p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#0D7377]" />
            <span>Querying live openFDA enforcement registry...</span>
          </div>
        ) : recallsError ? (
          <div className="p-8 text-center text-xs text-indigo-900 bg-indigo-50/50 flex flex-col items-center gap-2">
            <WifiOff className="w-5 h-5 text-indigo-700" />
            <p className="font-semibold">Provider Unavailable</p>
            <p className="max-w-md text-slate-600">{recallsError}</p>
          </div>
        ) : recalls.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No FDA enforcement notices matched &ldquo;{recallQuery}&rdquo;. Note that openFDA covers
            US FDA actions and does not include regional CDSCO notices.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recalls.map((rec) => (
              <div key={rec.recallNumber} className="px-6 py-4 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500">
                  <span className="font-semibold text-rose-700">{rec.recallNumber}</span>
                  <span>·</span>
                  <span>{rec.classification}</span>
                  <span>·</span>
                  <span>{rec.status}</span>
                  <span>·</span>
                  <span>Reported {rec.reportDate}</span>
                </div>
                <p className="text-sm font-semibold text-[#0B1B2B]">{rec.recallingFirm}</p>
                <p className="text-xs text-slate-700 leading-relaxed">{rec.productDescription}</p>
                <p className="text-xs text-rose-800 leading-relaxed">
                  <strong>Reason:</strong> {rec.reasonForRecall}
                </p>
                {rec.codeInfo && (
                  <p className="text-[11px] font-mono text-slate-500">Lots / Codes: {rec.codeInfo}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
