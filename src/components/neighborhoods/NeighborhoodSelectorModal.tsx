'use client';

import { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Neighborhood, GlobalRegion } from '@/types';
import { getCityCode } from '@/lib/neighborhood-utils';

// Extend Neighborhood type to include combo info for display
interface NeighborhoodWithCombo extends Neighborhood {
  is_combo?: boolean;
  combo_component_names?: string[];
}

const PREFS_KEY = 'flaneur-neighborhood-preferences';

// City coordinates for distance calculation
const CITY_COORDINATES: Record<string, [number, number]> = {
  'New York': [40.7128, -74.0060],
  'San Francisco': [37.7749, -122.4194],
  'Los Angeles': [34.0522, -118.2437],
  'Chicago': [41.8781, -87.6298],
  'Miami': [25.7617, -80.1918],
  'Washington DC': [38.9072, -77.0369],
  'Toronto': [43.6532, -79.3832],
  'London': [51.5074, -0.1278],
  'Paris': [48.8566, 2.3522],
  'Berlin': [52.5200, 13.4050],
  'Amsterdam': [52.3676, 4.9041],
  'Stockholm': [59.3293, 18.0686],
  'Copenhagen': [55.6761, 12.5683],
  'Barcelona': [41.3851, 2.1734],
  'Milan': [45.4642, 9.1900],
  'Lisbon': [38.7223, -9.1393],
  'Tokyo': [35.6762, 139.6503],
  'Hong Kong': [22.3193, 114.1694],
  'Singapore': [1.3521, 103.8198],
  'Sydney': [-33.8688, 151.2093],
  'Melbourne': [-37.8136, 144.9631],
  'Dubai': [25.2048, 55.2708],
  'Tel Aviv': [32.0853, 34.7818],
  // Vacation destinations
  'US Vacation': [41.2835, -70.0995], // Nantucket coordinates
  'Caribbean Vacation': [17.8967, -62.8500], // St. Barts
  'European Vacation': [43.2727, 6.6406], // Saint-Tropez
  // Surroundings (wealthy suburbs)
  'New York Surroundings': [41.0263, -73.6285], // Greenwich, CT area
  'Stockholm Surroundings': [59.3293, 18.0686], // Stockholm area
  // Test Lab
  'Test Lab': [53.3498, -6.2603], // Dublin (midpoint-ish)
};

// Vacation region labels and styling
const VACATION_REGIONS: Record<string, { label: string; color: string }> = {
  'us-vacation': { label: 'US Vacation', color: '#00563F' },
  'caribbean-vacation': { label: 'Caribbean Vacation', color: '#00563F' },
  'europe-vacation': { label: 'European Vacation', color: '#00563F' },
  'test': { label: 'Test Lab', color: '#6B21A8' },
};

// Surroundings region labels and styling (wealthy suburbs around cities)
const ENCLAVE_REGIONS: Record<string, { label: string; headerColor: string; buttonBgColor: string; buttonTextColor: string }> = {
  'nyc-enclaves': {
    label: 'New York Surroundings',
    headerColor: '#3E2723',  // Espresso
    buttonBgColor: '#3E2723',
    buttonTextColor: '#E5C586'  // Gold/Brass
  },
  'stockholm-enclaves': {
    label: 'Stockholm Surroundings',
    headerColor: '#3E2723',
    buttonBgColor: '#3E2723',
    buttonTextColor: '#E5C586'
  },
};

// Check if a region is a vacation region (or test region — grouped the same way)
function isVacationRegion(region?: string): boolean {
  return region ? (region.includes('vacation') || region === 'test') : false;
}

// Check if a region is an enclave region
function isEnclaveRegion(region?: string): boolean {
  return region ? region.includes('enclaves') : false;
}

