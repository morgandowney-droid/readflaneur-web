'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Analytics {
  revenueByPeriod: {
    thisMonth: number;
    last3Months: number;
    last6Months: number;
    last9Months: number;
    last12Months: number;
    last24Months: number;
    allTime: number;
  };
  topAdvertisers: Array<{
    id: string;
    email: string;
    name: string | null;
    total: number;
    orderCount: number;
  }>;
  topNeighborhoods: Array<{
    id: string;
    name: string;
    city: string;
    total: number;
    orderCount: number;
  }>;
  recentOrders: Array<{
    id: string;
    amount: number;
    paidAt: string;
    advertiser: string;
    adHeadline: string;
    neighborhood: string;
  }>;
  totalOrders: number;
  topArticles: Array<{
    id: string;
    headline: string;
    views: number;
    neighborhood: string;
    author: string;
    publishedAt: string;
  }>;
  neighborhoodViews: Array<{
    id: string;
    name: string;
    city: string;
    views: number;
    articleCount: number;
  }>;
  authorViews: Array<{
    id: string;
    name: string;
    email: string;
    views: number;
    articleCount: number;
  }>;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'revenue' | 'content'>('revenue');

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const response = await fetch('/api/admin/analytics');
        const data = await response.json();

        if (response.status === 401) {
          router.push('/login?redirect=/admin/analytics');
          return;
        }

        if (response.status === 403) {
          router.push('/');
          return;
        }

        setAnalytics(data);
        setLoading(false);
      } catch (err) {
        console.error('Error loading analytics:', err);
        router.push('/login?redirect=/admin/analytics');
      }
    }

    loadAnalytics();
  }, [router]);

  if (loading) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-6xl">
          <p className="text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light">Analytics Dashboard</h1>
            <p className="text-neutral-500 mt-1">
              Financial and content performance metrics
            </p>
          </div>
          <Link
            href="/admin/ads"
            className="text-sm text-neutral-500 hover:text-white"
          >
            &larr; Back to Ad Review
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab('revenue')}
            className={`px-4 py-2 text-sm tracking-widest uppercase ${
              activeTab === 'revenue'
                ? 'bg-black text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            Revenue
          </button>
          <button
            onClick={() => setActiveTab('content')}
            className={`px-4 py-2 text-sm tracking-widest uppercase ${
              activeTab === 'content'
                ? 'bg-black text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            Content
          </button>
        </div>

        {activeTab === 'revenue' && (
          <>
            {/* Revenue by Time Period */}
            <div className="mb-12">
              <h2 className="text-xs tracking-widest uppercase text-neutral-400 mb-4">
                Revenue by Time Period
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div className="bg-surface p-6 border border-white/[0.08]">
                  <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                    This Month
                  </p>
                  <p className="text-2xl font-light">{formatCurrency(analytics.revenueByPeriod.thisMonth)}</p>
                </div>
                <div className="bg-surface p-6 border border-white/[0.08]">
                  <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                    Last 3 Months
                  </p>
                  <p className="text-2xl font-light">{formatCurrency(analytics.revenueByPeriod.last3Months)}</p>
                </div>
                <div className="bg-surface p-6 border border-white/[0.08]">
                  <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                    Last 6 Months
                  </p>
                  <p className="text-2xl font-light">{formatCurrency(analytics.revenueByPeriod.last6Months)}</p>
                </div>
                <div className="bg-surface p-6 border border-white/[0.08]">
                  <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                    Last 9 Months
                  </p>
                  <p className="text-2xl font-light">{formatCurrency(analytics.revenueByPeriod.last9Months)}</p>
                </div>
                <div className="bg-surface p-6 border border-white/[0.08]">
                  <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                    Last 12 Months
                  </p>
                  <p className="text-2xl font-light">{formatCurrency(analytics.revenueByPeriod.last12Months)}</p>
                </div>
                <div className="bg-surface p-6 border border-white/[0.08]">
                  <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                    Last 24 Months
                  </p>
                  <p className="text-2xl font-light">{formatCurrency(analytics.revenueByPeriod.last24Months)}</p>
                </div>
                <div className="bg-surface p-6 border border-amber-600">
                  <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                    All Time
                  </p>
                  <p className="text-2xl font-light">{formatCurrency(analytics.revenueByPeriod.allTime)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
              {/* Top Advertisers */}
              <div>
                <h2 className="text-xs tracking-widest uppercase text-neutral-400 mb-4">
                  Revenue by Advertiser
                </h2>
                <div className="bg-surface border border-white/[0.08]">
                  {analytics.topAdvertisers.length === 0 ? (
                    <p className="p-6 text-neutral-400">No advertisers yet</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/[0.08]">
                          <th className="text-left p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Advertiser</th>
                          <th className="text-right p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Orders</th>
                          <th className="text-right p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.topAdvertisers.slice(0, 10).map((advertiser) => (
                          <tr key={advertiser.id} className="border-b border-white/[0.06] last:border-0">
                            <td className="p-4">
                              <p className="font-medium">{advertiser.name || advertiser.email}</p>
                              {advertiser.name && <p className="text-xs text-neutral-400">{advertiser.email}</p>}
                            </td>
                            <td className="p-4 text-right text-neutral-400">{advertiser.orderCount}</td>
                            <td className="p-4 text-right font-medium">{formatCurrency(advertiser.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Revenue by Neighborhood */}
              <div>
                <h2 className="text-xs tracking-widest uppercase text-neutral-400 mb-4">
                  Revenue by Neighborhood
                </h2>
                <div className="bg-surface border border-white/[0.08]">
                  {analytics.topNeighborhoods.length === 0 ? (
                    <p className="p-6 text-neutral-400">No revenue data yet</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/[0.08]">
                          <th className="text-left p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Neighborhood</th>
                          <th className="text-right p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Ads</th>
                          <th className="text-right p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.topNeighborhoods.slice(0, 10).map((neighborhood) => (
                          <tr key={neighborhood.id} className="border-b border-white/[0.06] last:border-0">
                            <td className="p-4">
                              <p className="font-medium">{neighborhood.name}</p>
                              {neighborhood.city && <p className="text-xs text-neutral-400">{neighborhood.city}</p>}
                            </td>
                            <td className="p-4 text-right text-neutral-400">{neighborhood.orderCount}</td>
                            <td className="p-4 text-right font-medium">{formatCurrency(neighborhood.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Orders */}
            <div>
              <h2 className="text-xs tracking-widest uppercase text-neutral-400 mb-4">
                Recent Orders
              </h2>
              <div className="bg-surface border border-white/[0.08]">
                {analytics.recentOrders.length === 0 ? (
                  <p className="p-6 text-neutral-400">No orders yet</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/[0.08]">
                        <th className="text-left p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Date</th>
                        <th className="text-left p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Advertiser</th>
                        <th className="text-left p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Ad</th>
                        <th className="text-left p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Targeting</th>
                        <th className="text-right p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.recentOrders.map((order) => (
                        <tr key={order.id} className="border-b border-white/[0.06] last:border-0">
                          <td className="p-4 text-neutral-400">{formatDate(order.paidAt)}</td>
                          <td className="p-4">{order.advertiser}</td>
                          <td className="p-4 max-w-xs truncate">{order.adHeadline}</td>
                          <td className="p-4 text-neutral-400">{order.neighborhood}</td>
                          <td className="p-4 text-right font-medium">{formatCurrency(order.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'content' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
              {/* Views by Neighborhood */}
              <div>
                <h2 className="text-xs tracking-widest uppercase text-neutral-400 mb-4">
                  Views by Neighborhood
                </h2>
                <div className="bg-surface border border-white/[0.08]">
                  {analytics.neighborhoodViews.length === 0 ? (
                    <p className="p-6 text-neutral-400">No view data yet</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/[0.08]">
                          <th className="text-left p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Neighborhood</th>
                          <th className="text-right p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Articles</th>
                          <th className="text-right p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Views</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.neighborhoodViews.slice(0, 10).map((neighborhood) => (
                          <tr key={neighborhood.id} className="border-b border-white/[0.06] last:border-0">
                            <td className="p-4">
                              <p className="font-medium">{neighborhood.name}</p>
                              <p className="text-xs text-neutral-400">{neighborhood.city}</p>
                            </td>
                            <td className="p-4 text-right text-neutral-400">{neighborhood.articleCount}</td>
                            <td className="p-4 text-right font-medium">{neighborhood.views.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Views by Author */}
              <div>
                <h2 className="text-xs tracking-widest uppercase text-neutral-400 mb-4">
                  Views by Journalist
                </h2>
                <div className="bg-surface border border-white/[0.08]">
                  {analytics.authorViews.length === 0 ? (
                    <p className="p-6 text-neutral-400">No view data yet</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/[0.08]">
                          <th className="text-left p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Journalist</th>
                          <th className="text-right p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Articles</th>
                          <th className="text-right p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Views</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.authorViews.slice(0, 10).map((author) => (
                          <tr key={author.id} className="border-b border-white/[0.06] last:border-0">
                            <td className="p-4">
                              <p className="font-medium">{author.name}</p>
                              <p className="text-xs text-neutral-400">{author.email}</p>
                            </td>
                            <td className="p-4 text-right text-neutral-400">{author.articleCount}</td>
                            <td className="p-4 text-right font-medium">{author.views.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Top Articles */}
            <div>
              <h2 className="text-xs tracking-widest uppercase text-neutral-400 mb-4">
                Top Articles by Views
              </h2>
              <div className="bg-surface border border-white/[0.08]">
                {analytics.topArticles.length === 0 ? (
                  <p className="p-6 text-neutral-400">No articles yet</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/[0.08]">
                        <th className="text-left p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Article</th>
                        <th className="text-left p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Neighborhood</th>
                        <th className="text-left p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Author</th>
                        <th className="text-left p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Published</th>
                        <th className="text-right p-4 text-xs tracking-widest uppercase text-neutral-400 font-normal">Views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.topArticles.slice(0, 20).map((article) => (
                        <tr key={article.id} className="border-b border-white/[0.06] last:border-0">
                          <td className="p-4 max-w-xs">
                            <p className="font-medium truncate">{article.headline}</p>
                          </td>
                          <td className="p-4 text-neutral-400">{article.neighborhood}</td>
                          <td className="p-4 text-neutral-400">{article.author}</td>
                          <td className="p-4 text-neutral-400">{formatDate(article.publishedAt)}</td>
                          <td className="p-4 text-right font-medium">{article.views.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
