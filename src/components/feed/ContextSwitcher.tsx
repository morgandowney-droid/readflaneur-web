'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNeighborhoodPreferences } from '@/hooks/useNeighborhoodPreferences';
import { useNeighborhoodModal } from '@/components/neighborhoods/NeighborhoodSelectorModal';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

interface ContextSwitcherProps {
  currentContext: 'all' | string; // 'all' or neighborhood ID
  currentLabel: string;           // "ALL" or "TRIBECA"
}

export function ContextSwitcher({ currentContext, currentLabel }: ContextSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { neighborhoods, primaryId, isLoading, setPrimary } = useNeighborhoodPreferences();
  const { openModal } = useNeighborhoodModal();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleSelectAll = () => {
    setOpen(false);
    if (neighborhoods.length > 0) {
      const ids = neighborhoods.map(n => n.id).join(',');
      router.push(`/feed?neighborhoods=${ids}`);
    } else {
      router.push('/');
    }
  };

  const handleSelectNeighborhood = (id: string) => {
    setOpen(false);
    const citySlug = getCitySlugFromId(id);
    const neighborhoodSlug = getNeighborhoodSlugFromId(id);
    router.push(`/${citySlug}/${neighborhoodSlug}`);
  };

  const handleSetPrimary = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPrimary(id);
    // Navigate with reordered IDs so MultiFeed reflects new primary
    const stored = localStorage.getItem('flaneur-neighborhood-preferences');
    if (stored) {
      try {
        const ids = JSON.parse(stored) as string[];
        router.push(`/feed?neighborhoods=${ids.join(',')}`);
      } catch { /* ignore */ }
    }
    setOpen(false);
  };

  const handleCustomize = () => {
    setOpen(false);
    openModal();
  };

  const showPrimary = neighborhoods.length > 1;

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-neutral-400 hover:text-white transition-colors min-w-0"
      >
        <span className="truncate max-w-[80px] md:max-w-[200px]">{currentLabel}</span>
        <svg
          width="8"
          height="5"
          viewBox="0 0 8 5"
          fill="none"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute top-full mt-2 left-0 bg-[#121212] border border-white/10 shadow-2xl rounded-md w-64 z-30">
          {/* Section 1: Global */}
          <div className="py-2 border-b border-white/10">
            <button
              onClick={handleSelectAll}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-white/5 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-neutral-500 shrink-0">
                <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <span className="text-xs uppercase tracking-wide text-neutral-300">All Neighborhoods</span>
              {currentContext === 'all' && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-auto text-amber-500 shrink-0">
                  <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>

          {/* Section 2: My List */}
          <div className="max-h-64 overflow-y-auto py-2">
            {isLoading ? (
              <div className="px-4 py-3 space-y-2">
                <div className="h-3 bg-neutral-800 rounded w-3/4 animate-pulse" />
                <div className="h-3 bg-neutral-800 rounded w-1/2 animate-pulse" />
                <div className="h-3 bg-neutral-800 rounded w-2/3 animate-pulse" />
              </div>
            ) : neighborhoods.length === 0 ? (
              <p className="px-4 py-3 text-xs text-neutral-500">No neighborhoods selected</p>
            ) : (
              neighborhoods.map((n, i) => {
                const isPrimary = i === 0 && showPrimary;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleSelectNeighborhood(n.id)}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-white/5 transition-colors group"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isPrimary ? 'bg-amber-500' : 'bg-neutral-600'}`} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-neutral-200 truncate">{n.name}</span>
                        {isPrimary && (
                          <span className="text-[9px] tracking-wider uppercase text-amber-500/70 font-medium shrink-0">Primary</span>
                        )}
                      </span>
                      <span className="text-[10px] text-neutral-500 block">{n.city}</span>
                    </span>
                    {!isPrimary && showPrimary && (
                      <button
                        onClick={(e) => handleSetPrimary(e, n.id)}
                        className="text-[9px] tracking-wider uppercase text-neutral-600 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Set as primary"
                      >
                        Set primary
                      </button>
                    )}
                    {currentContext === n.id && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-amber-500 shrink-0">
                        <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Section 3: Action */}
          <div className="border-t border-white/10 py-2">
            <button
              onClick={handleCustomize}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-white/5 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-neutral-500 shrink-0">
                <path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="5" cy="4" r="1.2" fill="currentColor" />
                <circle cx="9" cy="7" r="1.2" fill="currentColor" />
                <circle cx="6" cy="10" r="1.2" fill="currentColor" />
              </svg>
              <span className="text-xs text-neutral-400">Customize List...</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
