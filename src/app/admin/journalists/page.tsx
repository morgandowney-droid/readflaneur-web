'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Application {
  id: string;
  user_id: string;
  neighborhood_id: string;
  zip_code: string;
  phone: string;
  bio: string;
  why_interested: string | null;
  photo_url_1: string;
  photo_url_2: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  user?: {
    email: string;
    full_name: string | null;
  };
  neighborhood?: {
    name: string;
    city: string;
  };
}

export default function AdminJournalistsPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    try {
      const response = await fetch('/api/admin/journalists');
      const data = await response.json();

      if (response.status === 401) {
        router.push('/login?redirect=/admin/journalists');
        return;
      }

      if (response.status === 403) {
        router.push('/');
        return;
      }

      setApplications(data.applications || []);
      setLoading(false);
    } catch (err) {
      console.error('Error loading applications:', err);
      router.push('/login?redirect=/admin/journalists');
    }
  }

  const handleApprove = async (applicationId: string) => {
    setProcessingId(applicationId);

    try {
      const response = await fetch('/api/admin/journalists/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, action: 'approve' }),
      });

      if (response.ok) {
        setApplications(applications.map(a =>
          a.id === applicationId ? { ...a, status: 'approved' as const } : a
        ));
      }
    } catch (error) {
      console.error('Approve error:', error);
    }

    setProcessingId(null);
  };

  const handleReject = async (applicationId: string) => {
    setProcessingId(applicationId);

    try {
      const response = await fetch('/api/admin/journalists/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          action: 'reject',
          reason: rejectionReason,
        }),
      });

      if (response.ok) {
        setApplications(applications.map(a =>
          a.id === applicationId ? { ...a, status: 'rejected' as const, rejection_reason: rejectionReason } : a
        ));
        setShowRejectModal(null);
        setRejectionReason('');
      }
    } catch (error) {
      console.error('Reject error:', error);
    }

    setProcessingId(null);
  };

  const filteredApplications = filter === 'pending'
    ? applications.filter(a => a.status === 'pending')
    : applications;

  const pendingCount = applications.filter(a => a.status === 'pending').length;

  if (loading) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-6xl">
          <p className="text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light">Journalist Applications</h1>
            <p className="text-neutral-500 mt-1">
              {pendingCount} application{pendingCount !== 1 ? 's' : ''} pending review
            </p>
          </div>

          <div className="flex items-center gap-6">
            <Link
              href="/admin/ads"
              className="text-sm text-neutral-500 hover:text-white"
            >
              &larr; Back to Admin
            </Link>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('pending')}
                className={`px-4 py-2 text-sm tracking-widest uppercase ${
                  filter === 'pending'
                    ? 'bg-black text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 text-sm tracking-widest uppercase ${
                  filter === 'all'
                    ? 'bg-black text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                }`}
              >
                All
              </button>
            </div>
          </div>
        </div>

        {/* Applications */}
        {filteredApplications.length === 0 ? (
          <div className="bg-surface border border-white/[0.08] p-12 text-center">
            <p className="text-neutral-400">
              {filter === 'pending' ? 'No pending applications.' : 'No applications yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredApplications.map((app) => (
              <div key={app.id} className="bg-surface border border-white/[0.08] p-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Applicant Info */}
                  <div>
                    <p className="text-xs tracking-widest uppercase text-neutral-400 mb-3">
                      Applicant
                    </p>
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="text-neutral-400">Name:</span>{' '}
                        {app.user?.full_name || 'Not provided'}
                      </p>
                      <p>
                        <span className="text-neutral-400">Email:</span>{' '}
                        {app.user?.email}
                      </p>
                      <p>
                        <span className="text-neutral-400">Phone:</span>{' '}
                        {app.phone}
                      </p>
                      <p>
                        <span className="text-neutral-400">Zip Code:</span>{' '}
                        {app.zip_code}
                      </p>
                      <p>
                        <span className="text-neutral-400">Neighborhood:</span>{' '}
                        {app.neighborhood?.name}, {app.neighborhood?.city}
                      </p>
                      <p>
                        <span className="text-neutral-400">Applied:</span>{' '}
                        {new Date(app.created_at).toLocaleDateString()}
                      </p>
                      <p>
                        <span
                          className={`inline-block px-2 py-1 text-xs tracking-widest uppercase ${
                            app.status === 'pending'
                              ? 'bg-yellow-500/15 text-yellow-400'
                              : app.status === 'approved'
                                ? 'bg-green-500/15 text-green-400'
                                : 'bg-red-500/15 text-red-400'
                          }`}
                        >
                          {app.status}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Bio & Interest */}
                  <div>
                    <p className="text-xs tracking-widest uppercase text-neutral-400 mb-3">
                      About
                    </p>
                    <div className="space-y-4 text-sm">
                      <div>
                        <p className="text-neutral-400 mb-1">Bio:</p>
                        <p className="text-neutral-300">{app.bio}</p>
                      </div>
                      {app.why_interested && (
                        <div>
                          <p className="text-neutral-400 mb-1">Why interested:</p>
                          <p className="text-neutral-300">{app.why_interested}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Photos & Actions */}
                  <div>
                    <p className="text-xs tracking-widest uppercase text-neutral-400 mb-3">
                      Sample Photos
                    </p>
                    <div className="space-y-2 mb-4">
                      <a
                        href={app.photo_url_1}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm text-blue-600 hover:underline truncate"
                      >
                        Photo 1 →
                      </a>
                      <a
                        href={app.photo_url_2}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm text-blue-600 hover:underline truncate"
                      >
                        Photo 2 →
                      </a>
                    </div>

                    {app.status === 'pending' && (
                      <div className="space-y-2 mt-6">
                        <button
                          onClick={() => handleApprove(app.id)}
                          disabled={processingId === app.id}
                          className="w-full bg-green-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {processingId === app.id ? 'Processing...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setShowRejectModal(app.id)}
                          disabled={processingId === app.id}
                          className="w-full bg-red-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}

                    {app.status === 'rejected' && app.rejection_reason && (
                      <p className="text-sm text-red-600 mt-4">
                        Rejected: {app.rejection_reason}
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
            <div className="bg-surface p-6 max-w-md w-full">
              <h2 className="text-lg font-medium mb-4">Reject Application</h2>
              <p className="text-sm text-neutral-400 mb-4">
                Optionally provide a reason for rejection.
              </p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Location too far from neighborhood..."
                className="w-full px-4 py-3 border border-white/[0.08] focus:border-amber-500 focus:outline-none mb-4"
                rows={3}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => handleReject(showRejectModal)}
                  disabled={processingId === showRejectModal}
                  className="flex-1 bg-red-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {processingId === showRejectModal ? 'Rejecting...' : 'Confirm Reject'}
                </button>
                <button
                  onClick={() => {
                    setShowRejectModal(null);
                    setRejectionReason('');
                  }}
                  className="px-6 py-2 border border-white/[0.08] text-sm tracking-widest uppercase hover:border-white/20 transition-colors"
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
