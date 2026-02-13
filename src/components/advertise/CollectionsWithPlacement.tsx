'use client';

import { useState, useEffect } from 'react';
import { AD_COLLECTIONS, type AdCollection } from '@/config/ad-config';

type PlacementFilter = 'none' | 'daily_brief' | 'sunday_edition';

export function CollectionsWithPlacement() {
  const [activePlacement, setActivePlacement] = useState<PlacementFilter>('none');

  // Listen for placement-select events from AdvertiserPersonas
  useEffect(() => {
    const handler = (e: Event) => {
      const placement = (e as CustomEvent).detail as PlacementFilter;
      setActivePlacement(placement);
    };
    window.addEventListener('placement-select', handler);
    return () => window.removeEventListener('placement-select', handler);
  }, []);

  return (
    <div id="collections">
      {/* Collections Header */}
      <h2 className="text-xs tracking-[0.3em] uppercase text-fg-subtle mb-10 text-center">
        Collections
      </h2>

      {/* Placement Toggle — between header and cards */}
      <div className="max-w-md mx-auto mb-10">
        <label className="block text-xs tracking-[0.2em] uppercase text-fg-subtle mb-2">
          Placement
        </label>
        <div className="flex gap-2">
          <button
            onClick={() =>
              setActivePlacement((prev) =>
                prev === 'daily_brief' ? 'none' : 'daily_brief'
              )
            }
            className={`flex-1 py-3 text-sm tracking-wide uppercase transition-colors rounded-lg ${
              activePlacement === 'daily_brief'
                ? 'bg-white text-black'
                : 'bg-surface text-fg-muted border border-border hover:border-neutral-500'
            }`}
          >
            Daily Brief
          </button>
          <button
            onClick={() =>
              setActivePlacement((prev) =>
                prev === 'sunday_edition' ? 'none' : 'sunday_edition'
              )
            }
            className={`flex-1 py-3 text-sm tracking-wide uppercase transition-colors rounded-lg ${
              activePlacement === 'sunday_edition'
                ? 'bg-white text-black'
                : 'bg-surface text-fg-muted border border-border hover:border-neutral-500'
            }`}
          >
            Sunday Edition
          </button>
        </div>
        <p className="text-sm text-fg-subtle mt-1">
          {activePlacement === 'sunday_edition'
            ? 'Only Sundays are available for Sunday Edition bookings.'
            : activePlacement === 'daily_brief'
              ? 'Available Monday through Saturday.'
              : 'Select a placement to highlight pricing.'}
        </p>
      </div>

      {/* Collection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {AD_COLLECTIONS.map((collection) => (
          <CollectionCard
            key={collection.key}
            collection={collection}
            activePlacement={activePlacement}
          />
        ))}
      </div>
    </div>
  );
}

function scrollToBookAndFocus() {
  const bookSection = document.getElementById('book');
  if (bookSection) {
    bookSection.scrollIntoView({ behavior: 'smooth' });
    // Focus the search input after scroll completes
    setTimeout(() => {
      const input = document.getElementById('neighborhood-search');
      if (input) input.focus();
    }, 600);
  }
}

function CollectionCard({
  collection,
  activePlacement,
}: {
  collection: AdCollection;
  activePlacement: PlacementFilter;
}) {
  const isDailyHighlighted = activePlacement === 'daily_brief';
  const isSundayHighlighted = activePlacement === 'sunday_edition';

  return (
    <div
      className={`bg-surface border p-8 flex flex-col ${
        collection.key === 'tier1'
          ? 'border-amber-800/40'
          : 'border-border'
      }`}
    >
      {/* Top section */}
      <div className="md:min-h-[180px]">
        {collection.key === 'tier1' ? (
          <span className="text-xs tracking-[0.2em] uppercase text-amber-600 mb-3 block">
            Flagship
          </span>
        ) : (
          <span className="text-xs mb-3 block invisible" aria-hidden="true">
            &nbsp;
          </span>
        )}
        <h3 className="font-[family-name:var(--font-cormorant)] text-2xl font-light mb-2">
          {collection.name}
        </h3>
        <p className="text-base text-fg-muted mb-6 leading-relaxed">
          {collection.tagline}
        </p>
      </div>

      {/* Pricing */}
      <div className="mb-6 space-y-1">
        <div className="transition-colors duration-200">
          <span
            className={`text-3xl font-light transition-colors duration-200 ${
              isDailyHighlighted ? 'text-white' : isSundayHighlighted ? 'text-neutral-600' : ''
            }`}
          >
            ${collection.dailyPrice}
          </span>
          <span
            className={`text-sm transition-colors duration-200 ${
              isDailyHighlighted ? 'text-fg-muted' : 'text-fg-subtle'
            }`}
          >
            /day per individual neighborhood
          </span>
        </div>
        <div className="transition-colors duration-200">
          <span
            className={`text-xl font-light transition-colors duration-200 ${
              isSundayHighlighted ? 'text-white' : isDailyHighlighted ? 'text-neutral-600' : 'text-fg-muted'
            }`}
          >
            ${collection.sundayPrice}
          </span>
          <span
            className={`text-sm transition-colors duration-200 ${
              isSundayHighlighted ? 'text-fg-muted' : 'text-fg-subtle'
            }`}
          >
            /Sunday per individual neighborhood
          </span>
        </div>
      </div>

      <p className="text-sm text-fg-subtle mb-6 leading-relaxed flex-1">
        {collection.description}
      </p>
      <div className="mb-6">
        <button
          onClick={scrollToBookAndFocus}
          className="text-left w-full group cursor-pointer"
        >
          <p className="text-xs tracking-[0.2em] uppercase text-neutral-600 mb-2 group-hover:text-fg-muted transition-colors">
            Example Neighborhoods
          </p>
          <p className="text-sm text-fg-muted group-hover:text-fg transition-colors">
            {collection.exampleNeighborhoods.join(' / ')}
          </p>
        </button>
      </div>
      <button
        onClick={scrollToBookAndFocus}
        className="block w-full text-center bg-white text-black py-3 text-sm tracking-widest uppercase rounded-lg hover:opacity-80 transition-colors cursor-pointer"
      >
        Book Now
      </button>
    </div>
  );
}
