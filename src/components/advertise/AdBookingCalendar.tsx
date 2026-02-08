'use client';

import { useState, useEffect, useCallback } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { BookingForm } from './BookingForm';

interface NeighborhoodOption {
  id: string;
  name: string;
  city: string;
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

export function AdBookingCalendar() {
  // State
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodOption[]>([]);
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState<NeighborhoodOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<NeighborhoodOption[]>([]);
  const [placementType, setPlacementType] = useState<'daily_brief' | 'sunday_edition'>('daily_brief');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [availabilities, setAvailabilities] = useState<Record<string, AvailabilityData>>({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(new Date());

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
            is_combo: n.is_combo,
            combo_component_names: n.combo_component_names,
          })
        );
        setNeighborhoods(all);
      })
      .catch(() => {});
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

  // Search handler — matches name, city, AND combo component names
  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);

      if (value.length < 2) {
        setFiltered([]);
        setShowDropdown(false);
        return;
      }

      const lower = value.toLowerCase();
      const selectedIds = new Set(selectedNeighborhoods.map((n) => n.id));

      const matches = neighborhoods
        .filter((n) => !selectedIds.has(n.id))
        .filter((n) => {
          if (n.name.toLowerCase().includes(lower)) return true;
          if (n.city.toLowerCase().includes(lower)) return true;
          if (n.combo_component_names?.some((c) => c.toLowerCase().includes(lower))) return true;
          return false;
        })
        .slice(0, 8);

      setFiltered(matches);
      setShowDropdown(matches.length > 0);
    },
    [neighborhoods, selectedNeighborhoods]
  );

  const handleSelect = useCallback((n: NeighborhoodOption) => {
    setSelectedNeighborhoods((prev) => [...prev, n]);
    setQuery('');
    setFiltered([]);
    setShowDropdown(false);
    setSelectedDate(undefined);
  }, []);

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

  // For search results: show which component matched
  const getComponentMatch = (n: NeighborhoodOption): string | null => {
    if (!query || query.length < 2) return null;
    const lower = query.toLowerCase();
    if (n.name.toLowerCase().includes(lower) || n.city.toLowerCase().includes(lower)) return null;
    const match = n.combo_component_names?.find((c) => c.toLowerCase().includes(lower));
    return match || null;
  };

  return (
    <div className="space-y-8">
      {/* Neighborhood Search */}
      <div className="relative">
        <label className="block text-xs tracking-[0.2em] uppercase text-neutral-500 mb-2">
          Neighborhoods
        </label>

        {/* Selected neighborhood pills */}
        {selectedNeighborhoods.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {selectedNeighborhoods.map((n) => (
              <span
                key={n.id}
                className="inline-flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white"
              >
                {n.name}
                <button
                  onClick={() => handleRemove(n.id)}
                  className="text-neutral-500 hover:text-white transition-colors ml-1"
                  aria-label={`Remove ${n.name}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => filtered.length > 0 && setShowDropdown(true)}
          placeholder={
            selectedNeighborhoods.length > 0
              ? 'Add another neighborhood...'
              : 'Search neighborhoods... e.g. Tribeca, Mayfair'
          }
          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 text-base text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
        {showDropdown && (
          <div className="absolute z-20 w-full mt-1 bg-neutral-900 border border-neutral-700 rounded-lg max-h-64 overflow-y-auto">
            {filtered.map((n) => {
              const componentMatch = getComponentMatch(n);
              return (
                <button
                  key={n.id}
                  onClick={() => handleSelect(n)}
                  className="w-full text-left px-4 py-3 text-base hover:bg-neutral-800 transition-colors border-b border-neutral-800 last:border-b-0"
                >
                  <span className="text-white">{n.name}</span>
                  {componentMatch && (
                    <span className="text-amber-600 text-sm ml-1">
                      (incl. {componentMatch})
                    </span>
                  )}
                  <span className="text-neutral-500 ml-2">{n.city}</span>
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
