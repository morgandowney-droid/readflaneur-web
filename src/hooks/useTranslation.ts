'use client';

import { useCallback } from 'react';
import { useLanguageContext } from '@/components/providers/LanguageProvider';
import { t as translate } from '@/lib/translations';

/** Convenience hook: `const { t, language, isTranslated } = useTranslation()` */
export function useTranslation() {
  const { language, isTranslated } = useLanguageContext();

  const t = useCallback(
    (key: string) => translate(key, language),
    [language]
  );

  return { t, language, isTranslated };
}
