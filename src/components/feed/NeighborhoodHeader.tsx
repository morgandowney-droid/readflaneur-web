'use client';

import Link from 'next/link';
import { ReactNode, useState, useEffect, useRef } from 'react';
import { getWikipediaUrl, getMapLocation } from '@/lib/neighborhood-utils';
import { ComboInfo } from '@/lib/combo-utils';
import { NeighborhoodLiveStatus } from './NeighborhoodLiveStatus';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

interface NeighborhoodHeaderProps {
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
}

/** Join names with commas and "and": ["A", "B", "C"] -> "A, B, and C" */
function joinWithAnd(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** Get slug from component neighborhood ID: "nyc-park-slope" -> "park-slope" */
function getNeighborhoodSlug(id: string): string {
  const parts = id.split('-');
  return parts.slice(1).join('-');
}

type DropdownKey = 'guide' | 'map' | 'history';

export function NeighborhoodHeader({
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
}: NeighborhoodHeaderProps) {
  const [backUrl, setBackUrl] = useState<string>('/');
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) {
      try {
        const neighborhoods = JSON.parse(stored) as string[];
        if (neighborhoods.length >= 2) {
          setBackUrl(`/feed?neighborhoods=${neighborhoods.join(',')}`);
        }
      } catch {
        // Invalid stored data
      }
    }
  }, []);

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

  const linkClass = 'text-xs tracking-[0.2em] uppercase text-neutral-400 hover:text-white transition-colors';

  return (
    <header className="mb-6">
      {/* ── MASTHEAD ── */}
      <div className="text-center pt-20 md:pt-24">
        {/* City label */}
        <p className="text-[11px] tracking-[0.3em] uppercase text-neutral-400 mb-2">
          {city}
        </p>

        {/* Neighborhood name */}
        <h1 className="font-display text-4xl md:text-5xl text-neutral-100 tracking-wide mb-3">
          {neighborhoodName}
        </h1>

        {/* Combo sub-line */}
        {isCombo && (
          <p className="font-serif italic text-base text-neutral-500 mb-3">
            Covering {joinWithAnd(componentNames)}
          </p>
        )}

        {/* Live local time + weather */}
        {timezone && (
          <div className="mb-8">
            <NeighborhoodLiveStatus
              timezone={timezone}
              country={country}
              latitude={latitude}
              longitude={longitude}
              neighborhoodName={neighborhoodName}
              city={city}
            />
          </div>
        )}
        {!timezone && <div className="mb-8" />}
      </div>

      {/* ── CONTROL DECK (CSS Grid for true centering) ── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center border-y border-white/10 py-4" ref={dropdownRef}>
        {/* Col 1: Back navigation */}
        <div className="justify-self-start">
          <Link
            href={backUrl}
            className="text-xs tracking-[0.2em] uppercase text-neutral-500 hover:text-white transition-colors"
          >
            <span className="md:hidden">&larr;</span>
            <span className="hidden md:inline">&larr; All Neighborhoods</span>
          </Link>
        </div>

        {/* Col 2: GUIDE / MAP / HISTORY (true center) */}
        <div className="justify-self-center flex items-center gap-6">
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
                  <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-surface border border-white/[0.08] shadow-sm rounded py-2 min-w-[160px] z-10">
                    {comboInfo.components.map(c => (
                      <a
                        key={c.id}
                        href={`/${citySlug}/${getNeighborhoodSlug(c.id)}/guides`}
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
    </header>
  );
}
