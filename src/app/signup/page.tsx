'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
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

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleOAuthSignup = async (provider: 'google' | 'apple') => {
    setError(null);
    setIsOAuthLoading(provider);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
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

    if (!captchaToken) {
      setError('Please complete the verification check.');
      return;
    }

    setIsLoading(true);

    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: 'reader',
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        captchaToken,
      },
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      turnstileRef.current?.reset();
      setCaptchaToken(null);
      return;
    }

    setSuccess(true);
    setIsLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-light text-fg mb-4">Check Your Email</h1>
          <p className="text-fg-muted mb-3">
            We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click the
            link to activate your account.
          </p>
          <p className="text-sm text-fg-subtle mb-6">
            Not seeing it? Check your spam or junk folder.
          </p>
          <Link
            href="/login"
            className="inline-block bg-fg text-canvas px-8 py-3 text-sm tracking-widest uppercase hover:opacity-80 transition-colors rounded-lg"
          >
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-light text-center text-fg mb-10">Create Account</h1>

        <button
          onClick={() => handleOAuthSignup('google')}
          disabled={isOAuthLoading === 'google'}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border-strong rounded-lg hover:bg-hover transition-colors disabled:opacity-50"
        >
          <GoogleIcon />
          <span className="text-sm text-fg">
            {isOAuthLoading === 'google' ? 'Redirecting...' : 'Continue with Google'}
          </span>
        </button>

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-fg-subtle uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="fullName"
              className="block text-xs tracking-widest uppercase text-fg-muted mb-2"
            >
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-4 py-3 border border-border-strong focus:border-amber-500 focus:outline-none bg-surface text-fg rounded-lg"
              placeholder="Your name"
            />
          </div>

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
              minLength={6}
              className="w-full px-4 py-3 border border-border-strong focus:border-amber-500 focus:outline-none bg-surface text-fg rounded-lg"
              placeholder="Minimum 6 characters"
            />
          </div>

          {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() && (
            <div className="flex justify-center">
              <Turnstile
                ref={turnstileRef}
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY.trim()}
                onSuccess={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)}
                options={{ theme: 'dark', size: 'flexible' }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() && !captchaToken)}
            className="w-full bg-fg text-canvas py-3 text-sm tracking-widest uppercase hover:opacity-80 transition-colors disabled:opacity-50 rounded-lg"
          >
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-fg-subtle mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-white hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
