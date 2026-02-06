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

  const cities = getAllCityNames();

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

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
      setIsLoading(false);
    }

    loadData();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

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
      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
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
        <p className="text-neutral-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-neutral-500 hover:text-black">
          &larr; Back to Home
        </Link>
      </div>

      <h1 className="text-3xl font-light mb-8">Settings</h1>

      {/* Primary Location Section */}
      <section className="mb-12">
        <h2 className="text-lg font-medium mb-4">Primary Location</h2>
        <p className="text-sm text-neutral-600 mb-6">
          Set your primary city to receive local updates and newsletters timed to your timezone.
        </p>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="city"
              className="block text-xs tracking-widest uppercase text-neutral-400 mb-2"
            >
              City
            </label>
            <div className="flex gap-2">
              <select
                id="city"
                value={primaryCity}
                onChange={(e) => setPrimaryCity(e.target.value)}
                className="flex-1 px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none bg-white"
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
                className="px-4 py-3 border border-neutral-200 hover:border-black transition-colors disabled:opacity-50"
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
            <p className="text-sm text-neutral-500">
              Timezone: {getTimezoneForCity(primaryCity) || 'Unknown'}
            </p>
          )}

          {saveMessage && (
            <p className={`text-sm ${saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {saveMessage.text}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-3 bg-black text-white text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
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
                className="px-6 py-3 border border-neutral-200 text-sm tracking-widest uppercase hover:border-black transition-colors disabled:opacity-50"
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
          <h2 className="text-lg font-medium mb-4">Account</h2>
          <div className="space-y-2 text-sm">
            <p className="text-neutral-600">
              <span className="text-neutral-400">Email:</span> {profile.email}
            </p>
            {profile.full_name && (
              <p className="text-neutral-600">
                <span className="text-neutral-400">Name:</span> {profile.full_name}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Not logged in notice */}
      {isLoggedIn === false && (
        <section className="p-4 bg-neutral-50 border border-neutral-200">
          <p className="text-sm text-neutral-600">
            <Link href="/login" className="text-black hover:underline">Sign in</Link>
            {' '}to sync your settings across devices.
          </p>
        </section>
      )}
    </div>
  );
}
