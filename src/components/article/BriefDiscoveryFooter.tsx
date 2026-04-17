'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface NearbyNeighborhood {
  neighborhoodName: string;
  city: string;
  headline: string;
  url: string;
}

interface BriefDiscoveryFooterProps {
  neighborhoodId: string;
  neighborhoodName: string;
  city: string;
  currentArticleSlug: string;
  citySlug: string;
  neighborhoodSlug: string;
  publishedAt?: string;
  /** 'daily' = Daily Brief article (default), 'sunday' = Sunday Edition article, 'look_ahead' = Look Ahead article */
  variant?: 'daily' | 'sunday' | 'look_ahead';
}

/**
 * Discovery section at the bottom of brief articles.
 * Shows yesterday's brief, Look Ahead link, and 2 nearest neighborhoods.
 */
export function BriefDiscoveryFooter({
  neighborhoodId,
  neighborhoodName,
  publishedAt,
  variant = 'daily',
}: BriefDiscoveryFooterProps) {
  const [yesterdayUrl, setYesterdayUrl] = useState<string | null>(null);
  const [lookAheadUrl, setLookAheadUrl] = useState<string | null>(null);
  const [nearbyNeighborhoods, setNearbyNeighborhoods] = useState<NearbyNeighborhood[]>([]);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    try {
      // Fetch a related daily brief for this neighborhood
      const briefParams = new URLSearchParams({ neighborhoodId });
      if (variant === 'daily' && publishedAt) {
        briefParams.set('beforeDate', publishedAt);
      }
      fetch(`/api/briefs/yesterday?${briefParams}`)
        .then(res => res.json())
        .then(data => { if (data.url) setYesterdayUrl(data.url); })
        .catch(() => {});

      // Fetch Look Ahead article
      fetch(`/api/briefs/look-ahead?neighborhoodId=${encodeURIComponent(neighborhoodId)}`)
        .then(res => res.json())
        .then(data => { if (data.url) setLookAheadUrl(data.url); })
        .catch(() => {});

      // Fetch nearest neighborhoods with recent briefs
      fetch(`/api/explore/next?neighborhoodId=${encodeURIComponent(neighborhoodId)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data) return;
          const nearby: NearbyNeighborhood[] = [];
          if (data.sameCity) nearby.push({
            neighborhoodName: data.sameCity.neighborhoodName,
            city: data.sameCity.city,
            headline: data.sameCity.headline,
            url: data.sameCity.url.replace('?explore=true', ''),
          });
          if (data.geoHop) nearby.push({
            neighborhoodName: data.geoHop.neighborhoodName,
            city: data.geoHop.city,
            headline: data.geoHop.headline,
            url: data.geoHop.url.replace('?explore=true', ''),
          });
          if (nearby.length > 0) setNearbyNeighborhoods(nearby);
        })
        .catch(() => {});
    } catch {
      // fetch failure - silently skip
    }
  }, [neighborhoodId, publishedAt, variant]);

  const hasAnything = yesterdayUrl || lookAheadUrl || nearbyNeighborhoods.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="mt-8 pt-6 border-t border-border">
      {/* Section header */}
      <p className="text-[10px] uppercase tracking-[0.2em] text-fg-subtle mb-4">Keep reading</p>

      <div className="space-y-2.5">
        {/* Look Ahead link (skip if we're already on a Look Ahead article) */}
        {lookAheadUrl && variant !== 'look_ahead' && (
          <Link
            href={lookAheadUrl}
            className="block text-sm text-fg-muted hover:text-accent transition-colors"
          >
            Read the Look Ahead (next 7 days) for <span className="font-semibold text-fg">{neighborhoodName}</span> &rsaquo;
          </Link>
        )}

        {/* Daily brief link */}
        {yesterdayUrl && (
          <Link
            href={yesterdayUrl}
            className="block text-sm text-fg-muted hover:text-accent transition-colors"
          >
            {variant === 'daily'
              ? <>Read yesterday&apos;s <span className="font-semibold text-fg">{neighborhoodName}</span> Daily Brief &rsaquo;</>
              : <>Read today&apos;s <span className="font-semibold text-fg">{neighborhoodName}</span> Daily Brief &rsaquo;</>
            }
          </Link>
        )}

        {/* Nearby neighborhoods */}
        {nearbyNeighborhoods.map((n) => (
          <Link
            key={n.url}
            href={n.url}
            className="block text-sm text-fg-muted hover:text-accent transition-colors"
          >
            Read today&apos;s <span className="font-semibold text-fg">{n.neighborhoodName}</span> Daily Brief &rsaquo;
          </Link>
        ))}
      </div>
    </div>
  );
}
