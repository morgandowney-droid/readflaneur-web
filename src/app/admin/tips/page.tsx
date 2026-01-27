'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Tip, TipStatus } from '@/types';

interface TipWithRelations extends Omit<Tip, 'neighborhood' | 'user' | 'reviewer'> {
  neighborhood?: {
    id: string;
    name: string;
    city: string;
  };
  user?: {
    id: string;
    email: string;
    full_name?: string;
  };
  reviewer?: {
    id: string;
    email: string;
    full_name?: string;
  };
}

type FilterStatus = TipStatus | 'all';

export default function AdminTipsPage() {
  const router = useRouter();
  const [tips, setTips] = useState<TipWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [expandedTip, setExpandedTip] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadTips();
  }, [filter]);

  async function loadTips() {
    try {
      const statusParam = filter === 'all' ? '' : `status=${filter}`;
      const response = await fetch(`/api/admin/tips?${statusParam}`);
      const data = await response.json();

      if (response.status === 401) {
        router.push('/login?redirect=/admin/tips');
        return;
      }

      if (response.status === 403) {
        router.push('/');
        return;
      }

      setTips(data.tips || []);
      setTotal(data.total || 0);
      setLoading(false);
    } catch (err) {
      console.error('Error loading tips:', err);
      router.push('/login?redirect=/admin/tips');
    }
  }

  const handleAction = async (tipId: string, action: TipStatus) => {
    if (action === 'rejected' && !rejectionReason.trim()) {
      return;
    }

    setProcessingId(tipId);

    try {
      const response = await fetch('/api/admin/tips/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipId,
          action,
          rejectionReason: action === 'rejected' ? rejectionReason : undefined,
          reviewerNotes: reviewerNotes || undefined,
        }),
      });

      if (response.ok) {
        // Update local state
        setTips(tips.map(t =>
          t.id === tipId ? { ...t, status: action } : t
        ));
        setShowRejectModal(null);
        setRejectionReason('');
        setReviewerNotes('');
      }
    } catch (error) {
      console.error('Action error:', error);
    }

    setProcessingId(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  const statusCounts = tips.reduce((acc, tip) => {
    acc[tip.status] = (acc[tip.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pendingCount = statusCounts['pending'] || 0;

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light">Tip Review</h1>
            <p className="text-neutral-500 mt-1">
              {pendingCount} tip{pendingCount !== 1 ? 's' : ''} pending review ({total} total)
            </p>
          </div>

          <div className="flex items-center gap-6">
            <Link
              href="/admin/ads"
              className="text-sm text-neutral-500 hover:text-black"
            >
              Ads
            </Link>
            <Link
              href="/admin/articles"
              className="text-sm text-neutral-500 hover:text-black"
            >
              Articles
            </Link>
            <Link
              href="/admin/comments"
              className="text-sm text-neutral-500 hover:text-black"
            >
              Comments
            </Link>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {(['all', 'pending', 'under_review', 'approved', 'rejected', 'converted'] as FilterStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 text-sm tracking-widest uppercase ${
                filter === status
                  ? 'bg-black text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {status.replace('_', ' ')}
              {status !== 'all' && statusCounts[status] ? ` (${statusCounts[status]})` : ''}
            </button>
          ))}
        </div>

        {tips.length === 0 ? (
          <div className="bg-white border border-neutral-200 p-12 text-center">
            <p className="text-neutral-600">
              {filter === 'pending'
                ? 'No tips pending review.'
                : `No ${filter === 'all' ? '' : filter.replace('_', ' ') + ' '}tips found.`}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {tips.map((tip) => (
              <div
                key={tip.id}
                className="bg-white border border-neutral-200 p-6"
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Tip Content */}
                  <div className="lg:col-span-2">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className={`inline-block px-2 py-1 text-xs tracking-widest uppercase mr-2 ${
                          tip.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : tip.status === 'under_review'
                              ? 'bg-blue-100 text-blue-800'
                              : tip.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : tip.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-purple-100 text-purple-800'
                        }`}>
                          {tip.status.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-neutral-400">
                          {tip.neighborhood?.name}, {tip.neighborhood?.city}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-400">
                        {formatDate(tip.created_at)}
                      </span>
                    </div>

                    {tip.headline && (
                      <h3 className="font-medium mb-2">{tip.headline}</h3>
                    )}

                    <p className="text-sm text-neutral-700 whitespace-pre-wrap">
                      {expandedTip === tip.id
                        ? tip.content
                        : tip.content.length > 300
                          ? tip.content.substring(0, 300) + '...'
                          : tip.content}
                    </p>

                    {tip.content.length > 300 && (
                      <button
                        onClick={() => setExpandedTip(expandedTip === tip.id ? null : tip.id)}
                        className="text-sm text-blue-600 hover:underline mt-2"
                      >
                        {expandedTip === tip.id ? 'Show less' : 'Read more'}
                      </button>
                    )}

                    {/* Photos */}
                    {tip.photo_urls && tip.photo_urls.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                          Photos ({tip.photo_urls.length})
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {tip.photo_urls.map((url, index) => (
                            <a
                              key={index}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block"
                            >
                              <img
                                src={url}
                                alt={`Photo ${index + 1}`}
                                className="w-24 h-24 object-cover border border-neutral-200 hover:border-black transition-colors"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Submitter Info */}
                    <div className="mt-4 pt-4 border-t border-neutral-100">
                      <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                        Submitter
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-neutral-400">Name:</span>{' '}
                          {tip.submitter_name || (tip.user?.full_name || 'Anonymous')}
                        </div>
                        <div>
                          <span className="text-neutral-400">Email:</span>{' '}
                          {tip.submitter_email || tip.user?.email || 'Not provided'}
                        </div>
                        {tip.submitter_phone && (
                          <div>
                            <span className="text-neutral-400">Phone:</span>{' '}
                            {tip.submitter_phone}
                          </div>
                        )}
                        <div>
                          <span className="text-neutral-400">Credit:</span>{' '}
                          {tip.credit_preference.replace('_', ' ')}
                        </div>
                      </div>
                    </div>

                    {/* Device/Location Info (collapsible) */}
                    <details className="mt-4 pt-4 border-t border-neutral-100">
                      <summary className="text-xs tracking-widest uppercase text-neutral-400 cursor-pointer hover:text-neutral-600">
                        Device & Location Data
                      </summary>
                      <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                        {tip.gps_latitude && tip.gps_longitude && (
                          <div className="col-span-2">
                            <span className="text-neutral-400">GPS:</span>{' '}
                            <a
                              href={`https://www.google.com/maps?q=${tip.gps_latitude},${tip.gps_longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {tip.gps_latitude.toFixed(6)}, {tip.gps_longitude.toFixed(6)}
                            </a>
                            {tip.gps_accuracy && (
                              <span className="text-neutral-400 ml-1">
                                (±{Math.round(tip.gps_accuracy)}m)
                              </span>
                            )}
                          </div>
                        )}
                        <div>
                          <span className="text-neutral-400">Device:</span>{' '}
                          {tip.device_type || 'Unknown'}
                        </div>
                        <div>
                          <span className="text-neutral-400">Browser:</span>{' '}
                          {tip.browser || 'Unknown'}
                        </div>
                        <div>
                          <span className="text-neutral-400">OS:</span>{' '}
                          {tip.os || 'Unknown'}
                        </div>
                        <div>
                          <span className="text-neutral-400">Timezone:</span>{' '}
                          {tip.timezone || 'Unknown'}
                        </div>
                        {tip.screen_resolution && (
                          <div>
                            <span className="text-neutral-400">Screen:</span>{' '}
                            {tip.screen_resolution}
                          </div>
                        )}
                        {tip.language && (
                          <div>
                            <span className="text-neutral-400">Language:</span>{' '}
                            {tip.language}
                          </div>
                        )}
                        <div className="col-span-2">
                          <span className="text-neutral-400">IP Hash:</span>{' '}
                          <code className="text-xs bg-neutral-100 px-1">
                            {tip.ip_address_hash?.substring(0, 16)}...
                          </code>
                        </div>
                      </div>
                    </details>

                    {/* Review notes if any */}
                    {tip.reviewer_notes && (
                      <div className="mt-4 pt-4 border-t border-neutral-100">
                        <p className="text-xs tracking-widest uppercase text-neutral-400 mb-1">
                          Reviewer Notes
                        </p>
                        <p className="text-sm text-neutral-600">{tip.reviewer_notes}</p>
                      </div>
                    )}

                    {tip.rejection_reason && (
                      <div className="mt-4 pt-4 border-t border-neutral-100">
                        <p className="text-xs tracking-widest uppercase text-red-400 mb-1">
                          Rejection Reason
                        </p>
                        <p className="text-sm text-red-600">{tip.rejection_reason}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div>
                    <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
                      Actions
                    </p>
                    {tip.status === 'pending' || tip.status === 'under_review' ? (
                      <div className="space-y-3">
                        {tip.status === 'pending' && (
                          <button
                            onClick={() => handleAction(tip.id, 'under_review')}
                            disabled={processingId === tip.id}
                            className="w-full bg-blue-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-blue-700 transition-colors disabled:opacity-50"
                          >
                            {processingId === tip.id ? 'Processing...' : 'Mark Under Review'}
                          </button>
                        )}
                        <button
                          onClick={() => handleAction(tip.id, 'approved')}
                          disabled={processingId === tip.id}
                          className="w-full bg-green-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {processingId === tip.id ? 'Processing...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setShowRejectModal(tip.id)}
                          disabled={processingId === tip.id}
                          className="w-full bg-red-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleAction(tip.id, 'converted')}
                          disabled={processingId === tip.id}
                          className="w-full bg-purple-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-purple-700 transition-colors disabled:opacity-50"
                        >
                          Mark as Converted
                        </button>

                        {/* Notes input */}
                        <div className="pt-3 border-t border-neutral-200">
                          <label className="text-xs text-neutral-500 mb-1 block">
                            Add reviewer notes (optional)
                          </label>
                          <textarea
                            value={reviewerNotes}
                            onChange={(e) => setReviewerNotes(e.target.value)}
                            placeholder="Internal notes..."
                            className="w-full px-3 py-2 border border-neutral-200 text-sm focus:border-black focus:outline-none"
                            rows={2}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 text-sm text-neutral-500">
                        <p>
                          Reviewed by {tip.reviewer?.full_name || tip.reviewer?.email || 'Unknown'}
                        </p>
                        {tip.reviewed_at && (
                          <p>{formatDate(tip.reviewed_at)}</p>
                        )}

                        {/* Allow changing status even after review */}
                        <div className="pt-3 border-t border-neutral-200">
                          <p className="text-xs text-neutral-400 mb-2">Change status:</p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handleAction(tip.id, 'pending')}
                              disabled={processingId === tip.id}
                              className="px-3 py-1 text-xs border border-neutral-200 hover:border-black"
                            >
                              Pending
                            </button>
                            <button
                              onClick={() => handleAction(tip.id, 'approved')}
                              disabled={processingId === tip.id}
                              className="px-3 py-1 text-xs border border-neutral-200 hover:border-black"
                            >
                              Approved
                            </button>
                            <button
                              onClick={() => handleAction(tip.id, 'converted')}
                              disabled={processingId === tip.id}
                              className="px-3 py-1 text-xs border border-neutral-200 hover:border-black"
                            >
                              Converted
                            </button>
                          </div>
                        </div>
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
              <h2 className="text-lg font-medium mb-4">Reject Tip</h2>
              <p className="text-sm text-neutral-600 mb-4">
                Please provide a reason for rejection. This will be sent to the submitter if they provided an email.
              </p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Unable to verify information, Content doesn't meet our guidelines..."
                className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none mb-4"
                rows={3}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => handleAction(showRejectModal, 'rejected')}
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
