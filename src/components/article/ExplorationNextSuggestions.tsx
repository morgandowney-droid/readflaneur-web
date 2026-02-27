'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cleanArticleHeadline } from '@/lib/utils';

interface Suggestion {
  neighborhoodName: string;
  city: string;
  headline: string;
  teaser: string;
  url: string;
  imageUrl: string | null;
}

interface ExploreResponse {
  sameCity: Suggestion | null;
  sameTheme: Suggestion | null;
  geoHop: Suggestion | null;
}

interface ExplorationNextSuggestionsProps {
  neighborhoodId: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  categoryLabel?: string;
}

/** Get visited neighborhood IDs from sessionStorage cache keys */
function getVisitedIds(): string[] {
  try {
    const ids: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('flaneur-explore-')) {
        ids.push(key.replace('flaneur-explore-', ''));
      }
    }
    return ids;
  } catch { return []; }
}

export function ExplorationNextSuggestions({
  neighborhoodId,
  city,
  country,
  latitude,
  longitude,
  categoryLabel,
}: ExplorationNextSuggestionsProps) {
  const [data, setData] = useState<ExploreResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cacheKey = `flaneur-explore-${neighborhoodId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setData(JSON.parse(cached));
        setLoading(false);
        return;
      }
    } catch {}

    // Pass previously visited neighborhood IDs so API doesn't suggest them
    const visitedIds = getVisitedIds();
    const params = new URLSearchParams({
      neighborhoodId,
      city,
      country: country || '',
      lat: String(latitude || 0),
      lng: String(longitude || 0),
      category: categoryLabel || '',
    });
    if (visitedIds.length > 0) {
      params.set('exclude', visitedIds.join(','));
    }

    fetch(`/api/explore/next?${params}`)
      .then(res => res.json())
      .then((result: ExploreResponse) => {
        setData(result);
        setLoading(false);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(result)); } catch {}
      })
      .catch(() => setLoading(false));
  }, [neighborhoodId, city, country, latitude, longitude, categoryLabel]);

  if (loading) {
    return (
      <div className="mt-10 space-y-3">
        <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle">Keep exploring</p>
        <div className="h-40 bg-surface animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const suggestions: { label: string; suggestion: Suggestion }[] = [];

  if (data.sameCity) {
    suggestions.push({ label: `Also in ${data.sameCity.city}`, suggestion: data.sameCity });
  }
  if (data.sameTheme) {
    suggestions.push({ label: 'Elsewhere', suggestion: data.sameTheme });
  }
  if (data.geoHop) {
    suggestions.push({ label: `Meanwhile in ${data.geoHop.city}`, suggestion: data.geoHop });
  }

  if (suggestions.length === 0) return null;

  // Find the first suggestion with an image for the hero card
  const heroIdx = suggestions.findIndex(s => s.suggestion.imageUrl);
  const hero = heroIdx >= 0 ? suggestions[heroIdx] : null;
  const secondary = suggestions.filter((_, i) => i !== heroIdx);

  return (
    <div className="mt-10 mb-4 pt-8 border-t border-border">
      <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle mb-4">Keep exploring</p>

      {/* Hero card with image */}
      {hero ? (
        <Link href={hero.suggestion.url} className="block group mb-4">
          <div className="relative aspect-[2/1] md:aspect-[5/2] w-full rounded-xl overflow-hidden">
            <Image
              src={hero.suggestion.imageUrl!}
              alt={hero.suggestion.neighborhoodName}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              sizes="(max-width: 768px) 100vw, 672px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
              <p className="text-xs tracking-[0.15em] uppercase text-white/80 mb-1">
                {hero.suggestion.neighborhoodName} &middot; {hero.suggestion.city}
              </p>
              <p className="text-base md:text-lg font-light text-white leading-snug line-clamp-2" style={{ fontFamily: 'var(--font-body-serif, Georgia, serif)' }}>
                {cleanArticleHeadline(hero.suggestion.headline)}
              </p>
              <p className="text-sm text-white mt-3 group-hover:text-accent transition-colors tracking-wider uppercase font-medium">
                Continue exploring &rsaquo;
              </p>
            </div>
          </div>
        </Link>
      ) : (
        // No image available - render first suggestion as a styled card without photo
        <Link href={suggestions[0].suggestion.url} className="block group mb-4 p-4 rounded-xl bg-surface border border-border hover:border-border-strong transition-colors">
          <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle mb-1">
            {suggestions[0].label}
          </p>
          <p className="text-xs tracking-[0.15em] uppercase text-fg-muted mb-1">
            {suggestions[0].suggestion.neighborhoodName} &middot; {suggestions[0].suggestion.city}
          </p>
          <p className="text-base font-light text-fg leading-snug" style={{ fontFamily: 'var(--font-body-serif, Georgia, serif)' }}>
            {cleanArticleHeadline(suggestions[0].suggestion.headline)}
          </p>
          <p className="text-xs text-fg-subtle mt-2 group-hover:text-accent transition-colors">
            Continue exploring &rsaquo;
          </p>
        </Link>
      )}

      {/* Secondary suggestions with thumbnails */}
      {secondary.length > 0 && (
        <div className="space-y-3">
          {secondary.map(({ label, suggestion }) => (
            <Link
              key={suggestion.url}
              href={suggestion.url}
              className="flex items-center gap-3 group"
            >
              {suggestion.imageUrl ? (
                <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0">
                  <Image
                    src={suggestion.imageUrl}
                    alt={suggestion.neighborhoodName}
                    fill
                    className="object-cover"
                    sizes="32px"
                  />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-elevated shrink-0 flex items-center justify-center">
                  <span className="text-fg-subtle text-[10px]">&rarr;</span>
                </div>
              )}
              <div className="min-w-0 truncate">
                <span className="text-xs text-fg-subtle">{label}: </span>
                <span className="text-sm font-semibold text-fg group-hover:text-accent transition-colors">
                  {suggestion.neighborhoodName}
                </span>
                {suggestion.headline && (
                  <span className="text-sm text-fg-muted"> - {cleanArticleHeadline(suggestion.headline)}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
