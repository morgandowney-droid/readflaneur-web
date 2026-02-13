'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useLanguage, LanguageCode, SUPPORTED_LANGUAGES } from '@/hooks/useLanguage';

interface LanguageContextValue {
  language: LanguageCode;
  isTranslated: boolean;
  setLanguage: (code: LanguageCode) => void;
  detectLanguage: () => LanguageCode;
  toggleTranslation: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const value = useLanguage();
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguageContext(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback for components rendered outside provider (shouldn't happen)
    return {
      language: 'en',
      isTranslated: false,
      setLanguage: () => {},
      detectLanguage: () => 'en' as LanguageCode,
      toggleTranslation: () => {},
    };
  }
  return ctx;
}

// Re-export types
export { SUPPORTED_LANGUAGES };
export type { LanguageCode };
