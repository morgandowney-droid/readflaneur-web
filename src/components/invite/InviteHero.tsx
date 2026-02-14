'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const REFERRAL_STORAGE_KEY = 'flaneur-referral-code';
const PREFS_KEY = 'flaneur-neighborhood-preferences';
const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';
const APP_URL = 'https://readflaneur.com';

export function InviteHero() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const refCode = searchParams.get('ref');

  // Inviter vs invitee mode
  const [isInviter, setIsInviter] = useState(false);
  const [inviterReady, setInviterReady] = useState(false);

  // Invitee state
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [statusDetail, setStatusDetail] = useState('');
  const tracked = useRef(false);

  // Inviter state
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [stats, setStats] = useState<{ clicks: number; conversions: number } | null>(null);

  // Detect inviter vs invitee on mount
  // Inviter = existing user (authenticated OR subscribed) without ?ref= param
  useEffect(() => {
    const hasRefParam = !!refCode;
    if (hasRefParam) {
      setInviterReady(true);
      return;
    }

    const subscribed = localStorage.getItem(SUBSCRIBED_KEY) === 'true';
    const hasNeighborhoods = !!localStorage.getItem(PREFS_KEY);

    if (subscribed || hasNeighborhoods) {
      setIsInviter(true);
      setInviterReady(true);
      return;
    }

    // Also check auth session for logged-in users who may not have localStorage flags
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setIsInviter(true);
      }
      setInviterReady(true);
    }, () => {
      setInviterReady(true);
    });
  }, [refCode]);

  // Fetch referral code for inviter mode
  const fetchCode = useCallback(async () => {
    const cached = localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (cached) {
      setReferralCode(cached);
      return cached;
    }

    setCodeLoading(true);
    try {
      const res = await fetch('/api/referral/code');
      if (res.ok) {
        const data = await res.json();
        if (data.code) {
          localStorage.setItem(REFERRAL_STORAGE_KEY, data.code);
          setReferralCode(data.code);
          return data.code;
        }
      }
    } catch {
      // Silent fail
    } finally {
      setCodeLoading(false);
    }
    return null;
  }, []);

  // Fetch stats for inviter mode
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/referral/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.clicks > 0 || data.conversions > 0) {
          setStats({ clicks: data.clicks, conversions: data.conversions });
        }
      }
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    if (isInviter) {
      fetchCode();
      fetchStats();
    }
  }, [isInviter, fetchCode, fetchStats]);

  // Track referral click for invitee
  useEffect(() => {
    if (!refCode || tracked.current) return;
    tracked.current = true;

    sessionStorage.setItem(REFERRAL_STORAGE_KEY, refCode);

    fetch('/api/referral/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: refCode }),
    }).catch(() => {});
  }, [refCode]);

  const referralUrl = referralCode ? `${APP_URL}/invite?ref=${referralCode}` : null;

  const handleCopy = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent fail
    }
  };

  const handleShare = async () => {
    const url = referralUrl || (referralCode ? `${APP_URL}/invite?ref=${referralCode}` : null);
    if (!url) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Check out Flaneur',
          text: 'Check out Flaneur - local stories from interesting neighborhoods around the world.',
          url,
        });
        return;
      } catch {
        // User cancelled - fall through to clipboard
      }
    }

    handleCopy();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setStatus('loading');
    setStatusDetail('');

    try {
      let neighborhoodIds: string[] = [];
      let welcomeCity = '';

      try {
        setStatusDetail('Finding neighborhoods near you...');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const detectRes = await fetch('/api/location/detect-and-match', {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (detectRes.ok) {
          const detectData = await detectRes.json();
          if (detectData.success && detectData.neighborhoods?.length) {
            neighborhoodIds = detectData.neighborhoods.map((n: { id: string }) => n.id);
            welcomeCity = detectData.city || detectData.neighborhoods[0].city;
            localStorage.setItem(PREFS_KEY, JSON.stringify(neighborhoodIds));
          }
        }
      } catch {
        // Location detection failed
      }

      setStatusDetail('Setting up your subscription...');
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, neighborhoodIds, timezone }),
      });

      const data = await res.json();

      if (data.success) {
        const code = sessionStorage.getItem(REFERRAL_STORAGE_KEY);
        if (code) {
          fetch('/api/referral/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, email }),
          }).catch(() => {});
          sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
        }

        localStorage.setItem(SUBSCRIBED_KEY, 'true');
        setStatus('success');
        setMessage('You are in. Check your email to verify.');

        const feedUrl = welcomeCity
          ? `/feed?welcome=${encodeURIComponent(welcomeCity)}`
          : '/feed';
        setTimeout(() => router.push(feedUrl), 2000);
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong.');
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  };

  // Don't render until we know which mode
  if (!inviterReady) return null;

  return (
    <section data-theme="dark" className="relative overflow-hidden bg-black text-white py-24 md:py-32 lg:py-40 px-6">
      {/* Gradient overlay for tonal depth */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at top, rgba(30,30,30,1), rgba(0,0,0,1) 70%)' }}
      />

      <div className="relative mx-auto max-w-3xl text-center">
        {isInviter ? (
          <>
            {/* Inviter mode - share experience */}
            <p className="hero-fade-in text-sm text-fg-subtle mb-6 font-light tracking-[0.3em] uppercase">
              Share Flaneur
            </p>

            <h1 className="hero-fade-in font-display text-6xl md:text-7xl lg:text-8xl font-light tracking-[0.3em] mb-6">
              FLANEUR
            </h1>

            <p className="hero-fade-in-delay-1 text-base md:text-lg text-fg-muted mb-4 font-light max-w-lg mx-auto leading-relaxed">
              Invite a friend to get local neighborhood stories delivered every morning.
            </p>

            <div className="hero-fade-in-delay-1 w-8 h-px bg-fg-subtle mx-auto mb-10" />

            <div className="hero-fade-in-delay-2 max-w-md mx-auto">
              {codeLoading ? (
                <p className="text-fg-subtle text-sm">Loading your invite link...</p>
              ) : referralUrl ? (
                <div className="space-y-4">
                  {/* Readonly invite link */}
                  <input
                    type="text"
                    readOnly
                    value={referralUrl}
                    className="w-full bg-white/5 border border-white/15 text-white/80 px-4 py-3 text-sm rounded-md text-center select-all focus:outline-none"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />

                  {/* Action buttons */}
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={handleCopy}
                      className="bg-white text-neutral-900 px-6 py-3 text-sm font-medium rounded-md hover:bg-amber-600 hover:text-white transition-colors shrink-0"
                    >
                      {copied ? 'Link copied!' : 'Copy Link'}
                    </button>
                    <button
                      onClick={handleShare}
                      className="bg-white/10 border border-white/15 text-white px-6 py-3 text-sm font-medium rounded-md hover:bg-white/20 transition-colors shrink-0"
                    >
                      Share
                    </button>
                  </div>

                  {/* Referral stats */}
                  {stats && (stats.clicks > 0 || stats.conversions > 0) && (
                    <p className="text-fg-subtle text-xs mt-4">
                      {stats.clicks > 0 && `${stats.clicks} click${stats.clicks !== 1 ? 's' : ''}`}
                      {stats.clicks > 0 && stats.conversions > 0 && ' · '}
                      {stats.conversions > 0 && `${stats.conversions} friend${stats.conversions !== 1 ? 's' : ''} joined`}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-fg-subtle text-sm">Could not load your invite link. Please try again later.</p>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Invitee mode - join form */}
            <p className="hero-fade-in text-sm text-fg-subtle mb-6 font-light tracking-[0.3em] uppercase">
              {refCode ? 'A friend invited you to' : 'You are invited to join'}
            </p>

            <h1 className="hero-fade-in font-display text-6xl md:text-7xl lg:text-8xl font-light tracking-[0.3em] mb-6">
              FLANEUR
            </h1>

            <p className="hero-fade-in-delay-1 text-base md:text-lg text-fg-muted mb-4 font-light max-w-lg mx-auto leading-relaxed">
              Daily local stories from the neighborhoods you care about, delivered every morning.
            </p>

            <div className="hero-fade-in-delay-1 w-8 h-px bg-fg-subtle mx-auto mb-10" />

            <div className="hero-fade-in-delay-2 max-w-md mx-auto">
              {status === 'success' ? (
                <div className="py-4">
                  <p className="text-fg text-lg">{message}</p>
                  <p className="text-fg-subtle text-sm mt-2">Redirecting to your feed...</p>
                </div>
              ) : (
                <>
                  <form onSubmit={handleSubmit} className="flex gap-3">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="flex-1 bg-white/5 border border-white/15 text-white px-4 py-3 text-sm rounded-md focus:outline-none focus:border-amber-500 transition-colors placeholder:text-neutral-600"
                      disabled={status === 'loading'}
                    />
                    <button
                      type="submit"
                      disabled={status === 'loading' || !email}
                      className="bg-white text-neutral-900 px-6 py-3 text-sm font-medium rounded-md hover:bg-amber-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {status === 'loading' ? 'Joining...' : 'Join'}
                    </button>
                  </form>
                  {status === 'error' && (
                    <p className="text-red-400 text-xs mt-2">{message}</p>
                  )}
                  {status === 'loading' && statusDetail && (
                    <p className="text-fg-subtle text-xs mt-3">{statusDetail}</p>
                  )}
                  {status === 'idle' && (
                    <p className="text-neutral-600 text-xs mt-3">
                      We will find neighborhoods near you automatically.
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
