'use client';

import { useState, useEffect } from 'react';
import { FeedItem } from '@/types';
import { FeedList } from './FeedList';
import { ViewToggle, FeedView } from './ViewToggle';
import { NeighborhoodHeader } from './NeighborhoodHeader';
import { BackToTopButton } from './BackToTopButton';

const VIEW_PREF_KEY = 'flaneur-feed-view';

interface NeighborhoodFeedProps {
  items: FeedItem[];
  city: string;
  citySlug: string;
  neighborhoodName: string;
  neighborhoodSlug: string;
  neighborhoodId: string;
  defaultView?: FeedView;
}

export function NeighborhoodFeed({
  items,
  city,
  citySlug,
  neighborhoodName,
  neighborhoodSlug,
  neighborhoodId,
  defaultView = 'compact',
}: NeighborhoodFeedProps) {
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

  return (
    <div>
      <BackToTopButton showAfter={400} />
      <NeighborhoodHeader
        city={city}
        citySlug={citySlug}
        neighborhoodName={neighborhoodName}
        neighborhoodSlug={neighborhoodSlug}
        neighborhoodId={neighborhoodId}
        viewToggle={viewToggle}
      />
      <FeedList items={items} view={currentView} />
    </div>
  );
}
