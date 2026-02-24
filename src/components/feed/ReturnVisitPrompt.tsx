'use client';

import { useState, useEffect, useRef } from 'react';

const SESSION_KEY = 'flaneur-session-count';
const SESSION_FLAG = 'flaneur-session-counted';
const READS_KEY = 'flaneur-article-reads';
const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';
const DISMISSED_KEY = 'flaneur-email-prompt-dismissed';
const PREFS_KEY = 'flaneur-neighborhood-preferences';
const READ_THRESHOLD = 3;
const SESSION_THRESHOLD = 2;
const AUTO_DISMISS_MS = 10000;

export function ReturnVisitPrompt() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [interacted, setInteracted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      // Already subscribed or dismissed
      if (localStorage.getItem(SUBSCRIBED_KEY) === 'true') return;
      if (localStorage.getItem(DISMISSED_KEY) === 'true') return;
      // Logged-in users are auto-subscribed - suppress prompt
      if (localStorage.getItem('flaneur-auth')) return;

      // Check read threshold
      const reads = parseInt(localStorage.getItem(READS_KEY) || '0', 10);
      if (reads < READ_THRESHOLD) return;

      // Increment session count (once per session via sessionStorage guard)
      if (!sessionStorage.getItem(SESSION_FLAG)) {
        const current = parseInt(localStorage.getItem(SESSION_KEY) || '0', 10);
        const newCount = current + 1;
        localStorage.setItem(SESSION_KEY, String(newCount));
        sessionStorage.setItem(SESSION_FLAG, 'true');
      }

      const sessionCount = parseInt(localStorage.getItem(SESSION_KEY) || '0', 10);
      if (sessionCount >= SESSION_THRESHOLD) {
        // Delay showing slightly so it doesn't flash on page load
        const showTimer = setTimeout(() => setVisible(true), 1500);
        return () => clearTimeout(showTimer);
      }
    } catch {
      // localStorage/sessionStorage not available
    }
  }, []);

  // Auto-dismiss after 10s if not interacted
  useEffect(() => {
    if (!visible || interacted) return;
    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, interacted]);

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // ignore
    }
  };

  const handleFocus = () => {
    setInteracted(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
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
        // Auto-hide success after 3s
        setTimeout(() => setVisible(false), 3000);
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

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 animate-slide-up"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto max-w-2xl px-4 pb-4">
        <div className="bg-surface border border-border p-4 shadow-2xl shadow-black/50 relative">
          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-fg-subtle hover:text-fg transition-colors"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {status === 'success' ? (
            <p className="text-sm text-fg text-center py-1">
              You're in! Check your inbox for a verification link.
            </p>
          ) : (
            <>
              <p className="text-sm text-fg-muted mb-3 pr-6">
                Welcome back. Save your setup and get daily briefs.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={handleFocus}
                  placeholder="Enter your email"
                  className="flex-1 px-3 py-2 bg-surface border border-border-strong text-white text-sm placeholder:text-fg-subtle focus:outline-none focus:border-amber-500 transition-colors"
                  disabled={status === 'loading'}
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="px-5 py-2 bg-fg text-canvas text-sm font-medium hover:bg-amber-600 hover:text-fg transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {status === 'loading' ? '...' : 'Subscribe'}
                </button>
              </form>

              {status === 'error' && (
                <p className="text-red-400 text-xs mt-2">{errorMessage}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
