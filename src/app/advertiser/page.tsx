'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import type { Ad } from '@/types';

export default function AdvertiserDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingAdId, setUpdatingAdId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        console.log('Dashboard: Fetching data from API...');

        // Use server-side API to get user and ads (avoids client lock issues)
        const response = await fetch('/api/advertiser/ads');
        const data = await response.json();

        if (!mounted) return;

        if (response.status === 401 || !data.user) {
          console.log('Not authenticated, redirecting to login');
          router.push('/login?redirect=/advertiser');
          return;
        }

        console.log('Dashboard: Got user:', data.user.email);
        console.log('Dashboard: Got ads:', data.ads?.length || 0);

        setUser(data.user);
        setAds((data.ads as Ad[]) || []);
        setLoading(false);
      } catch (err) {
        console.error('Error loading dashboard:', err);
        if (mounted) {
          router.push('/login?redirect=/advertiser');
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [router]);

  const toggleAdStatus = async (ad: Ad) => {
    setUpdatingAdId(ad.id);

    try {
      const response = await fetch(`/api/advertiser/ads/${ad.id}/toggle`, {
        method: 'POST',
      });

      if (response.ok) {
        const { status: newStatus } = await response.json();
        setAds(ads.map(a =>
          a.id === ad.id ? { ...a, status: newStatus } : a
        ));
      }
    } catch (error) {
      console.error('Toggle error:', error);
    }

    setUpdatingAdId(null);
  };

  if (loading) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-5xl">
          <p className="text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const activeAds = ads.filter((ad) => ad.status === 'active');
  const pendingReviewAds = ads.filter((ad) => ad.status === 'pending_review');
  const approvedAds = ads.filter((ad) => ad.status === 'approved');
  const pausedAds = ads.filter((ad) => ad.status === 'paused');

  // Calculate qualitative performance indicator for an ad
  const getPerformanceIndicator = (ad: Ad) => {
    if (ad.status !== 'active' && ad.status !== 'paused') {
      return null;
    }

    const impressions = ad.impressions || 0;
    const clicks = ad.clicks || 0;

    // Not enough data yet
    if (impressions < 10) {
      return { label: 'Gathering data', color: 'text-neutral-400', icon: '◐' };
    }

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

    // CTR benchmarks for local advertising (typically 0.5-2% is good)
    if (ctr >= 2) {
      return { label: 'Excellent engagement', color: 'text-green-600', icon: '●' };
    } else if (ctr >= 1) {
      return { label: 'Strong performance', color: 'text-green-600', icon: '●' };
    } else if (ctr >= 0.5) {
      return { label: 'Good engagement', color: 'text-blue-600', icon: '●' };
    } else if (ctr >= 0.2) {
      return { label: 'Building awareness', color: 'text-neutral-500', icon: '●' };
    } else {
      return { label: 'Reaching readers', color: 'text-neutral-500', icon: '●' };
    }
  };

  // Count ads with good performance
  const performingWellCount = activeAds.filter(ad => {
    const impressions = ad.impressions || 0;
    const clicks = ad.clicks || 0;
    return impressions >= 10 && (clicks / impressions) >= 0.005;
  }).length;

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-light">Advertiser Dashboard</h1>
          <Link
            href="/advertiser/ads/new"
            className="bg-black text-white px-6 py-2 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors"
          >
            Create New Ad
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-white p-6 border border-neutral-200">
            <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Active
            </p>
            <p className="text-3xl font-light">{activeAds.length}</p>
          </div>
          <div className="bg-white p-6 border border-neutral-200">
            <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Paused
            </p>
            <p className="text-3xl font-light">{pausedAds.length}</p>
          </div>
          <div className="bg-white p-6 border border-neutral-200">
            <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Pending Review
            </p>
            <p className="text-3xl font-light">{pendingReviewAds.length}</p>
          </div>
          <div className="bg-white p-6 border border-neutral-200">
            <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Ready to Pay
            </p>
            <p className="text-3xl font-light">{approvedAds.length}</p>
          </div>
        </div>

        {/* Policy Notice */}
        <div className="bg-neutral-50 border border-neutral-200 p-4 mb-8">
          <p className="text-sm text-neutral-600">
            <strong>Note:</strong> All ad purchases are final and non-refundable. You may pause and resume ads at any time, but paused time counts toward your campaign duration.
          </p>
        </div>

        {/* Ads List */}
        <div>
          <h2 className="text-xs tracking-widest uppercase text-neutral-400 mb-4">
            Your Ads
          </h2>

          {ads.length === 0 ? (
            <div className="bg-white border border-neutral-200 p-12 text-center">
              <p className="text-neutral-600 mb-4">You haven&apos;t created any ads yet.</p>
              <Link
                href="/advertiser/ads/new"
                className="inline-block bg-black text-white px-6 py-2 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors"
              >
                Create Your First Ad
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {ads.map((ad) => (
                <div
                  key={ad.id}
                  className="bg-white border border-neutral-200 p-6"
                >
                  <div className="flex items-center gap-6">
                    <img
                      src={ad.image_url}
                      alt={ad.headline}
                      className="w-28 h-20 object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{ad.headline}</h3>
                      <p className="text-sm text-neutral-400">
                        {ad.is_global ? 'Global' : ad.neighborhood_id}
                      </p>
                      {ad.start_date && ad.end_date && (
                        <p className="text-xs text-neutral-400 mt-1">
                          {new Date(ad.start_date).toLocaleDateString()} - {new Date(ad.end_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span
                        className={`inline-block px-3 py-1 text-xs tracking-widest uppercase ${
                          ad.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : ad.status === 'pending_review'
                              ? 'bg-yellow-100 text-yellow-800'
                              : ad.status === 'approved'
                                ? 'bg-blue-100 text-blue-800'
                                : ad.status === 'paused'
                                  ? 'bg-orange-100 text-orange-800'
                                  : ad.status === 'rejected'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {ad.status === 'pending_review' ? 'Pending Review' : ad.status}
                      </span>
                      {getPerformanceIndicator(ad) && (
                        <p className={`text-sm mt-2 ${getPerformanceIndicator(ad)!.color}`}>
                          <span className="mr-1">{getPerformanceIndicator(ad)!.icon}</span>
                          {getPerformanceIndicator(ad)!.label}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-4 border-t border-neutral-100 flex flex-wrap gap-4">
                    {ad.status === 'pending_review' && (
                      <span className="text-sm text-yellow-700">
                        Under review - you&apos;ll receive an email when approved
                      </span>
                    )}
                    {ad.status === 'approved' && (
                      <Link
                        href={`/advertiser/ads/${ad.id}/pay`}
                        className="text-sm tracking-widest uppercase text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Complete Payment
                      </Link>
                    )}
                    {ad.status === 'rejected' && (
                      <span className="text-sm text-red-600">
                        Rejected: {ad.rejection_reason || 'Does not meet guidelines'}
                      </span>
                    )}
                    {(ad.status === 'active' || ad.status === 'paused') && (
                      <button
                        onClick={() => toggleAdStatus(ad)}
                        disabled={updatingAdId === ad.id}
                        className={`text-sm tracking-widest uppercase transition-colors disabled:opacity-50 ${
                          ad.status === 'active'
                            ? 'text-orange-600 hover:text-orange-800'
                            : 'text-green-600 hover:text-green-800'
                        }`}
                      >
                        {updatingAdId === ad.id
                          ? 'Updating...'
                          : ad.status === 'active'
                            ? 'Pause Ad'
                            : 'Resume Ad'
                        }
                      </button>
                    )}
                    {ad.status !== 'rejected' && (
                      <Link
                        href={`/advertiser/ads/${ad.id}/edit`}
                        className="text-sm tracking-widest uppercase text-neutral-400 hover:text-black transition-colors"
                      >
                        Edit
                      </Link>
                    )}
                    <a
                      href={ad.click_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm tracking-widest uppercase text-neutral-400 hover:text-black transition-colors"
                    >
                      View Landing Page
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
