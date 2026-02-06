'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';

// Serializable fallback data passed from server components
export interface FallbackData {
  source: 'bonus' | 'house_ad' | 'default';
  houseAd?: {
    id: string;
    type: string;
    headline: string;
    body: string | null;
    image_url: string | null;
    click_url: string;
  };
  bonusAd?: {
    id: string;
    image_url: string;
    headline: string;
    click_url: string;
    sponsor_label: string;
    is_bonus: true;
  };
}

interface FallbackAdProps {
  variant?: 'card' | 'story_open';
  position?: 'top' | 'bottom';
  fallback?: FallbackData;
}

export function FallbackAd({ variant = 'card', position, fallback }: FallbackAdProps) {
  // If server provided a bonus ad, render it like a paid ad
  if (fallback?.source === 'bonus' && fallback.bonusAd) {
    return <BonusAdDisplay ad={fallback.bonusAd} variant={variant} />;
  }

  // If server provided a house ad from DB, render it
  if (fallback?.source === 'house_ad' && fallback.houseAd) {
    return <HouseAdDisplay houseAd={fallback.houseAd} variant={variant} />;
  }

  // Default: existing 80/20 newsletter/house-ad logic
  return <DefaultFallback variant={variant} />;
}

// ─── Default Fallback (existing behavior) ───

function DefaultFallback({ variant }: { variant: 'card' | 'story_open' }) {
  const [showNewsletter] = useState(() => Math.random() < 0.8);

  if (showNewsletter) {
    return <NewsletterSignup variant={variant} />;
  }

  return <StaticHouseAd variant={variant} />;
}

// ─── Bonus Ad Display (mirrors StoryOpenAd visual style) ───

function BonusAdDisplay({ ad, variant }: { ad: NonNullable<FallbackData['bonusAd']>; variant: 'card' | 'story_open' }) {
  const handleClick = () => {
    window.open(ad.click_url, '_blank', 'noopener,noreferrer');
  };

  if (variant === 'story_open') {
    return (
      <div
        className="bg-neutral-50 border border-neutral-200 overflow-hidden cursor-pointer hover:border-neutral-300 transition-colors"
        onClick={handleClick}
      >
        <div className="flex flex-col sm:flex-row">
          {ad.image_url && (
            <div className="relative w-full sm:w-48 aspect-video sm:aspect-square flex-shrink-0">
              <Image
                src={ad.image_url}
                alt={ad.headline}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 192px"
              />
            </div>
          )}
          <div className="flex-1 p-4 flex flex-col justify-center">
            <p className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 mb-2">
              Sponsored by {ad.sponsor_label}
            </p>
            <h3 className="font-semibold text-lg mb-1">{ad.headline}</h3>
            <span className="text-xs text-neutral-400 mt-2">
              Learn more &rarr;
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Card variant
  return (
    <div
      className="border border-neutral-200 bg-neutral-50 overflow-hidden cursor-pointer hover:border-neutral-300 transition-colors"
      onClick={handleClick}
    >
      <div className="px-3 py-2 border-b border-neutral-200">
        <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-400">
          Sponsored by {ad.sponsor_label}
        </span>
      </div>
      {ad.image_url && (
        <div className="relative w-full aspect-video">
          <Image
            src={ad.image_url}
            alt={ad.headline}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 400px"
          />
        </div>
      )}
      <div className="p-4">
        <h3 className="font-semibold text-sm">{ad.headline}</h3>
      </div>
    </div>
  );
}

// ─── House Ad Display (DB-sourced, Flaneur-branded) ───

function HouseAdDisplay({ houseAd, variant }: { houseAd: NonNullable<FallbackData['houseAd']>; variant: 'card' | 'story_open' }) {
  if (variant === 'story_open') {
    return (
      <a
        href={houseAd.click_url}
        className="block border border-neutral-200 bg-neutral-50 p-6 hover:border-black transition-colors"
      >
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <p className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-2">
              Flaneur
            </p>
            <h3 className="font-semibold text-lg mb-1">{houseAd.headline}</h3>
            {houseAd.body && (
              <p className="text-sm text-neutral-600">{houseAd.body}</p>
            )}
          </div>
          <span className="inline-block bg-black text-white px-6 py-2 text-sm tracking-widest uppercase whitespace-nowrap">
            Learn More
          </span>
        </div>
      </a>
    );
  }

  // Card variant
  return (
    <a
      href={houseAd.click_url}
      className="block border border-neutral-200 bg-neutral-50 hover:border-black transition-colors"
    >
      <div className="px-3 py-2 border-b border-neutral-200">
        <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-400">
          Flaneur
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-sm mb-2">{houseAd.headline}</h3>
        {houseAd.body && (
          <p className="text-xs text-neutral-600 mb-3">{houseAd.body}</p>
        )}
        <span className="inline-block bg-black text-white px-4 py-2 text-xs tracking-widest uppercase">
          Learn More
        </span>
      </div>
    </a>
  );
}

// ─── Newsletter Signup (existing) ───

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

// ─── Static House Ad (existing, for default fallback) ───

function StaticHouseAd({ variant }: { variant: 'card' | 'story_open' }) {
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
              Advertise with Flaneur
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
