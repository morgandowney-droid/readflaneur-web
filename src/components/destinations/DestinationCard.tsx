'use client';

import Link from 'next/link';
import type { Destination } from './DestinationsClient';

interface Props {
  destination: Destination;
  isFavorite: boolean;
  isInFeed: boolean;
  isAuth: boolean;
  isHovered: boolean;
  isSelected: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleFeed: (id: string, adding: boolean) => void;
  citySlug: string;
  neighborhoodSlug: string;
}

export function DestinationCard({
  destination,
  isFavorite,
  isHovered,
  isSelected,
  onHover,
  onClick,
  onToggleFavorite,
  citySlug,
  neighborhoodSlug,
}: Props) {
  const d = destination;

  return (
    <div
      className={`group relative cursor-pointer ${
        isSelected ? 'opacity-90' : ''
      }`}
      onMouseEnter={() => onHover(d.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(d.id)}
    >
      {/* Image - links to neighborhood feed */}
      <Link
        href={`/${citySlug}/${neighborhoodSlug}`}
        className="block aspect-[4/3] relative bg-surface overflow-hidden rounded-sm"
        onClick={e => e.stopPropagation()}
      >
        {d.imageUrl ? (
          <img
            src={d.imageUrl}
            alt={`${d.name}, ${d.city}`}
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-elevated">
            <span className="text-fg-subtle text-xs tracking-[0.2em] uppercase">{d.name}</span>
          </div>
        )}

        {/* Community badge */}
        {d.isCommunity && (
          <span className="absolute top-2.5 left-2.5 text-[9px] tracking-[0.15em] uppercase bg-black/40 text-white/80 px-2 py-0.5 rounded backdrop-blur-sm">
            Community
          </span>
        )}
      </Link>

      {/* Text below image */}
      <div className="px-1 pt-2.5 pb-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/${citySlug}/${neighborhoodSlug}`}
            className="font-display text-[15px] text-fg tracking-[0.02em] font-normal leading-tight uppercase hover:text-accent transition-colors"
            onClick={e => e.stopPropagation()}
          >
            {d.name}
          </Link>
          {/* Heart - save/unsave from feed */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(d.id);
            }}
            className={`transition-colors shrink-0 mt-0.5 ${isFavorite ? 'text-red-500' : 'text-fg/50 hover:text-red-400'}`}
            title={isFavorite ? 'Saved' : 'Save to feed'}
          >
            {isFavorite ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-[11px] text-fg-muted mt-0.5">
          {d.city}{d.city !== d.country ? `, ${d.country}` : ''}
        </p>
        {isFavorite && (
          <p className="text-[10px] text-accent/70 mt-1">Saved</p>
        )}
      </div>

    </div>
  );
}
