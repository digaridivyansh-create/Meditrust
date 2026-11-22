import {
  addTraceabilityEvent,
  createSafetyAlert,
  logAuditEvent,
  receiveInventoryStock,
  recordStockMovement,
  updateAlertStatus,
  updateBatchSettings,
  type WorkspaceData,
} from './firestoreService';
import type { MovementType, SafetyAlert, TraceEventType, UserProfile, VerificationStatus } from '../types';

export interface PlannedPharmacyAction {
  actionId: string;
  toolName:
    | 'receive_stock_batch'
    | 'record_stock_movement'
    | 'quarantine_or_flag_batch'
    | 'create_safety_alert'
    | 'resolve_safety_alert'
    | 'log_distributor_handoff';
  title: string;
  summary: string;
  severity: 'info' | 'warning' | 'critical';
  args: Record<string, unknown>;
  resolvedTargetLabel?: string;
}

export interface PurchaseOrderLineItem {
  medicineName: string;
  batchNumber: string;
  supplierName: string;
  currentStock: number;
  reorderThreshold: number;
  recommendedOrderQty: number;
  unitPrice: number;
  estimatedLineTotal: number;
  reason: string;
}

export interface PurchaseOrderDraft {
  poNumber: string;
  generatedAt: string;
  pharmacyName: string;
  items: PurchaseOrderLineItem[];
  totalUnits: number;
  estimatedTotalInr: number;
  csvContent: string;
}

export interface RiskAuditReport {
  generatedAt: string;
  totalBatches: number;
  totalUnits: number;
  expiredCount: number;
  nearExpiryCount: number;
  lowStockCount: number;
  quarantinedOrSuspiciousCount: number;
  missingUpstreamDispatchCount: number;
  openAlertsCount: number;
  pendingReviewScansCount: number;
  findings: Array<{
    severity: 'critical' | 'warning' | 'info';
    category: string;
    detail: string;
  }>;
}

export interface PharmacistAiAgentResponse {
  reply: string;
  proposedActions: PlannedPharmacyAction[];
  purchaseOrder?: PurchaseOrderDraft;
  riskAudit?: RiskAuditReport;
  model: string;
  respondedAt: string;
}

export interface ActionExecutionResult {
  ok: boolean;
  message: string;
}

/**
 * Builds a compact live workspace snapshot sent to `/api/v1/pharmacist/ai-agent`
 * so Gemini Function Calling binds to real batch IDs, stock counts, and open alerts.
 */
export function buildPharmacyWorkspaceSnapshot(data: WorkspaceData, profile: UserProfile | null) {
  const dispatchedBatchIds = new Set(
    data.traceEvents.filter((t) => t.eventType === 'DISPATCHED').map((t) => t.batchId)
  );

  return {
    pharmacyName: profile?.pharmacyName || 'Authorized Pharmacy',
    licenseNumber: profile?.licenseNumber || '',
    city: profile?.city || '',
    nearExpiryDays: profile?.nearExpiryDays || 90,
    batches: data.batches.map((b) => ({
      id: b.id,
      medicineName: b.medicineName,
      genericName: b.genericName || '',
      strength: b.strength || '',
      manufacturer: b.manufacturer,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      supplierName: b.supplierName,
      quantityOnHand: b.quantityOnHand,
      reorderThreshold: b.reorderThreshold,
      unitPrice: b.unitPrice,
      verificationStatus: b.verificationStatus,
      recallFlagged: b.recallFlagged,
      hasUpstreamDispatch: dispatchedBatchIds.has(b.id),
    })),
    openAlerts: data.alerts
      .filter((a) => a.status !== 'resolved')
      .map((a) => ({
        id: a.id,
        title: a.title,
        alertType: a.alertType,
        severity: a.severity,
        status: a.status,
        affectedProduct: a.affectedProduct || '',
        affectedBatch: a.affectedBatch || '',
      })),
    pendingReviewScansCount: data.scans.filter(
      (s) => s.reviewStatus === 'pending_review' || s.reviewStatus === 'escalated'
    ).length,
  };
}

/**
 * Executes a real pharmacist operation against Firestore / Local Workspace
 * and writes an immutable `AI_AGENT_EXECUTED` audit trail entry.
 */
