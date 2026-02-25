'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Ad } from '@/types';

interface StoryOpenAdProps {
  ad: Ad;
  position: 'top' | 'bottom';
}

export function StoryOpenAd({ ad, position }: StoryOpenAdProps) {
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
    <div
      className="bg-surface border border-border overflow-hidden cursor-pointer hover:border-border-strong transition-colors rounded-xl"
      onClick={handleClick}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Image */}
        <div className="relative w-full sm:w-48 aspect-video sm:aspect-square flex-shrink-0">
          <Image
            src={ad.image_url}
            alt={ad.headline}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 192px"
          />
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col justify-center">
          <span className="text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-2">
            {ad.sponsor_label}
          </span>
          <h3 className="font-medium text-lg leading-tight mb-2">
            {ad.headline}
          </h3>
          <span className="text-xs tracking-widest uppercase text-fg-subtle hover:text-fg">
            Learn More &rarr;
          </span>
        </div>
      </div>
    </div>
  );
}
