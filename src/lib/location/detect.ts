/**
 * Location Detection Utilities
 *
 * Detects user location using IP geolocation (server-side)
 * with browser timezone as fallback.
 */

import { findSupportedCity, getCitiesForTimezone, CityTimezoneInfo } from './city-mapping';

export interface DetectedLocation {
  /** Raw city name from detection */
  city: string | null;
  /** Country from detection */
  country: string | null;
  /** IANA timezone (e.g., 'Europe/London') */
  timezone: string;
  /** Our supported city if matched */
  matchedCity: CityTimezoneInfo | null;
  /** Detection confidence */
  confidence: 'high' | 'medium' | 'low';
  /** Detection method used */
  method: 'ip' | 'timezone' | 'fallback';
}

/**
 * Detect location from IP address (call this from server-side API)
 * Uses ipinfo.io free tier (50k requests/month)
 */
export async function detectLocationFromIP(ipAddress?: string): Promise<DetectedLocation> {
  try {
    // ipinfo.io will use the requester's IP if none specified
    const url = ipAddress
      ? `https://ipinfo.io/${ipAddress}/json`
      : 'https://ipinfo.io/json';

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      // Cache for 1 hour
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`ipinfo.io returned ${response.status}`);
    }

    const data = await response.json();
    const city = data.city || null;
    const country = data.country || null;
    const timezone = data.timezone || 'UTC';

    // Try to match to a supported city
    let matchedCity: CityTimezoneInfo | null = null;
    let confidence: DetectedLocation['confidence'] = 'low';

    if (city) {
      matchedCity = findSupportedCity(city);
      if (matchedCity) {
        confidence = 'high';
      }
    }

    // If no exact city match, try timezone-based matching
    if (!matchedCity && timezone) {
      const citiesInTimezone = getCitiesForTimezone(timezone);
      if (citiesInTimezone.length === 1) {
        // Only one city in this timezone - confident match
        matchedCity = findSupportedCity(citiesInTimezone[0]);
        confidence = 'medium';
      } else if (citiesInTimezone.length > 1) {
        // Multiple cities - pick the first (usually the major one)
        matchedCity = findSupportedCity(citiesInTimezone[0]);
        confidence = 'low';
      }
    }

    return {
      city,
      country,
      timezone,
      matchedCity,
      confidence,
      method: 'ip',
    };
  } catch (error) {
    console.error('IP geolocation failed:', error);
    // Return a fallback result
    return {
      city: null,
      country: null,
      timezone: 'UTC',
      matchedCity: null,
      confidence: 'low',
      method: 'fallback',
    };
  }
}

/**
 * Detect location from browser timezone (client-side fallback)
 * Call this when IP detection fails or on client
 */
export function detectLocationFromTimezone(browserTimezone?: string): DetectedLocation {
  const timezone = browserTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const citiesInTimezone = getCitiesForTimezone(timezone);
  let matchedCity: CityTimezoneInfo | null = null;
  let confidence: DetectedLocation['confidence'] = 'low';

  if (citiesInTimezone.length === 1) {
    matchedCity = findSupportedCity(citiesInTimezone[0]);
    confidence = 'medium';
  } else if (citiesInTimezone.length > 1) {
    // Multiple cities share this timezone - suggest the first (major) one
    matchedCity = findSupportedCity(citiesInTimezone[0]);
    confidence = 'low';
  }

  return {
    city: matchedCity?.city || null,
    country: matchedCity?.country || null,
    timezone,
    matchedCity,
    confidence,
    method: 'timezone',
  };
}

/**
 * Get the user's browser timezone
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}
