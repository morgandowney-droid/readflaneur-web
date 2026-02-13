'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface NewsletterSignupProps {
  variant?: 'hero' | 'inline' | 'inline-minimal' | 'sidebar' | 'footer';
  neighborhoodName?: string;
}

const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';

export function NewsletterSignup({
  variant = 'inline',
  neighborhoodName
}: NewsletterSignupProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const searchParams = useSearchParams();

  // Check if user has already subscribed or came from email
  useEffect(() => {
    const subscribed = localStorage.getItem(SUBSCRIBED_KEY);
    if (subscribed === 'true') {
      setIsSubscribed(true);
    }
    // Hide for visitors arriving from daily brief email
    if (searchParams.get('ref') === 'email') {
      setIsSubscribed(true);
    }
  }, [searchParams]);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      // Get browser timezone for newsletter send time optimization
      let timezone: string | undefined;
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        // Timezone detection not supported
      }

      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, timezone }),
      });

      const data = await response.json();
      if (response.ok) {
        setStatus('success');
        setEmail('');
        localStorage.setItem(SUBSCRIBED_KEY, 'true');
        setIsSubscribed(true);
        // Track whether magic link was sent for success message
        setMagicLinkSent(data.accountCreated === true);
      } else {
        setErrorMessage(data.error || 'Failed to subscribe');
        setStatus('error');
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  // Don't show if already subscribed
  if (isSubscribed && status !== 'success') {
    return null;
  }

  if (status === 'success') {
    return (
      <div className={getContainerClasses(variant)}>
        <div className="text-center py-4">
          <p className="text-lg font-medium text-fg mb-1">You're in!</p>
          <p className="text-sm text-fg-muted">
            {magicLinkSent
              ? 'Check your inbox for a magic link to complete your account.'
              : 'You\'re subscribed to neighborhood stories.'
            }
          </p>
        </div>
      </div>
    );
  }

  if (variant === 'hero') {
    return (
      <div className="bg-surface text-fg py-12 px-4">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-light tracking-wide mb-3">
            Get Local Stories in Your Inbox
          </h2>
          <p className="text-fg-muted mb-6">
            {neighborhoodName
              ? `The best of ${neighborhoodName}, delivered twice weekly.`
              : 'Neighborhood news from the places you love, delivered twice weekly.'
            }
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 items-center justify-center">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full sm:w-auto sm:flex-1 px-4 py-3 bg-white text-black text-center sm:text-left placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-white"
              disabled={status === 'loading'}
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full sm:w-auto px-8 py-3 bg-white text-black text-sm tracking-widest uppercase hover:opacity-80 transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
            </button>
          </form>
          {status === 'error' && (
            <p className="text-red-400 text-sm mt-3">{errorMessage}</p>
          )}
          <p className="text-xs text-fg-subtle mt-4">
            Free forever. Unsubscribe anytime.
          </p>
        </div>
      </div>
    );
  }

  if (variant === 'sidebar') {
    return (
      <div className="bg-surface p-6">
        <h3 className="text-sm font-medium tracking-wide uppercase text-fg mb-3">
          Newsletter
        </h3>
        <p className="text-sm text-fg-muted mb-4">
          Get the latest stories delivered to your inbox twice weekly.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email"
            className="w-full px-3 py-2 text-sm bg-canvas border border-border text-fg placeholder:text-fg-subtle focus:outline-none focus:border-amber-500"
            disabled={status === 'loading'}
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full py-2 bg-black text-white text-xs tracking-widest uppercase hover:bg-elevated transition-colors disabled:opacity-50"
          >
            {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
          </button>
        </form>
        {status === 'error' && (
          <p className="text-red-600 text-xs mt-2">{errorMessage}</p>
        )}
      </div>
    );
  }

  // Minimal inline variant - just input and button
  if (variant === 'inline-minimal') {
    return (
      <div>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 justify-center items-center">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="px-4 py-2 bg-surface border border-border text-fg rounded-none text-center sm:text-left text-sm focus:outline-none focus:border-amber-500 placeholder:text-fg-subtle w-full sm:w-64"
            disabled={status === 'loading'}
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="px-6 py-2 bg-black text-white text-xs tracking-widest uppercase hover:bg-elevated transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {status === 'loading' ? '...' : 'Subscribe'}
          </button>
        </form>
        {status === 'error' && (
          <p className="text-red-600 text-xs mt-2 text-center">{errorMessage}</p>
        )}
      </div>
    );
  }

  // Default inline variant
  return (
    <div className={getContainerClasses(variant)}>
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-medium text-fg mb-1">
            {neighborhoodName
              ? `Get ${neighborhoodName} News`
              : 'Stay in the Loop'
            }
          </h3>
          <p className="text-sm text-fg-muted">
            Local stories delivered to your inbox twice weekly.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="px-4 py-2 bg-surface border border-border text-fg placeholder:text-fg-subtle focus:outline-none focus:border-amber-500 min-w-[200px]"
            disabled={status === 'loading'}
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="px-6 py-2 bg-black text-white text-sm tracking-wider uppercase hover:bg-elevated transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {status === 'loading' ? '...' : 'Subscribe'}
          </button>
        </form>
      </div>
      {status === 'error' && (
        <p className="text-red-600 text-sm mt-2">{errorMessage}</p>
      )}
    </div>
  );
}

function getContainerClasses(variant: string): string {
  switch (variant) {
    case 'hero':
      return '';
    case 'sidebar':
      return '';
    case 'footer':
      return 'py-6';
    default:
      return 'bg-surface border border-border p-6';
  }
}
