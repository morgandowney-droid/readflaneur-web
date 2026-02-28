'use client';

import { useState, useEffect, useCallback } from 'react';

export const SUPPORTED_LANGUAGES = {
  en: 'English',
  sv: 'Svenska',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
  zh: '中文(简体)',
  ja: '日本語',
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

const STORAGE_KEY = 'flaneur-language';

/** Map navigator.language prefixes to our supported codes */
function detectBrowserLanguage(): LanguageCode | null {
  try {
    const langs = navigator.languages || [navigator.language];
    for (const lang of langs) {
      const prefix = lang.split('-')[0].toLowerCase() as LanguageCode;
      if (prefix in SUPPORTED_LANGUAGES && prefix !== 'en') {
        return prefix;
      }
    }
  } catch {
    // SSR or unavailable
  }
  return null;
}

export function useLanguage() {
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [isTranslated, setIsTranslated] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
      if (stored && stored in SUPPORTED_LANGUAGES) {
        setLanguageState(stored);
        setIsTranslated(stored !== 'en');
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const setLanguage = useCallback((code: LanguageCode) => {
    setLanguageState(code);
    setIsTranslated(code !== 'en');
    try {
      if (code === 'en') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, code);
      }
    } catch {
      // localStorage unavailable
    }
    document.documentElement.lang = code;
    // Fire-and-forget sync to DB for cross-device persistence
    try {
      fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: code }),
      }).catch(() => {});
    } catch { /* ignore */ }
  }, []);

  /** Auto-detect browser language and enable translation */
  const detectLanguage = useCallback((): LanguageCode => {
    const detected = detectBrowserLanguage();
    const code = detected || 'en';
    setLanguage(code);
    return code;
  }, [setLanguage]);

  /** Toggle: if English, detect and enable; if translated, back to English */
  const toggleTranslation = useCallback(() => {
    if (isTranslated) {
      setLanguage('en');
    } else {
      detectLanguage();
    }
  }, [isTranslated, setLanguage, detectLanguage]);

  return {
    language,
    isTranslated,
    setLanguage,
    detectLanguage,
    toggleTranslation,
  };
}
