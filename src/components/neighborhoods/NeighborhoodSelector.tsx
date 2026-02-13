'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Neighborhood, GlobalRegion } from '@/types';

type GroupBy = 'city' | 'country' | 'region';

interface NeighborhoodSelectorProps {
  neighborhoods: Neighborhood[];
  onSelectionChange?: (selectedIds: string[]) => void;
}

const PREFS_KEY = 'flaneur-neighborhood-preferences';

const REGION_LABELS: Record<GlobalRegion, string> = {
  'north-america': 'North America',
  'europe': 'Europe',
  'asia-pacific': 'Asia Pacific',
  'middle-east': 'Middle East',
  'south-america': 'South America',
  'us-vacation': 'US Vacation',
  'caribbean-vacation': 'Caribbean Vacation',
  'europe-vacation': 'European Vacation',
  'test': 'Test Lab',
  'community': 'Community',
};

export function NeighborhoodSelector({
  neighborhoods,
  onSelectionChange
}: NeighborhoodSelectorProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('region');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setUserId(session.user.id);
        // Load from database for logged-in users
        const { data } = await supabase
          .from('user_neighborhood_preferences')
          .select('neighborhood_id')
          .eq('user_id', session.user.id);

        if (data && data.length > 0) {
          const ids = data.map(p => p.neighborhood_id);
          setSelected(ids);
          onSelectionChange?.(ids);
        }
      } else {
        // Load from localStorage for guests
        const stored = localStorage.getItem(PREFS_KEY);
        if (stored) {
          try {
            const ids = JSON.parse(stored);
            setSelected(ids);
            onSelectionChange?.(ids);
          } catch {
            // Invalid stored data
          }
        }
      }
    };

    loadPreferences();
  }, []);

  // Filter neighborhoods based on search query
  const filteredNeighborhoods = useMemo(() => {
    if (!searchQuery.trim()) return neighborhoods;
    const query = searchQuery.toLowerCase();
    return neighborhoods.filter(n =>
      n.name.toLowerCase().includes(query) ||
      n.city.toLowerCase().includes(query) ||
      (n.country && n.country.toLowerCase().includes(query))
    );
  }, [neighborhoods, searchQuery]);

  // Group neighborhoods based on groupBy setting
  const grouped = useMemo(() => {
    const source = filteredNeighborhoods;
    if (groupBy === 'region') {
      const byRegion: Record<string, Record<string, Record<string, Neighborhood[]>>> = {};
      source.forEach(n => {
        const region = n.region || 'other';
        const country = n.country || 'Unknown';
        const city = n.city || 'Unknown';
        if (!byRegion[region]) byRegion[region] = {};
        if (!byRegion[region][country]) byRegion[region][country] = {};
        if (!byRegion[region][country][city]) byRegion[region][country][city] = [];
        byRegion[region][country][city].push(n);
      });
      return byRegion;
    } else if (groupBy === 'country') {
      const byCountry: Record<string, Record<string, Neighborhood[]>> = {};
      source.forEach(n => {
        const country = n.country || 'Unknown';
        const city = n.city || 'Unknown';
        if (!byCountry[country]) byCountry[country] = {};
        if (!byCountry[country][city]) byCountry[country][city] = [];
        byCountry[country][city].push(n);
      });
      return byCountry;
    } else {
      const byCity: Record<string, Neighborhood[]> = {};
      source.forEach(n => {
        const city = n.city || 'Unknown';
        if (!byCity[city]) byCity[city] = [];
        byCity[city].push(n);
      });
      return byCity;
    }
  }, [filteredNeighborhoods, groupBy]);

  // Get unique cities for quick filter
  const cities = useMemo(() => {
    const citySet = new Set(neighborhoods.map(n => n.city));
    return Array.from(citySet).sort();
  }, [neighborhoods]);

  const toggleSection = (sectionKey: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionKey)) {
      newExpanded.delete(sectionKey);
    } else {
      newExpanded.add(sectionKey);
    }
    setExpandedSections(newExpanded);
  };

  const toggleNeighborhood = async (id: string) => {
    setSaving(true);
    const newSelected = selected.includes(id)
      ? selected.filter(s => s !== id)
      : [...selected, id];

    setSelected(newSelected);
    onSelectionChange?.(newSelected);

    if (userId) {
      const supabase = createClient();
      if (selected.includes(id)) {
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
      localStorage.setItem(PREFS_KEY, JSON.stringify(newSelected));
    }

    setSaving(false);
  };

  const selectAll = async (ids: string[]) => {
    setSaving(true);
    const newSelected = [...new Set([...selected, ...ids])];
    setSelected(newSelected);
    onSelectionChange?.(newSelected);

    if (userId) {
      const supabase = createClient();
      const toAdd = ids.filter(id => !selected.includes(id));
      if (toAdd.length > 0) {
        await supabase
          .from('user_neighborhood_preferences')
          .upsert(toAdd.map(id => ({ user_id: userId, neighborhood_id: id })));
      }
    } else {
      localStorage.setItem(PREFS_KEY, JSON.stringify(newSelected));
    }

    setSaving(false);
  };

  const deselectAll = async (ids: string[]) => {
    setSaving(true);
    const newSelected = selected.filter(s => !ids.includes(s));
    setSelected(newSelected);
    onSelectionChange?.(newSelected);

    if (userId) {
      const supabase = createClient();
      await supabase
        .from('user_neighborhood_preferences')
        .delete()
        .eq('user_id', userId)
        .in('neighborhood_id', ids);
    } else {
      localStorage.setItem(PREFS_KEY, JSON.stringify(newSelected));
    }

    setSaving(false);
  };

  const getIdsForGroup = (groupPath: string[]): string[] => {
    if (groupBy === 'city' && groupPath.length === 1) {
      const city = groupPath[0];
      return filteredNeighborhoods.filter(n => n.city === city).map(n => n.id);
    } else if (groupBy === 'country') {
      if (groupPath.length === 1) {
        const country = groupPath[0];
        return filteredNeighborhoods.filter(n => n.country === country).map(n => n.id);
      } else if (groupPath.length === 2) {
        const [country, city] = groupPath;
        return filteredNeighborhoods.filter(n => n.country === country && n.city === city).map(n => n.id);
      }
    } else if (groupBy === 'region') {
      if (groupPath.length === 1) {
        const region = groupPath[0];
        return filteredNeighborhoods.filter(n => n.region === region).map(n => n.id);
      } else if (groupPath.length === 2) {
        const [region, country] = groupPath;
        return filteredNeighborhoods.filter(n => n.region === region && n.country === country).map(n => n.id);
      } else if (groupPath.length === 3) {
        const [region, country, city] = groupPath;
        return filteredNeighborhoods.filter(n => n.region === region && n.country === country && n.city === city).map(n => n.id);
      }
    }
    return [];
  };

  const isAllSelected = (ids: string[]) => ids.length > 0 && ids.every(id => selected.includes(id));

  const NeighborhoodButton = ({ hood }: { hood: Neighborhood }) => (
    <button
      onClick={() => toggleNeighborhood(hood.id)}
      disabled={saving || hood.is_coming_soon}
      className={`px-3 py-1.5 text-sm border transition-colors ${
        hood.is_coming_soon
          ? 'bg-elevated text-fg-subtle border-border cursor-not-allowed'
          : selected.includes(hood.id)
          ? 'bg-amber-600 text-white border-amber-600'
          : 'bg-surface text-fg-muted border-border hover:border-border-strong'
      } disabled:opacity-50`}
    >
      {hood.name}
      {hood.is_coming_soon && <span className="ml-1 text-xs">(Soon)</span>}
    </button>
  );

  const SelectAllButton = ({ label, groupPath }: { label: string; groupPath: string[] }) => {
    const ids = getIdsForGroup(groupPath).filter(id => {
      const n = filteredNeighborhoods.find(n => n.id === id);
      return n && !n.is_coming_soon;
    });
    const allSelected = isAllSelected(ids);

    if (ids.length === 0) return null;

    return (
      <button
        onClick={() => allSelected ? deselectAll(ids) : selectAll(ids)}
        disabled={saving}
        className="text-xs text-fg-subtle hover:text-fg underline ml-2 disabled:opacity-50"
      >
        {allSelected ? 'Deselect all' : 'Select all'}
      </button>
    );
  };

  const CollapsibleHeader = ({
    title,
    sectionKey,
    count,
    groupPath,
    level = 0
  }: {
    title: string;
    sectionKey: string;
    count: number;
    groupPath: string[];
    level?: number;
  }) => {
    const isExpanded = expandedSections.has(sectionKey) || searchQuery.length > 0;
    const textSizes = ['text-base font-semibold', 'text-sm font-medium', 'text-xs tracking-widest uppercase'];
    const textColors = ['text-fg', 'text-fg-muted', 'text-fg-subtle'];

    return (
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => toggleSection(sectionKey)}
          className={`flex items-center gap-2 ${textSizes[level]} ${textColors[level]} hover:text-fg`}
        >
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {title}
          <span className="text-fg-muted font-normal">({count})</span>
        </button>
        <SelectAllButton label={title} groupPath={groupPath} />
      </div>
    );
  };

  // Search results view
  const renderSearchResults = () => {
    if (filteredNeighborhoods.length === 0) {
      return (
        <div className="text-center py-8 text-fg-subtle">
          No neighborhoods found for "{searchQuery}"
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-xs text-fg-subtle mb-3">
          {filteredNeighborhoods.length} result{filteredNeighborhoods.length !== 1 ? 's' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {filteredNeighborhoods.map(hood => (
            <button
              key={hood.id}
              onClick={() => toggleNeighborhood(hood.id)}
              disabled={saving || hood.is_coming_soon}
              className={`px-3 py-2 text-sm border transition-colors ${
                hood.is_coming_soon
                  ? 'bg-elevated text-fg-subtle border-border cursor-not-allowed'
                  : selected.includes(hood.id)
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-surface text-fg-muted border-border hover:border-border-strong'
              } disabled:opacity-50`}
            >
              <span className="font-medium">{hood.name}</span>
              <span className="text-xs opacity-70 ml-1">
                {hood.city}{hood.country ? `, ${hood.country}` : ''}
              </span>
              {hood.is_coming_soon && <span className="ml-1 text-xs">(Soon)</span>}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderCityGroup = () => (
    <div className="space-y-4">
      {Object.entries(grouped as Record<string, Neighborhood[]>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([city, hoods]) => {
          const sectionKey = `city-${city}`;
          const isExpanded = expandedSections.has(sectionKey) || searchQuery.length > 0;
          return (
            <div key={city}>
              <CollapsibleHeader
                title={city}
                sectionKey={sectionKey}
                count={hoods.length}
                groupPath={[city]}
                level={2}
              />
              {isExpanded && (
                <div className="flex flex-wrap gap-2 ml-6">
                  {hoods.map(hood => (
                    <NeighborhoodButton key={hood.id} hood={hood} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  const renderCountryGroup = () => (
    <div className="space-y-6">
      {Object.entries(grouped as Record<string, Record<string, Neighborhood[]>>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([country, cities]) => {
          const countrySectionKey = `country-${country}`;
          const countryCount = Object.values(cities).flat().length;
          const isCountryExpanded = expandedSections.has(countrySectionKey) || searchQuery.length > 0;

          return (
            <div key={country}>
              <CollapsibleHeader
                title={country}
                sectionKey={countrySectionKey}
                count={countryCount}
                groupPath={[country]}
                level={1}
              />
              {isCountryExpanded && (
                <div className="space-y-4 ml-4">
                  {Object.entries(cities)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([city, hoods]) => {
                      const citySectionKey = `${country}-${city}`;
                      const isCityExpanded = expandedSections.has(citySectionKey) || searchQuery.length > 0;
                      return (
                        <div key={city}>
                          <CollapsibleHeader
                            title={city}
                            sectionKey={citySectionKey}
                            count={hoods.length}
                            groupPath={[country, city]}
                            level={2}
                          />
                          {isCityExpanded && (
                            <div className="flex flex-wrap gap-2 ml-6">
                              {hoods.map(hood => (
                                <NeighborhoodButton key={hood.id} hood={hood} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  const renderRegionGroup = () => (
    <div className="space-y-8">
      {Object.entries(grouped as Record<string, Record<string, Record<string, Neighborhood[]>>>)
        .sort(([a], [b]) => {
          const order = ['north-america', 'europe', 'asia-pacific', 'middle-east', 'other'];
          return order.indexOf(a) - order.indexOf(b);
        })
        .map(([region, countries]) => {
          const regionSectionKey = `region-${region}`;
          const regionCount = Object.values(countries).flatMap(c => Object.values(c)).flat().length;
          const isRegionExpanded = expandedSections.has(regionSectionKey) || searchQuery.length > 0;

          return (
            <div key={region}>
              <CollapsibleHeader
                title={REGION_LABELS[region as GlobalRegion] || region}
                sectionKey={regionSectionKey}
                count={regionCount}
                groupPath={[region]}
                level={0}
              />
              {isRegionExpanded && (
                <div className="space-y-6 ml-4">
                  {Object.entries(countries)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([country, cities]) => {
                      const countrySectionKey = `${region}-${country}`;
                      const countryCount = Object.values(cities).flat().length;
                      const isCountryExpanded = expandedSections.has(countrySectionKey) || searchQuery.length > 0;

                      return (
                        <div key={country}>
                          <CollapsibleHeader
                            title={country}
                            sectionKey={countrySectionKey}
                            count={countryCount}
                            groupPath={[region, country]}
                            level={1}
                          />
                          {isCountryExpanded && (
                            <div className="space-y-4 ml-4">
                              {Object.entries(cities)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([city, hoods]) => {
                                  const citySectionKey = `${region}-${country}-${city}`;
                                  const isCityExpanded = expandedSections.has(citySectionKey) || searchQuery.length > 0;
                                  return (
                                    <div key={city}>
                                      <CollapsibleHeader
                                        title={city}
                                        sectionKey={citySectionKey}
                                        count={hoods.length}
                                        groupPath={[region, country, city]}
                                        level={2}
                                      />
                                      {isCityExpanded && (
                                        <div className="flex flex-wrap gap-2 ml-6">
                                          {hoods.map(hood => (
                                            <NeighborhoodButton key={hood.id} hood={hood} />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Search and controls */}
      <div className="space-y-3">
        {/* Search input */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search neighborhoods, cities, or countries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-surface border border-border text-fg rounded placeholder:text-fg-subtle focus:outline-none focus:border-amber-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Quick city filters */}
        {!searchQuery && (
          <div className="flex flex-wrap gap-1">
            {cities.slice(0, 8).map(city => (
              <button
                key={city}
                onClick={() => setSearchQuery(city)}
                className="px-2 py-1 text-xs bg-elevated hover:bg-white/10 text-fg-muted rounded transition-colors"
              >
                {city}
              </button>
            ))}
            {cities.length > 8 && (
              <span className="px-2 py-1 text-xs text-fg-muted">
                +{cities.length - 8} more
              </span>
            )}
          </div>
        )}

        {/* Group by selector */}
        {!searchQuery && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-subtle">Group by:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="text-sm border border-border rounded px-2 py-1 bg-surface text-fg"
            >
              <option value="region">Region</option>
              <option value="country">Country</option>
              <option value="city">City</option>
            </select>
            <button
              onClick={() => setExpandedSections(new Set())}
              className="text-xs text-fg-subtle hover:text-fg underline ml-2"
            >
              Collapse all
            </button>
          </div>
        )}
      </div>

      {/* Selected count */}
      {selected.length > 0 && (
        <div className="flex items-center gap-2 py-2 px-3 bg-surface rounded">
          <span className="text-sm font-medium text-fg">
            {selected.length} neighborhood{selected.length !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => deselectAll(selected)}
            disabled={saving}
            className="text-xs text-fg-subtle hover:text-fg underline ml-auto disabled:opacity-50"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Render neighborhoods */}
      {searchQuery ? (
        renderSearchResults()
      ) : (
        <>
          {groupBy === 'city' && renderCityGroup()}
          {groupBy === 'country' && renderCountryGroup()}
          {groupBy === 'region' && renderRegionGroup()}
        </>
      )}
    </div>
  );
}

// Export function to get preferences (for use in newsletter signup)
export function getStoredNeighborhoodPreferences(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(PREFS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  return [];
}
