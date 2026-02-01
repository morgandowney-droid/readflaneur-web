'use client';

import Link from 'next/link';
import { ReactNode, useState, useEffect } from 'react';
import { SubmitTipButton } from '@/components/tips';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

interface NeighborhoodHeaderProps {
  city: string;
  citySlug: string;
  neighborhoodName: string;
  neighborhoodSlug: string;
  neighborhoodId: string;
  viewToggle?: ReactNode;
}

export function NeighborhoodHeader({
  city,
  citySlug,
  neighborhoodName,
  neighborhoodSlug,
  neighborhoodId,
  viewToggle,
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
    <header className="mb-4">
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

      <div className="text-center mb-3">
        <p className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-1">
          {city}
        </p>
        <h1 className="text-xl font-light tracking-wide">
          {neighborhoodName}
        </h1>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Link
            href={`/${citySlug}/${neighborhoodSlug}/guides`}
            className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase border border-neutral-200 px-3 py-2 hover:border-black transition-colors min-h-[44px] whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Guide
          </Link>
          <Link
            href={`/${citySlug}/${neighborhoodSlug}/map`}
            className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase border border-neutral-200 px-3 py-2 hover:border-black transition-colors min-h-[44px] whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Map
          </Link>
          <Link
            href={`/${citySlug}/${neighborhoodSlug}/tonight`}
            className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase border border-neutral-200 px-3 py-2 hover:border-black transition-colors min-h-[44px] whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Tonight
          </Link>
          <Link
            href={`/${citySlug}/${neighborhoodSlug}/spotted`}
            className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase border border-neutral-200 px-3 py-2 hover:border-black transition-colors min-h-[44px] whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Spotted
          </Link>
          <Link
            href={`/${citySlug}/${neighborhoodSlug}/property-watch`}
            className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase border border-neutral-200 px-3 py-2 hover:border-black transition-colors min-h-[44px] whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Property
          </Link>
          <SubmitTipButton variant="neighborhood" neighborhoodId={neighborhoodId} />
        </div>
        {viewToggle && (
          <div className="flex items-center shrink-0">
            {viewToggle}
          </div>
        )}
      </div>
    </header>
  );
}
