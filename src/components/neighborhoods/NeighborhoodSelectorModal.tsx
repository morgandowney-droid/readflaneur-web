'use client';

import { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Neighborhood, GlobalRegion } from '@/types';
import { getDistance } from '@/lib/geo-utils';
import { findCountryForQuery, findRegionForQuery, findStateForQuery } from '@/lib/search-aliases';

// Extend Neighborhood type to include combo info for display
interface NeighborhoodWithCombo extends Neighborhood {
  is_combo?: boolean;
  combo_component_names?: string[];
}

const PREFS_KEY = 'flaneur-neighborhood-preferences';

// Vacation region labels
const VACATION_REGIONS: Record<string, { label: string }> = {
  'us-vacation': { label: 'US Vacation' },
  'caribbean-vacation': { label: 'Caribbean Vacation' },
  'europe-vacation': { label: 'European Vacation' },
  'test': { label: 'Test Lab' },
};

// Surroundings region labels (wealthy suburbs around cities)
const ENCLAVE_REGIONS: Record<string, { label: string }> = {
  'nyc-enclaves': { label: 'New York Surroundings' },
  'stockholm-enclaves': { label: 'Stockholm Surroundings' },
};

// Check if a region is a vacation region (or test region — grouped the same way)
function isVacationRegion(region?: string): boolean {
  return region ? (region.includes('vacation') || region === 'test') : false;
}

// Check if a region is an enclave region
function isEnclaveRegion(region?: string): boolean {
  return region ? region.includes('enclaves') : false;
}

// Modal Context
interface NeighborhoodModalContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const NeighborhoodModalContext = createContext<NeighborhoodModalContextType | null>(null);

export function useNeighborhoodModal() {
  const context = useContext(NeighborhoodModalContext);
  if (!context) {
    throw new Error('useNeighborhoodModal must be used within NeighborhoodModalProvider');
  }
  return context;
}

// Fetch neighborhoods data from API with timeout
async function fetchNeighborhoodsData(timeoutMs: number = 8000): Promise<{
  neighborhoods: NeighborhoodWithCombo[];
  selected: Set<string>;
  userId: string | null;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Fetch neighborhoods from API
    const response = await fetch('/api/neighborhoods', {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const neighborhoods: NeighborhoodWithCombo[] = data.neighborhoods || [];

    // Check auth and load DB preferences (with 3s timeout to avoid hanging)
    let userId: string | null = null;
    let selected = new Set<string>();

    try {
      const authResult = await Promise.race([
        (async () => {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user) return { userId: null as string | null, prefs: [] as string[] };

          const uid = session.user.id;
          const { data: prefs } = await supabase
            .from('user_neighborhood_preferences')
            .select('neighborhood_id')
            .eq('user_id', uid);

          return { userId: uid, prefs: prefs?.map(p => p.neighborhood_id) || [] };
        })(),
        new Promise<{ userId: null; prefs: [] }>((resolve) =>
          setTimeout(() => resolve({ userId: null, prefs: [] }), 3000)
        ),
      ]);

      userId = authResult.userId;
      if (authResult.prefs.length > 0) {
        selected = new Set(authResult.prefs);
      }
    } catch {
      // Auth check failed — fall through to localStorage
    }

    // Fall back to localStorage if no DB preferences
    if (selected.size === 0) {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        try {
          selected = new Set(JSON.parse(stored));

          // Migrate localStorage prefs to DB for logged-in users (fire and forget)
          if (userId && selected.size > 0) {
            const supabase = createClient();
            Promise.resolve(
              supabase
                .from('user_neighborhood_preferences')
                .upsert(
                  Array.from(selected).map(id => ({ user_id: userId, neighborhood_id: id }))
                )
            )
              .then(() => console.log(`Migrated ${selected.size} neighborhood prefs to DB`))
              .catch(() => {});
          }
        } catch {
          // Invalid stored data
        }
      }
    }

    return { neighborhoods, selected, userId };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export function NeighborhoodModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [prefetchedData, setPrefetchedData] = useState<{
    neighborhoods: NeighborhoodWithCombo[];
    selected: Set<string>;
    userId: string | null;
  } | null>(null);

  // Pre-fetch data on mount so modal opens instantly
  useEffect(() => {
    fetchNeighborhoodsData(8000)
      .then(setPrefetchedData)
      .catch((err) => {
        console.error('Prefetch failed:', err);
        // Don't set prefetchedData - modal will fallback to fetching on open
      });
  }, []);

  return (
    <NeighborhoodModalContext.Provider
      value={{
        isOpen,
        openModal: () => setIsOpen(true),
        closeModal: () => setIsOpen(false),
      }}
    >
      {children}
      <GlobalNeighborhoodModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        prefetchedData={prefetchedData}
      />
    </NeighborhoodModalContext.Provider>
  );
}

