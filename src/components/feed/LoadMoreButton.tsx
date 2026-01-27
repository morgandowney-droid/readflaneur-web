'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Article, Ad, FeedItem } from '@/types';
import { ArticleCard } from './ArticleCard';
import { AdCard } from './AdCard';

interface LoadMoreButtonProps {
  neighborhoodId: string;
  initialOffset: number;
  pageSize?: number;
}

export function LoadMoreButton({
  neighborhoodId,
  initialOffset,
  pageSize = 10
}: LoadMoreButtonProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [offset, setOffset] = useState(initialOffset);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = async () => {
    setLoading(true);

    const supabase = createClient();

    const { data: articles, error } = await supabase
      .from('articles')
      .select('*')
      .eq('neighborhood_id', neighborhoodId)
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error loading more articles:', error);
      setLoading(false);
      return;
    }

    if (!articles || articles.length === 0) {
      setHasMore(false);
      setLoading(false);
      return;
    }

    // Convert to feed items
    const newItems: FeedItem[] = articles.map((article) => ({
      type: 'article' as const,
      data: article as Article,
    }));

    setItems((prev) => [...prev, ...newItems]);
    setOffset((prev) => prev + articles.length);
    setHasMore(articles.length === pageSize);
    setLoading(false);
  };

  return (
    <div className="mt-4">
      {/* Render loaded items */}
      {items.length > 0 && (
        <div className="space-y-4 mb-4">
          {items.map((item, index) => {
            if (item.type === 'article') {
              return (
                <ArticleCard
                  key={`more-article-${item.data.id}-${index}`}
                  article={item.data as Article}
                />
              );
            }
            return (
              <AdCard
                key={`more-ad-${item.data.id}-${index}`}
                ad={item.data as Ad}
              />
            );
          })}
        </div>
      )}

      {/* Load more button */}
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="w-full py-3 text-sm tracking-wide uppercase text-neutral-500 hover:text-neutral-900 border border-neutral-200 hover:border-neutral-400 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load More Stories'}
        </button>
      )}

      {!hasMore && items.length > 0 && (
        <p className="text-center text-sm text-neutral-400 py-4">
          You've reached the end
        </p>
      )}
    </div>
  );
}
