'use client';

import { useEffect, useState, useCallback } from 'react';

interface TrailEntry {
  name: string;
  city: string;
  url: string;
}

interface ExplorationSession {
  trail: TrailEntry[];
  startedAt: string;
}

const STORAGE_KEY = 'flaneur-exploration-session';

function getSession(): ExplorationSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(session: ExplorationSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {}
}

export function useExplorationSession(isExploring: boolean, currentName?: string, currentCity?: string) {
  const [trailCount, setTrailCount] = useState(0);

  const addToTrail = useCallback((name: string, city: string, url: string) => {
    let session = getSession();
    if (!session) {
      session = { trail: [], startedAt: new Date().toISOString() };
    }
    // Don't add duplicates
    if (session.trail.some(t => t.name === name && t.city === city)) {
      setTrailCount(session.trail.length);
      return;
    }
    session.trail.push({ name, city, url });
    saveSession(session);
    setTrailCount(session.trail.length);
  }, []);

  // Auto-add current page to trail on mount
  useEffect(() => {
    if (!isExploring || !currentName || !currentCity) return;
    const url = window.location.pathname + window.location.search;
    addToTrail(currentName, currentCity, url);
  }, [isExploring, currentName, currentCity, addToTrail]);

  // Read initial trail count
  useEffect(() => {
    const session = getSession();
    setTrailCount(session?.trail.length || 0);
  }, []);

  return { trailCount, addToTrail };
}
