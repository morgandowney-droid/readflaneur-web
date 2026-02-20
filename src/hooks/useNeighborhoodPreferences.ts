'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

const PREFS_KEY = 'flaneur-neighborhood-preferences';
const COOKIE_KEY = 'flaneur-neighborhoods';

/** Write IDs to both localStorage and cookie */
function syncLocal(ids: string[]) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(ids));
  document.cookie = `${COOKIE_KEY}=${ids.join(',')};path=/;max-age=31536000;SameSite=Strict`;
}

export interface NeighborhoodPref {
  id: string;
  name: string;
  city: string;
}

export function useNeighborhoodPreferences(): {
  neighborhoods: NeighborhoodPref[];
  primaryId: string | null;
  isLoading: boolean;
  setPrimary: (id: string) => void;
} {
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodPref[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const lastSyncRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    /** Load neighborhood details from IDs in localStorage */
    async function loadFromLocal() {
      const stored = localStorage.getItem(PREFS_KEY);
      if (!stored) {
        setNeighborhoods([]);
        setIsLoading(false);
        return;
      }

      let ids: string[];
      try {
        ids = JSON.parse(stored) as string[];
      } catch {
        setIsLoading(false);
        return;
      }

      if (!ids.length) {
        setNeighborhoods([]);
        setIsLoading(false);
        return;
      }

      const { data } = await Promise.resolve(
        supabase
          .from('neighborhoods')
          .select('id, name, city')
          .in('id', ids)
      ).catch(() => ({ data: null }));

      if (cancelled) return;

      if (data) {
        const orderMap = new Map(ids.map((id, i) => [id, i]));
        const sorted = [...data].sort(
          (a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999)
        );
        setNeighborhoods(sorted);
      }
      setIsLoading(false);
    }

    /** Fetch DB prefs for authenticated user, overwrite localStorage, then loadFromLocal */
    async function syncFromDb() {
      // Throttle DB calls: at most once per 30s. Still calls loadFromLocal when throttled.
      const now = Date.now();
      if (now - lastSyncRef.current < 30_000) {
        if (!cancelled) await loadFromLocal();
        return;
      }
      lastSyncRef.current = now;

      try {
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ]);

        if (session?.user) {
          const { data: dbPrefs } = await Promise.resolve(
            supabase
              .from('user_neighborhood_preferences')
              .select('neighborhood_id, sort_order')
              .order('sort_order', { ascending: true })
          ).catch(() => ({ data: null }));

          if (cancelled) return;

          if (dbPrefs && dbPrefs.length > 0) {
            const dbIds = dbPrefs.map(p => p.neighborhood_id);
            syncLocal(dbIds);
          } else if (dbPrefs) {
            // DB is empty - clear local too (user removed all on another device)
            localStorage.removeItem(PREFS_KEY);
            document.cookie = `${COOKIE_KEY}=;path=/;max-age=0;SameSite=Strict`;
          }
        }
      } catch {
        // Auth timeout or DB error - fall through to localStorage
      }

      if (!cancelled) await loadFromLocal();
    }

    // Initial load: DB sync (if logged in) then loadFromLocal
    syncFromDb();

    // Re-sync from DB when tab becomes visible (cross-device changes)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncFromDb();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Re-read on cross-tab storage changes (same device, different tab)
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFS_KEY) {
        loadFromLocal();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const primaryId = neighborhoods.length > 0 ? neighborhoods[0].id : null;

  const setPrimary = useCallback((id: string) => {
    const stored = localStorage.getItem(PREFS_KEY);
    if (!stored) return;

    try {
      const ids = JSON.parse(stored) as string[];
      if (!ids.includes(id)) return;

      // Move id to front
      const reordered = [id, ...ids.filter(i => i !== id)];
      syncLocal(reordered);

      // Sync to DB for email scheduler (fire-and-forget)
      fetch('/api/location/sync-primary-neighborhood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neighborhoodId: id }),
      }).catch(() => {});

      // Reorder in-memory list to match
      setNeighborhoods(prev => {
        const target = prev.find(n => n.id === id);
        if (!target) return prev;
        return [target, ...prev.filter(n => n.id !== id)];
      });
    } catch {
      // ignore
    }
  }, []);

  return { neighborhoods, primaryId, isLoading, setPrimary };
}
