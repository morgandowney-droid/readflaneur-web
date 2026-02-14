'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';

export default function AccountPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) setLoading(false);
    }, 5000);

    async function loadAccount() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          setLoading(false);
          clearTimeout(timeout);
          return;
        }

        setEmail(session.user.email ?? null);

        const { data: profile } = await supabase
          .from('profiles')
          .select('primary_timezone')
          .eq('id', session.user.id)
          .single();

        if (profile?.primary_timezone) {
          setTimezone(profile.primary_timezone);
        }
      } catch {
        // Silent fail
      }

      setIsSubscribed(localStorage.getItem('flaneur-newsletter-subscribed') === 'true');
      setLoading(false);
      clearTimeout(timeout);
    }

    loadAccount();
    return () => clearTimeout(timeout);
  }, [loading]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      const response = await fetch('/api/auth/signout', { method: 'POST' });
      if (!response.ok) throw new Error('Sign out failed');
      window.location.href = '/';
    } catch {
      window.location.href = '/';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-fg-subtle border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!email) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-fg-muted text-sm">{t('nav.signIn')} to view your account.</p>
        <Link href="/login" className="text-accent text-sm hover:underline">
          {t('nav.signIn')}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-lg mx-auto w-full px-4 pt-8 pb-16 flex-1 flex flex-col">
        {/* Back link */}
        <Link
          href="/feed"
          className="text-xs tracking-[0.15em] uppercase text-fg-muted hover:text-fg transition-colors mb-12 inline-flex items-center gap-1.5"
        >
          <span>&larr;</span> {t('feed.allStories')}
        </Link>

        {/* Account heading */}
        <h1 className="font-display text-2xl tracking-[0.2em] font-light mb-10">
          {t('nav.account')}
        </h1>

        {/* Account details */}
        <div className="space-y-6">
          <div>
            <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle mb-1">Email</p>
            <p className="text-sm text-fg">{email}</p>
          </div>

          {timezone && (
            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle mb-1">Timezone</p>
              <p className="text-sm text-fg">{timezone.replace(/_/g, ' ')}</p>
            </div>
          )}

          <div>
            <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle mb-1">Newsletter</p>
            <p className="text-sm text-fg">
              {isSubscribed ? 'Subscribed' : 'Not subscribed'}
            </p>
          </div>
        </div>

        {/* Sign out at the very bottom */}
        <div className="mt-auto pt-16">
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-fg-subtle text-sm hover:text-fg-muted transition-colors disabled:opacity-50"
          >
            {signingOut ? '...' : t('nav.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}