// Calculate distance between two points using Haversine formula
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
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

    // Load preferences from localStorage (fast, no network)
    let selected = new Set<string>();
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) {
      try {
        selected = new Set(JSON.parse(stored));
      } catch {
        // Invalid stored data
      }
    }

    return { neighborhoods, selected, userId: null };
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
  const [activeCity, setActiveCity] = useState<string | null>(null);
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

  // Group neighborhoods by city (or vacation/enclave region) and sort
  const citiesWithNeighborhoods = useMemo(() => {
    interface CityGroup {
      neighborhoods: NeighborhoodWithCombo[];
      isVacation: boolean;
      isEnclave: boolean;
      headerColor?: string;
      buttonBgColor?: string;
      buttonTextColor?: string;
    }
    const map = new Map<string, CityGroup>();

    neighborhoods.forEach(n => {
      // Check if this neighborhood belongs to a vacation region
      if (isVacationRegion(n.region)) {
        const vacationInfo = VACATION_REGIONS[n.region!];
        const groupKey = vacationInfo?.label || n.region!;
        if (!map.has(groupKey)) {
          map.set(groupKey, {
            neighborhoods: [],
            isVacation: true,
            isEnclave: false,
            headerColor: vacationInfo?.color
          });
        }
        map.get(groupKey)!.neighborhoods.push(n);
      } else if (isEnclaveRegion(n.region)) {
        // Enclave region grouping
        const enclaveInfo = ENCLAVE_REGIONS[n.region!];
        const groupKey = enclaveInfo?.label || n.region!;
        if (!map.has(groupKey)) {
          map.set(groupKey, {
            neighborhoods: [],
            isVacation: false,
            isEnclave: true,
            headerColor: enclaveInfo?.headerColor,
            buttonBgColor: enclaveInfo?.buttonBgColor,
            buttonTextColor: enclaveInfo?.buttonTextColor
          });
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
      code: data.isVacation ? '◇' : data.isEnclave ? '✦' : getCityCode(city),
      neighborhoods: data.neighborhoods,
      isVacation: data.isVacation,
      isEnclave: data.isEnclave,
      headerColor: data.headerColor,
      buttonBgColor: data.buttonBgColor,
      buttonTextColor: data.buttonTextColor,
      distance: userLocation && CITY_COORDINATES[city]
        ? getDistance(userLocation[0], userLocation[1], CITY_COORDINATES[city][0], CITY_COORDINATES[city][1])
        : Infinity,
    }));

    // Sort by distance if sorting by nearest, otherwise alphabetically
    if (sortBy === 'nearest' && userLocation) {
      cities = cities.sort((a, b) => a.distance - b.distance);
    } else {
      cities = cities.sort((a, b) => a.city.localeCompare(b.city));
    }

    return cities;
  }, [neighborhoods, sortBy, userLocation]);

  // Filter based on search (includes combo component names)
  const filteredCities = useMemo(() => {
    if (!searchQuery.trim()) return citiesWithNeighborhoods;
    const query = searchQuery.toLowerCase();
    return citiesWithNeighborhoods
      .map(c => ({
        ...c,
        neighborhoods: c.neighborhoods.filter(n =>
          n.name.toLowerCase().includes(query) ||
          n.city.toLowerCase().includes(query) ||
          // Search within combo component names (e.g., "Westport" finds "Gold Coast CT")
          (n.combo_component_names && n.combo_component_names.some(
            comp => comp.toLowerCase().includes(query)
          ))
        ),
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
    const newSelected = new Set([...selected, ...ids]);

    setSelected(newSelected);

    if (userId) {
      const supabase = createClient();
      const toAdd = ids.filter(id => !selected.has(id));
      if (toAdd.length > 0) {
        await supabase
          .from('user_neighborhood_preferences')
          .upsert(toAdd.map(id => ({ user_id: userId, neighborhood_id: id })));
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-white">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        ref={modalRef}
        className="absolute inset-4 sm:inset-8 md:inset-12 lg:inset-y-12 lg:inset-x-24 xl:inset-y-16 xl:inset-x-32 bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-neutral-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl font-light tracking-wide text-neutral-900">
                Choose Neighborhoods
              </h2>
              <p className="text-sm text-neutral-500 mt-1">
                {selected.size > 0 ? (
                  <><span className="font-medium text-neutral-900">{selected.size}</span> selected</>
                ) : (
                  'Select neighborhoods to personalize your stories'
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 -m-2 text-neutral-400 hover:text-neutral-900 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search and Sort */}
          <div className="mt-4 flex gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search cities or neighborhoods..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-neutral-100 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:bg-white transition-all"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Sort by Nearest Button */}
            <button
              onClick={handleSortByNearest}
              disabled={locationLoading}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg border transition-all whitespace-nowrap ${
                sortBy === 'nearest'
                  ? 'bg-neutral-900 text-white border-neutral-900'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {locationLoading ? '...' : 'Nearest'}
            </button>
          </div>
        </div>

        {/* Modal Body - Cities Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-neutral-200 border-t-black rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCities.map(({ city, code, neighborhoods: cityHoods, distance, isVacation, isEnclave, headerColor, buttonBgColor, buttonTextColor }) => {
                const selectedInCity = cityHoods.filter(n => selected.has(n.id)).length;
                const isExpanded = activeCity === city || searchQuery.length > 0;
                const headerBgColor = headerColor || undefined;

                return (
                  <div
                    key={city}
                    className={`rounded-lg overflow-hidden border transition-all duration-200 ${
                      selectedInCity > 0
                        ? isVacation ? 'border-[#00563F]' : isEnclave ? 'border-[#3E2723]' : 'border-neutral-900'
                        : 'border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    {/* City Header */}
                    <button
                      onClick={() => setActiveCity(activeCity === city ? null : city)}
                      className="w-full text-left"
                    >
                      <div
                        className="h-14 flex items-center justify-between px-4"
                        style={{ backgroundColor: headerBgColor || '#171717' }}
                      >
                        <div>
                          <h3 className="text-sm font-medium text-white">
                            {city}
                          </h3>
                          <p className="text-[11px] text-white/60">
                            {code} · {cityHoods.length} area{cityHoods.length !== 1 ? 's' : ''}
                            {sortBy === 'nearest' && distance < Infinity && (
                              <span className="ml-1">· {Math.round(distance)} km</span>
                            )}
                          </p>
                        </div>
                        {selectedInCity > 0 && (
                          <span className="px-2 py-0.5 bg-white rounded-full text-[11px] font-medium text-neutral-900">
                            {selectedInCity}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Neighborhoods */}
                    <div className={`bg-white transition-all duration-200 ${isExpanded ? 'max-h-96 overflow-y-auto opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-neutral-100">
                          <span className="text-xs text-neutral-400">Neighborhoods</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              selectAllInCity(cityHoods);
                            }}
                            className="text-xs text-neutral-500 hover:text-neutral-900 font-medium"
                          >
                            Select all
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {cityHoods.map(hood => {
                            const isSelected = selected.has(hood.id);
                            const hasComboComponents = hood.combo_component_names && hood.combo_component_names.length > 0;

                            // Determine button styling based on region type
                            let buttonClasses = 'relative px-2.5 py-1 text-xs rounded-md transition-all';

                            let buttonStyle: React.CSSProperties = {};

                            if (hood.is_coming_soon) {
                              buttonClasses += ' bg-neutral-100 text-neutral-400 cursor-not-allowed';
                            } else if (isSelected) {
                              if (isEnclave && buttonBgColor) {
                                buttonStyle = { backgroundColor: buttonBgColor, color: buttonTextColor };
                              } else {
                                buttonClasses += ' bg-neutral-900 text-white';
                              }
                            } else {
                              if (isEnclave && buttonBgColor) {
                                // Unselected enclave: light version of espresso
                                buttonStyle = { backgroundColor: '#F5F0EB', color: '#3E2723' };
                              } else {
                                buttonClasses += ' bg-neutral-100 text-neutral-700 hover:bg-neutral-200';
                              }
                            }

                            return (
                              <button
                                key={hood.id}
                                onClick={() => toggleNeighborhood(hood.id)}
                                disabled={hood.is_coming_soon}
                                className={buttonClasses}
                                style={buttonStyle}
                                title={hasComboComponents ? `Includes: ${hood.combo_component_names!.join(', ')}` : undefined}
                              >
                                <span>{hood.name}</span>
                                {hood.is_coming_soon && <span className="ml-1 text-[10px]">(Soon)</span>}
                                {isSelected && (
                                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center">
                                    <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Suggest a Destination */}
          {!loading && !searchQuery && (
            <div className="mt-6 pt-6 border-t border-neutral-100">
              {!showSuggestion ? (
                <button
                  onClick={() => {
                    setShowSuggestion(true);
                    setTimeout(() => suggestionInputRef.current?.focus(), 50);
                  }}
                  className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
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
                    className="flex-1 px-3 py-2 text-sm border border-neutral-200 focus:border-neutral-400 focus:outline-none transition-colors"
                  />
                  <button
                    onClick={handleSuggestionSubmit}
                    disabled={!suggestionText.trim()}
                    className="px-4 py-2 text-sm bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Submit
                  </button>
                  <button
                    onClick={() => {
                      setShowSuggestion(false);
                      setSuggestionText('');
                    }}
                    className="text-neutral-400 hover:text-neutral-600 transition-colors"
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
              <p className="text-neutral-500">No neighborhoods found for "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-sm text-neutral-900 font-medium hover:underline"
              >
                Clear search
              </button>

              {/* Suggestion in empty state */}
              <div className="mt-8 pt-6 border-t border-neutral-100">
                {!showSuggestion ? (
                  <button
                    onClick={() => {
                      setSuggestionText(searchQuery); // Pre-fill with search query
                      setShowSuggestion(true);
                      setTimeout(() => suggestionInputRef.current?.focus(), 50);
                    }}
                    className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    Not seeing your neighborhood? <span className="underline">Suggest "{searchQuery}"</span>
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
                      className="flex-1 px-3 py-2 text-sm border border-neutral-200 focus:border-neutral-400 focus:outline-none transition-colors"
                    />
                    <button
                      onClick={handleSuggestionSubmit}
                      disabled={!suggestionText.trim()}
                      className="px-4 py-2 text-sm bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Submit
                    </button>
                    <button
                      onClick={() => {
                        setShowSuggestion(false);
                        setSuggestionText('');
                      }}
                      className="text-neutral-400 hover:text-neutral-600 transition-colors"
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
        <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            {selected.size > 0 ? (
              <><span className="font-medium text-neutral-900">{selected.size}</span> neighborhood{selected.size !== 1 ? 's' : ''} selected</>
            ) : (
              'Select at least one neighborhood'
            )}
          </p>
          <button
            onClick={handleExplore}
            disabled={selected.size === 0}
            className="px-8 py-2.5 text-[11px] tracking-[0.15em] uppercase font-medium bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 rounded-lg"
          >
            {selected.size > 0 ? 'Read Stories' : 'Browse All'}
          </button>
        </div>
      </div>
    </div>
  );
}
