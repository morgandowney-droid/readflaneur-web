'use client';

import { useState, useEffect } from 'react';
import { Article, Ad, FeedItem } from '@/types';
import { ArticleCard } from './ArticleCard';
import { CompactArticleCard } from './CompactArticleCard';
import { AdCard } from './AdCard';
import { FeedView } from './ViewToggle';
import { injectAds } from '@/lib/ad-engine';

const VIEW_PREF_KEY = 'flaneur-feed-view';

interface LoadMoreButtonProps {
  neighborhoodId: string;
  queryIds?: string[];
  initialOffset: number;
  pageSize?: number;
  sectionSlug?: string;
  categoryFilter?: string;
}

export function LoadMoreButton({
  neighborhoodId,
  queryIds,
  initialOffset,
  pageSize = 10,
  sectionSlug,
  categoryFilter
}: LoadMoreButtonProps) {
  const allIds = queryIds && queryIds.length > 0 ? queryIds : [neighborhoodId];
  const [items, setItems] = useState<FeedItem[]>([]);
  const [offset, setOffset] = useState(initialOffset);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [view, setView] = useState<FeedView>('compact');
  const [ads, setAds] = useState<Ad[]>([]);
  const [sectionArticleIds, setSectionArticleIds] = useState<string[] | null>(null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
  };

  // Listen for view preference changes and fetch ads once
  useEffect(() => {
    const updateView = () => {
      const saved = localStorage.getItem(VIEW_PREF_KEY) as FeedView | null;
      if (saved && (saved === 'compact' || saved === 'gallery')) {
        setView(saved);
      }
    };
    updateView();

    // Fetch ads once on mount via REST API
    const adsFilter = allIds.map(id => `neighborhood_id.eq.${id}`).join(',');
    const adsUrl = `${supabaseUrl}/rest/v1/ads?select=*&or=(is_global.eq.true,${adsFilter})`;

    fetch(adsUrl, { headers })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setAds(data as Ad[]);
      })
      .catch(() => {});

    // If section filter is specified, get article IDs for this section
    if (sectionSlug) {
      const sectionUrl = `${supabaseUrl}/rest/v1/sections?select=id&slug=eq.${encodeURIComponent(sectionSlug)}&is_active=eq.true&limit=1`;
      fetch(sectionUrl, { headers })
        .then(r => r.json())
        .then(data => {
          const section = Array.isArray(data) && data.length > 0 ? data[0] : null;
          if (!section) {
            setSectionArticleIds([]);
            return;
          }
          const artSecUrl = `${supabaseUrl}/rest/v1/article_sections?select=article_id&section_id=eq.${section.id}`;
          return fetch(artSecUrl, { headers }).then(r => r.json());
        })
        .then(data => {
          if (Array.isArray(data)) {
            setSectionArticleIds(data.map((as: any) => as.article_id));
          }
        })
        .catch(() => setSectionArticleIds([]));
    }

    // Listen for storage changes (when view toggle is clicked)
    window.addEventListener('storage', updateView);
    // Also poll for changes since storage event doesn't fire in same tab
    const interval = setInterval(updateView, 500);

    return () => {
      window.removeEventListener('storage', updateView);
      clearInterval(interval);
    };
  }, [neighborhoodId, sectionSlug]);

  const loadMore = async () => {
    setLoading(true);

    try {
      // Apply section filter if specified
      if (sectionArticleIds !== null && sectionArticleIds.length === 0) {
        setHasMore(false);
        setLoading(false);
        return;
      }

      // Build articles URL
      let url = `${supabaseUrl}/rest/v1/articles?select=*,neighborhood:neighborhoods(id,name,city)&status=eq.published&order=published_at.desc.nullsfirst&offset=${offset}&limit=${pageSize}`;

      url += `&neighborhood_id=in.(${allIds.join(',')})`;

      if (sectionArticleIds !== null && sectionArticleIds.length > 0) {
        url += `&id=in.(${sectionArticleIds.join(',')})`;
      }

      if (categoryFilter) {
        const categoryPattern = categoryFilter.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        url += `&category_label=ilike.*${encodeURIComponent(categoryPattern)}*`;
      }

      const res = await fetch(url, { headers });
      const articles = await res.json();

      if (!Array.isArray(articles) || articles.length === 0) {
        setHasMore(false);
        setLoading(false);
        return;
      }

      // Inject ads into the new articles
      const newItems = injectAds(articles as Article[], ads, allIds);

      setItems((prev) => [...prev, ...newItems]);
      setOffset((prev) => prev + articles.length);
      setHasMore(articles.length === pageSize);
    } catch (err) {
      console.error('Error loading more articles:', err);
    } finally {
      setLoading(false);
    }
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
          className="w-full py-3 text-sm tracking-wide uppercase text-fg-muted hover:text-fg border border-border hover:border-border-strong transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load More Stories'}
        </button>
      )}

      {!hasMore && items.length > 0 && (
        <p className="text-center text-sm text-fg-muted py-4">
          You've reached the end
        </p>
      )}
    </div>
  );
}
