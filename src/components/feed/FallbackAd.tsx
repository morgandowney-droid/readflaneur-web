'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface FallbackAdProps {
  variant?: 'card' | 'story_open';
  position?: 'top' | 'bottom';
}

export function FallbackAd({ variant = 'card', position }: FallbackAdProps) {
  // 80% newsletter, 20% house ad
  const [showNewsletter] = useState(() => Math.random() < 0.8);

  if (showNewsletter) {
    return <NewsletterSignup variant={variant} />;
  }

  return <HouseAd variant={variant} />;
}

const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';

function NewsletterSignup({ variant }: { variant: 'card' | 'story_open' }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const searchParams = useSearchParams();

  // Check if already subscribed on mount or arrived from email
  useState(() => {
    if (typeof window !== 'undefined') {
      const subscribed = localStorage.getItem(SUBSCRIBED_KEY);
      if (subscribed === 'true') {
        setIsSubscribed(true);
      }
    }
    if (searchParams.get('ref') === 'email') {
      setIsSubscribed(true);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('loading');

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (response.ok) {
        setStatus('success');
        setEmail('');
        localStorage.setItem(SUBSCRIBED_KEY, 'true');
        setMagicLinkSent(data.accountCreated === true);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  // Don't show if already subscribed
  if (isSubscribed) {
    return null;
  }

  if (variant === 'story_open') {
    return (
      <div className="border border-neutral-200 bg-neutral-50 p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <p className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-2">
              Stay informed
            </p>
            <h3 className="font-semibold text-lg mb-1">
              Get local stories delivered to your inbox
            </h3>
            <p className="text-sm text-neutral-600">
              Weekly digest of the best stories from your neighborhood.
            </p>
          </div>
          {status === 'success' ? (
            <p className="text-green-600 text-sm">
              {magicLinkSent ? 'Check your inbox for a magic link!' : 'You\'re subscribed!'}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="px-4 py-2 border border-neutral-200 focus:border-black focus:outline-none text-sm w-48"
                disabled={status === 'loading'}
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="bg-black text-white px-4 py-2 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {status === 'loading' ? '...' : 'Subscribe'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Card variant
  return (
    <div className="border border-neutral-200 bg-neutral-50">
      <div className="px-3 py-2 border-b border-neutral-200">
        <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-400">
          Newsletter
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-sm mb-2">
          Get local stories in your inbox
        </h3>
        <p className="text-xs text-neutral-600 mb-4">
          Weekly digest from your neighborhood.
        </p>
        {status === 'success' ? (
          <p className="text-green-600 text-sm">
            {magicLinkSent ? 'Check your inbox for a magic link!' : 'You\'re subscribed!'}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-2 border border-neutral-200 focus:border-black focus:outline-none text-sm"
              disabled={status === 'loading'}
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-black text-white py-2 text-xs tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? '...' : 'Subscribe'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function HouseAd({ variant }: { variant: 'card' | 'story_open' }) {
  if (variant === 'story_open') {
    return (
      <a
        href="/advertise"
        className="block border border-neutral-200 bg-neutral-50 p-6 hover:border-black transition-colors"
      >
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <p className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-2">
              Reach local readers
            </p>
            <h3 className="font-semibold text-lg mb-1">
              Advertise with Flâneur
            </h3>
            <p className="text-sm text-neutral-600">
              Connect with engaged readers in your neighborhood.
            </p>
          </div>
          <span className="inline-block bg-black text-white px-6 py-2 text-sm tracking-widest uppercase">
            Learn More
          </span>
        </div>
      </a>
    );
  }

  // Card variant
  return (
    <a
      href="/advertise"
      className="block border border-neutral-200 bg-neutral-50 hover:border-black transition-colors"
    >
      <div className="px-3 py-2 border-b border-neutral-200">
        <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-400">
          Advertise
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-sm mb-2">
          Reach local readers
        </h3>
        <p className="text-xs text-neutral-600 mb-3">
          Connect with your neighborhood.
        </p>
        <span className="inline-block bg-black text-white px-4 py-2 text-xs tracking-widest uppercase">
          Learn More
        </span>
      </div>
    </a>
  );
}
