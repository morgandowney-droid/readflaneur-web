'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { track } from '@/lib/analytics';

const READS_KEY = 'flaneur-article-reads';
const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';
const DISMISSED_KEY = 'flaneur-email-prompt-dismissed';
const PREFS_KEY = 'flaneur-neighborhood-preferences';
const SESSION_COUNT_KEY = 'flaneur-session-count';
// Bumped from 3 to 8 so first-visit evaluators (e.g. brokers kicking the tires
// from a cold pitch link) can explore freely without hitting a capture prompt
// on their first session. Combined with the session gate below, the capture
// only shows on a 2nd+ visit after genuinely engaging with content.
const READ_THRESHOLD = 8;
const MIN_SESSIONS = 2;

interface EmailCaptureCardProps {
  neighborhoodName?: string;
}

export function EmailCaptureCard({ neighborhoodName }: EmailCaptureCardProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    try {
      const subscribed = localStorage.getItem(SUBSCRIBED_KEY) === 'true';
      const dismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
      const loggedIn = !!localStorage.getItem('flaneur-auth');
      const reads = parseInt(localStorage.getItem(READS_KEY) || '0', 10);
      const sessions = parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10);
      if (!subscribed && !dismissed && !loggedIn && reads >= READ_THRESHOLD && sessions >= MIN_SESSIONS) {
        setVisible(true);
        track('email_capture.view', { neighborhoodName, reads });
      }
    } catch {
      // localStorage not available
    }
  }, [neighborhoodName]);

  const handleDismiss = () => {
    setVisible(false);
    track('email_capture.dismiss', { neighborhoodName });
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage(t('email.invalidEmail'));
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');
    track('email_capture.submit', { neighborhoodName });

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
        track('email_capture.success', {
          neighborhoodName,
          neighborhoodCount: neighborhoodIds.length,
          accountCreated: data.accountCreated === true,
        });
      } else {
        setErrorMessage(data.error || 'Failed to subscribe');
        setStatus('error');
        track('email_capture.error', {
          neighborhoodName,
          reason: data.error || 'unknown',
          status: response.status,
        });
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
      setStatus('error');
      track('email_capture.error', { neighborhoodName, reason: 'network' });
    }
  };

  if (!visible) return null;

  if (status === 'success') {
    return (
      <div className="bg-surface border border-border p-6 text-center">
        <p className="text-lg font-medium text-fg mb-1">{t('email.success')}</p>
        <p className="text-sm text-fg-muted">
          {t('email.checkInbox')}
        </p>
      </div>
    );
  }

  const headline = neighborhoodName
    ? t('email.getStories').replace('{neighborhood}', neighborhoodName)
    : t('email.getDailyBrief');

  return (
    <div className="bg-surface border border-border p-6 relative">
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-fg-subtle hover:text-fg transition-colors"
        aria-label="Dismiss"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <h3 className="text-base font-medium text-fg mb-1 pr-6">
        {headline}
      </h3>
      <p className="text-sm text-fg-muted mb-4">
        {t('email.freeBrief')}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('email.enterEmail')}
          className="flex-1 px-4 py-2.5 bg-surface border border-border-strong text-white text-sm placeholder:text-fg-subtle focus:outline-none focus:border-accent transition-colors"
          disabled={status === 'loading'}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="px-6 py-2.5 bg-fg text-canvas text-sm font-medium tracking-wide hover:opacity-80 transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {status === 'loading' ? t('email.subscribing') : t('email.subscribe')}
        </button>
      </form>

      {status === 'error' && (
        <p className="text-red-400 text-xs mt-2">{errorMessage}</p>
      )}
    </div>
  );
}
