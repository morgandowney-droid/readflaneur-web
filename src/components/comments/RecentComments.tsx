'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface RecentComment {
  id: string;
  content: string;
  author_name: string;
  created_at: string;
  article_headline: string;
  article_url: string;
}

interface RecentCommentsProps {
  limit?: number;
}

export function RecentComments({ limit = 5 }: RecentCommentsProps) {
  const [comments, setComments] = useState<RecentComment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchComments() {
      try {
        const res = await fetch(`/api/comments/recent?limit=${limit}`);
        const data = await res.json();
        setComments(data.comments || []);
      } catch (error) {
        console.error('Failed to load recent comments:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchComments();
  }, [limit]);

  if (loading) {
    return (
      <div className="bg-neutral-50 p-6">
        <h3 className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-4">
          Recent Comments
        </h3>
        <p className="text-sm text-neutral-400">Loading...</p>
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="bg-neutral-50 p-6">
        <h3 className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-4">
          Recent Comments
        </h3>
        <p className="text-sm text-neutral-500">No comments yet. Be the first to join the conversation.</p>
      </div>
    );
  }

  return (
    <div className="bg-neutral-50 p-6">
      <h3 className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-4">
        Recent Comments
      </h3>

      <div className="space-y-4">
        {comments.map((comment) => (
          <div key={comment.id} className="border-b border-neutral-200 pb-4 last:border-0 last:pb-0">
            <Link href={comment.article_url} className="group">
              <p className="text-sm text-neutral-700 line-clamp-2 mb-2">
                &ldquo;{comment.content}&rdquo;
              </p>
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <span className="font-medium text-neutral-600">{comment.author_name}</span>
                <span>&middot;</span>
                <span>{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
              </div>
              <p className="text-xs text-neutral-400 mt-1 group-hover:text-black transition-colors line-clamp-1">
                on: {comment.article_headline}
              </p>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
