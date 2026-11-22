# MediTrust AI Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **PII Isolation**: `/users/{userId}` documents contain email and pharmacy licensing details. Only the authenticated owner (`request.auth.uid == userId`) can read or write their profile. Listing `/users` is forbidden.
2. **Verified Email Gate**: All mutations require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Tenant / Owner Isolation**: Every operational record (`scans`, `prescriptions`, `verified_documents`, `inventory_batches`, `inventory_ledger`, `traceability_events`, `alerts`, `chat_messages`, `audit_events`) carries an immutable `ownerId` strictly matching `request.auth.uid`. Every `list` query evaluates `resource.data.ownerId == request.auth.uid`.
4. **Relational Integrity (Master Gate)**: Every `inventory_ledger` and `traceability_events` creation verifies via `get()` that the referenced `inventory_batches/{batchId}` document exists and belongs to `request.auth.uid`.
5. **Append-Only Immutability**: `inventory_ledger`, `traceability_events`, and `audit_events` forbid `update` and `delete`.
6. **Terminal State Locking**: Once an `alerts/{alertId}` document reaches `status == 'resolved'`, further client updates are denied.
7. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and remain immutable; `updatedAt` must equal `request.time` on updates.
8. **ID & Payload Bounds**: All single-document path IDs pass `isValidId()` (`^[a-zA-Z0-9_\-]+$`, `<= 128`). Every string and array enforces explicit `.size()` bounds and strict `keys().hasOnly(...)` schema allowlists.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Identity Spoofing on Scan Create**: Creating `/scans/scan_01` with `ownerId: "victim_uid"` while signed in as `attacker_uid`.
2. **PII Blanket Read**: Reading `/users/victim_uid` or listing `/users` as `attacker_uid`.
3. **Unverified Email Write**: Creating `/prescriptions/rx_01` with `request.auth.token.email_verified == false`.
4. **Shadow Field Injection**: Creating `/scans/scan_02` with an undeclared ghost key `isGenuineOverride: true`.
5. **Orphaned Ledger Write**: Creating `/inventory_ledger/led_01` referencing a non-existent or foreign `batchId`.
6. **Ledger History Tampering**: Updating or deleting an existing `/inventory_ledger/led_01` entry.
7. **Traceability Tampering**: Updating or deleting an existing `/traceability_events/evt_01` custody record.
8. **Terminal Alert Reopening**: Updating `/alerts/alt_01` after `existing().status == 'resolved'`.
9. **Path ID Poisoning**: Creating `/scans/` with a 200-char ID or invalid characters (`scan$drop`).
10. **Denial-of-Wallet Oversized String**: Submitting a 10KB string into `medicineName` (max 180).
11. **Backdated Timestamp Spoofing**: Creating `/audit_events/aud_01` with a client-forged `createdAt` instead of `request.time`.
12. **Cross-Tenant List Scraping**: Querying `/inventory_batches` without matching `ownerId == request.auth.uid`.
