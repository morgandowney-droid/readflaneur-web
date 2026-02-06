/**
 * Timezone Resolution Utilities
 *
 * Determines the effective timezone for a user following priority:
 * 1. Primary location (user explicitly set)
 * 2. Browser timezone
 * 3. Selected neighborhood timezone
 * 4. Default (UTC)
 */

import { createClient } from '@/lib/supabase/client';
import { getTimezoneForCity } from './city-mapping';

export interface TimezoneResult {
  /** The resolved IANA timezone */
  timezone: string;
  /** Source of the timezone */
  source: 'primary' | 'browser' | 'neighborhood' | 'default';
  /** City name if from primary location */
  city?: string;
}

const STORAGE_KEY = 'flaneur-primary-location';

export interface StoredLocation {
  city: string;
  timezone: string;
  dismissedAt?: string;
}

/**
 * Get stored location from localStorage (for anonymous users)
 */
export function getStoredLocation(): StoredLocation | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Save location to localStorage (for anonymous users)
 */
export function saveStoredLocation(city: string, timezone: string): void {
  if (typeof window === 'undefined') return;

  const data: StoredLocation = { city, timezone };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Mark the location prompt as dismissed
 */
export function dismissLocationPrompt(): void {
  if (typeof window === 'undefined') return;

  const stored = getStoredLocation();
  const data: StoredLocation = stored || { city: '', timezone: '' };
  data.dismissedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Check if location prompt was dismissed recently (within 30 days)
 */
export function wasPromptDismissedRecently(): boolean {
  const stored = getStoredLocation();
  if (!stored?.dismissedAt) return false;

  const dismissedAt = new Date(stored.dismissedAt);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return dismissedAt > thirtyDaysAgo;
}

/**
 * Clear stored location
 */
export function clearStoredLocation(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get effective timezone for a user
 * Follows priority: primary > browser > neighborhood > default
 */
export async function getEffectiveTimezone(
  userId?: string,
  neighborhoodId?: string
): Promise<TimezoneResult> {
  // 1. Check user's primary location (if logged in)
  if (userId) {
    try {
      const supabase = createClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('primary_city, primary_timezone')
        .eq('id', userId)
        .single();

      if (profile?.primary_timezone) {
        return {
          timezone: profile.primary_timezone,
          source: 'primary',
          city: profile.primary_city || undefined,
        };
      }
    } catch (error) {
      console.error('Error fetching user timezone:', error);
    }
  }

  // 2. Check localStorage for anonymous users
  const stored = getStoredLocation();
  if (stored?.timezone && stored.city) {
    return {
      timezone: stored.timezone,
      source: 'primary',
      city: stored.city,
    };
  }

  // 3. Try browser timezone
  if (typeof window !== 'undefined') {
    try {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (browserTz && browserTz !== 'UTC') {
        return {
          timezone: browserTz,
          source: 'browser',
        };
      }
    } catch {
      // Browser doesn't support Intl
    }
  }

  // 4. Try neighborhood timezone
  if (neighborhoodId) {
    try {
      const supabase = createClient();
      const { data: neighborhood } = await supabase
        .from('neighborhoods')
        .select('timezone, city')
        .eq('id', neighborhoodId)
        .single();

      if (neighborhood?.timezone) {
        // Convert city to timezone if needed
        const tz = neighborhood.timezone || getTimezoneForCity(neighborhood.city);
        if (tz) {
          return {
            timezone: tz,
            source: 'neighborhood',
            city: neighborhood.city,
          };
        }
      }
    } catch (error) {
      console.error('Error fetching neighborhood timezone:', error);
    }
  }

  // 5. Default to UTC
  return {
    timezone: 'UTC',
    source: 'default',
  };
}

/**
 * Format a date for display in a specific timezone
 */
export function formatInTimezone(date: Date, timezone: string, options?: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      ...options,
    }).format(date);
  } catch {
    // Fallback to UTC if timezone is invalid
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      ...options,
    }).format(date);
  }
}
