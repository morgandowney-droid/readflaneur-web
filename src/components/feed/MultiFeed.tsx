'use client';

import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FeedItem, Article, Ad } from '@/types';
import { FeedList } from './FeedList';
import { ViewToggle, FeedView } from './ViewToggle';
import { BackToTopButton } from './BackToTopButton';
import { NeighborhoodHeader } from './NeighborhoodHeader';
import { useNeighborhoodModal } from '@/components/neighborhoods/NeighborhoodSelectorModal';
import { injectAds, injectEmailPrompt } from '@/lib/ad-engine';
import { NeighborhoodBrief, NeighborhoodBriefSkeleton } from './NeighborhoodBrief';
import { useTranslation } from '@/hooks/useTranslation';

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
  const { t } = useTranslation();
  const [view, setView] = useState<FeedView>(defaultView);
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [fetchedBrief, setFetchedBrief] = useState<{
    briefId: string;
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

  // Mobile dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Close mobile dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

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

  // Redirect to include neighborhoods from localStorage when URL has none
  // (e.g., user clicked "← All Stories" or "More Stories" from an article page)
  useEffect(() => {
    if (neighborhoods.length > 0) return;
    try {
      const stored = localStorage.getItem('flaneur-neighborhood-preferences');
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids) && ids.length > 0) {
          window.scrollTo(0, 0);
          router.replace(`/feed?neighborhoods=${ids.join(',')}`);
        }
      }
    } catch {}
  }, [neighborhoods.length, router]);

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

    const url = `${supabaseUrl}/rest/v1/neighborhood_briefs?select=id,headline,content,generated_at,sources,enriched_content,enriched_categories,enriched_at&neighborhood_id=eq.${encodeURIComponent(activeFilter)}&expires_at=gt.${encodeURIComponent(now)}&enriched_content=not.is.null&order=generated_at.desc&limit=1`;

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
            briefId: brief.id,
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
          const feedWithAds = injectAds(articles as Article[], ads as Ad[], [activeFilter]);
          const hoodName = neighborhoods.find(n => n.id === activeFilter)?.name;
          const feedItems = injectEmailPrompt(feedWithAds, hoodName);
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

  // Manage button (used by both mobile and desktop)
  const manageButton = (
    <button
      onClick={() => openModal()}
      className="text-fg-subtle hover:text-fg transition-colors p-1.5"
      title="Manage neighborhoods"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="5" cy="4" r="1.5" fill="currentColor" />
        <circle cx="11" cy="8" r="1.5" fill="currentColor" />
        <circle cx="7" cy="12" r="1.5" fill="currentColor" />
      </svg>
    </button>
  );

  const viewToggle = (
    <ViewToggle
      view={currentView}
      onChange={isHydrated ? handleViewChange : () => {}}
    />
  );

  // Desktop: manage + view toggle together
  const controlButtons = (
    <div className="shrink-0 flex items-center gap-1 pl-2 border-l border-border">
      {manageButton}
      {viewToggle}
    </div>
  );

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

      {/* ── NEIGHBORHOOD NAV (above masthead for vertical stability) ── */}
      {isMultiple && (
        <div className="md:sticky md:top-[60px] z-20 md:bg-canvas/95 md:backdrop-blur-md">

          {/* MOBILE: Dropdown + manage button */}
          <div className="md:hidden relative flex items-center gap-2 py-3" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex-1 flex items-center justify-between bg-surface border border-border-strong rounded-lg px-4 py-2.5 text-left min-w-0"
            >
              <div className="min-w-0">
                {activeHood ? (
                  <>
                    <div className="text-sm font-medium text-fg truncate">{activeHood.name}</div>
                    <div className="text-[10px] text-fg-subtle truncate">{activeHood.city}</div>
                  </>
                ) : (
                  <div className="text-sm font-medium text-white">{t('feed.allStories')}</div>
                )}
              </div>
              <svg
                width="16" height="16" viewBox="0 0 16 16" fill="none"
                className={`shrink-0 ml-2 text-fg-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
              >
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute top-full left-0 right-12 mt-1 bg-surface border border-border-strong rounded-lg shadow-2xl max-h-[60vh] overflow-y-auto z-30">
                {/* All Stories option */}
                <button
                  onClick={() => { setActiveFilter(null); setDropdownOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    activeFilter === null ? 'bg-hover' : 'hover:bg-hover'
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-fg-subtle">
                    <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                    <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                    <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                    <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                  <span className="text-sm text-fg font-medium">{t('feed.allStories')}</span>
                  {activeFilter === null && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="ml-auto shrink-0 text-amber-500">
                      <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>

                <div className="border-t border-border" />

                {/* Neighborhood list */}
                {neighborhoods.map((hood, i) => (
                  <button
                    key={hood.id}
                    onClick={() => { setActiveFilter(activeFilter === hood.id ? null : hood.id); setDropdownOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      activeFilter === hood.id ? 'bg-hover' : 'hover:bg-hover'
                    }`}
                  >
                    <span className={`shrink-0 w-2 h-2 rounded-full ${
                      i === 0 ? 'bg-amber-500' : 'bg-fg-subtle'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-fg truncate">{hood.name}</span>
                        {i === 0 && (
                          <span className="text-[8px] tracking-wider font-bold text-amber-500/60 shrink-0">{t('feed.primary').toUpperCase()}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-fg-subtle truncate">{hood.city}</div>
                    </div>
                    {activeFilter === hood.id && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="ml-auto shrink-0 text-amber-500">
                        <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                ))}

                {/* Explore link */}
                <div className="border-t border-border">
                  <button
                    onClick={() => { setDropdownOpen(false); openModal(); }}
                    className="w-full px-4 py-3 text-left text-xs tracking-wide text-fg-subtle hover:text-accent transition-colors"
                  >
                    {t('feed.explore')}
                  </button>
                </div>
              </div>
            )}

            <div className="shrink-0 pl-2 border-l border-border">
              {manageButton}
            </div>
          </div>

          {/* DESKTOP: Pill bar (unchanged) */}
          <div className="hidden md:flex items-center gap-1 py-3">
            {/* Left scroll arrow */}
            <button
              onClick={() => scrollPills('left')}
              className={`shrink-0 p-1 transition-opacity ${canScrollLeft ? 'opacity-100 text-fg-muted hover:text-fg' : 'opacity-0 pointer-events-none'}`}
              aria-label="Scroll left"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>

            {/* Scrollable pills with fade indicators */}
            <div className="relative overflow-hidden flex-1">
              {canScrollLeft && (
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-canvas to-transparent z-10 pointer-events-none" />
              )}
              {canScrollRight && (
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-canvas to-transparent z-10 pointer-events-none" />
              )}
              <div
                ref={pillsRef}
                className="flex items-center gap-2 overflow-x-auto no-scrollbar"
              >
                {/* "All" pill */}
                <button
                  onClick={() => setActiveFilter(null)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium tracking-wide uppercase transition-colors ${
                    activeFilter === null
                      ? 'bg-hover text-fg border border-border-strong'
                      : 'bg-transparent text-fg-muted border border-border hover:border-neutral-500 hover:text-fg'
                  }`}
                >
                  {t('feed.allStories')}
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
                        ? 'bg-hover text-fg border border-border-strong'
                        : 'bg-transparent text-fg-muted border border-border hover:border-neutral-500 hover:text-fg'
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
            </div>

            {/* Right scroll arrow */}
            <button
              onClick={() => scrollPills('right')}
              className={`shrink-0 p-1 transition-opacity ${canScrollRight ? 'opacity-100 text-fg-muted hover:text-fg' : 'opacity-0 pointer-events-none'}`}
              aria-label="Scroll right"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>

            {controlButtons}
          </div>

        </div>
      )}

      {/* ── MASTHEAD (below pills so pills stay vertically stable) ── */}
      <NeighborhoodHeader
        mode="all"
        city={activeHood?.city || ''}
        citySlug=""
        neighborhoodName={activeHood?.name || t('feed.myNeighborhoods')}
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
          <div className="mt-2 mb-6">
            {dailyBrief}
          </div>
        )
      ) : briefLoading ? (
        <div className="mt-2 mb-6">
          <NeighborhoodBriefSkeleton />
        </div>
      ) : fetchedBrief ? (
        <div className="mt-2 mb-6">
          <NeighborhoodBrief
            briefId={fetchedBrief.briefId}
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
        <div className="py-8 text-center">
          <p className="text-sm text-fg-subtle mb-4">
            {t('feed.selectNeighborhoods')}
          </p>
          <button
            onClick={() => openModal()}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm tracking-wide bg-fg text-canvas rounded-lg hover:opacity-80 transition-colors"
          >
            {t('nav.chooseNeighborhoods')}
          </button>
        </div>
      )}

      {reminder}

      {/* MOBILE: View toggle directly above news feed */}
      {isMultiple && (
        <div className="md:hidden flex justify-end pb-2">
          {viewToggle}
        </div>
      )}
      {activeFilter && articlesLoading ? (
        <div className="space-y-4 py-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-elevated rounded w-3/4 mb-2" />
              <div className="h-3 bg-elevated rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : activeFilter && fetchedArticles?.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-fg-subtle">{t('feed.noArticlesNeighborhood')}</p>
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
            className="w-full py-3 text-sm tracking-wide uppercase text-fg-subtle hover:text-fg border border-border hover:border-border-strong transition-colors disabled:opacity-50"
          >
            {moreLoading ? t('general.loading') : t('feed.loadMoreStories')}
          </button>
        </div>
      )}
    </div>
  );
}
