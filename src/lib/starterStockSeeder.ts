import {
  addTraceabilityEvent,
  createSafetyAlert,
  logAuditEvent,
  receiveInventoryStock,
} from './firestoreService';
import { buildStarterPharmacyStockBatches } from './medicineDataset';
import { computeExpiryStatus } from './utils';
import type { InventoryBatch } from '../types';

/**
 * Seeds the curated 8-batch Indian/Global Starter Medicine Stock Dataset into the signed-in
 * pharmacist's isolated workspace. Skips any batch number already present so it is safe to re-run.
 */
export async function seedStarterPharmacyStock(params: {
  ownerId: string;
  pharmacyName: string;
  actorName: string;
  existingBatches: InventoryBatch[];
  nearExpiryDays?: number;
}): Promise<{ addedCount: number; skippedCount: number }> {
  const { ownerId, pharmacyName, actorName, existingBatches, nearExpiryDays = 90 } = params;
  const existingNumbers = new Set(
    existingBatches.map((b) => b.batchNumber.trim().toLowerCase())
  );

  const templates = buildStarterPharmacyStockBatches();
  let addedCount = 0;
  let skippedCount = 0;

  for (const item of templates) {
    if (existingNumbers.has(item.batchNumber.trim().toLowerCase())) {
      skippedCount++;
      continue;
    }

    const batchId = await receiveInventoryStock({
      ownerId,
      pharmacyName: pharmacyName || 'Authorized Pharmacy',
      actorName: actorName || 'Pharmacist',
      medicineName: item.medicineName,
      genericName: item.genericName,
      strength: item.strength,
      dosageForm: item.dosageForm,
      manufacturer: item.manufacturer,
      batchNumber: item.batchNumber,
      mfgDate: item.mfgDate,
      expiryDate: item.expiryDate,
      supplierName: item.supplierName,
      invoiceRef: item.invoiceRef,
      quantity: item.quantity,
      reorderThreshold: item.reorderThreshold,
      unitPrice: item.unitPrice,
      verificationStatus: item.verificationStatus,
    });

    // Also record the upstream distributor dispatch hand-off for a complete chain of custody
    await addTraceabilityEvent({
      ownerId,
      batchId,
      batchNumber: item.batchNumber,
      medicineName: item.medicineName,
      eventType: 'DISPATCHED',
      actorOrg: item.supplierName,
      sourceLocation: item.distributorSource,
      destinationLocation: pharmacyName || 'Authorized Pharmacy',
      quantity: item.quantity,
      evidenceRef: item.invoiceRef,
      notes: 'Upstream distributor dispatch logged from MediTrust Starter Dataset.',
      eventDate: item.mfgDate || new Date().toISOString().slice(0, 10),
    });

    const expStatus = computeExpiryStatus(item.expiryDate, nearExpiryDays);
    if (expStatus === 'near_expiry' || expStatus === 'expired') {
      await createSafetyAlert({
        ownerId,
        portalRole: 'pharmacist',
        alertType: expStatus,
        severity: expStatus === 'expired' ? 'critical' : 'warning',
        title:
          expStatus === 'expired'
            ? `Expired Stock Batch: ${item.medicineName}`
            : `Near-Expiry Watchlist: ${item.medicineName}`,
        triggerDetails: `Batch ${item.batchNumber} expires on ${item.expiryDate} (Supplier: ${item.supplierName}).`,
        affectedProduct: item.medicineName,
        affectedBatch: item.batchNumber,
        sourceReference: item.invoiceRef,
      });
    } else if (item.quantity <= item.reorderThreshold) {
      await createSafetyAlert({
        ownerId,
        portalRole: 'pharmacist',
        alertType: 'low_stock',
        severity: 'warning',
        title: `Low Stock Reorder Alert: ${item.medicineName}`,
        triggerDetails: `Batch ${item.batchNumber} has ${item.quantity} units on hand (reorder threshold: ${item.reorderThreshold}).`,
        affectedProduct: item.medicineName,
        affectedBatch: item.batchNumber,
        sourceReference: 'Inventory Ledger Engine',
      });
    }

    addedCount++;
  }

  if (addedCount > 0) {
    await logAuditEvent({
      ownerId,
      portalRole: 'pharmacist',
      actorName: actorName || 'Pharmacist',
      action: 'STARTER_DATASET_LOADED',
      targetType: 'inventory_batch',
      targetId: ownerId,
      details: `Loaded ${addedCount} trained starter pharmacy stock batch(es) into isolated inventory & traceability ledger.`,
    });
  }

  return { addedCount, skippedCount };
}
