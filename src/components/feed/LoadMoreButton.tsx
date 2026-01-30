'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Article, Ad, FeedItem } from '@/types';
import { ArticleCard } from './ArticleCard';
import { CompactArticleCard } from './CompactArticleCard';
import { AdCard } from './AdCard';
import { FeedView } from './ViewToggle';
import { injectAds } from '@/lib/ad-engine';

const VIEW_PREF_KEY = 'flaneur-feed-view';

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
  const [view, setView] = useState<FeedView>('compact');
  const [ads, setAds] = useState<Ad[]>([]);

  // Listen for view preference changes and fetch ads once
  useEffect(() => {
    const updateView = () => {
      const saved = localStorage.getItem(VIEW_PREF_KEY) as FeedView | null;
      if (saved && (saved === 'compact' || saved === 'gallery')) {
        setView(saved);
      }
    };
    updateView();

    // Fetch ads once on mount
    const fetchAds = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('ads')
        .select('*')
        .or(`is_global.eq.true,neighborhood_id.eq.${neighborhoodId}`);
      if (data) {
        setAds(data as Ad[]);
      }
    };
    fetchAds();

    // Listen for storage changes (when view toggle is clicked)
    window.addEventListener('storage', updateView);
    // Also poll for changes since storage event doesn't fire in same tab
    const interval = setInterval(updateView, 500);

    return () => {
      window.removeEventListener('storage', updateView);
      clearInterval(interval);
    };
  }, [neighborhoodId]);

  const loadMore = async () => {
    setLoading(true);

    const supabase = createClient();

    const { data: articles, error } = await supabase
      .from('articles')
      .select('*, neighborhood:neighborhoods(id, name, city)')
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

    // Inject ads into the new articles
    const newItems = injectAds(articles as Article[], ads, [neighborhoodId]);

    setItems((prev) => [...prev, ...newItems]);
    setOffset((prev) => prev + articles.length);
    setHasMore(articles.length === pageSize);
    setLoading(false);
  };

  return (
    <div className="mt-4">
      {/* Render loaded items */}
      {items.length > 0 && (
        <div className={view === 'compact' ? 'space-y-0 mb-4' : 'space-y-4 mb-4'}>
          {items.map((item, index) => {
            if (item.type === 'article') {
              return view === 'compact' ? (
                <CompactArticleCard
                  key={`more-article-${item.data.id}-${index}`}
                  article={item.data as Article}
                />
              ) : (
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
                variant={view}
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
