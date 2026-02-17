'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

export function HomepageEnterButton() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const attempted = useRef(false);

  const handleEnter = async () => {
    if (attempted.current) return;
    attempted.current = true;
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch('/api/location/detect-and-match', {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error('Detection failed');
      const data = await res.json();

      if (data.success && data.neighborhoods?.length) {
        const ids = data.neighborhoods.map((n: { id: string }) => n.id);
        localStorage.setItem(PREFS_KEY, JSON.stringify(ids));
        const welcomeCity = data.city || data.neighborhoods[0].city;
        router.push(
          `/feed?neighborhoods=${ids.join(',')}&welcome=${encodeURIComponent(welcomeCity)}`
        );
        return;
      }
    } catch {
      // Silent fail - go to feed without geo data
    }

    attempted.current = false;
    setLoading(false);
    router.push('/feed');
  };

  return (
    <button
      onClick={handleEnter}
      disabled={loading}
      className="btn-secondary mt-10"
    >
      {loading ? '...' : t('homepage.readStories')}
    </button>
  );
}
