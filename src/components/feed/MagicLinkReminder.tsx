'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function MagicLinkReminder() {
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
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
    <div className="text-xs text-neutral-400 mt-2">
      {status === 'sent' ? (
        <p className="text-green-600">Magic link sent! Check your inbox.</p>
      ) : status === 'error' ? (
        <p className="text-red-600">Failed to send. Please try again.</p>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p>Haven't received your magic link?</p>
          <div className="flex gap-2 items-center">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="px-2 py-1 border border-neutral-300 text-xs rounded w-40"
            />
            <button
              onClick={handleResend}
              disabled={status === 'sending' || !email}
              className="text-black underline hover:no-underline disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending...' : 'Resend'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
