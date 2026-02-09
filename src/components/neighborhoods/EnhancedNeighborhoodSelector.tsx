'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Neighborhood, GlobalRegion } from '@/types';
import Link from 'next/link';

// City gradient configurations - muted neutral palette for sophisticated aesthetic
const CITY_GRADIENTS: Record<string, string> = {
  // North America
  'New York': 'from-neutral-800 via-neutral-700 to-stone-700',
  'San Francisco': 'from-stone-700 via-neutral-600 to-zinc-600',
  'Los Angeles': 'from-zinc-700 via-stone-600 to-neutral-600',
  'Chicago': 'from-slate-700 via-gray-600 to-neutral-600',
  'Miami': 'from-stone-600 via-neutral-600 to-zinc-600',
  'Washington DC': 'from-slate-700 via-stone-600 to-zinc-600',
  'Toronto': 'from-neutral-700 via-stone-600 to-slate-600',
  // Europe
  'London': 'from-slate-700 via-gray-600 to-stone-600',
  'Paris': 'from-stone-700 via-neutral-600 to-zinc-600',
  'Berlin': 'from-zinc-800 via-neutral-700 to-stone-700',
  'Amsterdam': 'from-neutral-700 via-stone-600 to-slate-600',
  'Stockholm': 'from-slate-700 via-neutral-600 to-stone-600',
  'Copenhagen': 'from-stone-700 via-slate-600 to-neutral-600',
  'Barcelona': 'from-neutral-700 via-zinc-600 to-stone-600',
  'Milan': 'from-zinc-700 via-stone-600 to-neutral-600',
  'Lisbon': 'from-stone-700 via-neutral-600 to-slate-600',
  // Asia Pacific
  'Tokyo': 'from-neutral-800 via-zinc-700 to-stone-700',
  'Hong Kong': 'from-stone-700 via-neutral-600 to-zinc-600',
  'Singapore': 'from-zinc-700 via-stone-600 to-neutral-600',
  'Sydney': 'from-slate-700 via-neutral-600 to-stone-600',
  'Melbourne': 'from-neutral-700 via-stone-600 to-zinc-600',
  // Middle East
  'Dubai': 'from-stone-700 via-neutral-600 to-zinc-600',
  'Tel Aviv': 'from-slate-700 via-stone-600 to-neutral-600',
  // US Vacation - dark green theme
  'Nantucket': 'from-emerald-900 via-emerald-800 to-green-800',
  "Martha's Vineyard": 'from-emerald-900 via-emerald-800 to-green-800',
  'The Hamptons': 'from-emerald-900 via-emerald-800 to-green-800',
  'Aspen': 'from-emerald-900 via-emerald-800 to-green-800',
  // Caribbean Vacation - dark green theme
  'St. Barts': 'from-emerald-900 via-emerald-800 to-green-800',
  // European Vacation - dark green theme
  'Saint-Tropez': 'from-emerald-900 via-emerald-800 to-green-800',
  'Marbella': 'from-emerald-900 via-emerald-800 to-green-800',
  'Sylt': 'from-emerald-900 via-emerald-800 to-green-800',
};

const REGION_DATA: Record<GlobalRegion, { label: string; icon: string; description: string; color?: string }> = {
  'north-america': {
    label: 'North America',
    icon: '◉',
    description: 'New York to San Francisco'
  },
  'europe': {
    label: 'Europe',
    icon: '◈',
    description: 'London to Barcelona'
  },
  'asia-pacific': {
    label: 'Asia Pacific',
    icon: '◇',
    description: 'Tokyo to Sydney'
  },
  'middle-east': {
    label: 'Middle East',
    icon: '◆',
    description: 'Dubai to Tel Aviv'
  },
  'south-america': {
    label: 'South America',
    icon: '◎',
    description: 'São Paulo to Buenos Aires'
  },
  'us-vacation': {
    label: 'US Vacation',
    icon: '○',
    description: 'Nantucket to Aspen',
    color: '#00563F'
  },
  'caribbean-vacation': {
    label: 'Caribbean Vacation',
    icon: '□',
    description: 'St. Barts',
    color: '#00563F'
  },
  'europe-vacation': {
    label: 'European Vacation',
    icon: '△',
    description: 'Saint-Tropez to Sylt',
    color: '#00563F'
  },
  'test': {
    label: 'Test Lab',
    icon: '⚗',
    description: 'Experimental feeds',
    color: '#6B21A8'
  },
};

