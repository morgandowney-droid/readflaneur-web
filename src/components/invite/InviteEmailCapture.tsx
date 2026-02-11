'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const REFERRAL_STORAGE_KEY = 'flaneur-referral-code';
const PREFS_KEY = 'flaneur-neighborhood-preferences';
const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';

export function InviteEmailCapture() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setStatus('loading');

    try {
      // Get neighborhood preferences from localStorage
      let neighborhoodIds: string[] = [];
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        try { neighborhoodIds = JSON.parse(stored); } catch { /* ignore */ }
      }

      // Detect timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, neighborhoodIds, timezone }),
      });

      const data = await res.json();

      if (data.success) {
        // Track referral conversion (fire-and-forget)
        const refCode = sessionStorage.getItem(REFERRAL_STORAGE_KEY);
        if (refCode) {
          fetch('/api/referral/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: refCode, email }),
          }).catch(() => {});
          sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
        }

        localStorage.setItem(SUBSCRIBED_KEY, 'true');
        setStatus('success');
        setMessage(data.message || 'You are in.');

        // Redirect to feed after a brief moment
        setTimeout(() => router.push('/feed'), 1500);
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong.');
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  };

  if (status === 'success') {
    return (
      <div className="text-center py-8">
        <p className="text-neutral-200 text-lg">{message}</p>
        <p className="text-neutral-500 text-sm mt-2">Redirecting to your feed...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <p className="text-neutral-400 text-sm mb-4 tracking-wide">
        Enter your email to get daily stories from the neighborhoods you follow.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="flex-1 bg-neutral-900 border border-white/20 text-white px-4 py-3 text-sm rounded-md focus:outline-none focus:border-amber-500 transition-colors placeholder:text-neutral-600"
          disabled={status === 'loading'}
        />
        <button
          type="submit"
          disabled={status === 'loading' || !email}
          className="bg-white text-neutral-900 px-6 py-3 text-sm font-medium rounded-md hover:bg-amber-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {status === 'loading' ? 'Sending...' : 'Subscribe'}
        </button>
      </form>
      {status === 'error' && (
        <p className="text-red-400 text-xs mt-2">{message}</p>
      )}
    </div>
  );
}
