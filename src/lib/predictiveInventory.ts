import { NORMALIZED_MEDICINE_CATALOGUE } from './medicineDataset';
import type { InventoryBatch, InventoryLedgerEntry } from '../types';

export type VelocitySource = 'observed' | 'hybrid' | 'baseline';
export type ForecastRiskLevel = 'critical' | 'warning' | 'healthy';
export type TrendDirection = 'rising' | 'steady' | 'cooling';

export interface StockProjectionPoint {
  day: number;
  dateLabel: string;
  projectedStock: number;
  expiryDropUnits: number;
}

export interface MedicationForecast {
  key: string;
  medicineName: string;
  genericName: string;
  therapeuticClass: string;
  primaryBatchId: string;
  primaryBatchNumber: string;
  batchCount: number;
  supplierName: string;
  currentTotalStock: number;
  usableStock: number;
  expiringInHorizonUnits: number;
  nearestExpiryDate: string;
  nearestExpiryDays: number | null;
  reorderThreshold: number;
  avgUnitPrice: number;
  observedDispensed30d: number;
  dailyBurnRate: number;
  velocitySource: VelocitySource;
  trendDirection: TrendDirection;
  daysUntilStockout: number | null;
  projectedStockoutDate: string | null;
  riskLevel: ForecastRiskLevel;
  recommendedOrderQty: number;
  estimatedOrderCostInr: number;
  restockReason: string;
  projectionSeries: StockProjectionPoint[];
}

export interface MissingCommonEssential {
  productId: string;
  brandName: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  therapeuticClass: string;
  suggestedInitialQty: number;
  referencePriceInr: number;
  estimatedCostInr: number;
  rationale: string;
}

export interface PredictiveInventorySummary {
  horizonDays: number;
  leadTimeDays: number;
  generatedAt: string;
  forecasts: MedicationForecast[];
  restockNeeded: MedicationForecast[];
  criticalCount: number;
  warningCount: number;
  healthyCount: number;
  totalRecommendedUnits: number;
  totalEstimatedBudgetInr: number;
  totalObservedDispenses30d: number;
  missingCommonEssentials: MissingCommonEssential[];
  csvContent: string;
}

const COMMON_ESSENTIAL_BRANDS = [
  'Dolo-650',
  'Azithral 500',
  'Pan-D',
  'Augmentin 625 Duo',
  'Telma 40',
  'Glycomet-GP 1',
  'Montair LC',
  'Shelcal 500',
  'Crocin Advance',
  'Ecosprin 75',
  'Thyronorm 50',
  'Electral ORS',
];

function getTimestampMs(ts?: { toMillis?: () => number } | number | string): number | null {
  if (!ts) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof ts.toMillis === 'function') {
    return ts.toMillis();
  }
  return null;
}

function daysBetweenToday(isoDate: string): number | null {
  if (!isoDate) return null;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  return Math.floor((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(days)));
  return d.toISOString().slice(0, 10);
}

