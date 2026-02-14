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
}

/**
 * Discovery CTAs at the bottom of daily brief article pages.
 * Shows: yesterday's brief, add to neighborhoods (if not subscribed),
 * nearby brief, and "take me somewhere new".
 */
export function BriefDiscoveryFooter({
  neighborhoodId,
  neighborhoodName,
  city,
  currentArticleSlug,
  citySlug,
  neighborhoodSlug,
}: BriefDiscoveryFooterProps) {
  const [isSubscribed, setIsSubscribed] = useState(true);
  const [added, setAdded] = useState(false);
  const [nearbyDiscovery, setNearbyDiscovery] = useState<{ url: string; neighborhoodName: string } | null>(null);
  const [randomDiscovery, setRandomDiscovery] = useState<{ url: string; neighborhoodName: string } | null>(null);
  const [yesterdayUrl, setYesterdayUrl] = useState<string | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    try {
      // Check if neighborhood is in user's collection
      const stored = localStorage.getItem('flaneur-neighborhood-preferences');
      const subscribedIds = stored ? JSON.parse(stored) as string[] : [];
      setIsSubscribed(subscribedIds.includes(neighborhoodId));

      const params = new URLSearchParams();
      if (subscribedIds.length > 0) params.set('subscribedIds', subscribedIds.join(','));
      params.set('referenceId', neighborhoodId);

      // Fetch nearby discovery
      const nearbyParams = new URLSearchParams(params);
      nearbyParams.set('mode', 'nearby');
      fetch(`/api/discover-neighborhood?${nearbyParams}`)
        .then(res => res.json())
        .then(data => { if (data.neighborhoodName) setNearbyDiscovery(data); })
        .catch(() => {});

      // Fetch random discovery (different city)
      const randomParams = new URLSearchParams(params);
      randomParams.set('mode', 'random');
      if (city) randomParams.set('excludeCity', city);
      fetch(`/api/discover-neighborhood?${randomParams}`)
        .then(res => res.json())
        .then(data => { if (data.neighborhoodName) setRandomDiscovery(data); })
        .catch(() => {});

      // Fetch yesterday's brief article for this neighborhood
      fetch(`/api/briefs/yesterday?neighborhoodId=${neighborhoodId}&excludeSlug=${currentArticleSlug}`)
        .then(res => res.json())
        .then(data => { if (data.url) setYesterdayUrl(data.url); })
        .catch(() => {});
    } catch {
      // localStorage failure - silently skip
    }
  }, [neighborhoodId, city, currentArticleSlug]);

  const handleAdd = () => {
    try {
      const stored = localStorage.getItem('flaneur-neighborhood-preferences');
      const ids = stored ? JSON.parse(stored) as string[] : [];
      if (!ids.includes(neighborhoodId)) {
        ids.push(neighborhoodId);
        localStorage.setItem('flaneur-neighborhood-preferences', JSON.stringify(ids));
      }
      // Fire-and-forget DB sync
      fetch('/api/neighborhoods/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neighborhoodId }),
      }).catch(() => {});
      setAdded(true);
      setIsSubscribed(true);
    } catch {
      // localStorage failure
    }
  };

  const hasAnything = yesterdayUrl || !isSubscribed || nearbyDiscovery || randomDiscovery;
  if (!hasAnything) return null;

  return (
    <div className="mt-8 pt-6 border-t border-border space-y-3">
      {/* Yesterday's brief */}
      {yesterdayUrl && (
        <Link
          href={yesterdayUrl}
          className="block text-sm text-fg-muted hover:text-accent transition-colors"
        >
          Read yesterday&apos;s <span className="font-semibold text-fg">{neighborhoodName}</span> Daily Brief &rsaquo;
        </Link>
      )}

      {/* Add to neighborhoods */}
      {!isSubscribed && !added && (
        <button
          onClick={handleAdd}
          className="block text-sm text-fg-muted hover:text-accent transition-colors"
        >
          Add <span className="font-semibold text-fg">{neighborhoodName}</span> to my neighborhoods
        </button>
      )}
      {added && (
        <p className="text-sm text-accent">
          {neighborhoodName} added to your neighborhoods
        </p>
      )}

      {/* Nearby brief */}
      {nearbyDiscovery && (
        <Link
          href={nearbyDiscovery.url}
          className="block text-sm text-fg-muted hover:text-accent transition-colors"
        >
          Read today&apos;s nearby <span className="font-semibold text-fg">{nearbyDiscovery.neighborhoodName}</span> Daily Brief &rsaquo;
        </Link>
      )}

      {/* Somewhere new */}
      {randomDiscovery && (
        <Link
          href={randomDiscovery.url}
          className="block text-sm text-fg-muted hover:text-accent transition-colors mt-1.5"
        >
          Take me somewhere new &rsaquo;
        </Link>
      )}
    </div>
  );
}
