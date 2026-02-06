'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Ad } from '@/types';

type FilterType = 'pending_review' | 'needs_design' | 'active' | 'all';

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
  const [filter, setFilter] = useState<FilterType>('pending_review');
  const [editedHeadlines, setEditedHeadlines] = useState<Record<string, string>>({});
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

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

      const loaded: AdWithAdvertiser[] = data.ads || [];
      setAds(loaded);

      // Pre-populate editable fields
      const headlines: Record<string, string> = {};
      const notes: Record<string, string> = {};
      loaded.forEach((ad) => {
        headlines[ad.id] = ad.headline || '';
        notes[ad.id] = ad.admin_notes || '';
      });
      setEditedHeadlines(headlines);
      setAdminNotes(notes);
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
        body: JSON.stringify({
          adId,
          action: 'approve',
          headline: editedHeadlines[adId] || undefined,
          adminNotes: adminNotes[adId] || undefined,
        }),
      });

      if (response.ok) {
        // Remove from pending list, or reload if viewing all/active
        if (filter === 'pending_review' || filter === 'needs_design') {
          setAds(ads.filter(a => a.id !== adId));
        } else {
          loadAds();
        }
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
          adminNotes: adminNotes[adId] || undefined,
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

  const filters: { key: FilterType; label: string }[] = [
    { key: 'pending_review', label: 'Pending' },
    { key: 'needs_design', label: 'Needs Design' },
    { key: 'active', label: 'Active' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light">Ad Review</h1>
            <p className="text-neutral-500 mt-1">
              {filter === 'pending_review'
                ? `${pendingCount} ad${pendingCount !== 1 ? 's' : ''} pending review`
                : `${ads.length} ad${ads.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="text-sm text-neutral-500 hover:text-black"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/articles"
              className="text-sm text-neutral-500 hover:text-black"
            >
              Articles
            </Link>
            <div className="flex gap-1">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-2 text-xs tracking-widest uppercase ${
                    filter === f.key
                      ? 'bg-black text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
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
                : filter === 'needs_design'
                  ? 'No ads needing design service.'
                  : filter === 'active'
                    ? 'No active ads.'
                    : 'No ads found.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {ads.map((ad) => (
              <div
                key={ad.id}
                className={`bg-white border p-6 ${
                  ad.needs_design_service
                    ? 'border-amber-300'
                    : 'border-neutral-200'
                }`}
              >
                {/* Badges row */}
                <div className="flex items-center gap-2 mb-4">
                  {ad.passionfroot_order_id && (
                    <span className="inline-block px-2 py-0.5 text-[10px] tracking-widest uppercase bg-purple-100 text-purple-800">
                      Passionfroot
                    </span>
                  )}
                  {!ad.passionfroot_order_id && (
                    <span className="inline-block px-2 py-0.5 text-[10px] tracking-widest uppercase bg-neutral-100 text-neutral-600">
                      Direct
                    </span>
                  )}
                  {ad.needs_design_service && (
                    <span className="inline-block px-2 py-0.5 text-[10px] tracking-widest uppercase bg-amber-100 text-amber-800 font-medium">
                      Needs Design
                    </span>
                  )}
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] tracking-widest uppercase ${
                      ad.status === 'pending_review'
                        ? 'bg-yellow-100 text-yellow-800'
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
                      {ad.image_url ? (
                        <img
                          src={ad.image_url}
                          alt={ad.headline}
                          className="w-full aspect-video object-cover"
                        />
                      ) : (
                        <div className="w-full aspect-video bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm">
                          No image yet
                        </div>
                      )}
                      <div className="p-3">
                        <h3 className="font-semibold text-sm">
                          {editedHeadlines[ad.id] || ad.headline || '(no headline)'}
                        </h3>
                      </div>
                    </div>
                  </div>

                  {/* Ad Details + Inline Editing */}
                  <div>
                    <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                      Details
                    </p>
                    <div className="space-y-3 text-sm">
                      {/* Client info (Passionfroot) */}
                      {ad.client_name && (
                        <div>
                          <span className="text-neutral-400">Client:</span>{' '}
                          {ad.client_name}
                          {ad.client_email && (
                            <span className="text-neutral-400"> ({ad.client_email})</span>
                          )}
                        </div>
                      )}
                      <div>
                        <span className="text-neutral-400">Advertiser:</span>{' '}
                        {ad.advertiser?.email || ad.client_email || 'Unknown'}
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
                        {ad.click_url ? (
                          <a
                            href={ad.click_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline break-all"
                          >
                            {ad.click_url}
                          </a>
                        ) : (
                          <span className="text-neutral-300 italic">Not provided</span>
                        )}
                      </div>
                      <div>
                        <span className="text-neutral-400">Submitted:</span>{' '}
                        {new Date(ad.created_at).toLocaleDateString()}
                      </div>
                      <div>
                        <span className="text-neutral-400">Placement:</span>{' '}
                        {ad.placement === 'story_open' ? 'Story Open' : 'Feed'}
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

                      {/* Inline headline edit (for pending ads) */}
                      {ad.status === 'pending_review' && (
                        <div className="pt-3 mt-3 border-t border-neutral-200">
                          <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-1">
                            Headline (editable)
                          </label>
                          <textarea
                            value={editedHeadlines[ad.id] ?? ''}
                            onChange={(e) =>
                              setEditedHeadlines({
                                ...editedHeadlines,
                                [ad.id]: e.target.value,
                              })
                            }
                            placeholder="Enter or edit the ad headline..."
                            className="w-full px-3 py-2 border border-neutral-200 focus:border-black focus:outline-none text-sm"
                            rows={2}
                          />
                        </div>
                      )}

                      {/* Admin notes */}
                      {ad.status === 'pending_review' && (
                        <div>
                          <label className="block text-xs tracking-widest uppercase text-neutral-400 mb-1">
                            Admin Notes (internal)
                          </label>
                          <textarea
                            value={adminNotes[ad.id] ?? ''}
                            onChange={(e) =>
                              setAdminNotes({
                                ...adminNotes,
                                [ad.id]: e.target.value,
                              })
                            }
                            placeholder="Internal notes (not shown to advertiser)..."
                            className="w-full px-3 py-2 border border-neutral-200 focus:border-black focus:outline-none text-sm"
                            rows={2}
                          />
                        </div>
                      )}
                      {/* Show read-only notes for non-pending ads */}
                      {ad.status !== 'pending_review' && ad.admin_notes && (
                        <div className="pt-2 mt-2 border-t border-neutral-200">
                          <p className="text-xs tracking-widest uppercase text-neutral-400 mb-1">Admin Notes</p>
                          <p className="text-sm text-neutral-600 whitespace-pre-wrap">{ad.admin_notes}</p>
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
                          {processingId === ad.id ? 'Processing...' : 'Approve & Go Live'}
                        </button>
                        <button
                          onClick={() => setShowRejectModal(ad.id)}
                          disabled={processingId === ad.id}
                          className="w-full bg-red-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                        {ad.click_url && (
                          <a
                            href={ad.click_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full border border-neutral-200 py-2 text-sm tracking-widest uppercase text-center hover:border-black transition-colors"
                          >
                            Visit Link
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-neutral-500">
                        {ad.status === 'rejected' && ad.rejection_reason && (
                          <span className="block text-red-600">
                            Rejected: {ad.rejection_reason}
                          </span>
                        )}
                        {ad.status === 'active' && (
                          <span className="block text-green-700">
                            Live
                          </span>
                        )}
                      </div>
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
