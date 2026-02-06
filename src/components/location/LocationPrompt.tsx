'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getStoredLocation,
  saveStoredLocation,
  dismissLocationPrompt,
  wasPromptDismissedRecently,
} from '@/lib/location';

interface DetectedLocationResponse {
  success: boolean;
  location?: {
    detectedCity: string | null;
    detectedCountry: string | null;
    timezone: string;
    matchedCity: string | null;
    matchedCountry: string | null;
    matchedTimezone: string;
    confidence: 'high' | 'medium' | 'low';
    method: 'ip' | 'timezone' | 'fallback';
  };
}

/**
 * LocationPrompt - Toast-style prompt asking users to set their primary location
 *
 * Shows when:
 * - User has no primary location set
 * - User hasn't dismissed the prompt in the last 30 days
 * - We can detect their location with reasonable confidence
 */
export function LocationPrompt() {
  const [isVisible, setIsVisible] = useState(false);
  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [detectedTimezone, setDetectedTimezone] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  const checkAndDetectLocation = useCallback(async () => {
    // Don't run on server
    if (typeof window === 'undefined') return;

    // Check if user already has a primary location stored
    const stored = getStoredLocation();
    if (stored?.city) {
      return; // Already has a location set
    }

    // Check if prompt was dismissed recently
    if (wasPromptDismissedRecently()) {
      return;
    }

    // Check if logged-in user has a primary location
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('primary_city, location_prompt_dismissed_at')
        .eq('id', user.id)
        .single();

      if (profile?.primary_city) {
        return; // Already has a location set
      }

      // Check if dismissed
      if (profile?.location_prompt_dismissed_at) {
        const dismissedAt = new Date(profile.location_prompt_dismissed_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (dismissedAt > thirtyDaysAgo) {
          return; // Dismissed recently
        }
      }
    }

    setHasCheckedAuth(true);

    // Detect location from IP
    try {
      const response = await fetch('/api/location/detect');
      const data: DetectedLocationResponse = await response.json();

      if (data.success && data.location?.matchedCity) {
        // Only show prompt if we matched to a supported city
        setDetectedCity(data.location.matchedCity);
        setDetectedTimezone(data.location.matchedTimezone);

        // Delay showing the prompt for better UX
        setTimeout(() => {
          setIsVisible(true);
        }, 2000);
      }
    } catch (error) {
      console.error('Location detection failed:', error);
    }
  }, []);

  useEffect(() => {
    checkAndDetectLocation();
  }, [checkAndDetectLocation]);

  const handleSetPrimary = async () => {
    if (!detectedCity) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/location/set-primary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: detectedCity }),
      });

      const data = await response.json();

      if (data.success) {
        // Save to localStorage for anonymous users (and as backup)
        saveStoredLocation(data.location.city, data.location.timezone);
        setIsVisible(false);
      }
    } catch (error) {
      console.error('Failed to set primary location:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDismiss = async () => {
    // Dismiss locally
    dismissLocationPrompt();
    setIsVisible(false);

    // Also dismiss on server for logged-in users
    try {
      await fetch('/api/location/set-primary', { method: 'PUT' });
    } catch {
      // Ignore errors for dismiss
    }
  };

  if (!isVisible || !detectedCity || !hasCheckedAuth) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slide-up">
      <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-neutral-100 rounded-full flex items-center justify-center">
            <svg
              className="w-4 h-4 text-neutral-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-neutral-900 text-sm">
              It looks like you're in {detectedCity}
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">
              Set as your primary location for local updates?
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSetPrimary}
                disabled={isSaving}
                className="px-3 py-1.5 bg-black text-white text-xs font-medium rounded hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : `Yes, set ${detectedCity}`}
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-neutral-600 text-xs font-medium hover:text-neutral-900 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-neutral-400 hover:text-neutral-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
