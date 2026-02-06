'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import type { User } from '@supabase/supabase-js';
import type { Section, Neighborhood } from '@/types';
import { useNeighborhoodModal } from '@/components/neighborhoods/NeighborhoodSelectorModal';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<Neighborhood[]>([]);
  const { scrollDirection, scrollY } = useScrollDirection({ threshold: 10 });
  const { openModal, isOpen: modalIsOpen } = useNeighborhoodModal();

  // Determine if we're on a feed page where hiding should be enabled
  const isFeedPage = pathname === '/feed' || pathname.match(/^\/[^/]+\/[^/]+$/);

  // Header should be visible when:
  // - At the top of the page (scrollY < 50)
  // - Scrolling up
  // - Mobile menu is open
  // - Not on a feed page
  const shouldHideHeader = isFeedPage && scrollDirection === 'down' && scrollY > 50 && !mobileMenuOpen;

  const handleNeighborhoodsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openModal();
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

    // Fetch sections
    const fetchSections = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('sections')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (data && mounted) {
        setSections(data as Section[]);
      }
    };
    fetchSections();

    // Fetch selected neighborhoods
    const fetchSelectedNeighborhoods = async () => {
      const supabase = createClient();

      // Get selected IDs from localStorage or database
      let selectedIds: string[] = [];

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from('user_neighborhood_preferences')
          .select('neighborhood_id')
          .eq('user_id', session.user.id);
        if (data) {
          selectedIds = data.map(p => p.neighborhood_id);
        }
      } else {
        const stored = localStorage.getItem(PREFS_KEY);
        if (stored) {
          try {
            selectedIds = JSON.parse(stored);
          } catch {
            // Invalid stored data
          }
        }
      }

      // Fetch neighborhood details for selected IDs
      if (selectedIds.length > 0) {
        const { data: neighborhoods } = await supabase
          .from('neighborhoods')
          .select('*')
          .in('id', selectedIds);
        if (neighborhoods && mounted) {
          setSelectedNeighborhoods(neighborhoods as Neighborhood[]);
        }
      }
    };
    fetchSelectedNeighborhoods();

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

  // Track previous modal state to detect when it closes
  const prevModalOpen = useRef(modalIsOpen);

  // Refetch selected neighborhoods when modal closes
  useEffect(() => {
    // Only refetch when modal was open and is now closed
    const wasOpen = prevModalOpen.current;
    prevModalOpen.current = modalIsOpen;

    if (!wasOpen || modalIsOpen) return;

    const refetchSelectedNeighborhoods = async () => {
      const supabase = createClient();

      let selectedIds: string[] = [];

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from('user_neighborhood_preferences')
          .select('neighborhood_id')
          .eq('user_id', session.user.id);
        if (data) {
          selectedIds = data.map(p => p.neighborhood_id);
        }
      } else {
        const stored = localStorage.getItem(PREFS_KEY);
        if (stored) {
          try {
            selectedIds = JSON.parse(stored);
          } catch {
            // Invalid stored data
          }
        }
      }

      if (selectedIds.length > 0) {
        const { data: neighborhoods } = await supabase
          .from('neighborhoods')
          .select('*')
          .in('id', selectedIds);
        if (neighborhoods) {
          setSelectedNeighborhoods(neighborhoods as Neighborhood[]);
        }
      } else {
        setSelectedNeighborhoods([]);
      }
    };

    refetchSelectedNeighborhoods();
  }, [modalIsOpen]);

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
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b border-neutral-200 bg-white',
        'transition-transform duration-300 ease-in-out',
        shouldHideHeader && '-translate-y-full'
      )}
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="font-display text-xl tracking-[0.35em] font-light hover:opacity-70 transition-opacity">
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
              'text-[11px] tracking-[0.2em] uppercase transition-colors hover:text-black min-h-[44px] flex items-center border-b-2',
              pathname === '/neighborhoods' || pathname === '/feed'
                ? 'text-black font-medium border-black'
                : 'text-neutral-500 border-transparent'
            )}
          >
            Neighborhoods
          </button>

          {user ? (
            <div className="flex items-center gap-4">
              {isAdmin && (
                <Link
                  href="/admin/ads"
                  className={cn(
                    'text-[11px] tracking-[0.2em] uppercase transition-colors hover:text-black min-h-[44px] flex items-center border-b-2',
                    pathname.startsWith('/admin') ? 'text-black font-medium border-black' : 'text-neutral-500 border-transparent'
                  )}
                >
                  Admin
                </Link>
              )}
              <Link
                href="/advertiser"
                className={cn(
                  'text-[11px] tracking-[0.2em] uppercase transition-colors hover:text-black min-h-[44px] flex items-center border-b-2',
                  pathname.startsWith('/advertiser') ? 'text-black font-medium border-black' : 'text-neutral-500 border-transparent'
                )}
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                className={cn(
                  'text-[11px] tracking-[0.2em] uppercase transition-colors hover:text-black min-h-[44px] flex items-center border-b-2',
                  pathname === '/settings' ? 'text-black font-medium border-black' : 'text-neutral-500 border-transparent'
                )}
              >
                Settings
              </Link>
              <button
                onClick={handleSignOut}
                className="text-[11px] tracking-[0.2em] uppercase text-neutral-500 hover:text-black transition-colors min-h-[44px]"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <>
              <Link
                href="/settings"
                className={cn(
                  'text-[11px] tracking-[0.2em] uppercase transition-colors hover:text-black min-h-[44px] flex items-center border-b-2',
                  pathname === '/settings' ? 'text-black font-medium border-black' : 'text-neutral-500 border-transparent'
                )}
              >
                Settings
              </Link>
              <Link
                href="/login"
                className={cn(
                  'text-[11px] tracking-[0.2em] uppercase transition-colors hover:text-black min-h-[44px] flex items-center',
                  pathname === '/login' ? 'text-black font-medium' : 'text-neutral-500'
                )}
              >
                Login
              </Link>
            </>
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
            {/* Selected Neighborhoods */}
            {selectedNeighborhoods.length > 0 && (
              <div className="py-4 border-b border-neutral-100">
                <p className="text-[10px] tracking-widest uppercase text-neutral-400 mb-3 text-right">
                  Your Neighborhoods
                </p>
                <div className="flex flex-wrap gap-2 justify-end">
                  {selectedNeighborhoods.slice(0, 6).map((hood) => (
                    <Link
                      key={hood.id}
                      href={`/feed?neighborhoods=${hood.id}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-black text-white"
                    >
                      <span>{hood.name}</span>
                    </Link>
                  ))}
                  {selectedNeighborhoods.length > 6 && (
                    <span className="text-xs text-neutral-400 py-1.5">
                      +{selectedNeighborhoods.length - 6} more
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    handleNeighborhoodsClick({ preventDefault: () => {} } as React.MouseEvent);
                    setMobileMenuOpen(false);
                  }}
                  className="mt-3 text-xs text-neutral-500 hover:text-black transition-colors block text-right w-full"
                >
                  Edit selections
                </button>
              </div>
            )}

            {/* Add Neighborhoods (when none selected) */}
            {selectedNeighborhoods.length === 0 && (
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
                Choose Neighborhoods
              </button>
            )}

            {/* Browse by Section */}
            {sections.length > 0 && (
              <div className="py-4 border-b border-neutral-100">
                <p className="text-[10px] tracking-widest uppercase text-neutral-400 mb-3 text-right">
                  Browse by Section
                </p>
                <div className="flex flex-wrap gap-2 justify-end">
                  {sections.map((section) => (
                    <Link
                      key={section.id}
                      href={`/feed?section=${section.slug}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors"
                    >
                      {section.icon && <span>{section.icon}</span>}
                      <span>{section.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
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
                <Link
                  href="/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'text-sm tracking-widest uppercase transition-colors hover:text-black py-4 border-b border-neutral-100 block text-right',
                    pathname === '/settings' ? 'text-black font-medium' : 'text-neutral-600'
                  )}
                >
                  Settings
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
              <>
                <Link
                  href="/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'text-sm tracking-widest uppercase transition-colors hover:text-black py-4 border-b border-neutral-100 block text-right',
                    pathname === '/settings' ? 'text-black font-medium' : 'text-neutral-600'
                  )}
                >
                  Settings
                </Link>
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
              </>
            )}
          </nav>
        </div>
      )}

    </header>
  );
}
