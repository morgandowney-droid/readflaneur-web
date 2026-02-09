'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Article {
  id: string;
  headline: string;
  body_text: string;
  preview_text: string | null;
  image_url: string;
  images: string[] | null;
  status: 'draft' | 'pending' | 'published' | 'rejected' | 'suspended' | 'scheduled' | 'archived';
  rejection_reason: string | null;
  editor_notes: string | null;
  created_at: string;
  published_at: string | null;
  author?: {
    email: string;
    full_name: string | null;
  };
  neighborhood?: {
    name: string;
    city: string;
  };
}

export default function AdminArticlesPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [showReviewModal, setShowReviewModal] = useState<Article | null>(null);
  const [reviewAction, setReviewAction] = useState<'reject' | 'request_changes' | null>(null);
  const [reviewReason, setReviewReason] = useState('');

  useEffect(() => {
    loadArticles();
  }, [filter]);

  async function loadArticles() {
    try {
      const response = await fetch(`/api/admin/articles?filter=${filter}`);
      const data = await response.json();

      if (response.status === 401) {
        router.push('/login?redirect=/admin/articles');
        return;
      }

      if (response.status === 403) {
        router.push('/');
        return;
      }

      setArticles(data.articles || []);
      setLoading(false);
    } catch (err) {
      console.error('Error loading articles:', err);
      router.push('/login?redirect=/admin/articles');
    }
  }

  const handlePublish = async (articleId: string) => {
    setProcessingId(articleId);

    try {
      const response = await fetch('/api/admin/articles/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, action: 'publish' }),
      });

      if (response.ok) {
        setArticles(articles.map(a =>
          a.id === articleId ? { ...a, status: 'published' as const } : a
        ));
      }
    } catch (error) {
      console.error('Publish error:', error);
    }

    setProcessingId(null);
  };

  const handleSuspend = async (articleId: string) => {
    setProcessingId(articleId);

    try {
      const response = await fetch('/api/admin/articles/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, action: 'suspend' }),
      });

      if (response.ok) {
        setArticles(articles.map(a =>
          a.id === articleId ? { ...a, status: 'suspended' as const } : a
        ));
      }
    } catch (error) {
      console.error('Suspend error:', error);
    }

    setProcessingId(null);
  };

  const handleRepublish = async (articleId: string) => {
    setProcessingId(articleId);

    try {
      const response = await fetch('/api/admin/articles/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, action: 'republish' }),
      });

      if (response.ok) {
        setArticles(articles.map(a =>
          a.id === articleId ? { ...a, status: 'published' as const } : a
        ));
      }
    } catch (error) {
      console.error('Republish error:', error);
    }

    setProcessingId(null);
  };

  const handleReviewAction = async () => {
    if (!showReviewModal || !reviewAction) return;

    setProcessingId(showReviewModal.id);

    try {
      const response = await fetch('/api/admin/articles/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: showReviewModal.id,
          action: reviewAction,
          reason: reviewReason,
        }),
      });

      if (response.ok) {
        const newStatus = reviewAction === 'reject' ? 'rejected' : 'draft';
        setArticles(articles.map(a =>
          a.id === showReviewModal.id ? { ...a, status: newStatus as Article['status'] } : a
        ));
        setShowReviewModal(null);
        setReviewAction(null);
        setReviewReason('');
      }
    } catch (error) {
      console.error('Review action error:', error);
    }

    setProcessingId(null);
  };

  const pendingCount = articles.filter(a => a.status === 'pending').length;

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
            <h1 className="text-2xl font-light">Article Review</h1>
            <p className="text-neutral-500 mt-1">
              {pendingCount} article{pendingCount !== 1 ? 's' : ''} pending review
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

        {/* Articles */}
        {articles.length === 0 ? (
          <div className="bg-surface border border-white/[0.08] p-12 text-center">
            <p className="text-neutral-400">
              {filter === 'pending' ? 'No articles pending review.' : 'No articles yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {articles.map((article) => (
              <div key={article.id} className="bg-surface border border-white/[0.08] p-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Preview */}
                  <div>
                    <p className="text-xs tracking-widest uppercase text-neutral-400 mb-3">
                      Preview
                    </p>
                    <img
                      src={article.image_url}
                      alt={article.headline}
                      className="w-full aspect-video object-cover mb-3"
                    />
                    <h3 className="font-medium mb-2">{article.headline}</h3>
                    <p className="text-sm text-neutral-400 line-clamp-3">
                      {article.body_text}
                    </p>
                  </div>

                  {/* Details */}
                  <div>
                    <p className="text-xs tracking-widest uppercase text-neutral-400 mb-3">
                      Details
                    </p>
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="text-neutral-400">Author:</span>{' '}
                        {article.author?.full_name || article.author?.email}
                      </p>
                      <p>
                        <span className="text-neutral-400">Neighborhood:</span>{' '}
                        {article.neighborhood?.name}, {article.neighborhood?.city}
                      </p>
                      <p>
                        <span className="text-neutral-400">Submitted:</span>{' '}
                        {new Date(article.created_at).toLocaleDateString()}
                      </p>
                      <p>
                        <span
                          className={`inline-block px-2 py-1 text-xs tracking-widest uppercase ${
                            article.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : article.status === 'published'
                                ? 'bg-green-100 text-green-800'
                                : article.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : article.status === 'suspended'
                                    ? 'bg-orange-100 text-orange-800'
                                    : article.status === 'scheduled'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {article.status}
                        </span>
                      </p>
                      {article.rejection_reason && (
                        <p className="text-red-600">
                          Rejected: {article.rejection_reason}
                        </p>
                      )}
                      {article.editor_notes && (
                        <p className="text-orange-600">
                          Notes: {article.editor_notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div>
                    <p className="text-xs tracking-widest uppercase text-neutral-400 mb-3">
                      Actions
                    </p>
                    {article.status === 'pending' && (
                      <div className="space-y-2">
                        <button
                          onClick={() => handlePublish(article.id)}
                          disabled={processingId === article.id}
                          className="w-full bg-green-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {processingId === article.id ? 'Processing...' : 'Publish'}
                        </button>
                        <button
                          onClick={() => {
                            setShowReviewModal(article);
                            setReviewAction('request_changes');
                          }}
                          disabled={processingId === article.id}
                          className="w-full bg-orange-500 text-white py-2 text-sm tracking-widest uppercase hover:bg-orange-600 transition-colors disabled:opacity-50"
                        >
                          Request Changes
                        </button>
                        <button
                          onClick={() => {
                            setShowReviewModal(article);
                            setReviewAction('reject');
                          }}
                          disabled={processingId === article.id}
                          className="w-full bg-red-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <Link
                          href={`/admin/articles/${article.id}/edit`}
                          className="block w-full border border-white/[0.08] py-2 text-sm tracking-widest uppercase text-center hover:border-white/20 transition-colors"
                        >
                          Edit
                        </Link>
                      </div>
                    )}
                    {article.status === 'published' && (
                      <div className="space-y-2">
                        <button
                          onClick={() => handleSuspend(article.id)}
                          disabled={processingId === article.id}
                          className="w-full bg-orange-500 text-white py-2 text-sm tracking-widest uppercase hover:bg-orange-600 transition-colors disabled:opacity-50"
                        >
                          {processingId === article.id ? 'Processing...' : 'Suspend'}
                        </button>
                        <Link
                          href={`/admin/articles/${article.id}/edit`}
                          className="block w-full border border-white/[0.08] py-2 text-sm tracking-widest uppercase text-center hover:border-white/20 transition-colors"
                        >
                          Edit
                        </Link>
                      </div>
                    )}
                    {article.status === 'suspended' && (
                      <div className="space-y-2">
                        <button
                          onClick={() => handleRepublish(article.id)}
                          disabled={processingId === article.id}
                          className="w-full bg-green-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {processingId === article.id ? 'Processing...' : 'Republish'}
                        </button>
                        <Link
                          href={`/admin/articles/${article.id}/edit`}
                          className="block w-full border border-white/[0.08] py-2 text-sm tracking-widest uppercase text-center hover:border-white/20 transition-colors"
                        >
                          Edit
                        </Link>
                      </div>
                    )}
                    {(article.status === 'draft' || article.status === 'rejected') && (
                      <div className="space-y-2">
                        <Link
                          href={`/admin/articles/${article.id}/edit`}
                          className="block w-full border border-white/[0.08] py-2 text-sm tracking-widest uppercase text-center hover:border-white/20 transition-colors"
                        >
                          Edit
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Review Modal */}
        {showReviewModal && reviewAction && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-surface p-6 max-w-md w-full">
              <h2 className="text-lg font-medium mb-4">
                {reviewAction === 'reject' ? 'Reject Article' : 'Request Changes'}
              </h2>
              <p className="text-sm text-neutral-400 mb-4">
                {reviewAction === 'reject'
                  ? 'Provide a reason for rejection (sent to the author).'
                  : 'What changes should the author make?'}
              </p>
              <textarea
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                placeholder={reviewAction === 'reject'
                  ? 'e.g., Content does not meet our guidelines...'
                  : 'e.g., Please add more detail about the location...'}
                className="w-full px-4 py-3 border border-white/[0.08] focus:border-amber-500 focus:outline-none mb-4"
                rows={4}
              />
              <div className="flex gap-3">
                <button
                  onClick={handleReviewAction}
                  disabled={processingId === showReviewModal.id}
                  className={`flex-1 text-white py-2 text-sm tracking-widest uppercase transition-colors disabled:opacity-50 ${
                    reviewAction === 'reject'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-orange-500 hover:bg-orange-600'
                  }`}
                >
                  {processingId === showReviewModal.id
                    ? 'Processing...'
                    : reviewAction === 'reject'
                      ? 'Confirm Reject'
                      : 'Send Feedback'}
                </button>
                <button
                  onClick={() => {
                    setShowReviewModal(null);
                    setReviewAction(null);
                    setReviewReason('');
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
