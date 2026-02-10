'use client';

import { useState, useEffect, ReactNode } from 'react';
import { FeedItem } from '@/types';
import { FeedList } from './FeedList';
import { ViewToggle, FeedView } from './ViewToggle';
import { BackToTopButton } from './BackToTopButton';
import { NeighborhoodHeader } from './NeighborhoodHeader';
import { useNeighborhoodModal } from '@/components/neighborhoods/NeighborhoodSelectorModal';

const VIEW_PREF_KEY = 'flaneur-feed-view';

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
  dailyBrief?: ReactNode;
}

export function MultiFeed({
  items,
  neighborhoods,
  defaultView = 'compact',
  reminder,
  dailyBrief,
}: MultiFeedProps) {
  const [view, setView] = useState<FeedView>(defaultView);
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const { openModal } = useNeighborhoodModal();

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

  // Filter items by active neighborhood
  const filteredItems = activeFilter
    ? items.filter(item => {
        if (item.type === 'article') {
          return item.data.neighborhood_id === activeFilter;
        }
        return true; // Show ads regardless
      })
    : items;

  return (
    <div>
      <BackToTopButton showAfter={400} />

      {/* ── MASTHEAD + CONTROL DECK ── */}
      <NeighborhoodHeader
        mode="all"
        city=""
        citySlug=""
        neighborhoodName="My Neighborhoods"
        neighborhoodSlug=""
        neighborhoodId=""
        viewToggle={viewToggle}
        neighborhoodCount={neighborhoods.length}
      />

      {/* ── PILL BAR ── */}
      {isMultiple && (
        <div className="sticky top-[60px] z-20 bg-[#050505]/95 backdrop-blur-md">
          <div className="flex items-center gap-2 py-4">
            {/* Scrollable pills */}
            <div
              className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1"
              style={{ maskImage: 'linear-gradient(to right, black 90%, transparent 100%)' }}
            >
              {/* "All" pill */}
              <button
                onClick={() => setActiveFilter(null)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium tracking-wide uppercase transition-colors ${
                  activeFilter === null
                    ? 'bg-white text-black'
                    : 'bg-transparent text-neutral-400 border border-neutral-800 hover:border-neutral-500 hover:text-white'
                }`}
              >
                All Stories
              </button>

              {neighborhoods.map((hood) => (
                <button
                  key={hood.id}
                  onClick={() => setActiveFilter(activeFilter === hood.id ? null : hood.id)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium tracking-wide uppercase transition-colors ${
                    activeFilter === hood.id
                      ? 'bg-white text-black'
                      : 'bg-transparent text-neutral-400 border border-neutral-800 hover:border-neutral-500 hover:text-white'
                  }`}
                  title={hood.combo_component_names?.length ? `Includes: ${hood.combo_component_names.join(', ')}` : undefined}
                >
                  {hood.name}
                </button>
              ))}
            </div>

            {/* Divider + Manage button */}
            <div className="shrink-0 flex items-center gap-2 pl-2 border-l border-neutral-800">
              <button
                onClick={() => openModal()}
                className="text-neutral-500 hover:text-white transition-colors p-1.5"
                title="Manage neighborhoods"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="5" cy="4" r="1.5" fill="currentColor" />
                  <circle cx="11" cy="8" r="1.5" fill="currentColor" />
                  <circle cx="7" cy="12" r="1.5" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DAILY BRIEF ── */}
      {dailyBrief && (
        <div className="mt-8 mb-12">
          {dailyBrief}
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {isEmpty && (
        <div className="py-4">
          <p className="text-sm text-neutral-500">
            Select neighborhoods to see local stories
          </p>
        </div>
      )}

      {reminder}
      <FeedList items={filteredItems} view={currentView} />
    </div>
  );
}
