'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';
const DISMISSED_KEY = 'flaneur-email-prompt-dismissed';
const READS_KEY = 'flaneur-article-reads';
const PREFS_KEY = 'flaneur-neighborhood-preferences';

interface BriefDiscoveryFooterProps {
  neighborhoodId: string;
  neighborhoodName: string;
  city: string;
  currentArticleSlug: string;
  citySlug: string;
  neighborhoodSlug: string;
  publishedAt?: string;
}

/**
 * Unified discovery + engagement section at the bottom of daily brief articles.
 * Combines: yesterday's brief, add to neighborhoods, nearby brief,
 * "take me somewhere new", and inline email capture - all in one cohesive block.
 */
export function BriefDiscoveryFooter({
  neighborhoodId,
  neighborhoodName,
  city,
  publishedAt,
}: BriefDiscoveryFooterProps) {
  const [isSubscribed, setIsSubscribed] = useState(true);
  const [added, setAdded] = useState(false);
  const [nearbyDiscovery, setNearbyDiscovery] = useState<{ url: string; neighborhoodName: string } | null>(null);
  const [randomDiscovery, setRandomDiscovery] = useState<{ url: string; neighborhoodName: string } | null>(null);
  const [yesterdayUrl, setYesterdayUrl] = useState<string | null>(null);
  const [showEmailCapture, setShowEmailCapture] = useState(false);
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    try {
      // Check if neighborhood is in user's collection
      const stored = localStorage.getItem(PREFS_KEY);
      const subscribedIds = stored ? JSON.parse(stored) as string[] : [];
      setIsSubscribed(subscribedIds.includes(neighborhoodId));

      // Check email capture eligibility
      const isNewsletterSub = localStorage.getItem(SUBSCRIBED_KEY) === 'true';
      const isDismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
      const reads = parseInt(localStorage.getItem(READS_KEY) || '0', 10);
      if (!isNewsletterSub && !isDismissed && reads >= 3) {
        setShowEmailCapture(true);
      }

      // Exclude both subscribed neighborhoods AND the current one from discovery
      const excludeIds = [...new Set([...subscribedIds, neighborhoodId])];
      const params = new URLSearchParams();
      params.set('subscribedIds', excludeIds.join(','));
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

      // Fetch yesterday's brief article for this neighborhood (before this article's date)
      const yesterdayParams = new URLSearchParams({ neighborhoodId });
      if (publishedAt) yesterdayParams.set('beforeDate', publishedAt);
      fetch(`/api/briefs/yesterday?${yesterdayParams}`)
        .then(res => res.json())
        .then(data => { if (data.url) setYesterdayUrl(data.url); })
        .catch(() => {});
    } catch {
      // localStorage failure - silently skip
    }
  }, [neighborhoodId, city, publishedAt]);

  const handleAdd = () => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      const ids = stored ? JSON.parse(stored) as string[] : [];
      if (!ids.includes(neighborhoodId)) {
        ids.push(neighborhoodId);
        localStorage.setItem(PREFS_KEY, JSON.stringify(ids));
      }
      fetch('/api/neighborhoods/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neighborhoodId }),
      }).catch(() => {});
      setAdded(true);
      setIsSubscribed(true);
    } catch {}
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) { setEmailStatus('error'); return; }
    setEmailStatus('loading');
    try {
      let timezone: string | undefined;
      try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
      let neighborhoodIds: string[] = [];
      try { const p = localStorage.getItem(PREFS_KEY); if (p) neighborhoodIds = JSON.parse(p); } catch {}

      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, timezone, neighborhoodIds }),
      });
      if (res.ok) {
        setEmailStatus('success');
        try { localStorage.setItem(SUBSCRIBED_KEY, 'true'); } catch {}
      } else { setEmailStatus('error'); }
    } catch { setEmailStatus('error'); }
  };

  const hasDiscovery = yesterdayUrl || nearbyDiscovery || randomDiscovery;
  const hasAnything = hasDiscovery || !isSubscribed || showEmailCapture;
  if (!hasAnything) return null;

  return (
    <div className="mt-8 pt-6 border-t border-border">
      {/* Section header */}
      <p className="text-[10px] uppercase tracking-[0.2em] text-fg-subtle mb-4">Keep reading</p>

      <div className="space-y-2.5">
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
          <p className="text-sm text-accent">{neighborhoodName} added to your neighborhoods</p>
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
            className="block text-sm text-fg-muted hover:text-accent transition-colors"
          >
            Take me somewhere new &rsaquo;
          </Link>
        )}

        {/* Inline email capture - same block */}
        {showEmailCapture && emailStatus !== 'success' && (
          <form onSubmit={handleEmailSubmit} className="flex items-center gap-2 pt-1">
            <span className="text-sm text-fg-muted whitespace-nowrap">Get them emailed 7am daily</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              className="w-40 px-2.5 py-1 bg-surface border border-border-strong text-fg text-sm placeholder:text-fg-subtle focus:outline-none focus:border-amber-500 transition-colors"
              disabled={emailStatus === 'loading'}
            />
            <button
              type="submit"
              disabled={emailStatus === 'loading'}
              className="px-3 py-1 bg-fg text-canvas text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {emailStatus === 'loading' ? '...' : 'Go'}
            </button>
          </form>
        )}
        {emailStatus === 'success' && (
          <p className="text-sm text-accent pt-1">You&apos;re in - check your inbox.</p>
        )}
      </div>
    </div>
  );
}
