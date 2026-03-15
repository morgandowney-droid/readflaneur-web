'use client';

import { useState } from 'react';
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
  isInFeed,
  isAuth,
  isHovered,
  isSelected,
  onHover,
  onClick,
  onToggleFavorite,
  onToggleFeed,
  citySlug,
  neighborhoodSlug,
}: Props) {
  const d = destination;
  const [confirmRemove, setConfirmRemove] = useState(false);

  const handleFeedToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuth) return;

    if (isInFeed) {
      // Show confirmation before removing
      setConfirmRemove(true);
    } else {
      onToggleFeed(d.id, true);
    }
  };

  const handleConfirmRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmRemove(false);
    onToggleFeed(d.id, false);
  };

  const handleCancelRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmRemove(false);
  };

  return (
    <div
      className={`group relative cursor-pointer ${
        isSelected ? 'opacity-90' : ''
      }`}
      onMouseEnter={() => onHover(d.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(d.id)}
    >
      {/* Image */}
      <div className="aspect-[4/3] relative bg-surface overflow-hidden rounded-sm">
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
      </div>

      {/* Text below image */}
      <div className="px-1 pt-2.5 pb-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-[15px] text-fg tracking-[0.02em] font-normal leading-tight uppercase">
            {d.name}
          </h3>
          {/* Icon row: heart + news feed toggle */}
          <div className="flex items-center gap-2.5 shrink-0 mt-0.5">
            {/* Heart - add to list */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isAuth) onToggleFavorite(d.id);
              }}
              className="transition-colors text-fg/70 hover:text-fg"
              title={isAuth ? (isFavorite ? 'Saved to list' : 'Add to a list') : 'Sign in to save destinations'}
            >
              {isFavorite ? (
                <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              ) : (
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              )}
            </button>
            {/* News feed toggle */}
            <button
              onClick={handleFeedToggle}
              className={`transition-colors ${
                isInFeed ? 'text-fg' : 'text-fg/40 hover:text-fg/70'
              }`}
              title={isAuth
                ? (isInFeed ? 'Remove from daily news feed' : 'Add to daily news feed')
                : 'Sign in to manage your news feed'
              }
            >
              <svg className="w-4.5 h-4.5" fill={isInFeed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isInFeed ? '0' : '1.5'} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 12h6" />
              </svg>
            </button>
          </div>
        </div>
        <p className="text-[11px] text-fg-muted mt-0.5">
          {d.city}{d.city !== d.country ? `, ${d.country}` : ''}
        </p>
        {isInFeed && (
          <p className="text-[10px] text-fg/60 mt-1">In your news feed</p>
        )}
      </div>

      {/* "Are you sure?" confirmation overlay */}
      {confirmRemove && (
        <div
          className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 px-6"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-white text-sm text-center font-medium">
            Remove {d.name} from your daily news feed?
          </p>
          <p className="text-white/60 text-xs text-center">
            You will stop receiving daily briefs and emails for this neighborhood.
          </p>
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleConfirmRemove}
              className="px-4 py-2 bg-red-500/90 text-white text-xs tracking-[0.1em] uppercase rounded-lg hover:bg-red-500 transition-colors"
            >
              Remove
            </button>
            <button
              onClick={handleCancelRemove}
              className="px-4 py-2 bg-white/20 text-white text-xs tracking-[0.1em] uppercase rounded-lg hover:bg-white/30 transition-colors"
            >
              Keep
            </button>
          </div>
        </div>
      )}

      {/* Expanded detail when selected */}
      {isSelected && !confirmRemove && (
        <div className="px-1 pb-2 space-y-1">
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
