'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { GEMINI_STORY_GENERATORS } from '@/lib/gemini-story-registry';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
  region?: string;
  count?: number;
}

interface Article {
  id: string;
  headline: string;
  slug: string;
  category_label: string | null;
  published_at: string;
  ai_model: string | null;
  author_type: string | null;
  neighborhood: {
    id: string;
    name: string;
    city: string;
    region: string | null;
  } | null;
}

interface FailedArticle {
  id: string;
  headline: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
  editor_notes: string | null;
  neighborhood: { name: string } | null;
}

interface Stats {
  totalActiveNeighborhoods: number;
  neighborhoodsWithNoContent: Neighborhood[];
  neighborhoodsOverwhelmed: Neighborhood[];
  totalArticles24h: number;
  categories: { label: string; count: number }[];
}

interface ApiResponse {
  stats: Stats;
  articles: Article[];
  failedContent: FailedArticle[];
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export default function NewsFeedAdmin() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ days: 1, category: '', neighborhood: '', storyType: '', source: '' });
  const [showNoContent, setShowNoContent] = useState(false);
  const [showOverwhelmed, setShowOverwhelmed] = useState(false);
  const [showFailed, setShowFailed] = useState(true);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('days', filter.days.toString());
      // storyType overrides category if set (both filter by category_label)
      // source filter also uses category_label for RSS
      if (filter.source === 'rss') {
        params.set('source', 'rss');
      } else if (filter.source === 'grok') {
        params.set('source', 'grok');
      } else if (filter.source === 'gemini') {
        params.set('source', 'gemini');
      } else if (filter.storyType) {
        params.set('category', filter.storyType);
      } else if (filter.category) {
        params.set('category', filter.category);
      }
      if (filter.neighborhood) params.set('neighborhood', filter.neighborhood);

      const res = await fetch(`/api/admin/news-feed?${params}`);
      const json = await res.json();

      if (res.ok) {
        setData(json);
        // Use full neighborhood list from API
        if (json.neighborhoods) {
          setNeighborhoods(
            (json.neighborhoods as Neighborhood[]).sort((a, b) =>
              `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`)
            )
          );
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-neutral-50 py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-24">
            <div className="inline-block w-8 h-8 border-2 border-neutral-200 border-t-black rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  const stats = data?.stats;
  const articles = data?.articles || [];
  const failedContent = data?.failedContent || [];

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin" className="text-xs text-neutral-400 hover:text-black mb-2 block">
            &larr; Admin
          </Link>
          <h1 className="text-2xl font-light">NEWS FEED QUALITY CONTROL</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Monitor content health across all neighborhoods
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* No Content Card */}
          <button
            onClick={() => setShowNoContent(!showNoContent)}
            className={`text-left p-4 border transition-all ${
              showNoContent
                ? 'bg-red-50 border-red-300'
                : 'bg-white border-neutral-200 hover:border-neutral-400'
            }`}
          >
            <div className="text-3xl font-light text-red-600">
              {stats?.neighborhoodsWithNoContent.length || 0}
            </div>
            <div className="text-xs text-neutral-500 uppercase tracking-wide">
              No Content (24h)
            </div>
            <div className="text-xs text-neutral-400 mt-1">
              Click to {showNoContent ? 'hide' : 'see'} list
            </div>
          </button>

          {/* Overwhelmed Card */}
          <button
            onClick={() => setShowOverwhelmed(!showOverwhelmed)}
            className={`text-left p-4 border transition-all ${
              showOverwhelmed
                ? 'bg-yellow-50 border-yellow-300'
                : 'bg-white border-neutral-200 hover:border-neutral-400'
            }`}
          >
            <div className="text-3xl font-light text-yellow-600">
              {stats?.neighborhoodsOverwhelmed.length || 0}
            </div>
            <div className="text-xs text-neutral-500 uppercase tracking-wide">
              Overwhelmed (&gt;5/day)
            </div>
            <div className="text-xs text-neutral-400 mt-1">
              Click to {showOverwhelmed ? 'hide' : 'see'} list
            </div>
          </button>

          {/* Total Articles Card */}
          <div className="bg-white border border-neutral-200 p-4">
            <div className="text-3xl font-light">{stats?.totalArticles24h || 0}</div>
            <div className="text-xs text-neutral-500 uppercase tracking-wide">
              Total Articles (24h)
            </div>
            <div className="text-xs text-neutral-400 mt-1">
              Across {stats?.totalActiveNeighborhoods || 0} neighborhoods
            </div>
          </div>
        </div>

        {/* Expanded Lists */}
        {showNoContent && stats && stats.neighborhoodsWithNoContent && stats.neighborhoodsWithNoContent.length > 0 && (
          <div className="bg-red-50 border border-red-200 p-4 mb-6">
            <h3 className="text-sm font-medium text-red-800 mb-2">
              Neighborhoods with No Content (24h)
            </h3>
            <div className="flex flex-wrap gap-2">
              {stats.neighborhoodsWithNoContent.map(n => (
                <span key={n.id} className="text-xs bg-white px-2 py-1 border border-red-200 text-red-700">
                  {n.name}, {n.city}
                </span>
              ))}
            </div>
          </div>
        )}

        {showOverwhelmed && stats && stats.neighborhoodsOverwhelmed && stats.neighborhoodsOverwhelmed.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 p-4 mb-6">
            <h3 className="text-sm font-medium text-yellow-800 mb-2">
              Overwhelmed Neighborhoods (&gt;5 articles/day)
            </h3>
            <div className="flex flex-wrap gap-2">
              {stats.neighborhoodsOverwhelmed.map(n => (
                <span key={n.id} className="text-xs bg-white px-2 py-1 border border-yellow-200 text-yellow-700">
                  {n.name}, {n.city} ({n.count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Time:</span>
            <select
              value={filter.days}
              onChange={(e) => setFilter({ ...filter, days: parseInt(e.target.value) })}
              className="text-sm border border-neutral-200 px-2 py-1 bg-white"
            >
              <option value="1">Last 24h</option>
              <option value="7">Last 7 days</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Category:</span>
            <select
              value={filter.category}
              onChange={(e) => setFilter({ ...filter, category: e.target.value, storyType: '' })}
              className="text-sm border border-neutral-200 px-2 py-1 bg-white"
              disabled={!!filter.storyType}
            >
              <option value="">All Categories</option>
              {stats?.categories.map(c => (
                <option key={c.label} value={c.label}>
                  {c.label} ({c.count})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Neighborhood:</span>
            <select
              value={filter.neighborhood}
              onChange={(e) => setFilter({ ...filter, neighborhood: e.target.value })}
              className="text-sm border border-neutral-200 px-2 py-1 bg-white max-w-[200px]"
            >
              <option value="">All Neighborhoods</option>
              {neighborhoods.map(n => (
                <option key={n.id} value={n.id}>
                  {n.name}, {n.city}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Story Type:</span>
            <select
              value={filter.storyType}
              onChange={(e) => setFilter({ ...filter, storyType: e.target.value, category: '', source: '' })}
              className="text-sm border border-neutral-200 px-2 py-1 bg-white max-w-[200px]"
              disabled={!!filter.source}
            >
              <option value="">All Story Types</option>
              {GEMINI_STORY_GENERATORS.map(g => (
                <option key={g.id} value={g.categoryLabel}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Source:</span>
            <select
              value={filter.source}
              onChange={(e) => setFilter({ ...filter, source: e.target.value, storyType: '', category: '' })}
              className="text-sm border border-neutral-200 px-2 py-1 bg-white"
            >
              <option value="">All Sources</option>
              <option value="rss">RSS Feeds (News Brief)</option>
              <option value="grok">Grok AI</option>
              <option value="gemini">Gemini AI</option>
            </select>
          </div>

          {loading && (
            <div className="ml-auto">
              <div className="inline-block w-4 h-4 border-2 border-neutral-200 border-t-black rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Articles Table */}
        <div className="bg-white border border-neutral-200 mb-8">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">Headline</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase w-36">Neighborhood</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase w-20">Region</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase w-28">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase w-20">Source</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase w-16">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {articles.map((article) => (
                <tr key={article.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/${article.neighborhood?.city?.toLowerCase().replace(/\s+/g, '-') || 'unknown'}/${article.neighborhood?.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown'}/${article.slug}`}
                      target="_blank"
                      className="text-neutral-800 hover:text-black hover:underline"
                    >
                      {truncate(article.headline, 60)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-500 text-xs">
                    {article.neighborhood?.name || '-'}
                  </td>
                  <td className="px-4 py-2 text-neutral-400 text-xs">
                    {article.neighborhood?.region || article.neighborhood?.city || '-'}
                  </td>
                  <td className="px-4 py-2">
                    {article.category_label && (
                      <span className="text-xs bg-neutral-100 px-2 py-0.5 text-neutral-600">
                        {article.category_label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {article.category_label === 'News Brief' ? (
                      <span className="text-xs bg-blue-100 px-2 py-0.5 text-blue-700">RSS</span>
                    ) : article.ai_model?.toLowerCase().includes('grok') ? (
                      <span className="text-xs bg-purple-100 px-2 py-0.5 text-purple-700">Grok</span>
                    ) : article.ai_model?.toLowerCase().includes('gemini') ? (
                      <span className="text-xs bg-green-100 px-2 py-0.5 text-green-700">Gemini</span>
                    ) : article.author_type === 'ai' ? (
                      <span className="text-xs bg-neutral-100 px-2 py-0.5 text-neutral-600">AI</span>
                    ) : (
                      <span className="text-xs text-neutral-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-neutral-400 text-xs">
                    {formatRelativeTime(article.published_at)}
                  </td>
                </tr>
              ))}
              {articles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                    No articles found for selected filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Failed Content Section */}
        <div className="border border-neutral-200 bg-white">
          <button
            onClick={() => setShowFailed(!showFailed)}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50 hover:bg-neutral-100 transition-colors"
          >
            <span className="text-sm font-medium text-neutral-700">
              FAILED/STUCK CONTENT ({failedContent.length})
            </span>
            <span className="text-neutral-400">
              {showFailed ? '▲' : '▼'}
            </span>
          </button>

          {showFailed && (
            <div className="divide-y divide-neutral-100">
              {failedContent.map((item) => {
                const isScheduleMissed = item.status === 'scheduled' && item.scheduled_for && new Date(item.scheduled_for) < new Date();
                const isStale = ['draft', 'pending'].includes(item.status);

                return (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                    <span className="text-yellow-500 mt-0.5">⚠</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-neutral-800 truncate">
                        {item.headline}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {item.neighborhood?.name || 'Unknown'} &middot;{' '}
                        {isScheduleMissed && (
                          <span className="text-red-600">
                            Scheduled {formatRelativeTime(item.scheduled_for!)} - MISSED
                          </span>
                        )}
                        {isStale && (
                          <span className="text-yellow-600">
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)} {formatRelativeTime(item.created_at)} - NEEDS REVIEW
                          </span>
                        )}
                      </div>
                      {item.editor_notes && (
                        <div className="text-xs text-neutral-400 mt-1 italic">
                          Note: {item.editor_notes}
                        </div>
                      )}
                    </div>
                    <Link
                      href={`/admin/articles?id=${item.id}`}
                      className="text-xs text-neutral-400 hover:text-black"
                    >
                      View
                    </Link>
                  </div>
                );
              })}
              {failedContent.length === 0 && (
                <div className="px-4 py-8 text-center text-neutral-400 text-sm">
                  No failed or stuck content
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
