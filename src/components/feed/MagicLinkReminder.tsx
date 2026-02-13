'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';

export function MagicLinkReminder() {
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      setIsSignedIn(!!session?.user);
    };
    checkAuth();
  }, []);

  const handleResend = async () => {
    if (!email || !email.includes('@')) return;

    setStatus('sending');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/feed`,
        },
      });

      if (error) throw error;
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  // Don't show anything while loading or if signed in
  if (isSignedIn === null || isSignedIn) {
    return null;
  }

  return (
    <div className="text-center py-6 mb-4">
      {status === 'sent' ? (
        <p className="text-sm text-green-400">Check your inbox - a sign-in link is on the way.</p>
      ) : status === 'error' ? (
        <p className="text-sm text-red-400">Something went wrong. Please try again.</p>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-fg-muted">
            {t('email.getFresh')}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleResend()}
              placeholder={t('email.enterEmail')}
              className="px-3 py-2 bg-surface border border-border-strong text-sm text-white placeholder-fg-subtle rounded-lg w-56 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
            <button
              onClick={handleResend}
              disabled={status === 'sending' || !email}
              className="px-4 py-2 text-xs tracking-wider uppercase font-medium bg-fg text-canvas hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-lg"
            >
              {status === 'sending' ? '...' : t('email.subscribe')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
