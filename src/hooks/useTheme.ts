'use client';

import { useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light';
const STORAGE_KEY = 'flaneur-theme';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // localStorage unavailable
    }
    document.documentElement.setAttribute('data-theme', t);
    // Fire-and-forget sync to DB for cross-device persistence
    try {
      fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: t }),
      }).catch(() => {});
    } catch { /* ignore */ }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
