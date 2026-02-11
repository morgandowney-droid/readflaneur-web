'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatDistanceToNow } from 'date-fns';

const adminNavItems = [
  { href: '/admin/articles', label: 'Articles' },
  { href: '/admin/ads', label: 'Ads' },
  { href: '/admin/comments', label: 'Comments' },
  { href: '/admin/journalists', label: 'Journalists' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/newsletter', label: 'Newsletter' },
];

interface CommentRow {
  id: string;
  content: string;
  author_name: string;
  author_email: string | null;
  status: string;
  moderation_score: number | null;
  moderation_categories: Record<string, boolean> | null;
  created_at: string;
  article: {
    id: string;
    headline: string;
  }[] | null;
}

interface Comment {
  id: string;
  content: string;
  author_name: string;
  author_email: string | null;
  status: string;
  moderation_score: number | null;
  moderation_categories: Record<string, boolean> | null;
  created_at: string;
  article: {
    id: string;
    headline: string;
  } | null;
}

export default function AdminCommentsPage() {
  const pathname = usePathname();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'flagged' | 'pending'>('flagged');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchComments();
  }, [filter]);

  const fetchComments = async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from('comments')
      .select(`
        id,
        content,
        author_name,
        author_email,
        status,
        moderation_score,
        moderation_categories,
        created_at,
        article:articles(id, headline)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter === 'flagged') {
      query = query.eq('status', 'flagged');
    } else if (filter === 'pending') {
      query = query.eq('status', 'pending');
    } else {
      query = query.in('status', ['flagged', 'pending', 'rejected']);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching comments:', error);
    } else {
      // Transform article array to single object
      const transformed: Comment[] = (data || []).map((row: CommentRow) => ({
        ...row,
        article: row.article?.[0] || null,
      }));
      setComments(transformed);
    }

    setLoading(false);
  };

  const updateCommentStatus = async (commentId: string, newStatus: 'approved' | 'rejected') => {
    setProcessing(commentId);

    const supabase = createClient();
    const { error } = await supabase
      .from('comments')
      .update({ status: newStatus })
      .eq('id', commentId);

    if (error) {
      console.error('Error updating comment:', error);
      alert('Failed to update comment');
    } else {
      setComments(prev => prev.filter(c => c.id !== commentId));
    }

    setProcessing(null);
  };

  const getFlaggedCategories = (categories: Record<string, boolean> | null) => {
    if (!categories) return [];
    return Object.entries(categories)
      .filter(([_, flagged]) => flagged)
      .map(([category]) => category.replace('/', ' / ').replace(/-/g, ' '));
  };

  return (
    <div className="py-8 px-4">
      <div className="mx-auto max-w-4xl">
        {/* Admin Navigation */}
        <nav className="flex flex-wrap gap-4 mb-8 pb-4 border-b border-white/[0.08]">
          {adminNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-xs tracking-widest uppercase transition-colors ${
                pathname === item.href
                  ? 'text-neutral-100'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <h1 className="text-2xl font-light mb-8">Comment Moderation</h1>

        {/* Filters */}
        <div className="flex gap-2 mb-8">
          {(['flagged', 'pending', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm tracking-widest uppercase transition-colors ${
                filter === f
                  ? 'bg-black text-white'
                  : 'border border-white/[0.08] hover:border-white/20'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Comments List */}
        {loading ? (
          <p className="text-neutral-400">Loading...</p>
        ) : comments.length === 0 ? (
          <div className="text-center py-12 bg-canvas">
            <p className="text-neutral-500">No comments to review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="p-6 border border-white/[0.08] bg-surface"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-medium">{comment.author_name}</p>
                    {comment.author_email && (
                      <p className="text-xs text-neutral-400">{comment.author_email}</p>
                    )}
                    <p className="text-xs text-neutral-400">
                      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 text-xs uppercase tracking-wider ${
                        comment.status === 'flagged'
                          ? 'bg-orange-500/15 text-orange-400'
                          : comment.status === 'rejected'
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-yellow-500/15 text-yellow-400'
                      }`}
                    >
                      {comment.status}
                    </span>
                    {comment.moderation_score !== null && comment.moderation_score > 0 && (
                      <span className="px-2 py-1 text-xs bg-neutral-800 text-neutral-400">
                        Score: {(comment.moderation_score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Article Link */}
                {comment.article && (
                  <p className="text-xs text-neutral-400 mb-3">
                    On: <span className="text-neutral-100">{comment.article.headline}</span>
                  </p>
                )}

                {/* Flagged Categories */}
                {comment.moderation_categories && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {getFlaggedCategories(comment.moderation_categories).map((cat) => (
                      <span
                        key={cat}
                        className="px-2 py-1 text-xs bg-red-500/10 text-red-400 rounded"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}

                {/* Content */}
                <div className="p-4 bg-canvas mb-4">
                  <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => updateCommentStatus(comment.id, 'approved')}
                    disabled={processing === comment.id}
                    className="px-4 py-2 text-sm tracking-widest uppercase bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {processing === comment.id ? '...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => updateCommentStatus(comment.id, 'rejected')}
                    disabled={processing === comment.id}
                    className="px-4 py-2 text-sm tracking-widest uppercase bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {processing === comment.id ? '...' : 'Reject'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
