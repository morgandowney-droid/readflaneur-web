'use client';

import { useState, useEffect, useRef } from 'react';
import { useNeighborhoodPreferences } from '@/hooks/useNeighborhoodPreferences';

const NEIGHBORHOOD_READS_KEY = 'flaneur-neighborhood-reads';
const DISMISS_PREFIX = 'flaneur-primary-suggestion-dismissed-';
const SESSION_KEY = 'flaneur-primary-suggestion-shown';
const MIN_READ_COUNT = 5;
const RATIO_THRESHOLD = 2;
const AUTO_DISMISS_MS = 15000;

export function PrimaryChangeSuggestion() {
  const { neighborhoods, primaryId, isLoading, setPrimary } = useNeighborhoodPreferences();
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState('');
  const [primaryName, setPrimaryName] = useState('');
  const [visible, setVisible] = useState(false);
  const [changed, setChanged] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading || neighborhoods.length < 2 || !primaryId) return;

    try {
      // Only show once per session
      if (sessionStorage.getItem(SESSION_KEY)) return;

      const raw = localStorage.getItem(NEIGHBORHOOD_READS_KEY);
      if (!raw) return;

      const reads: Record<string, { count: number; last: number }> = JSON.parse(raw);

      // Find the neighborhood with the most reads among subscribed ones
      const subscribedIds = new Set(neighborhoods.map(n => n.id));
      let topId: string | null = null;
      let topCount = 0;

      for (const [id, entry] of Object.entries(reads)) {
        if (subscribedIds.has(id) && entry.count > topCount) {
          topCount = entry.count;
          topId = id;
        }
      }

      if (!topId || topId === primaryId) return;
      if (topCount < MIN_READ_COUNT) return;

      const primaryCount = reads[primaryId]?.count || 0;
      if (topCount < primaryCount * RATIO_THRESHOLD) return;

      // Check if dismissed for this specific suggestion
      if (localStorage.getItem(`${DISMISS_PREFIX}${topId}`)) return;

      const suggested = neighborhoods.find(n => n.id === topId);
      const primary = neighborhoods.find(n => n.id === primaryId);
      if (!suggested || !primary) return;

      setSuggestedId(topId);
      setSuggestedName(suggested.name);
      setPrimaryName(primary.name);
      sessionStorage.setItem(SESSION_KEY, 'true');

      // Delay showing slightly
      const showTimer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(showTimer);
    } catch {
      // localStorage/sessionStorage not available
    }
  }, [isLoading, neighborhoods, primaryId]);

  // Auto-dismiss after 15s if not interacted
  useEffect(() => {
    if (!visible || interacted) return;
    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, interacted]);

  const handleAccept = () => {
    if (!suggestedId) return;
    setInteracted(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    setPrimary(suggestedId);
    setChanged(true);
    setTimeout(() => setVisible(false), 2000);
  };

  const handleDismiss = () => {
    if (suggestedId) {
      try {
        localStorage.setItem(`${DISMISS_PREFIX}${suggestedId}`, 'true');
      } catch {
        // ignore
      }
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 animate-slide-up"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto max-w-2xl px-4 pb-4">
        <div className="bg-surface border border-border p-4 shadow-2xl shadow-black/50 relative">
          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-fg-subtle hover:text-fg transition-colors"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {changed ? (
            <p className="text-sm text-fg text-center py-1">
              Done! <span className="font-medium">{suggestedName}</span> is now your primary neighborhood.
            </p>
          ) : (
            <>
              <p className="text-sm text-fg-muted mb-3 pr-6">
                Your primary neighborhood is <span className="font-medium text-fg">{primaryName}</span>.
                You seem to read <span className="font-medium text-fg">{suggestedName}</span> more
                — would you like to make it your primary?
              </p>

              <button
                onClick={handleAccept}
                onMouseEnter={() => {
                  setInteracted(true);
                  if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
                }}
                className="px-5 py-2 bg-fg text-canvas text-sm font-medium hover:bg-amber-600 hover:text-fg transition-colors whitespace-nowrap"
              >
                Yes, change
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
