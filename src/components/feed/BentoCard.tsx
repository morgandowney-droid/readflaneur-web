'use client';

import Image from 'next/image';
import Link from 'next/link';

export interface BentoCardProps {
  headline: string;
  blurb: string;
  imageUrl: string;
  neighborhoodName: string;
  neighborhoodId: string;
  city: string;
  slug: string;
  citySlug: string;
  neighborhoodSlug: string;
  size: 'hero' | 'wide' | 'standard';
  isUserNeighborhood?: boolean;
}

const sizeClasses: Record<BentoCardProps['size'], string> = {
  hero: 'col-span-2 row-span-2',
  wide: 'col-span-2 row-span-1',
  standard: 'col-span-1 row-span-1',
};

const heightClasses: Record<BentoCardProps['size'], string> = {
  hero: 'min-h-[420px]',
  wide: 'min-h-[220px]',
  standard: 'min-h-[260px]',
};

const headlineClasses: Record<BentoCardProps['size'], string> = {
  hero: 'text-2xl md:text-3xl',
  wide: 'text-lg md:text-xl',
  standard: 'text-base md:text-lg',
};

export function BentoCard({
  headline,
  blurb,
  imageUrl,
  neighborhoodName,
  city,
  slug,
  citySlug,
  neighborhoodSlug,
  size,
  isUserNeighborhood,
}: BentoCardProps) {
  const href = `/${citySlug}/${neighborhoodSlug}/${slug}`;

  // Truncate blurb based on card size
  const maxBlurb = size === 'hero' ? 160 : size === 'wide' ? 120 : 80;
  const truncatedBlurb = blurb.length > maxBlurb
    ? blurb.slice(0, blurb.lastIndexOf(' ', maxBlurb)) + '...'
    : blurb;

  return (
    <Link
      href={href}
      className={`
        group relative overflow-hidden rounded-xl
        ${sizeClasses[size]} ${heightClasses[size]}
        transition-transform duration-300 ease-out
        hover:scale-[1.015] hover:shadow-lg
        ${isUserNeighborhood ? 'ring-1 ring-amber-500/40' : ''}
      `}
    >
      {/* Background image */}
      <Image
        src={imageUrl}
        alt={`${neighborhoodName}, ${city}`}
        fill
        sizes={size === 'standard' ? '25vw' : '50vw'}
        className="object-cover transition-all duration-500 group-hover:scale-105 group-hover:brightness-110"
      />

      {/* Gradient overlay - heavier at bottom for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

      {/* User neighborhood amber accent */}
      {isUserNeighborhood && (
        <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/60 z-10" />
      )}

      {/* Content overlay */}
      <div className="absolute inset-0 flex flex-col justify-end p-4 md:p-5">
        {/* Location tag */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] tracking-[0.15em] uppercase font-medium text-white/70">
            {neighborhoodName}
          </span>
          <span className="text-[10px] text-white/40">&middot;</span>
          <span className="text-[10px] tracking-[0.1em] uppercase text-white/50">
            {city}
          </span>
        </div>

        {/* Headline */}
        <h3 className={`
          font-serif font-bold text-white leading-tight mb-1.5
          ${headlineClasses[size]}
        `}>
          {headline}
        </h3>

        {/* Blurb - hidden on standard size for cleaner look */}
        {size !== 'standard' && truncatedBlurb && (
          <p className="text-sm text-white/70 leading-relaxed line-clamp-2">
            {truncatedBlurb}
          </p>
        )}
      </div>
    </Link>
  );
}

/** Skeleton placeholder for a bento card */
export function BentoCardSkeleton({ size }: { size: BentoCardProps['size'] }) {
  return (
    <div className={`
      relative animate-pulse rounded-xl bg-elevated
      ${sizeClasses[size]} ${heightClasses[size]}
    `}>
      <div className="absolute bottom-4 left-4 right-4 space-y-2">
        <div className="h-3 bg-surface rounded w-1/3" />
        <div className="h-5 bg-surface rounded w-3/4" />
        {size !== 'standard' && <div className="h-3 bg-surface rounded w-2/3" />}
      </div>
    </div>
  );
}
