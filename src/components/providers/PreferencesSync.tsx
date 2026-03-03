'use client';

import { useEffect } from 'react';

/**
 * One-time sync of theme/language preferences from DB when user is
 * authenticated but localStorage doesn't have them yet (new device,
 * cleared storage, OAuth login). Runs once per session.
 */
export function PreferencesSync() {
  useEffect(() => {
    // Only sync once per session
    if (sessionStorage.getItem('flaneur-prefs-synced')) return;

    // Only for authenticated users
    const auth = localStorage.getItem('flaneur-auth');
    if (!auth) return;

    // Check flaneur-profile cache (written by login page)
    const hasTheme = localStorage.getItem('flaneur-theme');
    const hasLanguage = localStorage.getItem('flaneur-language');

    if (!hasTheme || !hasLanguage) {
      // Fetch preferences from DB
      fetch('/api/preferences')
        .then(() => {}) // GET not implemented yet, use profile cache
        .catch(() => {});

      try {
        const profile = localStorage.getItem('flaneur-profile');
        if (profile) {
          const p = JSON.parse(profile);
          if (!hasTheme && (p.theme === 'light' || p.theme === 'dark')) {
            localStorage.setItem('flaneur-theme', p.theme);
            document.documentElement.setAttribute('data-theme', p.theme);
          }
          if (!hasLanguage && p.language && p.language !== 'en') {
            localStorage.setItem('flaneur-language', p.language);
            document.documentElement.lang = p.language;
            // Force re-render by dispatching storage event
            window.dispatchEvent(new StorageEvent('storage', { key: 'flaneur-language', newValue: p.language }));
          }
        }
      } catch { /* ignore */ }
    }

    // Timezone: detect from browser if profile has no timezone set
    try {
      const profile = localStorage.getItem('flaneur-profile');
      if (profile) {
        const p = JSON.parse(profile);
        if (!p.timezone) {
          const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (browserTz && browserTz !== 'UTC') {
            fetch('/api/preferences', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ timezone: browserTz }),
            }).catch(() => {});
            // Update local cache so modal shows it immediately
            p.timezone = browserTz;
            localStorage.setItem('flaneur-profile', JSON.stringify(p));
          }
        }
      }
    } catch { /* SSR or unavailable */ }

    sessionStorage.setItem('flaneur-prefs-synced', '1');
  }, []);

  return null;
}
