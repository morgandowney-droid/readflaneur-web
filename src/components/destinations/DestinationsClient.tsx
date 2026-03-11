'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTheme } from '@/hooks/useTheme';
import { useDestinationLists } from '@/hooks/useDestinationLists';
import { resolveSearchQuery } from '@/lib/search-aliases';
import { getGeoRegion, GEO_REGION_ORDER } from '@/lib/region-utils';
import { syncNeighborhoodCookie } from '@/lib/neighborhood-cookie';
import { DestinationsMap } from './DestinationsMap';
import { DestinationCard } from './DestinationCard';
import { RegionFilter } from './RegionFilter';

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
  countries: string[];
}

const PREFS_KEY = 'flaneur-neighborhood-preferences';

export function DestinationsClient({ destinations, countries }: Props) {
  const { theme } = useTheme();
  const { defaultList, addToList, removeFromList, isInList, isLoading: listsLoading } = useDestinationLists();

  const [search, setSearch] = useState('');
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const [showMap, setShowMap] = useState(true);
  const cardListRef = useRef<HTMLDivElement>(null);

  // Check auth
  const [isAuth, setIsAuth] = useState(false);
  useEffect(() => {
    try {
      setIsAuth(!!localStorage.getItem('flaneur-auth'));
    } catch { /* ignore */ }
  }, []);

  // Feed subscription state from localStorage
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

  const isInFeed = useCallback((id: string) => feedIds.has(id), [feedIds]);

  const handleToggleFeed = useCallback((neighborhoodId: string, adding: boolean) => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      let ids: string[] = stored ? JSON.parse(stored) : [];

      if (adding) {
        if (!ids.includes(neighborhoodId)) {
          ids.push(neighborhoodId);
        }
      } else {
        ids = ids.filter(id => id !== neighborhoodId);
      }

      localStorage.setItem(PREFS_KEY, JSON.stringify(ids));
      setFeedIds(new Set(ids));
      syncNeighborhoodCookie();

      // Fire-and-forget DB sync
      if (adding) {
        fetch('/api/neighborhoods/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ neighborhoodId }),
        }).catch(() => {});
      } else {
        fetch('/api/neighborhoods/save-preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ neighborhoodIds: ids }),
        }).catch(() => {});
      }
    } catch { /* ignore */ }
  }, []);

  // Searchable neighborhoods with combo component names
  const searchable = useMemo(() =>
    destinations.map(d => ({ ...d, combo_component_names: undefined })),
    [destinations]
  );

  // Filter destinations
  const filtered = useMemo(() => {
    let results = destinations;

    // Search filter
    if (search.length >= 2) {
      const searchResults = resolveSearchQuery(search, searchable);
      const matchedIds = new Set(searchResults.map(r => r.item.id));
      results = results.filter(d => matchedIds.has(d.id));
    }

    // Region filter
    if (activeRegion) {
      results = results.filter(d => getGeoRegion(d.region) === activeRegion);
    }

    // Country filter
    if (activeCountry) {
      results = results.filter(d => d.country === activeCountry);
    }

    // Map bounds filter (only when map is visible and user has panned)
    if (mapBounds && showMap) {
      results = results.filter(d =>
        d.lat >= mapBounds.south &&
        d.lat <= mapBounds.north &&
        d.lng >= mapBounds.west &&
        d.lng <= mapBounds.east
      );
    }

    return results;
  }, [destinations, searchable, search, activeRegion, activeCountry, mapBounds, showMap]);

  // Group by country for display
  const grouped = useMemo(() => {
    const groups = new Map<string, Destination[]>();
    for (const d of filtered) {
      const key = d.country;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    // Sort countries, then sort neighborhoods within each by city then name
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([country, items]) => ({
        country,
        items: items.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name)),
      }));
  }, [filtered]);

  // Countries available in current filter
  const availableCountries = useMemo(() => {
    let pool = destinations;
    if (activeRegion) {
      pool = pool.filter(d => getGeoRegion(d.region) === activeRegion);
    }
    return [...new Set(pool.map(d => d.country))].sort();
  }, [destinations, activeRegion]);

  const handleToggleFavorite = useCallback(async (neighborhoodId: string) => {
    if (!defaultList) return;
    const inList = isInList(defaultList.id, neighborhoodId);
    if (inList) {
      await removeFromList(defaultList.id, neighborhoodId);
    } else {
      await addToList(defaultList.id, neighborhoodId);
    }
  }, [defaultList, isInList, addToList, removeFromList]);

  const handleCardClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  const handleMapBoundsChange = useCallback((bounds: { north: number; south: number; east: number; west: number }) => {
    setMapBounds(bounds);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setActiveRegion(null);
    setActiveCountry(null);
    setMapBounds(null);
  }, []);

  // Build city slug for links
  const getCitySlug = (city: string) => city.toLowerCase().replace(/\s+/g, '-');
  const getNeighborhoodSlug = (id: string) => {
    const parts = id.split('-');
    // Remove city prefix (e.g., "nyc-tribeca" -> "tribeca")
    if (parts.length > 1) return parts.slice(1).join('-');
    return id;
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-6 md:py-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href="/feed" className="text-xs tracking-[0.15em] uppercase text-fg-muted hover:text-fg transition-colors mb-4 inline-flex items-center gap-1.5">
                <span>&larr;</span> Back to Feed
              </Link>
              <h1 className="font-display text-3xl md:text-4xl tracking-[0.15em] font-light mt-3">
                Destinations
              </h1>
              <p className="text-fg-muted text-sm mt-2">
                {filtered.length} neighborhood{filtered.length !== 1 ? 's' : ''} across {new Set(filtered.map(d => d.city)).size} cities
              </p>
            </div>
            {/* Map toggle - mobile */}
            <button
              onClick={() => setShowMap(!showMap)}
              className="md:hidden text-xs tracking-[0.1em] uppercase text-fg-muted border border-border rounded-lg px-3 py-2 hover:text-fg transition-colors mt-8"
            >
              {showMap ? 'Hide Map' : 'Show Map'}
            </button>
          </div>

          {/* Search + Filters */}
          <div className="mt-6 space-y-4">
            <div className="relative max-w-md">
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setMapBounds(null); }}
                placeholder="Search neighborhoods, cities, countries..."
                className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg text-sm"
                >
                  x
                </button>
              )}
            </div>

            <RegionFilter
              regions={GEO_REGION_ORDER}
              activeRegion={activeRegion}
              onRegionChange={(r) => { setActiveRegion(r); setActiveCountry(null); setMapBounds(null); }}
              countries={availableCountries}
              activeCountry={activeCountry}
              onCountryChange={(c) => { setActiveCountry(c); setMapBounds(null); }}
            />

            {(activeRegion || activeCountry || search) && (
              <button
                onClick={clearFilters}
                className="text-xs text-accent hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main content: split layout */}
      <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row" style={{ height: 'calc(100vh - 180px)' }}>
        {/* Card grid (scrollable) */}
        <div
          ref={cardListRef}
          className="flex-1 overflow-y-auto px-4 md:px-8 py-6"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-fg-muted text-sm">No destinations match your search.</p>
              <button onClick={clearFilters} className="text-accent text-sm mt-2 hover:underline">
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-10">
              {grouped.map(({ country, items }) => (
                <div key={country}>
                  <h2 className="text-[10px] tracking-[0.25em] uppercase text-fg-subtle mb-4 sticky top-0 bg-canvas/95 backdrop-blur-sm py-2 z-10">
                    {country} <span className="text-fg-subtle/50 ml-1">{items.length}</span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map(dest => (
                      <DestinationCard
                        key={dest.id}
                        destination={dest}
                        isFavorite={defaultList ? isInList(defaultList.id, dest.id) : false}
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

        {/* Map (sticky right panel on desktop, collapsible on mobile) */}
        {showMap && (
          <div className="w-full md:w-[45%] lg:w-[50%] h-[70vh] md:h-full border-t md:border-t-0 md:border-l border-border relative">
            <DestinationsMap
              destinations={filtered}
              allDestinations={destinations}
              hoveredId={hoveredId}
              selectedId={selectedId}
              onHover={setHoveredId}
              onSelect={handleCardClick}
              onBoundsChange={handleMapBoundsChange}
              theme={theme}
            />
          </div>
        )}
      </div>
    </div>
  );
}
