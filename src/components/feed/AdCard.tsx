'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Ad } from '@/types';

interface AdCardProps {
  ad: Ad;
}

export function AdCard({ ad }: AdCardProps) {
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
      className="bg-white overflow-hidden cursor-pointer"
      onClick={handleClick}
    >
      <div className="px-4 py-2">
        <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-400">
          {ad.sponsor_label}
        </span>
      </div>
      <div className="relative aspect-video w-full">
        <Image
          src={ad.image_url}
          alt={ad.headline}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 800px"
        />
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold">{ad.headline}</h3>
      </div>
    </article>
  );
}
