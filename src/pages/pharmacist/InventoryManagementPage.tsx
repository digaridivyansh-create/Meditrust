import React, { useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  Package,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { FeatureSpotlight, MEDIA_ASSETS } from '../../components/EditorialMedia';
import { CLINICAL_QUOTES } from '../../lib/i18n';
import {
  createSafetyAlert,
  logAuditEvent,
  receiveInventoryStock,
  recordStockMovement,
  updateBatchSettings,
} from '../../lib/firestoreService';
import {
  NORMALIZED_MEDICINE_CATALOGUE,
  parseBatchUploadFile,
  STARTER_BATCH_CSV_TEMPLATE,
  type NormalizedMedicineRecord,
} from '../../lib/medicineDataset';
import { seedStarterPharmacyStock } from '../../lib/starterStockSeeder';
import {
  computeExpiryStatus,
  downloadTextFile,
  fileToBase64AndHash,
  formatTimestamp,
} from '../../lib/utils';
import { ExpiryStatusLabel, VerificationStatusLabel } from '../../components/StatusIndicator';
import { PharmacistAiCommandBar } from '../../components/PharmacistAiCommandBar';
import type { InventoryBatch, MovementType, VerificationStatus } from '../../types';

export function InventoryManagementPage() {
  const { user, profile, data } = useAuth();
  const { t } = useLanguage();
  const nearDays = profile?.nearExpiryDays || 90;

  const [viewTab, setViewTab] = useState<'batches' | 'ledger' | 'catalogue' | 'reconcile'>('batches');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'near_expiry' | 'expired' | 'flagged'>('all');
  const [search, setSearch] = useState('');
  const [seedingDataset, setSeedingDataset] = useState(false);
  const [uploadingCsv, setUploadingCsv] = useState(false);

  // Bulk Physical Reconciliation state (batchId -> counted string)
  const [reconCounts, setReconCounts] = useState<Record<string, string>>({});
  const [reconReason, setReconReason] = useState('Monthly physical shelf count reconciliation');
  const [reconciling, setReconciling] = useState(false);

  // Receive Stock Modal/Panel State
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [medicineName, setMedicineName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [strength, setStrength] = useState('');
  const [dosageForm, setDosageForm] = useState('Tablet');
  const [manufacturer, setManufacturer] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [mfgDate, setMfgDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [reorderThreshold, setReorderThreshold] = useState('25');
  const [unitPrice, setUnitPrice] = useState('45');
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('needs_review');

  // Stock Movement / Reconciliation Modal State
  const [activeBatch, setActiveBatch] = useState<InventoryBatch | null>(null);
  const [movementType, setMovementType] = useState<MovementType>('DISPENSE');
  const [moveQty, setMoveQty] = useState('1');
  const [physicalCount, setPhysicalCount] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [moveInvoiceRef, setMoveInvoiceRef] = useState('');

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const filteredBatches = data.batches.filter((b) => {
    const exp = computeExpiryStatus(b.expiryDate, nearDays);
    if (statusFilter === 'low' && b.quantityOnHand > b.reorderThreshold) return false;
    if (statusFilter === 'near_expiry' && exp !== 'near_expiry') return false;
    if (statusFilter === 'expired' && exp !== 'expired') return false;
    if (statusFilter === 'flagged' && !b.recallFlagged && b.verificationStatus !== 'mismatch_suspicious') {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        b.medicineName.toLowerCase().includes(q) ||
        b.batchNumber.toLowerCase().includes(q) ||
        b.manufacturer.toLowerCase().includes(q) ||
        b.supplierName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // OCR prefill for Receive Stock
  const handleScanPrefill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setOcrLoading(true);
    try {
      const { base64 } = await fileToBase64AndHash(file);
      const res = await fetch('/api/v1/scans/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Pack OCR extraction failed.');
      const f = json.fields || {};
      if (f.medicineName) setMedicineName(f.medicineName);
      if (f.genericName) setGenericName(f.genericName);
      if (f.strength) setStrength(f.strength);
      if (f.dosageForm) setDosageForm(f.dosageForm);
      if (f.manufacturer) setManufacturer(f.manufacturer);
      if (f.batchNumber) setBatchNumber(f.batchNumber);
      if (f.mfgDate) setMfgDate(f.mfgDate);
      if (f.expiryDate) setExpiryDate(f.expiryDate);
      setSuccessMsg('Fields prefilled via Gemini Pack OCR. Confirm every field before committing stock receipt.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to extract pack fields.');
    } finally {
      setOcrLoading(false);
      e.target.value = '';
    }
  };

  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg('');
    setSuccessMsg('');
    setBusy(true);
    try {
      const qtyNum = Math.max(0, Math.round(Number(quantity) || 0));
      const reorderNum = Math.max(0, Math.round(Number(reorderThreshold) || 0));
      const priceNum = Math.max(0, Number(unitPrice) || 0);

      const batchId = await receiveInventoryStock({
        ownerId: user.uid,
        pharmacyName: profile?.pharmacyName || 'Authorized Pharmacy',
        actorName: profile?.displayName || 'Pharmacist',
        medicineName,
        genericName,
        strength,
        dosageForm,
        manufacturer,
        batchNumber,
        mfgDate,
        expiryDate,
        supplierName,
        invoiceRef,
        quantity: qtyNum,
        reorderThreshold: reorderNum,
        unitPrice: priceNum,
        verificationStatus,
      });

      await logAuditEvent({
        ownerId: user.uid,
        portalRole: 'pharmacist',
        actorName: profile?.displayName || 'Pharmacist',
        action: 'STOCK_RECEIPT_COMMITTED',
        targetType: 'inventory_batch',
        targetId: batchId,
        details: `Received ${qtyNum} units of ${medicineName} (Batch ${batchNumber}, Exp ${expiryDate}) from ${supplierName}.`,
      });

      // Automatic alerts for expired, near-expiry, or low-stock receipts
      const expStatus = computeExpiryStatus(expiryDate, nearDays);
      if (expStatus === 'expired' || expStatus === 'near_expiry') {
        await createSafetyAlert({
          ownerId: user.uid,
          portalRole: 'pharmacist',
          alertType: expStatus,
          severity: expStatus === 'expired' ? 'critical' : 'warning',
          title:
            expStatus === 'expired'
              ? `Expired Stock Registered: ${medicineName}`
              : `Near-Expiry Batch Received: ${medicineName}`,
          triggerDetails: `Batch ${batchNumber} has expiry date ${expiryDate} (Supplier: ${supplierName}).`,
          affectedProduct: medicineName,
          affectedBatch: batchNumber,
          sourceReference: invoiceRef || 'Stock Receipt Ledger',
        });
      }

      setMedicineName('');
      setGenericName('');
      setStrength('');
      setManufacturer('');
      setBatchNumber('');
      setMfgDate('');
      setExpiryDate('');
      setSupplierName('');
      setInvoiceRef('');
      setQuantity('100');
      setShowReceiveForm(false);
      setSuccessMsg('Stock batch received and committed atomically to inventory & immutable ledger.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to commit stock receipt.');
    } finally {
      setBusy(false);
    }
  };

  const handleCommitMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeBatch) return;
    if (!moveReason.trim()) {
      setErrorMsg('An explicit reason is mandatory for all stock movements and adjustments.');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setBusy(true);
    try {
      let delta = 0;
      if (movementType === 'RECONCILIATION') {
        const target = Math.max(0, Math.round(Number(physicalCount)));
        delta = target - activeBatch.quantityOnHand;
      } else {
        const absQty = Math.max(1, Math.round(Number(moveQty) || 0));
        delta =
          movementType === 'DISPENSE' || movementType === 'TRANSFER'
            ? -absQty
            : movementType === 'ADJUSTMENT'
              ? Math.round(Number(moveQty) || 0)
              : absQty;
      }

      const newBal = await recordStockMovement({
        ownerId: user.uid,
        batch: activeBatch,
        movementType,
        quantityDelta: delta,
        reason: moveReason.trim(),
        invoiceRef: moveInvoiceRef.trim(),
        actorName: profile?.displayName || 'Pharmacist',
      });

      await logAuditEvent({
        ownerId: user.uid,
        portalRole: 'pharmacist',
        actorName: profile?.displayName || 'Pharmacist',
        action: `INVENTORY_${movementType}`,
        targetType: 'inventory_batch',
        targetId: activeBatch.id,
        details: `${movementType} (${delta >= 0 ? `+${delta}` : delta}) on ${activeBatch.medicineName} Batch ${activeBatch.batchNumber}. New balance: ${newBal}. Reason: ${moveReason.trim()}`,
      });

      if (newBal <= activeBatch.reorderThreshold) {
        await createSafetyAlert({
          ownerId: user.uid,
          portalRole: 'pharmacist',
          alertType: 'low_stock',
          severity: 'warning',
          title: `Low Stock Alert: ${activeBatch.medicineName}`,
          triggerDetails: `Batch ${activeBatch.batchNumber} dropped to ${newBal} units (threshold: ${activeBatch.reorderThreshold}).`,
          affectedProduct: activeBatch.medicineName,
          affectedBatch: activeBatch.batchNumber,
          sourceReference: 'Inventory Ledger Engine',
        });
      }

      setActiveBatch(null);
      setMoveReason('');
      setMoveInvoiceRef('');
      setSuccessMsg(`Ledger movement committed. Updated balance: ${newBal} units.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to record stock movement.');
    } finally {
      setBusy(false);
    }
  };

  const toggleRecallFlag = async (batch: InventoryBatch) => {
    if (!user) return;
    const nextFlag = !batch.recallFlagged;
    await updateBatchSettings(batch.id, {
      reorderThreshold: batch.reorderThreshold,
      unitPrice: batch.unitPrice,
      verificationStatus: nextFlag ? 'mismatch_suspicious' : batch.verificationStatus,
      recallFlagged: nextFlag,
    });
    await logAuditEvent({
      ownerId: user.uid,
      portalRole: 'pharmacist',
      actorName: profile?.displayName || 'Pharmacist',
      action: nextFlag ? 'BATCH_QUARANTINED_RECALL' : 'BATCH_RECALL_CLEARED',
      targetType: 'inventory_batch',
      targetId: batch.id,
      details: `${nextFlag ? 'Flagged' : 'Cleared'} recall/quarantine hold on ${batch.medicineName} Batch ${batch.batchNumber}.`,
    });
  };

  const handleLoadStarterDataset = async () => {
    if (!user) return;
    setErrorMsg('');
    setSuccessMsg('');
    setSeedingDataset(true);
    try {
      const res = await seedStarterPharmacyStock({
        ownerId: user.uid,
        pharmacyName: profile?.pharmacyName || 'Authorized Pharmacy',
        actorName: profile?.displayName || 'Pharmacist',
        existingBatches: data.batches,
        nearExpiryDays: nearDays,
      });
      if (res.addedCount === 0) {
        setSuccessMsg(
          t(
            'All 8 trained starter stock batches are already present in your pharmacy ledger.',
            'सभी 8 प्रशिक्षित स्टार्टर स्टॉक बैच पहले से आपकी फार्मेसी इन्वेंट्री में मौजूद हैं।'
          )
        );
      } else {
        setSuccessMsg(
          t(
            `Loaded ${res.addedCount} trained starter stock batch(es) into your pharmacy inventory, immutable ledger, and traceability chain.`,
            `${res.addedCount} प्रशिक्षित स्टार्टर स्टॉक बैच आपकी इन्वेंट्री, लेजर और सप्लाई चेन में सफलतापूर्वक लोड हो गए।`
          )
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load starter stock dataset.');
    } finally {
      setSeedingDataset(false);
    }
  };

  const handleBulkBatchFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setErrorMsg('');
    setSuccessMsg('');
    setUploadingCsv(true);
    try {
      const text = await file.text();
      const { batches: parsedBatches, warnings } = parseBatchUploadFile(text, file.name);
      if (parsedBatches.length === 0) {
        setErrorMsg(warnings[0] || 'No valid batches found in uploaded file.');
        return;
      }

      let imported = 0;
      for (const b of parsedBatches) {
        await receiveInventoryStock({
          ownerId: user.uid,
          pharmacyName: profile?.pharmacyName || 'Authorized Pharmacy',
          actorName: profile?.displayName || 'Pharmacist',
          medicineName: b.medicineName,
          genericName: b.genericName,
          strength: b.strength,
          dosageForm: b.dosageForm,
          manufacturer: b.manufacturer,
          batchNumber: b.batchNumber,
          mfgDate: b.mfgDate,
          expiryDate: b.expiryDate,
          supplierName: b.supplierName,
          invoiceRef: b.invoiceRef,
          quantity: b.quantity,
          reorderThreshold: b.reorderThreshold,
          unitPrice: b.unitPrice,
          verificationStatus: 'needs_review',
        });
        imported++;
      }

      await logAuditEvent({
        ownerId: user.uid,
        portalRole: 'pharmacist',
        actorName: profile?.displayName || 'Pharmacist',
        action: 'BULK_BATCH_FILE_UPLOADED',
        targetType: 'inventory_batch',
        targetId: user.uid,
        details: `Uploaded ${imported} custom stock batch(es) from ${file.name}.`,
      });

      setSuccessMsg(
        t(
          `Uploaded ${imported} new batch(es) from ${file.name} into inventory & immutable ledger.${warnings.length ? ` (${warnings.length} row warning(s))` : ''}`,
          `${file.name} से ${imported} नए बैच आपकी इन्वेंट्री और लेजर में सफलतापूर्वक अपलोड हो गए।`
        )
      );
      setViewTab('batches');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process batch upload file.');
    } finally {
      setUploadingCsv(false);
      e.target.value = '';
    }
  };

  const prefillFromCatalogue = (med: NormalizedMedicineRecord) => {
    setMedicineName(med.brandName);
    setGenericName(med.genericName);
    setStrength(med.strength);
    setDosageForm(med.dosageForm);
    setManufacturer(med.manufacturer);
    setUnitPrice(String(med.referencePriceInr));
    setVerificationStatus('verified_match');
    setShowReceiveForm(true);
    setViewTab('batches');
    setSuccessMsg(
      t(
        `Prefilled "${med.brandName}" from Normalized Medicine Catalogue. Enter your batch number, expiry, and quantity to commit.`,
        `कैटलॉग से "${med.brandName}" का विवरण भर दिया गया है। बैच नंबर, एक्सपायरी और मात्रा दर्ज करके सेव करें।`
      )
    );
  };

  const handleBulkReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const reasonText = reconReason.trim();
    if (!reasonText) {
      setErrorMsg(t('Please enter an audit reason for reconciliation.', 'रिकॉन्सिलेशन के लिए ऑडिट कारण दर्ज करें।'));
      return;
    }

    const targets = data.batches.filter((b) => {
      const val = reconCounts[b.id];
      return val !== undefined && val !== '' && Number(val) !== b.quantityOnHand;
    });

    if (targets.length === 0) {
      setErrorMsg(
        t(
          'Enter at least one physical count that differs from the current ledger quantity.',
          'कम से कम एक बैच की भौतिक गिनती दर्ज करें जो वर्तमान लेजर मात्रा से अलग हो।'
        )
      );
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setReconciling(true);
    try {
      for (const batch of targets) {
        const physical = Math.max(0, Math.round(Number(reconCounts[batch.id])));
        const delta = physical - batch.quantityOnHand;
        await recordStockMovement({
          ownerId: user.uid,
          batch,
          movementType: 'RECONCILIATION',
          quantityDelta: delta,
          reason: reasonText,
          actorName: profile?.displayName || 'Pharmacist',
        });
        await logAuditEvent({
          ownerId: user.uid,
          portalRole: 'pharmacist',
          actorName: profile?.displayName || 'Pharmacist',
          action: 'INVENTORY_RECONCILIATION',
          targetType: 'inventory_batch',
          targetId: batch.id,
          details: `Reconciled ${batch.medicineName} (${batch.batchNumber}): ledger ${batch.quantityOnHand} -> physical ${physical} (variance ${delta >= 0 ? `+${delta}` : delta}). Reason: ${reasonText}`,
        });
      }
      setReconCounts({});
      setSuccessMsg(
        t(
          `Committed physical count reconciliation across ${targets.length} batch(es) into immutable ledger.`,
          `${targets.length} बैच का भौतिक स्टॉक रिकॉन्सिलेशन स्थायी लेजर में दर्ज हो गया है।`
        )
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to commit stock reconciliation.');
    } finally {
      setReconciling(false);
    }
  };

  const filteredCatalogue = NORMALIZED_MEDICINE_CATALOGUE.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.brandName.toLowerCase().includes(q) ||
      m.genericName.toLowerCase().includes(q) ||
      m.manufacturer.toLowerCase().includes(q) ||
      m.therapeuticClass.toLowerCase().includes(q) ||
      m.aliases.some((a) => a.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1B2B]">
            {t(
              'Inventory Management, Catalogue & Immutable Stock Ledger',
              'इन्वेंट्री प्रबंधन, दवा कैटलॉग और अपरिवर्तनीय स्टॉक लेजर'
            )}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {t(
              'Pre-loaded with the trained Indian pharmacy starter dataset, plus bulk CSV/JSON batch upload, pack OCR receipt, product catalogue, and physical count reconciliation.',
              'प्रशिक्षित फार्मेसी स्टार्टर डेटासेट के साथ, CSV/JSON बैच अपलोड, पैक OCR, दवा कैटलॉग और भौतिक स्टॉक मिलान की पूरी सुविधा।'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={seedingDataset}
            onClick={() => void handleLoadStarterDataset()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap cursor-pointer"
          >
            <Database className="w-3.5 h-3.5 text-[#0D7377]" />
            <span>
              {seedingDataset
                ? t('Loading Dataset...', 'डेटासेट लोड हो रहा है...')
                : t('Load Starter Dataset', 'स्टार्टर डेटासेट लोड करें')}
            </span>
          </button>

          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-[#0D7377]" />
            <span>
              {uploadingCsv
                ? t('Uploading...', 'अपलोड हो रहा है...')
                : t('Upload CSV / JSON Batches', 'CSV / JSON बैच अपलोड करें')}
            </span>
            <input
              type="file"
              accept=".csv,.json,text/csv,application/json"
              disabled={uploadingCsv}
              onChange={(e) => void handleBulkBatchFileUpload(e)}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() =>
              downloadTextFile('meditrust-batch-upload-template.csv', STARTER_BATCH_CSV_TEMPLATE)
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            title={t('Download sample CSV template', 'सैंपल CSV टेम्पलेट डाउनलोड करें')}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('CSV Template', 'CSV टेम्पलेट')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowReceiveForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('Add New Batch', 'नया बैच जोड़ें')}</span>
          </button>
        </div>
      </div>

      <FeatureSpotlight
        imageSrc={MEDIA_ASSETS.pharmacyDispensary}
        imageAlt="Pharmacy dispensary inventory shelves and stock workstation"
        {...CLINICAL_QUOTES.features.inventory}
        compact
      />

      <PharmacistAiCommandBar compact />

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Receive Stock Shipment Form */}
      {showReceiveForm && (
        <form
          onSubmit={handleReceiveStock}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                Register Stock Receipt
              </h3>
              <p className="text-xs text-slate-500">
                Creates the batch record, initial RECEIPT ledger entry, and RECEIVED custody event
                atomically.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#0B1B2B] bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap">
              {ocrLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0D7377]" />
              ) : (
                <Camera className="w-3.5 h-3.5 text-[#0D7377]" />
              )}
              <span>{ocrLoading ? 'Extracting Pack...' : 'Prefill via Pack Photo OCR'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={ocrLoading}
                onChange={(e) => void handleScanPrefill(e)}
                className="hidden"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Medicine Name *
              </label>
              <input
                type="text"
                required
                maxLength={180}
                value={medicineName}
                onChange={(e) => setMedicineName(e.target.value)}
                placeholder="e.g., Amoxicillin & Clavulanate"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Generic Salt
              </label>
              <input
                type="text"
                maxLength={180}
                value={genericName}
                onChange={(e) => setGenericName(e.target.value)}
                placeholder="Active ingredient"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Strength</label>
              <input
                type="text"
                maxLength={80}
                value={strength}
                onChange={(e) => setStrength(e.target.value)}
                placeholder="e.g., 625 mg"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Manufacturer *
              </label>
              <input
                type="text"
                required
                maxLength={180}
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="Manufacturer name"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Batch / Lot No. *
              </label>
              <input
                type="text"
                required
                maxLength={80}
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="e.g., AMX-2604A"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Expiry Date (YYYY-MM-DD) *
              </label>
              <input
                type="date"
                required
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Supplier / Distributor *
              </label>
              <input
                type="text"
                required
                maxLength={160}
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Authorized distributor name"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice Reference
              </label>
              <input
                type="text"
                maxLength={100}
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="e.g., INV-2026-9914"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Quantity Received *
              </label>
              <input
                type="number"
                required
                min={0}
                max={1000000}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reorder Threshold
              </label>
              <input
                type="number"
                required
                min={0}
                max={100000}
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unit Price (₹)
              </label>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Initial Verification Status
              </label>
              <select
                value={verificationStatus}
                onChange={(e) => setVerificationStatus(e.target.value as VerificationStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              >
                <option value="verified_match">Verified Source Match (Invoice + Batch Confirmed)</option>
                <option value="needs_review">Needs Manual Review</option>
                <option value="not_found">Not Found in External Source</option>
                <option value="mismatch_suspicious">Mismatch / Suspicious</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowReceiveForm(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] disabled:opacity-60 cursor-pointer"
            >
              {busy ? 'Committing Ledger...' : 'Confirm & Commit Stock Receipt'}
            </button>
          </div>
        </form>
      )}

      {/* Stock Movement / Physical Reconciliation Drawer */}
      {activeBatch && (
        <form
          onSubmit={handleCommitMovement}
          className="bg-white border border-slate-300 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                Record Ledger Movement · {activeBatch.medicineName}
              </h3>
              <p className="font-mono text-xs text-slate-500 mt-0.5 tabular-nums">
                Batch {activeBatch.batchNumber} · Current Ledger Balance: {activeBatch.quantityOnHand}{' '}
                units · Exp {activeBatch.expiryDate}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveBatch(null)}
              className="text-xs text-slate-500 hover:text-[#0B1B2B] cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Movement Type *
              </label>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as MovementType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              >
                <option value="DISPENSE">Dispense / Sale (-)</option>
                <option value="RECEIPT">Additional Receipt (+)</option>
                <option value="RETURN">Customer / Supplier Return (+)</option>
                <option value="TRANSFER">Branch Transfer (-)</option>
                <option value="ADJUSTMENT">Manual Adjustment (+/-)</option>
                <option value="RECONCILIATION">Physical Count Reconciliation</option>
              </select>
            </div>

            {movementType === 'RECONCILIATION' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Actual Physical Count *
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  value={physicalCount}
                  onChange={(e) => setPhysicalCount(e.target.value)}
                  placeholder={`Recorded: ${activeBatch.quantityOnHand}`}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {movementType === 'ADJUSTMENT' ? 'Delta (+/-) *' : 'Quantity *'}
                </label>
                <input
                  type="number"
                  required
                  value={moveQty}
                  onChange={(e) => setMoveQty(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mandatory Audit Reason *
              </label>
              <input
                type="text"
                required
                maxLength={400}
                value={moveReason}
                onChange={(e) => setMoveReason(e.target.value)}
                placeholder="e.g., Dispensed Rx #402 / Damaged blister strip"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice / Rx Reference
              </label>
              <input
                type="text"
                maxLength={100}
                value={moveInvoiceRef}
                onChange={(e) => setMoveInvoiceRef(e.target.value)}
                placeholder="Optional reference"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1B2B] rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              {busy ? 'Recording...' : 'Commit Immutable Ledger Entry'}
            </button>
          </div>
        </form>
      )}

      {/* View Switcher & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setViewTab('batches')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewTab === 'batches'
                  ? 'bg-white text-[#0B1B2B] shadow-xs'
                  : 'text-slate-600 hover:text-[#0B1B2B]'
              }`}
            >
              {t('Batch Stock', 'बैच स्टॉक')} ({data.batches.length})
            </button>
            <button
              type="button"
              onClick={() => setViewTab('ledger')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewTab === 'ledger'
                  ? 'bg-white text-[#0B1B2B] shadow-xs'
                  : 'text-slate-600 hover:text-[#0B1B2B]'
              }`}
            >
              {t('Immutable Ledger', 'स्थायी लेजर')} ({data.ledger.length})
            </button>
            <button
              type="button"
              onClick={() => setViewTab('catalogue')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewTab === 'catalogue'
                  ? 'bg-white text-[#0B1B2B] shadow-xs'
                  : 'text-slate-600 hover:text-[#0B1B2B]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>
                {t('Product Catalogue', 'दवा कैटलॉग')} ({NORMALIZED_MEDICINE_CATALOGUE.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewTab('reconcile')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewTab === 'reconcile'
                  ? 'bg-white text-[#0B1B2B] shadow-xs'
                  : 'text-slate-600 hover:text-[#0B1B2B]'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>{t('Stock Reconciliation', 'स्टॉक मिलान')}</span>
            </button>
          </div>

          {viewTab === 'batches' && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {(
                [
                  { id: 'all', label: t('All', 'सभी') },
                  { id: 'low', label: t('Low Stock', 'कम स्टॉक') },
                  { id: 'near_expiry', label: t('Near Expiry', 'नज़दीकी एक्सपायरी') },
                  { id: 'expired', label: t('Expired', 'समाप्त') },
                  { id: 'flagged', label: t('Flagged', 'संदिग्ध') },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                    statusFilter === f.id
                      ? 'bg-white text-[#0B1B2B] shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-[#0B1B2B]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search medicine, salt, batch, supplier...', 'दवा, सॉल्ट, बैच या सप्लायर खोजें...')}
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
          />
        </div>
      </div>

      {/* Batches / Ledger / Catalogue / Reconciliation Views */}
      {viewTab === 'batches' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filteredBatches.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-[#0B1B2B]">No matching stock batches</p>
              <p className="text-xs text-slate-500 mt-1">
                Click &ldquo;Receive Stock Shipment&rdquo; to register incoming inventory into your
                ledger.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F8FAFC] text-xs font-semibold text-slate-500">
                    <th className="py-3 px-5">Product & Manufacturer</th>
                    <th className="py-3 px-4">Batch & Supplier</th>
                    <th className="py-3 px-4">Expiry</th>
                    <th className="py-3 px-4 text-right">Stock Qty</th>
                    <th className="py-3 px-4">Verification</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredBatches.map((batch) => {
                    const exp = computeExpiryStatus(batch.expiryDate, nearDays);
                    const isLow = batch.quantityOnHand <= batch.reorderThreshold;
                    return (
                      <tr key={batch.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-5">
                          <p className="text-sm font-semibold text-[#0B1B2B]">
                            {batch.medicineName}
                            {batch.strength ? ` · ${batch.strength}` : ''}
                          </p>
                          <p className="text-slate-500 mt-0.5">{batch.manufacturer}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-mono font-semibold text-[#0B1B2B]">
                            {batch.batchNumber}
                          </p>
                          <p className="text-slate-500 mt-0.5">
                            {batch.supplierName}
                            {batch.invoiceRef ? ` · ${batch.invoiceRef}` : ''}
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-mono text-[#0B1B2B] tabular-nums">{batch.expiryDate}</p>
                          <div className="mt-0.5">
                            <ExpiryStatusLabel status={exp} />
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          <p
                            className={`text-sm font-semibold ${
                              isLow ? 'text-amber-700' : 'text-[#0B1B2B]'
                            }`}
                          >
                            {batch.quantityOnHand}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Min {batch.reorderThreshold} · ₹{batch.unitPrice}
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          <VerificationStatusLabel status={batch.verificationStatus} compact />
                          {batch.recallFlagged && (
                            <p className="text-[11px] font-semibold text-rose-700 mt-0.5">
                              Quarantined / Recall Hold
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveBatch(batch);
                                setPhysicalCount(String(batch.quantityOnHand));
                                setMovementType('DISPENSE');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#0D7377] bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 cursor-pointer"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                              <span>Move / Reconcile</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleRecallFlag(batch)}
                              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border cursor-pointer ${
                                batch.recallFlagged
                                  ? 'text-slate-700 border-slate-300 hover:bg-slate-50'
                                  : 'text-rose-700 border-rose-200 bg-rose-50 hover:bg-rose-100'
                              }`}
                            >
                              {batch.recallFlagged ? 'Clear Hold' : 'Quarantine'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {viewTab === 'ledger' && (
        /* Immutable Stock Ledger View */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {data.ledger.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              No stock ledger transactions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F8FAFC] text-xs font-semibold text-slate-500">
                    <th className="py-3 px-5">Timestamp</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Medicine & Batch</th>
                    <th className="py-3 px-4 text-right">Delta</th>
                    <th className="py-3 px-4 text-right">Balance</th>
                    <th className="py-3 px-4">Reason & Ref</th>
                    <th className="py-3 px-5">Actor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {data.ledger.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-5 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                        {formatTimestamp(entry.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-[#0B1B2B]">
                        {entry.movementType}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-[#0B1B2B]">{entry.medicineName}</p>
                        <p className="font-mono text-[11px] text-slate-500">{entry.batchNumber}</p>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-semibold tabular-nums ${
                          entry.quantityDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {entry.quantityDelta >= 0 ? `+${entry.quantityDelta}` : entry.quantityDelta}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[#0B1B2B] tabular-nums">
                        {entry.resultingBalance}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <p>{entry.reason}</p>
                        {entry.invoiceRef && (
                          <p className="font-mono text-[11px] text-slate-400">{entry.invoiceRef}</p>
                        )}
                      </td>
                      <td className="py-3 px-5 text-slate-600 whitespace-nowrap">
                        {entry.actorName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Normalized Medicine Product Catalogue Tab */}
      {viewTab === 'catalogue' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#F8FAFC]">
            <div>
              <h3 className="font-display text-sm font-semibold text-[#0B1B2B]">
                {t(
                  'Normalized Medicine Reference Catalogue (India CDSCO/IP & Global)',
                  'नॉर्मलाइज़्ड दवा संदर्भ कैटलॉग (भारत CDSCO/IP एवं वैश्विक)'
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  'Trained reference catalogue used for product normalization, verification enrichment, and 1-click stock batch entry.',
                  'दवा पहचान, सत्यापन संवर्धन और एक-क्लिक स्टॉक बैच प्रविष्टि के लिए प्रशिक्षित संदर्भ कैटलॉग।'
                )}
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500">
              {filteredCatalogue.length} / {NORMALIZED_MEDICINE_CATALOGUE.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-slate-500 font-semibold">
                  <th className="py-3 px-5">{t('Brand & Generic Salt', 'ब्रांड और जेनेरिक सॉल्ट')}</th>
                  <th className="py-3 px-4">{t('Manufacturer & Region', 'निर्माता एवं क्षेत्र')}</th>
                  <th className="py-3 px-4">{t('Form & Schedule', 'रूप एवं शेड्यूल')}</th>
                  <th className="py-3 px-4 text-right">{t('Ref MRP', 'अनुमानित MRP')}</th>
                  <th className="py-3 px-5 text-right">{t('Action', 'क्रिया')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCatalogue.map((med) => (
                  <tr key={med.productId} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-5">
                      <p className="text-sm font-semibold text-[#0B1B2B]">
                        {med.brandName} · <span className="font-mono text-xs">{med.strength}</span>
                      </p>
                      <p className="text-slate-600 mt-0.5">{med.genericName}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{med.therapeuticClass}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-[#0B1B2B]">{med.manufacturer}</p>
                      <p className="font-mono text-[11px] text-[#0D7377] mt-0.5">{med.region}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="text-[#0B1B2B]">{med.dosageForm} · {med.packSize}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{med.scheduleClass}</p>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#0B1B2B] tabular-nums">
                      ₹{med.referencePriceInr}
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => prefillFromCatalogue(med)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#0D7377] bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('Receive Batch', 'बैच दर्ज करें')}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk Physical vs. Ledger Stock Reconciliation Tab */}
      {viewTab === 'reconcile' && (
        <form
          onSubmit={handleBulkReconcile}
          className="bg-white border border-slate-200 rounded-xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 bg-[#F8FAFC] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-[#0B1B2B]">
                {t('Physical vs. Ledger Stock Count Reconciliation', 'भौतिक बनाम लेजर स्टॉक मिलान')}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  'Enter physical shelf quantities below. Any variance automatically posts an immutable RECONCILIATION entry with audit trail.',
                  'नीचे शेल्फ की वास्तविक गिनती दर्ज करें। अंतर होने पर स्थायी लेजर में स्वचालित रूप से रिकॉन्सिलेशन प्रविष्टि जुड़ जाएगी।'
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                required
                maxLength={300}
                value={reconReason}
                onChange={(e) => setReconReason(e.target.value)}
                placeholder={t('Audit reason for reconciliation', 'मिलान का ऑडिट कारण')}
                className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377] w-64"
              />
              <button
                type="submit"
                disabled={reconciling || data.batches.length === 0}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1B2B] rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                {reconciling
                  ? t('Committing...', 'दर्ज हो रहा है...')
                  : t('Commit Reconciliation Entries', 'मिलान लेजर में दर्ज करें')}
              </button>
            </div>
          </div>

          {data.batches.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              {t('No inventory batches to reconcile yet.', 'मिलान के लिए कोई स्टॉक बैच उपलब्ध नहीं है।')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-slate-500 font-semibold">
                    <th className="py-3 px-5">{t('Medicine & Batch', 'दवा और बैच')}</th>
                    <th className="py-3 px-4">{t('Expiry', 'एक्सपायरी')}</th>
                    <th className="py-3 px-4 text-right">{t('Ledger Qty', 'लेजर मात्रा')}</th>
                    <th className="py-3 px-4 text-right">{t('Physical Count', 'भौतिक गिनती')}</th>
                    <th className="py-3 px-5 text-right">{t('Variance', 'अंतर')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.batches.map((b) => {
                    const rawVal = reconCounts[b.id];
                    const hasVal = rawVal !== undefined && rawVal !== '';
                    const parsed = hasVal ? Math.max(0, Math.round(Number(rawVal))) : b.quantityOnHand;
                    const variance = parsed - b.quantityOnHand;
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-5">
                          <p className="font-semibold text-[#0B1B2B]">{b.medicineName}</p>
                          <p className="font-mono text-[11px] text-slate-500">{b.batchNumber}</p>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 tabular-nums">
                          {b.expiryDate}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[#0B1B2B] tabular-nums">
                          {b.quantityOnHand}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            min={0}
                            max={1000000}
                            value={rawVal ?? ''}
                            onChange={(e) =>
                              setReconCounts((prev) => ({ ...prev, [b.id]: e.target.value }))
                            }
                            placeholder={String(b.quantityOnHand)}
                            className="w-24 px-2.5 py-1.5 text-right text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#0D7377]"
                          />
                        </td>
                        <td
                          className={`py-3 px-5 text-right font-mono font-semibold tabular-nums ${
                            !hasVal || variance === 0
                              ? 'text-slate-400'
                              : variance > 0
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                          }`}
                        >
                          {!hasVal || variance === 0
                            ? '0'
                            : variance > 0
                              ? `+${variance}`
                              : variance}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
