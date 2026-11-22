import type { VerificationStatus } from '../types';

export interface NormalizedMedicineRecord {
  productId: string;
  brandName: string;
  aliases: string[];
  genericName: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  region: 'India (CDSCO / IP)' | 'US / Global (FDA / USP)';
  scheduleClass: string;
  packSize: string;
  storageCondition: string;
  referencePriceInr: number;
  therapeuticClass: string;
  safetyHighlights: string;
}

export interface StarterBatchTemplate {
  medicineName: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  batchNumber: string;
  mfgDate: string;
  expiryDate: string;
  supplierName: string;
  invoiceRef: string;
  quantity: number;
  reorderThreshold: number;
  unitPrice: number;
  verificationStatus: VerificationStatus;
  distributorSource: string;
}

/**
 * Curated Normalized Medicine Reference Catalogue (Indian CDSCO/IP & Global essentials).
 * Used for:
 *  - Deterministic product/salt/manufacturer normalization & reference lookups
 *  - Pharmacist Product Catalogue browsing and quick batch prefill
 *  - Grounded medicine info fallback for Indian brands absent from US openFDA
 *
 * NOTE: Reference catalogue match confirms product metadata only — never physical pack serialization.
 */
export const NORMALIZED_MEDICINE_CATALOGUE: NormalizedMedicineRecord[] = [
  {
    productId: 'MT-IND-001',
    brandName: 'Dolo-650',
    aliases: ['Dolo 650', 'Dolo650', 'Paracetamol 650'],
    genericName: 'Paracetamol (Acetaminophen) IP',
    strength: '650 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Micro Labs Limited',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'OTC / Non-Scheduled',
    packSize: 'Strip of 15 Tablets',
    storageCondition: 'Store below 30°C in a dry place, protected from light.',
    referencePriceInr: 34,
    therapeuticClass: 'Analgesic & Antipyretic',
    safetyHighlights: 'Do not exceed 4g total paracetamol in 24 hours; avoid combining with other acetaminophen products.',
  },
  {
    productId: 'MT-IND-002',
    brandName: 'Augmentin 625 Duo',
    aliases: ['Augmentin 625', 'Amoxyclav 625', 'Co-Amoxiclav 625'],
    genericName: 'Amoxycillin 500 mg + Clavulanic Acid 125 mg',
    strength: '625 mg',
    dosageForm: 'Tablet',
    manufacturer: 'GlaxoSmithKline Pharmaceuticals Ltd',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Prescription Only)',
    packSize: 'Strip of 10 Tablets',
    storageCondition: 'Store below 25°C in original moisture-proof blister.',
    referencePriceInr: 223,
    therapeuticClass: 'Beta-lactam Antibiotic',
    safetyHighlights: 'Prescription antibiotic. Complete prescribed course; check penicillin allergy history.',
  },
  {
    productId: 'MT-IND-003',
    brandName: 'Azithral 500',
    aliases: ['Azithral', 'Azithromycin 500', 'Azee 500'],
    genericName: 'Azithromycin IP',
    strength: '500 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Alembic Pharmaceuticals Ltd',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Prescription Only)',
    packSize: 'Strip of 5 Tablets',
    storageCondition: 'Store below 30°C away from moisture.',
    referencePriceInr: 132,
    therapeuticClass: 'Macrolide Antibiotic',
    safetyHighlights: 'Prescription antibiotic. Confirm dosage schedule and cardiac/QT precautions with prescriber.',
  },
  {
    productId: 'MT-IND-004',
    brandName: 'Pan-D',
    aliases: ['Pan D', 'Pantoprazole Domperidone', 'Pantocid DSR'],
    genericName: 'Pantoprazole 40 mg + Domperidone 30 mg SR',
    strength: '40 mg / 30 mg',
    dosageForm: 'Capsule',
    manufacturer: 'Alkem Laboratories Ltd',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Prescription Only)',
    packSize: 'Strip of 15 Capsules',
    storageCondition: 'Store below 25°C, protected from light and moisture.',
    referencePriceInr: 199,
    therapeuticClass: 'Proton Pump Inhibitor + Prokinetic',
    safetyHighlights: 'Swallow whole before meals; do not crush sustained-release capsules.',
  },
  {
    productId: 'MT-IND-005',
    brandName: 'Telma 40',
    aliases: ['Telma', 'Telmisartan 40', 'Telmikind 40'],
    genericName: 'Telmisartan IP',
    strength: '40 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Glenmark Pharmaceuticals Ltd',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Prescription Only)',
    packSize: 'Strip of 15 Tablets',
    storageCondition: 'Store in moisture-resistant blister below 30°C.',
    referencePriceInr: 235,
    therapeuticClass: 'Antihypertensive (ARB)',
    safetyHighlights: 'Contraindicated in pregnancy. Monitor blood pressure and serum potassium as advised.',
  },
  {
    productId: 'MT-IND-006',
    brandName: 'Glycomet-GP 1',
    aliases: ['Glycomet GP1', 'Glimepiride Metformin'],
    genericName: 'Glimepiride 1 mg + Metformin 500 mg SR',
    strength: '1 mg / 500 mg',
    dosageForm: 'Tablet',
    manufacturer: 'USV Private Limited',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Prescription Only)',
    packSize: 'Strip of 15 Tablets',
    storageCondition: 'Store below 30°C in a dry place.',
    referencePriceInr: 148,
    therapeuticClass: 'Oral Antidiabetic',
    safetyHighlights: 'Monitor blood glucose regularly; watch for hypoglycemia symptoms if meals are skipped.',
  },
  {
    productId: 'MT-IND-007',
    brandName: 'Ecosprin 75',
    aliases: ['Ecosprin', 'Aspirin 75', 'Low Dose Aspirin'],
    genericName: 'Aspirin IP (Gastro-Resistant)',
    strength: '75 mg',
    dosageForm: 'Tablet',
    manufacturer: 'USV Private Limited',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H / Cardio-Prophylaxis',
    packSize: 'Strip of 14 Tablets',
    storageCondition: 'Store below 25°C, protected from moisture.',
    referencePriceInr: 6,
    therapeuticClass: 'Antiplatelet Agent',
    safetyHighlights: 'Gastro-resistant tablet; consult doctor if experiencing gastric bleeding or taking anticoagulants.',
  },
  {
    productId: 'MT-IND-008',
    brandName: 'Shelcal 500',
    aliases: ['Shelcal', 'Calcium Vitamin D3'],
    genericName: 'Elemental Calcium 500 mg + Vitamin D3 250 IU',
    strength: '500 mg / 250 IU',
    dosageForm: 'Tablet',
    manufacturer: 'Torrent Pharmaceuticals Ltd',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'OTC Supplement',
    packSize: 'Strip of 15 Tablets',
    storageCondition: 'Store below 30°C in a dry place.',
    referencePriceInr: 144,
    therapeuticClass: 'Mineral & Vitamin Supplement',
    safetyHighlights: 'Space at least 2 hours apart from thyroid or certain antibiotic medications.',
  },
  {
    productId: 'MT-IND-009',
    brandName: 'Allegra 120',
    aliases: ['Allegra', 'Fexofenadine 120'],
    genericName: 'Fexofenadine Hydrochloride IP',
    strength: '120 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Sanofi India Limited',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Antihistamine)',
    packSize: 'Strip of 10 Tablets',
    storageCondition: 'Store below 30°C.',
    referencePriceInr: 215,
    therapeuticClass: 'Non-Sedating Antihistamine',
    safetyHighlights: 'Avoid taking with fruit juices (grapefruit, orange, apple) as they reduce absorption.',
  },
  {
    productId: 'MT-IND-010',
    brandName: 'Montair LC',
    aliases: ['Montair-LC', 'Montelukast Levocetirizine'],
    genericName: 'Montelukast 10 mg + Levocetirizine 5 mg',
    strength: '10 mg / 5 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Cipla Limited',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Prescription Only)',
    packSize: 'Strip of 15 Tablets',
    storageCondition: 'Store below 30°C protected from light and moisture.',
    referencePriceInr: 312,
    therapeuticClass: 'Anti-Allergic & Leukotriene Antagonist',
    safetyHighlights: 'Typically taken in the evening; may cause mild drowsiness in some individuals.',
  },
  {
    productId: 'MT-IND-011',
    brandName: 'Crocin Advance',
    aliases: ['Crocin', 'Crocin 500', 'Paracetamol 500'],
    genericName: 'Paracetamol IP (Optizorb)',
    strength: '500 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Haleon (GlaxoSmithKline Consumer Healthcare)',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'OTC / Non-Scheduled',
    packSize: 'Strip of 20 Tablets',
    storageCondition: 'Store below 30°C.',
    referencePriceInr: 22,
    therapeuticClass: 'Analgesic & Antipyretic',
    safetyHighlights: 'Do not exceed recommended daily dose; check liver precautions.',
  },
  {
    productId: 'MT-IND-012',
    brandName: 'Calpol 500',
    aliases: ['Calpol', 'Calpol 650', 'Calpol Paediatric'],
    genericName: 'Paracetamol IP',
    strength: '500 mg',
    dosageForm: 'Tablet',
    manufacturer: 'GlaxoSmithKline Pharmaceuticals Ltd',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'OTC / Non-Scheduled',
    packSize: 'Strip of 15 Tablets',
    storageCondition: 'Store below 30°C away from direct sunlight.',
    referencePriceInr: 17,
    therapeuticClass: 'Analgesic & Antipyretic',
    safetyHighlights: 'Confirm exact pediatric vs adult formulation strength before dosing.',
  },
  {
    productId: 'MT-IND-013',
    brandName: 'Thyronorm 50',
    aliases: ['Thyronorm', 'Levothyroxine 50', 'Eltroxin 50'],
    genericName: 'Levothyroxine Sodium IP',
    strength: '50 mcg',
    dosageForm: 'Tablet',
    manufacturer: 'Abbott India Limited',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Prescription Only)',
    packSize: 'Bottle of 120 Tablets',
    storageCondition: 'Store below 25°C, tightly capped against humidity.',
    referencePriceInr: 185,
    therapeuticClass: 'Thyroid Hormone Replacement',
    safetyHighlights: 'Narrow therapeutic index; verify exact mcg strength and take on an empty stomach.',
  },
  {
    productId: 'MT-IND-014',
    brandName: 'Atorva 10',
    aliases: ['Atorva', 'Atorvastatin 10', 'Lipitor 10'],
    genericName: 'Atorvastatin Calcium IP',
    strength: '10 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Zydus Lifesciences Ltd',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Prescription Only)',
    packSize: 'Strip of 15 Tablets',
    storageCondition: 'Store below 30°C in a dry place.',
    referencePriceInr: 98,
    therapeuticClass: 'Lipid-Lowering Statin',
    safetyHighlights: 'Report unexplained muscle pain or weakness to your physician.',
  },
  {
    productId: 'MT-IND-015',
    brandName: 'Omez 20',
    aliases: ['Omez', 'Omeprazole 20'],
    genericName: 'Omeprazole IP',
    strength: '20 mg',
    dosageForm: 'Capsule',
    manufacturer: "Dr. Reddy's Laboratories Ltd",
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Prescription Only)',
    packSize: 'Strip of 20 Capsules',
    storageCondition: 'Store below 25°C away from moisture.',
    referencePriceInr: 62,
    therapeuticClass: 'Proton Pump Inhibitor',
    safetyHighlights: 'Take before breakfast; prolonged unsupervised use requires medical review.',
  },
  {
    productId: 'MT-IND-016',
    brandName: 'Combiflam',
    aliases: ['Ibuprofen Paracetamol'],
    genericName: 'Ibuprofen 400 mg + Paracetamol 325 mg',
    strength: '400 mg / 325 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Sanofi India Limited',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H',
    packSize: 'Strip of 20 Tablets',
    storageCondition: 'Store below 30°C.',
    referencePriceInr: 46,
    therapeuticClass: 'NSAID + Analgesic Combination',
    safetyHighlights: 'Take with food; avoid in active peptic ulcer, severe kidney disease, or NSAID allergy.',
  },
  {
    productId: 'MT-IND-017',
    brandName: 'Limcee 500',
    aliases: ['Limcee', 'Vitamin C 500'],
    genericName: 'Ascorbic Acid + Sodium Ascorbate (Vitamin C)',
    strength: '500 mg',
    dosageForm: 'Chewable Tablet',
    manufacturer: 'Abbott Healthcare Pvt Ltd',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'OTC Supplement',
    packSize: 'Strip of 15 Chewable Tablets',
    storageCondition: 'Store below 25°C, protected from light.',
    referencePriceInr: 25,
    therapeuticClass: 'Vitamin Supplement',
    safetyHighlights: 'Chewable oral supplement; check oxalate kidney stone precautions if taking high doses.',
  },
  {
    productId: 'MT-IND-018',
    brandName: 'Zincovit',
    aliases: ['Zincovit Tablet', 'Multivitamin Zinc'],
    genericName: 'Multivitamins + Minerals + Grape Seed Extract',
    strength: 'Standard Adult Formula',
    dosageForm: 'Tablet',
    manufacturer: 'Apex Laboratories Pvt Ltd',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'OTC Nutraceutical',
    packSize: 'Strip of 15 Tablets',
    storageCondition: 'Store in a cool, dry place below 25°C.',
    referencePriceInr: 110,
    therapeuticClass: 'Nutritional Supplement',
    safetyHighlights: 'Inspect holographic strip print and seal integrity; do not exceed 1 tablet daily unless advised.',
  },
  {
    productId: 'MT-IND-019',
    brandName: 'Amlokind 5',
    aliases: ['Amlodipine 5', 'Stamlo 5', 'Amlong 5'],
    genericName: 'Amlodipine Besylate IP',
    strength: '5 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Mankind Pharma Ltd',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Prescription Only)',
    packSize: 'Strip of 10 Tablets',
    storageCondition: 'Store below 30°C.',
    referencePriceInr: 15,
    therapeuticClass: 'Calcium Channel Blocker',
    safetyHighlights: 'Do not abruptly discontinue blood pressure medication without physician guidance.',
  },
  {
    productId: 'MT-IND-020',
    brandName: 'Metpure-XL 50',
    aliases: ['Metoprolol 50', 'Betaloc 50', 'Seloken XL 50'],
    genericName: 'Metoprolol Succinate Extended Release IP',
    strength: '50 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Emcure Pharmaceuticals Ltd',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Prescription Only)',
    packSize: 'Strip of 20 Tablets',
    storageCondition: 'Store below 30°C.',
    referencePriceInr: 142,
    therapeuticClass: 'Beta-Blocker',
    safetyHighlights: 'Extended-release tablet; do not stop suddenly due to rebound cardiac risk.',
  },
  {
    productId: 'MT-IND-021',
    brandName: 'Okacet',
    aliases: ['Cetirizine 10', 'Cetzine', 'Zyrtec'],
    genericName: 'Cetirizine Hydrochloride IP',
    strength: '10 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Cipla Limited',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H / Antihistamine',
    packSize: 'Strip of 10 Tablets',
    storageCondition: 'Store below 30°C.',
    referencePriceInr: 21,
    therapeuticClass: 'Antihistamine',
    safetyHighlights: 'May cause mild sedation; use caution when driving or operating machinery.',
  },
  {
    productId: 'MT-IND-022',
    brandName: 'Becosules',
    aliases: ['Becosules Z', 'Vitamin B Complex'],
    genericName: 'Vitamin B-Complex Forte with Vitamin C',
    strength: 'Standard Formula',
    dosageForm: 'Capsule',
    manufacturer: 'Pfizer Limited',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'OTC Supplement',
    packSize: 'Strip of 20 Capsules',
    storageCondition: 'Store below 25°C in a dry place.',
    referencePriceInr: 54,
    therapeuticClass: 'Vitamin B-Complex Supplement',
    safetyHighlights: 'Harmless bright yellow urine coloration from riboflavin (Vitamin B2) is normal.',
  },
  {
    productId: 'MT-IND-023',
    brandName: 'Electral ORS',
    aliases: ['Electral', 'ORS Powder', 'WHO ORS'],
    genericName: 'WHO Formula Oral Rehydration Salts IP',
    strength: '21.8 g Sachet',
    dosageForm: 'Oral Powder',
    manufacturer: 'FDC Limited',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'OTC Essential Medicine',
    packSize: '21.8 g Sachet (for 1 Litre)',
    storageCondition: 'Store in a cool, dry place; use prepared solution within 24 hours.',
    referencePriceInr: 23,
    therapeuticClass: 'Electrolyte Replenisher',
    safetyHighlights: 'Dissolve entire 21.8 g sachet in 1 litre of clean drinking water; do not boil after mixing.',
  },
  {
    productId: 'MT-IND-024',
    brandName: 'Asthalin Inhaler',
    aliases: ['Asthalin', 'Salbutamol Inhaler', 'Albuterol Inhaler'],
    genericName: 'Salbutamol Sulphate IP',
    strength: '100 mcg / actuation',
    dosageForm: 'Pressurized Inhalation (MDI)',
    manufacturer: 'Cipla Limited',
    region: 'India (CDSCO / IP)',
    scheduleClass: 'Schedule H (Prescription Only)',
    packSize: '200 Metered Doses Canister',
    storageCondition: 'Store below 30°C; do not puncture or expose pressurized canister to heat.',
    referencePriceInr: 168,
    therapeuticClass: 'Short-Acting Bronchodilator',
    safetyHighlights: 'Check actuation counter and expiry date carefully; rescue inhaler for acute bronchospasm.',
  },
  {
    productId: 'MT-GLB-025',
    brandName: 'Tylenol Extra Strength',
    aliases: ['Tylenol', 'Acetaminophen 500'],
    genericName: 'Acetaminophen USP',
    strength: '500 mg',
    dosageForm: 'Caplet',
    manufacturer: 'Kenvue (McNeil Consumer Healthcare)',
    region: 'US / Global (FDA / USP)',
    scheduleClass: 'OTC Monograph',
    packSize: 'Bottle of 24 Caplets',
    storageCondition: 'Store between 20–25°C.',
    referencePriceInr: 390,
    therapeuticClass: 'Analgesic & Antipyretic',
    safetyHighlights: 'Severe liver damage warning if exceeding 4,000 mg in 24 hours or combining with heavy alcohol.',
  },
  {
    productId: 'MT-GLB-026',
    brandName: 'Advil 200',
    aliases: ['Advil', 'Ibuprofen 200', 'Brufen'],
    genericName: 'Ibuprofen USP',
    strength: '200 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Haleon US Holdings LLC',
    region: 'US / Global (FDA / USP)',
    scheduleClass: 'OTC Monograph',
    packSize: 'Bottle of 50 Tablets',
    storageCondition: 'Store at 20–25°C.',
    referencePriceInr: 420,
    therapeuticClass: 'NSAID Analgesic',
    safetyHighlights: 'NSAID stomach bleeding and cardiovascular risk warning; use lowest effective dose.',
  },
  {
    productId: 'MT-GLB-027',
    brandName: 'Glucophage 500',
    aliases: ['Metformin 500', 'Glycomet 500'],
    genericName: 'Metformin Hydrochloride',
    strength: '500 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Merck Healthcare / Licensed Generic',
    region: 'US / Global (FDA / USP)',
    scheduleClass: 'Prescription Only',
    packSize: 'Strip of 20 Tablets',
    storageCondition: 'Store below 30°C.',
    referencePriceInr: 38,
    therapeuticClass: 'Biguanide Antidiabetic',
    safetyHighlights: 'Take with meals to minimize GI discomfort; periodic renal function monitoring advised.',
  },
  {
    productId: 'MT-GLB-028',
    brandName: 'Lipitor 20',
    aliases: ['Atorvastatin 20', 'Atorva 20'],
    genericName: 'Atorvastatin Calcium',
    strength: '20 mg',
    dosageForm: 'Tablet',
    manufacturer: 'Viatris / Pfizer',
    region: 'US / Global (FDA / USP)',
    scheduleClass: 'Prescription Only',
    packSize: 'Pack of 30 Tablets',
    storageCondition: 'Store at 20–25°C.',
    referencePriceInr: 280,
    therapeuticClass: 'Statin (HMG-CoA Reductase Inhibitor)',
    safetyHighlights: 'Check tamper-evident seal and lot matching carefully; high-demand chronic therapy.',
  },
];

