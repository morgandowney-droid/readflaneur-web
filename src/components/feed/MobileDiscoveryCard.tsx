'use client';

import { useState } from 'react';
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
}: MobileDiscoveryCardProps) {
  const [added, setAdded] = useState(false);
  const href = `/${citySlug}/${neighborhoodSlug}/${slug}?explore=true`;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (added || !onAdd) return;
    onAdd(neighborhoodId);
    setAdded(true);
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

      {/* Subscribe button */}
      {onAdd && (
        <button
          onClick={handleAdd}
          className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white text-sm transition-colors ${
            added ? 'bg-green-600/60' : 'bg-black/50 active:bg-black/70'
          }`}
          aria-label={added ? 'Added' : `Add ${neighborhoodName}`}
        >
          {added ? '✓' : '+'}
        </button>
      )}
    </Link>
  );
}
