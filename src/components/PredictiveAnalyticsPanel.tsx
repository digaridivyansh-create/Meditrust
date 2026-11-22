import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BellPlus,
  CheckCircle2,
  Download,
  Minus,
  PackagePlus,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  createSafetyAlert,
  logAuditEvent,
  receiveInventoryStock,
} from '../lib/firestoreService';
import {
  buildPredictiveInventorySummary,
  type MedicationForecast,
  type MissingCommonEssential,
} from '../lib/predictiveInventory';
import { downloadTextFile } from '../lib/utils';

function StockDepletionSvgChart({ forecast }: { forecast: MedicationForecast }) {
  const width = 560;
  const height = 190;
  const padLeft = 42;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 30;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const series = forecast.projectionSeries;
  const maxStock = Math.max(
    forecast.currentTotalStock,
    forecast.reorderThreshold * 1.35,
    ...series.map((p) => p.projectedStock),
    20
  );
  const maxDay = Math.max(1, series[series.length - 1]?.day || 30);

  const xForDay = (day: number) => padLeft + (day / maxDay) * innerW;
  const yForVal = (val: number) => padTop + innerH - (Math.max(0, val) / maxStock) * innerH;

  const linePoints = series.map((p) => `${xForDay(p.day).toFixed(1)},${yForVal(p.projectedStock).toFixed(1)}`);
  const linePath = `M ${linePoints.join(' L ')}`;
  const areaPath = `${linePath} L ${xForDay(series[series.length - 1].day).toFixed(1)},${(padTop + innerH).toFixed(1)} L ${xForDay(0).toFixed(1)},${(padTop + innerH).toFixed(1)} Z`;

  const thresholdY = yForVal(forecast.reorderThreshold);
  const strokeColor =
    forecast.riskLevel === 'critical'
      ? '#E11D48'
      : forecast.riskLevel === 'warning'
        ? '#D97706'
        : '#0D7377';
  const fillColor =
    forecast.riskLevel === 'critical'
      ? 'rgba(225, 29, 72, 0.12)'
      : forecast.riskLevel === 'warning'
        ? 'rgba(217, 119, 6, 0.12)'
        : 'rgba(13, 115, 119, 0.12)';

  const stockoutPoint =
    forecast.daysUntilStockout !== null && forecast.daysUntilStockout <= maxDay
      ? { x: xForDay(forecast.daysUntilStockout), y: yForVal(0) }
      : null;

  const yTicks = [0, Math.round(maxStock / 2), Math.round(maxStock)];
  const xTickIndices = [0, Math.floor(series.length / 3), Math.floor((series.length * 2) / 3), series.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto block"
      role="img"
      aria-label={`Projected stock depletion trend for ${forecast.medicineName}`}
    >
      {/* Horizontal grid lines */}
      {yTicks.map((tick) => {
        const y = yForVal(tick);
        return (
          <g key={tick}>
            <line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="#E2E8F0"
              strokeWidth="1"
            />
            <text
              x={padLeft - 6}
              y={y + 3.5}
              textAnchor="end"
              fill="#64748B"
              fontSize="10"
              fontFamily="monospace"
            >
              {tick}
            </text>
          </g>
        );
      })}

      {/* Reorder Threshold Reference Line */}
      <line
        x1={padLeft}
        y1={thresholdY}
        x2={width - padRight}
        y2={thresholdY}
        stroke="#D97706"
        strokeWidth="1.25"
        strokeDasharray="4 4"
      />
      <text
        x={width - padRight - 2}
        y={Math.max(padTop + 10, thresholdY - 4)}
        textAnchor="end"
        fill="#B45309"
        fontSize="9.5"
        fontFamily="monospace"
      >
        Reorder ({forecast.reorderThreshold})
      </text>

      {/* Area & Line */}
      <path d={areaPath} fill={fillColor} />
      <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />

      {/* Data nodes */}
      {series.map((p, idx) =>
        idx === 0 || idx === series.length - 1 || p.expiryDropUnits > 0 ? (
          <circle
            key={p.day}
            cx={xForDay(p.day)}
            cy={yForVal(p.projectedStock)}
            r={p.expiryDropUnits > 0 ? 4 : 3}
            fill={p.expiryDropUnits > 0 ? '#E11D48' : strokeColor}
            stroke="#FFFFFF"
            strokeWidth="1.5"
          />
        ) : null
      )}

      {/* Projected Stockout Marker */}
      {stockoutPoint && (
        <g>
          <circle cx={stockoutPoint.x} cy={stockoutPoint.y} r="4.5" fill="#E11D48" stroke="#FFFFFF" strokeWidth="1.5" />
          <text
            x={Math.min(width - padRight - 4, Math.max(padLeft + 36, stockoutPoint.x))}
            y={stockoutPoint.y - 8}
            textAnchor="middle"
            fill="#BE123C"
            fontSize="9.5"
            fontWeight="600"
            fontFamily="monospace"
          >
            Stockout Day {forecast.daysUntilStockout}
          </text>
        </g>
      )}

      {/* X-axis labels */}
      {xTickIndices.map((idx) => {
        const pt = series[idx];
        if (!pt) return null;
        return (
          <text
            key={idx}
            x={xForDay(pt.day)}
            y={height - 8}
            textAnchor={idx === 0 ? 'start' : idx === series.length - 1 ? 'end' : 'middle'}
            fill="#64748B"
            fontSize="10"
            fontFamily="monospace"
          >
            {pt.dateLabel}
          </text>
        );
      })}
    </svg>
  );
}

