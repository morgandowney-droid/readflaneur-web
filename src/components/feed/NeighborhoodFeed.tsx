'use client';

import { useState, useEffect, ReactNode } from 'react';
import { FeedItem } from '@/types';
import { FeedList } from './FeedList';
import { ViewToggle, FeedView } from './ViewToggle';
import { NeighborhoodHeader } from './NeighborhoodHeader';
import { BackToTopButton } from './BackToTopButton';
import { ComboInfo } from '@/lib/combo-utils';

const VIEW_PREF_KEY = 'flaneur-feed-view';

interface NeighborhoodFeedProps {
  items: FeedItem[];
  city: string;
  citySlug: string;
  neighborhoodName: string;
  neighborhoodSlug: string;
  neighborhoodId: string;
  defaultView?: FeedView;
  mode?: 'single' | 'all';
  comboInfo?: ComboInfo | null;
  briefArchive?: ReactNode;
  dailyBrief?: ReactNode;
  discovery?: ReactNode;
  timezone?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  initialWeather?: { tempC: number; weatherCode: number };
}

export function NeighborhoodFeed({
  items,
  city,
  citySlug,
  neighborhoodName,
  neighborhoodSlug,
  neighborhoodId,
  defaultView = 'compact',
  mode = 'single',
  comboInfo,
  briefArchive,
  dailyBrief,
  discovery,
  timezone,
  country,
  latitude,
  longitude,
  initialWeather,
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
  const hasItems = items.length > 0;

  // Only show view toggle when there are items to display
  const viewToggle = hasItems ? (
    <ViewToggle
      view={currentView}
      onChange={isHydrated ? handleViewChange : () => {}}
    />
  ) : undefined;

  return (
    <div>
      <BackToTopButton showAfter={400} />
      <NeighborhoodHeader
        mode={mode}
        city={city}
        citySlug={citySlug}
        neighborhoodName={neighborhoodName}
        neighborhoodSlug={neighborhoodSlug}
        neighborhoodId={neighborhoodId}
        viewToggle={viewToggle}
        briefArchive={briefArchive}
        comboInfo={comboInfo}
        timezone={timezone}
        country={country}
        latitude={latitude}
        longitude={longitude}
        initialWeather={initialWeather}
      />
      {dailyBrief && (
        <div className="mt-4 mb-6">
          {dailyBrief}
        </div>
      )}
      <FeedList items={items} view={currentView} />
      {discovery}
    </div>
  );
}
