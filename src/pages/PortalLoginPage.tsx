import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Lock,
  Mail,
  Quote,
  ShieldCheck,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LanguageSwitch, useLanguage } from '../context/LanguageContext';
import { MediTrustLogo } from '../components/MediTrustLogo';
import { MEDIA_ASSETS, SafeImage } from '../components/EditorialMedia';
import { CLINICAL_QUOTES } from '../lib/i18n';
import type { PortalRole, PreferredLanguage } from '../types';

interface PortalLoginPageProps {
  role: PortalRole;
  onBackHome: () => void;
  onSwitchRole: (role: PortalRole) => void;
  onSuccess: (role: PortalRole) => void;
}

function formatAuthError(err: unknown, isHindi: boolean): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('Incorrect password')) {
    return isHindi
      ? 'इस ईमेल के लिए पासवर्ड गलत है। इस ईमेल का सही पासवर्ड दर्ज करें, या बिल्कुल नए खाते के लिए नया ईमेल डालें।'
      : raw;
  }
  if (raw.includes('auth/weak-password')) {
    return isHindi
      ? 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।'
      : 'Password must be at least 6 characters long.';
  }
  if (raw.includes('auth/invalid-email')) {
    return isHindi
      ? 'कृपया सही ईमेल प्रारूप दर्ज करें (जैसे rohan@gmail.com)।'
      : 'Please enter a valid email address (e.g., rohan@gmail.com).';
  }
  return raw;
}

