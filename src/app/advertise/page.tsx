'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AD_COLLECTIONS, getCollectionByTier } from '@/config/ad-config';
import { getTierForNeighborhood } from '@/lib/PricingService';
import { SEASONAL_MARKETS } from '@/config/ad-tiers';

interface NeighborhoodOption {
  id: string;
  name: string;
  city: string;
}

export default function AdvertisePage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen -mt-[1px]">
      {/* Hero */}
      <section className="pt-20 pb-16 px-4 text-center">
        <p className="text-xs tracking-[0.3em] uppercase text-neutral-500 mb-6">
          Advertising
        </p>
        <h1 className="font-[family-name:var(--font-cormorant)] text-4xl md:text-5xl font-light leading-tight max-w-3xl mx-auto mb-6">
          Sponsor The World&apos;s Most Exclusive Local Feed
        </h1>
        <p className="text-neutral-400 max-w-xl mx-auto text-sm leading-relaxed">
          Your brand, native in the neighborhoods where wealth concentrates.
          Every placement is hand-reviewed and designed to feel like editorial.
        </p>
      </section>

      {/* Audience Profile Strip */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Avg. Net Worth', value: 'High' },
            { label: 'Email Open Rate', value: '>55%' },
            { label: 'Neighborhoods', value: '128' },
            { label: 'Cities', value: '38' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-neutral-900 border border-neutral-800 p-5 text-center"
            >
              <p className="text-2xl font-light mb-1">{stat.value}</p>
              <p className="text-[10px] tracking-[0.2em] uppercase text-neutral-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* The Three Collections */}
      <section className="px-4 pb-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-500 mb-10 text-center">
            Collections
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {AD_COLLECTIONS.map((collection) => (
              <div
                key={collection.key}
                className={`bg-neutral-900 border p-8 flex flex-col ${
                  collection.key === 'tier1'
                    ? 'border-amber-800/40'
                    : 'border-neutral-800'
                }`}
              >
                {collection.key === 'tier1' && (
                  <span className="text-[10px] tracking-[0.2em] uppercase text-amber-600 mb-3">
                    Flagship
                  </span>
                )}
                <h3 className="font-[family-name:var(--font-cormorant)] text-2xl font-light mb-2">
                  {collection.name}
                </h3>
                <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
                  {collection.tagline}
                </p>
                <div className="mb-6">
                  <span className="text-3xl font-light">${collection.price}</span>
                  <span className="text-neutral-500 text-sm">{collection.unit}</span>
                </div>
                <p className="text-xs text-neutral-500 mb-6 leading-relaxed flex-1">
                  {collection.description}
                </p>
                <div className="mb-6">
                  <p className="text-[10px] tracking-[0.2em] uppercase text-neutral-600 mb-2">
                    Example Neighborhoods
                  </p>
                  <p className="text-xs text-neutral-400">
                    {collection.exampleNeighborhoods.join(' / ')}
                  </p>
                </div>
                <a
                  href={collection.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center bg-white text-black py-3 text-sm tracking-widest uppercase hover:bg-neutral-200 transition-colors"
                >
                  Book Now
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Neighborhood Tier Lookup */}
      <section className="px-4 pb-20">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-500 mb-3 text-center">
            Tier Lookup
          </h2>
          <p className="text-neutral-400 text-sm text-center mb-8">
            Search any neighborhood to see its tier, pricing, and booking link.
          </p>
          <TierLookup />
        </div>
      </section>

      {/* How It Works */}
      <section className="px-4 pb-20">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-500 mb-10 text-center">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Book',
                desc: 'Choose your collection and dates. Pay securely through our booking platform.',
              },
              {
                step: '2',
                title: 'Submit Assets',
                desc: 'Provide your imagery and core message. Our editorial team refines the copy to ensure a seamless, native fit.',
              },
              {
                step: '3',
                title: 'You\'re Live',
                desc: 'Your brand appears in feeds and daily briefs across your target neighborhoods.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-10 h-10 border border-neutral-700 flex items-center justify-center text-sm text-neutral-400 mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-medium text-sm mb-2">{item.title}</h3>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 pb-20">
        <div className="max-w-2xl mx-auto text-center border border-neutral-800 bg-neutral-900 py-12 px-6">
          <h2 className="font-[family-name:var(--font-cormorant)] text-2xl font-light mb-4">
            Ready to reach the world&apos;s most discerning readers?
          </h2>
          <p className="text-sm text-neutral-400 mb-8">
            Questions? Email{' '}
            <a
              href="mailto:ads@readflaneur.com"
              className="text-white underline underline-offset-4 hover:text-neutral-300"
            >
              ads@readflaneur.com
            </a>
          </p>
          <a
            href={AD_COLLECTIONS[0].bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-white text-black px-8 py-3 text-sm tracking-widest uppercase hover:bg-neutral-200 transition-colors"
          >
            Book Your Collection
          </a>
        </div>
      </section>
    </div>
  );
}

// ─── Neighborhood Tier Lookup Widget ───

function TierLookup() {
  const [query, setQuery] = useState('');
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodOption[]>([]);
  const [filtered, setFiltered] = useState<NeighborhoodOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<NeighborhoodOption | null>(null);
  const [tierResult, setTierResult] = useState<{
    tier: 1 | 2 | 3;
    seasonalLabel?: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load neighborhoods on mount
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

  // Filter neighborhoods as user types
  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      setSelected(null);
      setTierResult(null);

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
            n.city.toLowerCase().includes(lower) ||
            `${n.name} ${n.city}`.toLowerCase().includes(lower)
        )
        .slice(0, 8);

      setFiltered(matches);
      setShowDropdown(matches.length > 0);
    },
    [neighborhoods]
  );

  // Select a neighborhood and compute tier
  const handleSelect = useCallback((n: NeighborhoodOption) => {
    setSelected(n);
    setQuery(`${n.name}, ${n.city}`);
    setShowDropdown(false);

    const result = getTierForNeighborhood(n.id, new Date());
    setTierResult(result);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Find seasonal market label for a neighborhood
  const getSeasonalInfo = (neighborhoodId: string): string | null => {
    for (const market of SEASONAL_MARKETS) {
      if (market.ids.includes(neighborhoodId)) {
        return market.label;
      }
    }
    return null;
  };

  const collection = tierResult ? getCollectionByTier(tierResult.tier) : null;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => filtered.length > 0 && setShowDropdown(true)}
        placeholder="Search neighborhoods... e.g. Tribeca, Mayfair, Dalkey"
        className="w-full bg-neutral-900 border border-neutral-700 px-4 py-3 text-sm text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
      />

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-10 w-full mt-1 bg-neutral-900 border border-neutral-700 max-h-64 overflow-y-auto">
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

      {/* Tier Result */}
      {selected && tierResult && collection && (
        <div className="mt-4 bg-neutral-900 border border-neutral-800 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-neutral-500 mb-1">
                {selected.name}, {selected.city}
              </p>
              <h3 className="font-[family-name:var(--font-cormorant)] text-xl font-light">
                {collection.name}
              </h3>
            </div>
            <span
              className={`text-xs tracking-[0.2em] uppercase px-3 py-1 ${
                tierResult.tier === 1
                  ? 'bg-amber-900/30 text-amber-500'
                  : tierResult.tier === 2
                    ? 'bg-neutral-800 text-neutral-300'
                    : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              Tier {tierResult.tier}
            </span>
          </div>

          {/* Seasonal label */}
          {(() => {
            const seasonalMarket = getSeasonalInfo(selected.id);
            if (seasonalMarket) {
              return (
                <p className="text-xs text-amber-500/80 mb-4">
                  {seasonalMarket} &mdash;{' '}
                  {tierResult.seasonalLabel ? 'Peak Season' : 'Off-Peak'}
                </p>
              );
            }
            return null;
          })()}

          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-2xl font-light">${collection.price}</span>
            <span className="text-neutral-500 text-sm">{collection.unit}</span>
          </div>

          <a
            href={collection.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-white text-black px-6 py-2 text-sm tracking-widest uppercase hover:bg-neutral-200 transition-colors"
          >
            Book This Neighborhood
          </a>
        </div>
      )}
    </div>
  );
}