export function PredictiveAnalyticsPanel() {
  const { user, profile, data } = useAuth();
  const { lang, t } = useLanguage();

  const [horizonDays, setHorizonDays] = useState<14 | 30 | 60>(30);
  const [leadTimeDays, setLeadTimeDays] = useState<3 | 5 | 7>(5);
  const [activeTab, setActiveTab] = useState<'restock' | 'all' | 'essentials'>('restock');
  const [selectedMedKey, setSelectedMedKey] = useState<string>('');
  const [busyKey, setBusyKey] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [aiBrief, setAiBrief] = useState<string>('');
  const [loadingBrief, setLoadingBrief] = useState(false);

  const summary = useMemo(
    () =>
      buildPredictiveInventorySummary(data.batches, data.ledger, {
        horizonDays,
        leadTimeDays,
        nearExpiryDays: profile?.nearExpiryDays || 90,
      }),
    [data.batches, data.ledger, horizonDays, leadTimeDays, profile?.nearExpiryDays]
  );

  const activeForecast = useMemo(() => {
    if (summary.forecasts.length === 0) return null;
    return (
      summary.forecasts.find((f) => f.key === selectedMedKey) ||
      summary.restockNeeded[0] ||
      summary.forecasts[0]
    );
  }, [summary, selectedMedKey]);

  const isAlertAlreadyOpen = (forecast: MedicationForecast) =>
    data.alerts.some(
      (a) =>
        a.status !== 'resolved' &&
        a.alertType === 'low_stock' &&
        (a.affectedBatch === forecast.primaryBatchNumber ||
          a.affectedProduct?.toLowerCase() === forecast.medicineName.toLowerCase())
    );

  const handleCreateRestockAlert = async (forecast: MedicationForecast) => {
    if (!user) return;
    setBusyKey(`alert:${forecast.key}`);
    setStatusBanner(null);
    try {
      if (isAlertAlreadyOpen(forecast)) {
        setStatusBanner({
          type: 'ok',
          text: t(
            `An open restocking alert already exists for ${forecast.medicineName}.`,
            `${forecast.medicineName} के लिए रीस्टॉक अलर्ट पहले से सक्रिय है।`
          ),
        });
        return;
      }

      const alertId = await createSafetyAlert({
        ownerId: user.uid,
        portalRole: 'pharmacist',
        alertType: 'low_stock',
        severity: forecast.riskLevel === 'critical' ? 'critical' : 'warning',
        title: `Predictive Restock: ${forecast.medicineName} (Order +${forecast.recommendedOrderQty} units)`,
        triggerDetails: `${forecast.restockReason}. Projected burn rate: ${forecast.dailyBurnRate}/day (${forecast.velocitySource}). Recommended restock: ${forecast.recommendedOrderQty} units (~₹${forecast.estimatedOrderCostInr.toLocaleString()}) from ${forecast.supplierName}.`,
        affectedProduct: forecast.medicineName,
        affectedBatch: forecast.primaryBatchNumber,
        sourceReference: `Predictive Analytics (${horizonDays}d horizon)`,
      });

      await logAuditEvent({
        ownerId: user.uid,
        portalRole: 'pharmacist',
        actorName: profile?.displayName || 'Pharmacist',
        action: 'PREDICTIVE_RESTOCK_ALERT',
        targetType: 'safety_alert',
        targetId: alertId,
        details: `Created predictive restock alert for ${forecast.medicineName} recommending +${forecast.recommendedOrderQty} units (stockout in ${forecast.daysUntilStockout ?? 'N/A'}d).`,
      });

      setStatusBanner({
        type: 'ok',
        text: t(
          `Restocking alert created for ${forecast.medicineName} (+${forecast.recommendedOrderQty} units recommended).`,
          `${forecast.medicineName} के लिए रीस्टॉक अलर्ट बना दिया गया (+${forecast.recommendedOrderQty} यूनिट अनुशंसित)।`
        ),
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to create restocking alert.',
      });
    } finally {
      setBusyKey('');
    }
  };

  const handleRaiseAllRestockAlerts = async () => {
    if (!user || summary.restockNeeded.length === 0) return;
    setBusyKey('alert:all');
    setStatusBanner(null);
    try {
      let created = 0;
      for (const f of summary.restockNeeded) {
        if (isAlertAlreadyOpen(f)) continue;
        await createSafetyAlert({
          ownerId: user.uid,
          portalRole: 'pharmacist',
          alertType: 'low_stock',
          severity: f.riskLevel === 'critical' ? 'critical' : 'warning',
          title: `Predictive Restock: ${f.medicineName} (Order +${f.recommendedOrderQty} units)`,
          triggerDetails: `${f.restockReason}. Burn rate ${f.dailyBurnRate}/day (${f.velocitySource}). Recommend ordering ${f.recommendedOrderQty} units from ${f.supplierName}.`,
          affectedProduct: f.medicineName,
          affectedBatch: f.primaryBatchNumber,
          sourceReference: `Predictive Analytics Batch Sweep (${horizonDays}d)`,
        });
        created++;
      }

      if (created > 0) {
        await logAuditEvent({
          ownerId: user.uid,
          portalRole: 'pharmacist',
          actorName: profile?.displayName || 'Pharmacist',
          action: 'PREDICTIVE_RESTOCK_SWEEP',
          targetType: 'safety_alert',
          targetId: `sweep_${Date.now().toString(36)}`,
          details: `Raised ${created} predictive restocking alert(s) across ${horizonDays}-day demand horizon.`,
        });
      }

      setStatusBanner({
        type: 'ok',
        text:
          created > 0
            ? t(
                `Created ${created} new predictive restocking alert(s) in your Safety Alerts queue.`,
                `आपके सुरक्षा अलर्ट में ${created} नए रीस्टॉक अलर्ट जोड़े गए।`
              )
            : t(
                'All restock-needed medications already have open alerts.',
                'सभी आवश्यक दवाओं के लिए रीस्टॉक अलर्ट पहले से खुले हैं।'
              ),
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to raise restocking alerts.',
      });
    } finally {
      setBusyKey('');
    }
  };

  const handleQuickRestock = async (forecast: MedicationForecast) => {
    if (!user || forecast.recommendedOrderQty <= 0) return;
    setBusyKey(`restock:${forecast.key}`);
    setStatusBanner(null);
    try {
      const today = new Date();
      const exp = new Date(today);
      exp.setUTCDate(exp.getUTCDate() + 540);
      const expiryDate = exp.toISOString().slice(0, 10);
      const batchCode = `${forecast.medicineName
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 5)}-RS${today.toISOString().slice(2, 10).replace(/-/g, '')}`;

      const batchId = await receiveInventoryStock({
        ownerId: user.uid,
        pharmacyName: profile?.pharmacyName || 'Authorized Pharmacy',
        actorName: profile?.displayName || 'Pharmacist',
        medicineName: forecast.medicineName,
        genericName: forecast.genericName,
        manufacturer: 'Authorized Replenishment Lot',
        batchNumber: batchCode,
        mfgDate: today.toISOString().slice(0, 10),
        expiryDate,
        supplierName: forecast.supplierName,
        invoiceRef: `PO-PRED-${Date.now().toString().slice(-5)}`,
        quantity: forecast.recommendedOrderQty,
        reorderThreshold: forecast.reorderThreshold,
        unitPrice: forecast.avgUnitPrice,
        verificationStatus: 'needs_review',
      });

      await logAuditEvent({
        ownerId: user.uid,
        portalRole: 'pharmacist',
        actorName: profile?.displayName || 'Pharmacist',
        action: 'PREDICTIVE_RESTOCK_RECEIVED',
        targetType: 'inventory_batch',
        targetId: batchId,
        details: `Received recommended replenishment of +${forecast.recommendedOrderQty} units for ${forecast.medicineName} (Batch ${batchCode}, Exp ${expiryDate}).`,
      });

      setStatusBanner({
        type: 'ok',
        text: t(
          `Received +${forecast.recommendedOrderQty} units of ${forecast.medicineName} (Batch ${batchCode}) into live inventory.`,
          `${forecast.medicineName} के +${forecast.recommendedOrderQty} यूनिट (बैच ${batchCode}) लाइव इन्वेंट्री में जोड़ दिए गए।`
        ),
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to commit replenishment batch.',
      });
    } finally {
      setBusyKey('');
    }
  };

  const handleStockMissingEssential = async (item: MissingCommonEssential) => {
    if (!user) return;
    setBusyKey(`essential:${item.productId}`);
    setStatusBanner(null);
    try {
      const today = new Date();
      const exp = new Date(today);
      exp.setUTCDate(exp.getUTCDate() + 540);
      const batchCode = `${item.brandName
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 5)}-${today.toISOString().slice(2, 10).replace(/-/g, '')}`;

      const batchId = await receiveInventoryStock({
        ownerId: user.uid,
        pharmacyName: profile?.pharmacyName || 'Authorized Pharmacy',
        actorName: profile?.displayName || 'Pharmacist',
        medicineName: item.brandName,
        genericName: item.genericName,
        strength: item.strength,
        dosageForm: item.dosageForm,
        manufacturer: item.manufacturer,
        batchNumber: batchCode,
        mfgDate: today.toISOString().slice(0, 10),
        expiryDate: exp.toISOString().slice(0, 10),
        supplierName: 'MedLine Authorized Distributors Pvt Ltd',
        invoiceRef: `PO-ESS-${Date.now().toString().slice(-5)}`,
        quantity: item.suggestedInitialQty,
        reorderThreshold: Math.max(20, Math.round(item.suggestedInitialQty * 0.25)),
        unitPrice: item.referencePriceInr,
        verificationStatus: 'needs_review',
      });

      await logAuditEvent({
        ownerId: user.uid,
        portalRole: 'pharmacist',
        actorName: profile?.displayName || 'Pharmacist',
        action: 'PREDICTIVE_ESSENTIAL_STOCKED',
        targetType: 'inventory_batch',
        targetId: batchId,
        details: `Added initial stock of ${item.suggestedInitialQty} units for common essential ${item.brandName} (Batch ${batchCode}).`,
      });

      setStatusBanner({
        type: 'ok',
        text: t(
          `Added ${item.suggestedInitialQty} units of ${item.brandName} (Batch ${batchCode}) to inventory.`,
          `${item.brandName} के ${item.suggestedInitialQty} यूनिट इन्वेंट्री में जोड़े गए।`
        ),
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to add essential stock.',
      });
    } finally {
      setBusyKey('');
    }
  };

  const handleGenerateAiBrief = async () => {
    setLoadingBrief(true);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/v1/pharmacist/predictive-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: lang === 'hi' ? 'hi' : 'en',
          pharmacyName: profile?.pharmacyName || 'Authorized Pharmacy',
          horizonDays,
          leadTimeDays,
          forecasts: summary.forecasts.slice(0, 16).map((f) => ({
            medicineName: f.medicineName,
            usableStock: f.usableStock,
            dailyBurnRate: f.dailyBurnRate,
            velocitySource: f.velocitySource,
            daysUntilStockout: f.daysUntilStockout,
            riskLevel: f.riskLevel,
            recommendedOrderQty: f.recommendedOrderQty,
            estimatedOrderCostInr: f.estimatedOrderCostInr,
            restockReason: f.restockReason,
          })),
          missingEssentials: summary.missingCommonEssentials.slice(0, 6).map((m) => ({
            brandName: m.brandName,
            therapeuticClass: m.therapeuticClass,
            suggestedInitialQty: m.suggestedInitialQty,
          })),
        }),
      });
      const json = (await res.json()) as { brief?: string; error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to generate procurement brief.');
      setAiBrief(json.brief || '');
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to generate AI procurement brief.',
      });
    } finally {
      setLoadingBrief(false);
    }
  };

  const displayedRows = activeTab === 'restock' ? summary.restockNeeded : summary.forecasts;

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header & Simulation Controls */}
      <div className="p-6 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#0B1B2B] text-white flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-bold text-[#0B1B2B]">
                {t(
                  'Predictive Inventory Analytics & Restocking Forecast',
                  'प्रेडिक्टिव इन्वेंट्री एनालिटिक्स और रीस्टॉक पूर्वानुमान'
                )}
              </h3>
              <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                FEFO + Ledger Trend Engine
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {t(
                'Projects daily consumption, stockout dates, and expiry cutoffs across common medications to suggest restocking alerts and optimal reorder quantities.',
                'सामान्य दवाओं की दैनिक खपत, स्टॉक समाप्ति तिथि और एक्सपायरी का विश्लेषण करके रीस्टॉक अलर्ट और सटीक ऑर्डर मात्रा सुझाता है।'
              )}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
            <span className="px-2 text-[11px] font-medium text-slate-500">
              {t('Horizon', 'अवधि')}
            </span>
            {([14, 30, 60] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setHorizonDays(d)}
                className={`px-2.5 py-1 rounded-md font-mono font-semibold transition-colors cursor-pointer ${
                  horizonDays === d
                    ? 'bg-white text-[#0B1B2B] shadow-xs'
                    : 'text-slate-600 hover:text-[#0B1B2B]'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
            <span className="px-2 text-[11px] font-medium text-slate-500">
              {t('Lead Time', 'सप्लाई समय')}
            </span>
            {([3, 5, 7] as const).map((lt) => (
              <button
                key={lt}
                type="button"
                onClick={() => setLeadTimeDays(lt)}
                className={`px-2 py-1 rounded-md font-mono font-semibold transition-colors cursor-pointer ${
                  leadTimeDays === lt
                    ? 'bg-white text-[#0B1B2B] shadow-xs'
                    : 'text-slate-600 hover:text-[#0B1B2B]'
                }`}
              >
                {lt}d
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={loadingBrief}
            onClick={() => void handleGenerateAiBrief()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0D7377] bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {loadingBrief ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>{t('AI Procurement Brief', 'एआई खरीद सारांश')}</span>
          </button>

          {summary.restockNeeded.length > 0 && (
            <>
              <button
                type="button"
                disabled={busyKey === 'alert:all'}
                onClick={() => void handleRaiseAllRestockAlerts()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <BellPlus className="w-3.5 h-3.5" />
                <span>
                  {busyKey === 'alert:all'
                    ? t('Raising Alerts...', 'अलर्ट बन रहे हैं...')
                    : t(`Raise ${summary.restockNeeded.length} Alert(s)`, `${summary.restockNeeded.length} अलर्ट बनाएं`)}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `meditrust-predictive-restock-${horizonDays}d.csv`,
                    summary.csvContent,
                    'text/csv'
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('Export CSV', 'CSV निर्यात')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status & AI Brief Banners */}
      {(statusBanner || aiBrief) && (
        <div className="px-6 pt-4 space-y-3">
          {statusBanner && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                statusBanner.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                {statusBanner.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                {statusBanner.text}
              </span>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-[11px] font-semibold underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {aiBrief && (
            <div className="p-4 rounded-lg bg-teal-50/70 border border-teal-200 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B1B2B]">
                  <Sparkles className="w-3.5 h-3.5 text-[#0D7377]" />
                  {t('AI Procurement & Restocking Brief', 'एआई खरीद और रीस्टॉक सारांश')}
                </span>
                <button
                  type="button"
                  onClick={() => setAiBrief('')}
                  className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                {aiBrief.replace(/\*\*/g, '')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compact Forecast KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-slate-200 border-b border-slate-200 bg-[#F8FAFC] mt-4">
        <div className="p-4">
          <p className="text-[11px] font-medium text-slate-500">
            {t('Urgent Restock Alerts', 'तुरंत रीस्टॉक अलर्ट')}
          </p>
          <p
            className={`font-mono text-2xl font-bold tabular-nums mt-1 ${
              summary.criticalCount > 0 ? 'text-rose-700' : 'text-[#0B1B2B]'
            }`}
          >
            {summary.criticalCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {t('Critical / inside lead time', 'गंभीर / लीड टाइम के भीतर')}
          </p>
        </div>

        <div className="p-4">
          <p className="text-[11px] font-medium text-slate-500">
            {t(`Projected Restocks (${horizonDays}d)`, `अनुमानित रीस्टॉक (${horizonDays} दिन)`)}
          </p>
          <p
            className={`font-mono text-2xl font-bold tabular-nums mt-1 ${
              summary.warningCount > 0 ? 'text-amber-700' : 'text-[#0B1B2B]'
            }`}
          >
            {summary.warningCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {t('Stockout or expiry replacement', 'स्टॉक समाप्ति या एक्सपायरी प्रतिस्थापन')}
          </p>
        </div>

        <div className="p-4">
          <p className="text-[11px] font-medium text-slate-500">
            {t('Recommended Reorder Qty', 'अनुशंसित रीऑर्डर मात्रा')}
          </p>
          <p className="font-mono text-2xl font-bold text-[#0D7377] tabular-nums mt-1">
            +{summary.totalRecommendedUnits.toLocaleString()}
          </p>
          <p className="text-[11px] font-mono text-slate-500 mt-0.5 tabular-nums">
            Est. ₹{summary.totalEstimatedBudgetInr.toLocaleString()}
          </p>
        </div>

        <div className="p-4">
          <p className="text-[11px] font-medium text-slate-500">
            {t('Common Essentials Gaps', 'अनुपलब्ध आवश्यक दवाएं')}
          </p>
          <p className="font-mono text-2xl font-bold text-[#0B1B2B] tabular-nums mt-1">
            {summary.missingCommonEssentials.length}
          </p>
          <p className="text-[11px] font-mono text-slate-500 mt-0.5 tabular-nums">
            {summary.totalObservedDispenses30d} {t('dispensed (30d)', 'डिस्पेंस (30 दिन)')}
          </p>
        </div>
      </div>

      {/* Interactive Projection Chart + Forecast List */}
      <div className="p-6 space-y-6">
        {activeForecast && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center bg-[#F8FAFC] border border-slate-200 rounded-xl p-5">
            <div className="lg:col-span-5 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                    activeForecast.riskLevel === 'critical'
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : activeForecast.riskLevel === 'warning'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}
                >
                  {activeForecast.riskLevel === 'critical'
                    ? t('Critical Restock', 'अति आवश्यक रीस्टॉक')
                    : activeForecast.riskLevel === 'warning'
                      ? t('Restock Soon', 'शीघ्र रीस्टॉक')
                      : t('Healthy Cover', 'पर्याप्त स्टॉक')}
                </span>
                <span className="font-mono text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                  {activeForecast.velocitySource === 'observed'
                    ? 'Observed Ledger Trend'
                    : activeForecast.velocitySource === 'hybrid'
                      ? 'Hybrid Trend'
                      : 'Clinical Baseline'}
                </span>
              </div>

              <div>
                <h4 className="font-display text-lg font-bold text-[#0B1B2B]">
                  {activeForecast.medicineName}
                </h4>
                <p className="text-xs text-slate-500">
                  {activeForecast.genericName || activeForecast.therapeuticClass} · Batch{' '}
                  <span className="font-mono">{activeForecast.primaryBatchNumber}</span>
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-xs">
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <span className="text-[10px] text-slate-500 block">Usable Stock</span>
                  <span className="font-mono text-base font-bold text-[#0B1B2B] tabular-nums">
                    {activeForecast.usableStock}
                  </span>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <span className="text-[10px] text-slate-500 block">Burn Rate</span>
                  <span className="font-mono text-base font-bold text-[#0B1B2B] tabular-nums">
                    {activeForecast.dailyBurnRate}/d
                  </span>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <span className="text-[10px] text-slate-500 block">Stockout In</span>
                  <span
                    className={`font-mono text-base font-bold tabular-nums ${
                      activeForecast.daysUntilStockout !== null && activeForecast.daysUntilStockout <= 14
                        ? 'text-rose-700'
                        : 'text-[#0B1B2B]'
                    }`}
                  >
                    {activeForecast.daysUntilStockout !== null ? `${activeForecast.daysUntilStockout}d` : '60d+'}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed">
                <strong className="text-[#0B1B2B]">Forecast Basis:</strong> {activeForecast.restockReason}.
                {activeForecast.recommendedOrderQty > 0 && (
                  <>
                    {' '}
                    Suggest ordering{' '}
                    <strong className="font-mono text-[#0D7377]">
                      +{activeForecast.recommendedOrderQty} units
                    </strong>{' '}
                    (est. ₹{activeForecast.estimatedOrderCostInr.toLocaleString()}) from{' '}
                    {activeForecast.supplierName}.
                  </>
                )}
              </p>
            </div>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-3.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                <span className="font-semibold text-[#0B1B2B]">
                  {horizonDays}-Day FEFO Stock Depletion Curve
                </span>
                <span className="font-mono">
                  Nearest Exp: {activeForecast.nearestExpiryDate}
                </span>
              </div>
              <StockDepletionSvgChart forecast={activeForecast} />
            </div>
          </div>
        )}

        {/* Filter Sub-tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('restock')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                activeTab === 'restock'
                  ? 'bg-white text-[#0B1B2B] shadow-xs'
                  : 'text-slate-600 hover:text-[#0B1B2B]'
              }`}
            >
              {t('Restock Alerts', 'रीस्टॉक अलर्ट')} ({summary.restockNeeded.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-white text-[#0B1B2B] shadow-xs'
                  : 'text-slate-600 hover:text-[#0B1B2B]'
              }`}
            >
              {t('All Medications', 'सभी दवाएं')} ({summary.forecasts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('essentials')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                activeTab === 'essentials'
                  ? 'bg-white text-[#0B1B2B] shadow-xs'
                  : 'text-slate-600 hover:text-[#0B1B2B]'
              }`}
            >
              {t('Common Essentials Gap', 'अनुपलब्ध आवश्यक दवाएं')} ({summary.missingCommonEssentials.length})
            </button>
          </div>

          <p className="text-[11px] text-slate-500">
            {t(
              'Click any medication row to inspect its depletion projection curve.',
              'स्टॉक समाप्ति ग्राफ़ देखने के लिए किसी भी दवा पर क्लिक करें।'
            )}
          </p>
        </div>

        {/* Table Content */}
        {activeTab === 'essentials' ? (
          summary.missingCommonEssentials.length === 0 ? (
            <div className="p-8 text-center bg-[#F8FAFC] border border-slate-200 rounded-xl text-xs text-slate-600">
              {t(
                'All 12 tracked common Indian pharmacy essentials are currently stocked in your inventory.',
                'सभी 12 प्रमुख आवश्यक दवाएं आपकी इन्वेंट्री में उपलब्ध हैं।'
              )}
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8FAFC] border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Common Essential</th>
                    <th className="px-4 py-3">Therapeutic Class</th>
                    <th className="px-4 py-3">Suggested Initial Order</th>
                    <th className="px-4 py-3">Est. Budget</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.missingCommonEssentials.map((item) => (
                    <tr key={item.productId} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#0B1B2B]">{item.brandName}</p>
                        <p className="text-[11px] text-slate-500">
                          {item.genericName} · {item.manufacturer}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.therapeuticClass}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-[#0D7377] tabular-nums">
                        +{item.suggestedInitialQty} units
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 tabular-nums">
                        ₹{item.estimatedCostInr.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={busyKey === `essential:${item.productId}`}
                          onClick={() => void handleStockMissingEssential(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0D7377] hover:bg-[#0A5C5F] rounded-lg disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        >
                          <PackagePlus className="w-3.5 h-3.5" />
                          <span>
                            {busyKey === `essential:${item.productId}`
                              ? t('Adding...', 'जुड़ रहा है...')
                              : t('Add Initial Stock', 'शुरुआती स्टॉक जोड़ें')}
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : displayedRows.length === 0 ? (
          <div className="p-8 text-center bg-[#F8FAFC] border border-slate-200 rounded-xl text-xs text-slate-600">
            {summary.forecasts.length === 0
              ? t(
                  'No active inventory batches yet. Load the starter dataset or upload a batch in Inventory Management to unlock live demand forecasts.',
                  'अभी कोई सक्रिय स्टॉक बैच नहीं है। पूर्वानुमान देखने के लिए इन्वेंट्री में बैच जोड़ें।'
                )
              : t(
                  `No restocking alerts needed within the next ${horizonDays} days. Switch to "All Medications" to inspect healthy projections.`,
                  `अगले ${horizonDays} दिनों में किसी रीस्टॉक अलर्ट की आवश्यकता नहीं है।`
                )}
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8FAFC] border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-4 py-3">Medication</th>
                  <th className="px-4 py-3 text-right">Usable Stock</th>
                  <th className="px-4 py-3 text-right">Burn Rate</th>
                  <th className="px-4 py-3">Stockout Projection</th>
                  <th className="px-4 py-3 text-right">Suggested Order</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRows.map((f) => {
                  const isSelected = activeForecast?.key === f.key;
                  const alertExists = isAlertAlreadyOpen(f);
                  return (
                    <tr
                      key={f.key}
                      onClick={() => setSelectedMedKey(f.key)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-teal-50/50' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              f.riskLevel === 'critical'
                                ? 'bg-rose-600'
                                : f.riskLevel === 'warning'
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-600'
                            }`}
                          />
                          <div>
                            <p className="font-semibold text-[#0B1B2B]">{f.medicineName}</p>
                            <p className="text-[11px] text-slate-500 truncate max-w-[220px]">
                              {f.restockReason}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        <span
                          className={`font-semibold ${
                            f.usableStock <= f.reorderThreshold ? 'text-rose-700' : 'text-[#0B1B2B]'
                          }`}
                        >
                          {f.usableStock}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          min {f.reorderThreshold}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        <span className="inline-flex items-center justify-end gap-0.5 font-semibold text-[#0B1B2B]">
                          {f.trendDirection === 'rising' ? (
                            <ArrowUpRight className="w-3 h-3 text-rose-600" />
                          ) : f.trendDirection === 'cooling' ? (
                            <ArrowDownRight className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Minus className="w-3 h-3 text-slate-400" />
                          )}
                          {f.dailyBurnRate}/d
                        </span>
                        <span className="block text-[10px] text-slate-400 capitalize">
                          {f.velocitySource}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {f.daysUntilStockout !== null ? (
                          <>
                            <span
                              className={`font-semibold ${
                                f.daysUntilStockout <= leadTimeDays + 4
                                  ? 'text-rose-700'
                                  : f.daysUntilStockout <= horizonDays
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                              }`}
                            >
                              {f.daysUntilStockout}d left
                            </span>
                            <span className="block text-[10px] text-slate-500">
                              {f.projectedStockoutDate}
                            </span>
                          </>
                        ) : (
                          <span className="text-emerald-700 font-semibold">60d+</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {f.recommendedOrderQty > 0 ? (
                          <>
                            <span className="font-bold text-[#0D7377]">
                              +{f.recommendedOrderQty}
                            </span>
                            <span className="block text-[10px] text-slate-500">
                              ₹{f.estimatedOrderCostInr.toLocaleString()}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {f.recommendedOrderQty > 0 ? (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={busyKey === `alert:${f.key}` || alertExists}
                              onClick={() => void handleCreateRestockAlert(f)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                              title={alertExists ? 'Alert already open' : 'Raise restocking alert'}
                            >
                              <BellPlus className="w-3 h-3" />
                              <span>{alertExists ? t('Alert Open', 'अलर्ट खुला') : t('Alert', 'अलर्ट')}</span>
                            </button>

                            <button
                              type="button"
                              disabled={busyKey === `restock:${f.key}`}
                              onClick={() => void handleQuickRestock(f)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#0D7377] hover:bg-[#0A5C5F] rounded-md disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              <PackagePlus className="w-3 h-3" />
                              <span>
                                {busyKey === `restock:${f.key}`
                                  ? '...'
                                  : t('Restock', 'रीस्टॉक')}
                              </span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-700 font-medium">Optimal</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
