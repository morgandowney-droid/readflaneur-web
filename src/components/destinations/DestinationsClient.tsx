'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTheme } from '@/hooks/useTheme';
import { resolveSearchQuery } from '@/lib/search-aliases';
import { getGeoRegion, GEO_REGION_ORDER } from '@/lib/region-utils';
import { syncNeighborhoodCookie } from '@/lib/neighborhood-cookie';
import { DestinationsMap } from './DestinationsMap';
import { DestinationCard } from './DestinationCard';

export interface Destination {
  id: string;
  name: string;
  city: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  isCombo: boolean;
  isCommunity: boolean;
  imageUrl: string | null;
  photographer: string | null;
}

interface Props {
  destinations: Destination[];
  testDestinations?: Destination[];
  countries: string[];
}

const PREFS_KEY = 'flaneur-neighborhood-preferences';

// Coastal countries (Mediterranean + tropical + island destinations)
const COASTAL_COUNTRIES = new Set([
  'France', 'Italy', 'Spain', 'Greece', 'Portugal', 'Croatia', 'Turkey',
  'Morocco', 'Thailand', 'Indonesia', 'Vietnam', 'Australia',
  'Mexico', 'Brazil', 'Colombia', 'Japan',
]);

// Mountain/slopes countries & cities
const SLOPES_COUNTRIES = new Set([
  'Switzerland', 'Austria', 'Norway', 'Iceland',
]);
const SLOPES_CITIES = new Set([
  'Chamonix', 'Megeve', 'Verbier', 'Zermatt', 'St. Moritz', 'Aspen', 'Innsbruck',
]);

type SortMode = 'recommended' | 'alphabetical' | 'region';
type ThemeFilter = 'coastal' | 'slopes' | null;

const REGIONS = GEO_REGION_ORDER.filter(r => r.key !== 'other');

