'use client';

import { useState, useEffect } from 'react';
import { Article, Ad, FeedItem } from '@/types';
import { ArticleCard } from './ArticleCard';
import { CompactArticleCard } from './CompactArticleCard';
import { AdCard } from './AdCard';
import { FeedView } from './ViewToggle';
import { injectAds } from '@/lib/ad-engine';

const VIEW_PREF_KEY = 'flaneur-feed-view';

interface MultiLoadMoreButtonProps {
  neighborhoodIds: string[];
  initialOffset: number;
  pageSize?: number;
  sectionSlug?: string;
}

export function MultiLoadMoreButton({
  neighborhoodIds,
  initialOffset,
  pageSize = 10,
  sectionSlug
}: MultiLoadMoreButtonProps) {
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
    const adsFilter = neighborhoodIds.length > 0
      ? `or=(is_global.eq.true,neighborhood_id.in.(${neighborhoodIds.join(',')}))`
      : 'is_global=eq.true';
    const adsUrl = `${supabaseUrl}/rest/v1/ads?select=*&${adsFilter}`;

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
  }, [neighborhoodIds, sectionSlug]);

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

      if (neighborhoodIds.length > 0) {
        url += `&neighborhood_id=in.(${neighborhoodIds.join(',')})`;
      }

      if (sectionArticleIds !== null && sectionArticleIds.length > 0) {
        url += `&id=in.(${sectionArticleIds.join(',')})`;
      }

      const res = await fetch(url, { headers });
      const articlesRaw = await res.json();

      if (!Array.isArray(articlesRaw) || articlesRaw.length === 0) {
        setHasMore(false);
        setLoading(false);
        return;
      }

      // Deduplicate articles with identical headlines (same story across neighborhoods)
      const existingHeadlines = new Set(
        items
          .filter(i => i.type === 'article')
          .map(i => (i.data as Article).headline)
      );
      const seenHeadlines = new Set(existingHeadlines);
      const articles = articlesRaw.filter((a: any) => {
        if (seenHeadlines.has(a.headline)) return false;
        seenHeadlines.add(a.headline);
        return true;
      });

      if (articles.length === 0) {
        setHasMore(articlesRaw.length === pageSize); // May be more unique articles in next batch
        setOffset((prev) => prev + articlesRaw.length);
        setLoading(false);
        return;
      }

      // Inject ads into the new articles
      const newItems = injectAds(articles as Article[], ads, neighborhoodIds);

      setItems((prev) => [...prev, ...newItems]);
      setOffset((prev) => prev + articlesRaw.length);
      setHasMore(articlesRaw.length === pageSize);
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
          className="w-full py-3 text-sm tracking-wide uppercase text-fg-subtle hover:text-fg border border-border hover:border-border-strong transition-colors disabled:opacity-50"
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
