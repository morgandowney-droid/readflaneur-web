'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

interface LookAheadCardProps {
  neighborhoodId: string;
  neighborhoodName: string;
}

/**
 * Compact card linking to the Look Ahead article.
 * Self-fetching: renders nothing if no Look Ahead exists.
 */
export function LookAheadCard({ neighborhoodId, neighborhoodName }: LookAheadCardProps) {
  const [url, setUrl] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!neighborhoodId) return;
    let cancelled = false;

    fetch(`/api/briefs/look-ahead?neighborhoodId=${encodeURIComponent(neighborhoodId)}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.url) setUrl(data.url);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [neighborhoodId]);

  if (!url) return null;

  return (
    <div className="bg-surface border-l-2 border-amber-500/20 p-4 mt-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-fg-subtle mb-1">
        {t('feed.lookAhead')}
      </p>
      <Link
        href={url}
        className="text-sm text-fg-muted hover:text-accent transition-colors"
      >
        {t('feed.lookAheadCta').replace('{name}', neighborhoodName)} &rsaquo;
      </Link>
    </div>
  );
}