export function PortalLoginPage({
  role,
  onBackHome,
  onSwitchRole,
  onSuccess,
}: PortalLoginPageProps) {
  const {
    user,
    profile,
    signInWithGoogle,
    signInOrCreateWithEmail,
    completeOnboarding,
    logout,
  } = useAuth();
  const { isHindi, t } = useLanguage();

  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<PreferredLanguage>(
    isHindi ? 'hi' : 'en'
  );
  const [pharmacyName, setPharmacyName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [city, setCity] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [accountNotice, setAccountNotice] = useState('');

  const isPharmacist = role === 'pharmacist';
  const roleQuote = isPharmacist ? CLINICAL_QUOTES.loginPharmacist : CLINICAL_QUOTES.loginPatient;
  const roleImage = isPharmacist ? MEDIA_ASSETS.pharmacistLab : MEDIA_ASSETS.patientCare;

  // Hydrate form inputs only when the signed-in user or initial profile presence changes,
  // never overwriting what the user is actively typing.
  const lastHydratedKeyRef = useRef<string>('');
  useEffect(() => {
    if (!user) {
      lastHydratedKeyRef.current = '';
      return;
    }
    const hydrationKey = `${user.uid}:${profile ? 'loaded' : 'empty'}`;
    if (lastHydratedKeyRef.current === hydrationKey) return;
    lastHydratedKeyRef.current = hydrationKey;

    if (profile) {
      setDisplayName(profile.displayName || user.displayName || '');
      setPreferredLanguage(profile.preferredLanguage || (isHindi ? 'hi' : 'en'));
      setPharmacyName(profile.pharmacyName || '');
      setLicenseNumber(profile.licenseNumber || '');
      setCity(profile.city || '');
      setConsentAccepted(Boolean(profile.consentAccepted));
    } else {
      setDisplayName(user.displayName || user.email?.split('@')[0] || '');
      setPharmacyName('');
      setLicenseNumber('');
      setCity('');
      setConsentAccepted(false);
    }
  }, [user, profile, isHindi]);

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setAccountNotice('');
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setErrorMsg(formatAuthError(err, isHindi));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setAccountNotice('');
    if (!emailInput.trim() || !passwordInput) {
      setErrorMsg(
        t(
          'Please enter both an email address and password.',
          'कृपया ईमेल पता और पासवर्ड दोनों दर्ज करें।'
        )
      );
      return;
    }
    if (passwordInput.length < 6) {
      setErrorMsg(
        t('Password must be at least 6 characters.', 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।')
      );
      return;
    }

    setBusy(true);
    try {
      const result = await signInOrCreateWithEmail(emailInput.trim(), passwordInput);
      if (result.isNewAccount) {
        setAccountNotice(
          t(
            'New account created from scratch. Complete your profile below to enter your fresh workspace.',
            'बिल्कुल नया खाता बनाया गया है। अपने नए कार्यक्षेत्र में प्रवेश के लिए नीचे प्रोफ़ाइल पूरी करें।'
          )
        );
      } else {
        setAccountNotice(
          t(
            'Welcome back! Your saved workspace progress for this email has been restored.',
            'वापसी पर स्वागत है! इस ईमेल की सहेजी गई प्रगति वापस लोड कर दी गई है।'
          )
        );
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err, isHindi));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!displayName.trim()) {
      setErrorMsg(t('Please enter your full name.', 'कृपया अपना पूरा नाम दर्ज करें।'));
      return;
    }
    if (!consentAccepted) {
      setErrorMsg(
        t(
          'Please confirm the privacy and clinical safety boundary notice to continue.',
          'आगे बढ़ने के लिए कृपया गोपनीयता और क्लिनिकल सुरक्षा सूचना की पुष्टि करें।'
        )
      );
      return;
    }

    const customPharmacyName = pharmacyName.trim() || profile?.pharmacyName || `${displayName.trim()}'s Pharmacy`;
    const customLicenseNumber = licenseNumber.trim() || profile?.licenseNumber || 'CUSTOM-REG';
    const customCity = city.trim();

    setBusy(true);
    try {
      await completeOnboarding({
        displayName: displayName.trim(),
        portalRole: role,
        preferredLanguage,
        consentAccepted: true,
        pharmacyName: isPharmacist ? customPharmacyName : profile?.pharmacyName,
        licenseNumber: isPharmacist ? customLicenseNumber : profile?.licenseNumber,
        city: isPharmacist ? customCity : profile?.city,
      });
      onSuccess(role);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save portal profile.');
    } finally {
      setBusy(false);
    }
  };

  const handleDirectEnter = async () => {
    if (!profile) return;
    setErrorMsg('');
    setBusy(true);
    try {
      if (profile.portalRole !== role) {
        if (isPharmacist && (!profile.pharmacyName || !profile.licenseNumber)) {
          setBusy(false);
          return;
        }
        await completeOnboarding({
          displayName: profile.displayName,
          portalRole: role,
          preferredLanguage: profile.preferredLanguage,
          consentAccepted: true,
          pharmacyName: profile.pharmacyName,
          licenseNumber: profile.licenseNumber,
          city: profile.city,
        });
      }
      onSuccess(role);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to enter workspace.');
    } finally {
      setBusy(false);
    }
  };

  const canQuickEnter =
    Boolean(user && profile && profile.consentAccepted) &&
    (!isPharmacist || (Boolean(profile?.pharmacyName) && Boolean(profile?.licenseNumber)));

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 min-w-0">
            <button
              type="button"
              onClick={onBackHome}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0B1B2B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <MediTrustLogo size="sm" variant="dark" />
            </button>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <LanguageSwitch compact />
            <div className="hidden sm:flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => onSwitchRole('patient')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  !isPharmacist
                    ? 'bg-white text-[#0B1B2B] shadow-xs'
                    : 'text-slate-600 hover:text-[#0B1B2B]'
                }`}
              >
                {t('Patient Portal', 'रोगी पोर्टल')}
              </button>
              <button
                type="button"
                onClick={() => onSwitchRole('pharmacist')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  isPharmacist
                    ? 'bg-white text-[#0B1B2B] shadow-xs'
                    : 'text-slate-600 hover:text-[#0B1B2B]'
                }`}
              >
                {t('Pharmacist Portal', 'फार्मासिस्ट पोर्टल')}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-10">
        <motion.div
          key={role}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200 rounded-xl overflow-hidden"
        >
          {/* Left Editorial Photographic Column with Authentic Quote & Measured Scrim */}
          <div className="lg:col-span-5 relative min-h-[380px] lg:min-h-[600px] flex flex-col justify-between p-8 text-white overflow-hidden bg-[#0B1B2B]">
            <SafeImage
              src={roleImage}
              alt={
                isPharmacist
                  ? 'Licensed clinical pharmacist inspecting a medicine bottle in a hospital pharmacy'
                  : 'Family caregiver and elder organizing prescription medicines together at home'
              }
              className="absolute inset-0 w-full h-full object-cover object-top"
              fallbackLabel={isPharmacist ? 'Pharmacist Portal' : 'Patient Portal'}
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-[#0B1B2B] via-[#0B1B2B]/75 to-[#0B1B2B]/40"
              aria-hidden="true"
            />

            <div className="relative z-10">
              <div className="flex items-center gap-2.5 mb-5">
                {isPharmacist ? (
                  <Building2 className="w-5 h-5 text-teal-300" />
                ) : (
                  <UserCheck className="w-5 h-5 text-teal-300" />
                )}
                <span className="text-xs font-semibold text-teal-300">
                  {isPharmacist
                    ? t('Pharmacist & Pharmacy Team Access', 'फार्मासिस्ट एवं फार्मेसी टीम प्रवेश')
                    : t('Patient & Caregiver Access', 'रोगी एवं देखभालकर्ता प्रवेश')}
                </span>
              </div>

              <h1 className="font-display text-2xl font-bold tracking-tight text-white mb-3">
                {isPharmacist
                  ? t('Pharmacy Workspace Sign In', 'फार्मेसी कार्यक्षेत्र साइन इन')
                  : t('Patient Safety Portal Sign In', 'रोगी सुरक्षा पोर्टल साइन इन')}
              </h1>

              <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed">
                {isPharmacist
                  ? t(
                      'Manage tenant-isolated batch inventory, append-only stock receipts, custody hand-offs, supplier invoices, and flagged scan reviews.',
                      'बैच इन्वेंट्री, अपरिवर्तनीय स्टॉक रसीदें, सप्लाई चेन कस्टडी, सप्लायर इनवॉइस और संदिग्ध स्कैन समीक्षा का सुरक्षित प्रबंधन करें।'
                    )
                  : t(
                      'Scan medicine cartons or strips, verify identifiers against openFDA registries, track prescriptions, verify documents, and consult our Hindi/English AI assistant.',
                      'दवा के पैक स्कैन करें, openFDA रजिस्ट्री से जाँच करें, पर्चे व खुराक ट्रैक करें और हिन्दी/अंग्रेज़ी एआई सहायक से मार्गदर्शन लें।'
                    )}
              </p>
            </div>

            <div className="relative z-10 mt-8 space-y-5">
              {/* Authentic Healthcare Quote */}
              <div className="pt-5 border-t border-white/20">
                <Quote className="w-4 h-4 text-teal-300 mb-2" aria-hidden="true" />
                <blockquote className="font-display text-sm font-medium text-white leading-relaxed">
                  “{isHindi ? roleQuote.hi : roleQuote.en}”
                </blockquote>
                <p className="text-[11px] text-teal-200/90 mt-2">
                  — {isHindi ? roleQuote.authorHi : roleQuote.authorEn}
                </p>
              </div>

              <div className="space-y-2.5 pt-4 border-t border-white/15 text-[11px] text-slate-300">
                <div className="flex items-start gap-2.5">
                  <Lock className="w-3.5 h-3.5 text-teal-300 shrink-0 mt-0.5" />
                  <span>
                    {t(
                      'Every email gets its own isolated workspace — new emails start fresh and returning emails restore saved progress.',
                      'हर ईमेल का अलग निजी कार्यक्षेत्र होता है — नया ईमेल नए सिरे से शुरू होता है और पुराना ईमेल आपकी सहेजी गई प्रगति वापस लाता है।'
                    )}
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-300 shrink-0 mt-0.5" />
                  <span>
                    {t(
                      'Assistive verification platform — does not replace a licensed doctor or regulator.',
                      'सहायक सत्यापन मंच — यह डॉक्टर या औषधि नियामक का विकल्प नहीं है।'
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Form Column */}
          <div className="lg:col-span-7 p-7 sm:p-10 flex flex-col justify-center">
            {errorMsg && (
              <div className="mb-6 p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800 leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {!user ? (
              <div>
                <div className="mb-6">
                  <h2 className="font-display text-xl font-bold text-[#0B1B2B]">
                    {t('Sign in or start a new workspace', 'लॉग इन करें या नया कार्यक्षेत्र शुरू करें')} ·{' '}
                    {isPharmacist ? t('Pharmacist', 'फार्मासिस्ट') : t('Patient', 'रोगी')}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {t(
                      'Enter any Gmail or email address and password. New email starts fresh from scratch; returning email & password restores all saved progress.',
                      'कोई भी Gmail या ईमेल पता और पासवर्ड दर्ज करें। नया ईमेल बिल्कुल नए सिरे से शुरू होगा; पुराना ईमेल और पासवर्ड आपकी सहेजी गई प्रगति वापस लाएगा।'
                    )}
                  </p>
                </div>

                {/* Unified Email & Password Form */}
                <form onSubmit={handleEmailContinue} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('Gmail / Email Address', 'Gmail / ईमेल पता')}
                    </label>
                    <input
                      type="email"
                      required
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder={
                        isPharmacist ? 'pharmacy@gmail.com' : 'yourname@gmail.com'
                      }
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('Password (min. 6 characters)', 'पासवर्ड (कम से कम 6 अक्षर)')}
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder={t('Enter your password', 'अपना पासवर्ड दर्ज करें')}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    <Mail className="w-4 h-4" />
                    <span>
                      {busy
                        ? t('Signing in...', 'लॉग इन हो रहा है...')
                        : t('Continue with Email & Password', 'ईमेल और पासवर्ड से जारी रखें')}
                    </span>
                  </button>
                </form>

                {/* Divider */}
                <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span>{t('or', 'या')}</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                {/* Google Sign-In */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3 px-5 py-3 text-sm font-semibold text-[#0B1B2B] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.86-3c-1.08.73-2.46 1.16-3.42 1.16-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                  </svg>
                  <span>{t('Continue with Google', 'Google के साथ जारी रखें')}</span>
                </button>

                <p className="text-xs text-slate-500 mt-5 leading-relaxed">
                  {t('Looking for the other workspace?', 'क्या आप दूसरे पोर्टल पर जाना चाहते हैं?')}{' '}
                  <button
                    type="button"
                    onClick={() => onSwitchRole(isPharmacist ? 'patient' : 'pharmacist')}
                    className="font-semibold text-[#0D7377] hover:underline cursor-pointer"
                  >
                    {isPharmacist
                      ? t('Switch to Patient Portal Login', 'रोगी पोर्टल लॉग इन पर जाएँ')
                      : t('Switch to Pharmacist Portal Login', 'फार्मासिस्ट पोर्टल लॉग इन पर जाएँ')}
                  </button>
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-200">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{t('Signed in as', 'लॉग इन खाता')}</p>
                    <p className="text-sm font-semibold text-[#0B1B2B] truncate">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountNotice('');
                      setErrorMsg('');
                      void logout();
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-rose-700 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {t('Use another email', 'अन्य ईमेल चुनें')}
                  </button>
                </div>

                {accountNotice && !canQuickEnter && (
                  <div className="mb-5 p-3.5 rounded-lg bg-teal-50/70 border border-teal-200 text-xs text-[#0B1B2B] leading-relaxed">
                    {accountNotice}
                  </div>
                )}

                {canQuickEnter && (
                  <div className="mb-6 p-4 rounded-lg bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-emerald-900">
                        <p className="font-semibold">
                          {t('Saved workspace ready for', 'सहेजा गया कार्यक्षेत्र तैयार:')}{' '}
                          {isPharmacist ? profile?.pharmacyName : profile?.displayName}
                        </p>
                        <p className="text-emerald-800 mt-0.5">
                          {t(
                            'Enter directly to resume your progress or update your details below.',
                            'अपनी सहेजी गई प्रगति जारी रखने के लिए सीधे प्रवेश करें या नीचे विवरण अपडेट करें।'
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleDirectEnter}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {busy
                        ? t('Opening...', 'खुल रहा है...')
                        : isPharmacist
                          ? t('Enter Pharmacist Portal', 'फार्मासिस्ट पोर्टल खोलें')
                          : t('Enter Patient Portal', 'रोगी पोर्टल खोलें')}
                    </button>
                  </div>
                )}

                <form onSubmit={handleSubmitProfile} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        {t('Full Name', 'पूरा नाम')}
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={120}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={isPharmacist ? 'Dr. Ananya Sharma, RPh' : 'Rohan Verma'}
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        {t('Preferred Assistant Language', 'पसंदीदा सहायक भाषा')}
                      </label>
                      <select
                        value={preferredLanguage}
                        onChange={(e) => setPreferredLanguage(e.target.value as PreferredLanguage)}
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                      >
                        <option value="en">English</option>
                        <option value="hi">Hindi (हिन्दी)</option>
                        <option value="hinglish">Hinglish (Hindi + English)</option>
                      </select>
                    </div>
                  </div>

                  {isPharmacist && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          {t('Pharmacy / Institution Name', 'फार्मेसी / संस्थान का नाम')}
                        </label>
                        <input
                          type="text"
                          maxLength={160}
                          value={pharmacyName}
                          onChange={(e) => setPharmacyName(e.target.value)}
                          placeholder={t(
                            'Enter any pharmacy or store name (e.g., CareWell Pharmacy)',
                            'कोई भी फार्मेसी या स्टोर का नाम लिखें'
                          )}
                          className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          {t('Drug License / Registration No.', 'ड्रग लाइसेंस / पंजीकरण संख्या')}
                        </label>
                        <input
                          type="text"
                          maxLength={80}
                          value={licenseNumber}
                          onChange={(e) => setLicenseNumber(e.target.value)}
                          placeholder={t(
                            'Enter any license or registration ID',
                            'कोई भी लाइसेंस या पंजीकरण संख्या लिखें'
                          )}
                          className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          {t('City / Region', 'शहर / क्षेत्र')}
                        </label>
                        <input
                          type="text"
                          maxLength={100}
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder={t('Enter any city or region', 'कोई भी शहर या क्षेत्र लिखें')}
                          className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0D7377]"
                        />
                      </div>
                    </div>
                  )}

                  <label className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentAccepted}
                      onChange={(e) => setConsentAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-[#0D7377] focus:ring-[#0D7377]"
                    />
                    <span className="text-xs text-slate-600 leading-relaxed">
                      {t(
                        'I understand that MediTrust AI stores my workspace records privately for verification and auditability, and that AI extraction is an assistive tool that does not replace a licensed clinician, pharmacist, or regulator.',
                        'मैं समझता/समझती हूँ कि मेडीट्रस्ट एआई मेरे कार्यक्षेत्र के रिकॉर्ड सत्यापन हेतु निजी रूप से सुरक्षित रखता है और यह एआई प्रणाली डॉक्टर, फार्मासिस्ट या नियामक का विकल्प नहीं है।'
                      )}
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full px-5 py-3 text-sm font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {busy
                      ? t('Saving Workspace Profile...', 'प्रोफ़ाइल सहेजी जा रही है...')
                      : isPharmacist
                        ? t('Save & Enter Pharmacist Dashboard', 'सहेजें और फार्मासिस्ट डैशबोर्ड खोलें')
                        : t('Save & Enter Patient Dashboard', 'सहेजें और रोगी डैशबोर्ड खोलें')}
                  </button>
                </form>
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
