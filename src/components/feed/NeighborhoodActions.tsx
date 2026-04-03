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
  const [confirmRemove, setConfirmRemove] = useState(false);

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
    } else {
      setConfirmRemove(true);
    }
  };

  const handleConfirmRemove = () => {
    toggleFeed(false);
    setConfirmRemove(false);
    setToast(`${neighborhoodName} removed`);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <>
      <button
        onClick={handleHeartClick}
        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-sm transition-colors ${
          isInFeed
            ? 'border-red-500/30 text-red-500'
            : 'border-border-strong text-fg-muted hover:text-red-400 hover:border-red-400/30'
        }`}
      >
        {isInFeed ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        )}
        <span className="text-xs font-medium tracking-wide">{isInFeed ? 'Saved' : 'Save'}</span>
      </button>

      {/* Confirm remove */}
      {confirmRemove && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-lg p-6 max-w-sm mx-4 text-center">
            <p className="text-fg text-sm font-medium mb-2">Remove {neighborhoodName}?</p>
            <p className="text-fg-muted text-xs mb-5">You will stop receiving daily briefs for this neighborhood.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemove(false)}
                className="flex-1 py-2.5 text-xs tracking-[0.1em] uppercase border border-border text-fg-muted rounded-lg hover:text-fg transition-colors"
              >
                Keep
              </button>
              <button
                onClick={handleConfirmRemove}
                className="flex-1 py-2.5 text-xs tracking-[0.1em] uppercase bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-[10000] bg-fg text-canvas px-5 py-3 rounded-sm shadow-lg text-sm font-medium animate-fade-in">
          {toast}
        </div>
      )}
    </>
  );
}
