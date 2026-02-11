'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

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

  useEffect(() => {
    let cancelled = false;

    async function load() {
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

      const supabase = createClient();
      const { data } = await Promise.resolve(
        supabase
          .from('neighborhoods')
          .select('id, name, city')
          .in('id', ids)
      ).catch(() => ({ data: null }));

      if (cancelled) return;

      if (data) {
        // Sort to match localStorage order (first = primary)
        const orderMap = new Map(ids.map((id, i) => [id, i]));
        const sorted = [...data].sort(
          (a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999)
        );
        setNeighborhoods(sorted);
      }
      setIsLoading(false);
    }

    load();

    // Re-read on cross-tab storage changes
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFS_KEY) {
        load();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
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
      localStorage.setItem(PREFS_KEY, JSON.stringify(reordered));

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
