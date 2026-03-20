'use client';

import { useState, useEffect, useCallback } from 'react';
import { syncNeighborhoodCookie } from '@/lib/neighborhood-cookie';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

interface Props {
  neighborhoodId: string;
  neighborhoodName: string;
}

/**
 * Heart + newspaper icons for neighborhood pages.
 * Heart adds to feed for anonymous, opens list for auth.
 * Newspaper toggles daily email subscription.
 */
export function NeighborhoodActions({ neighborhoodId, neighborhoodName }: Props) {
  const [isInFeed, setIsInFeed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        const ids = JSON.parse(stored);
        if (Array.isArray(ids)) setIsInFeed(ids.includes(neighborhoodId));
      }
    } catch { /* ignore */ }
  }, [neighborhoodId]);

  const toggleFeed = useCallback((adding: boolean) => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      let ids: string[] = stored ? JSON.parse(stored) : [];
      if (adding) {
        if (!ids.includes(neighborhoodId)) ids.push(neighborhoodId);
      } else {
        ids = ids.filter(id => id !== neighborhoodId);
      }
      localStorage.setItem(PREFS_KEY, JSON.stringify(ids));
      setIsInFeed(adding);
      syncNeighborhoodCookie();
      if (adding) {
        fetch('/api/neighborhoods/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ neighborhoodId }) }).catch(() => {});
      } else {
        fetch('/api/neighborhoods/save-preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ neighborhoodIds: ids }) }).catch(() => {});
      }
    } catch { /* ignore */ }
  }, [neighborhoodId]);

  const handleHeartClick = () => {
    if (!isInFeed) {
      toggleFeed(true);
      setToast(`${neighborhoodName} added to your feed`);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <>
      <button
        onClick={handleHeartClick}
        className={`transition-colors ${isInFeed ? 'text-red-500' : 'text-fg-muted hover:text-red-400'}`}
        title={isInFeed ? 'Saved' : 'Save to feed'}
      >
        {isInFeed ? (
          <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        ) : (
          <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        )}
      </button>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[10000] bg-fg text-canvas px-5 py-3 rounded-sm shadow-lg text-sm font-medium animate-fade-in">
          {toast}
        </div>
      )}
    </>
  );
}
