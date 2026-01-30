'use client';

import { useState, useEffect, ReactNode } from 'react';
import { FeedItem } from '@/types';
import { FeedList } from './FeedList';
import { ViewToggle, FeedView } from './ViewToggle';

const VIEW_PREF_KEY = 'flaneur-feed-view';

interface FeedWithViewToggleProps {
  items: FeedItem[];
  defaultView?: FeedView;
  renderHeader?: (viewToggle: ReactNode) => ReactNode;
}

export function FeedWithViewToggle({ items, defaultView = 'compact', renderHeader }: FeedWithViewToggleProps) {
  const [view, setView] = useState<FeedView>(defaultView);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load saved preference on mount
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

  const viewToggle = (
    <ViewToggle
      view={isHydrated ? view : defaultView}
      onChange={isHydrated ? handleViewChange : () => {}}
    />
  );

  return (
    <div>
      {renderHeader ? (
        renderHeader(viewToggle)
      ) : (
        <div className="flex justify-end mb-4">
          {viewToggle}
        </div>
      )}
      <FeedList items={items} view={isHydrated ? view : defaultView} />
    </div>
  );
}
