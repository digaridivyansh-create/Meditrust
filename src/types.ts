import type { Timestamp } from 'firebase/firestore';

export type PortalRole = 'patient' | 'pharmacist';
export type PreferredLanguage = 'en' | 'hi' | 'hinglish';
export type VerificationStatus =
  | 'verified_match'
  | 'mismatch_suspicious'
  | 'needs_review'
  | 'not_found'
  | 'provider_unavailable';
export type ExpiryStatus = 'valid' | 'near_expiry' | 'expired' | 'ambiguous';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ReviewStatus = 'none' | 'pending_review' | 'escalated' | 'quarantined' | 'cleared';
export type DocumentType = 'prescription' | 'invoice' | 'leaflet' | 'coa' | 'lab_report' | 'other';
export type MovementType = 'RECEIPT' | 'DISPENSE' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER' | 'RECONCILIATION';
export type TraceEventType =
  | 'MANUFACTURED'
  | 'DISPATCHED'
  | 'RECEIVED'
  | 'TRANSFERRED'
  | 'DISPENSED'
  | 'QUARANTINED';

export interface UserProfile {
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MedicineScan {
  id: string;
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Prescription {
  id: string;
  ownerId: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  prescriberName?: string;
  clinicName?: string;
  issueDate?: string;
  endDate?: string;
  status: 'active' | 'completed' | 'paused' | 'flagged';
  notes?: string;
  linkedBatchNumber?: string;
  adherenceCount: number;
  lastTakenAt?: string;
  sourceDocumentHash?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface VerifiedDocument {
  id: string;
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface InventoryBatch {
  id: string;
  ownerId: string;
  pharmacyName: string;
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
  quantityOnHand: number;
  reorderThreshold: number;
  unitPrice: number;
  verificationStatus: VerificationStatus;
  recallFlagged: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface InventoryLedgerEntry {
  id: string;
  ownerId: string;
  batchId: string;
  batchNumber: string;
  medicineName: string;
  movementType: MovementType;
  quantityDelta: number;
  resultingBalance: number;
  reason: string;
  invoiceRef?: string;
  actorName: string;
  createdAt?: Timestamp;
}

export interface TraceabilityEvent {
  id: string;
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
  createdAt?: Timestamp;
}

export interface SafetyAlert {
  id: string;
  ownerId: string;
  portalRole: PortalRole;
  alertType: 'expired' | 'near_expiry' | 'low_stock' | 'recall' | 'mismatch' | 'document_flag';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  triggerDetails: string;
  affectedProduct?: string;
  affectedBatch?: string;
  sourceReference?: string;
  status: 'open' | 'acknowledged' | 'resolved';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ChatMessage {
  id: string;
  ownerId: string;
  portalRole: PortalRole;
  sessionId: string;
  sender: 'user' | 'assistant';
  language: PreferredLanguage;
  content: string;
  attachmentName?: string;
  groundingRef?: string;
  createdAt?: Timestamp;
}

export interface AuditEvent {
  id: string;
  ownerId: string;
  portalRole: PortalRole;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt?: Timestamp;
}

export interface RecallNotice {
  recallNumber: string;
  status: string;
  classification: string;
  productDescription: string;
  reasonForRecall: string;
  recallingFirm: string;
  codeInfo: string;
  reportDate: string;
}
