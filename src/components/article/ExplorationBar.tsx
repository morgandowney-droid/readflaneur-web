'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cleanArticleHeadline } from '@/lib/utils';

interface Suggestion {
  neighborhoodName: string;
  city: string;
  headline: string;
  url: string;
  imageUrl: string | null;
}

interface ExplorationBarProps {
  neighborhoodId: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  categoryLabel?: string;
  isExploring: boolean;
  trailCount?: number;
}

export function ExplorationBar({
  neighborhoodId,
  city,
  country,
  latitude,
  longitude,
  categoryLabel,
  isExploring,
  trailCount = 0,
}: ExplorationBarProps) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const markerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const scrollingDown = useRef(true);

  useEffect(() => {
    if (!isExploring) return;
    try {
      if (sessionStorage.getItem('flaneur-explore-bar-dismissed') === 'true') {
        setDismissed(true);
        return;
      }
    } catch {}

    // Reuse cached explore data from ExplorationNextSuggestions
    const cacheKey = `flaneur-explore-${neighborhoodId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        pickSuggestion(data);
        return;
      }
    } catch {}

    const params = new URLSearchParams({
      neighborhoodId,
      city,
      country: country || '',
      lat: String(latitude || 0),
      lng: String(longitude || 0),
      category: categoryLabel || '',
    });

    fetch(`/api/explore/next?${params}`)
      .then(res => res.json())
      .then(data => {
        pickSuggestion(data);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
      })
      .catch(() => {});
  }, [neighborhoodId, city, country, latitude, longitude, categoryLabel, isExploring]);

  const pickSuggestion = useCallback((data: Record<string, Suggestion | null>) => {
    // Prefer suggestion with image
    const withImage = [data.sameCity, data.sameTheme, data.geoHop].find(s => s?.imageUrl);
    const any = data.sameCity || data.sameTheme || data.geoHop;
    setSuggestion(withImage || any || null);
  }, []);

  // Intersection observer for 40% scroll trigger
  useEffect(() => {
    if (!isExploring || dismissed || !markerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0 }
    );
    observer.observe(markerRef.current);
    return () => observer.disconnect();
  }, [isExploring, dismissed]);

  // Hide on scroll-up, show on scroll-down
  useEffect(() => {
    if (!isExploring || dismissed) return;

    const handleScroll = () => {
      const y = window.scrollY;
      scrollingDown.current = y > lastScrollY.current;
      lastScrollY.current = y;
      // Only toggle visibility based on scroll direction when already triggered
      if (visible && !scrollingDown.current && y > 200) {
        setVisible(false);
      } else if (scrollingDown.current && suggestion) {
        // Re-check if past the marker
        if (markerRef.current) {
          const rect = markerRef.current.getBoundingClientRect();
          if (rect.top < window.innerHeight) setVisible(true);
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isExploring, dismissed, visible, suggestion]);

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
    try { sessionStorage.setItem('flaneur-explore-bar-dismissed', 'true'); } catch {}
  };

  if (!isExploring) return null;

  return (
    <>
      {/* Invisible marker at ~40% of article body */}
      <div
        ref={markerRef}
        className="absolute left-0 w-0 h-0 pointer-events-none"
        style={{ top: '40%' }}
        aria-hidden
      />

      {/* Sticky bottom bar */}
      {suggestion && !dismissed && (
        <div
          className={`fixed bottom-14 left-0 right-0 z-40 transition-transform duration-300 ease-out ${
            visible ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="bg-surface/90 backdrop-blur-md border-t border-border">
            <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
              {/* Thumbnail */}
              {suggestion.imageUrl ? (
                <Link href={suggestion.url} className="shrink-0">
                  <div className="relative w-10 h-10 rounded-full overflow-hidden">
                    <Image
                      src={suggestion.imageUrl}
                      alt={suggestion.neighborhoodName}
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  </div>
                </Link>
              ) : (
                <div className="w-10 h-10 rounded-full bg-elevated shrink-0 flex items-center justify-center">
                  <span className="text-fg-subtle text-xs">&rarr;</span>
                </div>
              )}

              {/* Info */}
              <Link href={suggestion.url} className="flex-1 min-w-0 group">
                <p className="text-[10px] tracking-[0.15em] uppercase text-fg-subtle truncate">
                  {suggestion.neighborhoodName} &middot; {suggestion.city}
                </p>
                <p className="text-sm text-fg truncate group-hover:text-accent transition-colors" style={{ fontFamily: 'var(--font-body-serif, Georgia, serif)' }}>
                  {cleanArticleHeadline(suggestion.headline)}
                </p>
              </Link>

              {/* Trail count + Next button */}
              <div className="shrink-0 flex items-center gap-2">
                {trailCount > 1 && (
                  <span className="text-[10px] tracking-wider text-fg-subtle uppercase hidden sm:inline">
                    {trailCount} visited
                  </span>
                )}
                <Link
                  href={suggestion.url}
                  className="text-xs tracking-wider uppercase font-medium text-accent hover:text-fg transition-colors"
                >
                  Next &rsaquo;
                </Link>
              </div>

              {/* Dismiss */}
              <button
                onClick={handleDismiss}
                className="shrink-0 text-fg-subtle hover:text-fg transition-colors p-1"
                aria-label="Dismiss exploration bar"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
