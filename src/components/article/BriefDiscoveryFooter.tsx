'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

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
 * Simplified discovery section at the bottom of brief articles.
 * Shows yesterday's brief link and Look Ahead link only.
 * Discovery CTAs (nearby, random, add-to-neighborhoods, email capture)
 * are now handled by ExplorationNextSuggestions component.
 */
export function BriefDiscoveryFooter({
  neighborhoodId,
  neighborhoodName,
  publishedAt,
  variant = 'daily',
}: BriefDiscoveryFooterProps) {
  const [yesterdayUrl, setYesterdayUrl] = useState<string | null>(null);
  const [lookAheadUrl, setLookAheadUrl] = useState<string | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    try {
      // Fetch a related daily brief for this neighborhood
      // Daily variant: yesterday's brief (before this article's date)
      // Look Ahead / Sunday variant: today's/most recent daily brief (no beforeDate constraint)
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
    } catch {
      // localStorage failure - silently skip
    }
  }, [neighborhoodId, publishedAt, variant]);

  const hasAnything = yesterdayUrl || lookAheadUrl;
  if (!hasAnything) return null;

  return (
    <div className="mt-8 pt-6 border-t border-border">
      {/* Section header */}
      <p className="text-[10px] uppercase tracking-[0.2em] text-fg-subtle mb-4">Keep reading</p>

      <div className="space-y-2.5">
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

        {/* Look Ahead link (skip if we're already on a Look Ahead article) */}
        {lookAheadUrl && variant !== 'look_ahead' && (
          <Link
            href={lookAheadUrl}
            className="block text-sm text-fg-muted hover:text-accent transition-colors"
          >
            Read the Look Ahead (next 7 days) for <span className="font-semibold text-fg">{neighborhoodName}</span> &rsaquo;
          </Link>
        )}
      </div>
    </div>
  );
}
