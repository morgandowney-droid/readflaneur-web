'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Ad } from '@/types';

interface AdWithAdvertiser extends Ad {
  advertiser?: {
    email: string;
  };
  neighborhood?: {
    name: string;
    city: string;
  };
}

export default function AdminAdsPage() {
  const router = useRouter();
  const [ads, setAds] = useState<AdWithAdvertiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending_review' | 'all'>('pending_review');

  useEffect(() => {
    loadAds();
  }, [filter]);

  async function loadAds() {
    try {
      const response = await fetch(`/api/admin/ads?filter=${filter}`);
      const data = await response.json();

      if (response.status === 401) {
        router.push('/login?redirect=/admin/ads');
        return;
      }

      if (response.status === 403) {
        router.push('/');
        return;
      }

      setAds(data.ads || []);
      setLoading(false);
    } catch (err) {
      console.error('Error loading ads:', err);
      router.push('/login?redirect=/admin/ads');
    }
  }

  const handleApprove = async (adId: string) => {
    setProcessingId(adId);

    try {
      const response = await fetch('/api/admin/ads/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adId, action: 'approve' }),
      });

      if (response.ok) {
        setAds(ads.filter(a => a.id !== adId));
      }
    } catch (error) {
      console.error('Approve error:', error);
    }

    setProcessingId(null);
  };

  const handleReject = async (adId: string) => {
    if (!rejectionReason.trim()) {
      return;
    }

    setProcessingId(adId);

    try {
      const response = await fetch('/api/admin/ads/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adId,
          action: 'reject',
          reason: rejectionReason,
        }),
      });

      if (response.ok) {
        setAds(ads.filter(a => a.id !== adId));
        setShowRejectModal(null);
        setRejectionReason('');
      }
    } catch (error) {
      console.error('Reject error:', error);
    }

    setProcessingId(null);
  };

  if (loading) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-6xl">
          <p className="text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  const pendingCount = ads.filter(a => a.status === 'pending_review').length;

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light">Ad Review</h1>
            <p className="text-neutral-500 mt-1">
              {pendingCount} ad{pendingCount !== 1 ? 's' : ''} pending review
            </p>
          </div>

          <div className="flex items-center gap-6">
            <Link
              href="/admin/articles"
              className="text-sm text-neutral-500 hover:text-black"
            >
              Articles
            </Link>
            <Link
              href="/admin/journalists"
              className="text-sm text-neutral-500 hover:text-black"
            >
              Journalists
            </Link>
            <Link
              href="/admin/newsletter"
              className="text-sm text-neutral-500 hover:text-black"
            >
              Newsletter
            </Link>
            <Link
              href="/admin/analytics"
              className="text-sm text-neutral-500 hover:text-black"
            >
              Analytics
            </Link>
            <div className="flex gap-2">
            <button
              onClick={() => setFilter('pending_review')}
              className={`px-4 py-2 text-sm tracking-widest uppercase ${
                filter === 'pending_review'
                  ? 'bg-black text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 text-sm tracking-widest uppercase ${
                filter === 'all'
                  ? 'bg-black text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              All
            </button>
            </div>
          </div>
        </div>

        {/* Metrics Legend */}
        <div className="bg-blue-50 border border-blue-200 p-4 mb-8">
          <p className="text-sm font-medium text-blue-900 mb-2">Advertiser Metrics Guide</p>
          <p className="text-xs text-blue-800 mb-3">
            Advertisers see qualitative labels instead of raw numbers. Here&apos;s what they mean:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-blue-800">
            <div><span className="font-medium">Gathering data</span> = &lt;10 impressions</div>
            <div><span className="font-medium">Reaching readers</span> = &lt;0.2% CTR</div>
            <div><span className="font-medium">Building awareness</span> = 0.2-0.5% CTR</div>
            <div><span className="font-medium">Good engagement</span> = 0.5-1% CTR</div>
            <div><span className="font-medium">Strong performance</span> = 1-2% CTR</div>
            <div><span className="font-medium">Excellent engagement</span> = 2%+ CTR</div>
          </div>
        </div>

        {ads.length === 0 ? (
          <div className="bg-white border border-neutral-200 p-12 text-center">
            <p className="text-neutral-600">
              {filter === 'pending_review'
                ? 'No ads pending review.'
                : 'No ads found.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {ads.map((ad) => (
              <div
                key={ad.id}
                className="bg-white border border-neutral-200 p-6"
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Ad Preview */}
                  <div>
                    <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                      Preview
                    </p>
                    <div className="border border-neutral-200">
                      <div className="px-3 py-2">
                        <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-400">
                          SPONSORED
                        </span>
                      </div>
                      <img
                        src={ad.image_url}
                        alt={ad.headline}
                        className="w-full aspect-video object-cover"
                      />
                      <div className="p-3">
                        <h3 className="font-semibold text-sm">{ad.headline}</h3>
                      </div>
                    </div>
                  </div>

                  {/* Ad Details */}
                  <div>
                    <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                      Details
                    </p>
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="text-neutral-400">Advertiser:</span>{' '}
                        {ad.advertiser?.email || 'Unknown'}
                      </div>
                      <div>
                        <span className="text-neutral-400">Targeting:</span>{' '}
                        {ad.is_global
                          ? 'Global (all neighborhoods)'
                          : ad.neighborhood
                            ? `${ad.neighborhood.name}, ${ad.neighborhood.city}`
                            : 'Unknown'}
                      </div>
                      <div>
                        <span className="text-neutral-400">Click URL:</span>{' '}
                        <a
                          href={ad.click_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline break-all"
                        >
                          {ad.click_url}
                        </a>
                      </div>
                      <div>
                        <span className="text-neutral-400">Submitted:</span>{' '}
                        {new Date(ad.created_at).toLocaleDateString()}
                      </div>
                      <div>
                        <span className="text-neutral-400">Placement:</span>{' '}
                        {ad.placement === 'story_open' ? 'Story Open' : 'Feed'}
                      </div>
                      <div>
                        <span
                          className={`inline-block px-2 py-1 text-xs tracking-widest uppercase ${
                            ad.status === 'pending_review'
                              ? 'bg-yellow-100 text-yellow-800'
                              : ad.status === 'approved'
                                ? 'bg-blue-100 text-blue-800'
                                : ad.status === 'active'
                                  ? 'bg-green-100 text-green-800'
                                  : ad.status === 'rejected'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {ad.status.replace('_', ' ')}
                        </span>
                      </div>
                      {(ad.status === 'active' || ad.status === 'paused') && (
                        <div className="pt-2 mt-2 border-t border-neutral-200">
                          <p className="text-neutral-400 mb-1">Performance:</p>
                          <p><span className="font-medium">{ad.impressions?.toLocaleString() || 0}</span> impressions</p>
                          <p><span className="font-medium">{ad.clicks?.toLocaleString() || 0}</span> clicks</p>
                          {ad.impressions > 0 && (
                            <p><span className="font-medium">{((ad.clicks / ad.impressions) * 100).toFixed(2)}%</span> CTR</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div>
                    <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                      Actions
                    </p>
                    {ad.status === 'pending_review' ? (
                      <div className="space-y-3">
                        <button
                          onClick={() => handleApprove(ad.id)}
                          disabled={processingId === ad.id}
                          className="w-full bg-green-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {processingId === ad.id ? 'Processing...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setShowRejectModal(ad.id)}
                          disabled={processingId === ad.id}
                          className="w-full bg-red-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <a
                          href={ad.click_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full border border-neutral-200 py-2 text-sm tracking-widest uppercase text-center hover:border-black transition-colors"
                        >
                          Visit Link
                        </a>
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-500">
                        {ad.status === 'rejected' && ad.rejection_reason && (
                          <span className="block mt-2 text-red-600">
                            Rejected: {ad.rejection_reason}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rejection Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 max-w-md w-full">
              <h2 className="text-lg font-medium mb-4">Reject Ad</h2>
              <p className="text-sm text-neutral-600 mb-4">
                Please provide a reason for rejection. This will be sent to the advertiser.
              </p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Image quality too low, Content doesn't meet our guidelines..."
                className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none mb-4"
                rows={3}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => handleReject(showRejectModal)}
                  disabled={!rejectionReason.trim() || processingId === showRejectModal}
                  className="flex-1 bg-red-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {processingId === showRejectModal ? 'Rejecting...' : 'Confirm Reject'}
                </button>
                <button
                  onClick={() => {
                    setShowRejectModal(null);
                    setRejectionReason('');
                  }}
                  className="px-6 py-2 border border-neutral-200 text-sm tracking-widest uppercase hover:border-black transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
