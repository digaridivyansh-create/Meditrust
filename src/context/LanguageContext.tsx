import React, { createContext, useContext, useEffect, useState } from 'react';
import { Languages } from 'lucide-react';

export type UiLanguage = 'en' | 'hi';

interface LanguageContextValue {
  lang: UiLanguage;
  isHindi: boolean;
  setLang: (lang: UiLanguage) => void;
  toggleLang: () => void;
  t: (en: string, hi: string) => string;
}

const STORAGE_KEY = 'meditrust_ui_lang';

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<UiLanguage>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved === 'hi' ? 'hi' : 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = (next: UiLanguage) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
  }, [lang]);

  const toggleLang = () => setLang(lang === 'en' ? 'hi' : 'en');
  const t = (en: string, hi: string) => (lang === 'hi' ? hi : en);

  return (
    <LanguageContext.Provider
      value={{
        lang,
        isHindi: lang === 'hi',
        setLang,
        toggleLang,
        t,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}

export function LanguageSwitch({
  variant = 'light',
  compact = false,
}: {
  variant?: 'light' | 'dark';
  compact?: boolean;
}) {
  const { lang, setLang } = useLanguage();

  const containerCls =
    variant === 'dark'
      ? 'bg-slate-800/90 border border-slate-700 text-slate-300'
      : 'bg-slate-100 border border-slate-200 text-slate-600';

  const activeCls =
    variant === 'dark'
      ? 'bg-white text-[#0B1B2B]'
      : 'bg-white text-[#0B1B2B] shadow-xs';

  return (
    <div
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg shrink-0 ${containerCls}`}
      role="group"
      aria-label="Language switch"
    >
      {!compact && (
        <Languages
          className={`w-3.5 h-3.5 ml-1.5 mr-1 shrink-0 ${
            variant === 'dark' ? 'text-teal-300' : 'text-[#0D7377]'
          }`}
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          lang === 'en' ? activeCls : 'hover:text-[#0B1B2B]'
        }`}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => setLang('hi')}
        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          lang === 'hi' ? activeCls : 'hover:text-[#0B1B2B]'
        }`}
      >
        हिन्दी
      </button>
    </div>
  );
}
