import type {
  FunctionDeclaration,
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
} from '@google/genai';
import { Type } from '@google/genai';
import { findMedicineInCatalogue } from '../src/lib/medicineDataset.ts';

export interface WorkspaceBatchSummary {
  id: string;
  medicineName: string;
  genericName?: string;
  strength?: string;
  manufacturer: string;
  batchNumber: string;
  expiryDate: string;
  supplierName: string;
  quantityOnHand: number;
  reorderThreshold: number;
  unitPrice: number;
  verificationStatus: string;
  recallFlagged: boolean;
  hasUpstreamDispatch?: boolean;
}

export interface WorkspaceAlertSummary {
  id: string;
  title: string;
  alertType: string;
  severity: string;
  status: string;
  affectedProduct?: string;
  affectedBatch?: string;
}

export interface PharmacyWorkspaceSnapshot {
  pharmacyName: string;
  licenseNumber?: string;
  city?: string;
  nearExpiryDays: number;
  batches: WorkspaceBatchSummary[];
  openAlerts: WorkspaceAlertSummary[];
  pendingReviewScansCount: number;
}

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

export const PHARMACIST_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'receive_stock_batch',
    description:
      'Receive a new medicine stock batch into pharmacy inventory, append an initial RECEIPT ledger record, and record a RECEIVED traceability event. Use whenever the pharmacist asks to add, receive, or stock a new medicine batch.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        medicineName: { type: Type.STRING, description: 'Brand or medicine name (e.g., Crocin Advance, Dolo-650).' },
        batchNumber: { type: Type.STRING, description: 'Printed batch/lot number (e.g., CRC-2026-901).' },
        expiryDate: { type: Type.STRING, description: 'Expiry date in YYYY-MM-DD format.' },
        quantity: { type: Type.NUMBER, description: 'Number of strips/units received (positive integer).' },
        supplierName: { type: Type.STRING, description: 'Authorized distributor or supplier name.' },
        manufacturer: { type: Type.STRING, description: 'Manufacturer name if provided (optional, auto-enriched from catalogue).' },
        genericName: { type: Type.STRING, description: 'Generic salt/composition if provided.' },
        strength: { type: Type.STRING, description: 'Dosage strength e.g. 500 mg.' },
        dosageForm: { type: Type.STRING, description: 'Dosage form e.g. Tablet, Capsule, Syrup.' },
        mfgDate: { type: Type.STRING, description: 'Manufacturing date YYYY-MM-DD if provided.' },
        invoiceRef: { type: Type.STRING, description: 'Supplier invoice reference number.' },
        reorderThreshold: { type: Type.NUMBER, description: 'Low stock alert threshold (defaults to 25).' },
        unitPrice: { type: Type.NUMBER, description: 'Unit/strip price in INR.' },
      },
      required: ['medicineName', 'batchNumber', 'expiryDate', 'quantity'],
    },
  },
  {
    name: 'record_stock_movement',
    description:
      'Update stock quantity for an existing inventory batch by recording an immutable ledger entry: DISPENSE (subtract sold/dispensed units), RECEIPT (add restocked units), RETURN (add returned units), ADJUSTMENT (add or subtract units e.g. expired/damaged write-off), TRANSFER (subtract transferred units), or RECONCILIATION (adjust to physical shelf count).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        batchNumber: { type: Type.STRING, description: 'Target batch number from live inventory.' },
        medicineName: { type: Type.STRING, description: 'Target medicine name (used to locate batch if batchNumber omitted).' },
        movementType: {
          type: Type.STRING,
          description: 'One of: DISPENSE, RECEIPT, RETURN, ADJUSTMENT, TRANSFER, RECONCILIATION',
        },
        quantity: {
          type: Type.NUMBER,
          description:
            'Positive unit count to dispense/restock/return/transfer, negative or positive for ADJUSTMENT, OR for RECONCILIATION the target physical count when isAbsoluteCount=true.',
        },
        isAbsoluteCount: {
          type: Type.BOOLEAN,
          description: 'Set true only when movementType is RECONCILIATION and quantity represents the final physical shelf count.',
        },
        reason: { type: Type.STRING, description: 'Clear operational reason for the immutable audit ledger.' },
        invoiceRef: { type: Type.STRING, description: 'Optional bill/invoice/prescription reference.' },
      },
      required: ['movementType', 'quantity', 'reason'],
    },
  },
  {
    name: 'quarantine_or_flag_batch',
    description:
      'Quarantine a suspect/recalled/expired batch (sets recallFlagged=true and verificationStatus=mismatch_suspicious, logs a QUARANTINED custody event, and raises a critical alert) OR update batch verificationStatus, reorderThreshold, or unitPrice.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        batchNumber: { type: Type.STRING, description: 'Target batch number.' },
        medicineName: { type: Type.STRING, description: 'Target medicine name if batchNumber not given.' },
        quarantine: { type: Type.BOOLEAN, description: 'True to quarantine & flag batch for recall/suspect isolation.' },
        verificationStatus: {
          type: Type.STRING,
          description: 'Optional status: verified_match, needs_review, mismatch_suspicious, not_found.',
        },
        reorderThreshold: { type: Type.NUMBER, description: 'Optional updated reorder threshold.' },
        unitPrice: { type: Type.NUMBER, description: 'Optional updated unit price in INR.' },
        reason: { type: Type.STRING, description: 'Reason for quarantine, flagging, or status update.' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'create_safety_alert',
    description:
      'Create a new operational safety alert in the pharmacy Safety Alerts queue for staff follow-up (e.g., expired, near_expiry, low_stock, recall, mismatch, document_flag).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        alertType: {
          type: Type.STRING,
          description: 'One of: expired, near_expiry, low_stock, recall, mismatch, document_flag',
        },
        severity: { type: Type.STRING, description: 'One of: critical, warning, info' },
        title: { type: Type.STRING, description: 'Short alert title.' },
        triggerDetails: { type: Type.STRING, description: 'Detailed explanation and action needed.' },
        affectedProduct: { type: Type.STRING, description: 'Medicine name.' },
        affectedBatch: { type: Type.STRING, description: 'Batch number if applicable.' },
      },
      required: ['alertType', 'severity', 'title', 'triggerDetails'],
    },
  },
  {
    name: 'resolve_safety_alert',
    description:
      'Acknowledge or resolve one or more open safety alerts in the pharmacy alerts queue.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        alertId: { type: Type.STRING, description: 'Specific alert ID from openAlerts if known.' },
        affectedBatch: { type: Type.STRING, description: 'Match open alert(s) by batch number.' },
        alertType: { type: Type.STRING, description: 'Match open alert(s) by alertType (e.g., low_stock, near_expiry).' },
        nextStatus: { type: Type.STRING, description: 'Either acknowledged or resolved.' },
        note: { type: Type.STRING, description: 'Audit note explaining why the alert was acknowledged/resolved.' },
      },
      required: ['nextStatus'],
    },
  },
  {
    name: 'log_distributor_handoff',
    description:
      'Record an upstream distributor DISPATCHED event or downstream TRANSFERRED/DISPENSED/QUARANTINED supply chain custody event in traceability_events.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        batchNumber: { type: Type.STRING, description: 'Target batch number.' },
        medicineName: { type: Type.STRING, description: 'Target medicine name.' },
        eventType: { type: Type.STRING, description: 'One of: MANUFACTURED, DISPATCHED, RECEIVED, TRANSFERRED, DISPENSED, QUARANTINED' },
        actorOrg: { type: Type.STRING, description: 'Distributor, warehouse, or pharmacy organization name.' },
        sourceLocation: { type: Type.STRING, description: 'Origin warehouse/depot location.' },
        destinationLocation: { type: Type.STRING, description: 'Destination pharmacy/warehouse location.' },
        quantity: { type: Type.NUMBER, description: 'Quantity of units moved.' },
        evidenceRef: { type: Type.STRING, description: 'Invoice, challan, or dispatch note reference.' },
        notes: { type: Type.STRING, description: 'Custody hand-off notes.' },
      },
      required: ['eventType', 'actorOrg'],
    },
  },
  {
    name: 'generate_reorder_purchase_order',
    description:
      'Analyze all current inventory batches that are at/below reorderThreshold or approaching expiry and generate a structured, downloadable supplier Reorder Purchase Order (PO) with quantities and estimated INR cost.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        includeNearExpiry: {
          type: Type.BOOLEAN,
          description: 'Whether to also include near-expiry batches that need fresh replacement stock (defaults to true).',
        },
        targetCoverageMultiplier: {
          type: Type.NUMBER,
          description: 'Target stock multiple of reorderThreshold (defaults to 3).',
        },
      },
    },
  },
  {
    name: 'audit_pharmacy_risk_summary',
    description:
      'Run a live operational risk audit across the entire pharmacy inventory, expiry window, traceability gaps (batches missing upstream distributor dispatch), recall flags, and pending review scans.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        focusArea: {
          type: Type.STRING,
          description: 'Optional focus: all, expiry, stock, traceability, recalls',
        },
      },
    },
  },
];

