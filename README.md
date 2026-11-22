# MediTrust AI — Counterfeit Medicine Detection & Medicine Safety Platform

**MediTrust AI** is a full-stack, bilingual (**English & Hindi / Hinglish**) counterfeit medicine detection, evidence-based authenticity verification, prescription management, and pharmacy supply-chain operations platform.

Rather than making unsafe binary "real/fake" claims from a single photograph, MediTrust AI combines **client-side optical barcode/QR decoding**, **image quality pre-checks**, **multimodal AI structured OCR**, **deterministic expiry and recall verification**, **a normalized Indian (CDSCO/IP) & global medicine reference catalogue**, **an immutable pharmacy batch & custody ledger**, **real AI function-calling pharmacy operations**, and **FEFO predictive inventory analytics**.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Core AI & Verification Model Pipeline](#core-ai--verification-model-pipeline)
3. [Non-Binary Evidence Status Semantics](#non-binary-evidence-status-semantics)
4. [Portal Features](#portal-features)
   - [Patient & Caregiver Portal](#patient--caregiver-portal)
   - [Pharmacist & Supply Chain Portal](#pharmacist--supply-chain-portal)
5. [Pharmacist AI Operations Agent (Function Calling)](#pharmacist-ai-operations-agent-function-calling)
6. [Predictive Inventory Analytics & Restocking Forecast](#predictive-inventory-analytics--restocking-forecast)
7. [Curated Medicine & Starter Stock Datasets](#curated-medicine--starter-stock-datasets)
8. [Backend REST API Reference](#backend-rest-api-reference)
9. [Data Model, Security & Clinical Safety Rules](#data-model-security--clinical-safety-rules)
10. [Tech Stack](#tech-stack)
11. [Getting Started & Deployment](#getting-started--deployment)

---

## System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Frontend SPA (React 19 + Vite)                       │
│   Tailwind CSS · Motion · Bilingual EN/HI Context · ZXing Barcode/GS1       │
│   Video Key-Frame Sampler · Interactive FEFO Depletion SVG Charts           │
│                                                                             │
│   ┌───────────────────────────────┐   ┌─────────────────────────────────┐   │
│   │   Patient & Caregiver Portal  │   │  Pharmacist & Supply Chain Hub  │   │
│   │  • AI Medicine Scanner        │   │  • Operations Dashboard         │   │
│   │  • Prescription & Dose Log    │   │  • Predictive Inventory Engine  │   │
│   │  • Secure Document Vault      │   │  • AI Operations Command Agent  │   │
│   │  • Multilingual AI Assistant  │   │  • Inventory, Catalogue & CSV   │   │
│   │  • Scan History & Alerts      │   │  • Traceability, Queue & Admin  │   │
│   └───────────────────────────────┘   └─────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ HTTPS / REST (/api/v1/*)
┌───────────────────────────────▼─────────────────────────────────────────────┐
│                     Express Full-Stack Server (server.ts)                   │
│                                                                             │
│  • Gemini Multimodal OCR, Document Analysis, Chat & Video Frame Inspection  │
│  • Gemini Function Calling Agent (8 Live Pharmacist Operational Tools)      │
│  • Resilient Model Routing: gemini-3.1-flash-lite → gemini-4-hydrogen       │
│  • Deterministic Verification Engine (Ledger + Catalogue + openFDA + Exp)   │
│  • Isolated Account Auth & Persistent Workspace API (/api/v1/account/*)     │
└──────────────┬───────────────────────────────────────┬──────────────────────┘
               │                                       │
┌──────────────▼────────────────────┐   ┌──────────────▼──────────────────────┐
│      External & Reference Data    │   │       Data & Auth Persistence       │
│  • Live openFDA Drug Label API    │   │  • Firebase Auth (Google Sign-In)   │
│  • Live openFDA Recall Feed API   │   │  • Cloud Firestore (Hardened Rules) │
│  • Normalized CDSCO/IP + Global   │   │  • Isolated Email/Password Accounts │
│    Medicine Reference Catalogue   │   │    with Per-Account Persistence     │
└───────────────────────────────────┘   └─────────────────────────────────────┘
```

---

## Core AI & Verification Model Pipeline

MediTrust AI executes a **4-stage evidence-first pipeline** whenever a medicine pack is scanned:

### Stage 1: Image Preparation & Deterministic Quality Gate
- Interactive **90° Left/Right rotation** and **crop focus presets** (`Full Frame`, `Center Focus`, `Label Strip`) on an offscreen HTML5 canvas before upload.
- Client-side deterministic **Laplacian variance sharpness**, **exposure/brightness**, and **resolution pre-check** flags blurry, underexposed, or glared photos before OCR runs.

### Stage 2: Optical QR, DataMatrix, EAN & GS1-128 Decoding + URL Safety Audit
- Real client-side barcode scanning powered by `@zxing/browser` (`BrowserMultiFormatReader`) decodes QR codes, DataMatrix, EAN-13, UPC, Code-128, and PDF417 codes.
- Parses **GS1 Application Identifiers** automatically: `(01)` GTIN, `(10)` Batch/Lot Number, `(17)` Expiry Date (`YYMMDD`), and `(21)` Serial Number, merging them into the verification confirmation form.
- Inspects decoded URLs for security risks (unencrypted `http://`, raw IP addresses, suspicious URL shorteners, or mismatched domains).

### Stage 3: Multimodal Pack OCR & Human-in-the-Loop Confirmation
- Server-side Gemini Vision (`POST /api/v1/scans/extract`) extracts structured JSON fields: `medicineName`, `genericName`, `strength`, `dosageForm`, `manufacturer`, `batchNumber`, `mfgDate`, `expiryDate`, `licenseInfo`, `identifiers`, and field-level confidence scores.
- **Mandatory Confirmation Step:** Users review and can correct extracted fields before verification runs; corrections are flagged (`userCorrected: true`) in the audit record.

### Stage 4: Multi-Source Deterministic Verification
The server verification engine (`POST /api/v1/verifications`) evaluates the confirmed fields across four deterministic layers:
1. **Deterministic Expiry Parser:** Normalizes `YYYY-MM-DD`, `MM/YYYY`, `MON YYYY`, and `DD/MM/YYYY` into `valid`, `near_expiry`, `expired`, or `ambiguous` with exact days remaining.
2. **Authorized Pharmacy Batch Ledger Match:** Checks exact medicine + batch/expiry match against the pharmacist's live stock ledger.
3. **Normalized Medicine Reference Catalogue (India CDSCO/IP + Global):** Cross-references brand names, aliases, salts/generics, strengths, and licensed manufacturers.
4. **Live openFDA Label & Recall Enforcement APIs:** Queries `api.fda.gov/drug/label.json` and `api.fda.gov/drug/enforcement.json` for official drug labeling and active recall notices.

---

## Non-Binary Evidence Status Semantics

MediTrust AI **never** fabricates manufacturer serialization or claims a medicine is authentic from a photo or QR code alone. Every scan and document resolves to an explicit, auditable status:

| Status | Meaning | When Assigned |
| :--- | :--- | :--- |
| **`verified_match`** | Verified Batch Match | Exact match confirmed against the **Authorized Pharmacy Batch Ledger** (with no active recall or expiry mismatch). |
| **`needs_review`** | Needs Manual Review | Product matched the **Normalized Medicine Catalogue** or **openFDA Reference Label**, or visual extraction completed, but manufacturer-level pack serialization is not connected. |
| **`mismatch_suspicious`** | Mismatch / Suspicious | Active recall hit, batch/expiry conflict against ledger records, expired stock, or structural tampering/anomalies detected. |
| **`not_found`** | Not Found in Connected Sources | Medicine/batch could not be located in the authorized ledger, reference catalogue, or live openFDA APIs. |
| **`provider_unavailable`** | Verification Provider Unavailable | External regulatory API timed out or was unreachable at scan time. |

---

## Portal Features

### Patient & Caregiver Portal
- **Patient Overview Dashboard:** Personal scan summary, active prescriptions, adherence count, recent verification outcomes, and safety alerts.
- **AI Medicine Scanner:** 4-step workflow (`Capture` → `Prepare & Inspect (Crop/Rotate/Quality/QR/GS1)` → `Confirm Fields` → `Evidence Report`) with downloadable record summary.
- **Prescription Tracker:** Add prescriptions manually or auto-import extracted medicines directly from verified prescription documents; track dose adherence (`Log Dose`), status (`active`, `paused`, `completed`, `flagged`), and linked batch numbers.
- **Secure Document Vault:** Upload prescriptions, pharmacy invoices, product leaflets, lab reports, or Certificates of Analysis (PDF/image). Computes client-side **SHA-256 cryptographic file hashes**, runs structured AI entity & anomaly extraction, and flags missing signatures/dates/totals.
- **Multilingual Medicine Safety AI Assistant:** Ask grounded questions in **English, Hindi (देवनागरी), or Hinglish**, pin any saved scan/document as grounding context, attach images or PDFs, or upload **packaging videos (MP4/WebM/MOV)** for timestamped key-frame (`MM:SS`) multimodal inspection.
- **Verification History & Safety Alerts:** Filterable scan archive and actionable alert acknowledgement/resolution.

### Pharmacist & Supply Chain Portal
- **Pharmacy Operations Dashboard:** Editable pharmacy profile (custom Pharmacy Name, Drug License/Registration No., and City), live stock KPIs, shelf-life horizon bar, recent immutable ledger feed, priority batch watchlist, **AI Pharmacy Operations Command Bar**, and **Predictive Inventory Analytics & Restocking Forecast**.
- **Inventory Management, Catalogue & Immutable Ledger:**
  - **Batch Stock Tab:** Live balances, expiry badges, reorder thresholds, quarantine/recall flags, and quick movement actions (`DISPENSE`, `RECEIPT`, `RETURN`, `ADJUSTMENT`, `TRANSFER`, `RECONCILIATION`).
  - **Bulk CSV / JSON Batch Upload** with downloadable CSV template and automatic metadata enrichment from the Normalized Medicine Catalogue.
  - **AI Pack Photo OCR Receipt** to prefill new incoming batches directly from a pack photo.
  - **Product Catalogue Tab (28 products):** Searchable reference directory with 1-click **Receive Batch** prefill.
  - **Physical vs. Ledger Stock Reconciliation Tab:** Bulk shelf-count entry calculating variance automatically and posting immutable `RECONCILIATION` ledger entries.
  - **Immutable Ledger Tab:** Append-only transaction history recording every stock delta, resulting balance, actor, invoice reference, and timestamp.
- **Verification Review Queue:** Triage flagged or pending scans (`pending_review`, `escalated`, `quarantined`, `cleared`) with pharmacist reviewer notes.
- **Supply Chain Traceability:** End-to-end custody timeline per batch (`MANUFACTURED`, `DISPATCHED`, `RECEIVED`, `TRANSFERRED`, `DISPENSED`, `QUARANTINED`).
- **Compliance Reports & Exports:** Export inventory, immutable ledger, traceability logs, and audit events to CSV/JSON.
- **Admin & Connectors Console:** Live integration health probes (including openFDA latency and active AI models), browser Web Notification permissions, automated expiry/low-stock safety sweep engine, Distributor/Supplier upstream dispatch hand-off console, and searchable/exportable Workspace Audit Log.

---

## Pharmacist AI Operations Agent (Function Calling)

Available directly on the **Pharmacy Dashboard**, **Inventory Management**, and **Multilingual Pharmacy AI Copilot**, the AI Operations Agent uses real **Gemini Function Calling** (`@google/genai` `FunctionDeclaration` tools via `POST /api/v1/pharmacist/ai-agent`) bound to the pharmacist's live inventory and open alerts.

| Tool Name | Real Pharmacy Operation Executed |
| :--- | :--- |
| **`receive_stock_batch`** | Creates a new batch in `inventory_batches`, appends a `RECEIPT` ledger entry, logs a `RECEIVED` custody event, and enriches missing manufacturer/generic/MRP fields from the catalogue. |
| **`record_stock_movement`** | Records `DISPENSE`, `RECEIPT`, `RETURN`, `ADJUSTMENT`, `TRANSFER`, or `RECONCILIATION` movements against a matched batch and updates live balances atomically. |
| **`quarantine_or_flag_batch`** | Marks a batch `mismatch_suspicious` + `recallFlagged = true`, logs a `QUARANTINED` traceability event, and raises a critical safety alert. |
| **`create_safety_alert`** | Creates a real staff safety alert (`expired`, `near_expiry`, `low_stock`, `recall`, `mismatch`, `document_flag`) in the Alerts queue. |
| **`resolve_safety_alert`** | Acknowledges or resolves matching open safety alerts with an audit note. |
| **`log_distributor_handoff`** | Appends upstream `DISPATCHED` or downstream custody events to `traceability_events`. |
| **`generate_reorder_purchase_order`** | Computes a structured supplier Purchase Order (`PO-YYYYMMDD-XXX`) for low-stock, expired, and near-expiry batches with INR cost totals and downloadable CSV. |
| **`audit_pharmacy_risk_summary`** | Audits all active batches for expiry risk, low stock, quarantine flags, missing upstream dispatches, and pending review scans. |

**Safety & Governance:** Supports **1-Click Review & Execute** confirmation cards (or an optional **Auto-Execute Actions** toggle) and logs every executed operation as an immutable `AI_AGENT_*` entry in `audit_events`.

---

## Predictive Inventory Analytics & Restocking Forecast

Built into the **Pharmacy Operations Dashboard**, the predictive analytics module combines a deterministic **FEFO (First Expired, First Out) Depletion Simulator** with optional grounded AI procurement commentary:

- **Hybrid Daily Velocity Model:** Tracks real 7-day and 30-day ledger outflows (`Observed Ledger Trend`), blends early dispenses with therapeutic-class priors (`Hybrid Trend`), and falls back transparently to `Clinical Baseline` demand rates on newly onboarded stock.
- **Interactive Scenario Controls:** Switch forecast horizon (**14d / 30d / 60d**) and supplier lead time (**3d / 5d / 7d**) to recalculate stockout dates, safety buffers, pack-rounded order quantities, and INR procurement budgets in real time.
- **Interactive FEFO Stock Depletion SVG Chart:** Click any medication row to inspect its projected stock depletion curve against its dashed **Reorder Threshold** line, batch expiry cutoffs, and projected stockout day.
- **Common Essentials Coverage Gap Detector:** Flags high-turnover common pharmacy essentials (e.g., *Crocin Advance, Ecosprin 75, Thyronorm 50, Electral ORS*) missing from current inventory with suggested initial stock quantities and 1-click **Add Initial Stock**.
- **Actionable Outputs:** One-click **Raise Restocking Alert** (single or batch sweep, deduplicated), one-click **Restock** batch creation, **Export CSV**, and bilingual **AI Procurement Brief** (`POST /api/v1/pharmacist/predictive-insights`).

---

## Curated Medicine & Starter Stock Datasets

1. **Normalized Medicine Reference Catalogue (`28` curated entries):**
   - Covers high-frequency **Indian (CDSCO / IP)** brands (*Dolo-650, Augmentin 625 Duo, Azithral 500, Pan-D, Telma 40, Glycomet-GP 1, Ecosprin 75, Shelcal 500, Allegra 120, Montair LC, Crocin Advance, Calpol 500, Thyronorm 50, Atorva 10, Omez 20, Combiflam, Limcee 500, Zincovit, Amlokind 5, Metpure-XL 50, Okacet, Becosules, Electral ORS, Asthalin Inhaler*) and **US / Global (FDA / USP)** references (*Tylenol, Advil, Glucophage, Lipitor*).
2. **Pharmacist Starter Stock Dataset (`8` realistic dynamic-date batches):**
   - Automatically seeded on initial Pharmacist onboarding (and loadable anytime via **Load Starter Dataset**) covering healthy stock, near-expiry watchlist batches, low-stock reorder alerts, upstream distributor hand-offs, and a batch needing pharmacist verification review.

---

## Backend REST API Reference

| Method & Endpoint | Purpose |
| :--- | :--- |
| `GET /api/v1/health` | Service status, active Gemini fallback models, catalogue size, and connector flags (`?probe=true` runs a live openFDA latency ping). |
| `GET /api/v1/catalogue?q=...` | Search the Normalized Indian (CDSCO/IP) & Global Medicine Reference Catalogue. |
| `POST /api/v1/scans/extract` | Multimodal Gemini Vision OCR extracting structured medicine label fields from pack photos. |
| `POST /api/v1/verifications` | Deterministic multi-source verification (Authorized Ledger + Catalogue + live openFDA + Expiry Parser). |
| `POST /api/v1/documents/verify` | AI document structure & anomaly verification for prescriptions, invoices, leaflets, lab reports, and COAs. |
| `POST /api/v1/chat` | Grounded multilingual AI assistant (English / Hindi / Hinglish) supporting text, images, PDFs, and timestamped video frames. |
| `POST /api/v1/pharmacist/ai-agent` | Gemini Function Calling agent returning executable pharmacy actions, Purchase Orders, and live Risk Audits. |
| `POST /api/v1/pharmacist/predictive-insights` | Grounded executive procurement & restocking brief based on computed FEFO forecast metrics. |
| `POST /api/v1/account/*` | Isolated Email/Password registration, login, session management, and per-account persistent workspace CRUD. |

---

## Data Model, Security & Clinical Safety Rules

- **Collections:** `users`, `scans`, `prescriptions`, `verified_documents`, `inventory_batches`, `inventory_ledger`, `traceability_events`, `alerts`, `chat_messages`, `audit_events`.
- **Strict Tenant Isolation:** Every document is strictly scoped by `ownerId` (enforced both in `firestore.rules` for Firebase Auth users and in signed session tokens for server-backed Email/Password workspaces).
- **Append-Only Auditability:** `inventory_ledger`, `traceability_events`, and `audit_events` are append-only — historical stock movements, custody hand-offs, and AI actions cannot be mutated or deleted.
- **Clinical Safety Guardrails:** The AI never diagnoses medical conditions, prescribes treatment changes, overrides deterministic verification statuses, or certifies a medicine genuine from visual inspection alone.
- **Server-Side API Key Security:** All `@google/genai` SDK calls execute exclusively on the Express backend using `process.env.GEMINI_API_KEY`; no model secrets are exposed to the browser bundle.

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Motion (`motion/react`), Lucide Icons, `@zxing/browser` & `@zxing/library`
- **Backend:** Node.js 22 (native ESM TypeScript support), Express 4, `@google/genai` SDK (`gemini-3.1-flash-lite` primary with exponential backoff retry & automatic fallback to `gemini-4-hydrogen`)
- **Database & Auth:** Firebase Authentication + Cloud Firestore (with hardened `firestore.rules`) and isolated server-backed Email/Password workspaces

---

## Getting Started & Deployment

### Prerequisites
- Node.js `>= 22.x`
- A Gemini API key configured as `GEMINI_API_KEY`

### Environment Variables
Copy `.env.example` to `.env` and configure:
```env
GEMINI_API_KEY="your-gemini-api-key"
APP_URL="http://localhost:3000"
```

### Local Development
```bash
# Install dependencies
npm install

# Run full-stack development server (Express + Vite middleware on port 3000)
npm run dev
```

### Type-Check & Production Build
```bash
# Run TypeScript type check
npm run lint

# Build production frontend bundle into dist/
npm run build

# Start production server (Node.js 22 native TypeScript ESM)
NODE_ENV=production npm start
```
