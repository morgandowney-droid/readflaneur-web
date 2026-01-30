'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { FeedItem } from '@/types';
import { FeedList } from './FeedList';
import { ViewToggle, FeedView } from './ViewToggle';
import { BackToTopButton } from './BackToTopButton';

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

  const isMultiple = neighborhoods.length > 1;
  const isEmpty = neighborhoods.length === 0;

  return (
    <div>
      <BackToTopButton showAfter={400} />
      <header className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-light tracking-wide">Your Feed</h1>
            {isMultiple && (
              <p className="text-sm text-neutral-500">
                Stories from {neighborhoods.map(n => n.name).join(', ')}
              </p>
            )}
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
            {neighborhoods.map((hood) => (
              <Link
                key={hood.id}
                href={`/${getCitySlug(hood.id)}/${getNeighborhoodSlug(hood.id)}`}
                className="text-xs tracking-widest uppercase border border-neutral-200 px-3 py-1.5 hover:border-black transition-colors"
              >
                {hood.name}
              </Link>
            ))}
          </div>
        )}
        {reminder}
      </header>
      <FeedList items={items} view={currentView} />
    </div>
  );
}
