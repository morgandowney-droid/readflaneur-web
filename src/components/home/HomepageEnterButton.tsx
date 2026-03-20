'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';

export function HomepageEnterButton() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <button
      onClick={() => router.push('/onboard')}
      className="btn-secondary mt-10"
    >
      {t('homepage.readStories')}
    </button>
  );
}