/**
 * Helper to generate realistic future/near-expiry dates relative to today
 * so the Pharmacist Starter Stock Dataset always stays accurate regardless of system clock.
 */
function offsetIsoDate(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

/**
 * Trained Starter Stock Dataset for Pharmacist First-Stock Onboarding.
 * Includes healthy stock, near-expiry watchlist batches, low-stock reorder batches,
 * and one batch needing pharmacist verification review so every operational dashboard widget works immediately.
 */
export function buildStarterPharmacyStockBatches(): StarterBatchTemplate[] {
  return [
    {
      medicineName: 'Dolo-650',
      genericName: 'Paracetamol (Acetaminophen) IP',
      strength: '650 mg',
      dosageForm: 'Tablet',
      manufacturer: 'Micro Labs Limited',
      batchNumber: 'DL650-26A14',
      mfgDate: offsetIsoDate(-120),
      expiryDate: offsetIsoDate(480),
      supplierName: 'MedLine Authorized Distributors Pvt Ltd',
      invoiceRef: 'INV-ML-2026-0841',
      quantity: 240,
      reorderThreshold: 50,
      unitPrice: 34,
      verificationStatus: 'verified_match',
      distributorSource: 'Micro Labs Central Depot -> MedLine Distributors',
    },
    {
      medicineName: 'Augmentin 625 Duo',
      genericName: 'Amoxycillin 500 mg + Clavulanic Acid 125 mg',
      strength: '625 mg',
      dosageForm: 'Tablet',
      manufacturer: 'GlaxoSmithKline Pharmaceuticals Ltd',
      batchNumber: 'AUG625-26K09',
      mfgDate: offsetIsoDate(-95),
      expiryDate: offsetIsoDate(390),
      supplierName: 'Apollo Wholesale Pharma Supply',
      invoiceRef: 'INV-AP-2026-1192',
      quantity: 95,
      reorderThreshold: 30,
      unitPrice: 223,
      verificationStatus: 'verified_match',
      distributorSource: 'GSK Nashik Plant -> Apollo Wholesale Supply',
    },
    {
      medicineName: 'Pan-D',
      genericName: 'Pantoprazole 40 mg + Domperidone 30 mg SR',
      strength: '40 mg / 30 mg',
      dosageForm: 'Capsule',
      manufacturer: 'Alkem Laboratories Ltd',
      batchNumber: 'PAND-25N31',
      mfgDate: offsetIsoDate(-310),
      expiryDate: offsetIsoDate(42), // Near expiry (within 90d window)
      supplierName: 'MedLine Authorized Distributors Pvt Ltd',
      invoiceRef: 'INV-ML-2026-0318',
      quantity: 64,
      reorderThreshold: 25,
      unitPrice: 199,
      verificationStatus: 'verified_match',
      distributorSource: 'Alkem Baddi Unit -> MedLine Distributors',
    },
    {
      medicineName: 'Azithral 500',
      genericName: 'Azithromycin IP',
      strength: '500 mg',
      dosageForm: 'Tablet',
      manufacturer: 'Alembic Pharmaceuticals Ltd',
      batchNumber: 'AZT500-26C07',
      mfgDate: offsetIsoDate(-60),
      expiryDate: offsetIsoDate(540),
      supplierName: 'Keimed Regional Stockist',
      invoiceRef: 'INV-KM-2026-4402',
      quantity: 18, // Low stock (<= reorderThreshold 30)
      reorderThreshold: 30,
      unitPrice: 132,
      verificationStatus: 'verified_match',
      distributorSource: 'Alembic Panelav Facility -> Keimed Regional Stockist',
    },
    {
      medicineName: 'Telma 40',
      genericName: 'Telmisartan IP',
      strength: '40 mg',
      dosageForm: 'Tablet',
      manufacturer: 'Glenmark Pharmaceuticals Ltd',
      batchNumber: 'TLM40-26B22',
      mfgDate: offsetIsoDate(-140),
      expiryDate: offsetIsoDate(420),
      supplierName: 'Apollo Wholesale Pharma Supply',
      invoiceRef: 'INV-AP-2026-1204',
      quantity: 130,
      reorderThreshold: 35,
      unitPrice: 235,
      verificationStatus: 'verified_match',
      distributorSource: 'Glenmark Goa Plant -> Apollo Wholesale Supply',
    },
    {
      medicineName: 'Glycomet-GP 1',
      genericName: 'Glimepiride 1 mg + Metformin 500 mg SR',
      strength: '1 mg / 500 mg',
      dosageForm: 'Tablet',
      manufacturer: 'USV Private Limited',
      batchNumber: 'GGP1-25M18',
      mfgDate: offsetIsoDate(-290),
      expiryDate: offsetIsoDate(58), // Near expiry
      supplierName: 'Keimed Regional Stockist',
      invoiceRef: 'INV-KM-2026-3911',
      quantity: 44,
      reorderThreshold: 25,
      unitPrice: 148,
      verificationStatus: 'needs_review',
      distributorSource: 'USV Daman Unit -> Keimed Regional Stockist',
    },
    {
      medicineName: 'Montair LC',
      genericName: 'Montelukast 10 mg + Levocetirizine 5 mg',
      strength: '10 mg / 5 mg',
      dosageForm: 'Tablet',
      manufacturer: 'Cipla Limited',
      batchNumber: 'MLC-26D05',
      mfgDate: offsetIsoDate(-85),
      expiryDate: offsetIsoDate(610),
      supplierName: 'Cipla Authorized CFA Hub',
      invoiceRef: 'INV-CP-2026-7730',
      quantity: 112,
      reorderThreshold: 30,
      unitPrice: 312,
      verificationStatus: 'verified_match',
      distributorSource: 'Cipla Goa Hub -> Authorized CFA Hub',
    },
    {
      medicineName: 'Shelcal 500',
      genericName: 'Elemental Calcium 500 mg + Vitamin D3 250 IU',
      strength: '500 mg / 250 IU',
      dosageForm: 'Tablet',
      manufacturer: 'Torrent Pharmaceuticals Ltd',
      batchNumber: 'SHC500-26E19',
      mfgDate: offsetIsoDate(-50),
      expiryDate: offsetIsoDate(510),
      supplierName: 'MedLine Authorized Distributors Pvt Ltd',
      invoiceRef: 'INV-ML-2026-0912',
      quantity: 14, // Low stock
      reorderThreshold: 20,
      unitPrice: 144,
      verificationStatus: 'verified_match',
      distributorSource: 'Torrent Indrad Plant -> MedLine Distributors',
    },
  ];
}

/**
 * Search Normalized Medicine Catalogue by brand, alias, or generic name.
 */
export function findMedicineInCatalogue(
  medicineName: string,
  genericName = ''
): NormalizedMedicineRecord | null {
  const q1 = medicineName.trim().toLowerCase();
  const q2 = genericName.trim().toLowerCase();
  if (!q1 && !q2) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const n1 = normalize(q1);
  const n2 = normalize(q2);

  // 1. Exact brand or alias match
  for (const item of NORMALIZED_MEDICINE_CATALOGUE) {
    const brandN = normalize(item.brandName);
    if (n1 && (brandN === n1 || item.aliases.some((a) => normalize(a) === n1))) {
      return item;
    }
  }

  // 2. Partial brand / alias / generic containment
  for (const item of NORMALIZED_MEDICINE_CATALOGUE) {
    const brandN = normalize(item.brandName);
    const genN = normalize(item.genericName);
    if (
      n1 &&
      n1.length >= 4 &&
      (brandN.includes(n1) ||
        n1.includes(brandN) ||
        item.aliases.some((a) => {
          const an = normalize(a);
          return an.length >= 4 && (an.includes(n1) || n1.includes(an));
        }))
    ) {
      return item;
    }
    if (n2 && n2.length >= 5 && (genN.includes(n2) || n2.includes(genN.slice(0, 10)))) {
      return item;
    }
  }

  return null;
}

export const STARTER_BATCH_CSV_TEMPLATE = [
  'medicineName,genericName,strength,dosageForm,manufacturer,batchNumber,mfgDate,expiryDate,supplierName,invoiceRef,quantity,reorderThreshold,unitPrice',
  'Crocin Advance,Paracetamol IP,500 mg,Tablet,Haleon India,CRC-2026-881,2026-04-01,2028-04-30,MedLine Distributors,INV-CUSTOM-101,150,30,22',
  'Ecosprin 75,Aspirin IP,75 mg,Tablet,USV Private Limited,ECO-2026-442,2026-05-01,2028-05-31,Apollo Wholesale Supply,INV-CUSTOM-102,200,40,6',
].join('\n');

export interface ParsedUploadedBatch {
  medicineName: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  batchNumber: string;
  mfgDate: string;
  expiryDate: string;
  supplierName: string;
  invoiceRef: string;
  quantity: number;
  reorderThreshold: number;
  unitPrice: number;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses a user-uploaded CSV or JSON file containing one or more pharmacy stock batches.
 * Auto-enriches missing generic/manufacturer/price metadata from the Normalized Medicine Catalogue when possible.
 */
export function parseBatchUploadFile(
  rawText: string,
  fileName: string
): { batches: ParsedUploadedBatch[]; warnings: string[] } {
  const warnings: string[] = [];
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { batches: [], warnings: ['Uploaded file is empty.'] };
  }

  let rows: Array<Record<string, unknown>> = [];

  if (fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.batches) ? parsed.batches : [parsed];
    } catch {
      return { batches: [], warnings: ['Invalid JSON file format.'] };
    }
  } else {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return {
        batches: [],
        warnings: ['CSV must contain a header row and at least one batch row.'],
      };
    }
    const headers = splitCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim());
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const obj: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        obj[h] = cols[idx] ?? '';
      });
      rows.push(obj);
    }
  }

  const pick = (row: Record<string, unknown>, keys: string[]): string => {
    for (const k of keys) {
      for (const [rk, rv] of Object.entries(row)) {
        if (rk.toLowerCase().replace(/[^a-z0-9]/g, '') === k.toLowerCase().replace(/[^a-z0-9]/g, '')) {
          const val = String(rv ?? '').trim();
          if (val) return val;
        }
      }
    }
    return '';
  };

  const batches: ParsedUploadedBatch[] = [];

  rows.slice(0, 100).forEach((row, idx) => {
    const medicineName = pick(row, ['medicineName', 'medicine', 'productName', 'brandName', 'name']);
    const batchNumber = pick(row, ['batchNumber', 'batchNo', 'batch', 'lotNumber', 'lot']);
    const expiryDate = pick(row, ['expiryDate', 'expiry', 'expDate', 'exp']);

    if (!medicineName || !batchNumber || !expiryDate) {
      warnings.push(
        `Row ${idx + 1} skipped: medicineName, batchNumber, and expiryDate are required.`
      );
      return;
    }

    const cat = findMedicineInCatalogue(medicineName);
    const qtyRaw = Number(pick(row, ['quantity', 'qty', 'quantityOnHand', 'stock']) || 50);
    const reorderRaw = Number(pick(row, ['reorderThreshold', 'reorder', 'minStock']) || 20);
    const priceRaw = Number(
      pick(row, ['unitPrice', 'price', 'mrp', 'rate']) || cat?.referencePriceInr || 50
    );

    batches.push({
      medicineName,
      genericName: pick(row, ['genericName', 'generic', 'salt', 'composition']) || cat?.genericName || '',
      strength: pick(row, ['strength', 'dose']) || cat?.strength || '',
      dosageForm: pick(row, ['dosageForm', 'form', 'type']) || cat?.dosageForm || 'Tablet',
      manufacturer: pick(row, ['manufacturer', 'mfg', 'company']) || cat?.manufacturer || 'Custom Manufacturer',
      batchNumber,
      mfgDate: pick(row, ['mfgDate', 'manufacturingDate', 'mfg']) || '',
      expiryDate,
      supplierName: pick(row, ['supplierName', 'supplier', 'distributor', 'vendor']) || 'Direct Upload Supplier',
      invoiceRef: pick(row, ['invoiceRef', 'invoice', 'invoiceNo', 'billNo']) || `UPL-${Date.now().toString().slice(-5)}`,
      quantity: Number.isFinite(qtyRaw) ? Math.max(0, Math.round(qtyRaw)) : 50,
      reorderThreshold: Number.isFinite(reorderRaw) ? Math.max(0, Math.round(reorderRaw)) : 20,
      unitPrice: Number.isFinite(priceRaw) ? Math.max(0, priceRaw) : 50,
    });
  });

  return { batches, warnings };
}
