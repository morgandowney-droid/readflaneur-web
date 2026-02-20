'use client';

import { useState, useEffect, useCallback } from 'react';

const ANON_ID_KEY = 'flaneur-anonymous-id';

function getAnonymousId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

interface ImageFeedbackProps {
  imageUrl: string;
}

export function ImageFeedback({ imageUrl }: ImageFeedbackProps) {
  const [score, setScore] = useState(0);
  const [userFeedback, setUserFeedback] = useState<1 | -1 | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchFeedback = useCallback(async () => {
    try {
      const anonymousId = getAnonymousId();
      const res = await fetch(
        `/api/image-feedback?imageUrl=${encodeURIComponent(imageUrl)}&anonymousId=${anonymousId}`
      );
      if (res.ok) {
        const data = await res.json();
        setScore(data.score);
        setUserFeedback(data.userFeedback);
      }
    } catch {
      // Non-critical — silently ignore
    }
  }, [imageUrl]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const submit = async (feedback: 1 | -1) => {
    if (loading) return;

    // Optimistic update
    const prevScore = score;
    const prevFeedback = userFeedback;

    if (userFeedback === feedback) {
      // Toggle off
      setUserFeedback(null);
      setScore(score - feedback);
    } else if (userFeedback) {
      // Switch
      setUserFeedback(feedback);
      setScore(score - userFeedback + feedback);
    } else {
      // New
      setUserFeedback(feedback);
      setScore(score + feedback);
    }

    setLoading(true);
    try {
      const anonymousId = getAnonymousId();
      const res = await fetch('/api/image-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, feedback, anonymousId }),
      });
      if (res.ok) {
        const data = await res.json();
        setScore(data.score);
      }
    } catch {
      // Revert on failure
      setScore(prevScore);
      setUserFeedback(prevFeedback);
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={() => submit(1)}
        className={`p-0.5 transition-colors ${
          userFeedback === 1
            ? 'text-amber-600'
            : 'text-fg-subtle hover:text-fg'
        }`}
        title="Good photo"
        aria-label="Thumbs up"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={userFeedback === 1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
      </button>
      {score !== 0 && (
        <span className={`text-[11px] tabular-nums ${
          score > 0 ? 'text-amber-600' : 'text-red-500'
        }`}>
          {score > 0 ? `+${score}` : score}
        </span>
      )}
      <button
        onClick={() => submit(-1)}
        className={`p-0.5 transition-colors ${
          userFeedback === -1
            ? 'text-red-500'
            : 'text-fg-subtle hover:text-fg'
        }`}
        title="Bad photo"
        aria-label="Thumbs down"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={userFeedback === -1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
        </svg>
      </button>
    </span>
  );
}
