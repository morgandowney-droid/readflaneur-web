'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      console.log('Creating Supabase client...');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      console.log('Supabase URL:', supabaseUrl);
      console.log('Supabase Key exists:', !!supabaseKey);
      console.log('Supabase Key starts with:', supabaseKey?.substring(0, 10));

      if (!supabaseUrl || !supabaseKey) {
        setError('Configuration error: Supabase credentials not found. Please refresh the page.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();

      console.log('Attempting login for:', email);

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('Login response:', { data, authError });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
        return;
      }

      if (!data.session) {
        setError('Login failed - no session created');
        setIsLoading(false);
        return;
      }

      console.log('Session created successfully:', data.session.user.email);

      // Set the session server-side to ensure cookies are properly set
      try {
        const response = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          }),
        });

        if (!response.ok) {
          console.error('Failed to set server session');
        } else {
          console.log('Server session set successfully');
        }
      } catch (sessionErr) {
        console.error('Error setting server session:', sessionErr);
      }

      setSuccess(true);

      // Redirect after a brief delay to ensure cookies are set
      setTimeout(() => {
        window.location.href = redirect;
      }, 300);
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-light text-center mb-8">Sign In</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 text-sm text-green-600 bg-green-50 border border-green-200">
            Login successful! Redirecting...
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-xs tracking-widest uppercase text-neutral-400 mb-2"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs tracking-widest uppercase text-neutral-400 mb-2"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 border border-neutral-200 focus:border-black focus:outline-none"
            placeholder="Your password"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || success}
          className="w-full bg-black text-white py-3 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Signing in...' : success ? 'Redirecting...' : 'Sign In'}
        </button>
      </form>

      <div className="text-center mt-6 space-y-2">
        <p className="text-sm text-neutral-500">
          <Link href="/forgot-password" className="text-black hover:underline">
            Forgot your password?
          </Link>
        </p>
        <p className="text-sm text-neutral-500">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-black hover:underline">
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
