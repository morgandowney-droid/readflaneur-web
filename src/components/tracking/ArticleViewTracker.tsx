'use client';

import { useEffect, useRef } from 'react';

interface ArticleViewTrackerProps {
  articleId: string;
}

export function ArticleViewTracker({ articleId }: ArticleViewTrackerProps) {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!hasTracked.current) {
      hasTracked.current = true;
      fetch(`/api/articles/${articleId}/view`, { method: 'POST' }).catch(() => {
        // Silently fail - view tracking is not critical
      });
    }
  }, [articleId]);

  return null;
}
