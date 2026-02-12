'use client';

import { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Neighborhood, GlobalRegion } from '@/types';
import { getDistance } from '@/lib/geo-utils';
import { findCountryForQuery, findRegionForQuery, findStateForQuery } from '@/lib/search-aliases';
import { getAllCityNames, getTimezoneForCity, getStoredLocation, saveStoredLocation } from '@/lib/location';

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

// Geographic region order and labels for region sort
const GEO_REGION_ORDER: { key: string; label: string }[] = [
  { key: 'north-america', label: 'North America' },
  { key: 'south-america', label: 'South America' },
  { key: 'europe', label: 'Europe' },
  { key: 'middle-east', label: 'Middle East' },
  { key: 'asia-pacific', label: 'Asia & Pacific' },
  { key: 'africa', label: 'Africa' },
  { key: 'other', label: 'Other' },
];

const GEO_REGION_INDEX: Record<string, number> = Object.fromEntries(
  GEO_REGION_ORDER.map((r, i) => [r.key, i])
);

/** Map any region (including vacation/enclave) to its geographic parent */
function getGeoRegion(region?: string): string {
  if (!region) return 'other';
  if (region === 'us-vacation' || region === 'caribbean-vacation') return 'north-america';
  if (region === 'europe-vacation') return 'europe';
  if (region === 'test') return 'other';
  if (region.includes('enclaves')) {
    if (region.startsWith('nyc')) return 'north-america';
    if (region.startsWith('stockholm')) return 'europe';
    return 'other';
  }
  return region;
}

// Modal Context
type ModalTab = 'all' | 'community';

interface NeighborhoodModalContextType {
  isOpen: boolean;
  openModal: (tab?: ModalTab) => void;
  closeModal: () => void;
}

const NeighborhoodModalContext = createContext<NeighborhoodModalContextType | null>(null);

export function useNeighborhoodModal() {
  const context = useContext(NeighborhoodModalContext);
  // Return safe no-op defaults during SSR or if provider is missing
  // (modal interactions are client-only, so no-ops are correct)
  if (!context) {
    return { isOpen: false, openModal: () => {}, closeModal: () => {} };
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
  const [initialTab, setInitialTab] = useState<ModalTab>('all');
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
        openModal: (tab?: ModalTab) => {
          setInitialTab(tab || 'all');
          setIsOpen(true);
        },
        closeModal: () => setIsOpen(false),
      }}
    >
      {children}
      <GlobalNeighborhoodModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        prefetchedData={prefetchedData}
        initialTab={initialTab}
      />
    </NeighborhoodModalContext.Provider>
  );
}

