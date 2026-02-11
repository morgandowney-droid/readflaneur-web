'use client';

import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FeedItem, Article, Ad } from '@/types';
import { FeedList } from './FeedList';
import { ViewToggle, FeedView } from './ViewToggle';
import { BackToTopButton } from './BackToTopButton';
import { NeighborhoodHeader } from './NeighborhoodHeader';
import { useNeighborhoodModal } from '@/components/neighborhoods/NeighborhoodSelectorModal';
import { injectAds } from '@/lib/ad-engine';
import { NeighborhoodBrief, NeighborhoodBriefSkeleton } from './NeighborhoodBrief';

const VIEW_PREF_KEY = 'flaneur-feed-view';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
  is_combo?: boolean;
  combo_component_names?: string[];
  timezone?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

interface MultiFeedProps {
  items: FeedItem[];
  neighborhoods: Neighborhood[];
  defaultView?: FeedView;
  reminder?: ReactNode;
  dailyBrief?: ReactNode;
  initialWeather?: { tempC: number; weatherCode: number };
}

export function MultiFeed({
  items,
  neighborhoods,
  defaultView = 'compact',
  reminder,
  dailyBrief,
  initialWeather,
}: MultiFeedProps) {
  const router = useRouter();
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
  const [fetchedArticles, setFetchedArticles] = useState<FeedItem[] | null>(null);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMoreFiltered, setHasMoreFiltered] = useState(true);
  const { openModal } = useNeighborhoodModal();

  // Pill bar scroll state
  const pillsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = pillsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = pillsRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [checkScroll, neighborhoods.length]);

  const scrollPills = (direction: 'left' | 'right') => {
    const el = pillsRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -160 : 160, behavior: 'smooth' });
  };

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_PREF_KEY) as FeedView | null;
    if (saved && (saved === 'compact' || saved === 'gallery')) {
      setView(saved);
    }
    setIsHydrated(true);
  }, []);

  // Fetch brief for filtered neighborhood (REST API - bypasses Supabase client issues)
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const now = new Date().toISOString();

    const url = `${supabaseUrl}/rest/v1/neighborhood_briefs?select=id,headline,content,generated_at,sources,enriched_content,enriched_categories,enriched_at&neighborhood_id=eq.${encodeURIComponent(activeFilter)}&expires_at=gt.${encodeURIComponent(now)}&order=generated_at.desc&limit=1`;

    fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        const brief = Array.isArray(data) && data.length > 0 ? data[0] : null;
        if (brief) {
          setFetchedBrief({
            headline: brief.headline,
            content: brief.content,
            generated_at: brief.generated_at,
            sources: brief.sources || [],
            enriched_content: brief.enriched_content || undefined,
            enriched_categories: brief.enriched_categories || undefined,
            enriched_at: brief.enriched_at || undefined,
            neighborhoodName: hood?.name || '',
            neighborhoodId: activeFilter,
            city: hood?.city || '',
          });
        }
        setBriefLoading(false);
      })
      .catch(() => {
        if (!cancelled) setBriefLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeFilter, neighborhoods]);

  // Fetch articles + ads for filtered neighborhood (client-side via REST API)
  useEffect(() => {
    if (activeFilter === null) {
      setFetchedArticles(null);
      setArticlesLoading(false);
      return;
    }

    let cancelled = false;
    setArticlesLoading(true);
    setFetchedArticles(null);
    setHasMoreFiltered(true);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    };

    const articlesUrl = `${supabaseUrl}/rest/v1/articles?select=*,neighborhood:neighborhoods(id,name,city)&status=eq.published&neighborhood_id=eq.${encodeURIComponent(activeFilter)}&order=published_at.desc.nullsfirst&limit=20`;
    const adsUrl = `${supabaseUrl}/rest/v1/ads?select=*&or=(is_global.eq.true,neighborhood_id.eq.${encodeURIComponent(activeFilter)})`;

    Promise.all([
      fetch(articlesUrl, { headers }).then(r => r.json()),
      fetch(adsUrl, { headers }).then(r => r.json()),
    ])
      .then(([articlesData, adsData]) => {
        if (cancelled) return;
        const articles = Array.isArray(articlesData) ? articlesData : [];
        const ads = Array.isArray(adsData) ? adsData : [];

        if (articles.length > 0) {
          const feedItems = injectAds(articles as Article[], ads as Ad[], [activeFilter]);
          setFetchedArticles(feedItems);
          setHasMoreFiltered(articles.length >= 20);
        } else {
          setFetchedArticles([]);
          setHasMoreFiltered(false);
        }
        setArticlesLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch articles:', err);
        if (!cancelled) {
          setFetchedArticles([]);
          setArticlesLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [activeFilter]);

  const handleViewChange = (newView: FeedView) => {
    setView(newView);
    localStorage.setItem(VIEW_PREF_KEY, newView);
  };

  // Drag-to-reorder state (pointer events for reliable cross-browser support)
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragStartX = useRef(0);
  const isDragging = useRef(false);
  const dragIndexRef = useRef<number | null>(null);
  const overIndexRef = useRef<number | null>(null);
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    // Only left mouse / primary touch
    if (e.button !== 0) return;
    dragStartX.current = e.clientX;
    isDragging.current = false;
    dragIndexRef.current = index;
    overIndexRef.current = null;
    setDragIndex(index);
    // Use currentTarget (the button) not target (could be child span)
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIndexRef.current === null) return;
    // Require 8px movement to start drag (prevents accidental drags on click)
    if (!isDragging.current && Math.abs(e.clientX - dragStartX.current) > 8) {
      isDragging.current = true;
    }
    if (!isDragging.current) return;

    // Find which pill the pointer is over
    for (let i = 0; i < pillRefs.current.length; i++) {
      const pill = pillRefs.current[i];
      if (!pill) continue;
      const rect = pill.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        overIndexRef.current = i;
        setOverIndex(i);
        return;
      }
    }
  };

  const handlePointerUp = () => {
    const from = dragIndexRef.current;
    const to = overIndexRef.current;

    if (isDragging.current && from !== null && to !== null && from !== to) {
      // Reorder neighborhoods
      const ids = neighborhoods.map(n => n.id);
      const [movedId] = ids.splice(from, 1);
      ids.splice(to, 0, movedId);

      // Save to localStorage (first item = primary)
      localStorage.setItem('flaneur-neighborhood-preferences', JSON.stringify(ids));

      // Navigate with new order
      router.push(`/feed?neighborhoods=${ids.join(',')}`);
    }
    dragIndexRef.current = null;
    overIndexRef.current = null;
    setDragIndex(null);
    setOverIndex(null);
    // Clear drag flag after a tick so onClick can check it
    setTimeout(() => { isDragging.current = false; }, 0);
  };

  const currentView = isHydrated ? view : defaultView;

  const isMultiple = neighborhoods.length > 1;
  const isEmpty = neighborhoods.length === 0;

  // Use client-fetched articles when a pill is active, otherwise show all server-rendered items
  const filteredItems = activeFilter
    ? (fetchedArticles || [])
    : items;

  // Get active neighborhood info for header
  const activeHood = activeFilter ? neighborhoods.find(n => n.id === activeFilter) : null;

  const loadMoreFiltered = async () => {
    if (!activeFilter || !fetchedArticles) return;
    setMoreLoading(true);
    try {
      // Count only articles (not injected ads) for the offset
      const articleCount = fetchedArticles.filter(i => i.type === 'article').length;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const url = `${supabaseUrl}/rest/v1/articles?select=*,neighborhood:neighborhoods(id,name,city)&status=eq.published&neighborhood_id=eq.${encodeURIComponent(activeFilter)}&order=published_at.desc.nullsfirst&offset=${articleCount}&limit=20`;

      const res = await fetch(url, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      });
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const newItems: FeedItem[] = data.map((article: any) => ({ type: 'article' as const, data: article as Article }));
        setFetchedArticles(prev => [...(prev || []), ...newItems]);
        if (data.length < 20) setHasMoreFiltered(false);
      } else {
        setHasMoreFiltered(false);
      }
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      setMoreLoading(false);
    }
  };

  return (
    <div>
      <BackToTopButton showAfter={400} />

      {/* ── PILL BAR (above masthead for vertical stability) ── */}
      {isMultiple && (
        <div className="sticky top-[60px] z-20 bg-[#050505]/95 backdrop-blur-md">
          <div className="flex items-center gap-1 py-4">
            {/* Left scroll arrow */}
            <button
              onClick={() => scrollPills('left')}
              className={`shrink-0 p-1 transition-opacity ${canScrollLeft ? 'opacity-100 text-neutral-400 hover:text-white' : 'opacity-0 pointer-events-none'}`}
              aria-label="Scroll left"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>

            {/* Scrollable pills */}
            <div
              ref={pillsRef}
              className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1"
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
                  ref={(el) => { pillRefs.current[i] = el; }}
                  onPointerDown={(e) => handlePointerDown(e, i)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onClick={() => { if (isDragging.current) return; setActiveFilter(activeFilter === hood.id ? null : hood.id); }}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium tracking-wide uppercase transition-colors flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none touch-none ${
                    dragIndex === i && isDragging.current ? 'opacity-50' : ''
                  } ${
                    overIndex === i && dragIndex !== null && dragIndex !== i ? 'border-l-2 border-l-amber-500' : ''
                  } ${
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

            {/* Right scroll arrow */}
            <button
              onClick={() => scrollPills('right')}
              className={`shrink-0 p-1 transition-opacity ${canScrollRight ? 'opacity-100 text-neutral-400 hover:text-white' : 'opacity-0 pointer-events-none'}`}
              aria-label="Scroll right"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>

            {/* Divider + Manage button + View Toggle */}
            <div className="shrink-0 flex items-center gap-1 pl-2 border-l border-neutral-800">
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
              <ViewToggle
                view={currentView}
                onChange={isHydrated ? handleViewChange : () => {}}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── MASTHEAD (below pills so pills stay vertically stable) ── */}
      <NeighborhoodHeader
        mode="all"
        city={activeHood?.city || ''}
        citySlug=""
        neighborhoodName={activeHood?.name || 'My Neighborhoods'}
        neighborhoodSlug=""
        neighborhoodId={activeHood?.id || ''}
        hideControlDeck
        neighborhoodCount={activeHood ? undefined : neighborhoods.length}
        timezone={activeHood?.timezone}
        country={activeHood?.country}
        latitude={activeHood?.latitude}
        longitude={activeHood?.longitude}
        comboComponentNames={activeHood?.combo_component_names}
        initialWeather={!activeFilter ? initialWeather : undefined}
      />

      {/* ── DAILY BRIEF ── */}
      {activeFilter === null ? (
        dailyBrief && (
          <div className="mt-4 mb-6">
            {dailyBrief}
          </div>
        )
      ) : briefLoading ? (
        <div className="mt-4 mb-6">
          <NeighborhoodBriefSkeleton />
        </div>
      ) : fetchedBrief ? (
        <div className="mt-4 mb-6">
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
      {activeFilter && articlesLoading ? (
        <div className="space-y-4 py-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-neutral-800 rounded w-3/4 mb-2" />
              <div className="h-3 bg-neutral-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : activeFilter && fetchedArticles?.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-neutral-500">No articles yet for this neighborhood.</p>
        </div>
      ) : (
        <FeedList items={filteredItems} view={currentView} />
      )}

      {/* Load More for filtered view */}
      {activeFilter && fetchedArticles && fetchedArticles.length > 0 && hasMoreFiltered && (
        <div className="mt-4">
          <button
            onClick={loadMoreFiltered}
            disabled={moreLoading}
            className="w-full py-3 text-sm tracking-wide uppercase text-neutral-500 hover:text-white border border-white/[0.08] hover:border-white/20 transition-colors disabled:opacity-50"
          >
            {moreLoading ? 'Loading...' : 'Load More Stories'}
          </button>
        </div>
      )}
    </div>
  );
}
