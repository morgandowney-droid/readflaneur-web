'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cleanArticleHeadline } from '@/lib/utils';

interface MobileDiscoveryCardProps {
  headline: string;
  imageUrl: string;
  neighborhoodName: string;
  neighborhoodId: string;
  city: string;
  slug: string;
  citySlug: string;
  neighborhoodSlug: string;
  onAdd?: (neighborhoodId: string) => void;
  onRemove?: (neighborhoodId: string) => void;
}

export function MobileDiscoveryCard({
  headline,
  imageUrl,
  neighborhoodName,
  neighborhoodId,
  city,
  slug,
  citySlug,
  neighborhoodSlug,
  onAdd,
  onRemove,
}: MobileDiscoveryCardProps) {
  const [added, setAdded] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const href = `/${citySlug}/${neighborhoodSlug}/${slug}?explore=true`;

  // Check if already in user's neighborhoods on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('flaneur-neighborhood-preferences');
      const ids: string[] = stored ? JSON.parse(stored) : [];
      if (ids.includes(neighborhoodId)) setAdded(true);
    } catch {}
  }, [neighborhoodId]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (added) {
      onRemove?.(neighborhoodId);
      setAdded(false);
      setFeedback('Removed');
    } else {
      onAdd?.(neighborhoodId);
      setAdded(true);
      setFeedback('Added to feed');
    }
    setTimeout(() => setFeedback(null), 2000);
  };

  return (
    <Link href={href} className="block aspect-[4/3] rounded-xl overflow-hidden relative group">
      <Image
        src={imageUrl}
        alt={`${neighborhoodName}, ${city}`}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 50vw, 200px"
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-[9px] tracking-[0.2em] uppercase text-neutral-300 mb-0.5">
          {neighborhoodName} <span className="text-neutral-500">&middot; {city}</span>
        </p>
        <p className="text-sm font-semibold text-white line-clamp-2 leading-snug" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          {cleanArticleHeadline(headline)}
        </p>
      </div>

      {/* Subscribe toggle button */}
      {(onAdd || onRemove) && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          {feedback && (
            <span className="text-[10px] text-white bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 animate-fade-in">
              {feedback}
            </span>
          )}
          <button
            onClick={handleToggle}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-sm transition-colors ${
              added ? 'bg-green-600/60 backdrop-blur-sm' : 'bg-black/50 backdrop-blur-sm active:bg-black/70'
            }`}
            aria-label={added ? `Remove ${neighborhoodName} from feed` : `Add ${neighborhoodName} to feed`}
          >
            {added ? '✓' : '+'}
          </button>
        </div>
      )}
    </Link>
  );
}
