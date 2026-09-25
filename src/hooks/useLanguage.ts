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
  nb: 'Norsk',
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

const STORAGE_KEY = 'flaneur-language';
const OFFERED_KEY = 'flaneur-language-offered';

/** Browser and URL codes that mean one of ours. Norwegian browsers report
 * nb-NO, but older ones and some OS settings report the macrolanguage "no",
 * and Nynorsk readers report "nn"; all three read the Bokmål edition. */
const LANGUAGE_ALIASES: Record<string, LanguageCode> = {
  no: 'nb',
  nn: 'nb',
};

/** Normalise a code from a browser or a ?lang= parameter to a supported one. */
export function normaliseLanguageCode(code: string | null | undefined): LanguageCode | null {
  if (!code) return null;
  const prefix = code.split('-')[0].toLowerCase();
  const mapped = LANGUAGE_ALIASES[prefix] || prefix;
  return mapped in SUPPORTED_LANGUAGES ? (mapped as LanguageCode) : null;
}

/** Map navigator.language prefixes to our supported codes */
function detectBrowserLanguage(): LanguageCode | null {
  try {
    const langs = navigator.languages || [navigator.language];
    for (const lang of langs) {
      const prefix = normaliseLanguageCode(lang);
      if (prefix && prefix !== 'en') return prefix;
    }
  } catch {
    // SSR or unavailable
  }
  return null;
}

export function useLanguage() {
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [isTranslated, setIsTranslated] = useState(false);

  // Hydrate from localStorage, auto-detect browser language on first visit
  useEffect(() => {
    try {
      // ?lang=xx on the URL wins over everything and persists, so a shared
      // link can open a page in a given language regardless of the reader's
      // browser or an earlier choice (publisher pilot links, 2026-09-11).
      const fromUrl = normaliseLanguageCode(new URLSearchParams(window.location.search).get('lang'));
      if (fromUrl) {
        setLanguageState(fromUrl);
        setIsTranslated(fromUrl !== 'en');
        if (fromUrl === 'en') localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, fromUrl);
        localStorage.setItem(OFFERED_KEY, '1');
        document.documentElement.lang = fromUrl;
        return;
      }
      const stored = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
      if (stored && stored in SUPPORTED_LANGUAGES) {
        setLanguageState(stored);
        setIsTranslated(stored !== 'en');
      } else if (!localStorage.getItem(OFFERED_KEY)) {
        // First visit: no stored preference and never auto-detected before
        localStorage.setItem(OFFERED_KEY, '1');
        const detected = detectBrowserLanguage();
        if (detected) {
          setLanguageState(detected);
          setIsTranslated(true);
          localStorage.setItem(STORAGE_KEY, detected);
          document.documentElement.lang = detected;
          // Fire-and-forget sync to DB for cross-device persistence
          fetch('/api/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: detected }),
          }).catch(() => {});
        }
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
