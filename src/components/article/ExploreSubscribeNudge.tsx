'use client';

import { useState, useEffect } from 'react';
import { syncNeighborhoodCookie } from '@/lib/neighborhood-cookie';

interface ExploreSubscribeNudgeProps {
  neighborhoodId: string;
  neighborhoodName: string;
  isExploring: boolean;
}

export function ExploreSubscribeNudge({
  neighborhoodId,
  neighborhoodName,
  isExploring,
}: ExploreSubscribeNudgeProps) {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!isExploring) { setSubscribed(true); return; }
    try {
      const stored = localStorage.getItem('flaneur-neighborhood-preferences');
      const ids: string[] = stored ? JSON.parse(stored) : [];
      setSubscribed(ids.includes(neighborhoodId));
    } catch {
      setSubscribed(true);
    }
  }, [neighborhoodId, isExploring]);

  if (subscribed === null || subscribed || !isExploring) return null;

  const handleAdd = () => {
    try {
      const stored = localStorage.getItem('flaneur-neighborhood-preferences');
      const ids: string[] = stored ? JSON.parse(stored) : [];
      if (!ids.includes(neighborhoodId)) {
        ids.push(neighborhoodId);
        localStorage.setItem('flaneur-neighborhood-preferences', JSON.stringify(ids));
        syncNeighborhoodCookie();
      }
    } catch {}
    fetch('/api/neighborhoods/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ neighborhoodId }),
    }).catch(() => {});
    setAdded(true);
  };

  return (
    <div className="mt-4 mb-2 flex items-center gap-2 text-sm">
      {added ? (
        <span className="text-green-500/80">
          &#10003; {neighborhoodName} added to your neighborhoods
        </span>
      ) : (
        <>
          <span className="text-fg-muted">Enjoying {neighborhoodName}?</span>
          <button
            onClick={handleAdd}
            className="text-accent hover:underline underline-offset-2 font-medium transition-colors"
          >
            Add to my neighborhoods
          </button>
        </>
      )}
    </div>
  );
}
