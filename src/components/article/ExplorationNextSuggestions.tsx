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
    <div className="mt-10 mb-4">
      <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle mb-4">Keep exploring</p>

      {/* Hero card with image */}
      {hero ? (
        <Link href={hero.suggestion.url} className="block group mb-4">
          <div className="relative aspect-[3/1] w-full rounded-xl overflow-hidden">
            <Image
              src={hero.suggestion.imageUrl!}
              alt={hero.suggestion.neighborhoodName}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              sizes="(max-width: 768px) 100vw, 672px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
              <p className="text-[10px] tracking-[0.2em] uppercase text-white/60 mb-1">
                {hero.label}
              </p>
              <p className="text-xs tracking-[0.15em] uppercase text-white/80 mb-1">
                {hero.suggestion.neighborhoodName} &middot; {hero.suggestion.city}
              </p>
              <p className="text-base md:text-lg font-light text-white leading-snug line-clamp-2" style={{ fontFamily: 'var(--font-body-serif, Georgia, serif)' }}>
                {cleanArticleHeadline(hero.suggestion.headline)}
              </p>
              <p className="text-xs text-white/50 mt-2 group-hover:text-white/70 transition-colors">
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

      {/* Secondary text links */}
      {secondary.length > 0 && (
        <div className="space-y-2">
          {secondary.map(({ label, suggestion }) => (
            <Link
              key={suggestion.url}
              href={suggestion.url}
              className="block group"
            >
              <span className="text-xs text-fg-subtle">{label}: </span>
              <span className="text-sm font-semibold text-fg group-hover:text-accent transition-colors">
                {suggestion.neighborhoodName}
              </span>
              {suggestion.headline && (
                <span className="text-sm text-fg-muted"> - {cleanArticleHeadline(suggestion.headline)}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
