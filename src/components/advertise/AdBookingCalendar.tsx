'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { BookingForm } from './BookingForm';
import { resolveSearchQuery, isBroadSearch, groupResultsByCity, type SearchResult } from '@/lib/search-aliases';
import { getDistance, formatDistance } from '@/lib/geo-utils';

interface NeighborhoodOption {
  id: string;
  name: string;
  city: string;
  country?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  is_combo?: boolean;
  combo_component_names?: string[];
}

interface AvailabilityData {
  bookedDates: string[];
  blockedDates: string[];
  minDate: string;
  maxDate: string;
  price: {
    dailyBrief: number;
    sundayEdition: number;
    tier: 1 | 2 | 3;
  };
}

// Dropdown item types for the mixed-content dropdown
type DropdownItem =
  | { type: 'neighborhood'; item: NeighborhoodOption; matchDetail?: string }
  | { type: 'city-header'; city: string; count: number; items: NeighborhoodOption[] }
  | { type: 'total-count'; total: number; shown: number };

export function AdBookingCalendar() {
  // State
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodOption[]>([]);
  const [query, setQuery] = useState('');
  const [dropdownItems, setDropdownItems] = useState<DropdownItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<NeighborhoodOption[]>([]);
  const [placementType, setPlacementType] = useState<'daily_brief' | 'sunday_edition'>('daily_brief');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [availabilities, setAvailabilities] = useState<Record<string, AvailabilityData>>({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const [nearMeLoading, setNearMeLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load neighborhoods
  useEffect(() => {
    fetch('/api/neighborhoods')
      .then((res) => res.json())
      .then((data) => {
        const all: NeighborhoodOption[] = (data.neighborhoods || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (n: any) => ({
            id: n.id,
            name: n.name,
            city: n.city,
            country: n.country,
            region: n.region,
            latitude: n.latitude,
            longitude: n.longitude,
            is_combo: n.is_combo,
            combo_component_names: n.combo_component_names,
          })
        );
        setNeighborhoods(all);
      })
      .catch(() => {});
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch availability for all selected neighborhoods
  const fetchAvailabilities = useCallback(async () => {
    if (selectedNeighborhoods.length === 0) return;

    setLoadingAvailability(true);
    const month = `${displayMonth.getFullYear()}-${String(displayMonth.getMonth() + 1).padStart(2, '0')}`;

    try {
      const results = await Promise.all(
        selectedNeighborhoods.map(async (n) => {
          const res = await fetch(
            `/api/ads/availability?month=${month}&neighborhood_id=${n.id}&type=${placementType}`
          );
          if (res.ok) {
            const data = await res.json();
            return { id: n.id, data };
          }
          return null;
        })
      );

      const newAvailabilities: Record<string, AvailabilityData> = {};
      for (const result of results) {
        if (result) {
          newAvailabilities[result.id] = result.data;
        }
      }
      setAvailabilities(newAvailabilities);
    } catch {
      // Silently fail
    } finally {
      setLoadingAvailability(false);
    }
  }, [selectedNeighborhoods, placementType, displayMonth]);

  useEffect(() => {
    fetchAvailabilities();
  }, [fetchAvailabilities]);

  // Build dropdown items from search results
  const buildDropdownItems = useCallback(
    (results: SearchResult<NeighborhoodOption>[]) => {
      const selectedIds = new Set(selectedNeighborhoods.map((n) => n.id));
      const available = results.filter((r) => !selectedIds.has(r.item.id));

      if (available.length === 0) {
        setDropdownItems([]);
        setShowDropdown(false);
        return;
      }

      const broad = isBroadSearch(available);

      if (broad && available.length > 8) {
        // Group by city for broad queries
        const groups = groupResultsByCity(available);
        const items: DropdownItem[] = [];
        let shown = 0;
        const MAX_VISIBLE = 12;

        for (const group of groups) {
          if (shown >= MAX_VISIBLE) break;

          items.push({
            type: 'city-header',
            city: group.city,
            count: group.items.length,
            items: group.items.map((r) => r.item),
          });
          shown++;

          // Show up to 3 neighborhoods per group
          const toShow = group.items.slice(0, 3);
          for (const r of toShow) {
            if (shown >= MAX_VISIBLE) break;
            items.push({
              type: 'neighborhood',
              item: r.item,
              matchDetail: r.matchDetail,
            });
            shown++;
          }
        }

        if (available.length > shown) {
          items.push({ type: 'total-count', total: available.length, shown });
        }

        setDropdownItems(items);
      } else {
        // Narrow query: flat list
        const items: DropdownItem[] = available.slice(0, 12).map((r) => ({
          type: 'neighborhood',
          item: r.item,
          matchDetail: r.matchDetail,
        }));

        if (available.length > 12) {
          items.push({ type: 'total-count', total: available.length, shown: 12 });
        }

        setDropdownItems(items);
      }

      setShowDropdown(true);
    },
    [selectedNeighborhoods]
  );

  // Search handler
  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);

      if (value.length < 2) {
        setDropdownItems([]);
        setShowDropdown(false);
        return;
      }

      const results = resolveSearchQuery(value, neighborhoods);
      buildDropdownItems(results);
    },
    [neighborhoods, buildDropdownItems]
  );

  // Near Me handler
  const handleNearMe = useCallback(() => {
    if (nearMeLoading) return;

    setNearMeLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: userLat, longitude: userLng } = position.coords;
        const selectedIds = new Set(selectedNeighborhoods.map((n) => n.id));

        const withDistance = neighborhoods
          .filter((n) => !selectedIds.has(n.id) && n.latitude != null && n.longitude != null)
          .map((n) => ({
            n,
            distance: getDistance(userLat, userLng, n.latitude!, n.longitude!),
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 12);

        const items: DropdownItem[] = withDistance.map(({ n, distance }) => ({
          type: 'neighborhood' as const,
          item: n,
          matchDetail: formatDistance(distance),
        }));

        setQuery('');
        setDropdownItems(items);
        setShowDropdown(true);
        setNearMeLoading(false);
      },
      () => {
        setNearMeLoading(false);
      },
      { timeout: 5000 }
    );
  }, [neighborhoods, selectedNeighborhoods, nearMeLoading]);

  const handleSelect = useCallback((n: NeighborhoodOption) => {
    setSelectedNeighborhoods((prev) => [...prev, n]);
    setQuery('');
    setDropdownItems([]);
    setShowDropdown(false);
    setSelectedDate(undefined);
  }, []);

  const handleSelectAllInCity = useCallback(
    (cityItems: NeighborhoodOption[]) => {
      const selectedIds = new Set(selectedNeighborhoods.map((n) => n.id));
      const toAdd = cityItems.filter((n) => !selectedIds.has(n.id));
      if (toAdd.length === 0) return;

      setSelectedNeighborhoods((prev) => [...prev, ...toAdd]);
      setQuery('');
      setDropdownItems([]);
      setShowDropdown(false);
      setSelectedDate(undefined);
    },
    [selectedNeighborhoods]
  );

  const handleRemove = useCallback((id: string) => {
    setSelectedNeighborhoods((prev) => prev.filter((n) => n.id !== id));
    setAvailabilities((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelectedDate(undefined);
  }, []);

  // Compute merged disabled dates (union of booked/blocked across all selected)
  const mergedBookedDates = new Set<string>();
  const mergedBlockedDates = new Set<string>();

  for (const avail of Object.values(availabilities)) {
    for (const d of avail.bookedDates) mergedBookedDates.add(d);
    for (const d of avail.blockedDates) mergedBlockedDates.add(d);
  }

  const isSundayEdition = placementType === 'sunday_edition';

  const isDateDisabled = (date: Date): boolean => {
    const dateStr = date.toISOString().split('T')[0];
    if (isSundayEdition && date.getDay() !== 0) return true;
    if (mergedBookedDates.has(dateStr)) return true;
    if (mergedBlockedDates.has(dateStr)) return true;
    return false;
  };

  // Compute total price across all selected neighborhoods
  const totalPriceCents = selectedNeighborhoods.reduce((sum, n) => {
    const avail = availabilities[n.id];
    if (!avail?.price) return sum;
    const price =
      placementType === 'sunday_edition'
        ? avail.price.sundayEdition
        : avail.price.dailyBrief;
    return sum + price;
  }, 0);

  return (
    <div className="space-y-8">
      {/* Neighborhood Search */}
      <div className="relative" ref={dropdownRef}>
        <label className="block text-xs tracking-[0.2em] uppercase text-neutral-500 mb-2">
          Neighborhoods
        </label>

        {/* Selected neighborhood pills */}
        {selectedNeighborhoods.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {selectedNeighborhoods.map((n) => (
              <div key={n.id}>
                <span className="inline-flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white">
                  {n.name}
                  <button
                    onClick={() => handleRemove(n.id)}
                    className="text-neutral-500 hover:text-white transition-colors ml-1"
                    aria-label={`Remove ${n.name}`}
                  >
                    &times;
                  </button>
                </span>
                {/* Combo component names */}
                {n.is_combo && n.combo_component_names && n.combo_component_names.length > 0 && (
                  <p className="text-xs text-neutral-500 mt-0.5 ml-1">
                    Includes: {n.combo_component_names.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Search input + Near Me button */}
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => dropdownItems.length > 0 && setShowDropdown(true)}
            placeholder={
              selectedNeighborhoods.length > 0
                ? 'Add another neighborhood...'
                : 'Search neighborhoods, cities, countries...'
            }
            className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-base text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
          <button
            onClick={handleNearMe}
            disabled={nearMeLoading}
            className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-sm text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors whitespace-nowrap"
            title="Find neighborhoods near me"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {nearMeLoading ? '...' : 'Near me'}
          </button>
        </div>

        {/* Dropdown */}
        {showDropdown && dropdownItems.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-neutral-900 border border-neutral-700 rounded-lg max-h-80 overflow-y-auto">
            {dropdownItems.map((item, idx) => {
              if (item.type === 'city-header') {
                return (
                  <button
                    key={`city-${item.city}-${idx}`}
                    onClick={() => handleSelectAllInCity(item.items)}
                    className="w-full text-left px-4 py-2.5 text-sm bg-neutral-800/50 hover:bg-neutral-800 transition-colors border-b border-neutral-800 flex items-center justify-between"
                  >
                    <span className="text-neutral-300 font-medium">
                      {item.city}
                      <span className="text-neutral-500 font-normal ml-1.5">
                        ({item.count} neighborhood{item.count !== 1 ? 's' : ''})
                      </span>
                    </span>
                    <span className="text-xs text-neutral-500 hover:text-neutral-300">
                      Select all
                    </span>
                  </button>
                );
              }

              if (item.type === 'total-count') {
                return (
                  <div
                    key={`total-${idx}`}
                    className="px-4 py-2.5 text-xs text-neutral-500 text-center border-t border-neutral-800"
                  >
                    {item.total} total matches
                  </div>
                );
              }

              // type === 'neighborhood'
              return (
                <button
                  key={item.item.id}
                  onClick={() => handleSelect(item.item)}
                  className="w-full text-left px-4 py-3 text-base hover:bg-neutral-800 transition-colors border-b border-neutral-800 last:border-b-0"
                >
                  <span className="text-white">{item.item.name}</span>
                  {item.matchDetail && (
                    <span className="text-amber-600 text-sm ml-1">
                      ({item.matchDetail})
                    </span>
                  )}
                  <span className="text-neutral-500 ml-2">{item.item.city}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Placement Type Toggle */}
      <div>
        <label className="block text-xs tracking-[0.2em] uppercase text-neutral-500 mb-2">
          Placement
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setPlacementType('daily_brief');
              setSelectedDate(undefined);
            }}
            className={`flex-1 py-3 text-sm tracking-wide uppercase transition-colors rounded-lg ${
              placementType === 'daily_brief'
                ? 'bg-white text-black'
                : 'bg-neutral-900 text-neutral-400 border border-neutral-700 hover:border-neutral-500'
            }`}
          >
            Daily Brief
          </button>
          <button
            onClick={() => {
              setPlacementType('sunday_edition');
              setSelectedDate(undefined);
            }}
            className={`flex-1 py-3 text-sm tracking-wide uppercase transition-colors rounded-lg ${
              placementType === 'sunday_edition'
                ? 'bg-white text-black'
                : 'bg-neutral-900 text-neutral-400 border border-neutral-700 hover:border-neutral-500'
            }`}
          >
            Sunday Edition
          </button>
        </div>
        <p className="text-sm text-neutral-600 mt-1">
          {placementType === 'sunday_edition'
            ? 'Only Sundays are available for Sunday Edition bookings.'
            : 'Available Monday through Saturday.'}
        </p>
      </div>

      {/* Calendar */}
      {selectedNeighborhoods.length > 0 && (
        <div>
          <label className="block text-xs tracking-[0.2em] uppercase text-neutral-500 mb-2">
            Select Date
          </label>
          {loadingAvailability ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 text-center">
              <p className="text-neutral-500 text-base">Loading availability...</p>
            </div>
          ) : (
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex justify-center calendar-dark">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                month={displayMonth}
                onMonthChange={setDisplayMonth}
                disabled={isDateDisabled}
                modifiers={{
                  booked: [...mergedBookedDates].map((d) => new Date(d + 'T00:00:00')),
                }}
                modifiersClassNames={{
                  booked: 'rdp-day-booked',
                }}
                style={{ color: '#fff' }}
              />
            </div>
          )}

          {/* Legend */}
          <div className="flex gap-4 mt-3 text-xs text-neutral-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-neutral-700 rounded-sm" />
              <span>Unavailable</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-red-900/50 rounded-sm" />
              <span>Sold</span>
            </div>
          </div>
        </div>
      )}

      {/* Price Breakdown + Booking Form */}
      {selectedNeighborhoods.length > 0 && selectedDate && totalPriceCents > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
          {/* Multi-neighborhood price breakdown */}
          {selectedNeighborhoods.length > 1 && (
            <div className="mb-4 space-y-2">
              {selectedNeighborhoods.map((n) => {
                const avail = availabilities[n.id];
                const price = avail?.price
                  ? placementType === 'sunday_edition'
                    ? avail.price.sundayEdition
                    : avail.price.dailyBrief
                  : 0;
                return (
                  <div key={n.id} className="flex justify-between text-sm text-neutral-400">
                    <span>
                      {n.name}, {n.city}
                    </span>
                    <span>${(price / 100).toFixed(0)}</span>
                  </div>
                );
              })}
              <div className="border-t border-neutral-700 pt-2 flex justify-between">
                <span className="text-base font-medium">Total</span>
                <span className="text-base font-medium">
                  ${(totalPriceCents / 100).toFixed(0)}
                </span>
              </div>
            </div>
          )}

          {/* Single neighborhood price display */}
          {selectedNeighborhoods.length === 1 && (
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <span className="text-3xl font-light">
                  ${(totalPriceCents / 100).toFixed(0)}
                </span>
                <span className="text-neutral-500 text-sm ml-1">
                  {placementType === 'sunday_edition' ? '/ Sunday' : '/ day'}
                </span>
              </div>
              <span className="text-xs tracking-[0.2em] uppercase text-neutral-500">
                {availabilities[selectedNeighborhoods[0].id]?.price
                  ? `Tier ${availabilities[selectedNeighborhoods[0].id].price.tier}`
                  : ''}
              </span>
            </div>
          )}

          <div className="text-sm text-neutral-400 mb-6">
            <p>
              {selectedNeighborhoods.map((n) => n.name).join(', ')} &mdash;{' '}
              {placementType === 'sunday_edition' ? 'Sunday Edition' : 'Daily Brief'} &mdash;{' '}
              {selectedDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </p>
          </div>

          <BookingForm
            neighborhoodIds={selectedNeighborhoods.map((n) => n.id)}
            placementType={placementType}
            date={selectedDate.toISOString().split('T')[0]}
            totalPriceCents={totalPriceCents}
          />
        </div>
      )}

      {/* Calendar dark theme styles */}
      <style jsx global>{`
        .calendar-dark .rdp-root {
          --rdp-accent-color: #fff;
          --rdp-accent-background-color: #333;
          --rdp-day-height: 40px;
          --rdp-day-width: 40px;
        }
        .calendar-dark .rdp-day {
          color: #fff;
        }
        .calendar-dark .rdp-disabled .rdp-day_button {
          color: #444;
        }
        .calendar-dark .rdp-day-booked .rdp-day_button {
          color: #7f1d1d;
          text-decoration: line-through;
        }
        .calendar-dark .rdp-chevron {
          fill: #999;
        }
        .calendar-dark .rdp-month_caption {
          color: #999;
        }
        .calendar-dark .rdp-weekday {
          color: #666;
        }
        .calendar-dark .rdp-selected .rdp-day_button {
          background: #fff;
          color: #000;
        }
        .calendar-dark .rdp-today:not(.rdp-selected) .rdp-day_button {
          border: 1px solid #555;
        }
      `}</style>
    </div>
  );
}
