'use client';

import { useState, useEffect } from 'react';

const FIRST_VISIT_KEY = 'flaneur-first-visit';
const GRACE_PERIOD_DAYS = 5;

/**
 * Returns true if the user is within the new-user grace period (first 5 days).
 * Sets the first-visit timestamp if not already set.
 */
export function useNewUserGracePeriod(): boolean {
  const [isGracePeriod, setIsGracePeriod] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(FIRST_VISIT_KEY);
    const now = Date.now();

    if (!stored) {
      // First visit - set timestamp and enable grace period
      localStorage.setItem(FIRST_VISIT_KEY, String(now));
      setIsGracePeriod(true);
      return;
    }

    const firstVisit = parseInt(stored, 10);
    if (isNaN(firstVisit)) {
      setIsGracePeriod(false);
      return;
    }

    const daysSinceFirst = (now - firstVisit) / (1000 * 60 * 60 * 24);
    setIsGracePeriod(daysSinceFirst < GRACE_PERIOD_DAYS);
  }, []);

  return isGracePeriod;
}
