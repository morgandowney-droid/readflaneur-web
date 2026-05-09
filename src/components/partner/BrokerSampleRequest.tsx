'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { resolveSearchQuery } from '@/lib/search-aliases';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
  country: string;
  region?: string;
  is_combo?: boolean;
  is_community?: boolean;
}

type Status = 'idle' | 'sending' | 'success' | 'error';

export function BrokerSampleRequest() {
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [email, setEmail] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Neighborhood | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ name: string; city: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch active neighborhoods once on mount for the typeahead
  useEffect(() => {
    fetch('/api/neighborhoods?activeOnly=true')
      .then((r) => r.json())
      .then((data) => {
        // The /api/neighborhoods endpoint returns a hierarchical structure;
        // we just want a flat list. The endpoint also has a flat fallback.
        const flat: Neighborhood[] = Array.isArray(data?.neighborhoods)
          ? data.neighborhoods
          : Array.isArray(data?.flat)
          ? data.flat
          : Array.isArray(data)
          ? data
          : [];
        // De-dupe by id, drop combos (component-only flat view)
        const seen = new Set<string>();
        const list: Neighborhood[] = [];
        for (const n of flat) {
          if (!n?.id || seen.has(n.id)) continue;
          if (n.is_combo) continue;
          seen.add(n.id);
          list.push(n);
        }
        setNeighborhoods(list);
      })
      .catch(() => { /* ignore - empty list is acceptable */ });
  }, []);

  const matches = useMemo(() => {
    if (!showResults || !search || search.length < 2 || neighborhoods.length === 0) return [];
    return resolveSearchQuery(search, neighborhoods).slice(0, 6).map((r) => r.item);
  }, [search, neighborhoods, showResults]);

  const pick = (n: Neighborhood) => {
    setPicked(n);
    setSearch(`${n.name}, ${n.city}`);
    setShowResults(false);
  };

  const handleNearMe = async () => {
    setGeoLoading(true);
    setError(null);
    const tryWithCoords = (lat?: number, lng?: number) => {
      const url = lat != null && lng != null
        ? `/api/location/detect-and-match?lat=${lat}&lng=${lng}`
        : '/api/location/detect-and-match';
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          const first = data?.neighborhoods?.[0];
          if (first?.id) {
            const full = neighborhoods.find((n) => n.id === first.id) || {
              id: first.id, name: first.name, city: first.city, country: '',
            } as Neighborhood;
            pick(full);
          } else {
            setError('Could not find a neighborhood near you. Pick one from the search.');
          }
        })
        .catch(() => setError('Location lookup failed. Pick one from the search.'))
        .finally(() => setGeoLoading(false));
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => tryWithCoords(pos.coords.latitude, pos.coords.longitude),
        () => tryWithCoords(),
        { timeout: 5000, maximumAge: 300000 }
      );
    } else {
      tryWithCoords();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !/.+@.+\..+/.test(email.trim())) {
      setError('Enter a valid email');
      return;
    }
    if (!picked) {
      setError('Pick a neighborhood');
      return;
    }
    setStatus('sending');
    try {
      const res = await fetch('/api/partner/sample-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), neighborhoodId: picked.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setError(data?.error || 'Could not send sample. Try again.');
        return;
      }
      setStatus('success');
      setSuccessInfo({ name: data.neighborhoodName || picked.name, city: data.city || picked.city });
    } catch {
      setStatus('error');
      setError('Network error. Try again.');
    }
  };

  if (status === 'success' && successInfo) {
    return (
      <section className="border-b border-border pt-24 pb-10 md:pt-28 md:pb-14 px-6 bg-surface">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs tracking-[0.2em] uppercase text-accent mb-3">Sample sent</p>
          <h2 className="font-display text-2xl md:text-3xl font-light text-fg mb-3">
            Check your inbox in about a minute
          </h2>
          <p className="text-fg-muted mb-6 leading-relaxed">
            We just sent the {successInfo.name}, {successInfo.city} Daily to <span className="text-fg">{email}</span>. It is the actual product your clients would receive, with a placeholder name in the from-line so you can see how it would look with yours.
          </p>
          <Link
            href={`/partner/setup?email=${encodeURIComponent(email)}&neighborhood=${encodeURIComponent(picked!.id)}`}
            className="btn-primary text-sm tracking-widest uppercase px-8 py-3 inline-block"
          >
            Continue to setup
          </Link>
          <p className="text-xs text-fg-subtle mt-4">14-day free trial. No charge today.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-border pt-24 pb-10 md:pt-28 md:pb-14 px-6 bg-surface">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-xs tracking-[0.2em] uppercase text-accent mb-3">See it for yourself</p>
          <h2 className="font-display text-2xl md:text-3xl font-light text-fg mb-3">
            Get a real sample in your inbox
          </h2>
          <p className="text-fg-muted leading-relaxed">
            Pick a neighborhood and we will send you the actual branded daily brief your clients would receive. No setup needed.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-canvas border border-border rounded-lg text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/50"
            required
          />

          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search a neighborhood..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPicked(null);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              className="w-full px-4 py-3 bg-canvas border border-border rounded-lg text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/50"
            />
            {showResults && matches.length > 0 && (
              <ul className="absolute left-0 right-0 top-full mt-1 bg-canvas border border-border rounded-lg shadow-lg z-20 overflow-hidden max-h-72 overflow-y-auto">
                {matches.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => pick(n)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-elevated transition-colors"
                    >
                      <span className="text-fg">{n.name}</span>
                      <span className="text-fg-subtle text-xs ml-2">{n.city}, {n.country}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleNearMe}
              disabled={geoLoading}
              className="text-xs tracking-[0.1em] uppercase text-fg-muted hover:text-fg transition-colors disabled:opacity-50 sm:order-2 sm:ml-auto py-2"
            >
              {geoLoading ? 'Locating...' : 'Use a neighborhood near me'}
            </button>
            <button
              type="submit"
              disabled={status === 'sending' || !email || !picked}
              className="btn-primary text-sm tracking-widest uppercase px-8 py-3 disabled:opacity-30 sm:order-1"
            >
              {status === 'sending' ? 'Sending...' : 'Send me a sample'}
            </button>
          </div>

          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          <p className="text-xs text-fg-subtle text-center pt-1">
            One sample per email per 24h. We will also subscribe you to the consumer brief for that neighborhood so you can read it for a few mornings.
          </p>
        </form>
      </div>
    </section>
  );
}
