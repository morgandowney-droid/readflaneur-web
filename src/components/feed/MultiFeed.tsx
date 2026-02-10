'use client';

import { useState, useEffect, ReactNode } from 'react';
import { FeedItem } from '@/types';
import { FeedList } from './FeedList';
import { ViewToggle, FeedView } from './ViewToggle';
import { BackToTopButton } from './BackToTopButton';
import { NeighborhoodHeader } from './NeighborhoodHeader';
import { useNeighborhoodModal } from '@/components/neighborhoods/NeighborhoodSelectorModal';
import { createClient } from '@/lib/supabase/client';
import { NeighborhoodBrief, NeighborhoodBriefSkeleton } from './NeighborhoodBrief';

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
  const [fetchedBrief, setFetchedBrief] = useState<{
    headline: string;
    content: string;
    generated_at: string;
    sources: any[];
    enriched_content?: string;
    enriched_categories?: any[];
    enriched_at?: string;
    neighborhoodName: string;
    neighborhoodId: string;
    city: string;
  } | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const { openModal } = useNeighborhoodModal();

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_PREF_KEY) as FeedView | null;
    if (saved && (saved === 'compact' || saved === 'gallery')) {
      setView(saved);
    }
    setIsHydrated(true);
  }, []);

  // Fetch brief for filtered neighborhood
  useEffect(() => {
    if (activeFilter === null) {
      setFetchedBrief(null);
      setBriefLoading(false);
      return;
    }

    let cancelled = false;
    setBriefLoading(true);
    setFetchedBrief(null);

    const hood = neighborhoods.find(n => n.id === activeFilter);

    const supabase = createClient();
    const now = new Date().toISOString();
    Promise.resolve(
      supabase
        .from('neighborhood_briefs')
        .select('id, headline, content, generated_at, sources, enriched_content, enriched_categories, enriched_at')
        .eq('neighborhood_id', activeFilter)
        .gt('expires_at', now)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()
    ).then(({ data }) => {
      if (cancelled) return;
      if (data) {
        setFetchedBrief({
          headline: data.headline,
          content: data.content,
          generated_at: data.generated_at,
          sources: data.sources || [],
          enriched_content: data.enriched_content || undefined,
          enriched_categories: data.enriched_categories || undefined,
          enriched_at: data.enriched_at || undefined,
          neighborhoodName: hood?.name || '',
          neighborhoodId: activeFilter,
          city: hood?.city || '',
        });
      }
      setBriefLoading(false);
    }).then(null, () => {
      if (!cancelled) setBriefLoading(false);
    });

    return () => { cancelled = true; };
  }, [activeFilter, neighborhoods]);

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

              {neighborhoods.map((hood, i) => (
                <button
                  key={hood.id}
                  onClick={() => setActiveFilter(activeFilter === hood.id ? null : hood.id)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium tracking-wide uppercase transition-colors flex items-center gap-1.5 ${
                    activeFilter === hood.id
                      ? 'bg-white text-black'
                      : 'bg-transparent text-neutral-400 border border-neutral-800 hover:border-neutral-500 hover:text-white'
                  }`}
                  title={hood.combo_component_names?.length ? `Includes: ${hood.combo_component_names.join(', ')}` : undefined}
                >
                  {hood.name}
                  {i === 0 && neighborhoods.length > 1 && (
                    <span className={`text-[8px] tracking-wider font-bold ${
                      activeFilter === hood.id ? 'text-amber-600' : 'text-amber-500/60'
                    }`}>
                      PRIMARY
                    </span>
                  )}
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
      {activeFilter === null ? (
        dailyBrief && (
          <div className="mt-8 mb-12">
            {dailyBrief}
          </div>
        )
      ) : briefLoading ? (
        <div className="mt-8 mb-12">
          <NeighborhoodBriefSkeleton />
        </div>
      ) : fetchedBrief ? (
        <div className="mt-8 mb-12">
          <NeighborhoodBrief
            headline={fetchedBrief.headline}
            content={fetchedBrief.content}
            generatedAt={fetchedBrief.generated_at}
            neighborhoodName={fetchedBrief.neighborhoodName}
            neighborhoodId={fetchedBrief.neighborhoodId}
            city={fetchedBrief.city}
            sources={fetchedBrief.sources}
            enrichedContent={fetchedBrief.enriched_content}
            enrichedCategories={fetchedBrief.enriched_categories}
            enrichedAt={fetchedBrief.enriched_at}
          />
        </div>
      ) : null}

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
