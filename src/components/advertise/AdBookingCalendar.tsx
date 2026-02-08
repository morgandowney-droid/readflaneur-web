'use client';

import { useState, useEffect, useCallback } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { BookingForm } from './BookingForm';

interface NeighborhoodOption {
  id: string;
  name: string;
  city: string;
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
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<NeighborhoodOption | null>(null);
  const [placementType, setPlacementType] = useState<'daily_brief' | 'sunday_edition'>('daily_brief');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(new Date());

  // Load neighborhoods
  useEffect(() => {
    fetch('/api/neighborhoods')
      .then((res) => res.json())
      .then((data) => {
        const all: NeighborhoodOption[] = (data.neighborhoods || []).map(
          (n: { id: string; name: string; city: string }) => ({
            id: n.id,
            name: n.name,
            city: n.city,
          })
        );
        setNeighborhoods(all);
      })
      .catch(() => {});
  }, []);

  // Fetch availability when neighborhood, placement type, or month changes
  const fetchAvailability = useCallback(async () => {
    if (!selectedNeighborhood) return;

    setLoadingAvailability(true);
    const month = `${displayMonth.getFullYear()}-${String(displayMonth.getMonth() + 1).padStart(2, '0')}`;

    try {
      const res = await fetch(
        `/api/ads/availability?month=${month}&neighborhood_id=${selectedNeighborhood.id}&type=${placementType}`
      );
      if (res.ok) {
        const data = await res.json();
        setAvailability(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingAvailability(false);
    }
  }, [selectedNeighborhood, placementType, displayMonth]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  // Search handler
  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedNeighborhood(null);
      setAvailability(null);
      setSelectedDate(undefined);

      if (value.length < 2) {
        setFiltered([]);
        setShowDropdown(false);
        return;
      }

      const lower = value.toLowerCase();
      const matches = neighborhoods
        .filter(
          (n) =>
            n.name.toLowerCase().includes(lower) ||
            n.city.toLowerCase().includes(lower)
        )
        .slice(0, 8);

      setFiltered(matches);
      setShowDropdown(matches.length > 0);
    },
    [neighborhoods]
  );

  const handleSelect = useCallback((n: NeighborhoodOption) => {
    setSelectedNeighborhood(n);
    setQuery(`${n.name}, ${n.city}`);
    setShowDropdown(false);
    setSelectedDate(undefined);
  }, []);

  // Compute disabled dates for the calendar
  const disabledDates: Date[] = [];
  const bookedDateSet = new Set<string>();

  if (availability) {
    for (const d of availability.bookedDates) {
      bookedDateSet.add(d);
      disabledDates.push(new Date(d + 'T00:00:00'));
    }
    for (const d of availability.blockedDates) {
      disabledDates.push(new Date(d + 'T00:00:00'));
    }
  }

  // For Sunday Edition, disable non-Sundays
  const isSundayEdition = placementType === 'sunday_edition';

  const isDateDisabled = (date: Date): boolean => {
    const dateStr = date.toISOString().split('T')[0];

    // Sunday Edition: only Sundays
    if (isSundayEdition && date.getDay() !== 0) return true;

    // Booked or blocked
    if (availability) {
      if (availability.bookedDates.includes(dateStr)) return true;
      if (availability.blockedDates.includes(dateStr)) return true;
    }

    return false;
  };

  // Price display
  const currentPrice = availability?.price
    ? placementType === 'sunday_edition'
      ? availability.price.sundayEdition
      : availability.price.dailyBrief
    : null;

  const tierLabel = availability?.price
    ? `Tier ${availability.price.tier}`
    : '';

  return (
    <div className="space-y-8">
      {/* Neighborhood Search */}
      <div className="relative">
        <label className="block text-xs tracking-[0.2em] uppercase text-neutral-500 mb-2">
          Neighborhood
        </label>
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => filtered.length > 0 && setShowDropdown(true)}
          placeholder="Search neighborhoods... e.g. Tribeca, Mayfair"
          className="w-full bg-neutral-900 border border-neutral-700 px-4 py-3 text-sm text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
        {showDropdown && (
          <div className="absolute z-20 w-full mt-1 bg-neutral-900 border border-neutral-700 max-h-64 overflow-y-auto">
            {filtered.map((n) => (
              <button
                key={n.id}
                onClick={() => handleSelect(n)}
                className="w-full text-left px-4 py-3 text-sm hover:bg-neutral-800 transition-colors border-b border-neutral-800 last:border-b-0"
              >
                <span className="text-white">{n.name}</span>
                <span className="text-neutral-500 ml-2">{n.city}</span>
              </button>
            ))}
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
            onClick={() => { setPlacementType('daily_brief'); setSelectedDate(undefined); }}
            className={`flex-1 py-3 text-sm tracking-wide uppercase transition-colors ${
              placementType === 'daily_brief'
                ? 'bg-white text-black'
                : 'bg-neutral-900 text-neutral-400 border border-neutral-700 hover:border-neutral-500'
            }`}
          >
            Daily Brief
          </button>
          <button
            onClick={() => { setPlacementType('sunday_edition'); setSelectedDate(undefined); }}
            className={`flex-1 py-3 text-sm tracking-wide uppercase transition-colors ${
              placementType === 'sunday_edition'
                ? 'bg-white text-black'
                : 'bg-neutral-900 text-neutral-400 border border-neutral-700 hover:border-neutral-500'
            }`}
          >
            Sunday Edition
          </button>
        </div>
        <p className="text-xs text-neutral-600 mt-1">
          {placementType === 'sunday_edition'
            ? 'Only Sundays are available for Sunday Edition bookings.'
            : 'Available Monday through Saturday.'}
        </p>
      </div>

      {/* Calendar */}
      {selectedNeighborhood && (
        <div>
          <label className="block text-xs tracking-[0.2em] uppercase text-neutral-500 mb-2">
            Select Date
          </label>
          {loadingAvailability ? (
            <div className="bg-neutral-900 border border-neutral-800 p-8 text-center">
              <p className="text-neutral-500 text-sm">Loading availability...</p>
            </div>
          ) : (
            <div className="bg-neutral-900 border border-neutral-800 p-4 flex justify-center calendar-dark">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                month={displayMonth}
                onMonthChange={setDisplayMonth}
                disabled={isDateDisabled}
                modifiers={{
                  booked: availability?.bookedDates.map(d => new Date(d + 'T00:00:00')) || [],
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

      {/* Price + Booking Form */}
      {selectedNeighborhood && selectedDate && currentPrice && (
        <div className="bg-neutral-900 border border-neutral-800 p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <span className="text-3xl font-light">
                ${(currentPrice / 100).toFixed(0)}
              </span>
              <span className="text-neutral-500 text-sm ml-1">
                {placementType === 'sunday_edition' ? '/ Sunday' : '/ day'}
              </span>
            </div>
            <span className="text-xs tracking-[0.2em] uppercase text-neutral-500">
              {tierLabel}
            </span>
          </div>

          <div className="text-sm text-neutral-400 mb-6">
            <p>
              {selectedNeighborhood.name}, {selectedNeighborhood.city} &mdash;{' '}
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
            neighborhoodId={selectedNeighborhood.id}
            placementType={placementType}
            date={selectedDate.toISOString().split('T')[0]}
            priceCents={currentPrice}
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
