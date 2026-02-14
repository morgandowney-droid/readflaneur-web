'use client';

import { useState, useEffect, useCallback } from 'react';

const CODE_STORAGE_KEY = 'flaneur-referral-code';
const APP_URL = 'https://readflaneur.com';

interface ShareWidgetProps {
  /** Compact mode for dropdown items */
  compact?: boolean;
  onDone?: () => void;
}

export function ShareWidget({ compact, onDone }: ShareWidgetProps) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchCode = useCallback(async () => {
    // Check localStorage cache first
    const cached = localStorage.getItem(CODE_STORAGE_KEY);
    if (cached) {
      setCode(cached);
      return cached;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/referral/code');
      if (res.ok) {
        const data = await res.json();
        if (data.code) {
          localStorage.setItem(CODE_STORAGE_KEY, data.code);
          setCode(data.code);
          return data.code;
        }
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  useEffect(() => {
    fetchCode();
  }, [fetchCode]);

  const referralUrl = code ? `${APP_URL}/invite?ref=${code}` : null;

  const handleShare = async () => {
    if (!referralUrl) {
      const freshCode = await fetchCode();
      if (!freshCode) return;
    }

    const url = code ? `${APP_URL}/invite?ref=${code}` : referralUrl;
    if (!url) return;

    // Try native share on mobile
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Check out Flaneur',
          text: 'Check out Flaneur - local stories from interesting neighborhoods around the world.',
          url,
        });
        onDone?.();
        return;
      } catch {
        // User cancelled or not supported - fall through to clipboard
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onDone?.();
      }, 2000);
    } catch {
      // Silent fail
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleShare}
        disabled={loading}
        className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-hover transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-fg-subtle shrink-0">
          <path d="M7 1v8M4 4l3-3 3 3M2 9v3a1 1 0 001 1h8a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-xs text-fg-muted">
          {loading ? 'Loading...' : copied ? 'Link copied!' : 'Invite a Friend'}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      disabled={loading}
      className="text-sm text-fg-muted hover:text-fg transition-colors"
    >
      {loading ? 'Loading...' : copied ? 'Link copied!' : 'Invite a Friend'}
    </button>
  );
}
