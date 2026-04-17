'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';

export function HomepageEnterButton() {
  const router = useRouter();
  const { t } = useTranslation();

  const handleClick = () => {
    try {
      const stored = localStorage.getItem('flaneur-neighborhood-preferences');
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids) && ids.length > 0) {
          router.push('/feed');
          return;
        }
      }
    } catch { /* ignore */ }
    router.push('/onboard');
  };

  return (
    <button
      onClick={handleClick}
      className="btn-secondary mt-10"
    >
      {t('homepage.readStories')}
    </button>
  );
}
