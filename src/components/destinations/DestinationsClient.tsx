'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { resolveSearchQuery } from '@/lib/search-aliases';
import { getGeoRegion, GEO_REGION_ORDER } from '@/lib/region-utils';
import { syncNeighborhoodCookie } from '@/lib/neighborhood-cookie';
import { DestinationsMap } from './DestinationsMap';
import { DestinationCard } from './DestinationCard';
import { useNeighborhoodModal } from '@/components/neighborhoods/NeighborhoodSelectorModal';

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
  countries?: string[];
}

const PREFS_KEY = 'flaneur-neighborhood-preferences';

type SortMode = 'nearest' | 'alphabetical' | 'region';

const REGIONS = GEO_REGION_ORDER.filter(r => r.key !== 'other');

export function DestinationsClient({ destinations, testDestinations = [] }: Props) {
  const { theme } = useTheme();
  const { openModal } = useNeighborhoodModal();

  // Search & sort state
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('nearest');
  const [mapBounds, setMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const [showMap, setShowMap] = useState(true);

  // UI state
  const [sortOpen, setSortOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestText, setSuggestText] = useState('');
  const [suggestEmail, setSuggestEmail] = useState('');
  const [suggestStatus, setSuggestStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

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

  // Filter destinations
  const filtered = useMemo(() => {
    let results = allDestinations;

    // Search
    if (search.length >= 2) {
      const searchResults = resolveSearchQuery(search, searchable);
      const matchedIds = new Set(searchResults.map(r => r.item.id));
      results = results.filter(d => matchedIds.has(d.id));
    }

    // Map bounds
    if (mapBounds && showMap) {
      results = results.filter(d =>
        d.lat >= mapBounds.south && d.lat <= mapBounds.north &&
        d.lng >= mapBounds.west && d.lng <= mapBounds.east
      );
    }

    // Sort
    if (sortMode === 'nearest') {
      if (userLocation) {
        results = [...results].sort((a, b) =>
          haversine(userLocation.lat, userLocation.lng, a.lat, a.lng) -
          haversine(userLocation.lat, userLocation.lng, b.lat, b.lng)
        );
      }
    } else if (sortMode === 'alphabetical') {
      results = [...results].sort((a, b) => a.name.localeCompare(b.name));
    }
    // 'region' sort handled in grouped

    return results;
  }, [allDestinations, searchable, search, mapBounds, showMap, sortMode, userLocation, haversine]);

  // Group by city or region for display
  const grouped = useMemo(() => {
    // Region grouping
    if (sortMode === 'region' || (sortMode === 'nearest' && !userLocation)) {
      const groups = new Map<string, Destination[]>();
      for (const d of filtered) {
        const key = getGeoRegion(d.region);
        const label = REGIONS.find(r => r.key === key)?.label || 'Other';
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label)!.push(d);
      }
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

    if (sortMode === 'nearest' && userLocation) {
      // Group by city, keep proximity order
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

    // Alphabetical: group by country
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

  const handleToggleFavorite = useCallback((neighborhoodId: string) => {
    const isCurrentlyInFeed = feedIds.has(neighborhoodId);
    if (isCurrentlyInFeed) {
      const dest = allDestinations.find(d => d.id === neighborhoodId);
      setConfirmRemove(dest ? { id: dest.id, name: dest.name } : null);
      return;
    }
    handleToggleFeed(neighborhoodId, true);
    const dest = allDestinations.find(d => d.id === neighborhoodId);
    if (dest) {
      setToast(`${dest.name} added to your feed`);
      setTimeout(() => setToast(null), 3000);
    }
  }, [allDestinations, feedIds, handleToggleFeed]);

  const handleConfirmRemove = useCallback(() => {
    if (!confirmRemove) return;
    handleToggleFeed(confirmRemove.id, false);
    setToast(`${confirmRemove.name} removed`);
    setTimeout(() => setToast(null), 3000);
    setConfirmRemove(null);
  }, [confirmRemove, handleToggleFeed]);

  const handleCardClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  // Incremented when search changes to signal the map to fitBounds. Not incremented on map pan/zoom.
  const [fitBoundsKey, setFitBoundsKey] = useState(0);

  const prevSearchRef = useRef(search);
  useEffect(() => {
    if (prevSearchRef.current !== search) {
      setFitBoundsKey(k => k + 1);
      prevSearchRef.current = search;
    }
  }, [search]);

  const handleMapBoundsChange = useCallback((bounds: { north: number; south: number; east: number; west: number }) => {
    setMapBounds(bounds);
  }, []);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return;
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (sortRef.current && !sortRef.current.parentElement?.contains(t)) setSortOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sortOpen]);

  const getCitySlug = (city: string) => city.toLowerCase().replace(/\s+/g, '-');
  const getNeighborhoodSlug = (id: string) => {
    const parts = id.split('-');
    if (parts.length > 1) return parts.slice(1).join('-');
    return id;
  };

  const sortLabels: Record<SortMode, string> = {
    nearest: 'Nearest',
    alphabetical: 'A-Z',
    region: 'Region',
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* Search bar */}
      <div className="border-b border-border sticky top-[var(--header-offset,64px)] bg-canvas/95 backdrop-blur-sm z-20">
        <div className="max-w-[1800px] mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center gap-3">
            {/* Search input */}
            <div className="flex-1 relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setMapBounds(null); }}
                placeholder="Search neighborhoods, cities, countries..."
                className="w-full bg-surface border border-border rounded-lg pl-10 pr-9 py-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-fg/30 transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <button
                ref={sortRef}
                onClick={() => setSortOpen(!sortOpen)}
                className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors whitespace-nowrap py-3 px-3 bg-surface border border-border rounded-lg"
              >
                {sortLabels[sortMode]}
                <svg className={`w-3.5 h-3.5 transition-transform ${sortOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {sortOpen && (
                <div className="absolute top-full mt-1 right-0 w-40 bg-surface border border-border rounded-lg shadow-lg z-30 overflow-hidden">
                  {(['nearest', 'alphabetical', 'region'] as SortMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => { setSortMode(mode); setSortOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        sortMode === mode ? 'bg-fg text-canvas' : 'text-fg-muted hover:bg-elevated hover:text-fg'
                      }`}
                    >
                      {sortLabels[mode]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Table View */}
            <button
              onClick={() => openModal()}
              className="text-sm text-fg-muted hover:text-fg transition-colors whitespace-nowrap py-3 px-3 bg-surface border border-border rounded-lg hidden md:block"
            >
              Table View
            </button>

            {/* Map toggle */}
            <button
              onClick={() => setShowMap(!showMap)}
              className="text-fg-muted hover:text-fg transition-colors py-3 px-3 bg-surface border border-border rounded-lg"
              title={showMap ? 'Hide map' : 'Show map'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
              </svg>
            </button>
          </div>

          {/* Count + suggest row */}
          <div className="flex items-center gap-3 mt-2 text-[12px] text-fg-muted">
            <span>{filtered.length} neighborhood{filtered.length !== 1 ? 's' : ''}</span>
            <span className="text-border">|</span>
            <button
              onClick={() => setShowSuggest(!showSuggest)}
              className="hover:text-fg transition-colors"
            >
              Suggest a neighborhood
            </button>
            {/* Mobile-only Table View */}
            <button
              onClick={() => openModal()}
              className="md:hidden hover:text-fg transition-colors ml-auto"
            >
              Table View
            </button>
          </div>

          {/* Suggest a neighborhood */}
          {showSuggest && (
            <div className="mt-2 pb-1">
              {suggestStatus === 'success' ? (
                <p className="text-xs text-accent">Thank you for your suggestion.</p>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Neighborhood, city, country..."
                    value={suggestText}
                    onChange={e => setSuggestText(e.target.value)}
                    className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-fg/30"
                    autoFocus
                  />
                  <input
                    type="email"
                    placeholder="Email (optional)"
                    value={suggestEmail}
                    onChange={e => setSuggestEmail(e.target.value)}
                    className="w-40 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-fg/30"
                  />
                  <button
                    onClick={async () => {
                      if (!suggestText.trim() || suggestText.trim().length < 3) return;
                      setSuggestStatus('submitting');
                      try {
                        await fetch('/api/suggestions/neighborhood', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ suggestion: suggestText.trim(), email: suggestEmail.trim() || undefined }),
                        });
                      } catch { /* silent */ }
                      setSuggestStatus('success');
                      setTimeout(() => { setShowSuggest(false); setSuggestText(''); setSuggestEmail(''); setSuggestStatus('idle'); }, 2000);
                    }}
                    disabled={suggestText.trim().length < 3 || suggestStatus === 'submitting'}
                    className="px-4 py-2 text-xs tracking-[0.1em] uppercase bg-fg text-canvas rounded-lg hover:bg-fg/90 transition-colors disabled:opacity-30"
                  >
                    {suggestStatus === 'submitting' ? '...' : 'Send'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main content: split layout */}
      <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row md:h-[calc(100vh-120px)]">
        {/* Card grid (scrollable) */}
        <div ref={cardListRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-4 min-h-0 scrollbar-hide">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-fg-muted text-sm">No neighborhoods found.</p>
              {search && (
                <button onClick={() => setSearch('')} className="text-accent text-sm mt-2 hover:underline">
                  Clear search
                </button>
              )}
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

      {/* Confirm remove modal */}
      {confirmRemove && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-lg p-6 max-w-sm mx-4 text-center">
            <p className="text-fg text-sm font-medium mb-2">Remove {confirmRemove.name}?</p>
            <p className="text-fg-muted text-xs mb-5">You will stop receiving daily briefs for this neighborhood.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemove(null)}
                className="flex-1 py-2.5 text-xs tracking-[0.1em] uppercase border border-border text-fg-muted rounded-lg hover:text-fg transition-colors"
              >
                Keep
              </button>
              <button
                onClick={handleConfirmRemove}
                className="flex-1 py-2.5 text-xs tracking-[0.1em] uppercase bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

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
