'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Suggestion {
  neighborhoodName: string;
  city: string;
  headline: string;
  teaser: string;
  url: string;
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
      })
      .catch(() => setLoading(false));
  }, [neighborhoodId, city, country, latitude, longitude, categoryLabel]);

  if (loading) {
    return (
      <div className="mt-8 space-y-3">
        <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle">Keep exploring</p>
        {[0, 1, 2].map(i => (
          <div key={i} className="h-4 bg-surface animate-pulse rounded w-3/4" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const suggestions: { label: string; suggestion: Suggestion }[] = [];

  if (data.sameCity) {
    suggestions.push({
      label: `Also in ${data.sameCity.city}`,
      suggestion: data.sameCity,
    });
  }

  if (data.sameTheme) {
    suggestions.push({
      label: `Elsewhere`,
      suggestion: data.sameTheme,
    });
  }

  if (data.geoHop) {
    suggestions.push({
      label: `Meanwhile in ${data.geoHop.city}`,
      suggestion: data.geoHop,
    });
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-8 mb-4">
      <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle mb-4">Keep exploring</p>
      <div className="space-y-3">
        {suggestions.map(({ label, suggestion }) => (
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
              <span className="text-sm text-fg-muted"> - {suggestion.headline}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
