'use client';

import Link from 'next/link';
import { ReactNode, useState, useEffect } from 'react';
import { getWikipediaUrl, getMapLocation } from '@/lib/neighborhood-utils';
import { ComboInfo } from '@/lib/combo-utils';
import { ComboNeighborhoodCards } from './ComboNeighborhoodCards';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

interface NeighborhoodHeaderProps {
  city: string;
  citySlug: string;
  neighborhoodName: string;
  neighborhoodSlug: string;
  neighborhoodId: string;
  viewToggle?: ReactNode;
  comboInfo?: ComboInfo | null;
}

export function NeighborhoodHeader({
  city,
  citySlug,
  neighborhoodName,
  neighborhoodSlug,
  neighborhoodId,
  viewToggle,
  comboInfo,
}: NeighborhoodHeaderProps) {
  const [backUrl, setBackUrl] = useState<string>('/');

  useEffect(() => {
    // Check if user has neighborhoods selected for multi-feed, otherwise go home
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) {
      try {
        const neighborhoods = JSON.parse(stored) as string[];
        if (neighborhoods.length >= 2) {
          setBackUrl(`/feed?neighborhoods=${neighborhoods.join(',')}`);
        }
      } catch {
        // Invalid stored data - default to home
      }
    }
  }, []);

  return (
    <header className="mb-6">
      {/* Back button */}
      <div className="mb-4">
        <Link
          href={backUrl}
          className="inline-flex items-center gap-1.5 text-xs tracking-wide text-neutral-500 hover:text-black transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </Link>
      </div>

      {/* Main header row: Neighborhood name on left, nav buttons on right */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 mb-0.5">
            {city}
          </p>
          <h1 className="text-lg font-light tracking-wide">
            {neighborhoodName}
          </h1>
          {/* Show "Includes: ..." text for combo neighborhoods */}
          {comboInfo && comboInfo.components.length > 0 && (
            <p className="text-xs text-neutral-400 mt-0.5">
              Includes: {comboInfo.components.map(c => c.name).join(', ')}
            </p>
          )}
        </div>

        {/* Only show single nav links for non-combo neighborhoods */}
        {!comboInfo && (
          <div className="flex items-center gap-2">
            <Link
              href={`/${citySlug}/${neighborhoodSlug}/guides`}
              className="text-xs tracking-widest uppercase text-neutral-500 hover:text-black transition-colors px-2 py-1"
            >
              Places
            </Link>
            <a
              href={`https://www.google.com/maps/place/${encodeURIComponent(getMapLocation(neighborhoodId, neighborhoodName, city))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs tracking-widest uppercase text-neutral-500 hover:text-black transition-colors px-2 py-1"
            >
              Map
            </a>
            <a
              href={getWikipediaUrl(neighborhoodId, neighborhoodName)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs tracking-widest uppercase text-neutral-500 hover:text-black transition-colors px-2 py-1"
            >
              Wiki
            </a>
          </div>
        )}
      </div>

      {/* Show component cards for combo neighborhoods */}
      {comboInfo && comboInfo.components.length > 0 && (
        <div className="mt-4">
          <ComboNeighborhoodCards
            components={comboInfo.components}
            citySlug={citySlug}
          />
        </div>
      )}

      {viewToggle && (
        <div className="flex items-center justify-end mt-3">
          {viewToggle}
        </div>
      )}
    </header>
  );
}
