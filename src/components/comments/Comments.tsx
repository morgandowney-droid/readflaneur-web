'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface Comment {
  id: string;
  content: string;
  author_name: string;
  parent_id: string | null;
  created_at: string;
  user_id: string | null;
  votes: { up: number; down: number };
}

interface CommentsProps {
  articleId: string;
}

function CommentItem({
  comment,
  replies,
  onReply,
  depth = 0,
}: {
  comment: Comment;
  replies: Comment[];
  onReply: (parentId: string) => void;
  depth?: number;
}) {
  const [voting, setVoting] = useState(false);
  const [votes, setVotes] = useState(comment.votes);

  const handleVote = async (voteType: 'up' | 'down') => {
    if (voting) return;
    setVoting(true);

    try {
      const res = await fetch('/api/comments/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: comment.id, voteType }),
      });

      if (res.ok) {
        const data = await res.json();
        // Optimistic update
        if (data.action === 'voted') {
          setVotes(prev => ({
            ...prev,
            [voteType]: prev[voteType] + 1,
          }));
        } else if (data.action === 'removed') {
          setVotes(prev => ({
            ...prev,
            [voteType]: Math.max(0, prev[voteType] - 1),
          }));
        }
      }
    } catch (error) {
      console.error('Vote failed:', error);
    } finally {
      setVoting(false);
    }
  };

  const maxDepth = 3;
  const canNest = depth < maxDepth;

  return (
    <div className={depth > 0 ? 'ml-6 pl-4 border-l border-neutral-200' : ''}>
      <div className="py-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-medium text-sm">{comment.author_name}</span>
          <span className="text-xs text-neutral-400">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
          </span>
        </div>

        <p className="text-sm text-neutral-700 mb-3 whitespace-pre-wrap">
          {comment.content}
        </p>

        <div className="flex items-center gap-4 text-xs">
          <button
            onClick={() => handleVote('up')}
            disabled={voting}
            className="flex items-center gap-1 text-neutral-400 hover:text-black transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            {votes.up > 0 && <span>{votes.up}</span>}
          </button>

          <button
            onClick={() => handleVote('down')}
            disabled={voting}
            className="flex items-center gap-1 text-neutral-400 hover:text-black transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            {votes.down > 0 && <span>{votes.down}</span>}
          </button>

          {canNest && (
            <button
              onClick={() => onReply(comment.id)}
              className="text-neutral-400 hover:text-black transition-colors"
            >
              Reply
            </button>
          )}
        </div>
      </div>

      {/* Render replies */}
      {replies.length > 0 && (
        <div className="space-y-0">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replies={[]} // No nested replies for simplicity
              onReply={onReply}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentForm({
  articleId,
  parentId,
  onSuccess,
  onCancel,
}: {
  articleId: string;
  parentId?: string;
  onSuccess: (comment: Comment | null, message: string) => void;
  onCancel?: () => void;
}) {
  const [content, setContent] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved name from localStorage
  useEffect(() => {
    const savedName = localStorage.getItem('flaneur_comment_name');
    if (savedName) setAuthorName(savedName);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !authorName.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId,
          content: content.trim(),
          authorName: authorName.trim(),
          parentId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to post comment');
        setSubmitting(false);
        return;
      }

      // Save name for next time
      localStorage.setItem('flaneur_comment_name', authorName.trim());

      setContent('');
      onSuccess(data.comment, data.message);
    } catch (err) {
      setError('Failed to post comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200">
          {error}
        </div>
      )}

      <div>
        <input
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Your name"
          maxLength={50}
          required
          className="w-full px-4 py-2 text-sm border border-neutral-200 focus:border-black focus:outline-none"
        />
      </div>

      <div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={parentId ? 'Write a reply...' : 'Share your thoughts...'}
          rows={parentId ? 2 : 4}
          maxLength={2000}
          required
          className="w-full px-4 py-3 text-sm border border-neutral-200 focus:border-black focus:outline-none resize-none"
        />
        <p className="text-xs text-neutral-400 mt-1">{content.length}/2000</p>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting || !content.trim() || !authorName.trim()}
          className="px-6 py-2 text-sm tracking-widest uppercase bg-black text-white hover:bg-neutral-800 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Posting...' : parentId ? 'Reply' : 'Post Comment'}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 text-sm tracking-widest uppercase border border-neutral-200 hover:border-black transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function Comments({ articleId }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchComments();
  }, [articleId]);

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/comments?articleId=${articleId}`);
      const data = await res.json();
      setComments(data.comments || []);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCommentSuccess = (comment: Comment | null, message: string) => {
    if (comment) {
      setComments(prev => [...prev, comment]);
    }
    setSuccessMessage(message);
    setReplyingTo(null);

    // Clear message after 5 seconds
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  // Organize comments into tree structure
  const topLevelComments = comments.filter(c => !c.parent_id);
  const getReplies = (parentId: string) => comments.filter(c => c.parent_id === parentId);

  return (
    <div className="mt-12 pt-8 border-t border-neutral-200">
      <h2 className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-6">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h2>

      {successMessage && (
        <div className="mb-6 p-3 text-sm text-green-700 bg-green-50 border border-green-200">
          {successMessage}
        </div>
      )}

      {/* Comment Form */}
      <div className="mb-8">
        <CommentForm articleId={articleId} onSuccess={handleCommentSuccess} />
      </div>

      {/* Comments List */}
      {loading ? (
        <p className="text-sm text-neutral-400">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-neutral-400">No comments yet. Be the first to share your thoughts.</p>
      ) : (
        <div className="divide-y divide-neutral-100">
          {topLevelComments.map((comment) => (
            <div key={comment.id}>
              <CommentItem
                comment={comment}
                replies={getReplies(comment.id)}
                onReply={(parentId) => setReplyingTo(parentId)}
              />

              {/* Reply Form */}
              {replyingTo === comment.id && (
                <div className="ml-6 pl-4 border-l border-neutral-200 pb-4">
                  <CommentForm
                    articleId={articleId}
                    parentId={comment.id}
                    onSuccess={handleCommentSuccess}
                    onCancel={() => setReplyingTo(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
