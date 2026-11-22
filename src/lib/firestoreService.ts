import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  createLocalDoc,
  deleteLocalDoc,
  getLocalProfile,
  isLocalWorkspaceActive,
  receiveLocalInventory,
  recordLocalInventoryMovement,
  saveLocalProfile,
  updateLocalDoc,
} from './localWorkspaceClient';
import { clampStr, makeId } from './utils';
import type {
  AuditEvent,
  ChatMessage,
  ConfidenceLevel,
  DocumentType,
  ExpiryStatus,
  InventoryBatch,
  InventoryLedgerEntry,
  MedicineScan,
  MovementType,
  PortalRole,
  PreferredLanguage,
  Prescription,
  ReviewStatus,
  SafetyAlert,
  TraceabilityEvent,
  TraceEventType,
  UserProfile,
  VerificationStatus,
  VerifiedDocument,
} from '../types';

function sortByCreatedDesc<T extends { createdAt?: { toMillis?: () => number } }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : Date.now();
    const tb = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : Date.now();
    return tb - ta;
  });
}

function stripSentinels(payload: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'createdAt' || k === 'updatedAt') continue;
    clean[k] = v;
  }
  return clean;
}

// --- User Profile ---
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (isLocalWorkspaceActive()) {
    return getLocalProfile();
  }
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createUserProfile(input: {
  uid: string;
  email: string;
  displayName: string;
  portalRole: PortalRole;
  preferredLanguage: PreferredLanguage;
  consentAccepted: boolean;
  pharmacyName?: string;
  licenseNumber?: string;
  city?: string;
  nearExpiryDays?: number;
}): Promise<void> {
  const path = `users/${input.uid}`;
  const payload: Record<string, unknown> = {
    uid: input.uid,
    email: clampStr(input.email, 200),
    displayName: clampStr(input.displayName || 'MediTrust User', 120),
    portalRole: input.portalRole,
    preferredLanguage: input.preferredLanguage,
    consentAccepted: Boolean(input.consentAccepted),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.pharmacyName) payload.pharmacyName = clampStr(input.pharmacyName, 160);
  if (input.licenseNumber) payload.licenseNumber = clampStr(input.licenseNumber, 80);
  if (input.city) payload.city = clampStr(input.city, 100);
  if (typeof input.nearExpiryDays === 'number') {
    payload.nearExpiryDays = Math.min(365, Math.max(7, Math.round(input.nearExpiryDays)));
  }

  if (isLocalWorkspaceActive()) {
    await saveLocalProfile(stripSentinels(payload));
    return;
  }

  try {
    await setDoc(doc(db, 'users', input.uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<{
    displayName: string;
    portalRole: PortalRole;
    preferredLanguage: PreferredLanguage;
    consentAccepted: boolean;
    pharmacyName: string;
    licenseNumber: string;
    city: string;
    nearExpiryDays: number;
  }>
): Promise<void> {
  const path = `users/${uid}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.displayName !== undefined) payload.displayName = clampStr(updates.displayName || 'MediTrust User', 120);
  if (updates.portalRole !== undefined) payload.portalRole = updates.portalRole;
  if (updates.preferredLanguage !== undefined) payload.preferredLanguage = updates.preferredLanguage;
  if (updates.consentAccepted !== undefined) payload.consentAccepted = Boolean(updates.consentAccepted);
  if (updates.pharmacyName !== undefined) payload.pharmacyName = clampStr(updates.pharmacyName, 160);
  if (updates.licenseNumber !== undefined) payload.licenseNumber = clampStr(updates.licenseNumber, 80);
  if (updates.city !== undefined) payload.city = clampStr(updates.city, 100);
  if (updates.nearExpiryDays !== undefined) {
    payload.nearExpiryDays = Math.min(365, Math.max(7, Math.round(updates.nearExpiryDays)));
  }

  if (isLocalWorkspaceActive()) {
    await saveLocalProfile(stripSentinels(payload));
    return;
  }

  try {
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// --- Audit Event (Append-Only) ---
export async function logAuditEvent(input: {
  ownerId: string;
  portalRole: PortalRole;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
}): Promise<string> {
  const id = makeId('aud');
  const path = `audit_events/${id}`;
  const safeTargetId = input.targetId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'record';
  const payload = {
    ownerId: input.ownerId,
    portalRole: input.portalRole,
    actorName: clampStr(input.actorName || 'User', 120),
    action: clampStr(input.action, 100),
    targetType: clampStr(input.targetType, 60),
    targetId: safeTargetId,
    details: clampStr(input.details, 1000),
    createdAt: serverTimestamp(),
  };

  if (isLocalWorkspaceActive()) {
    await createLocalDoc('audit_events', id, stripSentinels(payload));
    return id;
  }

  try {
    await setDoc(doc(db, 'audit_events', id), payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

// --- Medicine Scans ---
export async function saveMedicineScan(input: {
  ownerId: string;
  portalRole: PortalRole;
  medicineName: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  manufacturer?: string;
  batchNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
  licenseInfo?: string;
  identifiers?: string;
  confidenceSummary: ConfidenceLevel;
  verificationStatus: VerificationStatus;
  expiryStatus: ExpiryStatus;
  sourceName: string;
  sourceEvidence?: string;
  safetyNotices?: string;
  limitations?: string;
  nextStep?: string;
  userCorrected: boolean;
  reviewStatus: ReviewStatus;
  reviewerNotes?: string;
}): Promise<string> {
  const id = makeId('scn');
  const path = `scans/${id}`;
  const payload: Record<string, unknown> = {
    ownerId: input.ownerId,
    portalRole: input.portalRole,
    medicineName: clampStr(input.medicineName || 'Unidentified Medicine', 180),
    confidenceSummary: input.confidenceSummary,
    verificationStatus: input.verificationStatus,
    expiryStatus: input.expiryStatus,
    sourceName: clampStr(input.sourceName || 'MediTrust Verification Engine', 180),
    userCorrected: Boolean(input.userCorrected),
    reviewStatus: input.reviewStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.genericName) payload.genericName = clampStr(input.genericName, 180);
  if (input.strength) payload.strength = clampStr(input.strength, 80);
  if (input.dosageForm) payload.dosageForm = clampStr(input.dosageForm, 80);
  if (input.manufacturer) payload.manufacturer = clampStr(input.manufacturer, 180);
  if (input.batchNumber) payload.batchNumber = clampStr(input.batchNumber, 80);
  if (input.mfgDate) payload.mfgDate = clampStr(input.mfgDate, 40);
  if (input.expiryDate) payload.expiryDate = clampStr(input.expiryDate, 40);
  if (input.licenseInfo) payload.licenseInfo = clampStr(input.licenseInfo, 160);
  if (input.identifiers) payload.identifiers = clampStr(input.identifiers, 240);
  if (input.sourceEvidence) payload.sourceEvidence = clampStr(input.sourceEvidence, 2000);
  if (input.safetyNotices) payload.safetyNotices = clampStr(input.safetyNotices, 2000);
  if (input.limitations) payload.limitations = clampStr(input.limitations, 1000);
  if (input.nextStep) payload.nextStep = clampStr(input.nextStep, 600);
  if (input.reviewerNotes) payload.reviewerNotes = clampStr(input.reviewerNotes, 1000);

  if (isLocalWorkspaceActive()) {
    await createLocalDoc('scans', id, stripSentinels(payload));
    return id;
  }

  try {
    await setDoc(doc(db, 'scans', id), payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateScanReview(
  scanId: string,
  reviewStatus: ReviewStatus,
  reviewerNotes: string
): Promise<void> {
  if (isLocalWorkspaceActive()) {
    await updateLocalDoc('scans', scanId, {
      reviewStatus,
      reviewerNotes: clampStr(reviewerNotes, 1000),
    });
    return;
  }
  const path = `scans/${scanId}`;
  try {
    await updateDoc(doc(db, 'scans', scanId), {
      reviewStatus,
      reviewerNotes: clampStr(reviewerNotes, 1000),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteMedicineScan(scanId: string): Promise<void> {
  if (isLocalWorkspaceActive()) {
    await deleteLocalDoc('scans', scanId);
    return;
  }
  const path = `scans/${scanId}`;
  try {
    await deleteDoc(doc(db, 'scans', scanId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Prescriptions ---
export async function createPrescription(input: {
  ownerId: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  prescriberName?: string;
  clinicName?: string;
  issueDate?: string;
  endDate?: string;
  status?: 'active' | 'completed' | 'paused' | 'flagged';
  notes?: string;
  linkedBatchNumber?: string;
  sourceDocumentHash?: string;
}): Promise<string> {
  const id = makeId('rx');
  const path = `prescriptions/${id}`;
  const payload: Record<string, unknown> = {
    ownerId: input.ownerId,
    medicineName: clampStr(input.medicineName, 180),
    dosage: clampStr(input.dosage, 120),
    frequency: clampStr(input.frequency, 120),
    status: input.status || 'active',
    adherenceCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.prescriberName) payload.prescriberName = clampStr(input.prescriberName, 140);
  if (input.clinicName) payload.clinicName = clampStr(input.clinicName, 160);
  if (input.issueDate) payload.issueDate = clampStr(input.issueDate, 40);
  if (input.endDate) payload.endDate = clampStr(input.endDate, 40);
  if (input.notes) payload.notes = clampStr(input.notes, 800);
  if (input.linkedBatchNumber) payload.linkedBatchNumber = clampStr(input.linkedBatchNumber, 80);
  if (input.sourceDocumentHash) payload.sourceDocumentHash = clampStr(input.sourceDocumentHash, 128);

  if (isLocalWorkspaceActive()) {
    await createLocalDoc('prescriptions', id, stripSentinels(payload));
    return id;
  }

  try {
    await setDoc(doc(db, 'prescriptions', id), payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function logPrescriptionDose(prescriptionId: string, currentCount: number): Promise<void> {
  const updates = {
    adherenceCount: Math.min(10000, currentCount + 1),
    lastTakenAt: new Date().toISOString(),
  };
  if (isLocalWorkspaceActive()) {
    await updateLocalDoc('prescriptions', prescriptionId, updates);
    return;
  }
  const path = `prescriptions/${prescriptionId}`;
  try {
    await updateDoc(doc(db, 'prescriptions', prescriptionId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updatePrescriptionStatus(
  prescriptionId: string,
  updates: Partial<{
    status: 'active' | 'completed' | 'paused' | 'flagged';
    notes: string;
    dosage: string;
    frequency: string;
    endDate: string;
    linkedBatchNumber: string;
  }>
): Promise<void> {
  const path = `prescriptions/${prescriptionId}`;
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.notes !== undefined) payload.notes = clampStr(updates.notes, 800);
  if (updates.dosage !== undefined) payload.dosage = clampStr(updates.dosage, 120);
  if (updates.frequency !== undefined) payload.frequency = clampStr(updates.frequency, 120);
  if (updates.endDate !== undefined) payload.endDate = clampStr(updates.endDate, 40);
  if (updates.linkedBatchNumber !== undefined) payload.linkedBatchNumber = clampStr(updates.linkedBatchNumber, 80);

  if (isLocalWorkspaceActive()) {
    await updateLocalDoc('prescriptions', prescriptionId, stripSentinels(payload));
    return;
  }

  try {
    await updateDoc(doc(db, 'prescriptions', prescriptionId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deletePrescription(prescriptionId: string): Promise<void> {
  if (isLocalWorkspaceActive()) {
    await deleteLocalDoc('prescriptions', prescriptionId);
    return;
  }
  const path = `prescriptions/${prescriptionId}`;
  try {
    await deleteDoc(doc(db, 'prescriptions', prescriptionId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Verified Documents ---
export async function saveVerifiedDocument(input: {
  ownerId: string;
  portalRole: PortalRole;
  documentTitle: string;
  documentType: DocumentType;
  fileName: string;
  fileMimeType: string;
  sha256Hash: string;
  issuerName?: string;
  documentDate?: string;
  extractedSummary?: string;
  extractedEntities?: string[];
  anomalies?: string[];
  verificationStatus: VerificationStatus;
  confidenceLevel: ConfidenceLevel;
  reviewNotes?: string;
}): Promise<string> {
  const id = makeId('doc');
  const path = `verified_documents/${id}`;
  const entities = (input.extractedEntities || [])
    .map((s) => clampStr(s, 300))
    .filter(Boolean)
    .slice(0, 20);
  const anomalies = (input.anomalies || [])
    .map((s) => clampStr(s, 300))
    .filter(Boolean)
    .slice(0, 15);

  const payload: Record<string, unknown> = {
    ownerId: input.ownerId,
    portalRole: input.portalRole,
    documentTitle: clampStr(input.documentTitle || input.fileName, 180),
    documentType: input.documentType,
    fileName: clampStr(input.fileName, 200),
    fileMimeType: clampStr(input.fileMimeType, 100),
    sha256Hash: input.sha256Hash.replace(/[^a-fA-F0-9]/g, '').slice(0, 128),
    extractedEntities: entities,
    anomalies,
    verificationStatus: input.verificationStatus,
    confidenceLevel: input.confidenceLevel,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.issuerName) payload.issuerName = clampStr(input.issuerName, 180);
  if (input.documentDate) payload.documentDate = clampStr(input.documentDate, 40);
  if (input.extractedSummary) payload.extractedSummary = clampStr(input.extractedSummary, 2000);
  if (input.reviewNotes) payload.reviewNotes = clampStr(input.reviewNotes, 1000);

  if (isLocalWorkspaceActive()) {
    await createLocalDoc('verified_documents', id, stripSentinels(payload));
    return id;
  }

  try {
    await setDoc(doc(db, 'verified_documents', id), payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateVerifiedDocumentReview(
  docId: string,
  verificationStatus: VerificationStatus,
  reviewNotes: string
): Promise<void> {
  if (isLocalWorkspaceActive()) {
    await updateLocalDoc('verified_documents', docId, {
      verificationStatus,
      reviewNotes: clampStr(reviewNotes, 1000),
    });
    return;
  }
  const path = `verified_documents/${docId}`;
  try {
    await updateDoc(doc(db, 'verified_documents', docId), {
      verificationStatus,
      reviewNotes: clampStr(reviewNotes, 1000),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// --- Inventory Batch Receipt (Atomic Batch + Ledger + Initial Custody Event) ---
export async function receiveInventoryStock(input: {
  ownerId: string;
  pharmacyName: string;
  actorName: string;
  medicineName: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  manufacturer: string;
  batchNumber: string;
  mfgDate?: string;
  expiryDate: string;
  supplierName: string;
  invoiceRef?: string;
  quantity: number;
  reorderThreshold: number;
  unitPrice: number;
  verificationStatus: VerificationStatus;
}): Promise<string> {
  const batchId = makeId('bat');
  const ledgerId = makeId('led');
  const traceId = makeId('trc');
  const qty = Math.max(0, Math.min(1000000, Math.round(input.quantity)));

  const batchDoc: Record<string, unknown> = {
    ownerId: input.ownerId,
    pharmacyName: clampStr(input.pharmacyName || 'Authorized Pharmacy', 160),
    medicineName: clampStr(input.medicineName, 180),
    manufacturer: clampStr(input.manufacturer, 180),
    batchNumber: clampStr(input.batchNumber, 80),
    expiryDate: clampStr(input.expiryDate, 40),
    supplierName: clampStr(input.supplierName, 160),
    quantityOnHand: qty,
    reorderThreshold: Math.max(0, Math.min(100000, Math.round(input.reorderThreshold))),
    unitPrice: Math.max(0, Math.min(1000000, Number(input.unitPrice) || 0)),
    verificationStatus: input.verificationStatus,
    recallFlagged: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.genericName) batchDoc.genericName = clampStr(input.genericName, 180);
  if (input.strength) batchDoc.strength = clampStr(input.strength, 80);
  if (input.dosageForm) batchDoc.dosageForm = clampStr(input.dosageForm, 80);
  if (input.mfgDate) batchDoc.mfgDate = clampStr(input.mfgDate, 40);
  if (input.invoiceRef) batchDoc.invoiceRef = clampStr(input.invoiceRef, 100);

  const ledgerDoc: Record<string, unknown> = {
    ownerId: input.ownerId,
    batchId,
    batchNumber: clampStr(input.batchNumber, 80),
    medicineName: clampStr(input.medicineName, 180),
    movementType: 'RECEIPT' as MovementType,
    quantityDelta: qty,
    resultingBalance: qty,
    reason: clampStr(`Initial stock receipt from ${input.supplierName}`, 400),
    actorName: clampStr(input.actorName || 'Pharmacist', 120),
    createdAt: serverTimestamp(),
  };
  if (input.invoiceRef) ledgerDoc.invoiceRef = clampStr(input.invoiceRef, 100);

  const traceDoc: Record<string, unknown> = {
    ownerId: input.ownerId,
    batchId,
    batchNumber: clampStr(input.batchNumber, 80),
    medicineName: clampStr(input.medicineName, 180),
    eventType: 'RECEIVED' as TraceEventType,
    actorOrg: clampStr(input.pharmacyName || 'Authorized Pharmacy', 160),
    sourceLocation: clampStr(input.supplierName, 160),
    destinationLocation: clampStr(input.pharmacyName || 'Authorized Pharmacy', 160),
    quantity: qty,
    notes: clampStr('Stock received and verified into pharmacy ledger.', 500),
    eventDate: new Date().toISOString().slice(0, 10),
    createdAt: serverTimestamp(),
  };
  if (input.invoiceRef) traceDoc.evidenceRef = clampStr(input.invoiceRef, 140);

  if (isLocalWorkspaceActive()) {
    await receiveLocalInventory({
      batchId,
      ledgerId,
      traceId,
      batchDoc: stripSentinels(batchDoc),
      ledgerDoc: stripSentinels(ledgerDoc),
      traceDoc: stripSentinels(traceDoc),
    });
    return batchId;
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'inventory_batches', batchId), batchDoc);
    batch.set(doc(db, 'inventory_ledger', ledgerId), ledgerDoc);
    batch.set(doc(db, 'traceability_events', traceId), traceDoc);
    await batch.commit();
    return batchId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `inventory_batches/${batchId}`);
  }
}

export async function recordStockMovement(input: {
  ownerId: string;
  batch: InventoryBatch;
  movementType: MovementType;
  quantityDelta: number;
  reason: string;
  invoiceRef?: string;
  actorName: string;
}): Promise<number> {
  const newBalance = Math.max(0, Math.min(1000000, input.batch.quantityOnHand + input.quantityDelta));
  const ledgerId = makeId('led');
  const ledgerDoc: Record<string, unknown> = {
    ownerId: input.ownerId,
    batchId: input.batch.id,
    batchNumber: clampStr(input.batch.batchNumber, 80),
    medicineName: clampStr(input.batch.medicineName, 180),
    movementType: input.movementType,
    quantityDelta: input.quantityDelta,
    resultingBalance: newBalance,
    reason: clampStr(input.reason, 400),
    actorName: clampStr(input.actorName || 'Pharmacist', 120),
    createdAt: serverTimestamp(),
  };
  if (input.invoiceRef) ledgerDoc.invoiceRef = clampStr(input.invoiceRef, 100);

  if (isLocalWorkspaceActive()) {
    await recordLocalInventoryMovement({
      batchId: input.batch.id,
      ledgerId,
      newBalance,
      ledgerDoc: stripSentinels(ledgerDoc),
    });
    return newBalance;
  }

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'inventory_batches', input.batch.id), {
      quantityOnHand: newBalance,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'inventory_ledger', ledgerId), ledgerDoc);
    await batch.commit();
    return newBalance;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `inventory_batches/${input.batch.id}`);
  }
}

export async function updateBatchSettings(
  batchId: string,
  updates: {
    reorderThreshold: number;
    unitPrice: number;
    verificationStatus: VerificationStatus;
    recallFlagged: boolean;
  }
): Promise<void> {
  const clean = {
    reorderThreshold: Math.max(0, Math.min(100000, Math.round(updates.reorderThreshold))),
    unitPrice: Math.max(0, Math.min(1000000, Number(updates.unitPrice) || 0)),
    verificationStatus: updates.verificationStatus,
    recallFlagged: Boolean(updates.recallFlagged),
  };
  if (isLocalWorkspaceActive()) {
    await updateLocalDoc('inventory_batches', batchId, clean);
    return;
  }
  const path = `inventory_batches/${batchId}`;
  try {
    await updateDoc(doc(db, 'inventory_batches', batchId), {
      ...clean,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// --- Supply Chain Traceability Event ---
export async function addTraceabilityEvent(input: {
  ownerId: string;
  batchId: string;
  batchNumber: string;
  medicineName: string;
  eventType: TraceEventType;
  actorOrg: string;
  sourceLocation?: string;
  destinationLocation?: string;
  quantity: number;
  evidenceRef?: string;
  notes?: string;
  eventDate: string;
}): Promise<string> {
  const id = makeId('trc');
  const path = `traceability_events/${id}`;
  const payload: Record<string, unknown> = {
    ownerId: input.ownerId,
    batchId: input.batchId,
    batchNumber: clampStr(input.batchNumber, 80),
    medicineName: clampStr(input.medicineName, 180),
    eventType: input.eventType,
    actorOrg: clampStr(input.actorOrg, 160),
    quantity: Math.max(0, Math.min(1000000, Math.round(input.quantity))),
    eventDate: clampStr(input.eventDate || new Date().toISOString().slice(0, 10), 40),
    createdAt: serverTimestamp(),
  };
  if (input.sourceLocation) payload.sourceLocation = clampStr(input.sourceLocation, 160);
  if (input.destinationLocation) payload.destinationLocation = clampStr(input.destinationLocation, 160);
  if (input.evidenceRef) payload.evidenceRef = clampStr(input.evidenceRef, 140);
  if (input.notes) payload.notes = clampStr(input.notes, 500);

  if (isLocalWorkspaceActive()) {
    await createLocalDoc('traceability_events', id, stripSentinels(payload));
    return id;
  }

  try {
    await setDoc(doc(db, 'traceability_events', id), payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

// --- Alerts ---
export async function createSafetyAlert(input: {
  ownerId: string;
  portalRole: PortalRole;
  alertType: SafetyAlert['alertType'];
  severity: SafetyAlert['severity'];
  title: string;
  triggerDetails: string;
  affectedProduct?: string;
  affectedBatch?: string;
  sourceReference?: string;
}): Promise<string> {
  const id = makeId('alt');
  const path = `alerts/${id}`;
  const payload: Record<string, unknown> = {
    ownerId: input.ownerId,
    portalRole: input.portalRole,
    alertType: input.alertType,
    severity: input.severity,
    title: clampStr(input.title, 200),
    triggerDetails: clampStr(input.triggerDetails, 1000),
    status: 'open',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.affectedProduct) payload.affectedProduct = clampStr(input.affectedProduct, 180);
  if (input.affectedBatch) payload.affectedBatch = clampStr(input.affectedBatch, 80);
  if (input.sourceReference) payload.sourceReference = clampStr(input.sourceReference, 240);

  if (isLocalWorkspaceActive()) {
    await createLocalDoc('alerts', id, stripSentinels(payload));
    return id;
  }

  try {
    await setDoc(doc(db, 'alerts', id), payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateAlertStatus(
  alertId: string,
  nextStatus: 'acknowledged' | 'resolved'
): Promise<void> {
  if (isLocalWorkspaceActive()) {
    await updateLocalDoc('alerts', alertId, { status: nextStatus });
    return;
  }
  const path = `alerts/${alertId}`;
  try {
    await updateDoc(doc(db, 'alerts', alertId), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// --- Chat Messages ---
export async function saveChatMessage(input: {
  ownerId: string;
  portalRole: PortalRole;
  sessionId: string;
  sender: 'user' | 'assistant';
  language: PreferredLanguage;
  content: string;
  attachmentName?: string;
  groundingRef?: string;
}): Promise<string> {
  const id = makeId('msg');
  const path = `chat_messages/${id}`;
  const payload: Record<string, unknown> = {
    ownerId: input.ownerId,
    portalRole: input.portalRole,
    sessionId: input.sessionId,
    sender: input.sender,
    language: input.language,
    content: clampStr(input.content, 8000),
    createdAt: serverTimestamp(),
  };
  if (input.attachmentName) payload.attachmentName = clampStr(input.attachmentName, 200);
  if (input.groundingRef) payload.groundingRef = clampStr(input.groundingRef, 240);

  if (isLocalWorkspaceActive()) {
    await createLocalDoc('chat_messages', id, stripSentinels(payload));
    return id;
  }

  try {
    await setDoc(doc(db, 'chat_messages', id), payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

// --- Real-time Subscriptions (Owner-Scoped) ---
export function subscribeOwnerCollection<T extends { id: string; createdAt?: { toMillis?: () => number } }>(
  collectionName: string,
  ownerId: string,
  onData: (items: T[]) => void
): Unsubscribe {
  const q = query(collection(db, collectionName), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T);
      onData(sortByCreatedDesc(items));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  );
}

export type WorkspaceData = {
  scans: MedicineScan[];
  prescriptions: Prescription[];
  documents: VerifiedDocument[];
  batches: InventoryBatch[];
  ledger: InventoryLedgerEntry[];
  traceEvents: TraceabilityEvent[];
  alerts: SafetyAlert[];
  chatMessages: ChatMessage[];
  auditEvents: AuditEvent[];
};
