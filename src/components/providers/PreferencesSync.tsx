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

    // Skip if user already has both preferences set locally
    const hasTheme = localStorage.getItem('flaneur-theme');
    const hasLanguage = localStorage.getItem('flaneur-language');
    if (hasTheme && hasLanguage) {
      sessionStorage.setItem('flaneur-prefs-synced', '1');
      return;
    }

    // Fetch preferences from DB
    fetch('/api/preferences')
      .then(() => {}) // GET not implemented yet, use profile cache
      .catch(() => {});

    // Check flaneur-profile cache (written by login page)
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

    sessionStorage.setItem('flaneur-prefs-synced', '1');
  }, []);

  return null;
}
