import { motion } from 'motion/react';
import {
  ArrowRight,
  Building2,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  GitBranch,
  Languages,
  Package,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  AlertTriangle,
  SearchX,
  WifiOff,
  Quote,
} from 'lucide-react';
import { MediTrustLogo } from '../components/MediTrustLogo';
import { MEDIA_ASSETS, SafeImage } from '../components/EditorialMedia';
import { LanguageSwitch, useLanguage } from '../context/LanguageContext';
import { CLINICAL_QUOTES } from '../lib/i18n';
import type { PortalRole } from '../types';

interface LandingPageProps {
  onNavigateLogin: (role: PortalRole) => void;
  onEnterWorkspace?: () => void;
  signedInRole?: PortalRole | null;
}

export function LandingPage({
  onNavigateLogin,
  onEnterWorkspace,
  signedInRole,
}: LandingPageProps) {
  const { isHindi, t } = useLanguage();

  const capabilities = [
    {
      index: '01',
      title: t('AI Medicine Scanner & OCR', 'एआई दवा स्कैनर और ओसीआर'),
      detail: t(
        'Capture cartons, blister strips, bottles, or labels via camera or file upload. Multimodal vision extracts brand name, active salt, strength, batch number, manufacturing date, and expiry with per-field confidence and mandatory human correction.',
        'कैमरा या फोटो अपलोड के ज़रिये दवा के डिब्बे, स्ट्रिप, बोतल या लेबल को स्कैन करें। मल्टीमॉडल विज़न ब्रांड का नाम, साल्ट, मात्रा, बैच नंबर, निर्माण और एक्सपायरी तिथि निकालता है—जिसे आप जांच से पहले स्वयं सुधार सकते हैं।'
      ),
      icon: Camera,
      image: MEDIA_ASSETS.packScanner,
      imageAlt: 'Scanning a medicine carton and blister pack on a stone counter',
      span: 'lg:col-span-2',
    },
    {
      index: '02',
      title: t('Evidence-Based Verification', 'प्रमाण-आधारित प्रामाणिकता जाँच'),
      detail: t(
        'Checks identifiers against live openFDA drug labels, official recall notices, and authorized pharmacy batch records—recording source name, timestamp, and coverage limits.',
        'दवा के विवरण को लाइव openFDA ड्रग लेबल, आधिकारिक रिकॉल नोटिस और अधिकृत फार्मेसी बैच रिकॉर्ड से मिलान करता है—स्रोत का नाम, समय और सीमाओं के साथ।'
      ),
      icon: ShieldCheck,
      span: 'lg:col-span-1',
    },
    {
      index: '03',
      title: t('Prescription Tracking Dashboard', 'पर्चा एवं खुराक ट्रैकिंग डैशबोर्ड'),
      detail: t(
        'Track active prescriptions, dosage schedules, prescriber records, and daily dose logs, with automated extraction from uploaded prescriptions.',
        'सक्रिय पर्चे, खुराक का समय, डॉक्टर का विवरण और दैनिक डोज़ लॉग ट्रैक करें—अपलोड किए गए पर्चे से स्वचालित जानकारी निकालने की सुविधा के साथ।'
      ),
      icon: ClipboardList,
      span: 'lg:col-span-1',
    },
    {
      index: '04',
      title: t('Secure Document Verification', 'सुरक्षित दस्तावेज़ सत्यापन'),
      detail: t(
        'Upload prescriptions, supplier invoices, leaflets, or Certificates of Analysis for SHA-256 cryptographic fingerprinting, structured OCR parsing, and anomaly triage.',
        'पर्चे, सप्लायर इनवॉइस, लीफलेट या गुणवत्ता प्रमाणपत्र (CoA) अपलोड करें—SHA-256 क्रिप्टोग्राफिक फिंगरप्रिंटिंग, ओसीआर विश्लेषण और विसंगति पहचान के लिए।'
      ),
      icon: FileCheck2,
      span: 'lg:col-span-2',
    },
    {
      index: '05',
      title: t('Pharmacy Inventory & Traceability', 'फार्मेसी इन्वेंट्री और बैच ट्रेसेबिलिटी'),
      detail: t(
        'Batch-level stock derived from an append-only receipt, dispense, return, adjustment, and reconciliation ledger with near-expiry alerts and chain-of-custody gap detection.',
        'अपरिवर्तनीय रसीद, वितरण, वापसी और स्टॉक मिलान लेजर से संचालित बैच-स्तरीय इन्वेंट्री—नज़दीकी एक्सपायरी अलर्ट और सप्लाई चेन गैप पहचान के साथ।'
      ),
      icon: Package,
      image: MEDIA_ASSETS.pharmacyDispensary,
      imageAlt: 'Licensed clinical pharmacist reviewing batch stock in a modern pharmacy dispensary',
      span: 'lg:col-span-2',
    },
    {
      index: '06',
      title: t('Hindi, English & Hinglish AI Assistant', 'हिन्दी, अंग्रेज़ी और हिंग्लिश एआई सहायक'),
      detail: t(
        'Ask follow-up questions grounded strictly in your saved scans, documents, or uploaded files—separating verified facts from general education.',
        'अपने सेव किए गए स्कैन, दस्तावेज़ों या अपलोड फाइलों के आधार पर हिन्दी, अंग्रेज़ी या हिंग्लिश में सवाल पूछें—सत्यापित तथ्यों और सामान्य मार्गदर्शन के स्पष्ट अंतर के साथ।'
      ),
      icon: Languages,
      span: 'lg:col-span-1',
    },
  ];

  const pipelineSteps = [
    {
      step: '01',
      name: t('Intake', 'अपलोड जाँच'),
      text: t(
        'Authenticated upload with MIME and size validation.',
        'सुरक्षित फ़ाइल प्रकार और आकार सत्यापन के साथ अपलोड।'
      ),
    },
    {
      step: '02',
      name: t('Extraction', 'ओसीआर पठन'),
      text: t(
        'Multimodal OCR reads brand, batch, dates, and codes.',
        'मल्टीमॉडल एआई ब्रांड, बैच, तारीख़ और कोड पढ़ता है।'
      ),
    },
    {
      step: '03',
      name: t('Confirmation', 'मानवीय पुष्टि'),
      text: t(
        'User reviews and edits uncertain fields before checking.',
        'जाँच से पहले उपयोगकर्ता संदिग्ध विवरण की पुष्टि व सुधार करता है।'
      ),
    },
    {
      step: '04',
      name: t('Verification', 'स्रोत सत्यापन'),
      text: t(
        'Deterministic expiry rules, openFDA API, and batch ledger check.',
        'एक्सपायरी नियम, openFDA एपीआई और बैच लेजर से मिलान।'
      ),
    },
    {
      step: '05',
      name: t('Grounded AI', 'स्पष्ट मार्गदर्शन'),
      text: t(
        'Plain Hindi/English explanation citing exact sources.',
        'सटीक स्रोत सहित सरल हिन्दी और अंग्रेज़ी में व्याख्या।'
      ),
    },
    {
      step: '06',
      name: t('Audit & Alerts', 'ऑडिट एवं अलर्ट'),
      text: t(
        'Append-only audit trail and expiry or recall notifications.',
        'स्थायी ऑडिट रिकॉर्ड तथा एक्सपायरी व रिकॉल सूचनाएँ।'
      ),
    },
  ];

  const verificationStates = [
    {
      label: t('Verified Source Match', 'सत्यापित स्रोत मिलान'),
      meaning: t(
        'Exact batch and identifier matched against a connected authoritative record.',
        'बैच और पहचान विवरण आधिकारिक जुड़े हुए रिकॉर्ड से पूरी तरह मेल खाते हैं।'
      ),
      color: 'text-emerald-800',
      icon: CheckCircle2,
    },
    {
      label: t('Mismatch / Suspicious', 'विसंगति / संदिग्ध'),
      meaning: t(
        'Conflicting expiry, manufacturer, or active recall notice requires immediate escalation.',
        'एक्सपायरी, निर्माता में विरोधाभास या सक्रिय रिकॉल नोटिस—तुरंत समीक्षा आवश्यक।'
      ),
      color: 'text-rose-800',
      icon: ShieldAlert,
    },
    {
      label: t('Needs Manual Review', 'मैनुअल समीक्षा आवश्यक'),
      meaning: t(
        'Product reference found or OCR confidence is low; pack-level confirmation needed.',
        'उत्पाद संदर्भ मिला या ओसीआर स्पष्टता कम है; पैक स्तर पर पुष्टि आवश्यक।'
      ),
      color: 'text-amber-800',
      icon: AlertTriangle,
    },
    {
      label: t('Not Found in Source', 'स्रोत में उपलब्ध नहीं'),
      meaning: t(
        'Identifier was not returned by currently connected reference registries.',
        'वर्तमान में जुड़ी आधिकारिक रजिस्ट्रियों में यह पहचान विवरण नहीं मिला।'
      ),
      color: 'text-slate-700',
      icon: SearchX,
    },
    {
      label: t('Provider Unavailable', 'स्रोत सेवा अनुपलब्ध'),
      meaning: t(
        'External source timed out; reported transparently without inventing a result.',
        'बाहरी स्रोत अस्थायी रूप से अनुपलब्ध; बिना किसी अनुमान के पारदर्शी रिपोर्ट।'
      ),
      color: 'text-indigo-800',
      icon: WifiOff,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0B1B2B]">
      {/* Top Bar Contract: 3 clean zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="focus-visible:outline-none">
            <MediTrustLogo size="md" variant="dark" />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a
              href="#capabilities"
              className="hover:text-[#0B1B2B] transition-colors whitespace-nowrap shrink-0"
            >
              {t('Capabilities', 'सुविधाएँ')}
            </a>
            <a
              href="#workflow"
              className="hover:text-[#0B1B2B] transition-colors whitespace-nowrap shrink-0"
            >
              {t('Workflow', 'कार्यप्रणाली')}
            </a>
            <a
              href="#portals"
              className="hover:text-[#0B1B2B] transition-colors whitespace-nowrap shrink-0"
            >
              {t('Portals', 'पोर्टल')}
            </a>
            <a
              href="#principles"
              className="hover:text-[#0B1B2B] transition-colors whitespace-nowrap shrink-0"
            >
              {t('Principles', 'सिद्धांत')}
            </a>
          </nav>

          <div className="shrink-0">
            {signedInRole && onEnterWorkspace ? (
              <button
                type="button"
                onClick={onEnterWorkspace}
                className="px-4 py-2 text-sm font-medium text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t('Open Workspace', 'कार्यक्षेत्र खोलें')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigateLogin('patient')}
                className="px-4 py-2 text-sm font-medium text-white bg-[#0B1B2B] rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t('Sign In', 'लॉग इन')}
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Section with Editorial Photography, Authentic Quote & Prominent Hindi Switch */}
        <section className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 flex flex-col justify-center"
            >
              {/* Prominent Introduction Language Switch + Clinical Kicker */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <p className="text-xs font-semibold text-[#0D7377] tracking-wide">
                  {t(
                    'Counterfeit Medicine Detection · Evidence-Based Safety',
                    'नकली दवा पहचान · प्रमाण-आधारित दवा सुरक्षा मंच'
                  )}
                </p>
                <LanguageSwitch />
              </div>

              <h1
                className="font-display font-bold tracking-tight text-[#0B1B2B] leading-[1.1] max-w-2xl mb-5"
                style={{ fontSize: 'clamp(2.15rem, 3.8vw, 3.35rem)', textWrap: 'balance' }}
              >
                {t(
                  'Verify medicines with auditable evidence, not guesswork.',
                  'दवाइयों की जाँच अनुमान से नहीं, प्रमाणित तथ्यों के साथ करें।'
                )}
              </h1>

              <p className="text-base text-slate-600 leading-relaxed max-w-xl mb-8">
                {t(
                  'MediTrust AI unites multimodal pack scanning, deterministic expiry and recall checks, prescription tracking, secure document verification, and an immutable pharmacy stock ledger into separate workspaces for patients and pharmacy teams.',
                  'मेडीट्रस्ट एआई दवा पैक स्कैनिंग, एक्सपायरी व रिकॉल जाँच, पर्चा ट्रैकिंग, सुरक्षित दस्तावेज़ सत्यापन और अपरिवर्तनीय फार्मेसी स्टॉक लेजर को मरीज़ों और फार्मेसी टीमों के लिए अलग-अलग कार्यक्षेत्रों में जोड़ता है।'
                )}
              </p>

              <div className="flex flex-wrap items-center gap-4 mb-9">
                <button
                  type="button"
                  onClick={() => onNavigateLogin('patient')}
                  className="inline-flex items-center gap-2.5 px-5 py-3 text-sm font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>{t('Patient Portal Login', 'रोगी पोर्टल लॉग इन')}</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateLogin('pharmacist')}
                  className="inline-flex items-center gap-2.5 px-5 py-3 text-sm font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Building2 className="w-4 h-4 shrink-0 text-[#0D7377]" />
                  <span>{t('Pharmacist Portal Login', 'फार्मासिस्ट पोर्टल लॉग इन')}</span>
                </button>
              </div>

              <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                <span>{t('Live openFDA Label & Recall API', 'लाइव openFDA लेबल एवं रिकॉल डेटा')}</span>
                <span aria-hidden="true">·</span>
                <span>{t('Multimodal Pack & Document OCR', 'मल्टीमॉडल पैक एवं दस्तावेज़ ओसीआर')}</span>
                <span aria-hidden="true">·</span>
                <span>{t('Hindi, English & Hinglish Support', 'हिन्दी, अंग्रेज़ी और हिंग्लिश समर्थन')}</span>
              </div>
            </motion.div>

            {/* Editorial Hero Photography + Measured Contrast Quote Scrim */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 relative rounded-xl overflow-hidden border border-slate-200 min-h-[360px] lg:min-h-[460px] flex flex-col justify-end"
            >
              <SafeImage
                src={MEDIA_ASSETS.heroVerification}
                alt="Clinical pharmacist verifying a medicine carton batch code in a bright pharmacy dispensary"
                className="absolute inset-0 w-full h-full object-cover"
                fallbackLabel="MediTrust AI Clinical Verification"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-[#0B1B2B]/90 via-[#0B1B2B]/35 to-transparent"
                aria-hidden="true"
              />
              <div className="relative z-10 p-6 sm:p-8 text-white">
                <Quote className="w-5 h-5 text-teal-300 mb-3" aria-hidden="true" />
                <blockquote className="font-display text-base sm:text-lg font-medium leading-relaxed text-white/95 max-w-xl">
                  “{isHindi ? CLINICAL_QUOTES.landingHero.hi : CLINICAL_QUOTES.landingHero.en}”
                </blockquote>
                <p className="text-xs text-teal-200/90 mt-3">
                  — {isHindi ? CLINICAL_QUOTES.landingHero.authorHi : CLINICAL_QUOTES.landingHero.authorEn}
                </p>
              </div>
            </motion.div>
          </div>

          {/* 5 Explicit Verification States Reference Bar */}
          <div className="border-t border-slate-200 bg-[#F8FAFC]">
            <div className="max-w-7xl mx-auto px-6 py-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
                <p className="font-display text-sm font-semibold text-[#0B1B2B]">
                  {t(
                    'Non-Negotiable Verification Standard — 5 Explicit States',
                    'अटल सत्यापन मानक — 5 स्पष्ट परिणाम श्रेणियाँ'
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {t(
                    'Every check records source provenance, timestamp, and coverage limits.',
                    'हर जाँच स्रोत, समय और सीमाओं का स्पष्ट प्रमाण सुरक्षित रखती है।'
                  )}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
                {verificationStates.map((state) => {
                  const Icon = state.icon;
                  return (
                    <div key={state.label} className="pt-3 border-t border-slate-200">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon className={`w-4 h-4 shrink-0 ${state.color}`} />
                        <p className={`text-xs font-semibold ${state.color}`}>{state.label}</p>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{state.meaning}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Core Capabilities Asymmetric Grid with Real Editorial Imagery */}
        <section id="capabilities" className="max-w-7xl mx-auto px-6 py-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold text-[#0D7377] mb-2">
                {t('Platform Capabilities', 'प्लेटफ़ॉर्म की प्रमुख क्षमताएँ')}
              </p>
              <h2
                className="font-display text-3xl font-bold tracking-tight text-[#0B1B2B] mb-3"
                style={{ textWrap: 'balance' }}
              >
                {t(
                  'Every safety workflow on its own dedicated page.',
                  'हर सुरक्षा कार्य के लिए समर्पित और स्पष्ट पेज।'
                )}
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {t(
                  'Designed around real clinical and pharmacy operations—combining structured OCR, authoritative lookups, cryptographic document hashing, and transactional batch ledgers.',
                  'वास्तविक क्लिनिकल और फार्मेसी कार्यप्रणाली के लिए निर्मित—ओसीआर पठन, आधिकारिक डेटाबेस मिलान, क्रिप्टोग्राफिक दस्तावेज़ हैशिंग और सुरक्षित बैच लेजर का समन्वय।'
                )}
              </p>
            </div>
            <LanguageSwitch />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {capabilities.map((cap, idx) => {
              const Icon = cap.icon;
              const hasImage = Boolean(cap.image);
              return (
                <motion.div
                  key={cap.index}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.25, delay: idx * 0.04 }}
                  className={`${cap.span} bg-white border border-slate-200 rounded-xl overflow-hidden ${
                    hasImage ? 'grid grid-cols-1 md:grid-cols-12 items-stretch' : 'p-7 flex flex-col justify-between'
                  }`}
                >
                  {hasImage && cap.image ? (
                    <>
                      <div className="md:col-span-7 p-7 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <span className="font-mono text-xs font-semibold text-slate-400 tabular-nums">
                              {cap.index}.
                            </span>
                            <Icon className="w-5 h-5 text-[#0D7377]" />
                          </div>
                          <h3 className="font-display text-lg font-semibold text-[#0B1B2B] mb-2.5">
                            {cap.title}
                          </h3>
                          <p className="text-sm text-slate-600 leading-relaxed">{cap.detail}</p>
                        </div>
                      </div>
                      <div className="md:col-span-5 relative min-h-[210px]">
                        <SafeImage
                          src={cap.image}
                          alt={cap.imageAlt || cap.title}
                          className="w-full h-full object-cover"
                          fallbackLabel={cap.title}
                        />
                      </div>
                    </>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-5">
                        <span className="font-mono text-xs font-semibold text-slate-400 tabular-nums">
                          {cap.index}.
                        </span>
                        <Icon className="w-5 h-5 text-[#0D7377]" />
                      </div>
                      <h3 className="font-display text-lg font-semibold text-[#0B1B2B] mb-2.5">
                        {cap.title}
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{cap.detail}</p>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Clinical Voices & Real-World Quotes (Adjacent to Capabilities) */}
        <section className="bg-white border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-16">
            <div className="max-w-2xl mb-10">
              <p className="text-xs font-semibold text-[#0D7377] mb-2">
                {t('Voices from Care & Practice', 'चिकित्सा एवं देखभाल के अनुभव')}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1B2B]">
                {t(
                  'Built for daily confidence at the counter and at home.',
                  'फार्मेसी काउंटर और घर—दोनों जगह रोज़मर्रा के भरोसे के लिए निर्मित।'
                )}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {CLINICAL_QUOTES.landingProof.map((item) => (
                <div
                  key={item.nameEn}
                  className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-7 flex flex-col justify-between"
                >
                  <div>
                    <Quote className="w-5 h-5 text-[#0D7377] mb-4" aria-hidden="true" />
                    <blockquote className="text-sm sm:text-base text-[#0B1B2B] leading-relaxed">
                      “{isHindi ? item.quoteHi : item.quoteEn}”
                    </blockquote>
                  </div>
                  <div className="pt-5 mt-6 border-t border-slate-200">
                    <p className="font-display text-sm font-semibold text-[#0B1B2B]">
                      {isHindi ? item.nameHi : item.nameEn}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isHindi ? item.orgHi : item.orgEn}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* End-to-End Request Flow */}
        <section id="workflow" className="bg-white border-y border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold text-[#0D7377] mb-2">
                  {t('End-to-End Architecture', 'संपूर्ण सत्यापन प्रक्रिया')}
                </p>
                <h2 className="font-display text-3xl font-bold tracking-tight text-[#0B1B2B]">
                  {t(
                    'Separation of concerns from scan to audit trail.',
                    'स्कैन से लेकर ऑडिट रिकॉर्ड तक हर चरण में स्पष्ट जिम्मेदारी।'
                  )}
                </h2>
              </div>
              <p className="text-sm text-slate-600 max-w-md">
                {t(
                  'The verification engine determines source-backed status deterministically. The AI assistant explains that status in plain language and cannot override it.',
                  'सत्यापन इंजन प्रमाण के आधार पर सटीक स्थिति तय करता है। एआई सहायक उस परिणाम को सरल भाषा में समझाता है और उसे बदल नहीं सकता।'
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6">
              {pipelineSteps.map((item) => (
                <div key={item.step} className="pt-4 border-t border-slate-200">
                  <p className="font-mono text-xs font-semibold text-[#0D7377] tabular-nums mb-2">
                    {t(`Step ${item.step}`, `चरण ${item.step}`)}
                  </p>
                  <h3 className="font-display text-base font-semibold text-[#0B1B2B] mb-1.5">
                    {item.name}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Dedicated Dual-Portal Breakdown with Editorial Visual Headers */}
        <section id="portals" className="max-w-7xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-semibold text-[#0D7377] mb-2">
              {t('Role-Isolated Portals', 'भूमिका-आधारित अलग पोर्टल')}
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#0B1B2B] mb-3">
              {t('Choose your workspace portal.', 'अपना कार्यक्षेत्र पोर्टल चुनें।')}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t(
                'Patient records and pharmacy operational ledgers are separated by role and account ownership, with distinct dashboards tailored to each workflow.',
                'रोगी के निजी रिकॉर्ड और फार्मेसी के स्टॉक लेजर अलग-अलग खातों में पूरी तरह सुरक्षित रहते हैं, प्रत्येक के लिए अलग डैशबोर्ड के साथ।'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            {/* Patient Portal Card */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
              <div>
                <div className="relative h-56 overflow-hidden">
                  <SafeImage
                    src={MEDIA_ASSETS.patientCare}
                    alt="Family caregiver organizing daily prescription medicines with an elder at home"
                    className="w-full h-full object-cover object-top"
                    fallbackLabel="Patient Portal"
                  />
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-[#0B1B2B]/85 via-[#0B1B2B]/25 to-transparent"
                    aria-hidden="true"
                  />
                  <div className="absolute bottom-5 left-7 right-7 flex items-end justify-between text-white">
                    <div>
                      <p className="text-xs font-medium text-teal-300 mb-1">
                        {t('For Individuals & Caregivers', 'मरीज़ों एवं परिवारों के लिए')}
                      </p>
                      <h3 className="font-display text-2xl font-bold">
                        {t('Patient Portal', 'रोगी पोर्टल')}
                      </h3>
                    </div>
                    <UserCheck className="w-7 h-7 text-teal-300 shrink-0" />
                  </div>
                </div>

                <div className="p-8">
                  <ul className="space-y-3 text-sm text-slate-600 mb-8">
                    <li className="flex items-start gap-2.5">
                      <span className="font-mono text-xs text-slate-400 mt-0.5">01.</span>
                      <span>
                        {t(
                          'Personal Medicine Dashboard with scan summary, reminders, and active alerts',
                          'व्यक्तिगत दवा डैशबोर्ड—स्कैन सारांश, खुराक रिकॉर्ड और सक्रिय अलर्ट के साथ'
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="font-mono text-xs text-slate-400 mt-0.5">02.</span>
                      <span>
                        {t(
                          'AI Medicine Scanner with live camera capture, OCR editing, and openFDA checks',
                          'एआई दवा स्कैनर—लाइव कैमरा, ओसीआर संपादन और openFDA सत्यापन के साथ'
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="font-mono text-xs text-slate-400 mt-0.5">03.</span>
                      <span>
                        {t(
                          'Prescription Tracking Dashboard with AI prescription parsing and dose logs',
                          'पर्चा ट्रैकिंग डैशबोर्ड—एआई पर्चा पठन और दैनिक खुराक लॉगिंग के साथ'
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="font-mono text-xs text-slate-400 mt-0.5">04.</span>
                      <span>
                        {t(
                          'Secure Document Verification with SHA-256 hashing and anomaly flags',
                          'सुरक्षित दस्तावेज़ सत्यापन—SHA-256 हैशिंग और विसंगति पहचान के साथ'
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="font-mono text-xs text-slate-400 mt-0.5">05.</span>
                      <span>
                        {t(
                          'Multilingual AI Assistant (Hindi, English, Hinglish), Recall Monitor & Privacy Controls',
                          'बहुभाषी एआई सहायक (हिन्दी, अंग्रेज़ी, हिंग्लिश), रिकॉल मॉनिटर और गोपनीयता नियंत्रण'
                        )}
                      </span>
                    </li>
                  </ul>

                  <button
                    type="button"
                    onClick={() => onNavigateLogin('patient')}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors cursor-pointer"
                  >
                    <span>{t('Continue to Patient Login', 'रोगी लॉग इन पर आगे बढ़ें')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Pharmacist Portal Card */}
            <div className="bg-[#0B1B2B] text-white border border-slate-800 rounded-xl overflow-hidden flex flex-col justify-between">
              <div>
                <div className="relative h-56 overflow-hidden">
                  <SafeImage
                    src={MEDIA_ASSETS.pharmacistLab}
                    alt="Licensed clinical pharmacist inspecting a sealed pharmaceutical bottle in a hospital pharmacy"
                    className="w-full h-full object-cover object-top"
                    fallbackLabel="Pharmacist Portal"
                  />
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-[#0B1B2B] via-[#0B1B2B]/40 to-transparent"
                    aria-hidden="true"
                  />
                  <div className="absolute bottom-5 left-7 right-7 flex items-end justify-between text-white">
                    <div>
                      <p className="text-xs font-medium text-teal-300 mb-1">
                        {t('For Licensed Pharmacies & Teams', 'लाइसेंस प्राप्त फार्मेसी एवं टीमों के लिए')}
                      </p>
                      <h3 className="font-display text-2xl font-bold">
                        {t('Pharmacist Portal', 'फार्मासिस्ट पोर्टल')}
                      </h3>
                    </div>
                    <Building2 className="w-7 h-7 text-teal-300 shrink-0" />
                  </div>
                </div>

                <div className="p-8">
                  <ul className="space-y-3 text-sm text-slate-300 mb-8">
                    <li className="flex items-start gap-2.5">
                      <span className="font-mono text-xs text-slate-400 mt-0.5">01.</span>
                      <span>
                        {t(
                          'Pharmacy Operations Dashboard with stock valuation, low-stock & expiry horizon',
                          'फार्मेसी संचालन डैशबोर्ड—स्टॉक मूल्यांकन, कम-स्टॉक और एक्सपायरी निगरानी के साथ'
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="font-mono text-xs text-slate-400 mt-0.5">02.</span>
                      <span>
                        {t(
                          'Batch Inventory & Append-Only Stock Ledger (receipt, dispense, adjustment, reconciliation)',
                          'बैच इन्वेंट्री और अपरिवर्तनीय स्टॉक लेजर (रसीद, वितरण, समायोजन और मिलान)'
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="font-mono text-xs text-slate-400 mt-0.5">03.</span>
                      <span>
                        {t(
                          'Supply Chain Batch Traceability timeline highlighting missing hand-off gaps',
                          'सप्लाई चेन बैच ट्रेसेबिलिटी—अधूरे कस्टडी चरणों की स्पष्ट पहचान के साथ'
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="font-mono text-xs text-slate-400 mt-0.5">04.</span>
                      <span>
                        {t(
                          'Verification Review & Escalation Queue plus Supplier Invoice & CoA Verification',
                          'सत्यापन समीक्षा एवं एस्केलेशन कतार तथा सप्लायर इनवॉइस व CoA सत्यापन'
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="font-mono text-xs text-slate-400 mt-0.5">05.</span>
                      <span>
                        {t(
                          'Live Recall Screening, Compliance Audit Trail & Downloadable CSV/JSON Reports',
                          'लाइव रिकॉल स्क्रीनिंग, अनुपालन ऑडिट ट्रेल और डाउनलोड योग्य CSV/JSON रिपोर्ट'
                        )}
                      </span>
                    </li>
                  </ul>

                  <button
                    type="button"
                    onClick={() => onNavigateLogin('pharmacist')}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-[#0B1B2B] bg-white rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <span>{t('Continue to Pharmacist Login', 'फार्मासिस्ट लॉग इन पर आगे बढ़ें')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Operating Principles */}
        <section id="principles" className="bg-white border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <div className="flex items-center gap-2 text-[#0D7377] mb-2">
                  <GitBranch className="w-4 h-4" />
                  <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                    {t('Append-Only Data Integrity', 'अपरिवर्तनीय डेटा अखंडता')}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t(
                    'Stock movements, batch custody hand-offs, and compliance audit logs are persisted as immutable records preserving who changed a value, when, and why.',
                    'स्टॉक लेनदेन, बैच कस्टडी और अनुपालन ऑडिट लॉग स्थायी रिकॉर्ड के रूप में सुरक्षित रहते हैं—किसने, कब और क्यों बदलाव किया, इसके पूर्ण प्रमाण के साथ।'
                  )}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-[#0D7377] mb-2">
                  <ShieldCheck className="w-4 h-4" />
                  <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                    {t('Human Confirmation First', 'मानवीय पुष्टि सर्वोपरि')}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t(
                    'Low-confidence OCR fields, conflicting batch records, and suspected anomalies always route to human confirmation—never automatic public accusations.',
                    'कम स्पष्टता वाले ओसीआर विवरण, बैच विसंगतियाँ और संदिग्ध मामले हमेशा मानवीय पुष्टि के लिए भेजे जाते हैं।'
                  )}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-[#0D7377] mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <h3 className="font-display text-base font-semibold text-[#0B1B2B]">
                    {t('Clinical Safety Boundary', 'क्लिनिकल सुरक्षा सीमा')}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t(
                    'MediTrust AI is an information and workflow platform, not a substitute for a doctor, pharmacist, or drug regulator. Never alter prescriptions without clinical guidance.',
                    'मेडीट्रस्ट एआई एक सूचना और सुरक्षा मंच है—यह डॉक्टर, फार्मासिस्ट या औषधि नियामक का विकल्प नहीं है। चिकित्सकीय सलाह के बिना अपनी दवा न बदलें।'
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Clinical Footer */}
      <footer className="bg-[#F8FAFC] border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <MediTrustLogo size="sm" variant="dark" />
            <span aria-hidden="true">·</span>
            <span>
              {t(
                'Evidence-Based Medicine Safety & Pharmacy Verification Platform',
                'प्रमाण-आधारित दवा सुरक्षा एवं फार्मेसी सत्यापन मंच'
              )}
            </span>
          </div>
          <div className="flex items-center gap-5">
            <LanguageSwitch compact />
            <button
              type="button"
              onClick={() => onNavigateLogin('patient')}
              className="hover:text-[#0B1B2B] transition-colors cursor-pointer whitespace-nowrap"
            >
              {t('Patient Portal', 'रोगी पोर्टल')}
            </button>
            <button
              type="button"
              onClick={() => onNavigateLogin('pharmacist')}
              className="hover:text-[#0B1B2B] transition-colors cursor-pointer whitespace-nowrap"
            >
              {t('Pharmacist Portal', 'फार्मासिस्ट पोर्टल')}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