export function DestinationsClient({ destinations, testDestinations = [], countries }: Props) {
  const { theme } = useTheme();

  // Filter state
  const [search, setSearch] = useState('');
  const [activeRegions, setActiveRegions] = useState<Set<string>>(new Set());
  const [activeCountries, setActiveCountries] = useState<Set<string>>(new Set());
  const [neighborhoodType, setNeighborhoodType] = useState<'all' | 'featured' | 'community'>('all');
  const [themeFilter, setThemeFilter] = useState<ThemeFilter>(null);
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [mapBounds, setMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const [showMap, setShowMap] = useState(true);

  // UI state
  const [allFiltersOpen, setAllFiltersOpen] = useState(false);
  const [coastalOpen, setCoastalOpen] = useState(false);
  const [slopesOpen, setSlopesOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Test neighborhoods toggle (off by default, persisted in localStorage)
  const [showTestNeighborhoods, setShowTestNeighborhoods] = useState(false);
  useEffect(() => {
    try {
      setShowTestNeighborhoods(localStorage.getItem('flaneur-show-test') === 'true');
    } catch { /* ignore */ }
  }, []);

  // Merge test neighborhoods into destinations when toggle is on
  const allDestinations = useMemo(() => {
    if (!showTestNeighborhoods || testDestinations.length === 0) return destinations;
    const existingIds = new Set(destinations.map(d => d.id));
    const newTest = testDestinations.filter(d => !existingIds.has(d.id));
    return [...destinations, ...newTest];
  }, [destinations, testDestinations, showTestNeighborhoods]);

  const cardListRef = useRef<HTMLDivElement>(null);
  const coastalRef = useRef<HTMLButtonElement>(null);
  const slopesRef = useRef<HTMLButtonElement>(null);
  const collectionsRef = useRef<HTMLButtonElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);

  // Auth
  const [isAuth, setIsAuth] = useState(false);
  useEffect(() => {
    try { setIsAuth(!!localStorage.getItem('flaneur-auth')); } catch { /* ignore */ }
  }, []);

  // Feed subscription state
  const [feedIds, setFeedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) setFeedIds(new Set(ids));
      }
    } catch { /* ignore */ }
  }, []);

  // Geolocation for "recommended" sort
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* denied, fall back to alphabetical */ },
      { timeout: 5000, maximumAge: 300000 }
    );
  }, []);

  const isInFeed = useCallback((id: string) => feedIds.has(id), [feedIds]);

  const handleToggleFeed = useCallback((neighborhoodId: string, adding: boolean) => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      let ids: string[] = stored ? JSON.parse(stored) : [];
      if (adding) {
        if (!ids.includes(neighborhoodId)) ids.push(neighborhoodId);
      } else {
        ids = ids.filter(id => id !== neighborhoodId);
      }
      localStorage.setItem(PREFS_KEY, JSON.stringify(ids));
      setFeedIds(new Set(ids));
      syncNeighborhoodCookie();
      if (adding) {
        fetch('/api/neighborhoods/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ neighborhoodId }) }).catch(() => {});
      } else {
        fetch('/api/neighborhoods/save-preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ neighborhoodIds: ids }) }).catch(() => {});
      }
    } catch { /* ignore */ }
  }, []);

  // Searchable list
  const searchable = useMemo(() =>
    allDestinations.map(d => ({ ...d, combo_component_names: undefined })),
    [allDestinations]
  );

  // Haversine distance
  const haversine = useCallback((lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  // Active filter count (for badge on ALL FILTERS button)
  const activeFilterCount = activeRegions.size + activeCountries.size + (neighborhoodType !== 'all' ? 1 : 0) + (search ? 1 : 0);

  // Filter destinations
  const filtered = useMemo(() => {
    let results = allDestinations;

    // Search
    if (search.length >= 2) {
      const searchResults = resolveSearchQuery(search, searchable);
      const matchedIds = new Set(searchResults.map(r => r.item.id));
      results = results.filter(d => matchedIds.has(d.id));
    }

    // Region filter
    if (activeRegions.size > 0) {
      results = results.filter(d => activeRegions.has(getGeoRegion(d.region)));
    }

    // Country filter
    if (activeCountries.size > 0) {
      results = results.filter(d => activeCountries.has(d.country));
    }

    // Neighborhood type
    if (neighborhoodType === 'featured') results = results.filter(d => !d.isCommunity);
    if (neighborhoodType === 'community') results = results.filter(d => d.isCommunity);

    // Theme filter (Coastal / Slopes)
    if (themeFilter === 'coastal') {
      results = results.filter(d => COASTAL_COUNTRIES.has(d.country));
    }
    if (themeFilter === 'slopes') {
      results = results.filter(d => SLOPES_COUNTRIES.has(d.country) || SLOPES_CITIES.has(d.city));
    }

    // Map bounds
    if (mapBounds && showMap) {
      results = results.filter(d =>
        d.lat >= mapBounds.south && d.lat <= mapBounds.north &&
        d.lng >= mapBounds.west && d.lng <= mapBounds.east
      );
    }

    // Sort
    if (sortMode === 'recommended') {
      if (userLocation) {
        // Sort by geographic proximity to user
        results = [...results].sort((a, b) =>
          haversine(userLocation.lat, userLocation.lng, a.lat, a.lng) -
          haversine(userLocation.lat, userLocation.lng, b.lat, b.lng)
        );
      }
      // Without location, region grouping is applied in the `grouped` memo below
    } else if (sortMode === 'alphabetical') {
      results = [...results].sort((a, b) => a.name.localeCompare(b.name));
    }
    // 'region' sort handled in grouped

    return results;
  }, [allDestinations, searchable, search, activeRegions, activeCountries, neighborhoodType, themeFilter, mapBounds, showMap, sortMode, userLocation, haversine]);

  // Group by country or region for display
  const grouped = useMemo(() => {
    // Region grouping (used by 'region' sort AND 'recommended' without location)
    if (sortMode === 'region' || (sortMode === 'recommended' && !userLocation)) {
      const groups = new Map<string, Destination[]>();
      for (const d of filtered) {
        const key = getGeoRegion(d.region);
        const label = REGIONS.find(r => r.key === key)?.label || 'Other';
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label)!.push(d);
      }
      // Use REGIONS order for consistent region ordering
      const regionOrder = REGIONS.map(r => r.label);
      return Array.from(groups.entries())
        .sort(([a], [b]) => {
          const ia = regionOrder.indexOf(a);
          const ib = regionOrder.indexOf(b);
          return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        })
        .map(([label, items]) => ({
          country: label,
          items: items.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name)),
        }));
    }

    if (sortMode === 'recommended' && userLocation) {
      // Group by city, keep proximity order from sorted filtered array
      const groups = new Map<string, Destination[]>();
      for (const d of filtered) {
        if (!groups.has(d.city)) groups.set(d.city, []);
        groups.get(d.city)!.push(d);
      }
      const seen = new Set<string>();
      const ordered: { country: string; items: Destination[] }[] = [];
      for (const d of filtered) {
        if (!seen.has(d.city)) {
          seen.add(d.city);
          ordered.push({ country: `${d.city}, ${d.country}`, items: groups.get(d.city)! });
        }
      }
      return ordered;
    }

    // Default: group by country alphabetically
    const groups = new Map<string, Destination[]>();
    for (const d of filtered) {
      if (!groups.has(d.country)) groups.set(d.country, []);
      groups.get(d.country)!.push(d);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([country, items]) => ({
        country,
        items: items.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name)),
      }));
  }, [filtered, sortMode, userLocation]);

  // Countries available within current region selection
  const availableCountries = useMemo(() => {
    let pool = allDestinations;
    if (activeRegions.size > 0) {
      pool = pool.filter(d => activeRegions.has(getGeoRegion(d.region)));
    }
    return [...new Set(pool.map(d => d.country))].sort();
  }, [allDestinations, activeRegions]);

  // Region counts
  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of allDestinations) {
      const r = getGeoRegion(d.region);
      counts[r] = (counts[r] || 0) + 1;
    }
    return counts;
  }, [allDestinations]);

  // Country counts
  const countryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of allDestinations) {
      counts[d.country] = (counts[d.country] || 0) + 1;
    }
    return counts;
  }, [allDestinations]);

  const handleToggleFavorite = useCallback((neighborhoodId: string) => {
    const isCurrentlyInFeed = feedIds.has(neighborhoodId);
    handleToggleFeed(neighborhoodId, !isCurrentlyInFeed);
    const dest = allDestinations.find(d => d.id === neighborhoodId);
    if (dest) {
      setToast(isCurrentlyInFeed ? `${dest.name} removed from your feed` : `${dest.name} added to your feed`);
      setTimeout(() => setToast(null), 3000);
    }
  }, [allDestinations, feedIds, handleToggleFeed]);

  const handleCardClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  // Incremented when filter/search changes to signal the map to fitBounds. Not incremented on map pan/zoom.
  const [fitBoundsKey, setFitBoundsKey] = useState(0);

  // Bump fitBoundsKey when any filter (not map bounds) changes
  const prevFiltersRef = useRef({ search, activeRegions, activeCountries, neighborhoodType, themeFilter });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (prev.search !== search || prev.activeRegions !== activeRegions || prev.activeCountries !== activeCountries || prev.neighborhoodType !== neighborhoodType || prev.themeFilter !== themeFilter) {
      setFitBoundsKey(k => k + 1);
      prevFiltersRef.current = { search, activeRegions, activeCountries, neighborhoodType, themeFilter };
    }
  }, [search, activeRegions, activeCountries, neighborhoodType, themeFilter]);

  const handleMapBoundsChange = useCallback((bounds: { north: number; south: number; east: number; west: number }) => {
    setMapBounds(bounds);
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearch('');
    setActiveRegions(new Set());
    setActiveCountries(new Set());
    setNeighborhoodType('all');
    setThemeFilter(null);
    setMapBounds(null);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (coastalOpen && coastalRef.current && !coastalRef.current.parentElement?.contains(t)) setCoastalOpen(false);
      if (slopesOpen && slopesRef.current && !slopesRef.current.parentElement?.contains(t)) setSlopesOpen(false);
      if (collectionsOpen && collectionsRef.current && !collectionsRef.current.parentElement?.contains(t)) setCollectionsOpen(false);
      if (sortOpen && sortRef.current && !sortRef.current.parentElement?.contains(t)) setSortOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [coastalOpen, slopesOpen, collectionsOpen, sortOpen]);

  const closeAllDropdowns = () => {
    setCoastalOpen(false);
    setSlopesOpen(false);
    setCollectionsOpen(false);
    setSortOpen(false);
  };

  const toggleRegion = (key: string) => {
    setActiveRegions(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleCountry = (c: string) => {
    setActiveCountries(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const getCitySlug = (city: string) => city.toLowerCase().replace(/\s+/g, '-');
  const getNeighborhoodSlug = (id: string) => {
    const parts = id.split('-');
    if (parts.length > 1) return parts.slice(1).join('-');
    return id;
  };

  // Unique city count
  const cityCount = useMemo(() => new Set(allDestinations.map(d => d.city)).size, [allDestinations]);

  return (
    <div className="min-h-screen bg-canvas">
      {/* Filter Bar - LC style: exactly 4 buttons, no page heading */}
      <div className="border-b border-border sticky top-[var(--header-offset,64px)] bg-canvas/95 backdrop-blur-sm z-20">
        <div className="max-w-[1800px] mx-auto px-4 md:px-6">
          {/* 4 filter buttons */}
          <div className="flex items-center gap-0 py-2.5 overflow-x-auto md:overflow-x-visible scrollbar-hide">
            {/* 1. ALL FILTERS */}
            <button
              onClick={() => { closeAllDropdowns(); setAllFiltersOpen(true); }}
              className={`flex items-center gap-2 text-[13px] tracking-[0.08em] uppercase py-2 transition-colors whitespace-nowrap hover:text-fg ${
                activeFilterCount > 0 ? 'text-fg' : 'text-fg-muted'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
              </svg>
              All Filters
            </button>

            {/* 2. COASTAL */}
            <div className="relative ml-6">
              <button
                ref={coastalRef}
                onClick={() => { closeAllDropdowns(); setCoastalOpen(!coastalOpen); }}
                className={`text-[13px] tracking-[0.08em] uppercase py-2 transition-colors whitespace-nowrap hover:text-fg ${
                  themeFilter === 'coastal' ? 'text-fg' : 'text-fg-muted'
                }`}
              >
                Coastal
              </button>
              {coastalOpen && (
                <div className="absolute top-full mt-2 left-0 w-[320px] bg-surface border border-border shadow-lg p-6 z-30">
                  <p className="text-sm text-fg mb-2">Coastal</p>
                  <p className="text-xs text-fg-muted leading-relaxed mb-4">
                    Sun-drenched neighborhoods along the world's most desirable coastlines.
                  </p>
                  <Link
                    href="/destinations/coastal"
                    className="text-sm text-fg underline decoration-dotted underline-offset-4 hover:decoration-solid"
                    onClick={() => setCoastalOpen(false)}
                  >
                    See the selection
                  </Link>
                  <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
                    <button
                      onClick={() => { setThemeFilter(null); setCoastalOpen(false); }}
                      className="flex-1 text-[11px] tracking-[0.15em] uppercase py-2.5 border border-border text-fg-muted hover:text-fg transition-colors"
                    >
                      Erase All
                    </button>
                    <button
                      onClick={() => { setThemeFilter('coastal'); setCoastalOpen(false); }}
                      className="flex-1 text-[11px] tracking-[0.15em] uppercase py-2.5 bg-fg text-canvas hover:opacity-90 transition-opacity"
                    >
                      Select
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. SLOPES */}
            <div className="relative ml-6">
              <button
                ref={slopesRef}
                onClick={() => { closeAllDropdowns(); setSlopesOpen(!slopesOpen); }}
                className={`text-[13px] tracking-[0.08em] uppercase py-2 transition-colors whitespace-nowrap hover:text-fg ${
                  themeFilter === 'slopes' ? 'text-fg' : 'text-fg-muted'
                }`}
              >
                Slopes
              </button>
              {slopesOpen && (
                <div className="absolute top-full mt-2 left-0 w-[320px] bg-surface border border-border shadow-lg p-6 z-30">
                  <p className="text-sm text-fg mb-2">Slopes</p>
                  <p className="text-xs text-fg-muted leading-relaxed mb-4">
                    Alpine villages and mountain neighborhoods near the world's finest ski resorts and hiking trails.
                  </p>
                  <Link
                    href="/destinations/slopes"
                    className="text-sm text-fg underline decoration-dotted underline-offset-4 hover:decoration-solid"
                    onClick={() => setSlopesOpen(false)}
                  >
                    See the selection
                  </Link>
                  <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
                    <button
                      onClick={() => { setThemeFilter(null); setSlopesOpen(false); }}
                      className="flex-1 text-[11px] tracking-[0.15em] uppercase py-2.5 border border-border text-fg-muted hover:text-fg transition-colors"
                    >
                      Erase All
                    </button>
                    <button
                      onClick={() => { setThemeFilter('slopes'); setSlopesOpen(false); }}
                      className="flex-1 text-[11px] tracking-[0.15em] uppercase py-2.5 bg-fg text-canvas hover:opacity-90 transition-opacity"
                    >
                      Select
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. COLLECTIONS */}
            <div className="relative ml-6">
              <button
                ref={collectionsRef}
                onClick={() => { closeAllDropdowns(); setCollectionsOpen(!collectionsOpen); }}
                className={`text-[13px] tracking-[0.08em] uppercase py-2 text-fg-muted transition-colors whitespace-nowrap hover:text-fg`}
              >
                Collections
              </button>
              {collectionsOpen && (
                <div className="absolute top-full mt-2 left-0 w-[380px] bg-surface border border-border shadow-lg p-6 z-30">
                  <p className="text-xs text-fg-muted leading-relaxed mb-1">Our collections</p>
                  <p className="text-xs text-fg-muted leading-relaxed mb-5">
                    Editorially curated neighborhoods, each representing a distinct experience and character.
                  </p>
                  <p className="text-[10px] tracking-[0.15em] uppercase text-fg-subtle mb-4">Learn More</p>
                  <div className="space-y-3">
                    <CollectionItem
                      name="The Metropolitan Collection"
                      description="The world's most vibrant urban neighborhoods - culture, dining, and nightlife at your doorstep."
                      onSelect={() => { setActiveRegions(new Set()); setThemeFilter(null); setNeighborhoodType('featured'); setCollectionsOpen(false); }}
                    />
                    <CollectionItem
                      name="The Discovery Collection"
                      description="Community-created hidden gems and emerging neighborhoods off the beaten path."
                      onSelect={() => { setNeighborhoodType('community'); setCollectionsOpen(false); }}
                    />
                    <CollectionItem
                      name="The Weekend Edition"
                      description="Perfect for a weekend escape - charming towns and villages within reach of major cities."
                      onSelect={() => { setCollectionsOpen(false); }}
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
                    <button
                      onClick={() => { clearAllFilters(); setCollectionsOpen(false); }}
                      className="flex-1 text-[11px] tracking-[0.15em] uppercase py-2.5 border border-border text-fg-muted hover:text-fg transition-colors"
                    >
                      Erase All
                    </button>
                    <button
                      onClick={() => setCollectionsOpen(false)}
                      className="flex-1 text-[11px] tracking-[0.15em] uppercase py-2.5 bg-fg text-canvas hover:opacity-90 transition-opacity"
                    >
                      Select
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Count + Sort row (below buttons, like LC) */}
          <div className="flex items-center gap-3 pb-2 text-[12px] text-fg-muted">
            <span>{filtered.length} neighborhood{filtered.length !== 1 ? 's' : ''}</span>
            <span className="text-border">|</span>
            <div className="relative">
              <button
                ref={sortRef}
                onClick={() => setSortOpen(!sortOpen)}
                className="flex items-center gap-1 hover:text-fg transition-colors"
              >
                Sort by: <span className="text-fg">{sortMode}</span>
                <svg className={`w-3 h-3 transition-transform ${sortOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {sortOpen && (
                <div className="absolute top-full mt-1 left-0 w-52 bg-surface border border-border shadow-lg z-30 overflow-hidden">
                  {(['recommended', 'alphabetical', 'region'] as SortMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => { setSortMode(mode); setSortOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                        sortMode === mode ? 'bg-fg text-canvas' : 'text-fg-muted hover:bg-elevated hover:text-fg'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Map toggle - minimal, right-aligned */}
            <div className="flex-1" />
            <button
              onClick={() => setShowMap(!showMap)}
              className="text-fg-muted hover:text-fg transition-colors"
              title={showMap ? 'Hide map' : 'Show map'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                {showMap ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                )}
              </svg>
            </button>
          </div>

          {/* Active filter tags */}
          {(themeFilter || activeRegions.size > 0 || activeCountries.size > 0 || neighborhoodType !== 'all') && (
            <div className="flex items-center gap-2 pb-2 flex-wrap">
              {themeFilter && (
                <button
                  onClick={() => setThemeFilter(null)}
                  className="text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 border border-fg/30 text-fg rounded-sm flex items-center gap-1.5 hover:border-fg transition-colors"
                >
                  {themeFilter} <span className="text-fg-muted">&times;</span>
                </button>
              )}
              {[...activeRegions].map(r => (
                <button
                  key={r}
                  onClick={() => toggleRegion(r)}
                  className="text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 border border-fg/30 text-fg rounded-sm flex items-center gap-1.5 hover:border-fg transition-colors"
                >
                  {REGIONS.find(reg => reg.key === r)?.label || r} <span className="text-fg-muted">&times;</span>
                </button>
              ))}
              {[...activeCountries].map(c => (
                <button
                  key={c}
                  onClick={() => toggleCountry(c)}
                  className="text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 border border-fg/30 text-fg rounded-sm flex items-center gap-1.5 hover:border-fg transition-colors"
                >
                  {c} <span className="text-fg-muted">&times;</span>
                </button>
              ))}
              {neighborhoodType !== 'all' && (
                <button
                  onClick={() => setNeighborhoodType('all')}
                  className="text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 border border-fg/30 text-fg rounded-sm flex items-center gap-1.5 hover:border-fg transition-colors"
                >
                  {neighborhoodType} <span className="text-fg-muted">&times;</span>
                </button>
              )}
              <button
                onClick={clearAllFilters}
                className="text-[10px] tracking-[0.1em] uppercase text-fg-muted hover:text-fg transition-colors ml-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ALL FILTERS Panel - slide-out from left */}
      {allFiltersOpen && (
        <div className="fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setAllFiltersOpen(false)}
          />
          {/* Panel */}
          <div className="absolute left-0 top-0 bottom-0 w-full sm:w-[380px] bg-canvas border-r border-border overflow-hidden flex flex-col animate-slide-in-left">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-[13px] tracking-[0.2em] uppercase font-medium">All Filters</h2>
              <button onClick={() => setAllFiltersOpen(false)} className="text-fg-muted hover:text-fg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Search */}
              <div className="px-6 py-4 border-b border-border">
                <input
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setMapBounds(null); }}
                  placeholder="Search neighborhoods, cities..."
                  className="w-full bg-surface border border-border rounded-sm px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-fg transition-colors"
                />
              </div>

              {/* REGION section */}
              <FilterSection title="Region">
                {REGIONS.map(r => (
                  <label key={r.key} className="flex items-center gap-3 py-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={activeRegions.has(r.key)}
                      onChange={() => toggleRegion(r.key)}
                      className="w-4 h-4 rounded-sm border-border accent-fg"
                    />
                    <span className="text-sm text-fg-muted group-hover:text-fg transition-colors flex-1">{r.label}</span>
                    <span className="text-xs text-fg-subtle">{regionCounts[r.key] || 0}</span>
                  </label>
                ))}
              </FilterSection>

              {/* COUNTRY section */}
              <FilterSection title="Country">
                <div className="max-h-48 overflow-y-auto space-y-0">
                  {availableCountries.map(c => (
                    <label key={c} className="flex items-center gap-3 py-1.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={activeCountries.has(c)}
                        onChange={() => toggleCountry(c)}
                        className="w-4 h-4 rounded-sm border-border accent-fg"
                      />
                      <span className="text-sm text-fg-muted group-hover:text-fg transition-colors flex-1">{c}</span>
                      <span className="text-xs text-fg-subtle">{countryCounts[c] || 0}</span>
                    </label>
                  ))}
                </div>
              </FilterSection>

              {/* NEIGHBORHOOD TYPE section */}
              <FilterSection title="Neighborhood Type">
                {[
                  { key: 'all' as const, label: 'All neighborhoods' },
                  { key: 'featured' as const, label: 'Featured' },
                  { key: 'community' as const, label: 'Community Created' },
                ].map(t => (
                  <label key={t.key} className="flex items-center gap-3 py-1.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={neighborhoodType === t.key}
                      onChange={() => setNeighborhoodType(neighborhoodType === t.key ? 'all' : t.key)}
                      className="w-4 h-4 rounded-sm border-border accent-fg"
                    />
                    <span className="text-sm text-fg-muted group-hover:text-fg transition-colors">{t.label}</span>
                  </label>
                ))}
              </FilterSection>

              {/* ENVIRONMENT section */}
              <FilterSection title="Environment">
                <label className="flex items-center gap-3 py-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={themeFilter === 'coastal'}
                    onChange={() => setThemeFilter(themeFilter === 'coastal' ? null : 'coastal')}
                    className="w-4 h-4 rounded-sm border-border accent-fg"
                  />
                  <span className="text-sm text-fg-muted group-hover:text-fg transition-colors">Coastal</span>
                </label>
                <label className="flex items-center gap-3 py-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={themeFilter === 'slopes'}
                    onChange={() => setThemeFilter(themeFilter === 'slopes' ? null : 'slopes')}
                    className="w-4 h-4 rounded-sm border-border accent-fg"
                  />
                  <span className="text-sm text-fg-muted group-hover:text-fg transition-colors">Mountain / Slopes</span>
                </label>
              </FilterSection>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-6 py-4 border-t border-border bg-canvas">
              <button
                onClick={clearAllFilters}
                className="flex-1 text-[10px] tracking-[0.15em] uppercase py-3 border border-border rounded-sm text-fg-muted hover:text-fg transition-colors"
              >
                Erase All
              </button>
              <button
                onClick={() => setAllFiltersOpen(false)}
                className="flex-1 text-[10px] tracking-[0.15em] uppercase py-3 bg-fg text-canvas rounded-sm hover:opacity-90 transition-opacity"
              >
                See {filtered.length} Neighborhoods
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content: split layout */}
      <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row md:h-[calc(100vh-120px)]">
        {/* Card grid (scrollable) */}
        <div ref={cardListRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-4 min-h-0 scrollbar-hide">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-fg-muted text-sm">No destinations match your filters.</p>
              <button onClick={clearAllFilters} className="text-accent text-sm mt-2 hover:underline">
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(({ country, items }) => (
                <div key={country}>
                  <h2 className="text-[10px] tracking-[0.25em] uppercase text-fg-subtle mb-3 sticky top-0 bg-canvas py-2 z-10 border-b border-border/30">
                    {country} <span className="text-fg-subtle/50 ml-1">{items.length}</span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                    {items.map(dest => (
                      <DestinationCard
                        key={dest.id}
                        destination={dest}
                        isFavorite={isInFeed(dest.id)}
                        isInFeed={isInFeed(dest.id)}
                        isAuth={isAuth}
                        isHovered={hoveredId === dest.id}
                        isSelected={selectedId === dest.id}
                        onHover={setHoveredId}
                        onClick={handleCardClick}
                        onToggleFavorite={handleToggleFavorite}
                        onToggleFeed={handleToggleFeed}
                        citySlug={getCitySlug(dest.city)}
                        neighborhoodSlug={getNeighborhoodSlug(dest.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Map */}
        {showMap && (
          <div className="w-full md:w-[40%] lg:w-[45%] h-[50vh] md:h-full border-t md:border-t-0 md:border-l border-border relative flex-shrink-0">
            <DestinationsMap
              destinations={filtered}
              allDestinations={allDestinations}
              hoveredId={hoveredId}
              selectedId={selectedId}
              onHover={setHoveredId}
              onSelect={handleCardClick}
              onBoundsChange={handleMapBoundsChange}
              theme={theme}
              fitBoundsKey={fitBoundsKey}
            />
          </div>
        )}
      </div>

      {/* Toast confirmation */}
      {toast && (
        <div className="fixed top-6 right-6 z-[10000] bg-fg text-canvas px-5 py-3 rounded-sm shadow-lg text-sm font-medium animate-fade-in">
          {toast}
        </div>
      )}

      {/* Test neighborhoods toggle */}
      {testDestinations.length > 0 && (
        <button
          onClick={() => {
            const next = !showTestNeighborhoods;
            setShowTestNeighborhoods(next);
            try { localStorage.setItem('flaneur-show-test', String(next)); } catch { /* ignore */ }
          }}
          className={`fixed bottom-4 left-4 z-40 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-mono font-bold transition-all ${
            showTestNeighborhoods
              ? 'bg-accent text-canvas'
              : 'bg-surface/60 text-fg-subtle hover:text-fg-muted border border-border'
          }`}
          title={showTestNeighborhoods ? 'Hide test neighborhoods' : 'Show test neighborhoods'}
        >
          MD
        </button>
      )}
    </div>
  );
}

// --- Sub-components ---

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="px-6 py-4 border-b border-border">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full mb-3"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase font-medium text-fg">{title}</span>
        <span className="text-fg-muted text-sm">{collapsed ? '+' : '\u2014'}</span>
      </button>
      {!collapsed && <div className="space-y-0">{children}</div>}
    </div>
  );
}

function CollectionItem({ name, description, onSelect }: { name: string; description: string; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left border border-border rounded-sm p-4 hover:border-fg transition-colors group"
    >
      <p className="text-sm font-medium text-fg mb-1">{name}</p>
      <p className="text-xs text-fg-muted leading-relaxed">{description}</p>
    </button>
  );
}