function GlobalNeighborhoodModal({
  isOpen,
  onClose,
  prefetchedData,
}: {
  isOpen: boolean;
  onClose: () => void;
  prefetchedData: {
    neighborhoods: NeighborhoodWithCombo[];
    selected: Set<string>;
    userId: string | null;
  } | null;
}) {
  const router = useRouter();
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodWithCombo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'nearest'>('name');
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Suggestion feature state
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [suggestionStatus, setSuggestionStatus] = useState<'idle' | 'success'>('idle');
  const suggestionInputRef = useRef<HTMLInputElement>(null);

  // Handle suggestion submission
  const handleSuggestionSubmit = async () => {
    if (!suggestionText.trim()) return;

    try {
      const supabase = createClient();
      await supabase.from('neighborhood_suggestions').insert({
        suggestion: suggestionText.trim(),
        created_at: new Date().toISOString()
      });
    } catch {
      // Silently fail - still show success to user
    }

    setSuggestionStatus('success');

    // Auto-close after 2 seconds
    setTimeout(() => {
      setShowSuggestion(false);
      setSuggestionText('');
      setSuggestionStatus('idle');
    }, 2000);
  };

  // Get user location when sorting by nearest
  const handleSortByNearest = () => {
    if (sortBy === 'nearest') {
      setSortBy('name');
      return;
    }

    if (userLocation) {
      setSortBy('nearest');
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude]);
        setSortBy('nearest');
        setLocationLoading(false);
      },
      () => {
        setLocationLoading(false);
        // Silently fail - just don't sort by nearest
      },
      { timeout: 5000 }
    );
  };

  // Use prefetched data if available, otherwise fetch on open
  useEffect(() => {
    if (!isOpen) return;

    // If we have prefetched data and haven't initialized yet, use it
    if (prefetchedData && !hasInitialized) {
      setNeighborhoods(prefetchedData.neighborhoods);
      setSelected(prefetchedData.selected);
      setUserId(prefetchedData.userId);
      setLoading(false);
      setHasInitialized(true);
      return;
    }

    // If already initialized with data, don't refetch
    if (hasInitialized && neighborhoods.length > 0) return;

    // Fallback: fetch data if not prefetched or prefetch failed
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await fetchNeighborhoodsData(10000);
        setNeighborhoods(data.neighborhoods);
        setSelected(data.selected);
        setUserId(data.userId);
        setHasInitialized(true);
      } catch (err) {
        console.error('Error loading neighborhood data:', err);
        // Still mark as initialized to prevent infinite retry
        setHasInitialized(true);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, prefetchedData, hasInitialized, neighborhoods.length]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Compute dynamic city coordinates by averaging neighborhood lat/lng per group
  const cityCoordinates = useMemo(() => {
    const coords: Record<string, [number, number]> = {};
    const cityLatSums: Record<string, { latSum: number; lngSum: number; count: number }> = {};

    neighborhoods.forEach(n => {
      if (n.latitude == null || n.longitude == null) return;
      // Determine group key the same way as the main grouping below
      let groupKey: string;
      if (isVacationRegion(n.region)) {
        const vacationInfo = VACATION_REGIONS[n.region!];
        groupKey = vacationInfo?.label || n.region!;
      } else if (isEnclaveRegion(n.region)) {
        const enclaveInfo = ENCLAVE_REGIONS[n.region!];
        groupKey = enclaveInfo?.label || n.region!;
      } else {
        groupKey = n.city;
      }

      if (!cityLatSums[groupKey]) {
        cityLatSums[groupKey] = { latSum: 0, lngSum: 0, count: 0 };
      }
      cityLatSums[groupKey].latSum += n.latitude;
      cityLatSums[groupKey].lngSum += n.longitude;
      cityLatSums[groupKey].count++;
    });

    for (const [key, sums] of Object.entries(cityLatSums)) {
      coords[key] = [sums.latSum / sums.count, sums.lngSum / sums.count];
    }

    return coords;
  }, [neighborhoods]);

  // Group neighborhoods by city (or vacation/enclave region) and sort
  const citiesWithNeighborhoods = useMemo(() => {
    interface CityGroup {
      neighborhoods: NeighborhoodWithCombo[];
      isVacation: boolean;
      isEnclave: boolean;
    }
    const map = new Map<string, CityGroup>();

    neighborhoods.forEach(n => {
      // Check if this neighborhood belongs to a vacation region
      if (isVacationRegion(n.region)) {
        const vacationInfo = VACATION_REGIONS[n.region!];
        const groupKey = vacationInfo?.label || n.region!;
        if (!map.has(groupKey)) {
          map.set(groupKey, { neighborhoods: [], isVacation: true, isEnclave: false });
        }
        map.get(groupKey)!.neighborhoods.push(n);
      } else if (isEnclaveRegion(n.region)) {
        // Enclave region grouping
        const enclaveInfo = ENCLAVE_REGIONS[n.region!];
        const groupKey = enclaveInfo?.label || n.region!;
        if (!map.has(groupKey)) {
          map.set(groupKey, { neighborhoods: [], isVacation: false, isEnclave: true });
        }
        map.get(groupKey)!.neighborhoods.push(n);
      } else {
        // Regular city grouping
        if (!map.has(n.city)) {
          map.set(n.city, { neighborhoods: [], isVacation: false, isEnclave: false });
        }
        map.get(n.city)!.neighborhoods.push(n);
      }
    });

    let cities = Array.from(map.entries()).map(([city, data]) => ({
      city,
      neighborhoods: data.neighborhoods,
      isVacation: data.isVacation,
      isEnclave: data.isEnclave,
      distance: userLocation && cityCoordinates[city]
        ? getDistance(userLocation[0], userLocation[1], cityCoordinates[city][0], cityCoordinates[city][1])
        : Infinity,
    }));

    // Sort by distance if sorting by nearest, otherwise alphabetically
    if (sortBy === 'nearest' && userLocation) {
      cities = cities.sort((a, b) => a.distance - b.distance);
    } else {
      cities = cities.sort((a, b) => a.city.localeCompare(b.city));
    }

    return cities;
  }, [neighborhoods, sortBy, userLocation, cityCoordinates]);

  // Filter based on search (includes combo component names + country/region/state)
  const filteredCities = useMemo(() => {
    if (!searchQuery.trim()) return citiesWithNeighborhoods;
    const query = searchQuery.toLowerCase();

    // Check for country/region/state matches
    const matchedCountry = findCountryForQuery(searchQuery);
    const matchedRegion = findRegionForQuery(searchQuery);
    const matchedState = findStateForQuery(searchQuery);
    const stateCities = matchedState?.cities ? new Set(matchedState.cities.map(c => c.toLowerCase())) : null;

    return citiesWithNeighborhoods
      .map(c => ({
        ...c,
        neighborhoods: c.neighborhoods.filter(n => {
          // Direct name/city/component match
          if (n.name.toLowerCase().includes(query)) return true;
          if (n.city.toLowerCase().includes(query)) return true;
          if (n.combo_component_names && n.combo_component_names.some(
            comp => comp.toLowerCase().includes(query)
          )) return true;
          // Country match
          if (matchedCountry && n.country?.toLowerCase() === matchedCountry.toLowerCase()) return true;
          // Region match
          if (matchedRegion && n.region === matchedRegion) return true;
          // State/province match
          if (stateCities && stateCities.has(n.city.toLowerCase())) return true;
          return false;
        }),
      }))
      .filter(c => c.neighborhoods.length > 0);
  }, [citiesWithNeighborhoods, searchQuery]);

  const toggleNeighborhood = async (id: string) => {
    const newSelected = new Set(selected);

    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }

    setSelected(newSelected);

    if (userId) {
      const supabase = createClient();
      if (selected.has(id)) {
        await supabase
          .from('user_neighborhood_preferences')
          .delete()
          .eq('user_id', userId)
          .eq('neighborhood_id', id);
      } else {
        await supabase
          .from('user_neighborhood_preferences')
          .insert({ user_id: userId, neighborhood_id: id });
      }
    } else {
      localStorage.setItem(PREFS_KEY, JSON.stringify(Array.from(newSelected)));
    }
  };

  const selectAllInCity = async (cityNeighborhoods: Neighborhood[]) => {
    const ids = cityNeighborhoods.filter(n => !n.is_coming_soon).map(n => n.id);
    const allSelected = ids.every(id => selected.has(id));

    let newSelected: Set<string>;
    if (allSelected) {
      // Deselect all in this city
      newSelected = new Set(selected);
      ids.forEach(id => newSelected.delete(id));
    } else {
      // Select all in this city
      newSelected = new Set([...selected, ...ids]);
    }

    setSelected(newSelected);

    if (userId) {
      const supabase = createClient();
      if (allSelected) {
        await supabase
          .from('user_neighborhood_preferences')
          .delete()
          .eq('user_id', userId)
          .in('neighborhood_id', ids);
      } else {
        const toAdd = ids.filter(id => !selected.has(id));
        if (toAdd.length > 0) {
          await supabase
            .from('user_neighborhood_preferences')
            .upsert(toAdd.map(id => ({ user_id: userId, neighborhood_id: id })));
        }
      }
    } else {
      localStorage.setItem(PREFS_KEY, JSON.stringify(Array.from(newSelected)));
    }
  };

  const handleExplore = () => {
    if (selected.size > 0) {
      router.push(`/feed?neighborhoods=${Array.from(selected).join(',')}`);
    } else {
      router.push('/neighborhoods');
    }
    onClose();
  };

  const clearAll = async () => {
    setSelected(new Set());
    if (userId) {
      const supabase = createClient();
      Promise.resolve(
        supabase.from('user_neighborhood_preferences').delete().eq('user_id', userId)
      ).then(null, () => {});
    } else {
      localStorage.removeItem(PREFS_KEY);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-backdrop-fade-in"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        ref={modalRef}
        className="absolute inset-4 sm:inset-8 md:inset-12 lg:inset-y-12 lg:inset-x-24 xl:inset-y-16 xl:inset-x-32 bg-neutral-900/90 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-modal-slide-up"
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-light tracking-wide text-white">
              City Index
            </h2>
            <button
              onClick={onClose}
              className="p-2 -m-2 text-neutral-500 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search and Sort */}
          <div className="mt-4 flex gap-3 items-center">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search cities or neighborhoods..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-b border-white/20 text-lg text-white placeholder-neutral-600 py-2 focus:outline-none focus:border-amber-500/50 transition-colors"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Sort by Nearest */}
            <button
              onClick={handleSortByNearest}
              disabled={locationLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap ${
                sortBy === 'nearest'
                  ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                  : 'border-white/20 text-neutral-400 hover:text-white hover:border-white/40'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {locationLoading ? '...' : 'Nearest'}
            </button>

            {/* Selection counter */}
            {selected.size > 0 && (
              <span className="text-xs font-mono text-amber-400 tabular-nums">
                {selected.size}
              </span>
            )}
          </div>
        </div>

        {/* Modal Body - Masonry City Index */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-neutral-700 border-t-amber-400 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-x-8">
              {filteredCities.map(({ city, neighborhoods: cityHoods, distance, isVacation, isEnclave }) => {
                const selectableIds = cityHoods.filter(n => !n.is_coming_soon).map(n => n.id);
                const allInCitySelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

                return (
                <div key={city} className="break-inside-avoid mb-6">
                  {/* City Header */}
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <h3 className={`font-display text-base ${
                      isVacation ? 'text-amber-500' : isEnclave ? 'text-amber-300' : 'text-white'
                    }`}>
                      {city}
                    </h3>
                    <button
                      onClick={() => selectAllInCity(cityHoods)}
                      className={`text-[11px] transition-colors ${
                        allInCitySelected ? 'text-amber-400 hover:text-amber-300' : 'text-neutral-600 hover:text-amber-400'
                      }`}
                    >
                      {allInCitySelected ? 'Deselect' : 'Select all'}
                    </button>
                    {sortBy === 'nearest' && distance < Infinity && (
                      <span className="ml-auto text-xs font-sans text-neutral-600">{Math.round(distance)} km</span>
                    )}
                  </div>

                  {/* Neighborhood Items */}
                  <div className="space-y-0.5">
                    {cityHoods.map(hood => {
                      const isSelected = selected.has(hood.id);
                      const hasComboComponents = hood.combo_component_names && hood.combo_component_names.length > 0;

                      if (hood.is_coming_soon) {
                        return (
                          <div key={hood.id} className="text-sm text-neutral-700 py-0.5 cursor-default">
                            {hood.name} <span className="text-[11px]">(Soon)</span>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={hood.id}
                          onClick={() => toggleNeighborhood(hood.id)}
                          className={`block w-full text-left text-sm py-0.5 transition-colors ${
                            isSelected
                              ? 'text-amber-400 font-medium'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                          title={hasComboComponents ? `Includes: ${hood.combo_component_names!.join(', ')}` : undefined}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {hood.name}
                          {hasComboComponents && (
                            <span className="ml-1 text-[11px] text-neutral-600">({hood.combo_component_names!.length} areas)</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Suggest a Destination */}
          {!loading && !searchQuery && (
            <div className="mt-6 pt-6 border-t border-white/5">
              {!showSuggestion ? (
                <button
                  onClick={() => {
                    setShowSuggestion(true);
                    setTimeout(() => suggestionInputRef.current?.focus(), 50);
                  }}
                  className="text-sm text-neutral-600 hover:text-neutral-400 transition-colors"
                >
                  Not seeing your neighborhood? <span className="underline">Suggest a Destination.</span>
                </button>
              ) : suggestionStatus === 'success' ? (
                <p className="text-sm text-neutral-500">
                  Thank you. We have added this to our radar.
                </p>
              ) : (
                <div className="flex items-center gap-3 max-w-md">
                  <input
                    ref={suggestionInputRef}
                    type="text"
                    value={suggestionText}
                    onChange={(e) => setSuggestionText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSuggestionSubmit()}
                    placeholder="e.g., Notting Hill, London"
                    className="flex-1 bg-transparent border-b border-white/20 text-sm text-white placeholder-neutral-600 py-1.5 focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                  <button
                    onClick={handleSuggestionSubmit}
                    disabled={!suggestionText.trim()}
                    className="px-4 py-1.5 text-sm text-amber-400 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Submit
                  </button>
                  <button
                    onClick={() => {
                      setShowSuggestion(false);
                      setSuggestionText('');
                    }}
                    className="text-neutral-600 hover:text-neutral-400 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Empty State with Suggestion */}
          {!loading && filteredCities.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-neutral-500">No neighborhoods found for &ldquo;{searchQuery}&rdquo;</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-sm text-white font-medium hover:underline"
              >
                Clear search
              </button>

              {/* Suggestion in empty state */}
              <div className="mt-8 pt-6 border-t border-white/5">
                {!showSuggestion ? (
                  <button
                    onClick={() => {
                      setSuggestionText(searchQuery);
                      setShowSuggestion(true);
                      setTimeout(() => suggestionInputRef.current?.focus(), 50);
                    }}
                    className="text-sm text-neutral-600 hover:text-neutral-400 transition-colors"
                  >
                    Not seeing your neighborhood? <span className="underline">Suggest &ldquo;{searchQuery}&rdquo;</span>
                  </button>
                ) : suggestionStatus === 'success' ? (
                  <p className="text-sm text-neutral-500">
                    Thank you. We have added this to our radar.
                  </p>
                ) : (
                  <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
                    <input
                      ref={suggestionInputRef}
                      type="text"
                      value={suggestionText}
                      onChange={(e) => setSuggestionText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSuggestionSubmit()}
                      placeholder="e.g., Notting Hill, London"
                      className="flex-1 bg-transparent border-b border-white/20 text-sm text-white placeholder-neutral-600 py-1.5 focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                    <button
                      onClick={handleSuggestionSubmit}
                      disabled={!suggestionText.trim()}
                      className="px-4 py-1.5 text-sm text-amber-400 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Submit
                    </button>
                    <button
                      onClick={() => {
                        setShowSuggestion(false);
                        setSuggestionText('');
                      }}
                      className="text-neutral-600 hover:text-neutral-400 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-neutral-900/80 backdrop-blur-sm flex items-center justify-between">
          <div className="text-sm text-neutral-500">
            {selected.size > 0 ? (
              <button
                onClick={clearAll}
                className="text-neutral-500 hover:text-white transition-colors"
              >
                Clear all
              </button>
            ) : (
              'Select at least one neighborhood'
            )}
          </div>
          <button
            onClick={handleExplore}
            disabled={selected.size === 0}
            className="px-8 py-2.5 text-[11px] tracking-[0.15em] uppercase font-medium bg-white text-neutral-900 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 rounded-lg"
          >
            {selected.size > 0 ? 'Read Stories' : 'Browse All'}
          </button>
        </div>
      </div>
    </div>
  );
}
