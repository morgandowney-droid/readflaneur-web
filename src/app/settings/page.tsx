'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  getAllCityNames,
  getStoredLocation,
  saveStoredLocation,
  clearStoredLocation,
  getTimezoneForCity,
} from '@/lib/location';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  primary_city: string | null;
  primary_timezone: string | null;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [primaryCity, setPrimaryCity] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [emailResendNote, setEmailResendNote] = useState<string | null>(null);

  const cities = getAllCityNames();

  useEffect(() => {
    // Safety timeout — if auth hangs, show the page anyway
    const timeout = setTimeout(() => {
      if (isLoading) {
        console.warn('Settings page: auth timed out after 5s');
        setIsLoggedIn(false);
        setIsLoading(false);
      }
    }, 5000);

    async function loadData() {
      try {
        const supabase = createClient();
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        const user = session?.user ?? null;

        if (authError) {
          console.warn('Auth error on settings page:', authError.message);
        }

        if (user) {
          setIsLoggedIn(true);
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, email, full_name, primary_city, primary_timezone')
            .eq('id', user.id)
            .single();

          if (profileData) {
            setProfile(profileData);
            setPrimaryCity(profileData.primary_city || '');
          }
        } else {
          setIsLoggedIn(false);
          // Load from localStorage for anonymous users
          const stored = getStoredLocation();
          if (stored?.city) {
            setPrimaryCity(stored.city);
          }
        }
      } catch (error) {
        console.error('Settings page load error:', error);
        setIsLoggedIn(false);
      } finally {
        clearTimeout(timeout);
        setIsLoading(false);
      }
    }

    loadData();

    return () => clearTimeout(timeout);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    setEmailResendNote(null);

    try {
      if (primaryCity) {
        const response = await fetch('/api/location/set-primary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city: primaryCity }),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to save');
        }

        // Also save to localStorage as backup
        saveStoredLocation(data.location.city, data.location.timezone);

        if (profile) {
          setProfile({
            ...profile,
            primary_city: data.location.city,
            primary_timezone: data.location.timezone,
          });
        }

        setSaveMessage({ type: 'success', text: 'Location saved successfully' });

        // Show email resend notification
        if (data.emailResend === 'sending') {
          setEmailResendNote('A fresh Daily Brief reflecting your changes is on its way.');
        } else if (data.emailResend === 'rate_limited') {
          setEmailResendNote('To save your inbox, your changes will be reflected in tomorrow morning\'s email.');
        }
      } else {
        // Clear location
        await fetch('/api/location/set-primary', { method: 'DELETE' });
        clearStoredLocation();

        if (profile) {
          setProfile({
            ...profile,
            primary_city: null,
            primary_timezone: null,
          });
        }

        setSaveMessage({ type: 'success', text: 'Location cleared' });
      }
    } catch (error) {
      console.error('Save error:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save location' });
    } finally {
      setIsSaving(false);
      // Clear messages after 8 seconds (longer to give time to read email note)
      setTimeout(() => {
        setSaveMessage(null);
        setEmailResendNote(null);
      }, 8000);
    }
  };

  const handleDetectLocation = async () => {
    setIsDetecting(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/location/detect');
      const data = await response.json();

      if (data.success && data.location?.matchedCity) {
        setPrimaryCity(data.location.matchedCity);
        setSaveMessage({
          type: 'success',
          text: `Detected: ${data.location.matchedCity}. Click Save to confirm.`,
        });
      } else {
        setSaveMessage({
          type: 'error',
          text: 'Could not detect a supported city. Please select manually.',
        });
      }
    } catch (error) {
      console.error('Detection error:', error);
      setSaveMessage({
        type: 'error',
        text: 'Detection failed. Please select manually.',
      });
    } finally {
      setIsDetecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-fg-subtle">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-fg-subtle hover:text-fg">
          &larr; Back to Home
        </Link>
      </div>

      <h1 className="text-3xl font-light text-fg mb-8">Settings</h1>

      {/* Primary Timezone Section */}
      <section className="mb-12">
        <h2 className="text-lg font-medium text-fg mb-4">Primary Timezone</h2>
        <p className="text-sm text-fg-muted mb-6">
          Set your primary city to receive local updates and newsletters timed to your timezone.
        </p>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="city"
              className="block text-xs tracking-widest uppercase text-fg-muted mb-2"
            >
              City
            </label>
            <div className="flex gap-2">
              <select
                id="city"
                value={primaryCity}
                onChange={(e) => setPrimaryCity(e.target.value)}
                className="flex-1 px-4 py-3 border border-border-strong focus:border-amber-500 focus:outline-none bg-surface text-fg"
              >
                <option value="">Select a city...</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={isDetecting}
                className="px-4 py-3 border border-border-strong hover:border-border-strong transition-colors disabled:opacity-50 text-white"
                title="Detect my location"
              >
                {isDetecting ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {primaryCity && (
            <p className="text-sm text-fg-subtle">
              Timezone: {getTimezoneForCity(primaryCity) || 'Unknown'}
            </p>
          )}

          {saveMessage && (
            <p className={`text-sm ${saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {saveMessage.text}
            </p>
          )}
          {emailResendNote && (
            <p className="text-sm text-fg-subtle italic">
              {emailResendNote}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-3 bg-fg text-canvas text-sm tracking-widest uppercase hover:opacity-80 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            {primaryCity && (
              <button
                onClick={() => {
                  setPrimaryCity('');
                  handleSave();
                }}
                disabled={isSaving}
                className="px-6 py-3 border border-border-strong text-sm tracking-widest uppercase text-fg-muted hover:border-border-strong transition-colors disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Account Section (only for logged in users) */}
      {isLoggedIn && profile && (
        <section className="mb-12">
          <h2 className="text-lg font-medium text-fg mb-4">Account</h2>
          <div className="space-y-2 text-sm">
            <p className="text-fg-muted">
              <span className="text-fg-subtle">Email:</span> {profile.email}
            </p>
            {profile.full_name && (
              <p className="text-fg-muted">
                <span className="text-fg-subtle">Name:</span> {profile.full_name}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Not logged in notice */}
      {isLoggedIn === false && (
        <section className="p-4 bg-surface border border-border">
          <p className="text-sm text-fg-muted">
            <Link href="/login" className="text-white hover:underline">Sign in</Link>
            {' '}to sync your settings across devices.
          </p>
        </section>
      )}
    </div>
  );
}
