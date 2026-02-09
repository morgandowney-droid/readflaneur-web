'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { FeedItem } from '@/types';
import { FeedList } from './FeedList';
import { ViewToggle, FeedView } from './ViewToggle';
import { BackToTopButton } from './BackToTopButton';

const MAX_VISIBLE_CHIPS = 2;

const VIEW_PREF_KEY = 'flaneur-feed-view';

// Map neighborhood prefix to city slug for URLs
const prefixToCitySlug: Record<string, string> = {
  'nyc': 'new-york',
  'sf': 'san-francisco',
  'london': 'london',
  'sydney': 'sydney',
  'stockholm': 'stockholm',
};

function getCitySlug(neighborhoodId: string): string {
  const prefix = neighborhoodId.split('-')[0];
  return prefixToCitySlug[prefix] || prefix;
}

function getNeighborhoodSlug(neighborhoodId: string): string {
  const parts = neighborhoodId.split('-');
  return parts.slice(1).join('-');
}

interface Neighborhood {
  id: string;
  name: string;
  city: string;
  is_combo?: boolean;
  combo_component_names?: string[];
}

interface MultiFeedProps {
  items: FeedItem[];
  neighborhoods: Neighborhood[];
  defaultView?: FeedView;
  reminder?: ReactNode;
}

export function MultiFeed({
  items,
  neighborhoods,
  defaultView = 'compact',
  reminder,
}: MultiFeedProps) {
  const [view, setView] = useState<FeedView>(defaultView);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_PREF_KEY) as FeedView | null;
    if (saved && (saved === 'compact' || saved === 'gallery')) {
      setView(saved);
    }
    setIsHydrated(true);
  }, []);

  const handleViewChange = (newView: FeedView) => {
    setView(newView);
    localStorage.setItem(VIEW_PREF_KEY, newView);
  };

  const currentView = isHydrated ? view : defaultView;

  const viewToggle = (
    <ViewToggle
      view={currentView}
      onChange={isHydrated ? handleViewChange : () => {}}
    />
  );

  const [showAllNeighborhoods, setShowAllNeighborhoods] = useState(false);
  const isMultiple = neighborhoods.length > 1;
  const isEmpty = neighborhoods.length === 0;
  const hasOverflow = neighborhoods.length > MAX_VISIBLE_CHIPS;
  const visibleNeighborhoods = showAllNeighborhoods
    ? neighborhoods
    : neighborhoods.slice(0, MAX_VISIBLE_CHIPS);
  const hiddenCount = neighborhoods.length - MAX_VISIBLE_CHIPS;

  return (
    <div>
      <BackToTopButton showAfter={400} />
      <header className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-light tracking-wide">Your Stories</h1>
            {isEmpty && (
              <p className="text-sm text-neutral-500">
                Select neighborhoods to see local stories
              </p>
            )}
          </div>
          {viewToggle}
        </div>
        {isMultiple && (
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {visibleNeighborhoods.map((hood) => {
              const hasComboComponents = hood.combo_component_names && hood.combo_component_names.length > 0;
              return (
                <Link
                  key={hood.id}
                  href={`/${getCitySlug(hood.id)}/${getNeighborhoodSlug(hood.id)}`}
                  className="text-xs tracking-widest uppercase border border-white/[0.08] px-3 py-1.5 hover:border-white/20 transition-colors"
                  title={hasComboComponents ? `Includes: ${hood.combo_component_names!.join(', ')}` : undefined}
                >
                  {hood.name}
                </Link>
              );
            })}
            {hasOverflow && !showAllNeighborhoods && (
              <button
                onClick={() => setShowAllNeighborhoods(true)}
                className="text-xs tracking-widest uppercase border border-white/[0.08] px-3 py-1.5 hover:border-white/20 transition-colors text-neutral-400 hover:text-white"
              >
                +{hiddenCount} more
              </button>
            )}
            {showAllNeighborhoods && hasOverflow && (
              <button
                onClick={() => setShowAllNeighborhoods(false)}
                className="text-xs tracking-widest uppercase text-neutral-400 px-2 py-1.5 hover:text-white transition-colors"
              >
                Show less
              </button>
            )}
          </div>
        )}
        {reminder}
      </header>
      <FeedList items={items} view={currentView} />
    </div>
  );
}