function shortDateLabel(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

/**
 * Estimates baseline daily unit velocity for common medications using therapeutic turnover
 * and pharmacy reorder thresholds when a batch does not yet have multi-week ledger history.
 */
function estimateBaselineDailyVelocity(
  medicineName: string,
  therapeuticClass: string,
  reorderThreshold: number
): number {
  const nameLow = medicineName.toLowerCase();
  const classLow = therapeuticClass.toLowerCase();

  let classRate = Math.max(1.2, reorderThreshold / 14);
  if (/dolo|crocin|calpol|paracetamol|electral|ors|combiflam/.test(nameLow) || /analgesic|antipyretic/.test(classLow)) {
    classRate = Math.max(classRate, 6.2);
  } else if (/azithral|augmentin|antibiotic/.test(nameLow) || /antibiotic/.test(classLow)) {
    classRate = Math.max(classRate, 3.6);
  } else if (/pan-d|omez|ppi|gastro/.test(nameLow) || /gastro|ppi/.test(classLow)) {
    classRate = Math.max(classRate, 4.4);
  } else if (/telma|glycomet|thyronorm|atorva|ecosprin|amlokind|metpure/.test(nameLow) || /chronic|antidiabetic|antihypertensive|statin/.test(classLow)) {
    classRate = Math.max(classRate, 3.8);
  } else if (/montair|allegra|okacet|shelcal|zincovit|limcee|becosules/.test(nameLow) || /antihistamine|vitamin|supplement/.test(classLow)) {
    classRate = Math.max(classRate, 3.2);
  }

  return Number(Math.min(25, Math.max(0.8, classRate)).toFixed(1));
}

function roundToPackMultiple(qty: number): number {
  if (qty <= 0) return 0;
  if (qty <= 20) return Math.ceil(qty / 5) * 5;
  return Math.ceil(qty / 10) * 10;
}

/**
 * Computes deterministic predictive inventory trends, stockout dates, restocking alerts,
 * and recommended order quantities from live pharmacy batches and immutable ledger movements.
 */
export function buildPredictiveInventorySummary(
  batches: InventoryBatch[],
  ledger: InventoryLedgerEntry[],
  options?: {
    horizonDays?: number;
    leadTimeDays?: number;
    nearExpiryDays?: number;
  }
): PredictiveInventorySummary {
  const horizonDays = Math.min(90, Math.max(7, options?.horizonDays ?? 30));
  const leadTimeDays = Math.min(21, Math.max(1, options?.leadTimeDays ?? 5));
  const nearExpiryDays = options?.nearExpiryDays ?? 90;
  const nowMs = Date.now();
  const dayMs = 86_400_000;

  // Group batches by normalized medicine name
  const grouped = new Map<string, InventoryBatch[]>();
  for (const batch of batches) {
    const key = batch.medicineName.trim().toLowerCase();
    const list = grouped.get(key) || [];
    list.push(batch);
    grouped.set(key, list);
  }

  // Group ledger outflow movements (last 30d and last 7d for recency trend)
  const outflowsByMed = new Map<
    string,
    { last7d: number; last30d: number; earliestMs: number; eventCount: number }
  >();
  let totalObservedDispenses30d = 0;

  for (const entry of ledger) {
    if (entry.quantityDelta >= 0) continue;
    if (!['DISPENSE', 'TRANSFER', 'ADJUSTMENT', 'RECONCILIATION'].includes(entry.movementType)) continue;

    const ts = getTimestampMs(entry.createdAt) ?? nowMs;
    const ageDays = Math.max(0, (nowMs - ts) / dayMs);
    if (ageDays > 30) continue;

    const qty = Math.abs(entry.quantityDelta);
    const key = entry.medicineName.trim().toLowerCase();
    const cur = outflowsByMed.get(key) || {
      last7d: 0,
      last30d: 0,
      earliestMs: ts,
      eventCount: 0,
    };
    cur.last30d += qty;
    if (ageDays <= 7) cur.last7d += qty;
    cur.earliestMs = Math.min(cur.earliestMs, ts);
    cur.eventCount += 1;
    outflowsByMed.set(key, cur);
    totalObservedDispenses30d += qty;
  }

  const forecasts: MedicationForecast[] = [];

  for (const [key, medBatches] of grouped.entries()) {
    // Sort by earliest expiry first (FEFO - First Expired, First Out)
    const sorted = [...medBatches].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    const representative = sorted[0];
    const catMatch = NORMALIZED_MEDICINE_CATALOGUE.find(
      (c) =>
        c.brandName.toLowerCase() === key ||
        c.aliases.some((a) => a.toLowerCase() === key) ||
        (representative.genericName &&
          c.genericName.toLowerCase().includes(representative.genericName.toLowerCase()))
    );

    const therapeuticClass = catMatch?.therapeuticClass || 'General Dispensing';
    const currentTotalStock = sorted.reduce((s, b) => s + b.quantityOnHand, 0);
    const totalReorderThreshold = sorted.reduce((s, b) => s + b.reorderThreshold, 0);
    const effectiveReorderThreshold = Math.max(
      15,
      Math.round(totalReorderThreshold / Math.max(1, sorted.length) * (sorted.length > 1 ? 1.35 : 1))
    );
    const avgUnitPrice =
      sorted.reduce((s, b) => s + (b.unitPrice || 0), 0) / Math.max(1, sorted.length) ||
      catMatch?.referencePriceInr ||
      50;

    // Classify expiry across batches for this medication
    let usableStock = 0;
    let expiringInHorizonUnits = 0;
    let nearestValidExpiryDate = sorted[0].expiryDate;
    let nearestExpiryDays: number | null = null;

    const expiryEvents: Array<{ day: number; units: number }> = [];

    for (const b of sorted) {
      const dLeft = daysBetweenToday(b.expiryDate);
      if (nearestExpiryDays === null || (dLeft !== null && dLeft < nearestExpiryDays)) {
        nearestExpiryDays = dLeft;
        nearestValidExpiryDate = b.expiryDate;
      }
      if (dLeft !== null && dLeft < 0) {
        // Already expired — not usable
        continue;
      }
      usableStock += b.quantityOnHand;
      if (dLeft !== null && dLeft <= horizonDays) {
        expiringInHorizonUnits += b.quantityOnHand;
        expiryEvents.push({ day: dLeft, units: b.quantityOnHand });
      }
    }

    // Compute velocity: Observed vs Hybrid vs Baseline
    const baselineRate = estimateBaselineDailyVelocity(
      representative.medicineName,
      therapeuticClass,
      effectiveReorderThreshold
    );
    const flow = outflowsByMed.get(key);
    let dailyBurnRate = baselineRate;
    let velocitySource: VelocitySource = 'baseline';
    let trendDirection: TrendDirection = 'steady';
    const observedDispensed30d = flow?.last30d || 0;

    if (flow && flow.last30d > 0) {
      const observedSpanDays = Math.max(1, Math.min(30, (nowMs - flow.earliestMs) / dayMs + 1));
      const observedAvgDaily = flow.last30d / observedSpanDays;
      const recent7dDaily = flow.last7d / Math.min(7, observedSpanDays);

      if (flow.eventCount >= 3 || observedSpanDays >= 7) {
        // Weighted blend favoring recent 7-day momentum
        dailyBurnRate = Number((recent7dDaily * 0.65 + observedAvgDaily * 0.35).toFixed(1));
        velocitySource = 'observed';
      } else {
        // Blend early real dispenses with clinical baseline prior
        dailyBurnRate = Number((observedAvgDaily * 0.55 + baselineRate * 0.45).toFixed(1));
        velocitySource = 'hybrid';
      }

      if (recent7dDaily > baselineRate * 1.2 || recent7dDaily > observedAvgDaily * 1.15) {
        trendDirection = 'rising';
      } else if (recent7dDaily < baselineRate * 0.7) {
        trendDirection = 'cooling';
      }
    } else if (usableStock <= effectiveReorderThreshold) {
      trendDirection = 'rising';
    }

    dailyBurnRate = Math.max(0.5, Number(dailyBurnRate.toFixed(1)));

    // Simulate day-by-day FEFO stock depletion (incorporating both daily consumption and batch expiries)
    const stepCount = 12;
    const projectionSeries: StockProjectionPoint[] = [];
    let stockoutDay: number | null = null;

    // Exact daily simulation up to max(horizonDays, 60)
    const simMaxDays = Math.max(horizonDays, 60);
    const simBatches = sorted
      .map((b) => ({
        qty: (daysBetweenToday(b.expiryDate) ?? 365) < 0 ? 0 : b.quantityOnHand,
        expDay: daysBetweenToday(b.expiryDate) ?? 365,
      }))
      .filter((b) => b.qty > 0);

    const dailySnapshots: Array<{ day: number; stock: number; dropped: number }> = [
      { day: 0, stock: Math.round(usableStock), dropped: 0 },
    ];

    if (usableStock <= 0) {
      stockoutDay = 0;
    }

    for (let d = 1; d <= simMaxDays; d++) {
      let dropped = 0;
      for (const sb of simBatches) {
        if (sb.expDay < d && sb.qty > 0) {
          dropped += sb.qty;
          sb.qty = 0;
        }
      }
      // Consume FEFO
      let toConsume = dailyBurnRate;
      for (const sb of simBatches) {
        if (toConsume <= 0) break;
        if (sb.qty > 0) {
          const take = Math.min(sb.qty, toConsume);
          sb.qty -= take;
          toConsume -= take;
        }
      }
      const remaining = simBatches.reduce((sum, sb) => sum + sb.qty, 0);
      dailySnapshots.push({ day: d, stock: Math.max(0, Math.round(remaining)), dropped: Math.round(dropped) });
      if (stockoutDay === null && remaining <= 0.5) {
        stockoutDay = d;
      }
    }

    for (let i = 0; i <= stepCount; i++) {
      const targetDay = Math.round((horizonDays * i) / stepCount);
      const snap = dailySnapshots[Math.min(targetDay, dailySnapshots.length - 1)];
      projectionSeries.push({
        day: targetDay,
        dateLabel: targetDay === 0 ? 'Today' : shortDateLabel(targetDay),
        projectedStock: snap.stock,
        expiryDropUnits: expiryEvents
          .filter((e) => e.day > (i === 0 ? -1 : Math.round((horizonDays * (i - 1)) / stepCount)) && e.day <= targetDay)
          .reduce((s, e) => s + e.units, 0),
      });
    }

    const daysUntilStockout =
      stockoutDay !== null
        ? stockoutDay
        : dailyBurnRate > 0
          ? Math.round(usableStock / dailyBurnRate)
          : null;
    const projectedStockoutDate = daysUntilStockout !== null ? addDaysIso(daysUntilStockout) : null;

    // Recommended Order Quantity = Demand over (horizon + leadTime) + safety buffer - projected remaining usable stock
    const safetyBuffer = Math.max(effectiveReorderThreshold, Math.ceil(dailyBurnRate * leadTimeDays));
    const targetDemandUnits = dailyBurnRate * (horizonDays + leadTimeDays) + safetyBuffer;
    const endOfHorizonUsable = dailySnapshots[Math.min(horizonDays, dailySnapshots.length - 1)]?.stock ?? 0;
    const needsExpiryReplacement =
      nearestExpiryDays !== null && nearestExpiryDays <= Math.min(nearExpiryDays, horizonDays + 15);

    let riskLevel: ForecastRiskLevel = 'healthy';
    const reasons: string[] = [];

    if (usableStock <= 0) {
      riskLevel = 'critical';
      reasons.push('Out of usable stock (0 units)');
    } else if (usableStock <= effectiveReorderThreshold) {
      riskLevel = 'critical';
      reasons.push(`Below reorder threshold (${usableStock} ≤ ${effectiveReorderThreshold})`);
    } else if (daysUntilStockout !== null && daysUntilStockout <= leadTimeDays + 4) {
      riskLevel = 'critical';
      reasons.push(`Projected stockout in ${daysUntilStockout}d (inside ${leadTimeDays}d supplier lead time)`);
    } else if (
      (daysUntilStockout !== null && daysUntilStockout <= horizonDays) ||
      endOfHorizonUsable <= effectiveReorderThreshold ||
      needsExpiryReplacement
    ) {
      riskLevel = 'warning';
      if (daysUntilStockout !== null && daysUntilStockout <= horizonDays) {
        reasons.push(`Projected stockout in ${daysUntilStockout}d (${projectedStockoutDate})`);
      } else if (endOfHorizonUsable <= effectiveReorderThreshold) {
        reasons.push(`Projected to cross reorder threshold within ${horizonDays}d`);
      }
      if (needsExpiryReplacement && nearestExpiryDays !== null) {
        reasons.push(
          nearestExpiryDays < 0
            ? 'Contains expired batch needing fresh replacement'
            : `Active batch expires in ${nearestExpiryDays}d`
        );
      }
    } else {
      reasons.push(
        daysUntilStockout !== null
          ? `Healthy cover (~${daysUntilStockout} days of stock at ${dailyBurnRate}/day)`
          : 'Healthy stock coverage'
      );
    }

    const rawDeficit =
      riskLevel === 'healthy'
        ? 0
        : Math.max(
            targetDemandUnits - Math.max(0, usableStock - expiringInHorizonUnits),
            effectiveReorderThreshold * 2
          );
    const recommendedOrderQty = riskLevel === 'healthy' ? 0 : roundToPackMultiple(rawDeficit);
    const estimatedOrderCostInr = Math.round(recommendedOrderQty * avgUnitPrice);

    forecasts.push({
      key,
      medicineName: representative.medicineName,
      genericName: representative.genericName || catMatch?.genericName || '',
      therapeuticClass,
      primaryBatchId: representative.id,
      primaryBatchNumber: representative.batchNumber,
      batchCount: sorted.length,
      supplierName: representative.supplierName || 'Authorized Pharma Distributor',
      currentTotalStock,
      usableStock,
      expiringInHorizonUnits,
      nearestExpiryDate: nearestValidExpiryDate,
      nearestExpiryDays,
      reorderThreshold: effectiveReorderThreshold,
      avgUnitPrice: Math.round(avgUnitPrice),
      observedDispensed30d,
      dailyBurnRate,
      velocitySource,
      trendDirection,
      daysUntilStockout,
      projectedStockoutDate,
      riskLevel,
      recommendedOrderQty,
      estimatedOrderCostInr,
      restockReason: reasons.join(' · '),
      projectionSeries,
    });
  }

  // Sort most urgent first (critical -> warning -> healthy, then earliest stockout)
  const riskOrder: Record<ForecastRiskLevel, number> = { critical: 0, warning: 1, healthy: 2 };
  forecasts.sort((a, b) => {
    if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) {
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    }
    const da = a.daysUntilStockout ?? 9999;
    const db = b.daysUntilStockout ?? 9999;
    return da - db;
  });

  // Identify common essential medicines not currently stocked at all
  const stockedKeys = new Set(forecasts.map((f) => f.key));
  const missingCommonEssentials: MissingCommonEssential[] = [];

  for (const brand of COMMON_ESSENTIAL_BRANDS) {
    const brandLow = brand.toLowerCase();
    const isStocked =
      stockedKeys.has(brandLow) ||
      Array.from(stockedKeys).some((k) => k.includes(brandLow) || brandLow.includes(k));
    if (!isStocked) {
      const cat = NORMALIZED_MEDICINE_CATALOGUE.find(
        (m) => m.brandName.toLowerCase() === brandLow
      );
      if (cat) {
        const baseVel = estimateBaselineDailyVelocity(cat.brandName, cat.therapeuticClass, 25);
        const suggestedInitialQty = roundToPackMultiple(baseVel * 20);
        missingCommonEssentials.push({
          productId: cat.productId,
          brandName: cat.brandName,
          genericName: cat.genericName,
          strength: cat.strength,
          dosageForm: cat.dosageForm,
          manufacturer: cat.manufacturer,
          therapeuticClass: cat.therapeuticClass,
          suggestedInitialQty,
          referencePriceInr: cat.referencePriceInr,
          estimatedCostInr: Math.round(suggestedInitialQty * cat.referencePriceInr),
          rationale: `High-turnover ${cat.therapeuticClass} essential (0 units currently stocked · est. ~${baseVel}/day demand).`,
        });
      }
    }
  }

  const restockNeeded = forecasts.filter((f) => f.riskLevel !== 'healthy');
  const criticalCount = forecasts.filter((f) => f.riskLevel === 'critical').length;
  const warningCount = forecasts.filter((f) => f.riskLevel === 'warning').length;
  const healthyCount = forecasts.filter((f) => f.riskLevel === 'healthy').length;
  const totalRecommendedUnits = restockNeeded.reduce((s, f) => s + f.recommendedOrderQty, 0);
  const totalEstimatedBudgetInr = restockNeeded.reduce((s, f) => s + f.estimatedOrderCostInr, 0);

  const csvRows = [
    'Medicine Name,Generic Name,Primary Batch,Risk Level,Usable Stock,Daily Burn Rate,Velocity Basis,Days Until Stockout,Projected Stockout Date,Recommended Order Qty,Est. Unit Price (INR),Est. Order Total (INR),Preferred Supplier,Restock Rationale',
    ...restockNeeded.map((f) =>
      [
        `"${f.medicineName.replace(/"/g, '""')}"`,
        `"${f.genericName.replace(/"/g, '""')}"`,
        `"${f.primaryBatchNumber.replace(/"/g, '""')}"`,
        f.riskLevel.toUpperCase(),
        f.usableStock,
        f.dailyBurnRate,
        f.velocitySource,
        f.daysUntilStockout ?? 'N/A',
        f.projectedStockoutDate ?? 'N/A',
        f.recommendedOrderQty,
        f.avgUnitPrice,
        f.estimatedOrderCostInr,
        `"${f.supplierName.replace(/"/g, '""')}"`,
        `"${f.restockReason.replace(/"/g, '""')}"`,
      ].join(',')
    ),
  ];

  return {
    horizonDays,
    leadTimeDays,
    generatedAt: new Date().toISOString(),
    forecasts,
    restockNeeded,
    criticalCount,
    warningCount,
    healthyCount,
    totalRecommendedUnits,
    totalEstimatedBudgetInr,
    totalObservedDispenses30d,
    missingCommonEssentials,
    csvContent: csvRows.join('\n'),
  };
}
