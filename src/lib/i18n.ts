import type { UiLanguage } from '../context/LanguageContext';

export const CLINICAL_QUOTES = {
  landingHero: {
    en: 'Safe medicines begin with verifiable truth. Every patient deserves to know what is in their pack before they take a single dose.',
    hi: 'सुरक्षित दवा की शुरुआत प्रमाणित सत्य से होती है। हर मरीज़ को पहली खुराक लेने से पहले यह जानने का अधिकार है कि उसकी दवा असली और सुरक्षित है।',
    authorEn: 'WHO Patient Safety Principle · Medication Without Harm',
    authorHi: 'विश्व स्वास्थ्य संगठन (WHO) रोगी सुरक्षा सिद्धांत · सुरक्षित दवा पहल',
  },
  landingProof: [
    {
      quoteEn:
        'Having batch verification, expiry alerts, and our append-only stock ledger in one place eliminated manual register errors during drug inspector audits.',
      quoteHi:
        'बैच सत्यापन, एक्सपायरी अलर्ट और अपरिवर्तनीय स्टॉक लेजर एक ही जगह होने से ड्रग इंस्पेक्टर ऑडिट के दौरान रजिस्टर की गलतियाँ पूरी तरह समाप्त हो गईं।',
      nameEn: 'Dr. Kavita Deshmukh, RPh',
      nameHi: 'डॉ. कविता देशमुख (पंजीकृत फार्मासिस्ट)',
      orgEn: 'Chief Pharmacist · Sahyadri Community Pharmacy, Pune',
      orgHi: 'मुख्य फार्मासिस्ट · सह्याद्री कम्युनिटी फार्मेसी, पुणे',
    },
    {
      quoteEn:
        'My father takes six daily medicines. Scanning strips and reading clear Hindi safety guidance gives our whole family peace of mind every morning.',
      quoteHi:
        'मेरे पिताजी रोज़ छह दवाइयाँ लेते हैं। दवा का पैक स्कैन करके सरल हिन्दी में सुरक्षा जानकारी पढ़ना हमारे पूरे परिवार को निश्चिंत रखता है।',
      nameEn: 'Arjun Malhotra',
      nameHi: 'अर्जुन मल्होत्रा',
      orgEn: 'Family Caregiver · Lucknow',
      orgHi: 'परिवार देखभालकर्ता · लखनऊ',
    },
  ],
  loginPatient: {
    en: 'The greatest wealth is health—and protecting your family starts with knowing every tablet is genuine, in-date, and right for the prescription.',
    hi: 'सबसे बड़ा धन स्वास्थ्य है—और आपके परिवार की सुरक्षा इस बात से शुरू होती है कि हर दवा असली, समय-सीमा के भीतर और डॉक्टर के पर्चे के अनुसार हो।',
    authorEn: 'MediTrust Patient Safety Charter',
    authorHi: 'मेडीट्रस्ट रोगी सुरक्षा चार्टर',
  },
  loginPharmacist: {
    en: 'A pharmacist is the final clinical guardian between the supply chain and the patient. Auditable batch custody protects both lives and public trust.',
    hi: 'फार्मासिस्ट सप्लाई चेन और मरीज़ के बीच अंतिम क्लिनिकल रक्षक है। पारदर्शी बैच ट्रेसेबिलिटी जीवन और जन-विश्वास दोनों की रक्षा करती है।',
    authorEn: 'Clinical Pharmacy Stewardship Standard',
    authorHi: 'क्लिनिकल फार्मेसी उत्तरदायित्व मानक',
  },
  features: {
    patientDashboard: {
      kickerEn: 'Patient Safety Philosophy',
      kickerHi: 'रोगी सुरक्षा सिद्धांत',
      quoteEn: 'Informed patients make safer decisions. Verify the label, track every dose, and never guess when a batch looks unfamiliar.',
      quoteHi: 'जागरूक मरीज़ सुरक्षित निर्णय लेते हैं। लेबल की जाँच करें, हर खुराक का रिकॉर्ड रखें, और संदिग्ध बैच पर कभी अनुमान न लगाएँ।',
      authorEn: 'MediTrust Patient Care Guidance',
      authorHi: 'मेडीट्रस्ट रोगी देखभाल मार्गदर्शन',
    },
    scanner: {
      kickerEn: 'Evidence Before Certainty',
      kickerHi: 'अनुमान नहीं, प्रमाण',
      quoteEn: 'Optical extraction accelerates inspection, while human confirmation and live official registries turn a photo into reliable safety evidence.',
      quoteHi: 'एआई स्कैनिंग जाँच को तेज़ बनाती है, लेकिन मानवीय पुष्टि और आधिकारिक रजिस्ट्री एक फोटो को विश्वसनीय सुरक्षा प्रमाण में बदलती है।',
      authorEn: 'MediTrust Verification Standard',
      authorHi: 'मेडीट्रस्ट सत्यापन मानक',
    },
    prescriptions: {
      kickerEn: 'Adherence & Continuity',
      kickerHi: 'नियमित खुराक और निरंतरता',
      quoteEn: 'Medicines only work when taken accurately and consistently. Keeping prescriptions organized prevents missed doses and accidental duplication.',
      quoteHi: 'दवाइयाँ तभी असर करती हैं जब उन्हें सही समय और सही मात्रा में लिया जाए। व्यवस्थित पर्चा रिकॉर्ड छूटी खुराक और दोहरी दवा से बचाता है।',
      authorEn: 'National Medication Adherence Initiative',
      authorHi: 'राष्ट्रीय दवा नियमितता पहल',
    },
    documents: {
      kickerEn: 'Cryptographic Provenance',
      kickerHi: 'क्रिप्टोग्राफिक प्रामाणिकता',
      quoteEn: 'A SHA-256 fingerprint proves a prescription, invoice, or Certificate of Analysis has never been silently altered after verification.',
      quoteHi: 'SHA-256 फिंगरप्रिंट यह सुनिश्चित करता है कि सत्यापन के बाद किसी भी पर्चे, इनवॉइस या प्रमाणपत्र में कोई अनधिकृत बदलाव नहीं किया गया है।',
      authorEn: 'MediTrust Document Integrity Protocol',
      authorHi: 'मेडीट्रस्ट दस्तावेज़ सुरक्षा प्रोटोकॉल',
    },
    assistant: {
      kickerEn: 'Multilingual Clarity',
      kickerHi: 'अपनी भाषा में स्पष्ट जानकारी',
      quoteEn: 'Healthcare information should never be locked behind medical jargon. Understanding your medicine in Hindi or English is a basic right.',
      quoteHi: 'स्वास्थ्य जानकारी कभी भी कठिन मेडिकल शब्दों में छिपी नहीं होनी चाहिए। अपनी दवा को हिन्दी या अंग्रेज़ी में समझना हर व्यक्ति का अधिकार है।',
      authorEn: 'Patient Health Literacy Standard',
      authorHi: 'रोगी स्वास्थ्य साक्षरता मानक',
    },
    recalls: {
      kickerEn: 'Proactive Pharmacovigilance',
      kickerHi: 'सक्रिय दवा सतर्कता',
      quoteEn: 'Early awareness of a drug recall or near-expiry strip turns a silent household risk into timely preventive action.',
      quoteHi: 'दवा रिकॉल या नज़दीकी एक्सपायरी की समय पर जानकारी घरेलू जोखिम को समय रहते सुरक्षित कार्रवाई में बदल देती है।',
      authorEn: 'Pharmacovigilance & Recall Watch',
      authorHi: 'फार्माकोविजिलेंस एवं रिकॉल निगरानी',
    },
    pharmacyDashboard: {
      kickerEn: 'Dispensary Excellence',
      kickerHi: 'फार्मेसी संचालन उत्कृष्टता',
      quoteEn: 'Every dispensed pack carries a pharmacy’s reputation. Real-time expiry visibility and immutable batch ledgers keep shelves audit-ready every day.',
      quoteHi: 'हर वितरित दवा पैक फार्मेसी की विश्वसनीयता का प्रतीक है। रीयल-टाइम एक्सपायरी निगरानी और अपरिवर्तनीय लेजर हर दिन ऑडिट के लिए तैयार रखते हैं।',
      authorEn: 'Good Pharmacy Practice (GPP) Framework',
      authorHi: 'उत्तम फार्मेसी अभ्यास (GPP) मानक',
    },
    inventory: {
      kickerEn: 'Immutable Stock Accounting',
      kickerHi: 'अपरिवर्तनीय स्टॉक लेखा',
      quoteEn: 'True inventory trust comes from an append-only ledger—where every receipt, dispense, return, and reconciliation leaves a permanent trace.',
      quoteHi: 'सच्चा स्टॉक विश्वास अपरिवर्तनीय लेजर से आता है—जहाँ हर रसीद, वितरण, वापसी और मिलान का स्थायी प्रमाण सुरक्षित रहता है।',
      authorEn: 'MediTrust Pharmacy Ledger Principle',
      authorHi: 'मेडीट्रस्ट फार्मेसी लेजर सिद्धांत',
    },
    traceability: {
      kickerEn: 'Unbroken Chain of Custody',
      kickerHi: 'अखंड आपूर्ति श्रृंखला निगरानी',
      quoteEn: 'Counterfeit medicines enter where custody records go dark. Highlighting missing hand-offs protects your dispensary before dispensing begins.',
      quoteHi: 'नकली दवाइयाँ वहीं प्रवेश करती हैं जहाँ कस्टडी रिकॉर्ड अधूरे होते हैं। छूटी हुई कड़ियों की पहचान वितरण से पहले ही सुरक्षा सुनिश्चित करती है।',
      authorEn: 'Pharmaceutical Supply Chain Integrity',
      authorHi: 'फार्मास्युटिकल सप्लाई चेन सुरक्षा',
    },
    review: {
      kickerEn: 'Human-in-the-Loop Escalation',
      kickerHi: 'फार्मासिस्ट समीक्षा एवं एस्केलेशन',
      quoteEn: 'Technology flags anomalies in seconds, but a licensed pharmacist’s judgment ensures fair quarantine, supplier follow-up, and patient safety.',
      quoteHi: 'तकनीक कुछ सेकंड में विसंगतियों को पकड़ती है, लेकिन लाइसेंस प्राप्त फार्मासिस्ट का निर्णय सही क्वारंटाइन और मरीज़ की सुरक्षा तय करता है।',
      authorEn: 'Clinical Quality Assurance Protocol',
      authorHi: 'क्लिनिकल गुणवत्ता आश्वासन प्रोटोकॉल',
    },
    reports: {
      kickerEn: 'Audit-Ready Compliance',
      kickerHi: 'ऑडिट-तैयार अनुपालन रिपोर्ट',
      quoteEn: 'Transparent records are the strongest proof of care. Exportable audit trails and recall screening logs stand ready for every inspection.',
      quoteHi: 'पारदर्शी रिकॉर्ड देखभाल का सबसे मजबूत प्रमाण हैं। डाउनलोड योग्य ऑडिट लॉग और रिकॉल स्क्रीनिंग रिपोर्ट हर निरीक्षण के लिए तैयार रहती हैं।',
      authorEn: 'Regulatory Compliance Standard',
      authorHi: 'नियामक अनुपालन मानक',
    },
  },
} as const;

export function pickText(lang: UiLanguage, en: string, hi: string): string {
  return lang === 'hi' ? hi : en;
}
