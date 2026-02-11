'use client';

import { useState, useEffect } from 'react';

interface NeighborhoodLiveStatusProps {
  timezone: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  neighborhoodName: string;
  city: string;
  initialWeather?: { tempC: number; weatherCode: number };
}

/** Countries that use 12-hour time and Fahrenheit */
const US_COUNTRIES = new Set(['USA', 'US', 'United States']);

/** WMO weather code to short description */
const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear',
  1: 'Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Drizzle',
  53: 'Drizzle',
  55: 'Drizzle',
  61: 'Rain',
  63: 'Rain',
  65: 'Heavy Rain',
  71: 'Snow',
  73: 'Snow',
  75: 'Heavy Snow',
  80: 'Showers',
  81: 'Showers',
  82: 'Storms',
  95: 'Thunderstorm',
};

function getLocalFormat(country?: string) {
  const isUS = country ? US_COUNTRIES.has(country) : false;
  return { use12Hour: isUS, useFahrenheit: isUS };
}

function formatTime(timezone: string, use12Hour: boolean): { hours: string; minutes: string; period?: string } {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: use12Hour,
      timeZone: timezone,
    }).formatToParts(now);

    const hourPart = parts.find(p => p.type === 'hour')?.value || '0';
    const minutePart = parts.find(p => p.type === 'minute')?.value || '00';
    const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value;

    return {
      hours: use12Hour ? hourPart : hourPart.padStart(2, '0'),
      minutes: minutePart,
      period: dayPeriod ? ` ${dayPeriod.toUpperCase()}` : undefined,
    };
  } catch {
    return { hours: '--', minutes: '--' };
  }
}

interface WeatherState {
  tempC: number;
  tempF: number;
  description: string;
}

// Module-level weather cache so pill switches don't re-fetch
const weatherCache = new Map<string, { data: WeatherState; fetchedAt: number }>();
const WEATHER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedWeather(key: string): WeatherState | null {
  const entry = weatherCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > WEATHER_CACHE_TTL) {
    weatherCache.delete(key);
    return null;
  }
  return entry.data;
}

export function NeighborhoodLiveStatus({
  timezone,
  country,
  latitude,
  longitude,
  neighborhoodName,
  city,
  initialWeather,
}: NeighborhoodLiveStatusProps) {
  const { use12Hour, useFahrenheit } = getLocalFormat(country);

  // Initialize time eagerly so it renders on first paint (no null flash)
  const [time, setTime] = useState(() => formatTime(timezone, use12Hour));

  const cacheKey = latitude && longitude ? `${latitude},${longitude}` : '';
  const [weather, setWeather] = useState<WeatherState | null>(() => {
    if (initialWeather) {
      const tempC = initialWeather.tempC;
      const w = {
        tempC,
        tempF: Math.round(tempC * 9 / 5 + 32),
        description: WEATHER_DESCRIPTIONS[initialWeather.weatherCode] || 'Variable',
      };
      if (cacheKey) weatherCache.set(cacheKey, { data: w, fetchedAt: Date.now() });
      return w;
    }
    // Check module-level cache (survives pill switches)
    if (cacheKey) return getCachedWeather(cacheKey);
    return null;
  });

  // Update time every 10 seconds
  useEffect(() => {
    setTime(formatTime(timezone, use12Hour));
    const interval = setInterval(() => {
      setTime(formatTime(timezone, use12Hour));
    }, 10_000);
    return () => clearInterval(interval);
  }, [timezone, use12Hour]);

  // Fetch weather once on mount (skip if already have weather from props or cache)
  useEffect(() => {
    if (weather) return; // Already have data from initialWeather or cache
    if (!latitude || !longitude) return;
    const controller = new AbortController();

    (async () => {
      try {
        const params = new URLSearchParams({
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          current: 'temperature_2m,weather_code',
          timezone,
        });
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?${params}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        const current = data.current;
        if (!current) return;

        const tempC = Math.round(current.temperature_2m || 0);
        const w: WeatherState = {
          tempC,
          tempF: Math.round(tempC * 9 / 5 + 32),
          description: WEATHER_DESCRIPTIONS[current.weather_code] || 'Variable',
        };
        // Cache for pill switches
        const key = `${latitude},${longitude}`;
        weatherCache.set(key, { data: w, fetchedAt: Date.now() });
        setWeather(w);
      } catch {
        // Silently fail - weather is non-critical
      }
    })();

    return () => controller.abort();
  }, [latitude, longitude, timezone, weather]);

  const temp = weather
    ? `${useFahrenheit ? weather.tempF : weather.tempC}${useFahrenheit ? '°F' : '°C'}`
    : null;

  const weatherSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${neighborhoodName} ${city} weather`)}`;

  return (
    <a
      href={weatherSearchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-1 font-mono text-xs font-medium tracking-[0.2em] text-amber-600/80 hover:text-amber-600 transition-colors cursor-pointer"
    >
      {/* Time with animated colon - suppressHydrationWarning since server/client times differ */}
      <span suppressHydrationWarning>{time.hours}</span>
      <span className="animate-pulse-slow">:</span>
      <span suppressHydrationWarning>{time.minutes}</span>
      {time.period && <span suppressHydrationWarning>{time.period}</span>}

      {/* Separator + Weather */}
      {weather && (
        <>
          <span className="mx-2 text-amber-600/40">|</span>
          <span>{temp} {weather.description}</span>
        </>
      )}
    </a>
  );
}
