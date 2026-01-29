'use client';

import { useState, useEffect } from 'react';
import { FeedItem } from '@/types';
import { FeedList } from './FeedList';
import { ViewToggle, FeedView } from './ViewToggle';

const VIEW_PREF_KEY = 'flaneur-feed-view';

interface FeedWithViewToggleProps {
  items: FeedItem[];
  defaultView?: FeedView;
}

export function FeedWithViewToggle({ items, defaultView = 'compact' }: FeedWithViewToggleProps) {
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

  // Prevent hydration mismatch by rendering default view until client-side
  if (!isHydrated) {
    return (
      <div>
        <div className="flex justify-end mb-4">
          <ViewToggle view={defaultView} onChange={() => {}} />
        </div>
        <FeedList items={items} view={defaultView} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <ViewToggle view={view} onChange={handleViewChange} />
      </div>
      <FeedList items={items} view={view} />
    </div>
  );
}
