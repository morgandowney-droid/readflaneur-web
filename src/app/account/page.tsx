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
  const [childcareEnabled, setChildcareEnabled] = useState(false);
  const [hasChildren, setHasChildren] = useState(false);
  const [prefsToken, setPrefsToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled && loading) setLoading(false);
    }, 5000);

    async function loadAccount() {
      const supabase = createClient();

      // getSession() with 3s timeout - navigator.locks can deadlock on mobile Safari
      let session = null;
      try {
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ]);
        session = data.session;
      } catch {
        // Timeout or error - check flaneur-auth flag below
      }

      // If GoTrue session failed, check simple auth flag
      let userId: string | null = session?.user?.id ?? null;
      let userEmail: string | null = session?.user?.email ?? null;

      if (!userId) {
        try {
          const authFlag = localStorage.getItem('flaneur-auth');
          if (authFlag) {
            const parsed = JSON.parse(authFlag);
            if (parsed.id) {
              userId = parsed.id;
              userEmail = parsed.email;
            }
          }
        } catch { /* ignore */ }
      }

      if (cancelled) return;

      if (!userId) {
        // Genuinely not logged in (no GoTrue session AND no flaneur-auth flag)
        setLoading(false);
        clearTimeout(timeout);
        return;
      }

      setEmail(userEmail);

      // Load profile data. Try Supabase client first (uses cookies).
      // If that fails (mobile Safari navigator.locks deadlock), fall back
      // to direct REST calls using the access token from GoTrue localStorage.
      let profileLoaded = false;
      try {
        const { data: profile } = await Promise.race([
          supabase
            .from('profiles')
            .select('primary_timezone, childcare_mode_enabled, email_unsubscribe_token')
            .eq('id', userId)
            .single(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ]);

        if (!cancelled && profile) {
          profileLoaded = true;
          if (profile.primary_timezone) setTimezone(profile.primary_timezone);
          if (profile.childcare_mode_enabled) {
            setChildcareEnabled(true);
            try { localStorage.setItem('flaneur-family-corner-enabled', 'true'); } catch { /* ignore */ }
          }
          if (profile.email_unsubscribe_token) setPrefsToken(profile.email_unsubscribe_token);
        }
      } catch {
        // Supabase client deadlocked or timed out
      }

      // Fallback: direct REST calls using GoTrue localStorage token
      if (!profileLoaded && !cancelled) {
        try {
          const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
          const storageKey = `sb-${ref}-auth-token`;
          const stored = localStorage.getItem(storageKey);
          const token = stored ? JSON.parse(stored)?.access_token : null;

          if (token) {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
            const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
            const headers = { 'apikey': anonKey, 'Authorization': `Bearer ${token}` };

            const [profileRes, childRes] = await Promise.all([
              fetch(
                `${supabaseUrl}/rest/v1/profiles?select=primary_timezone,childcare_mode_enabled,email_unsubscribe_token&id=eq.${userId}&limit=1`,
                { headers }
              ),
              fetch(
                `${supabaseUrl}/rest/v1/user_children?select=id&user_id=eq.${userId}&user_source=eq.profile&limit=1`,
                { headers }
              ),
            ]);

            if (!cancelled && profileRes.ok) {
              const profiles = await profileRes.json();
              const profile = profiles?.[0];
              if (profile) {
                if (profile.primary_timezone) setTimezone(profile.primary_timezone);
                if (profile.childcare_mode_enabled) {
                  setChildcareEnabled(true);
                  try { localStorage.setItem('flaneur-family-corner-enabled', 'true'); } catch { /* ignore */ }
                }
                if (profile.email_unsubscribe_token) setPrefsToken(profile.email_unsubscribe_token);
              }
            }
            if (!cancelled && childRes.ok) {
              const children = await childRes.json();
              if (Array.isArray(children) && children.length > 0) setHasChildren(true);
            }
          }
        } catch {
          // Direct REST also failed - graceful degradation
        }
      }

      // Check children via Supabase client (if not already loaded by REST fallback)
      if (profileLoaded) {
        try {
          const { count: childCount } = await supabase
            .from('user_children')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('user_source', 'profile');
          if (!cancelled && childCount && childCount > 0) setHasChildren(true);
        } catch { /* ignore */ }
      }

      if (!cancelled) {
        setIsSubscribed(localStorage.getItem('flaneur-newsletter-subscribed') === 'true');
        setLoading(false);
        clearTimeout(timeout);
      }
    }

    loadAccount();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      // Clear client-side auth tokens first (handles split-brain)
      try {
        const supabase = createClient();
        await Promise.race([
          supabase.auth.signOut(),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      } catch { /* continue */ }

      // Clear server-side cookies
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      await fetch('/api/auth/signout', { method: 'POST', signal: controller.signal }).catch(() => {});
      clearTimeout(timeout);
    } catch {
      // Continue to redirect regardless
    }
    // Clear simple auth flag
    localStorage.removeItem('flaneur-auth');
    window.location.href = '/';
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
        <p className="text-fg-muted text-sm">Sign in to view your account.</p>
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
              <p className="text-[11px] text-fg-muted mt-1">Your Daily Brief and Sunday Edition emails arrive at 7 am in this timezone.</p>
            </div>
          )}

          <div>
            <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle mb-1">Newsletter</p>
            <p className="text-sm text-fg">
              {isSubscribed ? 'Subscribed' : 'Not subscribed'}
            </p>
          </div>

          {prefsToken && (
            <div>
              <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle mb-1">Email Preferences</p>
              <Link
                href={`/email/preferences?token=${prefsToken}`}
                className="text-[11px] text-accent hover:underline"
              >
                Manage neighborhoods, topics, and email settings &rsaquo;
              </Link>
            </div>
          )}

          <div>
            <p className="text-[10px] tracking-[0.2em] uppercase text-fg-subtle mb-1">Family Corner</p>
            <p className="text-sm text-fg">
              {childcareEnabled ? 'Enabled' : (hasChildren ? 'Paused' : 'Off')}
            </p>
            <p className="text-[11px] text-fg-muted mt-1">
              Enabling Family Corner adds a family section to your Daily Brief with local kids&apos; events, school news, and family resources tailored to your children&apos;s ages.
            </p>
            {prefsToken && (
              <Link
                href={`/email/preferences?token=${prefsToken}#family-corner`}
                className="text-[11px] text-accent hover:underline mt-1.5 inline-block"
              >
                {childcareEnabled ? 'Manage Family Corner' : 'Enable Family Corner'} &rsaquo;
              </Link>
            )}
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
