'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const PREFS_KEY = 'flaneur-neighborhood-preferences';
const REDIRECT_ATTEMPTED_KEY = 'flaneur-smart-redirect-attempted';

/**
 * SmartRedirect - auto-detects location for new users and redirects to feed.
 * Only runs when no localStorage preferences exist (returning users are
 * handled by the inline script in layout.tsx before React hydration).
 */
export function SmartRedirect() {
  const router = useRouter();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    // Skip if user already has preferences (inline script handles those)
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) {
      try {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids) && ids.length > 0) return;
      } catch { /* continue to detection */ }
    }

    // Skip if we already tried detection this session (prevents loops on failure)
    if (sessionStorage.getItem(REDIRECT_ATTEMPTED_KEY)) return;
    sessionStorage.setItem(REDIRECT_ATTEMPTED_KEY, '1');

    // Detect location and redirect
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch('/api/location/detect-and-match', { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error('Detection failed');
        return res.json();
      })
      .then(data => {
        if (!data.success || !data.neighborhoods?.length) return;

        const ids = data.neighborhoods.map((n: { id: string }) => n.id);
        localStorage.setItem(PREFS_KEY, JSON.stringify(ids));
        document.cookie = `flaneur-neighborhoods=${ids.join(',')};path=/;max-age=31536000;SameSite=Strict`;

        const welcomeCity = data.city || data.neighborhoods[0].city;
        router.replace(`/feed?welcome=${encodeURIComponent(welcomeCity)}`);
      })
      .catch(() => {
        // Silent fail - user sees normal homepage
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [router]);

  return null;
}
