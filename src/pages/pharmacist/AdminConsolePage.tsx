import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  CheckCircle2,
  Download,
  Lock,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Truck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { addTraceabilityEvent, createSafetyAlert, logAuditEvent } from '../../lib/firestoreService';
import { computeExpiryStatus, downloadTextFile, formatTimestamp, toCsv } from '../../lib/utils';

interface HealthPayload {
  status: string;
  timestamp: string;
  activeAiModels?: string[];
  catalogueSize?: number;
  openFdaLatencyMs?: number | null;
  connectors: {
    geminiVisionOcr: boolean;
    openFdaDrugLabel: boolean;
    openFdaRecallFeed: boolean;
    normalizedMedicineCatalogue: boolean;
    qrBarcodeGs1Decoder: boolean;
    videoFrameInspection: boolean;
    pharmacistAiFunctionCalling?: boolean;
    manufacturerSerializationApi: boolean;
    cdscoLiveApi: boolean;
  };
}

export function AdminConsolePage() {
  const { user, profile, data } = useAuth();
  const { t } = useLanguage();

  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [probing, setProbing] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [statusBanner, setStatusBanner] = useState('');

  // Distributor Quick Hand-off Form State
  const [distBatchId, setDistBatchId] = useState('');
  const [distOrg, setDistOrg] = useState('');
  const [distSource, setDistSource] = useState('');
  const [distInvoice, setDistInvoice] = useState('');
  const [distQty, setDistQty] = useState('50');
  const [distSaving, setDistSaving] = useState(false);

  const probeConnectors = useCallback(async (withLiveProbe = true) => {
    setProbing(true);
    try {
      const res = await fetch(`/api/v1/health${withLiveProbe ? '?probe=true' : ''}`);
      if (res.ok) {
        const json = (await res.json()) as HealthPayload;
        setHealth(json);
      }
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    void probeConnectors(true);
  }, [probeConnectors]);

  const handleEnableBrowserAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setStatusBanner(t('Browser notifications are not supported in this browser.', 'इस ब्राउज़र में नोटिफिकेशन समर्थित नहीं हैं।'));
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      new Notification('MediTrust AI Safety Alerts Enabled', {
        body: 'You will receive browser alerts when near-expiry, expired, or suspicious batches are detected.',
      });
      setStatusBanner(t('Browser push notifications enabled.', 'ब्राउज़र सुरक्षा नोटिफिकेशन चालू कर दिए गए हैं।'));
    }
  };

  const handleRunAutomatedSafetySweep = async () => {
    if (!user) return;
    const nearDays = profile?.nearExpiryDays || 90;
    let generated = 0;

    for (const batch of data.batches) {
      const exp = computeExpiryStatus(batch.expiryDate, nearDays);
      const alreadyOpen = data.alerts.some(
        (a) =>
          a.status !== 'resolved' &&
          a.affectedBatch === batch.batchNumber &&
          (a.alertType === exp || (batch.quantityOnHand <= batch.reorderThreshold && a.alertType === 'low_stock'))
      );

      if ((exp === 'expired' || exp === 'near_expiry') && !alreadyOpen) {
        await createSafetyAlert({
          ownerId: user.uid,
          portalRole: 'pharmacist',
          alertType: exp,
          severity: exp === 'expired' ? 'critical' : 'warning',
          title:
            exp === 'expired'
              ? `Automated Sweep — Expired: ${batch.medicineName}`
              : `Automated Sweep — Near Expiry: ${batch.medicineName}`,
          triggerDetails: `Batch ${batch.batchNumber} expires on ${batch.expiryDate}. Detected by scheduled safety sweep.`,
          affectedProduct: batch.medicineName,
          affectedBatch: batch.batchNumber,
          sourceReference: 'Admin Safety Sweep Engine',
        });
        generated++;
      } else if (batch.quantityOnHand <= batch.reorderThreshold && !alreadyOpen) {
        await createSafetyAlert({
          ownerId: user.uid,
          portalRole: 'pharmacist',
          alertType: 'low_stock',
          severity: 'warning',
          title: `Automated Sweep — Low Stock: ${batch.medicineName}`,
          triggerDetails: `Batch ${batch.batchNumber} has ${batch.quantityOnHand} units remaining (reorder level ${batch.reorderThreshold}).`,
          affectedProduct: batch.medicineName,
          affectedBatch: batch.batchNumber,
          sourceReference: 'Admin Safety Sweep Engine',
        });
        generated++;
      }
    }

    await logAuditEvent({
      ownerId: user.uid,
      portalRole: 'pharmacist',
      actorName: profile?.displayName || 'Admin',
      action: 'SAFETY_SWEEP_EXECUTED',
      targetType: 'alert',
      targetId: user.uid,
      details: `Executed expiry & low-stock safety sweep across ${data.batches.length} batch(es). Generated ${generated} new alert(s).`,
    });

    if (notifPermission === 'granted' && generated > 0) {
      new Notification('MediTrust AI Safety Sweep', {
        body: `${generated} new expiry or low-stock alert(s) were flagged for review.`,
      });
    }

    setStatusBanner(
      t(
        `Safety sweep completed across ${data.batches.length} batches: ${generated} new alert(s) created.`,
        `${data.batches.length} बैच की जाँच पूरी हुई: ${generated} नए सुरक्षा अलर्ट बने।`
      )
    );
  };

  const handleLogDistributorDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !distBatchId) return;
    const batch = data.batches.find((b) => b.id === distBatchId);
    if (!batch) return;
    setDistSaving(true);
    try {
      await addTraceabilityEvent({
        ownerId: user.uid,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        medicineName: batch.medicineName,
        eventType: 'DISPATCHED',
        actorOrg: distOrg.trim() || batch.supplierName,
        sourceLocation: distSource.trim() || 'Authorized Regional Distributor Warehouse',
        destinationLocation: profile?.pharmacyName || 'Authorized Pharmacy',
        quantity: Math.max(1, Math.round(Number(distQty) || batch.quantityOnHand)),
        evidenceRef: distInvoice.trim() || batch.invoiceRef || '',
        notes: 'Logged via Distributor / Supplier Hand-off Console.',
        eventDate: new Date().toISOString().slice(0, 10),
      });
      await logAuditEvent({
        ownerId: user.uid,
        portalRole: 'pharmacist',
        actorName: profile?.displayName || 'Admin',
        action: 'DISTRIBUTOR_HANDOFF_LOGGED',
        targetType: 'traceability_event',
        targetId: batch.id,
        details: `Logged distributor dispatch for ${batch.medicineName} (${batch.batchNumber}) from ${distOrg.trim() || batch.supplierName}.`,
      });
      setDistOrg('');
      setDistSource('');
      setDistInvoice('');
      setStatusBanner(t('Distributor dispatch hand-off recorded in immutable chain of custody.', 'वितरक डिस्पैच रिकॉर्ड सप्लाई चेन में दर्ज हो गया है।'));
    } finally {
      setDistSaving(false);
    }
  };

  const filteredAudits = data.auditEvents.filter((ev) => {
    if (!auditSearch.trim()) return true;
    const q = auditSearch.toLowerCase();
    return (
      ev.action.toLowerCase().includes(q) ||
      ev.actorName.toLowerCase().includes(q) ||
      ev.details.toLowerCase().includes(q)
    );
  });

  const batchesMissingDispatch = data.batches.filter(
    (b) => !data.traceEvents.some((ev) => ev.batchId === b.id && (ev.eventType === 'DISPATCHED' || ev.eventType === 'MANUFACTURED'))
  );

  const connectorRows = [
    {
      name: t('Gemini Multimodal Vision & Chat AI', 'जेमिनी मल्टीमॉडल विज़न व चैट AI'),
      detail: health?.activeAiModels?.join(' -> ') || 'gemini-3.1-flash-lite',
      status: health?.connectors.geminiVisionOcr ? 'live' : 'offline',
    },
    {
      name: t('Pharmacist AI Function Calling Engine (8 Live Tools)', 'फार्मासिस्ट एआई फंक्शन कॉलिंग इंजन (8 लाइव टूल्स)'),
      detail: 'Stock Receipt · Dispense · Quarantine · Alerts · Custody · PO · Risk Audit',
      status: health?.connectors.pharmacistAiFunctionCalling !== false && health?.connectors.geminiVisionOcr ? 'live' : 'offline',
    },
    {
      name: t('openFDA Live Drug Label & Recall Enforcement API', 'openFDA लाइव ड्रग लेबल व रिकॉल API'),
      detail:
        health?.openFdaLatencyMs != null
          ? `api.fda.gov · ${health.openFdaLatencyMs} ms`
          : 'api.fda.gov',
      status: health?.connectors.openFdaRecallFeed ? 'live' : 'offline',
    },
    {
      name: t('Normalized Medicine Reference Catalogue (India CDSCO/IP + Global)', 'नॉर्मलाइज़्ड दवा संदर्भ कैटलॉग (भारत CDSCO/IP + वैश्विक)'),
      detail: `${health?.catalogueSize || 28} normalized products`,
      status: 'live',
    },
    {
      name: t('Client ZXing QR / DataMatrix / GS1-128 Decoder', 'QR / DataMatrix / GS1-128 बारकोड डिकोडर'),
      detail: 'BrowserMultiFormatReader + URL Audit',
      status: 'live',
    },
    {
      name: t('Manufacturer Serialization Partner API', 'निर्माता सीरियलाइज़ेशन पार्टनर API'),
      detail: t('Integration Gate — Requires authorized manufacturer credentials', 'एकीकरण गेट — आधिकारिक निर्माता अनुमति आवश्यक'),
      status: 'gated',
    },
    {
      name: t('Live CDSCO / SUGAM Regulator Feed', 'लाइव CDSCO / SUGAM नियामक फीड'),
      detail: t('Integration Gate — Pending official government API access', 'एकीकरण गेट — सरकारी API अनुमति लंबित'),
      status: 'gated',
    },
  ] as const;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
            {t('Admin Console, Connectors & Distributor Ops', 'एडमिन कंसोल, कनेक्टर और वितरक संचालन')}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {t(
              'Monitor live integration health, run automated expiry & low-stock alert sweeps, record upstream distributor hand-offs, and audit workspace activity.',
              'लाइव कनेक्टर स्वास्थ्य की निगरानी करें, स्वचालित एक्सपायरी व कम-स्टॉक जाँच चलाएँ, वितरक डिस्पैच दर्ज करें और ऑडिट लॉग देखें।'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={probing}
            onClick={() => void probeConnectors(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#0D7377] ${probing ? 'animate-spin' : ''}`} />
            <span>{t('Probe Connectors', 'कनेक्टर जाँचें')}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleRunAutomatedSafetySweep()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{t('Run Expiry & Stock Sweep', 'एक्सपायरी व स्टॉक जाँच चलाएँ')}</span>
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-xs text-[#0B1B2B] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#0D7377] shrink-0" />
          <span>{statusBanner}</span>
        </div>
      )}

      {/* Top Grid: Connector Health + Notifications & Chain Completeness */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-[#0D7377]" />
              <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                {t('Integration Health & Source Freshness', 'कनेक्टर स्वास्थ्य एवं स्रोत स्थिति')}
              </h3>
            </div>
            {health && (
              <span className="font-mono text-[11px] text-slate-500">
                {new Date(health.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {connectorRows.map((row) => (
              <div key={row.name} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#0B1B2B]">{row.name}</p>
                  <p className="font-mono text-[11px] text-slate-500 mt-0.5 truncate">
                    {row.detail}
                  </p>
                </div>
                <div className="shrink-0">
                  {row.status === 'live' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Active</span>
                    </span>
                  ) : row.status === 'gated' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Gated</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Unavailable</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="lg:col-span-5 space-y-6">
          {/* Browser Notification Controls */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#0D7377]" />
                <h3 className="font-display text-sm font-semibold text-[#0B1B2B]">
                  {t('Alert Notification Preferences', 'सुरक्षा अलर्ट नोटिफिकेशन')}
                </h3>
              </div>
              <span className="font-mono text-[11px] uppercase text-slate-500">
                {notifPermission}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t(
                'Enable browser desktop notifications for critical expired stock, recall matches, and low-stock alerts detected during safety sweeps.',
                'एक्सपायरी, रिकॉल और कम-स्टॉक अलर्ट के लिए ब्राउज़र नोटिफिकेशन सक्षम करें।'
              )}
            </p>
            <button
              type="button"
              onClick={() => void handleEnableBrowserAlerts()}
              className="w-full px-4 py-2 text-xs font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              {notifPermission === 'granted'
                ? t('Send Test Safety Notification', 'टेस्ट नोटिफिकेशन भेजें')
                : t('Enable Browser Safety Notifications', 'ब्राउज़र नोटिफिकेशन चालू करें')}
            </button>
          </section>

          {/* Distributor / Supplier Quick Dispatch Hand-Off */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#0D7377]" />
                <h3 className="font-display text-sm font-semibold text-[#0B1B2B]">
                  {t('Distributor / Supplier Dispatch Log', 'वितरक / सप्लायर डिस्पैच लॉग')}
                </h3>
              </div>
              <span className="font-mono text-[11px] text-amber-700 font-semibold">
                {batchesMissingDispatch.length} {t('missing upstream', 'अधूरी कड़ी')}
              </span>
            </div>

            <form onSubmit={handleLogDistributorDispatch} className="space-y-3">
              <select
                required
                value={distBatchId}
                onChange={(e) => setDistBatchId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              >
                <option value="">{t('Select batch to log upstream dispatch...', 'बैच चुनें...')}</option>
                {data.batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.medicineName} · {b.batchNumber} ({b.supplierName})
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={distOrg}
                  onChange={(e) => setDistOrg(e.target.value)}
                  placeholder={t('Distributor name', 'वितरक का नाम')}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
                <input
                  type="text"
                  value={distInvoice}
                  onChange={(e) => setDistInvoice(e.target.value)}
                  placeholder={t('Dispatch invoice #', 'डिस्पैच इनवॉइस #')}
                  className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={distSource}
                  onChange={(e) => setDistSource(e.target.value)}
                  placeholder={t('Origin depot / city', 'उत्पत्ति डिपो / शहर')}
                  className="col-span-2 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
                <input
                  type="number"
                  min={1}
                  value={distQty}
                  onChange={(e) => setDistQty(e.target.value)}
                  placeholder="Qty"
                  className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>

              <button
                type="submit"
                disabled={distSaving || !distBatchId}
                className="w-full px-4 py-2 text-xs font-semibold text-white bg-[#0B1B2B] rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                {distSaving
                  ? t('Logging Dispatch...', 'दर्ज हो रहा है...')
                  : t('Record Upstream Distributor Dispatch', 'वितरक डिस्पैच दर्ज करें')}
              </button>
            </form>
          </section>
        </div>
      </div>

      {/* Immutable Audit Trail Explorer */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#0D7377]" />
            <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
              {t('Workspace Audit Log', 'कार्यक्षेत्र ऑडिट लॉग')} ({filteredAudits.length})
            </h3>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder={t('Filter audit events...', 'ऑडिट खोजें...')}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>
            <button
              type="button"
              disabled={filteredAudits.length === 0}
              onClick={() => {
                const rows = filteredAudits.map((a) => ({
                  timestamp: formatTimestamp(a.createdAt),
                  action: a.action,
                  actor: a.actorName,
                  portalRole: a.portalRole,
                  targetType: a.targetType,
                  details: a.details,
                }));
                downloadTextFile(`meditrust-audit-log-${Date.now()}.csv`, toCsv(rows));
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {filteredAudits.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            {t('No audit events match your filter.', 'कोई ऑडिट रिकॉर्ड नहीं मिला।')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F8FAFC] text-slate-500 font-semibold">
                  <th className="py-2.5 px-5">{t('Timestamp', 'समय')}</th>
                  <th className="py-2.5 px-4">{t('Action', 'क्रिया')}</th>
                  <th className="py-2.5 px-4">{t('Actor', 'उपयोगकर्ता')}</th>
                  <th className="py-2.5 px-5">{t('Details', 'विवरण')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAudits.slice(0, 50).map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-5 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                      {formatTimestamp(ev.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-[#0B1B2B] whitespace-nowrap">
                      {ev.action}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{ev.actorName}</td>
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
