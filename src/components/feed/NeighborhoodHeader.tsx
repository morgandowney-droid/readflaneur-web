'use client';

import Link from 'next/link';
import { ReactNode, useState, useEffect, useRef } from 'react';
import { getWikipediaUrl, getMapLocation, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';
import { ComboInfo } from '@/lib/combo-utils';
import { NeighborhoodLiveStatus } from './NeighborhoodLiveStatus';
import { ContextSwitcher } from './ContextSwitcher';
import { useNeighborhoodModal } from '@/components/neighborhoods/NeighborhoodSelectorModal';

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

type DropdownKey = 'guide' | 'map' | 'history' | 'mobile-overflow';

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
  const { openModal } = useNeighborhoodModal();

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

  const linkClass = 'text-xs tracking-[0.2em] uppercase text-fg-muted hover:text-fg transition-colors';

  return (
    <header className="mb-2">
      {/* ── MASTHEAD ── */}
      <div className="text-center pt-2 md:pt-6">
        {isAll ? (
          <>
            {/* Heading — clickable to open selector when showing "My Neighborhoods" */}
            <h1
              className={`font-display text-4xl md:text-5xl text-fg tracking-wide mb-1${!neighborhoodId ? ' cursor-pointer hover:text-fg transition-colors' : ''}`}
              onClick={!neighborhoodId ? () => openModal() : undefined}
              role={!neighborhoodId ? 'button' : undefined}
            >
              {neighborhoodName}
            </h1>

            {/* City / subtitle line - reuses same slot for layout stability */}
            <p className="text-sm text-fg-subtle mb-1.5 h-5">
              {city ? (
                comboComponentNames && comboComponentNames.length > 0 ? (
                  <>
                    {city}
                    <span className="mx-2 text-neutral-600">·</span>
                    <span className="font-serif italic">{`Covering ${joinWithAnd(comboComponentNames)}`}</span>
                  </>
                ) : city
              ) : (
                neighborhoodCount !== undefined
                  ? `Your curated feed from ${neighborhoodCount} locations`
                  : '\u00A0'
              )}
            </p>

            {/* Maps & History links - fixed height container for layout stability */}
            <p className={`flex items-center justify-center gap-3 mb-1.5 h-5 ${neighborhoodId ? '' : 'invisible'}`}>
              {neighborhoodId ? (
                <>
                  <a
                    href={`https://www.google.com/maps/place/${encodeURIComponent(getMapLocation(neighborhoodId, neighborhoodName, city))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-fg-subtle underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-solid hover:decoration-neutral-300/60 hover:text-fg-muted transition-colors"
                  >
                    Maps
                  </a>
                  <a
                    href={getWikipediaUrl(neighborhoodId, neighborhoodName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-fg-subtle underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-solid hover:decoration-neutral-300/60 hover:text-fg-muted transition-colors"
                  >
                    History
                  </a>
                </>
              ) : '\u00A0'}
            </p>

            {/* Live status - always rendered container for consistent height */}
            <div className="mb-2 h-5">
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
            <p className="text-[11px] tracking-[0.3em] uppercase text-fg-muted mb-2">
              {city}
            </p>

            {/* Heading */}
            <h1 className="font-display text-4xl md:text-5xl text-fg tracking-wide mb-3">
              {neighborhoodName}
            </h1>

            {/* Combo subtitle */}
            {isCombo && (
              <p className="font-serif italic text-base text-fg-subtle mb-3">
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
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-y border-border-strong py-4" ref={dropdownRef}>
          {/* Col 1: Context Switcher */}
          <div className="justify-self-start min-w-0">
            <ContextSwitcher
              currentContext={isAll ? 'all' : neighborhoodId}
              currentLabel={isAll ? 'ALL' : neighborhoodName.toUpperCase()}
            />
          </div>

          {/* Col 2: GUIDE / MAP / HISTORY (single mode only) */}
          <div className="justify-self-center shrink-0">
            {isAll ? (
              <div />
            ) : (
              <>
                {/* Desktop: inline links */}
                <div className="hidden md:flex items-center gap-6">
                  {isCombo ? (
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
                          <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-surface border border-border shadow-sm rounded py-2 min-w-[160px] z-10">
                            {comboInfo!.components.map(c => (
                              <a
                                key={c.id}
                                href={`/${citySlug}/${getNeighborhoodSlugFromId(c.id)}/guides`}
                                className="block px-4 py-1.5 text-xs text-fg-subtle hover:text-fg hover:bg-hover w-full text-left"
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
                          <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-surface border border-border shadow-sm rounded py-2 min-w-[160px] z-10">
                            {comboInfo!.components.map(c => (
                              <a
                                key={c.id}
                                href={`https://www.google.com/maps/place/${encodeURIComponent(getMapLocation(c.id, c.name, c.city))}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block px-4 py-1.5 text-xs text-fg-subtle hover:text-fg hover:bg-hover w-full text-left"
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
                          <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-surface border border-border shadow-sm rounded py-2 min-w-[160px] z-10">
                            {comboInfo!.components.map(c => (
                              <a
                                key={c.id}
                                href={getWikipediaUrl(c.id, c.name)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block px-4 py-1.5 text-xs text-fg-subtle hover:text-fg hover:bg-hover w-full text-left"
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

                {/* Mobile: overflow button with dropdown */}
                <div className="md:hidden relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'mobile-overflow' ? null : 'mobile-overflow')}
                    className="text-fg-muted hover:text-fg transition-colors p-1"
                    aria-label="More options"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="3" cy="8" r="1.5" />
                      <circle cx="8" cy="8" r="1.5" />
                      <circle cx="13" cy="8" r="1.5" />
                    </svg>
                  </button>
                  {openDropdown === 'mobile-overflow' && (
                    <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-surface border border-border shadow-lg rounded py-2 min-w-[140px] z-10">
                      <Link
                        href={isCombo ? `/${citySlug}/${getNeighborhoodSlugFromId(comboInfo!.components[0]?.id || neighborhoodId)}/guides` : `/${citySlug}/${neighborhoodSlug}/guides`}
                        className="block px-4 py-2 text-xs tracking-[0.2em] uppercase text-fg-muted hover:text-fg hover:bg-hover"
                        onClick={() => setOpenDropdown(null)}
                      >
                        Guide
                      </Link>
                      <a
                        href={`https://www.google.com/maps/place/${encodeURIComponent(getMapLocation(neighborhoodId, neighborhoodName, city))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-4 py-2 text-xs tracking-[0.2em] uppercase text-fg-muted hover:text-fg hover:bg-hover"
                        onClick={() => setOpenDropdown(null)}
                      >
                        Map
                      </a>
                      <a
                        href={getWikipediaUrl(neighborhoodId, neighborhoodName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-4 py-2 text-xs tracking-[0.2em] uppercase text-fg-muted hover:text-fg hover:bg-hover"
                        onClick={() => setOpenDropdown(null)}
                      >
                        History
                      </a>
                    </div>
                  )}
                </div>
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
