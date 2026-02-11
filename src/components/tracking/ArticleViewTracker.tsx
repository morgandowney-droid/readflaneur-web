'use client';

import { useEffect, useRef } from 'react';

const READS_KEY = 'flaneur-article-reads';
const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';

interface ArticleViewTrackerProps {
  articleId: string;
}

export function ArticleViewTracker({ articleId }: ArticleViewTrackerProps) {
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
    }
  }, [articleId]);

  return null;
}