function daysUntilExpiry(expiryDate: string): number | null {
  const parsed = new Date(expiryDate);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const expUtc = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  return Math.floor((expUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

function findTargetBatch(
  batches: WorkspaceBatchSummary[],
  batchNumber?: unknown,
  medicineName?: unknown
): WorkspaceBatchSummary | undefined {
  const bNum = typeof batchNumber === 'string' ? batchNumber.trim().toLowerCase() : '';
  const mName = typeof medicineName === 'string' ? medicineName.trim().toLowerCase() : '';

  if (bNum) {
    const exact = batches.find((b) => b.batchNumber.toLowerCase() === bNum);
    if (exact) return exact;
    const partial = batches.find((b) => b.batchNumber.toLowerCase().includes(bNum));
    if (partial) return partial;
  }
  if (mName) {
    const exact = batches.find((b) => b.medicineName.toLowerCase() === mName);
    if (exact) return exact;
    const partial = batches.find(
      (b) =>
        b.medicineName.toLowerCase().includes(mName) ||
        mName.includes(b.medicineName.toLowerCase()) ||
        (b.genericName && b.genericName.toLowerCase().includes(mName))
    );
    if (partial) return partial;
  }
  return undefined;
}

export function buildPurchaseOrderDraft(
  snapshot: PharmacyWorkspaceSnapshot,
  includeNearExpiry = true,
  multiplier = 3
): PurchaseOrderDraft {
  const safeMult = Math.min(6, Math.max(1.5, Number(multiplier) || 3));
  const items: PurchaseOrderLineItem[] = [];

  for (const b of snapshot.batches) {
    const daysLeft = daysUntilExpiry(b.expiryDate);
    const isExpired = daysLeft !== null && daysLeft < 0;
    const isNearExpiry = daysLeft !== null && daysLeft >= 0 && daysLeft <= snapshot.nearExpiryDays;
    const isLowStock = b.quantityOnHand <= b.reorderThreshold;

    if (isLowStock || isExpired || (includeNearExpiry && isNearExpiry)) {
      const targetStock = Math.max(b.reorderThreshold * safeMult, 40);
      const effectiveUsable = isExpired ? 0 : b.quantityOnHand;
      const orderQty = Math.max(20, Math.ceil((targetStock - effectiveUsable) / 10) * 10);
      const reasons: string[] = [];
      if (isLowStock) reasons.push(`Low stock (${b.quantityOnHand} <= threshold ${b.reorderThreshold})`);
      if (isExpired) reasons.push(`Expired on ${b.expiryDate}`);
      else if (isNearExpiry) reasons.push(`Near expiry (${daysLeft}d left)`);

      items.push({
        medicineName: b.medicineName,
        batchNumber: b.batchNumber,
        supplierName: b.supplierName || 'Authorized Distributor',
        currentStock: b.quantityOnHand,
        reorderThreshold: b.reorderThreshold,
        recommendedOrderQty: orderQty,
        unitPrice: b.unitPrice || 0,
        estimatedLineTotal: Math.round(orderQty * (b.unitPrice || 0)),
        reason: reasons.join('; '),
      });
    }
  }

  const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
  const totalUnits = items.reduce((s, i) => s + i.recommendedOrderQty, 0);
  const estimatedTotalInr = items.reduce((s, i) => s + i.estimatedLineTotal, 0);

  const csvRows = [
    'PO Number,Medicine Name,Current Batch,Preferred Supplier,Current Stock,Reorder Threshold,Order Qty,Unit Price (INR),Line Total (INR),Reason',
    ...items.map((i) =>
      [
        poNumber,
        `"${i.medicineName.replace(/"/g, '""')}"`,
        `"${i.batchNumber.replace(/"/g, '""')}"`,
        `"${i.supplierName.replace(/"/g, '""')}"`,
        i.currentStock,
        i.reorderThreshold,
        i.recommendedOrderQty,
        i.unitPrice,
        i.estimatedLineTotal,
        `"${i.reason.replace(/"/g, '""')}"`,
      ].join(',')
    ),
  ];

  return {
    poNumber,
    generatedAt: new Date().toISOString(),
    pharmacyName: snapshot.pharmacyName || 'Authorized Pharmacy',
    items,
    totalUnits,
    estimatedTotalInr,
    csvContent: csvRows.join('\n'),
  };
}

export function buildRiskAuditReport(snapshot: PharmacyWorkspaceSnapshot): RiskAuditReport {
  const findings: RiskAuditReport['findings'] = [];
  let expiredCount = 0;
  let nearExpiryCount = 0;
  let lowStockCount = 0;
  let quarantinedOrSuspiciousCount = 0;
  let missingUpstreamDispatchCount = 0;

  for (const b of snapshot.batches) {
    const daysLeft = daysUntilExpiry(b.expiryDate);
    if (daysLeft !== null && daysLeft < 0) {
      expiredCount++;
      findings.push({
        severity: 'critical',
        category: 'Expired Stock',
        detail: `${b.medicineName} (${b.batchNumber}) expired on ${b.expiryDate} with ${b.quantityOnHand} unit(s) still on hand. Quarantine or write off immediately.`,
      });
    } else if (daysLeft !== null && daysLeft <= snapshot.nearExpiryDays) {
      nearExpiryCount++;
      findings.push({
        severity: 'warning',
        category: 'Near Expiry',
        detail: `${b.medicineName} (${b.batchNumber}) expires in ${daysLeft} day(s) (${b.expiryDate}) · ${b.quantityOnHand} units remaining.`,
      });
    }

    if (b.quantityOnHand <= b.reorderThreshold) {
      lowStockCount++;
      findings.push({
        severity: 'warning',
        category: 'Low Stock',
        detail: `${b.medicineName} (${b.batchNumber}) has ${b.quantityOnHand} units (reorder threshold: ${b.reorderThreshold}).`,
      });
    }

    if (b.recallFlagged || b.verificationStatus === 'mismatch_suspicious') {
      quarantinedOrSuspiciousCount++;
      findings.push({
        severity: 'critical',
        category: 'Quarantine / Mismatch',
        detail: `${b.medicineName} (${b.batchNumber}) is flagged (${b.verificationStatus}${b.recallFlagged ? ', recall flagged' : ''}). Hold from dispensing.`,
      });
    } else if (b.verificationStatus === 'needs_review') {
      findings.push({
        severity: 'info',
        category: 'Verification Pending',
        detail: `${b.medicineName} (${b.batchNumber}) is marked "Needs Review" — confirm supplier invoice & batch match.`,
      });
    }

    if (b.hasUpstreamDispatch === false) {
      missingUpstreamDispatchCount++;
    }
  }

  if (missingUpstreamDispatchCount > 0) {
    findings.push({
      severity: 'info',
      category: 'Traceability Gap',
      detail: `${missingUpstreamDispatchCount} batch(es) do not yet have an upstream distributor DISPATCHED custody event recorded.`,
    });
  }

  if (snapshot.pendingReviewScansCount > 0) {
    findings.push({
      severity: 'warning',
      category: 'Verification Queue',
      detail: `${snapshot.pendingReviewScansCount} customer/staff medicine scan(s) are awaiting pharmacist review.`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    totalBatches: snapshot.batches.length,
    totalUnits: snapshot.batches.reduce((s, b) => s + b.quantityOnHand, 0),
    expiredCount,
    nearExpiryCount,
    lowStockCount,
    quarantinedOrSuspiciousCount,
    missingUpstreamDispatchCount,
    openAlertsCount: snapshot.openAlerts.length,
    pendingReviewScansCount: snapshot.pendingReviewScansCount,
    findings,
  };
}

export async function runPharmacistAiAgent(params: {
  ai: GoogleGenAI;
  generateWithFallback: (
    ai: GoogleGenAI,
    request: Omit<GenerateContentParameters, 'model'>
  ) => Promise<{ response: GenerateContentResponse; modelUsed: string }>;
  message: string;
  language: 'en' | 'hi' | 'hinglish';
  history: Array<{ sender: 'user' | 'assistant'; content: string }>;
  snapshot: PharmacyWorkspaceSnapshot;
}): Promise<{
  reply: string;
  proposedActions: PlannedPharmacyAction[];
  purchaseOrder?: PurchaseOrderDraft;
  riskAudit?: RiskAuditReport;
  modelUsed: string;
}> {
  const { ai, generateWithFallback, message, language, history, snapshot } = params;

  const languageRule =
    language === 'hi'
      ? 'Respond in clear, natural Hindi (Devanagari script). Keep medicine brand names, batch numbers, and PO IDs legible.'
      : language === 'hinglish'
        ? 'Respond in clear, everyday Hinglish (Hindi in Roman script mixed naturally with pharmacy terms).'
        : 'Respond in clear, concise, professional pharmacy English.';

  const batchContextLines = snapshot.batches
    .slice(0, 40)
    .map(
      (b) =>
        `- id=${b.id} | ${b.medicineName} | batch=${b.batchNumber} | qty=${b.quantityOnHand} | reorder=${b.reorderThreshold} | exp=${b.expiryDate} | price=INR ${b.unitPrice} | supplier=${b.supplierName} | status=${b.verificationStatus} | recallFlagged=${b.recallFlagged} | upstreamDispatch=${b.hasUpstreamDispatch !== false}`
    )
    .join('\n');

  const alertContextLines = snapshot.openAlerts
    .slice(0, 20)
    .map(
      (a) =>
        `- alertId=${a.id} | type=${a.alertType} | severity=${a.severity} | status=${a.status} | batch=${a.affectedBatch || 'N/A'} | title=${a.title}`
    )
    .join('\n');

  const systemInstruction = [
    'You are the MediTrust AI Pharmacy Operations Agent for a licensed pharmacist.',
    languageRule,
    'You have REAL operational tools (function declarations) to receive stock batches, record stock movements (dispense/restock/return/expired write-off/reconciliation), quarantine/flag batches, create or resolve safety alerts, log distributor hand-offs, generate supplier reorder Purchase Orders, and run full pharmacy risk audits.',
    'STRICT OPERATING RULES:',
    '1. When the pharmacist asks you to DO an operation (receive stock, dispense units, write off expired stock, quarantine a batch, raise/resolve an alert, log distributor dispatch, generate a reorder PO, or audit risk), ALWAYS call the corresponding tool(s) with accurate arguments matched to the LIVE INVENTORY CONTEXT below.',
    '2. Never invent batch IDs or claim an action is already saved when proposing a state change — call the tool so the pharmacist can execute it with 1 click (or auto-execute).',
    '3. Never declare a medicine authentic/genuine from an image or text alone; never prescribe or diagnose patients.',
    '4. Always provide a concise, helpful response explaining what you analyzed or prepared.',
    '',
    `PHARMACY PROFILE: ${snapshot.pharmacyName || 'Authorized Pharmacy'} | License: ${snapshot.licenseNumber || 'Not set'} | City: ${snapshot.city || 'Not set'} | Near-expiry window: ${snapshot.nearExpiryDays} days | Today: ${new Date().toISOString().slice(0, 10)}`,
    `LIVE INVENTORY BATCHES (${snapshot.batches.length}):`,
    batchContextLines || '(No batches currently in inventory)',
    `OPEN SAFETY ALERTS (${snapshot.openAlerts.length}):`,
    alertContextLines || '(No open alerts)',
    `PENDING REVIEW SCANS: ${snapshot.pendingReviewScansCount}`,
  ].join('\n');

  const recentHistory = history
    .slice(-5)
    .map((h) => `${h.sender === 'user' ? 'Pharmacist' : 'AI Agent'}: ${h.content.slice(0, 500)}`)
    .join('\n');

  const promptText = recentHistory
    ? `Recent conversation:\n${recentHistory}\n\nPharmacist command/question: ${message.trim()}`
    : message.trim();

  const { response, modelUsed } = await generateWithFallback(ai, {
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: PHARMACIST_TOOL_DECLARATIONS }],
    },
  });

  const functionCalls = response.functionCalls || [];
  const proposedActions: PlannedPharmacyAction[] = [];
  let purchaseOrder: PurchaseOrderDraft | undefined;
  let riskAudit: RiskAuditReport | undefined;

  functionCalls.forEach((fc, idx) => {
    const args = (fc.args || {}) as Record<string, unknown>;
    const actionId = `act_${Date.now().toString(36)}_${idx}`;

    if (fc.name === 'generate_reorder_purchase_order') {
      purchaseOrder = buildPurchaseOrderDraft(
        snapshot,
        args.includeNearExpiry !== false,
        Number(args.targetCoverageMultiplier) || 3
      );
      return;
    }

    if (fc.name === 'audit_pharmacy_risk_summary') {
      riskAudit = buildRiskAuditReport(snapshot);
      return;
    }

    if (fc.name === 'receive_stock_batch') {
      const medicineName = String(args.medicineName || 'Medicine Batch').trim();
      const cat = findMedicineInCatalogue(medicineName);
      const batchNumber = String(args.batchNumber || `BAT-${Date.now().toString().slice(-5)}`).trim();
      const expiryDate = String(args.expiryDate || '').trim() || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
      const quantity = Math.max(1, Math.round(Number(args.quantity) || 50));
      const supplierName = String(args.supplierName || 'Authorized Pharma Distributor').trim();
      const manufacturer = String(args.manufacturer || cat?.manufacturer || 'Licensed Manufacturer').trim();
      const unitPrice = Number(args.unitPrice) || cat?.referencePriceInr || 50;
      const reorderThreshold = Math.max(5, Math.round(Number(args.reorderThreshold) || 25));

      proposedActions.push({
        actionId,
        toolName: 'receive_stock_batch',
        title: `Receive Stock: ${medicineName} (+${quantity} units)`,
        summary: `Batch ${batchNumber} · Exp ${expiryDate} · Supplier: ${supplierName} · ₹${unitPrice}/unit`,
        severity: 'info',
        resolvedTargetLabel: `${medicineName} (${batchNumber})`,
        args: {
          medicineName,
          genericName: String(args.genericName || cat?.genericName || '').trim(),
          strength: String(args.strength || cat?.strength || '').trim(),
          dosageForm: String(args.dosageForm || cat?.dosageForm || 'Tablet').trim(),
          manufacturer,
          batchNumber,
          mfgDate: String(args.mfgDate || '').trim(),
          expiryDate,
          supplierName,
          invoiceRef: String(args.invoiceRef || `AI-INV-${Date.now().toString().slice(-5)}`).trim(),
          quantity,
          reorderThreshold,
          unitPrice,
        },
      });
      return;
    }

    if (fc.name === 'record_stock_movement') {
      const target = findTargetBatch(snapshot.batches, args.batchNumber, args.medicineName);
      const rawType = String(args.movementType || 'DISPENSE').toUpperCase();
      let movementType: 'RECEIPT' | 'DISPENSE' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER' | 'RECONCILIATION' = 'DISPENSE';
      if (rawType === 'RESTOCK' || rawType === 'RECEIPT') movementType = 'RECEIPT';
      else if (rawType === 'EXPIRED_WRITEOFF' || rawType === 'WRITEOFF' || rawType === 'ADJUSTMENT') movementType = 'ADJUSTMENT';
      else if (rawType === 'RETURN') movementType = 'RETURN';
      else if (rawType === 'TRANSFER') movementType = 'TRANSFER';
      else if (rawType === 'RECONCILIATION') movementType = 'RECONCILIATION';
      else movementType = 'DISPENSE';

      const rawQty = Math.round(Number(args.quantity) || 0);
      let quantityDelta = rawQty;
      if (movementType === 'DISPENSE' || movementType === 'TRANSFER' || rawType === 'EXPIRED_WRITEOFF' || rawType === 'WRITEOFF') {
        quantityDelta = -Math.abs(rawQty);
      } else if (movementType === 'RECEIPT' || movementType === 'RETURN') {
        quantityDelta = Math.abs(rawQty);
      } else if (movementType === 'RECONCILIATION' && args.isAbsoluteCount && target) {
        quantityDelta = rawQty - target.quantityOnHand;
      }

      const nextBalance = target ? Math.max(0, target.quantityOnHand + quantityDelta) : undefined;
      const reason = String(args.reason || `AI-assisted ${movementType} entry`).trim();

      proposedActions.push({
        actionId,
        toolName: 'record_stock_movement',
        title: `${movementType}: ${target ? target.medicineName : String(args.medicineName || args.batchNumber || 'Batch')} (${quantityDelta >= 0 ? '+' : ''}${quantityDelta})`,
        summary: target
          ? `Batch ${target.batchNumber} · Balance ${target.quantityOnHand} → ${nextBalance} · ${reason}`
          : `Could not auto-match batch "${String(args.batchNumber || args.medicineName || '')}" in live stock. Verify batch number before executing.`,
        severity: movementType === 'ADJUSTMENT' && quantityDelta < 0 ? 'warning' : 'info',
        resolvedTargetLabel: target ? `${target.medicineName} (${target.batchNumber})` : undefined,
        args: {
          batchId: target?.id || '',
          batchNumber: target?.batchNumber || String(args.batchNumber || ''),
          medicineName: target?.medicineName || String(args.medicineName || ''),
          movementType,
          quantityDelta,
          reason,
          invoiceRef: String(args.invoiceRef || '').trim(),
        },
      });
      return;
    }

    if (fc.name === 'quarantine_or_flag_batch') {
      const target = findTargetBatch(snapshot.batches, args.batchNumber, args.medicineName);
      const quarantine = Boolean(args.quarantine);
      const reason = String(args.reason || 'Flagged for pharmacist review').trim();
      const verificationStatus = String(
        args.verificationStatus || (quarantine ? 'mismatch_suspicious' : target?.verificationStatus || 'needs_review')
      );

      proposedActions.push({
        actionId,
        toolName: 'quarantine_or_flag_batch',
        title: quarantine
          ? `Quarantine Batch: ${target ? target.medicineName : String(args.medicineName || args.batchNumber || 'Batch')}`
          : `Update Batch Status: ${target ? target.medicineName : String(args.medicineName || args.batchNumber || 'Batch')}`,
        summary: target
          ? `Batch ${target.batchNumber} → status: ${verificationStatus}${quarantine ? ' + Recall/Quarantine Flag + Alert + Custody Event' : ''} · ${reason}`
          : `Batch "${String(args.batchNumber || args.medicineName || '')}" not found in current inventory.`,
        severity: quarantine ? 'critical' : 'warning',
        resolvedTargetLabel: target ? `${target.medicineName} (${target.batchNumber})` : undefined,
        args: {
          batchId: target?.id || '',
          batchNumber: target?.batchNumber || String(args.batchNumber || ''),
          medicineName: target?.medicineName || String(args.medicineName || ''),
          quarantine,
          verificationStatus,
          reorderThreshold:
            args.reorderThreshold !== undefined ? Number(args.reorderThreshold) : target?.reorderThreshold,
          unitPrice: args.unitPrice !== undefined ? Number(args.unitPrice) : target?.unitPrice,
          reason,
        },
      });
      return;
    }

    if (fc.name === 'create_safety_alert') {
      const allowedAlertTypes = ['expired', 'near_expiry', 'low_stock', 'recall', 'mismatch', 'document_flag'];
      const rawAlertType = String(args.alertType || 'mismatch').toLowerCase();
      const alertType = allowedAlertTypes.includes(rawAlertType) ? rawAlertType : 'mismatch';
      const severity = (['critical', 'warning', 'info'].includes(String(args.severity))
        ? String(args.severity)
        : 'warning') as 'critical' | 'warning' | 'info';
      const title = String(args.title || 'Pharmacy Safety Alert').trim();
      const triggerDetails = String(args.triggerDetails || title).trim();

      proposedActions.push({
        actionId,
        toolName: 'create_safety_alert',
        title: `Raise Alert: ${title}`,
        summary: `${severity.toUpperCase()} (${alertType}) · ${triggerDetails.slice(0, 140)}`,
        severity,
        args: {
          alertType,
          severity,
          title,
          triggerDetails,
          affectedProduct: String(args.affectedProduct || '').trim(),
          affectedBatch: String(args.affectedBatch || '').trim(),
        },
      });
      return;
    }

    if (fc.name === 'resolve_safety_alert') {
      const nextStatus = String(args.nextStatus) === 'resolved' ? 'resolved' : 'acknowledged';
      const matchingAlerts = snapshot.openAlerts.filter((a) => {
        if (args.alertId && a.id === String(args.alertId)) return true;
        if (args.affectedBatch && a.affectedBatch?.toLowerCase() === String(args.affectedBatch).toLowerCase()) return true;
        if (args.alertType && a.alertType.toLowerCase() === String(args.alertType).toLowerCase()) return true;
        return false;
      });
      const targetIds = matchingAlerts.map((a) => a.id);

      proposedActions.push({
        actionId,
        toolName: 'resolve_safety_alert',
        title: `${nextStatus === 'resolved' ? 'Resolve' : 'Acknowledge'} ${targetIds.length || 1} Safety Alert(s)`,
        summary:
          matchingAlerts.length > 0
            ? matchingAlerts.map((a) => a.title).slice(0, 3).join('; ')
            : 'No matching open alerts found for the requested filter.',
        severity: 'info',
        args: {
          alertIds: targetIds,
          nextStatus,
          note: String(args.note || `Updated via Pharmacy AI Copilot`).trim(),
        },
      });
      return;
    }

    if (fc.name === 'log_distributor_handoff') {
      const target = findTargetBatch(snapshot.batches, args.batchNumber, args.medicineName);
      const allowedTraceTypes = ['MANUFACTURED', 'DISPATCHED', 'RECEIVED', 'TRANSFERRED', 'DISPENSED', 'QUARANTINED'];
      const rawTrace = String(args.eventType || 'DISPATCHED').toUpperCase();
      const eventType = allowedTraceTypes.includes(rawTrace) ? rawTrace : 'DISPATCHED';
      const actorOrg = String(args.actorOrg || target?.supplierName || 'Authorized Distributor').trim();

      proposedActions.push({
        actionId,
        toolName: 'log_distributor_handoff',
        title: `Log Custody (${eventType}): ${target ? target.medicineName : String(args.medicineName || args.batchNumber || 'Batch')}`,
        summary: `${actorOrg} · Batch ${target?.batchNumber || String(args.batchNumber || 'N/A')} · Ref: ${String(args.evidenceRef || 'AI-HANDOFF')}`,
        severity: 'info',
        resolvedTargetLabel: target ? `${target.medicineName} (${target.batchNumber})` : undefined,
        args: {
          batchId: target?.id || '',
          batchNumber: target?.batchNumber || String(args.batchNumber || ''),
          medicineName: target?.medicineName || String(args.medicineName || ''),
          eventType,
          actorOrg,
          sourceLocation: String(args.sourceLocation || actorOrg).trim(),
          destinationLocation: String(args.destinationLocation || snapshot.pharmacyName || 'Pharmacy').trim(),
          quantity: Math.max(1, Math.round(Number(args.quantity) || target?.quantityOnHand || 50)),
          evidenceRef: String(args.evidenceRef || '').trim(),
          notes: String(args.notes || 'Recorded via MediTrust AI Pharmacy Copilot').trim(),
        },
      });
    }
  });

  // Ensure a clear, human-readable reply even when Gemini outputs pure tool calls
  let reply = (response.text || '').trim();
  if (!reply) {
    const parts: string[] = [];
    if (purchaseOrder) {
      if (purchaseOrder.items.length > 0) {
        parts.push(
          `Generated Purchase Order ${purchaseOrder.poNumber} covering ${purchaseOrder.items.length} batch(es) totaling ${purchaseOrder.totalUnits} units (estimated ₹${purchaseOrder.estimatedTotalInr.toLocaleString()}). You can download the CSV PO directly below.`
        );
      } else {
        parts.push(
          `All ${snapshot.batches.length} active batches are currently above reorder threshold and outside the near-expiry window. No urgent reorder PO is required right now.`
        );
      }
    }
    if (riskAudit) {
      parts.push(
        `Completed live Pharmacy Risk Audit across ${riskAudit.totalBatches} batch(es) (${riskAudit.totalUnits} total units): ${riskAudit.expiredCount} expired, ${riskAudit.nearExpiryCount} near-expiry, ${riskAudit.lowStockCount} low-stock, ${riskAudit.quarantinedOrSuspiciousCount} quarantined/suspicious, and ${riskAudit.missingUpstreamDispatchCount} missing upstream dispatch records.`
      );
    }
    if (proposedActions.length > 0) {
      parts.push(
        `Prepared ${proposedActions.length} executable pharmacy operation(s) below. Review the preview and click Execute to commit directly to your live inventory, traceability ledger, and audit trail.`
      );
    }
    reply =
      parts.join('\n\n') ||
      'I have analyzed your pharmacy workspace. Let me know which inventory, alert, traceability, or purchase order action you would like to run.';
  }

  return {
    reply,
    proposedActions,
    purchaseOrder,
    riskAudit,
    modelUsed,
  };
}
