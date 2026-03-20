'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';
import { syncNeighborhoodCookie } from '@/lib/neighborhood-cookie';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

interface SavedNeighborhood {
  id: string;
  name: string;
  city: string;
}

export function WishlistDropdown({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [neighborhoods, setNeighborhoods] = useState<SavedNeighborhood[]>([]);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Load saved neighborhoods
  useEffect(() => {
    if (!open) return;

    (async () => {
      try {
        const stored = localStorage.getItem(PREFS_KEY);
        if (!stored) return;
        const ids = JSON.parse(stored);
        if (!Array.isArray(ids) || ids.length === 0) return;

        // Use public API (no auth required) to fetch neighborhood names
        const res = await fetch(`/api/lists/details?ids=${ids.join(',')}`);
        if (res.ok) {
          const { items } = await res.json();
          if (items) {
            const sorted = ids
              .map((id: string) => items.find((n: SavedNeighborhood) => n.id === id))
              .filter(Boolean) as SavedNeighborhood[];
            setNeighborhoods(sorted);
          }
        }
      } catch { /* ignore */ }
    })();
  }, [open]);

  // Count from localStorage (instant, no fetch)
  const [count, setCount] = useState(0);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) setCount(ids.length);
      }
    } catch { /* ignore */ }
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen(!open);
  };

  const handleRemove = (id: string) => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      let ids: string[] = stored ? JSON.parse(stored) : [];
      ids = ids.filter(i => i !== id);
      localStorage.setItem(PREFS_KEY, JSON.stringify(ids));
      syncNeighborhoodCookie();
      setNeighborhoods(prev => prev.filter(n => n.id !== id));
      setCount(ids.length);

      // Fire-and-forget DB sync
      fetch('/api/neighborhoods/save-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neighborhoodIds: ids }),
      }).catch(() => {});
    } catch { /* ignore */ }
  };

  return (
    <div className={cn('relative', className)}>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-fg-muted hover:text-fg transition-colors relative"
        aria-label="Saved neighborhoods"
      >
        <svg className="w-5 h-5" fill={count > 0 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center bg-accent text-canvas text-[9px] font-bold rounded-full px-1">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="fixed z-[9999] w-72 bg-surface border border-border rounded-sm shadow-xl"
          style={{ top: dropdownPos.top, right: dropdownPos.right }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs tracking-[0.15em] uppercase text-fg-muted">
              My neighborhoods
            </p>
          </div>

          {/* Neighborhood list */}
          <div className="max-h-[50vh] overflow-y-auto">
            {neighborhoods.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-fg-muted mb-3">No neighborhoods saved yet</p>
                <Link
                  href="/destinations"
                  onClick={() => setOpen(false)}
                  className="text-xs text-accent hover:underline"
                >
                  Browse destinations
                </Link>
              </div>
            ) : (
              neighborhoods.map(n => (
                <div
                  key={n.id}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-hover transition-colors group"
                >
                  <Link
                    href={`/${getCitySlugFromId(n.id)}/${getNeighborhoodSlugFromId(n.id)}`}
                    onClick={() => setOpen(false)}
                    className="flex-1 min-w-0"
                  >
                    <p className="text-sm text-fg truncate">{n.name}</p>
                    <p className="text-[10px] text-fg-subtle">{n.city}</p>
                  </Link>
                  <button
                    onClick={() => handleRemove(n.id)}
                    className="ml-2 text-fg-subtle hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                    title="Remove"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border">
            <Link
              href="/destinations"
              onClick={() => setOpen(false)}
              className="text-xs text-fg-muted hover:text-accent transition-colors"
            >
              Browse destinations
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
