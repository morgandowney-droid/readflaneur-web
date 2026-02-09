'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatRelativeTime, neighborhoodToSlug } from '@/lib/utils';
import { CITY_PREFIX_MAP } from '@/lib/neighborhood-utils';

const ANON_ID_KEY = 'flaneur-anonymous-id';
const TABS = [
  { type: 'bookmark', label: 'Saved', icon: '🔖' },
  { type: 'heart', label: 'Liked', icon: '❤️' },
  { type: 'fire', label: 'Fire', icon: '🔥' },
] as const;

// Reverse map: prefix -> city slug
const PREFIX_TO_CITY: Record<string, string> = {};
for (const [slug, prefix] of Object.entries(CITY_PREFIX_MAP)) {
  if (!PREFIX_TO_CITY[prefix]) {
    PREFIX_TO_CITY[prefix] = slug;
  }
}

function neighborhoodIdToPath(id: string): string {
  const parts = id.split('-');
  const prefix = parts[0];
  const neighborhoodSlug = parts.slice(1).join('-');
  const citySlug = PREFIX_TO_CITY[prefix] || prefix;
  return `/${citySlug}/${neighborhoodSlug}`;
}

interface SavedArticle {
  id: string;
  headline: string;
  preview_text: string;
  slug: string;
  neighborhood_id: string;
  image_url: string;
  created_at: string;
  neighborhood?: { name: string; city: string };
}

export default function SavedPage() {
  const [activeTab, setActiveTab] = useState<string>('bookmark');
  const [articles, setArticles] = useState<SavedArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSaved = async () => {
      setLoading(true);
      const anonymousId = typeof window !== 'undefined' ? localStorage.getItem(ANON_ID_KEY) : null;
      if (!anonymousId) {
        setArticles([]);
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/reactions/saved?anonymousId=${anonymousId}&type=${activeTab}`);
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles || []);
      }
      setLoading(false);
    };

    fetchSaved();
  }, [activeTab]);

  return (
    <div className="py-8 px-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-light text-neutral-100 mb-6">Saved Stories</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-white/[0.08]">
          {TABS.map((tab) => (
            <button
              key={tab.type}
              onClick={() => setActiveTab(tab.type)}
              className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                activeTab === tab.type
                  ? 'border-amber-600 text-neutral-100'
                  : 'border-transparent text-neutral-400 hover:text-neutral-300'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-neutral-800 rounded w-3/4 mb-2" />
                <div className="h-3 bg-neutral-700 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <p className="text-neutral-400 text-sm py-8 text-center">
            No {TABS.find(t => t.type === activeTab)?.label.toLowerCase()} stories yet.
          </p>
        ) : (
          <div className="space-y-6">
            {articles.map((article) => {
              const path = neighborhoodIdToPath(article.neighborhood_id);
              const articleUrl = `${path}/${article.slug}`;

              return (
                <Link key={article.id} href={articleUrl} className="block group">
                  <div className="flex gap-4">
                    <div className="flex-1 min-w-0">
                      {article.neighborhood && (
                        <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">
                          {article.neighborhood.name} &middot; {article.neighborhood.city}
                        </p>
                      )}
                      <h3 className="text-base font-medium text-neutral-100 group-hover:text-neutral-300 transition-colors leading-tight mb-1">
                        {article.headline}
                      </h3>
                      <p className="text-xs text-neutral-400">
                        {formatRelativeTime(article.created_at)}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
