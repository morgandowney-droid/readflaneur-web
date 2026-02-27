'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { BentoSection } from '@/components/feed/BentoGrid';
import { BentoCardProps } from '@/components/feed/BentoCard';
import { BENTO_REGIONS } from '@/lib/region-utils';
import { syncNeighborhoodCookie } from '@/lib/neighborhood-cookie';
import type { DiscoveryBrief, DiscoveryBriefsResponse } from '@/app/api/feed/discovery-briefs/route';

const BENTO_CACHE_KEY = 'flaneur-bento-cache';

const REGION_LABELS: Record<string, { label: string; key: string }> = {
  'asia-pacific': { label: 'Asia & Pacific', key: 'bento.asiaPacific' },
  'europe': { label: 'Europe', key: 'bento.europe' },
  'americas': { label: 'The Americas', key: 'bento.americas' },
};

interface UseDiscoveryBriefsOptions {
  /** Skip fetch entirely */
  skip?: boolean;
  /** Build extra sections (e.g. "Your Neighborhoods" from local data) */
  buildUserSection?: () => BentoSection | null;
}

interface UseDiscoveryBriefsResult {
  sections: BentoSection[] | null;
  isLoading: boolean;
  refresh: () => void;
}

/**
 * Shared hook for fetching discovery briefs with sessionStorage caching.
 * Used by MultiFeed (desktop bento + mobile) and single-neighborhood pages.
 */
export function useDiscoveryBriefs(
  subscribedIds: string[],
  options?: UseDiscoveryBriefsOptions
): UseDiscoveryBriefsResult {
  const [sections, setSections] = useState<BentoSection[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef(false);

  const handleAdd = useCallback((neighborhoodId: string) => {
    try {
      const stored = localStorage.getItem('flaneur-neighborhood-preferences');
      const ids: string[] = stored ? JSON.parse(stored) : [];
      if (!ids.includes(neighborhoodId)) {
        ids.push(neighborhoodId);
        localStorage.setItem('flaneur-neighborhood-preferences', JSON.stringify(ids));
        syncNeighborhoodCookie();
      }
    } catch { /* SSR or private browsing */ }
    fetch('/api/neighborhoods/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ neighborhoodId }),
    }).catch(() => {});
  }, []);

  const buildSections = useCallback((data: DiscoveryBriefsResponse): BentoSection[] => {
    const result: BentoSection[] = [];

    // Optionally prepend user section
    if (options?.buildUserSection) {
      const userSection = options.buildUserSection();
      if (userSection) result.push(userSection);
    }

    // Discovery regions
    for (const { key } of BENTO_REGIONS) {
      const briefs: DiscoveryBrief[] = data.regions?.[key] || [];
      if (briefs.length === 0) continue;
      const cards: BentoCardProps[] = briefs.map(b => ({
        headline: b.headline,
        blurb: b.previewText,
        imageUrl: b.imageUrl,
        neighborhoodName: b.neighborhoodName,
        neighborhoodId: b.neighborhoodId,
        city: b.city,
        slug: b.slug,
        citySlug: b.citySlug,
        neighborhoodSlug: b.neighborhoodSlug,
        size: 'standard' as const,
        onAdd: handleAdd,
      }));
      result.push({
        label: REGION_LABELS[key]?.label || key,
        translationKey: REGION_LABELS[key]?.key || key,
        cards,
      });
    }

    return result;
  }, [handleAdd, options?.buildUserSection]); // eslint-disable-line react-hooks/exhaustive-deps

  const reattachCallbacks = useCallback((cached: BentoSection[]) => {
    for (const section of cached) {
      if (section.translationKey !== 'bento.yourNeighborhoods') {
        for (const card of section.cards) {
          card.onAdd = handleAdd;
        }
      }
    }
  }, [handleAdd]);

  const refresh = useCallback(() => {
    try { sessionStorage.removeItem(BENTO_CACHE_KEY); } catch {}
    fetchedRef.current = false;
    setIsLoading(true);

    const idsParam = subscribedIds.join(',');
    fetch(`/api/feed/discovery-briefs?subscribedIds=${encodeURIComponent(idsParam)}&count=3&_t=${Date.now()}`)
      .then(res => res.json())
      .then((data: DiscoveryBriefsResponse) => {
        const built = buildSections(data);
        setSections(built);
        try {
          const cacheData = built.map(s => ({
            ...s,
            cards: s.cards.map(({ onAdd: _, ...card }) => card),
          }));
          sessionStorage.setItem(BENTO_CACHE_KEY, JSON.stringify(cacheData));
        } catch {}
        setIsLoading(false);
        fetchedRef.current = true;
      })
      .catch(() => {
        setIsLoading(false);
        fetchedRef.current = true;
      });
  }, [subscribedIds, buildSections]);

  useEffect(() => {
    if (fetchedRef.current) return;
    if (options?.skip) return;
    if (subscribedIds.length === 0) return;

    fetchedRef.current = true;

    // Check session cache first
    try {
      const cached = sessionStorage.getItem(BENTO_CACHE_KEY);
      if (cached) {
        const cachedSections: BentoSection[] = JSON.parse(cached);
        reattachCallbacks(cachedSections);
        setSections(cachedSections);
        return;
      }
    } catch {}

    setIsLoading(true);
    const idsParam = subscribedIds.join(',');
    fetch(`/api/feed/discovery-briefs?subscribedIds=${encodeURIComponent(idsParam)}&count=3`)
      .then(res => res.json())
      .then((data: DiscoveryBriefsResponse) => {
        const built = buildSections(data);
        setSections(built);
        try {
          const cacheData = built.map(s => ({
            ...s,
            cards: s.cards.map(({ onAdd: _, ...card }) => card),
          }));
          sessionStorage.setItem(BENTO_CACHE_KEY, JSON.stringify(cacheData));
        } catch {}
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [subscribedIds, options?.skip, buildSections, reattachCallbacks]); // eslint-disable-line react-hooks/exhaustive-deps

  return { sections, isLoading, refresh };
}
