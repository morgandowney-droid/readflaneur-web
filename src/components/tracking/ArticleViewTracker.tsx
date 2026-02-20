'use client';

import { useEffect, useRef } from 'react';

const READS_KEY = 'flaneur-article-reads';
const NEIGHBORHOOD_READS_KEY = 'flaneur-neighborhood-reads';
const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface ArticleViewTrackerProps {
  articleId: string;
  neighborhoodId?: string;
}

export function ArticleViewTracker({ articleId, neighborhoodId }: ArticleViewTrackerProps) {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!hasTracked.current) {
      hasTracked.current = true;

      // Track view via API
      fetch(`/api/articles/${articleId}/view`, { method: 'POST' }).catch(() => {
        // Silently fail - view tracking is not critical
      });

      // Increment article read counter for email capture (skip if already subscribed)
      try {
        if (localStorage.getItem(SUBSCRIBED_KEY) !== 'true') {
          const current = parseInt(localStorage.getItem(READS_KEY) || '0', 10);
          localStorage.setItem(READS_KEY, String(current + 1));
        }
      } catch {
        // localStorage not available
      }

      // Track per-neighborhood reads for primary change suggestion
      if (neighborhoodId) {
        try {
          const now = Date.now();
          const raw = localStorage.getItem(NEIGHBORHOOD_READS_KEY);
          const reads: Record<string, { count: number; last: number }> = raw ? JSON.parse(raw) : {};

          // Prune entries older than 30 days
          for (const key of Object.keys(reads)) {
            if (now - reads[key].last > THIRTY_DAYS_MS) {
              delete reads[key];
            }
          }

          // Increment current neighborhood
          const entry = reads[neighborhoodId];
          reads[neighborhoodId] = {
            count: (entry?.count || 0) + 1,
            last: now,
          };

          localStorage.setItem(NEIGHBORHOOD_READS_KEY, JSON.stringify(reads));
        } catch {
          // localStorage not available
        }
      }
    }
  }, [articleId, neighborhoodId]);

  return null;
}
