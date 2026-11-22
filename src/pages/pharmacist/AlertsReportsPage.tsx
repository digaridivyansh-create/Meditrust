import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  ShieldAlert,
  Sliders,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { FeatureSpotlight, MEDIA_ASSETS } from '../../components/EditorialMedia';
import { CLINICAL_QUOTES } from '../../lib/i18n';
import {
  createSafetyAlert,
  logAuditEvent,
  updateAlertStatus,
} from '../../lib/firestoreService';
import {
  computeExpiryStatus,
  downloadTextFile,
  formatTimestamp,
  toCsv,
} from '../../lib/utils';
import type { RecallNotice } from '../../types';

export function AlertsReportsPage() {
  const { user, profile, data, updateProfileFields } = useAuth();
  const { t } = useLanguage();
  const [nearDays, setNearDays] = useState(String(profile?.nearExpiryDays || 90));
  const [savingConfig, setSavingConfig] = useState(false);
  const [screening, setScreening] = useState(false);
  const [screenResults, setScreenResults] = useState<
    Array<{ medicineName: string; batchNumber: string; recalls: RecallNotice[] }>
  >([]);
  const [screenNotice, setScreenNotice] = useState('');

  const pharmacyAlerts = data.alerts.filter((a) => a.portalRole === 'pharmacist');

  const handleSaveThreshold = async () => {
    const days = Math.min(365, Math.max(7, Math.round(Number(nearDays) || 90)));
    setSavingConfig(true);
    try {
      await updateProfileFields({ nearExpiryDays: days });
      setNearDays(String(days));
    } finally {
      setSavingConfig(false);
    }
  };

  // Screen active inventory medicines against live openFDA Recall API
  const handleRunRecallScreen = async () => {
    if (!user || data.batches.length === 0) return;
    setScreening(true);
    setScreenNotice('');
    setScreenResults([]);
    try {
      const uniqueBatches = data.batches.slice(0, 6);
      const hits: Array<{ medicineName: string; batchNumber: string; recalls: RecallNotice[] }> = [];

      for (const batch of uniqueBatches) {
        const res = await fetch(`/api/v1/recalls?q=${encodeURIComponent(batch.medicineName)}`);
        const json = await res.json();
        if (res.ok && json.available && Array.isArray(json.recalls) && json.recalls.length > 0) {
          hits.push({
            medicineName: batch.medicineName,
            batchNumber: batch.batchNumber,
            recalls: json.recalls.slice(0, 2),
          });
          await createSafetyAlert({
            ownerId: user.uid,
            portalRole: 'pharmacist',
            alertType: 'recall',
            severity: 'critical',
            title: `Recall Feed Match: ${batch.medicineName}`,
            triggerDetails: `${json.recalls[0].recallNumber} (${json.recalls[0].classification}): ${json.recalls[0].reasonForRecall}`,
            affectedProduct: batch.medicineName,
            affectedBatch: batch.batchNumber,
            sourceReference: 'openFDA Drug Enforcement API',
          });
        }
      }

      setScreenResults(hits);
      setScreenNotice(
        hits.length > 0
          ? `Screened ${uniqueBatches.length} active batch(es) against live openFDA recalls: ${hits.length} product name match(es) found—verify exact lot numbers.`
          : `Screened ${uniqueBatches.length} active batch(es) against live openFDA recalls: zero recall matches found at ${new Date().toLocaleTimeString()}.`
      );

      await logAuditEvent({
        ownerId: user.uid,
        portalRole: 'pharmacist',
        actorName: profile?.displayName || 'Pharmacist',
        action: 'INVENTORY_RECALL_SCREEN',
        targetType: 'inventory_batch',
        targetId: 'batch_screen',
        details: `Screened ${uniqueBatches.length} active batches against live openFDA Enforcement API; ${hits.length} match(es).`,
      });
    } finally {
      setScreening(false);
    }
  };

  const exportReport = async (
    reportType: 'inventory' | 'near_expiry' | 'ledger' | 'audit'
  ) => {
    if (!user) return;
    const days = profile?.nearExpiryDays || 90;
    let filename = '';
    let csv = '';

    if (reportType === 'inventory') {
      filename = `meditrust-inventory-report-${Date.now()}.csv`;
      csv = toCsv(
        data.batches.map((b) => ({
          batchId: b.id,
          medicineName: b.medicineName,
          manufacturer: b.manufacturer,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          expiryStatus: computeExpiryStatus(b.expiryDate, days),
          supplierName: b.supplierName,
          invoiceRef: b.invoiceRef || '',
          quantityOnHand: b.quantityOnHand,
          reorderThreshold: b.reorderThreshold,
          unitPrice: b.unitPrice,
          valuation: b.quantityOnHand * b.unitPrice,
          verificationStatus: b.verificationStatus,
          recallFlagged: b.recallFlagged,
        }))
      );
    } else if (reportType === 'near_expiry') {
      filename = `meditrust-near-expiry-report-${Date.now()}.csv`;
      const flagged = data.batches.filter((b) => {
        const s = computeExpiryStatus(b.expiryDate, days);
        return s === 'expired' || s === 'near_expiry';
      });
      csv = toCsv(
        flagged.map((b) => ({
          medicineName: b.medicineName,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          status: computeExpiryStatus(b.expiryDate, days),
          quantityOnHand: b.quantityOnHand,
          supplierName: b.supplierName,
        }))
      );
    } else if (reportType === 'ledger') {
      filename = `meditrust-stock-ledger-${Date.now()}.csv`;
      csv = toCsv(
        data.ledger.map((l) => ({
          entryId: l.id,
          timestamp: formatTimestamp(l.createdAt),
          movementType: l.movementType,
          medicineName: l.medicineName,
          batchNumber: l.batchNumber,
          quantityDelta: l.quantityDelta,
          resultingBalance: l.resultingBalance,
          reason: l.reason,
          invoiceRef: l.invoiceRef || '',
          actorName: l.actorName,
        }))
      );
    } else {
      filename = `meditrust-audit-trail-${Date.now()}.csv`;
      csv = toCsv(
        data.auditEvents.map((a) => ({
          auditId: a.id,
          timestamp: formatTimestamp(a.createdAt),
          portalRole: a.portalRole,
          actorName: a.actorName,
          action: a.action,
          targetType: a.targetType,
          targetId: a.targetId,
          details: a.details,
        }))
      );
    }

    if (!csv) {
      setScreenNotice('No records available yet for that report.');
      return;
    }

    downloadTextFile(filename, csv);
    await logAuditEvent({
      ownerId: user.uid,
      portalRole: 'pharmacist',
      actorName: profile?.displayName || 'Pharmacist',
      action: 'COMPLIANCE_REPORT_EXPORTED',
      targetType: 'report',
      targetId: reportType,
      details: `Exported ${reportType} CSV (${filename}).`,
    });
  };

  return (
    <div className="space-y-8">
      <div className="pb-5 border-b border-slate-200">
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
          {t(
            'Alerts, Live Recall Screening & Compliance Reports',
            'अलर्ट, लाइव रिकॉल स्क्रीनिंग और अनुपालन रिपोर्ट'
          )}
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          {t(
            'Configure near-expiry warning thresholds, screen active stock against openFDA recalls, export auditable CSV reports, and inspect the immutable compliance audit trail.',
            'नज़दीकी एक्सपायरी सीमा तय करें, सक्रिय स्टॉक की openFDA रिकॉल जाँच करें, CSV रिपोर्ट डाउनलोड करें और स्थायी ऑडिट ट्रेल देखें।'
          )}
        </p>
      </div>

      <FeatureSpotlight
        imageSrc={MEDIA_ASSETS.heroVerification}
        imageAlt="Clinical pharmacist auditing compliance reports and recall checks"
        {...CLINICAL_QUOTES.features.reports}
        compact
      />

      {/* Controls Row: Threshold Config + Recall Screener */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-[#0D7377]">
            <Sliders className="w-4 h-4" />
            <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
              Near-Expiry Alert Threshold
            </h3>
          </div>
          <p className="text-xs text-slate-600">
            Batches expiring within this number of days are flagged as Near Expiry across your
            dashboard and reports.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={7}
              max={365}
              value={nearDays}
              onChange={(e) => setNearDays(e.target.value)}
              className="w-28 px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
            />
            <span className="text-xs text-slate-500">days</span>
            <button
              type="button"
              disabled={savingConfig}
              onClick={() => void handleSaveThreshold()}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1B2B] rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              {savingConfig ? 'Saving...' : 'Update Rule'}
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                Live openFDA Inventory Recall Screening
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Cross-check active pharmacy SKUs against official US FDA enforcement notices.
              </p>
            </div>
            <button
              type="button"
              disabled={screening || data.batches.length === 0}
              onClick={() => void handleRunRecallScreen()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${screening ? 'animate-spin' : ''}`} />
              <span>{screening ? 'Screening Stock...' : 'Run Live Recall Screen'}</span>
            </button>
          </div>

          {screenNotice && (
            <p className="text-xs text-slate-700 bg-[#F8FAFC] border border-slate-200 rounded-lg p-3">
              {screenNotice}
            </p>
          )}

          {screenResults.length > 0 && (
            <div className="space-y-2">
              {screenResults.map((hit) => (
                <div
                  key={`${hit.batchNumber}-${hit.medicineName}`}
                  className="p-3 rounded-lg bg-rose-50/70 border border-rose-200 text-xs"
                >
                  <p className="font-semibold text-rose-900">
                    {hit.medicineName} (Batch {hit.batchNumber})
                  </p>
                  <p className="text-rose-800 mt-0.5">
                    {hit.recalls[0].recallNumber} · {hit.recalls[0].reasonForRecall}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Downloadable Compliance Reports */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="mb-4">
          <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
            Permission-Checked CSV Reports
          </h3>
          <p className="text-xs text-slate-500">
            Every export is scoped strictly to your pharmacy workspace and recorded in the audit
            trail.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(
            [
              { id: 'inventory', label: 'Full Stock & Valuation', count: data.batches.length },
              {
                id: 'near_expiry',
                label: 'Near-Expiry & Expired',
                count: data.batches.filter((b) => {
                  const s = computeExpiryStatus(b.expiryDate, profile?.nearExpiryDays || 90);
                  return s === 'expired' || s === 'near_expiry';
                }).length,
              },
              { id: 'ledger', label: 'Immutable Stock Ledger', count: data.ledger.length },
              { id: 'audit', label: 'Compliance Audit Log', count: data.auditEvents.length },
            ] as const
          ).map((rep) => (
            <button
              key={rep.id}
              type="button"
              onClick={() => void exportReport(rep.id)}
              className="text-left p-4 rounded-xl border border-slate-200 hover:border-[#0D7377] hover:bg-slate-50/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <Download className="w-4 h-4 text-[#0D7377]" />
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  {rep.count} rows
                </span>
              </div>
              <p className="text-sm font-semibold text-[#0B1B2B]">{rep.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">Download CSV</p>
            </button>
          ))}
        </div>
      </section>

      {/* Active Pharmacy Alerts */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
            Pharmacy Operational Alerts ({pharmacyAlerts.length})
          </h3>
          <span className="text-xs text-slate-500">Terminal state locked upon resolution</span>
        </div>

        {pharmacyAlerts.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No pharmacy expiry, low-stock, or recall alerts triggered yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pharmacyAlerts.map((alert) => (
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
                    <p className="text-xs text-slate-600 mt-0.5">{alert.triggerDetails}</p>
                    <p className="font-mono text-[11px] text-slate-400 mt-1">
                      {alert.alertType.toUpperCase()} · Batch {alert.affectedBatch || 'N/A'} ·{' '}
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
                      Resolve
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

      {/* Immutable Audit Trail */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
            Immutable Audit Event Log ({data.auditEvents.length})
          </h3>
          <span className="font-mono text-xs text-slate-500">Append-Only</span>
        </div>

        {data.auditEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No audit events recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F8FAFC] text-xs font-semibold text-slate-500">
                  <th className="py-3 px-5">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {data.auditEvents.slice(0, 25).map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-5 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                      {formatTimestamp(ev.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#0B1B2B] whitespace-nowrap">
                      {ev.actorName}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#0D7377] font-semibold whitespace-nowrap">
                      {ev.action}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {ev.targetType}:{ev.targetId.slice(0, 12)}
                    </td>
                    <td className="py-3 px-5 text-slate-600">{ev.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
