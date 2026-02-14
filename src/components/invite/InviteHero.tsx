'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

const REFERRAL_STORAGE_KEY = 'flaneur-referral-code';
const PREFS_KEY = 'flaneur-neighborhood-preferences';
const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';

export function InviteHero() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const refCode = searchParams.get('ref');

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [statusDetail, setStatusDetail] = useState('');
  const tracked = useRef(false);

  useEffect(() => {
    if (!refCode || tracked.current) return;
    tracked.current = true;

    // Store referral code for attribution during subscribe
    sessionStorage.setItem(REFERRAL_STORAGE_KEY, refCode);

    // Fire-and-forget click tracking
    fetch('/api/referral/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: refCode }),
    }).catch(() => {});
  }, [refCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setStatus('loading');
    setStatusDetail('');

    try {
      // Step 1: Auto-detect location and get nearest neighborhoods
      let neighborhoodIds: string[] = [];
      let welcomeCity = '';

      try {
        setStatusDetail('Finding neighborhoods near you...');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const detectRes = await fetch('/api/location/detect-and-match', {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (detectRes.ok) {
          const detectData = await detectRes.json();
          if (detectData.success && detectData.neighborhoods?.length) {
            neighborhoodIds = detectData.neighborhoods.map((n: { id: string }) => n.id);
            welcomeCity = detectData.city || detectData.neighborhoods[0].city;
            localStorage.setItem(PREFS_KEY, JSON.stringify(neighborhoodIds));
          }
        }
      } catch {
        // Location detection failed - subscribe without neighborhoods
        // They'll get auto-detected on /feed via SmartRedirect
      }

      // Step 2: Subscribe with detected neighborhoods
      setStatusDetail('Setting up your subscription...');
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, neighborhoodIds, timezone }),
      });

      const data = await res.json();

      if (data.success) {
        // Track referral conversion (fire-and-forget)
        const code = sessionStorage.getItem(REFERRAL_STORAGE_KEY);
        if (code) {
          fetch('/api/referral/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, email }),
          }).catch(() => {});
          sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
        }

        localStorage.setItem(SUBSCRIBED_KEY, 'true');
        setStatus('success');
        setMessage('You are in. Check your email to verify.');

        // Redirect to feed with welcome banner
        const feedUrl = welcomeCity
          ? `/feed?welcome=${encodeURIComponent(welcomeCity)}`
          : '/feed';
        setTimeout(() => router.push(feedUrl), 2000);
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong.');
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  };

  return (
    <section data-theme="dark" className="relative overflow-hidden bg-black text-white py-24 md:py-32 lg:py-40 px-6">
      {/* Gradient overlay for tonal depth */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at top, rgba(30,30,30,1), rgba(0,0,0,1) 70%)' }}
      />

      <div className="relative mx-auto max-w-3xl text-center">
        {/* Invite context */}
        <p className="hero-fade-in text-sm text-fg-subtle mb-6 font-light tracking-[0.3em] uppercase">
          {refCode ? 'A friend invited you to' : 'You are invited to join'}
        </p>

        {/* Logo */}
        <h1 className="hero-fade-in font-display text-6xl md:text-7xl lg:text-8xl font-light tracking-[0.3em] mb-6">
          FLANEUR
        </h1>

        {/* Tagline */}
        <p className="hero-fade-in-delay-1 text-base md:text-lg text-fg-muted mb-4 font-light max-w-lg mx-auto leading-relaxed">
          Daily local stories from the neighborhoods you care about, delivered every morning.
        </p>

        {/* Decorative rule */}
        <div className="hero-fade-in-delay-1 w-8 h-px bg-fg-subtle mx-auto mb-10" />

        {/* Email capture */}
        <div className="hero-fade-in-delay-2 max-w-md mx-auto">
          {status === 'success' ? (
            <div className="py-4">
              <p className="text-fg text-lg">{message}</p>
              <p className="text-fg-subtle text-sm mt-2">Redirecting to your feed...</p>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="flex gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="flex-1 bg-white/5 border border-white/15 text-white px-4 py-3 text-sm rounded-md focus:outline-none focus:border-amber-500 transition-colors placeholder:text-neutral-600"
                  disabled={status === 'loading'}
                />
                <button
                  type="submit"
                  disabled={status === 'loading' || !email}
                  className="bg-white text-neutral-900 px-6 py-3 text-sm font-medium rounded-md hover:bg-amber-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {status === 'loading' ? 'Joining...' : 'Join'}
                </button>
              </form>
              {status === 'error' && (
                <p className="text-red-400 text-xs mt-2">{message}</p>
              )}
              {status === 'loading' && statusDetail && (
                <p className="text-fg-subtle text-xs mt-3">{statusDetail}</p>
              )}
              {status === 'idle' && (
                <p className="text-neutral-600 text-xs mt-3">
                  We will find neighborhoods near you automatically.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
