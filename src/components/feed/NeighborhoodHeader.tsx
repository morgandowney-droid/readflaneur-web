'use client';

import Link from 'next/link';
import { ReactNode, useState, useEffect, useRef } from 'react';
import { getWikipediaUrl, getMapLocation, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';
import { ComboInfo } from '@/lib/combo-utils';
import { NeighborhoodLiveStatus } from './NeighborhoodLiveStatus';
import { ContextSwitcher } from './ContextSwitcher';

interface NeighborhoodHeaderProps {
  mode?: 'single' | 'all';
  city: string;
  citySlug: string;
  neighborhoodName: string;
  neighborhoodSlug: string;
  neighborhoodId: string;
  viewToggle?: ReactNode;
  briefArchive?: ReactNode;
  comboInfo?: ComboInfo | null;
  timezone?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  neighborhoodCount?: number;
  hideControlDeck?: boolean;
  comboComponentNames?: string[];
  initialWeather?: { tempC: number; weatherCode: number };
}

/** Join names with commas and "and": ["A", "B", "C"] -> "A, B, and C" */
function joinWithAnd(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

type DropdownKey = 'guide' | 'map' | 'history';

export function NeighborhoodHeader({
  mode = 'single',
  city,
  citySlug,
  neighborhoodName,
  neighborhoodSlug,
  neighborhoodId,
  viewToggle,
  briefArchive,
  comboInfo,
  timezone,
  country,
  latitude,
  longitude,
  neighborhoodCount,
  hideControlDeck,
  comboComponentNames,
  initialWeather,
}: NeighborhoodHeaderProps) {
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openDropdown]);

  const isCombo = comboInfo && comboInfo.components.length > 0;
  const componentNames = isCombo ? comboInfo.components.map(c => c.name) : [];
  const isAll = mode === 'all';

  const linkClass = 'text-xs tracking-[0.2em] uppercase text-neutral-400 hover:text-white transition-colors';

  return (
    <header className="mb-6">
      {/* ── MASTHEAD ── */}
      <div className={`text-center ${isAll ? 'pt-4' : 'pt-8'}`}>
        {isAll ? (
          <>
            {/* Heading */}
            <h1 className="font-display text-4xl md:text-5xl text-neutral-100 tracking-wide mb-1">
              {neighborhoodName}
            </h1>

            {/* City label - muted, below the neighborhood name */}
            <p className={`text-sm text-neutral-500 mb-3 h-5 ${city ? '' : 'opacity-0'}`}>
              {city || '\u00A0'}
            </p>

            {/* Combo subtitle - fixed height container for layout stability */}
            <p className={`font-serif italic text-base text-neutral-500 mb-3 h-6 ${comboComponentNames && comboComponentNames.length > 0 ? '' : 'invisible'}`}>
              {comboComponentNames && comboComponentNames.length > 0 ? `Covering ${joinWithAnd(comboComponentNames)}` : '\u00A0'}
            </p>

            {/* Maps & History links - fixed height container for layout stability */}
            <p className={`flex items-center justify-center gap-3 mb-3 h-5 ${neighborhoodId ? '' : 'invisible'}`}>
              {neighborhoodId ? (
                <>
                  <a
                    href={`https://www.google.com/maps/place/${encodeURIComponent(getMapLocation(neighborhoodId, neighborhoodName, city))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-neutral-500 underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-solid hover:decoration-neutral-300/60 hover:text-neutral-300 transition-colors"
                  >
                    Maps
                  </a>
                  <a
                    href={getWikipediaUrl(neighborhoodId, neighborhoodName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-neutral-500 underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-solid hover:decoration-neutral-300/60 hover:text-neutral-300 transition-colors"
                  >
                    History
                  </a>
                </>
              ) : '\u00A0'}
            </p>

            {/* Subtitle - always rendered for consistent height */}
            <p className={`text-sm text-neutral-500 mb-3 h-5 ${neighborhoodCount !== undefined ? '' : 'opacity-0'}`}>
              {neighborhoodCount !== undefined ? `Your curated feed from ${neighborhoodCount} locations` : '\u00A0'}
            </p>

            {/* Live status - always rendered container for consistent height */}
            <div className="mb-4 h-5">
              {timezone && (
                <NeighborhoodLiveStatus
                  timezone={timezone}
                  country={country}
                  latitude={latitude}
                  longitude={longitude}
                  neighborhoodName={neighborhoodName}
                  city={city}
                  initialWeather={initialWeather}
                />
              )}
            </div>
          </>
        ) : (
          <>
            {/* City label */}
            <p className="text-[11px] tracking-[0.3em] uppercase text-neutral-400 mb-2">
              {city}
            </p>

            {/* Heading */}
            <h1 className="font-display text-4xl md:text-5xl text-neutral-100 tracking-wide mb-3">
              {neighborhoodName}
            </h1>

            {/* Combo subtitle */}
            {isCombo && (
              <p className="font-serif italic text-base text-neutral-500 mb-3">
                Covering {joinWithAnd(componentNames)}
              </p>
            )}

            {/* Live local time + weather */}
            {timezone ? (
              <div className="mb-8">
                <NeighborhoodLiveStatus
                  timezone={timezone}
                  country={country}
                  latitude={latitude}
                  longitude={longitude}
                  neighborhoodName={neighborhoodName}
                  city={city}
                  initialWeather={initialWeather}
                />
              </div>
            ) : (
              <div className="mb-8" />
            )}
          </>
        )}
      </div>

      {/* ── CONTROL DECK (CSS Grid for true centering) ── */}
      {!hideControlDeck && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-y border-white/10 py-4" ref={dropdownRef}>
          {/* Col 1: Context Switcher */}
          <div className="justify-self-start min-w-0">
            <ContextSwitcher
              currentContext={isAll ? 'all' : neighborhoodId}
              currentLabel={isAll ? 'ALL' : neighborhoodName.toUpperCase()}
            />
          </div>

          {/* Col 2: GUIDE / MAP / HISTORY (single mode only) */}
          <div className="justify-self-center flex items-center gap-4 md:gap-6 shrink-0">
            {isAll ? (
              <div />
            ) : isCombo ? (
              <>
                {/* GUIDE dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'guide' ? null : 'guide')}
                    className={linkClass}
                  >
                    GUIDE
                  </button>
                  {openDropdown === 'guide' && (
                    <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-surface border border-white/[0.08] shadow-sm rounded py-2 min-w-[160px] z-10">
                      {comboInfo.components.map(c => (
                        <a
                          key={c.id}
                          href={`/${citySlug}/${getNeighborhoodSlugFromId(c.id)}/guides`}
                          className="block px-4 py-1.5 text-xs text-neutral-500 hover:text-white hover:bg-white/5 w-full text-left"
                        >
                          {c.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* MAP dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'map' ? null : 'map')}
                    className={linkClass}
                  >
                    MAP
                  </button>
                  {openDropdown === 'map' && (
                    <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-surface border border-white/[0.08] shadow-sm rounded py-2 min-w-[160px] z-10">
                      {comboInfo.components.map(c => (
                        <a
                          key={c.id}
                          href={`https://www.google.com/maps/place/${encodeURIComponent(getMapLocation(c.id, c.name, c.city))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-4 py-1.5 text-xs text-neutral-500 hover:text-white hover:bg-white/5 w-full text-left"
                        >
                          {c.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* HISTORY dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'history' ? null : 'history')}
                    className={linkClass}
                  >
                    HISTORY
                  </button>
                  {openDropdown === 'history' && (
                    <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-surface border border-white/[0.08] shadow-sm rounded py-2 min-w-[160px] z-10">
                      {comboInfo.components.map(c => (
                        <a
                          key={c.id}
                          href={getWikipediaUrl(c.id, c.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-4 py-1.5 text-xs text-neutral-500 hover:text-white hover:bg-white/5 w-full text-left"
                        >
                          {c.name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link href={`/${citySlug}/${neighborhoodSlug}/guides`} className={linkClass}>
                  GUIDE
                </Link>
                <a
                  href={`https://www.google.com/maps/place/${encodeURIComponent(getMapLocation(neighborhoodId, neighborhoodName, city))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  MAP
                </a>
                <a
                  href={getWikipediaUrl(neighborhoodId, neighborhoodName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  HISTORY
                </a>
              </>
            )}
          </div>

          {/* Col 3: View Toggle */}
          <div className="justify-self-end">
            {viewToggle || <div />}
          </div>
        </div>
      )}
    </header>
  );
}
