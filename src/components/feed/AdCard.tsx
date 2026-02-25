'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Ad } from '@/types';
import { cn } from '@/lib/utils';

interface AdCardProps {
  ad: Ad;
  variant?: 'compact' | 'gallery';
}

export function AdCard({ ad, variant = 'gallery' }: AdCardProps) {
  const hasTrackedImpression = useRef(false);

  useEffect(() => {
    // Track impression once when ad is viewed
    if (!hasTrackedImpression.current) {
      hasTrackedImpression.current = true;
      fetch(`/api/ads/${ad.id}/impression`, { method: 'POST' }).catch(() => {
        // Ignore tracking errors
      });
    }
  }, [ad.id]);

  const handleClick = async () => {
    // Track click
    try {
      await fetch(`/api/ads/${ad.id}/click`, { method: 'POST' });
    } catch {
      // Ignore tracking errors
    }
    // Open URL
    window.open(ad.click_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <article
      className={cn(
        'overflow-hidden cursor-pointer transition-all',
        variant === 'gallery'
          ? 'bg-amber-950/30 border-2 border-amber-500/30 rounded-lg'
          : 'bg-surface'
      )}
      onClick={handleClick}
    >
      <div className="px-4 py-2">
        <span className={cn(
          'text-[10px] tracking-[0.2em] uppercase',
          variant === 'gallery' ? 'text-amber-600 font-medium' : 'text-fg-muted'
        )}>
          {ad.sponsor_label}
        </span>
      </div>
      <div className="relative aspect-video w-full overflow-hidden">
        <Image
          src={ad.image_url}
          alt={ad.headline}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 800px"
        />
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold overflow-hidden whitespace-nowrap">{ad.headline}</h3>
      </div>
    </article>
  );
}
