'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

export interface NeighborhoodPref {
  id: string;
  name: string;
  city: string;
}

export function useNeighborhoodPreferences(): {
  neighborhoods: NeighborhoodPref[];
  isLoading: boolean;
} {
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodPref[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const stored = localStorage.getItem(PREFS_KEY);
      if (!stored) {
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
        // Sort to match localStorage order
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

  return { neighborhoods, isLoading };
}
