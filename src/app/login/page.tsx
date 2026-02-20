'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { createClient } from '@/lib/supabase/client';

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

function AppleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const turnstileRef = useRef<TurnstileInstance>(null);

  // Redirect already-authenticated users — only via getSession (real cookie check).
  // Do NOT check flaneur-auth here: if cookies expired, flaneur-auth creates a
  // redirect loop (login → / → /feed → sees SIGN IN → /login → flaneur-auth → /).
  // If getSession returns null (expired), clear stale flaneur-auth and show form.
  useEffect(() => {
    async function checkSession() {
      try {
        const supabase = createClient();
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ]);
        if (session?.user) {
          // Real valid session — redirect
          window.location.href = redirect === '/' ? '/feed' : redirect;
          return;
        }
        // Session null = expired cookies. Clear stale flaneur-auth so Header
        // doesn't show "Account" pointing to a broken session.
        localStorage.removeItem('flaneur-auth');
      } catch {
        // Timeout or error — show login form, don't clear flaneur-auth
        // (could be a transient navigator.locks issue)
      }
      setCheckingSession(false);
    }
    checkSession();
  }, [redirect]);

  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    setError(null);
    setIsOAuthLoading(provider);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        },
      });

      if (error) {
        setError(error.message);
        setIsOAuthLoading(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsOAuthLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Turnstile token is sent to server if available, but not required.
    // Server validates it when present; skips if widget didn't render.

    setIsLoading(true);

    try {
      const target = redirect === '/' ? '/feed' : redirect;

      // Server-only sign-in: zero navigator.locks calls.
      // POST to /api/auth/signin which validates credentials via GoTrue REST API
      // (service role key) and sets auth cookies on the response.
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, captchaToken }),
        credentials: 'same-origin',
      });
      const result = await res.json();

      if (!res.ok || !result.access_token) {
        setError(result.error || 'Sign in failed');
        setIsLoading(false);
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        return;
      }

      // Write flaneur-auth flag + GoTrue localStorage key for Header.
      // No navigator.locks — just plain localStorage writes.
      try {
        if (result.user) {
          localStorage.setItem('flaneur-auth', JSON.stringify({
            id: result.user.id,
            email: result.user.email,
          }));
        }
        const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
        const storageKey = `sb-${ref}-auth-token`;
        localStorage.setItem(storageKey, JSON.stringify({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
          token_type: result.token_type || 'bearer',
          expires_in: result.expires_in,
          expires_at: result.expires_at,
          user: result.user,
        }));
      } catch {
        // Non-critical — cookies are already set by server response
      }

      setSuccess(true);

      // Full page navigation — cookies are set, flaneur-auth is set,
      // Header will read flaneur-auth instantly on next page load.
      window.location.href = target;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsLoading(false);
      turnstileRef.current?.reset();
      setCaptchaToken(null);
    }
  };

  if (checkingSession) {
    return (
      <div className="w-full max-w-sm flex justify-center py-10">
        <div className="w-5 h-5 border-2 border-fg-subtle border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-light text-center text-fg mb-10">Sign In</h1>

      {/* OAuth buttons hidden pre-launch — Google & Apple login fully implemented and ready to re-enable */}

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 text-sm text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="text-center py-3">
            <p className="text-sm text-fg-muted tracking-wide">Welcome back. Redirecting...</p>
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-xs tracking-widest uppercase text-fg-muted mb-2"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 border border-border-strong focus:border-amber-500 focus:outline-none bg-surface text-fg rounded-lg"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs tracking-widest uppercase text-fg-muted mb-2"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 border border-border-strong focus:border-amber-500 focus:outline-none bg-surface text-fg rounded-lg"
            placeholder="Your password"
          />
        </div>

        {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
          <div className="flex justify-center">
            <Turnstile
              ref={turnstileRef}
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
              onSuccess={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
              options={{ theme: 'dark', size: 'flexible' }}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || success}
          className="w-full bg-fg text-canvas py-3 text-sm tracking-widest uppercase hover:opacity-80 transition-colors disabled:opacity-50 rounded-lg"
        >
          {isLoading ? 'Signing in...' : success ? 'Redirecting...' : 'Sign In'}
        </button>
      </form>

      <div className="text-center mt-6 space-y-2">
        <p className="text-sm text-fg-subtle">
          <Link href="/forgot-password" className="text-white hover:underline">
            Forgot your password?
          </Link>
        </p>
        <p className="text-sm text-fg-subtle">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-white hover:underline">
            Sign up
          </Link>
        </p>
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
