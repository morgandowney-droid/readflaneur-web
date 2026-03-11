'use client';

import { useState } from 'react';

interface Props {
  regions: { key: string; label: string }[];
  activeRegion: string | null;
  onRegionChange: (region: string | null) => void;
  countries: string[];
  activeCountry: string | null;
  onCountryChange: (country: string | null) => void;
}

export function RegionFilter({
  regions,
  activeRegion,
  onRegionChange,
  countries,
  activeCountry,
  onCountryChange,
}: Props) {
  const [showCountries, setShowCountries] = useState(false);

  return (
    <div className="space-y-3">
      {/* Region pills */}
      <div className="flex flex-wrap gap-2">
        {regions.filter(r => r.key !== 'other').map(r => (
          <button
            key={r.key}
            onClick={() => {
              onRegionChange(activeRegion === r.key ? null : r.key);
              setShowCountries(false);
            }}
            className={`text-[11px] tracking-[0.1em] uppercase px-3 py-1.5 rounded-lg border transition-all duration-200 ${
              activeRegion === r.key
                ? 'bg-accent/10 border-accent text-accent'
                : 'border-border text-fg-muted hover:border-border-strong hover:text-fg'
            }`}
          >
            {r.label}
          </button>
        ))}
        <button
          onClick={() => setShowCountries(!showCountries)}
          className={`text-[11px] tracking-[0.1em] uppercase px-3 py-1.5 rounded-lg border transition-all duration-200 ${
            activeCountry
              ? 'bg-accent/10 border-accent text-accent'
              : showCountries
                ? 'border-border-strong text-fg'
                : 'border-border text-fg-muted hover:border-border-strong hover:text-fg'
          }`}
        >
          {activeCountry || 'Country'}
          <span className="ml-1 text-[9px]">{showCountries ? '\u25B2' : '\u25BC'}</span>
        </button>
      </div>

      {/* Country dropdown */}
      {showCountries && (
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {activeCountry && (
            <button
              onClick={() => { onCountryChange(null); setShowCountries(false); }}
              className="text-[10px] tracking-[0.05em] px-2.5 py-1 rounded-md bg-accent/10 text-accent border border-accent/30"
            >
              x {activeCountry}
            </button>
          )}
          {countries.filter(c => c !== activeCountry).map(c => (
            <button
              key={c}
              onClick={() => { onCountryChange(c); setShowCountries(false); }}
              className="text-[10px] tracking-[0.05em] px-2.5 py-1 rounded-md border border-border text-fg-muted hover:border-border-strong hover:text-fg transition-colors"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
