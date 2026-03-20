'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { syncNeighborhoodCookie } from '@/lib/neighborhood-cookie';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
  country: string;
  region: string;
}

export default function OnboardPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detecting, setDetecting] = useState(true);
  const emailRef = useRef<HTMLInputElement>(null);

  // Skip if already onboarded
  useEffect(() => {
    try {
      const auth = localStorage.getItem('flaneur-auth');
      const subscribed = localStorage.getItem('flaneur-newsletter-subscribed');
      const prefs = localStorage.getItem(PREFS_KEY);
      if (auth || (subscribed === 'true' && prefs)) {
        router.replace('/feed');
        return;
      }
    } catch { /* ignore */ }
  }, [router]);

  // Fetch neighborhoods
  useEffect(() => {
    fetch('/api/neighborhoods')
      .then(r => r.json())
      .then(data => {
        if (data.neighborhoods) {
          setNeighborhoods(data.neighborhoods.filter((n: Neighborhood) => n.region !== 'test'));
        }
      })
      .catch(() => {});
  }, []);

  // Auto-detect location and pre-select nearest neighborhoods
  useEffect(() => {
    (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('/api/location/detect-and-match', { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.neighborhoods?.length) {
            setSelected(new Set(data.neighborhoods.map((n: { id: string }) => n.id)));
          }
        }
      } catch { /* timeout or error */ }
      setDetecting(false);
    })();
  }, []);

  const toggleNeighborhood = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContinueToEmail = () => {
    if (selected.size === 0) return;
    setStep(2);
    setTimeout(() => emailRef.current?.focus(), 100);
  };

  const handleSubmit = async () => {
    if (!email.includes('@') || selected.size === 0) return;
    setSubmitting(true);

    const ids = Array.from(selected);

    // Save neighborhoods to localStorage + cookie
    localStorage.setItem(PREFS_KEY, JSON.stringify(ids));
    syncNeighborhoodCookie();

    // Subscribe to newsletter (fire-and-forget validation)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, neighborhoodIds: ids, timezone: tz }),
      });
    } catch { /* continue anyway */ }

    // Mark as subscribed
    localStorage.setItem('flaneur-newsletter-subscribed', 'true');
    localStorage.setItem('flaneur-onboarded', 'true');
    localStorage.setItem('flaneur-onboard-email', email);

    // Sync neighborhoods to DB (fire-and-forget)
    fetch('/api/neighborhoods/sync-to-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ neighborhoodIds: ids }),
    }).catch(() => {});

    router.push('/feed?welcome=true');
  };

  // Group neighborhoods by city
  const grouped = neighborhoods
    .filter(n => {
      if (!search) return true;
      const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const name = n.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const city = n.city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const country = n.country.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return name.includes(q) || city.includes(q) || country.includes(q);
    })
    .reduce<Record<string, Neighborhood[]>>((acc, n) => {
      const key = `${n.city}, ${n.country}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(n);
      return acc;
    }, {});

  const sortedCities = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen bg-canvas flex flex-col" data-theme="dark">
      {/* Minimal header */}
      <header className="text-center pt-8 pb-4 relative">
        <h1 className="font-display text-2xl tracking-[0.3em] text-fg">FLANEUR</h1>
        <a href="/login" className="absolute right-4 top-8 text-xs text-fg-subtle hover:text-fg transition-colors">
          Already have an account? Sign in
        </a>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 pb-12">
        <div className="w-full max-w-lg">

          {step === 1 && (
            <>
              <div className="text-center mb-8">
                <h2 className="font-display text-3xl text-fg tracking-wide mb-3">
                  Pick your neighborhoods
                </h2>
                <p className="text-sm text-fg-muted">
                  Choose the places you want to follow. You'll get a daily brief for each one, delivered to your inbox every morning.
                </p>
              </div>

              {/* Selected pills */}
              {selected.size > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {Array.from(selected).map(id => {
                    const n = neighborhoods.find(nb => nb.id === id);
                    return n ? (
                      <button
                        key={id}
                        onClick={() => toggleNeighborhood(id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent/20 text-accent text-xs tracking-wider rounded-full border border-accent/30"
                      >
                        {n.name}
                        <span className="text-accent/60">&times;</span>
                      </button>
                    ) : null;
                  })}
                </div>
              )}

              {/* Search */}
              <input
                type="text"
                placeholder="Search cities and neighborhoods..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-fg text-sm placeholder:text-fg-subtle focus:outline-none focus:border-accent/50 mb-4"
                autoFocus
              />

              {/* Neighborhood list */}
              <div className="max-h-[50vh] overflow-y-auto space-y-4 mb-6">
                {detecting && neighborhoods.length === 0 ? (
                  <p className="text-center text-fg-subtle text-sm py-8">Loading neighborhoods...</p>
                ) : sortedCities.length === 0 ? (
                  <p className="text-center text-fg-subtle text-sm py-8">No neighborhoods match your search.</p>
                ) : (
                  sortedCities.map(city => (
                    <div key={city}>
                      <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle mb-2">{city}</p>
                      <div className="space-y-0.5">
                        {grouped[city].map(n => (
                          <button
                            key={n.id}
                            onClick={() => toggleNeighborhood(n.id)}
                            className={`w-full text-left px-3 py-2 rounded-sm text-sm transition-colors ${
                              selected.has(n.id)
                                ? 'bg-accent/15 text-accent'
                                : 'text-fg-muted hover:text-fg hover:bg-surface'
                            }`}
                          >
                            {n.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Continue button */}
              <button
                onClick={handleContinueToEmail}
                disabled={selected.size === 0}
                className="w-full py-3 bg-fg text-canvas text-sm tracking-[0.1em] uppercase rounded-lg font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-fg/90 transition-colors"
              >
                Continue{selected.size > 0 ? ` with ${selected.size} neighborhood${selected.size > 1 ? 's' : ''}` : ''}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="text-center mb-8">
                <h2 className="font-display text-3xl text-fg tracking-wide mb-3">
                  Get your morning brief
                </h2>
                <p className="text-sm text-fg-muted">
                  Enter your email to receive a daily brief at 7 AM with the latest from your neighborhoods. Free, always.
                </p>
              </div>

              <div className="space-y-4">
                <input
                  ref={emailRef}
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-fg text-sm placeholder:text-fg-subtle focus:outline-none focus:border-accent/50"
                />

                <button
                  onClick={handleSubmit}
                  disabled={!email.includes('@') || submitting}
                  className="w-full py-3 bg-fg text-canvas text-sm tracking-[0.1em] uppercase rounded-lg font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-fg/90 transition-colors"
                >
                  {submitting ? '...' : 'Start reading'}
                </button>

                <button
                  onClick={() => setStep(1)}
                  className="w-full text-center text-xs text-fg-subtle hover:text-fg-muted transition-colors"
                >
                  Back to neighborhood selection
                </button>
              </div>

              {/* Show selected neighborhoods */}
              <div className="mt-8 pt-6 border-t border-border">
                <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle mb-3">Your selections</p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(selected).map(id => {
                    const n = neighborhoods.find(nb => nb.id === id);
                    return n ? (
                      <span key={id} className="text-xs text-fg-muted">
                        {n.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
