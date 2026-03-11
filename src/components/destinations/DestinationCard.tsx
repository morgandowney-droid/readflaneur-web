'use client';

import Link from 'next/link';
import type { Destination } from './DestinationsClient';

interface Props {
  destination: Destination;
  isFavorite: boolean;
  isAuth: boolean;
  isHovered: boolean;
  isSelected: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  citySlug: string;
  neighborhoodSlug: string;
}

export function DestinationCard({
  destination,
  isFavorite,
  isAuth,
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
      className={`group relative rounded-xl overflow-hidden border transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'border-accent ring-1 ring-accent/30'
          : isHovered
            ? 'border-border-strong'
            : 'border-border hover:border-border-strong'
      }`}
      onMouseEnter={() => onHover(d.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(d.id)}
    >
      {/* Image */}
      <div className="aspect-[4/3] relative bg-surface overflow-hidden">
        {d.imageUrl ? (
          <img
            src={d.imageUrl}
            alt={`${d.name}, ${d.city}`}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-elevated">
            <span className="text-fg-subtle text-xs tracking-[0.2em] uppercase">{d.name}</span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Heart toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isAuth) onToggleFavorite(d.id);
          }}
          className={`absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
            isFavorite
              ? 'bg-white/90 text-red-500'
              : 'bg-black/30 text-white/70 hover:bg-black/50 hover:text-white backdrop-blur-sm'
          }`}
          title={isAuth ? (isFavorite ? 'Remove from My Feed' : 'Add to My Feed') : 'Sign in to save destinations'}
        >
          {isFavorite ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          )}
        </button>

        {/* Community badge */}
        {d.isCommunity && (
          <span className="absolute top-3 left-3 text-[9px] tracking-[0.15em] uppercase bg-black/40 text-white/80 px-2 py-0.5 rounded backdrop-blur-sm">
            Community
          </span>
        )}

        {/* Bottom text on image */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h3 className="font-display text-base text-white tracking-[0.05em] font-light leading-tight">
            {d.name}
          </h3>
          <p className="text-[10px] tracking-[0.15em] uppercase text-white/60 mt-0.5">
            {d.city}{d.city !== d.country ? `, ${d.country}` : ''}
          </p>
        </div>
      </div>

      {/* Expanded detail when selected */}
      {isSelected && (
        <div className="px-3 py-3 bg-surface border-t border-border space-y-2">
          <Link
            href={`/${citySlug}/${neighborhoodSlug}`}
            className="text-xs text-accent hover:underline tracking-[0.05em]"
            onClick={e => e.stopPropagation()}
          >
            Read stories &rsaquo;
          </Link>
          {!isAuth && (
            <p className="text-[10px] text-fg-subtle">
              <Link href="/login" className="text-accent hover:underline" onClick={e => e.stopPropagation()}>Sign in</Link> to save destinations to your lists.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