export async function executePharmacistAiAction(
  action: PlannedPharmacyAction,
  ctx: {
    ownerId: string;
    actorName: string;
    pharmacyName: string;
    data: WorkspaceData;
  }
): Promise<ActionExecutionResult> {
  const { ownerId, actorName, pharmacyName, data } = ctx;
  const args = action.args;

  try {
    if (action.toolName === 'receive_stock_batch') {
      const medicineName = String(args.medicineName || '').trim();
      const batchNumber = String(args.batchNumber || '').trim();
      const expiryDate = String(args.expiryDate || '').trim();
      const quantity = Math.max(1, Math.round(Number(args.quantity) || 50));

      if (!medicineName || !batchNumber || !expiryDate) {
        return { ok: false, message: 'Missing required medicine name, batch number, or expiry date.' };
      }

      const batchId = await receiveInventoryStock({
        ownerId,
        pharmacyName,
        actorName: `${actorName} (via AI Copilot)`,
        medicineName,
        genericName: String(args.genericName || ''),
        strength: String(args.strength || ''),
        dosageForm: String(args.dosageForm || 'Tablet'),
        manufacturer: String(args.manufacturer || 'Licensed Manufacturer'),
        batchNumber,
        mfgDate: String(args.mfgDate || ''),
        expiryDate,
        supplierName: String(args.supplierName || 'Authorized Distributor'),
        invoiceRef: String(args.invoiceRef || ''),
        quantity,
        reorderThreshold: Math.max(5, Math.round(Number(args.reorderThreshold) || 25)),
        unitPrice: Math.max(0, Number(args.unitPrice) || 50),
        verificationStatus: 'needs_review',
      });

      await logAuditEvent({
        ownerId,
        portalRole: 'pharmacist',
        actorName,
        action: 'AI_AGENT_RECEIVE_BATCH',
        targetType: 'inventory_batch',
        targetId: batchId,
        details: `AI Copilot received ${quantity} units of ${medicineName} (Batch ${batchNumber}, Exp ${expiryDate}).`,
      });

      return {
        ok: true,
        message: `Received ${quantity} units of ${medicineName} (Batch ${batchNumber}) into live inventory & ledger.`,
      };
    }

    if (action.toolName === 'record_stock_movement') {
      const targetBatch =
        data.batches.find((b) => b.id === String(args.batchId || '')) ||
        data.batches.find(
          (b) => b.batchNumber.toLowerCase() === String(args.batchNumber || '').toLowerCase()
        ) ||
        data.batches.find((b) =>
          b.medicineName.toLowerCase().includes(String(args.medicineName || '').toLowerCase())
        );

      if (!targetBatch) {
        return {
          ok: false,
          message: `Batch "${String(args.batchNumber || args.medicineName || 'Unknown')}" was not found in active inventory.`,
        };
      }

      const rawMove = String(args.movementType || 'DISPENSE').toUpperCase();
      const allowedMoves: MovementType[] = ['RECEIPT', 'DISPENSE', 'RETURN', 'ADJUSTMENT', 'TRANSFER', 'RECONCILIATION'];
      const movementType: MovementType = allowedMoves.includes(rawMove as MovementType)
        ? (rawMove as MovementType)
        : 'ADJUSTMENT';
      const quantityDelta = Math.round(Number(args.quantityDelta) || 0);
      if (quantityDelta === 0) {
        return { ok: false, message: 'Quantity delta is 0; no stock adjustment needed.' };
      }

      const newBalance = await recordStockMovement({
        ownerId,
        batch: targetBatch,
        movementType,
        quantityDelta,
        reason: String(args.reason || `AI Copilot ${movementType}`),
        invoiceRef: String(args.invoiceRef || '') || undefined,
        actorName: `${actorName} (via AI Copilot)`,
      });

      await logAuditEvent({
        ownerId,
        portalRole: 'pharmacist',
        actorName,
        action: `AI_AGENT_${movementType}`,
        targetType: 'inventory_batch',
        targetId: targetBatch.id,
        details: `AI Copilot recorded ${movementType} (${quantityDelta >= 0 ? '+' : ''}${quantityDelta}) on ${targetBatch.medicineName} (${targetBatch.batchNumber}). New balance: ${newBalance}.`,
      });

      return {
        ok: true,
        message: `Recorded ${movementType} (${quantityDelta >= 0 ? '+' : ''}${quantityDelta}) on ${targetBatch.medicineName} (${targetBatch.batchNumber}). New stock: ${newBalance} units.`,
      };
    }

    if (action.toolName === 'quarantine_or_flag_batch') {
      const targetBatch =
        data.batches.find((b) => b.id === String(args.batchId || '')) ||
        data.batches.find(
          (b) => b.batchNumber.toLowerCase() === String(args.batchNumber || '').toLowerCase()
        ) ||
        data.batches.find((b) =>
          b.medicineName.toLowerCase().includes(String(args.medicineName || '').toLowerCase())
        );

      if (!targetBatch) {
        return {
          ok: false,
          message: `Batch "${String(args.batchNumber || args.medicineName || 'Unknown')}" not found in inventory.`,
        };
      }

      const quarantine = Boolean(args.quarantine);
      const nextStatus = (String(
        args.verificationStatus || (quarantine ? 'mismatch_suspicious' : targetBatch.verificationStatus)
      ) as VerificationStatus);
      const reason = String(args.reason || 'Quarantined via Pharmacy AI Copilot');

      await updateBatchSettings(targetBatch.id, {
        reorderThreshold:
          args.reorderThreshold !== undefined
            ? Math.max(0, Math.round(Number(args.reorderThreshold)))
            : targetBatch.reorderThreshold,
        unitPrice:
          args.unitPrice !== undefined ? Math.max(0, Number(args.unitPrice)) : targetBatch.unitPrice,
        verificationStatus: nextStatus,
        recallFlagged: quarantine ? true : targetBatch.recallFlagged,
      });

      if (quarantine) {
        await addTraceabilityEvent({
          ownerId,
          batchId: targetBatch.id,
          batchNumber: targetBatch.batchNumber,
          medicineName: targetBatch.medicineName,
          eventType: 'QUARANTINED',
          actorOrg: pharmacyName,
          sourceLocation: pharmacyName,
          destinationLocation: `${pharmacyName} — Quarantine Cage`,
          quantity: targetBatch.quantityOnHand,
          evidenceRef: 'AI-QUARANTINE',
          notes: reason,
          eventDate: new Date().toISOString().slice(0, 10),
        });

        await createSafetyAlert({
          ownerId,
          portalRole: 'pharmacist',
          alertType: 'mismatch',
          severity: 'critical',
          title: `Quarantined Batch: ${targetBatch.medicineName} (${targetBatch.batchNumber})`,
          triggerDetails: reason,
          affectedProduct: targetBatch.medicineName,
          affectedBatch: targetBatch.batchNumber,
          sourceReference: 'MediTrust AI Pharmacy Copilot',
        });
      }

      await logAuditEvent({
        ownerId,
        portalRole: 'pharmacist',
        actorName,
        action: quarantine ? 'AI_AGENT_QUARANTINE_BATCH' : 'AI_AGENT_UPDATE_BATCH',
        targetType: 'inventory_batch',
        targetId: targetBatch.id,
        details: `${quarantine ? 'Quarantined' : 'Updated'} ${targetBatch.medicineName} (${targetBatch.batchNumber}) → ${nextStatus}. Reason: ${reason}`,
      });

      return {
        ok: true,
        message: quarantine
          ? `Batch ${targetBatch.batchNumber} (${targetBatch.medicineName}) quarantined, recall-flagged, logged to custody timeline, and escalated to Safety Alerts.`
          : `Updated ${targetBatch.medicineName} (${targetBatch.batchNumber}) status to ${nextStatus}.`,
      };
    }

    if (action.toolName === 'create_safety_alert') {
      const allowedAlerts: SafetyAlert['alertType'][] = [
        'expired',
        'near_expiry',
        'low_stock',
        'recall',
        'mismatch',
        'document_flag',
      ];
      const rawAlert = String(args.alertType || 'mismatch').toLowerCase();
      const alertType: SafetyAlert['alertType'] = allowedAlerts.includes(rawAlert as SafetyAlert['alertType'])
        ? (rawAlert as SafetyAlert['alertType'])
        : 'mismatch';
      const severity = (['critical', 'warning', 'info'].includes(String(args.severity))
        ? String(args.severity)
        : 'warning') as SafetyAlert['severity'];
      const title = String(args.title || 'AI Safety Alert');

      const alertId = await createSafetyAlert({
        ownerId,
        portalRole: 'pharmacist',
        alertType,
        severity,
        title,
        triggerDetails: String(args.triggerDetails || title),
        affectedProduct: String(args.affectedProduct || '') || undefined,
        affectedBatch: String(args.affectedBatch || '') || undefined,
        sourceReference: 'MediTrust AI Pharmacy Copilot',
      });

      await logAuditEvent({
        ownerId,
        portalRole: 'pharmacist',
        actorName,
        action: 'AI_AGENT_CREATE_ALERT',
        targetType: 'safety_alert',
        targetId: alertId,
        details: `Created ${severity} alert "${title}".`,
      });

      return { ok: true, message: `Safety alert "${title}" created in your Alerts queue.` };
    }

    if (action.toolName === 'resolve_safety_alert') {
      const alertIds = Array.isArray(args.alertIds) ? args.alertIds.map(String).filter(Boolean) : [];
      const nextStatus = String(args.nextStatus) === 'resolved' ? 'resolved' : 'acknowledged';

      if (alertIds.length === 0) {
        return { ok: false, message: 'No matching open alerts found to update.' };
      }

      for (const id of alertIds) {
        await updateAlertStatus(id, nextStatus);
      }

      await logAuditEvent({
        ownerId,
        portalRole: 'pharmacist',
        actorName,
        action: 'AI_AGENT_UPDATE_ALERTS',
        targetType: 'safety_alert',
        targetId: alertIds[0],
        details: `Marked ${alertIds.length} safety alert(s) as ${nextStatus}. Note: ${String(args.note || 'AI Copilot action')}`,
      });

      return {
        ok: true,
        message: `Marked ${alertIds.length} safety alert(s) as ${nextStatus}.`,
      };
    }

    if (action.toolName === 'log_distributor_handoff') {
      const targetBatch =
        data.batches.find((b) => b.id === String(args.batchId || '')) ||
        data.batches.find(
          (b) => b.batchNumber.toLowerCase() === String(args.batchNumber || '').toLowerCase()
        ) ||
        data.batches.find((b) =>
          b.medicineName.toLowerCase().includes(String(args.medicineName || '').toLowerCase())
        );

      if (!targetBatch) {
        return {
          ok: false,
          message: `Batch "${String(args.batchNumber || args.medicineName || 'Unknown')}" not found for custody logging.`,
        };
      }

      const allowedTraces: TraceEventType[] = [
        'MANUFACTURED',
        'DISPATCHED',
        'RECEIVED',
        'TRANSFERRED',
        'DISPENSED',
        'QUARANTINED',
      ];
      const rawTrace = String(args.eventType || 'DISPATCHED').toUpperCase();
      const eventType: TraceEventType = allowedTraces.includes(rawTrace as TraceEventType)
        ? (rawTrace as TraceEventType)
        : 'DISPATCHED';
      const traceId = await addTraceabilityEvent({
        ownerId,
        batchId: targetBatch.id,
        batchNumber: targetBatch.batchNumber,
        medicineName: targetBatch.medicineName,
        eventType,
        actorOrg: String(args.actorOrg || targetBatch.supplierName),
        sourceLocation: String(args.sourceLocation || targetBatch.supplierName),
        destinationLocation: String(args.destinationLocation || pharmacyName),
        quantity: Math.max(1, Math.round(Number(args.quantity) || targetBatch.quantityOnHand)),
        evidenceRef: String(args.evidenceRef || '') || undefined,
        notes: String(args.notes || 'Logged via MediTrust AI Pharmacy Copilot'),
        eventDate: new Date().toISOString().slice(0, 10),
      });

      await logAuditEvent({
        ownerId,
        portalRole: 'pharmacist',
        actorName,
        action: 'AI_AGENT_TRACE_HANDOFF',
        targetType: 'traceability_event',
        targetId: traceId,
        details: `Logged ${eventType} custody event for ${targetBatch.medicineName} (${targetBatch.batchNumber}) via ${String(args.actorOrg || targetBatch.supplierName)}.`,
      });

      return {
        ok: true,
        message: `Logged ${eventType} custody event for ${targetBatch.medicineName} (${targetBatch.batchNumber}) in Supply Chain Traceability.`,
      };
    }

    return { ok: false, message: `Unsupported tool action: ${action.toolName}` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Failed to execute pharmacy action.',
    };
  }
}
