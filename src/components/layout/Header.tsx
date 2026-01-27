'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { User } from '@supabase/supabase-js';

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    let retryCount = 0;
    const maxRetries = 3;

    // Get initial session with retry logic for AbortError
    const initAuth = async () => {
      while (retryCount < maxRetries && mounted) {
        try {
          const { data: { session }, error } = await supabase.auth.getSession();

          if (error) {
            // If it's an AbortError, retry
            if (error.name === 'AbortError' || error.message?.includes('aborted')) {
              retryCount++;
              console.log(`Header: Retry ${retryCount}/${maxRetries} after AbortError`);
              await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
              continue;
            }
            throw error;
          }

          if (!mounted) return;

          console.log('Header: Initial session check:', session?.user?.email || 'no session');
          setUser(session?.user ?? null);

          if (session?.user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', session.user.id)
              .single();
            if (mounted) {
              setIsAdmin(profile?.role === 'admin');
            }
          }
          break; // Success, exit retry loop
        } catch (err) {
          // Check if it's an AbortError
          if (err instanceof Error && (err.name === 'AbortError' || err.message?.includes('aborted'))) {
            retryCount++;
            console.log(`Header: Retry ${retryCount}/${maxRetries} after AbortError`);
            await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
            continue;
          }
          console.error('Header: Auth check error:', err);
          break;
        }
      }
      if (mounted) {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        console.log('Header: Auth state changed:', event, session?.user?.email || 'no session');
        setUser(session?.user ?? null);
        if (session?.user) {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', session.user.id)
              .single();
            if (mounted) {
              setIsAdmin(profile?.role === 'admin');
            }
          } catch {
            // Ignore errors in auth state change
          }
        } else {
          setIsAdmin(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    console.log('Sign out clicked');
    try {
      // Use server-side sign out to avoid client lock issues
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Sign out failed');
      }

      console.log('SignOut complete');
      setUser(null);
      setIsAdmin(false);
      // Full page reload to clear all client state
      window.location.href = '/';
    } catch (err) {
      console.error('Sign out error:', err);
      // Fallback: clear state and redirect anyway
      setUser(null);
      setIsAdmin(false);
      window.location.href = '/';
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-xl tracking-[0.3em] font-light">
          FLÂNEUR
        </Link>

        <nav className="flex items-center gap-6 ml-8">
          <Link
            href="/search"
            className={cn(
              'transition-colors hover:text-black',
              pathname === '/search' ? 'text-black' : 'text-neutral-400'
            )}
            title="Search"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </Link>
          <Link
            href="/neighborhoods"
            className={cn(
              'text-xs tracking-widest uppercase transition-colors hover:text-black',
              pathname === '/neighborhoods' ? 'text-black' : 'text-neutral-400'
            )}
          >
            Neighborhoods
          </Link>
          {pathname !== '/' && (
            <Link
              href="/advertise"
              className={cn(
                'text-xs tracking-widest uppercase transition-colors hover:text-black',
                pathname === '/advertise' ? 'text-black' : 'text-neutral-400'
              )}
            >
              Advertise
            </Link>
          )}

          {user ? (
            <div className="flex items-center gap-4">
              {isAdmin && (
                <Link
                  href="/admin/ads"
                  className={cn(
                    'text-xs tracking-widest uppercase transition-colors hover:text-black',
                    pathname.startsWith('/admin') ? 'text-black' : 'text-neutral-400'
                  )}
                >
                  Admin
                </Link>
              )}
              <Link
                href="/advertiser"
                className={cn(
                  'text-xs tracking-widest uppercase transition-colors hover:text-black',
                  pathname.startsWith('/advertiser') ? 'text-black' : 'text-neutral-400'
                )}
              >
                Dashboard
              </Link>
              <button
                onClick={handleSignOut}
                className="text-xs tracking-widest uppercase text-neutral-400 hover:text-black transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className={cn(
                'text-xs tracking-widest uppercase transition-colors hover:text-black',
                pathname === '/login' ? 'text-black' : 'text-neutral-400'
              )}
            >
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
