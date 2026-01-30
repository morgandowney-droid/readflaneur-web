'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { SubmitTipButton } from '@/components/tips';
import TipSubmitModal from '@/components/tips/TipSubmitModal';
import type { User } from '@supabase/supabase-js';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tipModalOpen, setTipModalOpen] = useState(false);

  const handleNeighborhoodsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Check for saved neighborhood preferences
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) {
      try {
        const selected = JSON.parse(stored);
        if (Array.isArray(selected) && selected.length > 0) {
          // Go directly to feed with selected neighborhoods
          router.push(`/feed?neighborhoods=${selected.join(',')}`);
          return;
        }
      } catch {
        // Invalid stored data, fall through to neighborhoods page
      }
    }
    // No selection, go to neighborhoods page
    router.push('/neighborhoods');
  };

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

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/search"
            className={cn(
              'transition-colors hover:text-black min-w-[44px] min-h-[44px] flex items-center justify-center',
              pathname === '/search' ? 'text-black' : 'text-neutral-400'
            )}
            title="Search"
            aria-label="Search articles"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </Link>
          <button
            onClick={handleNeighborhoodsClick}
            className={cn(
              'text-xs tracking-widest uppercase transition-colors hover:text-black min-h-[44px] flex items-center',
              pathname === '/neighborhoods' || pathname === '/feed' ? 'text-black' : 'text-neutral-400'
            )}
          >
            Neighborhoods
          </button>
          <SubmitTipButton variant="header" />

          {user ? (
            <div className="flex items-center gap-4">
              {isAdmin && (
                <Link
                  href="/admin/ads"
                  className={cn(
                    'text-xs tracking-widest uppercase transition-colors hover:text-black min-h-[44px] flex items-center',
                    pathname.startsWith('/admin') ? 'text-black' : 'text-neutral-400'
                  )}
                >
                  Admin
                </Link>
              )}
              <Link
                href="/advertiser"
                className={cn(
                  'text-xs tracking-widest uppercase transition-colors hover:text-black min-h-[44px] flex items-center',
                  pathname.startsWith('/advertiser') ? 'text-black' : 'text-neutral-400'
                )}
              >
                Dashboard
              </Link>
              <button
                onClick={handleSignOut}
                className="text-xs tracking-widest uppercase text-neutral-400 hover:text-black transition-colors min-h-[44px]"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className={cn(
                'text-xs tracking-widest uppercase transition-colors hover:text-black min-h-[44px] flex items-center',
                pathname === '/login' ? 'text-black' : 'text-neutral-400'
              )}
            >
              Login
            </Link>
          )}
        </nav>

        {/* Mobile Navigation */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            href="/search"
            className={cn(
              'transition-colors hover:text-black min-w-[44px] min-h-[44px] flex items-center justify-center',
              pathname === '/search' ? 'text-black' : 'text-neutral-400'
            )}
            aria-label="Search articles"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-600 hover:text-black"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-neutral-200 bg-white">
          <nav className="flex flex-col px-4">
            <button
              onClick={() => {
                handleNeighborhoodsClick({ preventDefault: () => {} } as React.MouseEvent);
                setMobileMenuOpen(false);
              }}
              className={cn(
                'text-sm tracking-widest uppercase transition-colors hover:text-black text-right py-4 border-b border-neutral-100',
                pathname === '/neighborhoods' || pathname === '/feed' ? 'text-black font-medium' : 'text-neutral-600'
              )}
            >
              Neighborhoods
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                setTipModalOpen(true);
              }}
              className="text-sm tracking-widest uppercase text-neutral-600 hover:text-black transition-colors text-right py-4 border-b border-neutral-100"
            >
              Submit a Tip
            </button>
            {user ? (
              <>
                {isAdmin && (
                  <Link
                    href="/admin/ads"
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'text-sm tracking-widest uppercase transition-colors hover:text-black py-4 border-b border-neutral-100 block text-right',
                      pathname.startsWith('/admin') ? 'text-black font-medium' : 'text-neutral-600'
                    )}
                  >
                    Admin
                  </Link>
                )}
                <Link
                  href="/advertiser"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'text-sm tracking-widest uppercase transition-colors hover:text-black py-4 border-b border-neutral-100 block text-right',
                    pathname.startsWith('/advertiser') ? 'text-black font-medium' : 'text-neutral-600'
                  )}
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => {
                    handleSignOut();
                    setMobileMenuOpen(false);
                  }}
                  className="text-sm tracking-widest uppercase text-neutral-600 hover:text-black transition-colors text-right py-4 w-full"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'text-sm tracking-widest uppercase transition-colors hover:text-black py-4 block text-right',
                  pathname === '/login' ? 'text-black font-medium' : 'text-neutral-600'
                )}
              >
                Login
              </Link>
            )}
          </nav>
        </div>
      )}

      {/* Tip Modal for mobile menu */}
      <TipSubmitModal
        isOpen={tipModalOpen}
        onClose={() => setTipModalOpen(false)}
      />
    </header>
  );
}
