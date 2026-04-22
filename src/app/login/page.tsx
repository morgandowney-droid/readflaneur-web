'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';

function PasskeyIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="4" />
      <path d="M10 13c-4.42 0-8 1.79-8 4v2h10" />
      <path d="M17 15l2 2 4-4" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/feed';

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [supportsPasskey, setSupportsPasskey] = useState(false);
  const [showOtherMethods, setShowOtherMethods] = useState(false);

  // Redirect already-authenticated users
  useEffect(() => {
    async function checkSession() {
      try {
        const supabase = createClient();
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ]);
        if (session?.user) {
          window.location.href = redirect;
          return;
        }
        localStorage.removeItem('flaneur-auth');
      } catch { /* show form */ }
      setCheckingSession(false);
    }
    checkSession();

    // Check passkey support
    if (browserSupportsWebAuthn()) {
      setSupportsPasskey(true);
    }
  }, [redirect]);

  const handlePasskeyLogin = async () => {
    setError(null);
    setIsPasskeyLoading(true);
    try {
      // Get authentication options from server
      const optionsRes = await fetch('/api/auth/passkey/authenticate/options', { method: 'POST' });
      if (!optionsRes.ok) throw new Error('Failed to get passkey options');
      const options = await optionsRes.json();

      // Trigger browser passkey dialog
      const authResponse = await startAuthentication({ optionsJSON: options });

      // Verify with server
      const verifyRes = await fetch('/api/auth/passkey/authenticate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: authResponse }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Passkey verification failed');
      }

      const data = await verifyRes.json();

      // Write auth state to localStorage (same pattern as signin)
      localStorage.setItem('flaneur-auth', JSON.stringify({ id: data.user.id, email: data.user.email }));
      localStorage.setItem('flaneur-auth-method', 'passkey');
      if (data.is_subscribed) localStorage.setItem('flaneur-newsletter-subscribed', 'true');
      if (data.neighborhood_ids?.length) {
        localStorage.setItem('flaneur-neighborhood-preferences', JSON.stringify(data.neighborhood_ids));
      }
      localStorage.setItem('flaneur-onboarded', 'true');
      if (data.profile) {
        localStorage.setItem('flaneur-profile', JSON.stringify(data.profile));
        if (data.profile.theme) localStorage.setItem('flaneur-theme', data.profile.theme);
        if (data.profile.language) localStorage.setItem('flaneur-language', data.profile.language);
      }

      window.location.href = redirect;
    } catch (err) {
      // NotAllowedError = user cancelled the dialog, don't show error
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setIsPasskeyLoading(false);
        return;
      }
      setError(err instanceof Error ? err.message : 'Passkey login failed');
      setIsPasskeyLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setIsOAuthLoading(true);
    try {
      localStorage.setItem('flaneur-auth-method', 'google');
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        },
      });
      if (error) {
        setError(error.message);
        setIsOAuthLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsOAuthLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    setError(null);
    setIsLoading(true);

    try {
      // Send magic link via our API (uses admin.generateLink + Resend for deliverability)
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirect }),
      });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'Failed to send login link');
        setIsLoading(false);
        return;
      }

      localStorage.setItem('flaneur-auth-method', 'email');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="w-full max-w-sm flex justify-center py-10">
        <div className="w-5 h-5 border-2 border-fg-subtle border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-light text-fg mb-4">Check your email</h1>
        <p className="text-sm text-fg-muted mb-2">
          We sent a sign-in link to <span className="text-fg font-medium">{email}</span>
        </p>
        <p className="text-xs text-fg-subtle mb-8">Click the link in your email to sign in. Check spam if you don't see it.</p>
        <button
          onClick={() => { setSent(false); setIsLoading(false); }}
          className="text-xs text-fg-subtle hover:text-fg transition-colors"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-light text-center text-fg mb-10">Sign In</h1>

      {/* Primary: magic link email */}
      <form onSubmit={handleEmailSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg">
            {error}
          </div>
        )}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-4 py-3 border border-border-strong focus:border-accent focus:outline-none bg-surface text-fg rounded-lg"
          placeholder="Enter your email"
          autoFocus
        />

        <button
          type="submit"
          disabled={isLoading || !email.includes('@')}
          className="w-full bg-fg text-canvas py-3 text-sm tracking-widest uppercase hover:opacity-80 transition-colors disabled:opacity-50 rounded-lg"
        >
          {isLoading ? 'Sending...' : 'Continue with email'}
        </button>
      </form>

      <p className="text-xs text-fg-subtle text-center mt-6">
        No password needed. We'll send you a sign-in link.
      </p>

      {/* Other sign-in methods (collapsed) */}
      <div className="mt-10 pt-6 border-t border-border">
        <button
          type="button"
          onClick={() => setShowOtherMethods((v) => !v)}
          className="w-full text-center text-xs uppercase tracking-widest text-fg-subtle hover:text-fg transition-colors"
        >
          {showOtherMethods ? 'Hide other sign-in methods' : 'Other sign-in methods'}
        </button>

        {showOtherMethods && (
          <div className="mt-6 space-y-3">
            {supportsPasskey && (
              <button
                onClick={handlePasskeyLogin}
                disabled={isPasskeyLoading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border-strong rounded-lg hover:bg-hover transition-colors disabled:opacity-50"
              >
                <PasskeyIcon />
                <span className="text-sm text-fg">
                  {isPasskeyLoading ? 'Verifying...' : 'Sign in with passkey'}
                </span>
              </button>
            )}

            <button
              onClick={handleGoogleLogin}
              disabled={isOAuthLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border-strong rounded-lg hover:bg-hover transition-colors disabled:opacity-50"
            >
              <GoogleIcon />
              <span className="text-sm text-fg">
                {isOAuthLoading ? 'Redirecting...' : 'Continue with Google'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <Suspense fallback={<div>Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