const PREFS_KEY = 'flaneur-neighborhood-preferences';

interface EnhancedNeighborhoodSelectorProps {
  neighborhoods: Neighborhood[];
  articleCounts?: Record<string, number>; // neighborhood_id -> article count
  mode?: 'page' | 'modal';
  onSelectionChange?: (selectedIds: string[]) => void;
  onClose?: () => void;
}

interface CityData {
  name: string;
  country: string;
  region: GlobalRegion;
  neighborhoods: Neighborhood[];
  totalArticles: number;
}

export function EnhancedNeighborhoodSelector({
  neighborhoods,
  articleCounts = {},
  mode = 'page',
  onSelectionChange,
  onClose,
}: EnhancedNeighborhoodSelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set(['europe', 'north-america']));
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());
  const [activeRegion, setActiveRegion] = useState<GlobalRegion | 'all'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setUserId(session.user.id);
        const { data } = await supabase
          .from('user_neighborhood_preferences')
          .select('neighborhood_id')
          .eq('user_id', session.user.id);

        if (data && data.length > 0) {
          const ids = new Set(data.map(p => p.neighborhood_id));
          setSelected(ids);
          onSelectionChange?.(Array.from(ids));
        }
      } else {
        const stored = localStorage.getItem(PREFS_KEY);
        if (stored) {
          try {
            const ids = new Set(JSON.parse(stored) as string[]);
            setSelected(ids);
            onSelectionChange?.(Array.from(ids));
          } catch {
            // Invalid stored data
          }
        }
      }
    };

    loadPreferences();
  }, []);

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !searchQuery) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (searchQuery) {
          setSearchQuery('');
        } else if (onClose) {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, onClose]);

  // Organize neighborhoods by region -> city
  const organizedData = useMemo(() => {
    const byRegion: Record<GlobalRegion, CityData[]> = {
      'north-america': [],
      'europe': [],
      'asia-pacific': [],
      'middle-east': [],
      'south-america': [],
      'us-vacation': [],
      'caribbean-vacation': [],
      'europe-vacation': [],
      'test': [],
    };

    const cityMap = new Map<string, CityData>();

    neighborhoods.forEach(n => {
      const key = `${n.city}-${n.country}`;
      if (!cityMap.has(key)) {
        cityMap.set(key, {
          name: n.city,
          country: n.country || '',
          region: n.region || 'europe',
          neighborhoods: [],
          totalArticles: 0,
        });
      }
      const city = cityMap.get(key)!;
      city.neighborhoods.push(n);
      city.totalArticles += articleCounts[n.id] || 0;
    });

    cityMap.forEach(city => {
      if (byRegion[city.region]) {
        byRegion[city.region].push(city);
      }
    });

    // Sort cities by article count (most active first)
    Object.values(byRegion).forEach(cities => {
      cities.sort((a, b) => b.totalArticles - a.totalArticles);
    });

    return byRegion;
  }, [neighborhoods, articleCounts]);

  // Filter based on search
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return organizedData;

    const query = searchQuery.toLowerCase();
    const result: Record<GlobalRegion, CityData[]> = {
      'north-america': [],
      'europe': [],
      'asia-pacific': [],
      'middle-east': [],
      'south-america': [],
      'us-vacation': [],
      'caribbean-vacation': [],
      'europe-vacation': [],
      'test': [],
    };

    Object.entries(organizedData).forEach(([region, cities]) => {
      cities.forEach(city => {
        const matchingNeighborhoods = city.neighborhoods.filter(n =>
          n.name.toLowerCase().includes(query) ||
          n.city.toLowerCase().includes(query) ||
          (n.country && n.country.toLowerCase().includes(query))
        );

        if (matchingNeighborhoods.length > 0) {
          result[region as GlobalRegion].push({
            ...city,
            neighborhoods: matchingNeighborhoods,
          });
        }
      });
    });

    return result;
  }, [organizedData, searchQuery]);

  // Get regions to display based on filter
  const displayRegions = useMemo(() => {
    if (activeRegion === 'all') {
      return Object.keys(filteredData) as GlobalRegion[];
    }
    return [activeRegion];
  }, [activeRegion, filteredData]);

  const toggleNeighborhood = async (id: string) => {
    setSaving(true);
    const newSelected = new Set(selected);

    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }

    setSelected(newSelected);
    onSelectionChange?.(Array.from(newSelected));

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

    setSaving(false);
  };

  const selectAllInCity = async (cityNeighborhoods: Neighborhood[]) => {
    setSaving(true);
    const ids = cityNeighborhoods.filter(n => !n.is_coming_soon).map(n => n.id);
    const newSelected = new Set([...selected, ...ids]);

    setSelected(newSelected);
    onSelectionChange?.(Array.from(newSelected));

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

    setSaving(false);
  };

  const toggleRegion = (region: GlobalRegion) => {
    const newExpanded = new Set(expandedRegions);
    if (newExpanded.has(region)) {
      newExpanded.delete(region);
    } else {
      newExpanded.add(region);
    }
    setExpandedRegions(newExpanded);
  };

  const toggleCity = (cityKey: string) => {
    const newExpanded = new Set(expandedCities);
    if (newExpanded.has(cityKey)) {
      newExpanded.delete(cityKey);
    } else {
      newExpanded.add(cityKey);
    }
    setExpandedCities(newExpanded);
  };

  const getCityUrl = (city: CityData, neighborhood: Neighborhood) => {
    const citySlug = city.name.toLowerCase().replace(/\s+/g, '-');
    const neighborhoodSlug = neighborhood.id.split('-').slice(1).join('-');
    return `/${citySlug}/${neighborhoodSlug}`;
  };

  const totalSelected = selected.size;
  const totalNeighborhoods = neighborhoods.filter(n => !n.is_coming_soon).length;

  return (
    <div className={`${mode === 'modal' ? 'max-h-[80vh] overflow-hidden flex flex-col' : ''}`}>
      {/* Header */}
      <div className={`${mode === 'modal' ? 'px-6 pt-6 pb-4 border-b border-white/[0.08]' : 'mb-8'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-light tracking-tight text-neutral-100">
              {mode === 'modal' ? 'Select Neighborhoods' : 'Neighborhoods'}
            </h2>
            <p className="mt-1 text-neutral-500 text-sm">
              {totalSelected > 0 ? (
                <span className="text-neutral-100 font-medium">{totalSelected} selected</span>
              ) : (
                'Choose neighborhoods to personalize your stories'
              )}
              <span className="mx-2 text-neutral-300">·</span>
              <span>{totalNeighborhoods} available</span>
            </p>
          </div>
          {mode === 'modal' && onClose && (
            <button
              onClick={onClose}
              className="p-2 -m-2 text-neutral-400 hover:text-neutral-100 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="mt-4 relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search neighborhoods, cities, or countries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-12 py-3 text-sm bg-neutral-800 border-0 rounded-lg text-neutral-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-surface transition-all placeholder:text-neutral-500"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400 hover:text-neutral-100"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-xs text-neutral-500 bg-neutral-700 rounded">
                /
              </kbd>
            </div>
          )}
        </div>

        {/* Region Quick Filters */}
        {!searchQuery && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveRegion('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                activeRegion === 'all'
                  ? 'bg-amber-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-white/10'
              }`}
            >
              All Regions
            </button>
            {(Object.keys(REGION_DATA) as GlobalRegion[]).map(region => {
              const isVacation = region.includes('vacation');
              return (
                <button
                  key={region}
                  onClick={() => setActiveRegion(region)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                    activeRegion === region
                      ? isVacation
                        ? 'text-white'
                        : 'bg-amber-600 text-white'
                      : isVacation
                        ? 'text-[#00563F] border border-[#00563F] hover:bg-[#00563F] hover:text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:bg-white/10'
                  }`}
                  style={activeRegion === region && isVacation ? { backgroundColor: '#00563F' } : {}}
                >
                  {REGION_DATA[region].label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className={`${mode === 'modal' ? 'flex-1 overflow-y-auto px-6 py-4' : ''}`}>
        {/* Search Results View */}
        {searchQuery && (
          <div className="mb-4">
            <p className="text-xs text-neutral-500 mb-4">
              {Object.values(filteredData).flat().reduce((acc, city) => acc + city.neighborhoods.length, 0)} results for "{searchQuery}"
            </p>
          </div>
        )}

        {/* Regions */}
        <div className="space-y-8">
          {displayRegions.map(region => {
            const cities = filteredData[region];
            if (cities.length === 0) return null;

            const regionData = REGION_DATA[region];
            const isExpanded = expandedRegions.has(region) || searchQuery.length > 0;
            const regionNeighborhoodCount = cities.reduce((acc, c) => acc + c.neighborhoods.length, 0);

            return (
              <div key={region} className="group">
                {/* Region Header */}
                <button
                  onClick={() => toggleRegion(region)}
                  className="w-full flex items-center justify-between py-3 border-b border-white/[0.08] hover:border-white/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg text-neutral-300 group-hover:text-neutral-500 transition-colors">
                      {regionData.icon}
                    </span>
                    <div className="text-left">
                      <h3 className="text-sm font-semibold tracking-wide uppercase text-neutral-100">
                        {regionData.label}
                      </h3>
                      <p className="text-xs text-neutral-400 mt-0.5">{regionData.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-400">
                      {regionNeighborhoodCount} neighborhoods
                    </span>
                    <svg
                      className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Cities Grid */}
                <div
                  className={`grid gap-4 mt-4 transition-all duration-300 ${
                    isExpanded ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 opacity-100' : 'hidden opacity-0'
                  }`}
                >
                  {cities.map(city => {
                    const cityKey = `${city.name}-${city.country}`;
                    const isCityExpanded = expandedCities.has(cityKey) || searchQuery.length > 0;
                    const gradient = CITY_GRADIENTS[city.name] || 'from-neutral-600 to-neutral-800';
                    const selectedInCity = city.neighborhoods.filter(n => selected.has(n.id)).length;
                    const availableInCity = city.neighborhoods.filter(n => !n.is_coming_soon).length;

                    return (
                      <div
                        key={cityKey}
                        className={`relative overflow-hidden rounded-xl border transition-all duration-200 ${
                          selectedInCity > 0
                            ? 'border-amber-600 shadow-lg'
                            : 'border-white/[0.08] hover:border-white/20 hover:shadow-md'
                        }`}
                      >
                        {/* City Card Header */}
                        <button
                          onClick={() => toggleCity(cityKey)}
                          className="w-full text-left"
                        >
                          <div className={`relative h-24 bg-gradient-to-br ${gradient} overflow-hidden`}>
                            {/* Decorative pattern */}
                            <div className="absolute inset-0 opacity-10">
                              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                <pattern id={`grid-${cityKey}`} width="10" height="10" patternUnits="userSpaceOnUse">
                                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5"/>
                                </pattern>
                                <rect width="100" height="100" fill={`url(#grid-${cityKey})`}/>
                              </svg>
                            </div>

                            {/* City name overlay */}
                            <div className="absolute inset-0 flex flex-col justify-end p-4">
                              <h4 className="text-lg font-semibold text-white drop-shadow-lg">
                                {city.name}
                              </h4>
                              <p className="text-xs text-white/70">{city.country}</p>
                            </div>

                            {/* Selection indicator */}
                            {selectedInCity > 0 && (
                              <div className="absolute top-3 right-3 px-2 py-1 bg-surface rounded-full text-xs font-medium text-neutral-100 shadow-lg">
                                {selectedInCity}/{availableInCity}
                              </div>
                            )}

                            {/* Trending indicator */}
                            {city.totalArticles > 50 && (
                              <div className="absolute top-3 left-3 px-2 py-1 bg-amber-400 rounded-full text-xs font-medium text-amber-900">
                                Popular
                              </div>
                            )}
                          </div>
                        </button>

                        {/* Neighborhoods List */}
                        <div
                          className={`bg-surface transition-all duration-200 ${
                            isCityExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
                          }`}
                        >
                          <div className="p-3 space-y-1">
                            {/* Select All for City */}
                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.08]">
                              <span className="text-xs text-neutral-400">
                                {city.neighborhoods.length} neighborhood{city.neighborhoods.length !== 1 ? 's' : ''}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectAllInCity(city.neighborhoods);
                                }}
                                disabled={saving}
                                className="text-xs text-neutral-500 hover:text-neutral-100 font-medium disabled:opacity-50"
                              >
                                Select all
                              </button>
                            </div>

                            {/* Neighborhood Pills */}
                            <div className="flex flex-wrap gap-1.5">
                              {city.neighborhoods.map((neighborhood, idx) => {
                                const isSelected = selected.has(neighborhood.id);
                                const articleCount = articleCounts[neighborhood.id] || 0;

                                return (
                                  <button
                                    key={neighborhood.id}
                                    onClick={() => toggleNeighborhood(neighborhood.id)}
                                    disabled={saving || neighborhood.is_coming_soon}
                                    className={`group/pill relative px-3 py-1.5 text-sm rounded-lg transition-all duration-150 ${
                                      neighborhood.is_coming_soon
                                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                        : isSelected
                                        ? 'bg-neutral-900 text-white shadow-md'
                                        : 'bg-neutral-800 text-neutral-300 hover:bg-white/10'
                                    }`}
                                    style={{
                                      animationDelay: `${idx * 30}ms`,
                                    }}
                                  >
                                    <span className="relative z-10 flex items-center gap-1.5">
                                      {neighborhood.name}
                                      {articleCount > 0 && !neighborhood.is_coming_soon && (
                                        <span className={`text-[10px] px-1 py-0.5 rounded ${
                                          isSelected ? 'bg-white/20' : 'bg-neutral-700'
                                        }`}>
                                          {articleCount}
                                        </span>
                                      )}
                                      {neighborhood.is_coming_soon && (
                                        <span className="text-[10px]">Soon</span>
                                      )}
                                    </span>

                                    {/* Checkmark for selected */}
                                    {isSelected && (
                                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {/* View City Link */}
                            {city.neighborhoods.length > 0 && (
                              <Link
                                href={getCityUrl(city, city.neighborhoods[0])}
                                className="mt-3 flex items-center justify-center gap-1 py-2 text-xs text-neutral-500 hover:text-neutral-100 transition-colors"
                              >
                                View {city.name} stories
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {Object.values(filteredData).every(cities => cities.length === 0) && (
          <div className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-neutral-500">No neighborhoods found for "{searchQuery}"</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 text-sm text-neutral-100 font-medium hover:underline"
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      {/* Footer (for modal mode) */}
      {mode === 'modal' && (
        <div className="px-6 py-4 border-t border-white/[0.08] bg-canvas flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            {totalSelected > 0 ? (
              <>
                <span className="font-medium text-neutral-100">{totalSelected}</span> neighborhood{totalSelected !== 1 ? 's' : ''} selected
              </>
            ) : (
              'Select at least one neighborhood'
            )}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onClose}
              disabled={totalSelected === 0}
              className="px-5 py-2 text-sm font-medium bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Export a modal wrapper component
export function NeighborhoodSelectorModal({
  isOpen,
  onClose,
  neighborhoods,
  articleCounts,
  onSelectionChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  neighborhoods: Neighborhood[];
  articleCounts?: Record<string, number>;
  onSelectionChange?: (selectedIds: string[]) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="absolute inset-4 md:inset-8 lg:inset-16 bg-surface rounded-2xl shadow-2xl overflow-hidden">
        <EnhancedNeighborhoodSelector
          neighborhoods={neighborhoods}
          articleCounts={articleCounts}
          mode="modal"
          onSelectionChange={onSelectionChange}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
