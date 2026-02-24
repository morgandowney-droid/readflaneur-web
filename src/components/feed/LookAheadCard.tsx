'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';

interface LookAheadCardProps {
  neighborhoodId: string;
  neighborhoodName: string;
  city?: string;
}

/**
 * Simple link to the most recent Look Ahead article for a neighborhood.
 * Renders below the Daily Brief card.
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
        if (cancelled) return;
        if (data.url) setUrl(data.url);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [neighborhoodId]);

  if (!url) return null;

  return (
    <div className="mt-3 px-4">
      <Link
        href={url}
        className="text-xs text-fg-muted hover:text-accent transition-colors"
      >
        {t('feed.lookAheadCta').replace('{name}', neighborhoodName)} &rsaquo;
      </Link>
    </div>
  );
}