function GlobalNeighborhoodModal({
  isOpen,
  onClose,
  prefetchedData,
  initialTab = 'all',
}: {
  isOpen: boolean;
  onClose: () => void;
  prefetchedData: {
    neighborhoods: NeighborhoodWithCombo[];
    selected: Set<string>;
    userId: string | null;
  } | null;
  initialTab?: ModalTab;
}) {
  const router = useRouter();
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodWithCombo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'nearest' | 'region'>('name');
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [primaryId, setPrimaryId] = useState<string | null>(null);

  // Settings state (city/timezone)
  const [settingsCity, setSettingsCity] = useState('');
  const [settingsDetecting, setSettingsDetecting] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const allCityNames = useMemo(() => getAllCityNames(), []);

  // Timezone selector visibility
  const [showTimezone, setShowTimezone] = useState(false);

  // Suggestion feature state
  const [confirmClear, setConfirmClear] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [suggestionEmail, setSuggestionEmail] = useState('');
  const [suggestionStatus, setSuggestionStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const suggestionInputRef = useRef<HTMLInputElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'all' | 'community'>('all');

  // Community tab state
  const [communityInput, setCommunityInput] = useState('');
  const [communityCount, setCommunityCount] = useState(0);
  const [communityCreateStatus, setCommunityCreateStatus] = useState<'idle' | 'validating' | 'generating' | 'success' | 'error'>('idle');
  const [communityError, setCommunityError] = useState('');
  const [communityCreatedName, setCommunityCreatedName] = useState('');
  const communityInputRef = useRef<HTMLInputElement>(null);

  // Handle suggestion submission via API
  const handleSuggestionSubmit = async () => {
    if (!suggestionText.trim() || suggestionText.trim().length < 3) return;

    setSuggestionStatus('submitting');

    try {
      await fetch('/api/suggestions/neighborhood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestion: suggestionText.trim(),
          email: suggestionEmail.trim() || undefined,
        }),
      });
    } catch {
      // Silently fail - still show success to user
    }

    setSuggestionStatus('success');

    // Auto-close after 2 seconds
    setTimeout(() => {
      setShowSuggestion(false);
      setSuggestionText('');
      setSuggestionEmail('');
      setSuggestionStatus('idle');
    }, 2000);
  };

  // Fetch community neighborhood count when community tab is shown
  useEffect(() => {
    if (activeTab !== 'community' || !isOpen) return;
    fetch('/api/neighborhoods/my-community-count')
      .then(res => res.json())
      .then(data => setCommunityCount(data.count || 0))
      .catch(() => {});
  }, [activeTab, isOpen]);

  // Handle community neighborhood creation
  const handleCommunityCreate = async () => {
    if (!communityInput.trim() || communityInput.trim().length < 3) return;
    if (communityCreateStatus === 'validating' || communityCreateStatus === 'generating') return;

    setCommunityError('');
    setCommunityCreateStatus('validating');

    try {
      const response = await fetch('/api/neighborhoods/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: communityInput.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        setCommunityError(data.error || 'Failed to create neighborhood');
        setCommunityCreateStatus('error');

        // If there's an existing neighborhood, offer to add it
        if (data.existingId) {
          setCommunityError(`${data.error} You can find it in the "All Neighborhoods" tab.`);
        }
        return;
      }

      setCommunityCreateStatus('generating');

      // Stream progress by waiting for full response
      const data = await response.json();

      if (data.success) {
        setCommunityCreateStatus('success');
        setCommunityCreatedName(data.neighborhood?.name || communityInput.trim());
        setCommunityCount(prev => prev + 1);
        setCommunityInput('');

        // Mark that user has created a community neighborhood (hides house ad)
        try { localStorage.setItem('flaneur-has-community-neighborhood', 'true'); } catch { /* ignore */ }

        // Add to selected set and localStorage
        if (data.neighborhood?.id) {
          const newSelected = new Set(selected);
          newSelected.add(data.neighborhood.id);
          setSelected(newSelected);
          saveToLocalStorage(newSelected, primaryId);

          // Refresh neighborhoods list
          try {
            const freshData = await fetchNeighborhoodsData(8000);
            setNeighborhoods(freshData.neighborhoods);
          } catch { /* will refresh on next open */ }
        }

        // Reset after 3s
        setTimeout(() => {
          setCommunityCreateStatus('idle');
          setCommunityCreatedName('');
        }, 3000);
      }
    } catch {
      setCommunityError('Network error. Please try again.');
      setCommunityCreateStatus('error');
    }
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

  const handleSortByRegion = () => {
    setSortBy(sortBy === 'region' ? 'name' : 'region');
  };

  // Reset confirm state, load settings, and apply initial tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setConfirmClear(false);
      setSettingsSaved(false);
      setActiveTab(initialTab);
      const stored = getStoredLocation();
      if (stored?.city) setSettingsCity(stored.city);
    }
  }, [isOpen, initialTab]);

  // Use prefetched data if available, otherwise fetch on open
  useEffect(() => {
    if (!isOpen) return;

    // If we have prefetched data and haven't initialized yet, use it
    if (prefetchedData && !hasInitialized) {
      setNeighborhoods(prefetchedData.neighborhoods);
      setSelected(prefetchedData.selected);
      setUserId(prefetchedData.userId);
      // Read primary from localStorage order
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        try { setPrimaryId((JSON.parse(stored) as string[])[0] || null); } catch { /* ignore */ }
      }
      setLoading(false);
      setHasInitialized(true);
      return;
    }

    // If already initialized with data, just re-sync the selected set
    // (another component may have changed localStorage since last open)
    if (hasInitialized && neighborhoods.length > 0) {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        try {
          const ids = JSON.parse(stored) as string[];
          setSelected(new Set(ids));
          setPrimaryId(ids[0] || null);
        } catch { /* ignore */ }
      } else {
        setSelected(new Set());
        setPrimaryId(null);
      }
      return;
    }

    // Fallback: fetch data if not prefetched or prefetch failed
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await fetchNeighborhoodsData(10000);
        setNeighborhoods(data.neighborhoods);
        setSelected(data.selected);
        setUserId(data.userId);
        // Read primary from localStorage order
        const stored = localStorage.getItem(PREFS_KEY);
        if (stored) {
          try { setPrimaryId((JSON.parse(stored) as string[])[0] || null); } catch { /* ignore */ }
        }
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
      geoRegion: getGeoRegion(data.neighborhoods[0]?.region),
      distance: userLocation && cityCoordinates[city]
        ? getDistance(userLocation[0], userLocation[1], cityCoordinates[city][0], cityCoordinates[city][1])
        : Infinity,
    }));

    // Sort by distance, region, or alphabetically
    if (sortBy === 'nearest' && userLocation) {
      cities = cities.sort((a, b) => a.distance - b.distance);
    } else if (sortBy === 'region') {
      cities = cities.sort((a, b) => {
        const orderA = GEO_REGION_INDEX[a.geoRegion] ?? 99;
        const orderB = GEO_REGION_INDEX[b.geoRegion] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.city.localeCompare(b.city);
      });
    } else {
      cities = cities.sort((a, b) => a.city.localeCompare(b.city));
    }

    return cities;
  }, [neighborhoods, sortBy, userLocation, cityCoordinates]);

  // Filter based on search (includes combo component names + country/region/state)
  const filteredCities = useMemo(() => {
    if (!searchQuery.trim()) return citiesWithNeighborhoods;
    // Normalize: strip accents and lowercase for accent-insensitive search
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const query = normalize(searchQuery);

    // Check for country/region/state matches
    const matchedCountry = findCountryForQuery(searchQuery);
    const matchedRegion = findRegionForQuery(searchQuery);
    const matchedState = findStateForQuery(searchQuery);
    const stateCities = matchedState?.cities ? new Set(matchedState.cities.map(c => c.toLowerCase())) : null;

    return citiesWithNeighborhoods
      .map(c => ({
        ...c,
        neighborhoods: c.neighborhoods.filter(n => {
          // Direct name/city/component match (accent-insensitive)
          if (normalize(n.name).includes(query)) return true;
          if (normalize(n.city).includes(query)) return true;
          if (n.combo_component_names && n.combo_component_names.some(
            comp => normalize(comp).includes(query)
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

  // Helper: save selected set to localStorage preserving primary-first order
  const saveToLocalStorage = (ids: Set<string>, currentPrimary: string | null) => {
    const arr = Array.from(ids);
    // Keep primary at front
    if (currentPrimary && ids.has(currentPrimary)) {
      const reordered = [currentPrimary, ...arr.filter(i => i !== currentPrimary)];
      localStorage.setItem(PREFS_KEY, JSON.stringify(reordered));
    } else {
      localStorage.setItem(PREFS_KEY, JSON.stringify(arr));
    }
  };

  const toggleNeighborhood = async (id: string) => {
    const newSelected = new Set(selected);
    const wasSelected = newSelected.has(id);

    if (wasSelected) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }

    setSelected(newSelected);

    // Update primary: if first selection, it becomes primary.
    // If primary was deselected, pick first remaining.
    let newPrimary = primaryId;
    if (newSelected.size === 0) {
      newPrimary = null;
    } else if (!wasSelected && newSelected.size === 1) {
      newPrimary = id;
    } else if (wasSelected && id === primaryId) {
      // Primary was deselected - pick next from localStorage order
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        try {
          const ids = (JSON.parse(stored) as string[]).filter(i => newSelected.has(i));
          newPrimary = ids[0] || Array.from(newSelected)[0] || null;
        } catch { newPrimary = Array.from(newSelected)[0] || null; }
      } else {
        newPrimary = Array.from(newSelected)[0] || null;
      }
    }
    setPrimaryId(newPrimary);

    if (userId) {
      const supabase = createClient();
      if (wasSelected) {
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
      // Also sync to localStorage so other components stay in sync
      saveToLocalStorage(newSelected, newPrimary);
    } else {
      saveToLocalStorage(newSelected, newPrimary);
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

    // Update primary if needed
    let newPrimary = primaryId;
    if (newSelected.size === 0) {
      newPrimary = null;
    } else if (!primaryId || !newSelected.has(primaryId)) {
      newPrimary = Array.from(newSelected)[0] || null;
    }
    setPrimaryId(newPrimary);

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
      // Also sync to localStorage so other components stay in sync
      saveToLocalStorage(newSelected, newPrimary);
    } else {
      saveToLocalStorage(newSelected, newPrimary);
    }
  };

  const handleExplore = () => {
    if (selected.size > 0) {
      // Use localStorage order (primary-first) instead of Set insertion order
      const stored = localStorage.getItem(PREFS_KEY);
      const orderedIds = stored ? JSON.parse(stored) as string[] : Array.from(selected);
      router.push(`/feed?neighborhoods=${orderedIds.join(',')}`);
    } else {
      router.push('/neighborhoods');
    }
    onClose();
  };

  const clearAll = async () => {
    setConfirmClear(false);
    setSelected(new Set());
    setPrimaryId(null);
    localStorage.removeItem(PREFS_KEY);
    if (userId) {
      const supabase = createClient();
      Promise.resolve(
        supabase.from('user_neighborhood_preferences').delete().eq('user_id', userId)
      ).then(null, () => {});
    }
  };

  const makePrimary = (id: string) => {
    const stored = localStorage.getItem(PREFS_KEY);
    if (!stored) return;
    try {
      const ids = JSON.parse(stored) as string[];
      if (!ids.includes(id)) return;
      const reordered = [id, ...ids.filter(i => i !== id)];
      localStorage.setItem(PREFS_KEY, JSON.stringify(reordered));
      setPrimaryId(id);
      // Navigate so the feed page reflects the new primary order
      router.push(`/feed?neighborhoods=${reordered.join(',')}`);
    } catch { /* ignore */ }
  };

  const scrollToPrimary = () => {
    if (!primaryId || !bodyRef.current) return;
    const el = bodyRef.current.querySelector(`[data-neighborhood-id="${primaryId}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-1', 'ring-amber-500/60', 'rounded');
    setTimeout(() => el.classList.remove('ring-1', 'ring-amber-500/60', 'rounded'), 2000);
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
        className="absolute inset-x-0 top-2 bottom-0 sm:inset-8 md:inset-12 lg:inset-y-12 lg:inset-x-24 xl:inset-y-16 xl:inset-x-32 bg-neutral-900/90 backdrop-blur-md border border-white/10 rounded-t-xl sm:rounded-xl shadow-2xl overflow-hidden flex flex-col animate-modal-slide-up"
      >
        {/* Modal Header */}
        <div className="flex-shrink-0 px-6 py-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl font-light tracking-wide text-white">
                City Search
              </h2>
              {/* Selection counter + change primary + change timezone */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {selected.size > 0 && (
                  <>
                    <span className="text-xs font-mono text-amber-400 tabular-nums">
                      {selected.size} selected
                    </span>
                    <span className="text-neutral-600 text-xs">|</span>
                  </>
                )}
                {primaryId && selected.size > 1 && (
                  <>
                    <button
                      onClick={scrollToPrimary}
                      className="text-xs text-neutral-500 hover:text-amber-400 transition-colors"
                    >
                      Change my Primary Neighborhood
                    </button>
                    <span className="text-neutral-600 text-xs">|</span>
                  </>
                )}
                <button
                  onClick={() => setShowTimezone(!showTimezone)}
                  className={`text-xs transition-colors ${
                    showTimezone ? 'text-amber-400' : 'text-neutral-500 hover:text-amber-400'
                  }`}
                  title="This will update the time at which you will receive daily or weekly 7am emails"
                >
                  Change my Timezone
                </button>
                <span className="text-neutral-600 text-xs">|</span>
                <button
                  onClick={() => {
                    setShowSuggestion(!showSuggestion);
                    if (!showSuggestion) setTimeout(() => suggestionInputRef.current?.focus(), 50);
                  }}
                  className={`text-xs transition-colors ${
                    showSuggestion ? 'text-amber-400' : 'text-neutral-500 hover:text-amber-400'
                  }`}
                >
                  Suggest a Neighborhood
                </button>
              </div>
              {/* Inline timezone selector */}
              {showTimezone && (
                <div className="flex items-center gap-3 mt-3">
                  <label className="text-[11px] tracking-[0.15em] uppercase text-neutral-500 shrink-0">City</label>
                  <select
                    value={settingsCity}
                    onChange={(e) => {
                      setSettingsCity(e.target.value);
                      setSettingsSaved(false);
                    }}
                    className="flex-1 bg-transparent border-b border-white/20 text-sm text-white py-1.5 focus:outline-none focus:border-amber-500/50 appearance-none cursor-pointer max-w-[200px]"
                  >
                    <option value="" className="bg-neutral-900">Select city...</option>
                    {allCityNames.map(c => (
                      <option key={c} value={c} className="bg-neutral-900">{c}</option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      setSettingsDetecting(true);
                      try {
                        const res = await fetch('/api/location');
                        const data = await res.json();
                        if (data.location?.city) {
                          setSettingsCity(data.location.city);
                          setSettingsSaved(false);
                        }
                      } catch { /* silent */ }
                      setSettingsDetecting(false);
                    }}
                    disabled={settingsDetecting}
                    className="text-neutral-500 hover:text-white transition-colors p-1.5 shrink-0"
                    title="Detect my city"
                  >
                    {settingsDetecting ? (
                      <div className="w-4 h-4 border border-neutral-600 border-t-amber-400 rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (!settingsCity) return;
                      const tz = getTimezoneForCity(settingsCity);
                      if (tz) {
                        saveStoredLocation(settingsCity, tz);
                        setSettingsSaved(true);
                        setTimeout(() => setSettingsSaved(false), 2000);
                      }
                    }}
                    disabled={!settingsCity || settingsSaved}
                    className="text-[11px] tracking-[0.1em] uppercase text-amber-400 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {settingsSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              )}
              {/* Inline suggestion form */}
              {showSuggestion && (
                suggestionStatus === 'success' ? (
                  <p className="text-xs text-neutral-500 mt-3">
                    Thank you. We have added this to our radar.
                  </p>
                ) : (
                  <div className="flex items-center gap-3 mt-3">
                    <input
                      ref={suggestionInputRef}
                      type="text"
                      value={suggestionText}
                      onChange={(e) => setSuggestionText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSuggestionSubmit()}
                      placeholder="e.g., Notting Hill, London"
                      className="flex-1 bg-transparent border-b border-white/20 text-sm text-white placeholder-neutral-600 py-1.5 focus:outline-none focus:border-amber-500/50 transition-colors max-w-[200px]"
                      disabled={suggestionStatus === 'submitting'}
                    />
                    <input
                      type="email"
                      value={suggestionEmail}
                      onChange={(e) => setSuggestionEmail(e.target.value)}
                      placeholder="Email (optional)"
                      className="flex-1 bg-transparent border-b border-white/20 text-sm text-white placeholder-neutral-600 py-1.5 focus:outline-none focus:border-amber-500/50 transition-colors max-w-[160px]"
                      disabled={suggestionStatus === 'submitting'}
                    />
                    <button
                      onClick={handleSuggestionSubmit}
                      disabled={!suggestionText.trim() || suggestionText.trim().length < 3 || suggestionStatus === 'submitting'}
                      className="text-[11px] tracking-[0.1em] uppercase text-amber-400 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      {suggestionStatus === 'submitting' ? 'Sending...' : 'Submit'}
                    </button>
                  </div>
                )
              )}
            </div>
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

          {/* Tab Toggle */}
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                activeTab === 'all'
                  ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                  : 'border-white/20 text-neutral-400 hover:text-white hover:border-white/40'
              }`}
            >
              All Neighborhoods
            </button>
            <button
              onClick={() => setActiveTab('community')}
              className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                activeTab === 'community'
                  ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                  : 'border-white/20 text-neutral-400 hover:text-white hover:border-white/40'
              }`}
            >
              Community
            </button>
          </div>

          {/* Search (All tab only) */}
          {activeTab === 'all' && (
          <div className="mt-4 max-w-[15rem]">
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-b border-white/20 text-sm text-white placeholder-neutral-600 py-2 focus:outline-none focus:border-amber-500/50 transition-colors"
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
          </div>
          )}

          {/* Sort buttons (All tab only) */}
          {activeTab === 'all' && (
          <div className="mt-3 flex items-center gap-2">
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {locationLoading ? 'Locating...' : 'Sort by nearest to me'}
            </button>
            <button
              onClick={handleSortByRegion}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap ${
                sortBy === 'region'
                  ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                  : 'border-white/20 text-neutral-400 hover:text-white hover:border-white/40'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {sortBy === 'region' ? 'Sort alphabetically' : 'Sort by region'}
            </button>
          </div>
          )}
        </div>

        {/* Modal Body */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-6">
          {/* Community Tab */}
          {activeTab === 'community' ? (
            <div>
              {/* Create Form */}
              {userId ? (
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-xs tracking-[0.2em] uppercase text-neutral-500 shrink-0">Create a Neighborhood</h3>
                    <div className="flex-1 h-px bg-white/5" />
                    <span className="text-xs font-mono text-neutral-500 tabular-nums">
                      {communityCount}/2 created
                    </span>
                  </div>

                  {communityCount >= 2 ? (
                    <p className="text-sm text-neutral-500">
                      You have reached the limit of 2 community neighborhoods.
                    </p>
                  ) : communityCreateStatus === 'success' ? (
                    <div className="py-3">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <p className="text-sm text-green-400">
                          {communityCreatedName} created and added to your collection.
                        </p>
                      </div>
                      <p className="text-xs text-neutral-500 mt-2 ml-6">
                        You will receive a daily brief for {communityCreatedName} at 7am local time starting tomorrow.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-3">
                        <input
                          ref={communityInputRef}
                          type="text"
                          value={communityInput}
                          onChange={(e) => { setCommunityInput(e.target.value); setCommunityError(''); }}
                          onKeyDown={(e) => e.key === 'Enter' && handleCommunityCreate()}
                          placeholder="e.g., Notting Hill, London"
                          disabled={communityCreateStatus === 'validating' || communityCreateStatus === 'generating'}
                          className="flex-1 bg-transparent border-b border-white/20 text-sm text-white placeholder-neutral-600 py-2 focus:outline-none focus:border-amber-500/50 transition-colors max-w-[300px]"
                        />
                        <button
                          onClick={handleCommunityCreate}
                          disabled={!communityInput.trim() || communityInput.trim().length < 3 || communityCreateStatus === 'validating' || communityCreateStatus === 'generating'}
                          className="px-4 py-2 text-[11px] tracking-[0.1em] uppercase font-medium bg-white text-neutral-900 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded-lg whitespace-nowrap"
                        >
                          {communityCreateStatus === 'validating' ? 'Validating...'
                            : communityCreateStatus === 'generating' ? 'Generating brief...'
                            : 'Create'}
                        </button>
                      </div>
                      {communityCreateStatus === 'generating' && (
                        <p className="text-xs text-neutral-500 mt-2">
                          This may take a minute - we are generating a brief and article for your neighborhood.
                        </p>
                      )}
                      {communityError && (
                        <p className="text-xs text-red-400 mt-2">{communityError}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-8 py-6 text-center">
                  <p className="text-sm text-neutral-400 mb-3">Sign in to create your own neighborhood</p>
                  <Link
                    href="/login"
                    className="inline-block px-6 py-2 text-[11px] tracking-[0.1em] uppercase font-medium bg-white text-neutral-900 hover:bg-neutral-200 transition-all rounded-lg"
                  >
                    Sign In
                  </Link>
                </div>
              )}

              {/* Community neighborhood list */}
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-xs tracking-[0.2em] uppercase text-neutral-500 shrink-0">Community Neighborhoods</h3>
                <div className="flex-1 h-px bg-white/5" />
              </div>

              {(() => {
                const communityHoods = neighborhoods.filter(n => n.is_community);
                if (communityHoods.length === 0) {
                  return (
                    <p className="text-sm text-neutral-600 py-6 text-center">
                      No community neighborhoods yet. Be the first to create one.
                    </p>
                  );
                }

                // Group by city
                const cityMap = new Map<string, NeighborhoodWithCombo[]>();
                communityHoods.forEach(n => {
                  if (!cityMap.has(n.city)) cityMap.set(n.city, []);
                  cityMap.get(n.city)!.push(n);
                });

                return (
                  <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-x-8">
                    {Array.from(cityMap.entries())
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([city, hoods]) => (
                        <div key={city} className="break-inside-avoid mb-6">
                          <h3 className="font-display text-base text-white mb-1.5">{city}</h3>
                          <div className="space-y-0.5">
                            {hoods.map(hood => {
                              const isSelected = selected.has(hood.id);
                              return (
                                <div key={hood.id} data-neighborhood-id={hood.id} className="flex items-center gap-1 group/item">
                                  <button
                                    onClick={() => toggleNeighborhood(hood.id)}
                                    className={`flex-1 text-left text-sm py-0.5 transition-colors flex items-center gap-1 ${
                                      isSelected ? 'text-amber-400 font-medium' : 'text-neutral-400 hover:text-white'
                                    }`}
                                  >
                                    {isSelected && (
                                      <svg className="w-3 h-3 shrink-0 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                    {hood.name}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                );
              })()}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-neutral-700 border-t-amber-400 rounded-full animate-spin" />
            </div>
          ) : sortBy === 'region' ? (
            /* Region-grouped layout: separate masonry per region */
            (() => {
              const regionGroups = new Map<string, typeof filteredCities>();
              filteredCities.forEach(c => {
                const geo = c.geoRegion;
                if (!regionGroups.has(geo)) regionGroups.set(geo, []);
                regionGroups.get(geo)!.push(c);
              });
              const orderedRegions = GEO_REGION_ORDER
                .filter(r => regionGroups.has(r.key))
                .map(r => ({ ...r, cities: regionGroups.get(r.key)! }));

              return orderedRegions.map(({ key, label, cities: regionCities }) => (
                <div key={key} className="mb-8">
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-xs tracking-[0.2em] uppercase text-neutral-500 shrink-0">{label}</h3>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>
                  <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-x-8">
                    {regionCities.map(({ city, neighborhoods: cityHoods }) => {
                      const selectableIds = cityHoods.filter(n => !n.is_coming_soon).map(n => n.id);
                      const allInCitySelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));
                      return (
                        <div key={city} className="break-inside-avoid mb-6">
                          <div className="flex items-baseline gap-2 mb-1.5">
                            <h3 className="font-display text-base text-white">{city}</h3>
                            <button
                              onClick={() => selectAllInCity(cityHoods)}
                              className={`text-[11px] transition-colors ${allInCitySelected ? 'text-amber-400 hover:text-amber-300' : 'text-neutral-600 hover:text-amber-400'}`}
                            >
                              {allInCitySelected ? 'Deselect' : 'Select all'}
                            </button>
                          </div>
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
                              const isPrimary = hood.id === primaryId && selected.size > 1;
                              const showSetPrimary = isSelected && !isPrimary && selected.size > 1;
                              return (
                                <div key={hood.id} data-neighborhood-id={hood.id} className="flex items-center gap-1 group/item">
                                  <button
                                    onClick={() => toggleNeighborhood(hood.id)}
                                    className={`flex-1 text-left text-sm py-0.5 transition-colors flex items-center gap-1 ${isSelected ? 'text-amber-400 font-medium' : 'text-neutral-400 hover:text-white'}`}
                                    title={hasComboComponents ? `Includes: ${hood.combo_component_names!.join(', ')}` : undefined}
                                  >
                                    {isSelected && (
                                      <svg className="w-3 h-3 shrink-0 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                    {hood.name}
                                    {hood.is_community && (
                                      <span className="text-[10px] text-neutral-600">Community</span>
                                    )}
                                    {hasComboComponents && (
                                      <span className="text-[11px] text-neutral-600">({hood.combo_component_names!.length} areas)</span>
                                    )}
                                    {isPrimary && (
                                      <span className="text-[9px] tracking-wider uppercase text-amber-500/70 font-medium ml-1">Primary</span>
                                    )}
                                  </button>
                                  {showSetPrimary && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); makePrimary(hood.id); }}
                                      className="text-[10px] tracking-wider uppercase font-medium text-emerald-500/80 hover:text-emerald-400 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0 py-0.5"
                                      title="Set as primary"
                                    >
                                      Set as Primary
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()
          ) : (
            /* Flat masonry layout (alphabetical or nearest) */
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-x-8">
              {filteredCities.map(({ city, neighborhoods: cityHoods, distance }) => {
                const selectableIds = cityHoods.filter(n => !n.is_coming_soon).map(n => n.id);
                const allInCitySelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

                return (
                <div key={city} className="break-inside-avoid mb-6">
                  {/* City Header */}
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <h3 className="font-display text-base text-white">
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

                      const isPrimary = hood.id === primaryId && selected.size > 1;
                      const showSetPrimary = isSelected && !isPrimary && selected.size > 1;

                      return (
                        <div key={hood.id} data-neighborhood-id={hood.id} className="flex items-center gap-1 group/item">
                          <button
                            onClick={() => toggleNeighborhood(hood.id)}
                            className={`flex-1 text-left text-sm py-0.5 transition-colors flex items-center gap-1 ${
                              isSelected
                                ? 'text-amber-400 font-medium'
                                : 'text-neutral-400 hover:text-white'
                            }`}
                            title={hasComboComponents ? `Includes: ${hood.combo_component_names!.join(', ')}` : undefined}
                          >
                            {isSelected && (
                              <svg className="w-3 h-3 shrink-0 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            {hood.name}
                            {hood.is_community && (
                              <span className="text-[10px] text-neutral-600">Community</span>
                            )}
                            {hasComboComponents && (
                              <span className="text-[11px] text-neutral-600">({hood.combo_component_names!.length} areas)</span>
                            )}
                            {isPrimary && (
                              <span className="text-[9px] tracking-wider uppercase text-amber-500/70 font-medium ml-1">Primary</span>
                            )}
                          </button>
                          {showSetPrimary && (
                            <button
                              onClick={(e) => { e.stopPropagation(); makePrimary(hood.id); }}
                              className="text-[10px] tracking-wider uppercase font-medium text-emerald-500/80 hover:text-emerald-400 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0 py-0.5"
                              title="Set as primary"
                            >
                              Set as Primary
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
          )}


          {/* Empty State (All tab only) */}
          {activeTab === 'all' && !loading && filteredCities.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-neutral-500">No neighborhoods found for &ldquo;{searchQuery}&rdquo;</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-sm text-white font-medium hover:underline"
              >
                Clear search
              </button>
              <p className="mt-6 text-sm text-neutral-600">
                Not finding what you want?{' '}
                <button
                  onClick={() => {
                    setSuggestionText(searchQuery);
                    setShowSuggestion(true);
                    setTimeout(() => suggestionInputRef.current?.focus(), 50);
                  }}
                  className="text-neutral-500 hover:text-amber-400 underline transition-colors"
                >
                  Suggest a Neighborhood
                </button>
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex-shrink-0 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-neutral-900/80 backdrop-blur-sm flex items-center justify-between">
          <div className="text-sm text-neutral-500">
            {selected.size > 0 ? (
              confirmClear ? (
                <span className="flex items-center gap-2">
                  <span className="text-neutral-400">Are you sure?</span>
                  <button
                    onClick={() => { clearAll(); setConfirmClear(false); }}
                    className="text-red-400 hover:text-red-300 font-medium transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="text-neutral-500 hover:text-white transition-colors"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="text-neutral-500 hover:text-white transition-colors"
                >
                  Clear all
                </button>
              )
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
