'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface NeighborhoodCoverage {
  id: string;
  name: string;
  city: string;
  article_count_7d: number;
  article_count_30d: number;
  avg_per_day: number;
  last_article_date: string | null;
  status: 'good' | 'low' | 'none';
}

interface RSSSource {
  id: string;
  city: string;
  name: string;
  feed_url: string;
  is_active: boolean;
  last_fetched_at: string | null;
  last_error: string | null;
  articles_found_total: number;
  articles_found_7d: number;
}

export default function NewsCoveragePage() {
  const [coverage, setCoverage] = useState<NeighborhoodCoverage[]>([]);
  const [rssSources, setRssSources] = useState<RSSSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'coverage' | 'sources'>('coverage');

  // Add feed form
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [newFeed, setNewFeed] = useState({ city: '', name: '', feed_url: '' });
  const [addingFeed, setAddingFeed] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const supabase = createClient();

    // Get all active neighborhoods
    const { data: neighborhoods } = await supabase
      .from('neighborhoods')
      .select('id, name, city')
      .eq('is_active', true)
      .order('city');

    if (!neighborhoods) {
      setLoading(false);
      return;
    }

    // Get article counts per neighborhood (last 7 days and 30 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: articles } = await supabase
      .from('articles')
      .select('neighborhood_id, published_at')
      .eq('status', 'published')
      .gte('published_at', thirtyDaysAgo.toISOString());

    // Calculate coverage for each neighborhood
    const coverageData: NeighborhoodCoverage[] = neighborhoods.map(n => {
      const neighborhoodArticles = articles?.filter(a => a.neighborhood_id === n.id) || [];
      const articles7d = neighborhoodArticles.filter(a =>
        new Date(a.published_at) >= sevenDaysAgo
      ).length;
      const articles30d = neighborhoodArticles.length;
      const avgPerDay = articles7d / 7;

      const sortedArticles = neighborhoodArticles.sort((a, b) =>
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      );
      const lastArticle = sortedArticles[0]?.published_at || null;

      let status: 'good' | 'low' | 'none' = 'good';
      if (articles7d === 0) {
        status = 'none';
      } else if (avgPerDay < 1) {
        status = 'low';
      }

      return {
        id: n.id,
        name: n.name,
        city: n.city,
        article_count_7d: articles7d,
        article_count_30d: articles30d,
        avg_per_day: avgPerDay,
        last_article_date: lastArticle,
        status,
      };
    });

    // Sort by status (none first, then low, then good)
    coverageData.sort((a, b) => {
      const statusOrder = { none: 0, low: 1, good: 2 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return a.avg_per_day - b.avg_per_day;
    });

    setCoverage(coverageData);

    // Load RSS sources from API
    await loadRssSources();

    setLoading(false);
  };

  const loadRssSources = async () => {
    try {
      const res = await fetch('/api/admin/rss-sources');
      const data = await res.json();
      if (data.sources) {
        setRssSources(data.sources);
      }
    } catch (error) {
      console.error('Failed to load RSS sources:', error);
    }
  };

  const handleAddFeed = async () => {
    if (!newFeed.city || !newFeed.name || !newFeed.feed_url) {
      setFeedError('All fields are required');
      return;
    }

    setAddingFeed(true);
    setFeedError(null);

    try {
      const res = await fetch('/api/admin/rss-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFeed),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedError(data.error || 'Failed to add feed');
        return;
      }

      // Refresh sources and reset form
      await loadRssSources();
      setNewFeed({ city: '', name: '', feed_url: '' });
      setShowAddFeed(false);
    } catch (error) {
      setFeedError('Failed to add feed');
    } finally {
      setAddingFeed(false);
    }
  };

  const handleToggleFeed = async (id: string, isActive: boolean) => {
    try {
      await fetch('/api/admin/rss-sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !isActive }),
      });
      await loadRssSources();
    } catch (error) {
      console.error('Failed to toggle feed:', error);
    }
  };

  const handleDeleteFeed = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

    try {
      await fetch(`/api/admin/rss-sources?id=${id}`, { method: 'DELETE' });
      await loadRssSources();
    } catch (error) {
      console.error('Failed to delete feed:', error);
    }
  };

  const cities = [...new Set(coverage.map(c => c.city))];
  const rssCities = [...new Set(rssSources.map(s => s.city))].sort();
  const filteredCoverage = selectedCity
    ? coverage.filter(c => c.city === selectedCity)
    : coverage;
  const filteredSources = selectedCity
    ? rssSources.filter(s => s.city === selectedCity)
    : rssSources;

  const stats = {
    total: coverage.length,
    good: coverage.filter(c => c.status === 'good').length,
    low: coverage.filter(c => c.status === 'low').length,
    none: coverage.filter(c => c.status === 'none').length,
  };

  if (loading) {
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

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin" className="text-xs text-neutral-400 hover:text-black mb-2 block">
            &larr; Admin
          </Link>
          <h1 className="text-2xl font-light">News Coverage Monitor</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Track which neighborhoods need more RSS feed sources
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-neutral-200 p-4">
            <div className="text-2xl font-light">{stats.total}</div>
            <div className="text-xs text-neutral-500 uppercase tracking-wide">Total Active</div>
          </div>
          <div className="bg-green-50 border border-green-200 p-4">
            <div className="text-2xl font-light text-green-700">{stats.good}</div>
            <div className="text-xs text-green-600 uppercase tracking-wide">Good (1+/day)</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 p-4">
            <div className="text-2xl font-light text-yellow-700">{stats.low}</div>
            <div className="text-xs text-yellow-600 uppercase tracking-wide">Low (&lt;1/day)</div>
          </div>
          <div className="bg-red-50 border border-red-200 p-4">
            <div className="text-2xl font-light text-red-700">{stats.none}</div>
            <div className="text-xs text-red-600 uppercase tracking-wide">None (7 days)</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 mb-6 border-b border-neutral-200">
          <button
            onClick={() => setActiveTab('coverage')}
            className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'coverage'
                ? 'border-black text-black'
                : 'border-transparent text-neutral-400 hover:text-black'
            }`}
          >
            Coverage by Neighborhood
          </button>
          <button
            onClick={() => setActiveTab('sources')}
            className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'sources'
                ? 'border-black text-black'
                : 'border-transparent text-neutral-400 hover:text-black'
            }`}
          >
            RSS Sources ({rssSources.length})
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Filter by city:</span>
            <select
              value={selectedCity || ''}
              onChange={(e) => setSelectedCity(e.target.value || null)}
              className="text-sm border border-neutral-200 px-2 py-1"
            >
              <option value="">All Cities</option>
              {(activeTab === 'coverage' ? cities : rssCities).map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
          {activeTab === 'sources' && (
            <button
              onClick={() => setShowAddFeed(!showAddFeed)}
              className="ml-auto text-xs bg-black text-white px-3 py-1.5 hover:bg-neutral-800"
            >
              + Add RSS Feed
            </button>
          )}
        </div>

        {/* Add Feed Form */}
        {showAddFeed && activeTab === 'sources' && (
          <div className="bg-white border border-neutral-200 p-4 mb-6">
            <h3 className="text-sm font-medium mb-3">Add New RSS Feed</h3>
            {feedError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2 mb-3">
                {feedError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={newFeed.city}
                onChange={(e) => setNewFeed({ ...newFeed, city: e.target.value })}
                className="text-sm border border-neutral-200 px-3 py-2"
              >
                <option value="">Select City...</option>
                {rssCities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
                <option value="__new__">+ Add New City</option>
              </select>
              {newFeed.city === '__new__' && (
                <input
                  type="text"
                  placeholder="New City Name"
                  onChange={(e) => setNewFeed({ ...newFeed, city: e.target.value })}
                  className="text-sm border border-neutral-200 px-3 py-2"
                />
              )}
              <input
                type="text"
                placeholder="Source Name (e.g., NY Times)"
                value={newFeed.name}
                onChange={(e) => setNewFeed({ ...newFeed, name: e.target.value })}
                className="text-sm border border-neutral-200 px-3 py-2"
              />
              <input
                type="url"
                placeholder="RSS Feed URL"
                value={newFeed.feed_url}
                onChange={(e) => setNewFeed({ ...newFeed, feed_url: e.target.value })}
                className="text-sm border border-neutral-200 px-3 py-2"
              />
              <button
                onClick={handleAddFeed}
                disabled={addingFeed}
                className="text-sm bg-black text-white px-4 py-2 hover:bg-neutral-800 disabled:opacity-50"
              >
                {addingFeed ? 'Adding...' : 'Add Feed'}
              </button>
            </div>
            <p className="text-xs text-neutral-400 mt-3">
              Tip: Find RSS feeds by adding /feed, /rss, or /rss.xml to news website URLs, or search "[site name] RSS feed"
            </p>
          </div>
        )}

        {/* Coverage Tab */}
        {activeTab === 'coverage' && (
          <div className="bg-white border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">Neighborhood</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">City</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase">7 Days</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase">30 Days</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase">Avg/Day</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">Last Article</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredCoverage.map((n) => (
                  <tr key={n.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      {n.status === 'good' && (
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Good coverage" />
                      )}
                      {n.status === 'low' && (
                        <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" title="Low coverage" />
                      )}
                      {n.status === 'none' && (
                        <span className="inline-block w-2 h-2 rounded-full bg-red-500" title="No coverage" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{n.name}</td>
                    <td className="px-4 py-3 text-neutral-500">{n.city}</td>
                    <td className="px-4 py-3 text-right">{n.article_count_7d}</td>
                    <td className="px-4 py-3 text-right">{n.article_count_30d}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={n.avg_per_day < 1 ? 'text-red-600' : ''}>
                        {n.avg_per_day.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {n.last_article_date
                        ? new Date(n.last_article_date).toLocaleDateString()
                        : <span className="text-red-500">Never</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sources Tab */}
        {activeTab === 'sources' && (
          <div className="bg-white border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">Active</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">City</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">Feed URL</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredSources.map((source) => (
                  <tr key={source.id} className={`hover:bg-neutral-50 ${!source.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleFeed(source.id, source.is_active)}
                        className={`w-8 h-5 rounded-full relative transition-colors ${
                          source.is_active ? 'bg-green-500' : 'bg-neutral-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                            source.is_active ? 'left-3.5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">{source.city}</td>
                    <td className="px-4 py-3 font-medium">{source.name}</td>
                    <td className="px-4 py-3">
                      <a
                        href={source.feed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-500 hover:text-black text-xs truncate block max-w-xs"
                      >
                        {source.feed_url}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDeleteFeed(source.id, source.name)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredSources.length === 0 && (
              <div className="text-center py-8 text-neutral-500">
                No RSS sources found. Add one above.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
