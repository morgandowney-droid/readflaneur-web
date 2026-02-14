'use client';

import { useState, useEffect } from 'react';

const READS_KEY = 'flaneur-article-reads';
const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';
const DISMISSED_KEY = 'flaneur-email-prompt-dismissed';
const PREFS_KEY = 'flaneur-neighborhood-preferences';
const READ_THRESHOLD = 3;

interface PostReadEmailCaptureProps {
  neighborhoodName: string;
}

export function PostReadEmailCapture({ neighborhoodName }: PostReadEmailCaptureProps) {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    try {
      const subscribed = localStorage.getItem(SUBSCRIBED_KEY) === 'true';
      const dismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
      const reads = parseInt(localStorage.getItem(READS_KEY) || '0', 10);
      if (!subscribed && !dismissed && reads >= READ_THRESHOLD) {
        setVisible(true);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      let timezone: string | undefined;
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        // not supported
      }

      let neighborhoodIds: string[] = [];
      try {
        const prefs = localStorage.getItem(PREFS_KEY);
        if (prefs) neighborhoodIds = JSON.parse(prefs);
      } catch {
        // ignore
      }

      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, timezone, neighborhoodIds }),
      });

      const data = await response.json();
      if (response.ok) {
        setStatus('success');
        try {
          localStorage.setItem(SUBSCRIBED_KEY, 'true');
        } catch {
          // ignore
        }
      } else {
        setErrorMessage(data.error || 'Failed to subscribe');
        setStatus('error');
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  if (!visible) return null;

  if (status === 'success') {
    return (
      <div className="mt-6 pt-6 border-t border-border text-center">
        <p className="text-sm text-fg">You're in! Check your inbox for a verification link.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <p className="text-sm text-fg-muted whitespace-nowrap">
            Enjoying {neighborhoodName} stories? Get them emailed 7am daily.
          </p>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-fg-subtle hover:text-fg transition-colors sm:hidden"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 shrink-0">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email"
            className="w-48 px-3 py-1.5 bg-surface border border-border-strong text-white text-sm placeholder:text-fg-subtle focus:outline-none focus:border-amber-500 transition-colors"
            disabled={status === 'loading'}
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="px-4 py-1.5 bg-fg text-canvas text-sm font-medium hover:bg-amber-600 hover:text-fg transition-colors disabled:opacity-50"
          >
            {status === 'loading' ? '...' : 'Subscribe'}
          </button>
        </form>

        <button
          onClick={handleDismiss}
          className="hidden sm:block shrink-0 text-fg-subtle hover:text-fg transition-colors"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {status === 'error' && (
        <p className="text-red-400 text-xs mt-2">{errorMessage}</p>
      )}
    </div>
  );
}
