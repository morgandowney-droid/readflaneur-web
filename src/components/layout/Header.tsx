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
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { WishlistDropdown } from '@/components/layout/WishlistDropdown';
import { useTranslation } from '@/hooks/useTranslation';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

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
  const { t } = useTranslation();

  // Determine if we're on a feed page where hiding should be enabled
  const isFeedPage = pathname === '/feed' || pathname.match(/^\/[^/]+\/[^/]+$/);

  // Header should be visible when:
  // - At the top of the page (scrollY < 50)
  // - Scrolling up
  // - Mobile menu is open
  // - Not on a feed page
  const shouldHideHeader = isFeedPage && scrollDirection === 'down' && scrollY > 50 && !mobileMenuOpen;

  // Sync header offset CSS variable so sticky pills can track the header position
  useEffect(() => {
    document.documentElement.style.setProperty('--header-offset', shouldHideHeader ? '0px' : '64px');
  }, [shouldHideHeader]);

  // Close mobile menu on significant scroll (50px+ delta to avoid false triggers)
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const scrollStart = window.scrollY;
    const handleScroll = () => {
      if (Math.abs(window.scrollY - scrollStart) > 50) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [mobileMenuOpen]);

  const handleNeighborhoodsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openModal();
  };

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    const fetchAdminRole = async (userId: string) => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();
        if (mounted) {
          setIsAdmin(profile?.role === 'admin');
        }
      } catch {
        // Ignore errors
      }
    };

    // Auth strategy: flaneur-auth localStorage flag FIRST (instant, no locks),
    // then getSession() in background to upgrade to full User object.
    // This prevents the "SIGN IN" flash when JWT cookies have expired but
    // the user is still authenticated (refresh token + flaneur-auth exist).
    const initAuth = async () => {
      // Step 1: Check flaneur-auth synchronously (instant)
      let authFlagUser: { id: string; email: string } | null = null;
      try {
        const authFlag = localStorage.getItem('flaneur-auth');
        if (authFlag) {
          const parsed = JSON.parse(authFlag);
          if (parsed?.id) {
            authFlagUser = parsed;
            // Show "Account" immediately — no 3s spinner
            setUser({ id: parsed.id, email: parsed.email } as User);
            fetchAdminRole(parsed.id);
            setLoading(false);
          }
        }
      } catch {
        // Auth flag missing or invalid
      }

      // Step 2: Try getSession in background (3s timeout) to upgrade to full User
      try {
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ]);
        if (!mounted) return;
        if (session?.user) {
          // Upgrade to full User object (has metadata, confirmed_at, etc.)
          setUser(session.user);
          fetchAdminRole(session.user.id);
        }
        // If session is null (expired JWT), keep flaneur-auth user — don't clear.
        // Sign-out goes through /account which clears everything explicitly.
      } catch {
        // getSession deadlocked or timed out — keep flaneur-auth user if set
      }

      // If no flaneur-auth was found either, clear loading
      if (mounted && !authFlagUser) {
        setLoading(false);
      }
    };

    initAuth();

    // Fetch selected neighborhoods — use localStorage directly (no getSession lock)
    const fetchSelectedNeighborhoods = async () => {
      let selectedIds: string[] = [];

      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        try {
          selectedIds = JSON.parse(stored);
        } catch {
          // Invalid stored data
        }
      }

      if (selectedIds.length > 0) {
        try {
          const { data: neighborhoods } = await supabase
            .from('neighborhoods')
            .select('*')
            .in('id', selectedIds);
          if (neighborhoods && mounted) {
            setSelectedNeighborhoods(neighborhoods as Neighborhood[]);
          }
        } catch {
          // Ignore
        }
      }
    };
    fetchSelectedNeighborhoods();

    // Listen for auth changes — handles:
    // 1. Login events via shared singleton (router.push flow from /login)
    // 2. Token refreshes
    // 3. Sessions that initAuth missed (getSession timeout)
    // Never sets user to null: sign-out works via full page reload from /account.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (session?.user) {
          setUser(session.user);
          setLoading(false); // Clear loading in case initAuth timed out
          fetchAdminRole(session.user.id);

          // On login, sync DB neighborhood preferences to localStorage + cookie.
          // DB is authoritative - overwrites whatever localStorage has.
          if (event === 'SIGNED_IN') {
            try {
              const { data: dbPrefs } = await supabase
                .from('user_neighborhood_preferences')
                .select('neighborhood_id, sort_order')
                .order('sort_order', { ascending: true });

              if (dbPrefs && dbPrefs.length > 0) {
                const dbIds = dbPrefs.map(p => p.neighborhood_id);
                localStorage.setItem(PREFS_KEY, JSON.stringify(dbIds));
                document.cookie = `flaneur-neighborhoods=${dbIds.join(',')};path=/;max-age=31536000;SameSite=Strict`;
                fetchSelectedNeighborhoods();
              }
            } catch {
              // Non-critical
            }
          }
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

    // Read from localStorage directly — avoids getSession() lock hang
    const refetchSelectedNeighborhoods = async () => {
      const supabase = createClient();
      let selectedIds: string[] = [];

      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        try {
          selectedIds = JSON.parse(stored);
        } catch {
          // Invalid stored data
        }
      }

      if (selectedIds.length > 0) {
        try {
          const { data: neighborhoods } = await supabase
            .from('neighborhoods')
            .select('*')
            .in('id', selectedIds);
          if (neighborhoods) {
            setSelectedNeighborhoods(neighborhoods as Neighborhood[]);
          }
        } catch {
          // Ignore
        }
      } else {
        setSelectedNeighborhoods([]);
      }
    };

    refetchSelectedNeighborhoods();
  }, [modalIsOpen]);


  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b border-border header-bg',
        'transition-transform duration-300 ease-in-out',
        shouldHideHeader && '-translate-y-full'
      )}
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/feed" className="font-display text-xl tracking-[0.35em] font-light hover:opacity-70 transition-opacity">
          FLÂNEUR
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/search"
            className={cn(
              'transition-colors hover:text-fg min-w-[44px] min-h-[44px] flex items-center justify-center',
              pathname === '/search' ? 'text-fg' : 'text-fg-muted'
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
              'text-[11px] tracking-[0.2em] uppercase transition-colors hover:text-fg min-h-[44px] flex items-center border-b-2',
              pathname === '/neighborhoods' || pathname === '/feed'
                ? 'text-fg font-medium border-accent'
                : 'text-fg-subtle border-transparent'
            )}
          >
            {t('nav.neighborhoods')}
          </button>
          <Link
            href="/destinations"
            className={cn(
              'text-[11px] tracking-[0.2em] uppercase transition-colors hover:text-fg min-h-[44px] flex items-center border-b-2',
              pathname === '/destinations'
                ? 'text-fg font-medium border-accent'
                : 'text-fg-subtle border-transparent'
            )}
          >
            {t('nav.destinations')}
          </Link>
          {user && isAdmin && (
            <Link
              href="/admin/ads"
              data-admin
              className={cn(
                'text-[11px] tracking-[0.2em] uppercase transition-colors hover:text-fg min-h-[44px] flex items-center border-b-2',
                pathname.startsWith('/admin') ? 'text-fg font-medium border-accent' : 'text-fg-subtle border-transparent'
              )}
            >
              Admin
            </Link>
          )}
          {user && isAdmin && (
            <Link
              href="/advertiser"
              data-admin
              className={cn(
                'text-[11px] tracking-[0.2em] uppercase transition-colors hover:text-fg min-h-[44px] flex items-center border-b-2',
                pathname.startsWith('/advertiser') ? 'text-fg font-medium border-accent' : 'text-fg-subtle border-transparent'
              )}
            >
              Dashboard
            </Link>
          )}
          <Link
            href="/feed"
            className={cn(
              'text-[11px] tracking-[0.2em] uppercase transition-colors hover:text-fg min-h-[44px] flex items-center border-b-2',
              pathname === '/feed' ? 'text-fg font-medium border-accent' : 'text-fg-subtle border-transparent'
            )}
          >
            {t('nav.stories')}
          </Link>
          {/* Icon controls - LC pattern: heart then person then theme/language */}
          <div className="flex items-center gap-1 pl-3 border-l border-border -ml-2">
            <WishlistDropdown />
            {loading ? (
              <span className="min-w-[44px] min-h-[44px] flex items-center justify-center" aria-hidden />
            ) : (
              <Link
                href={user ? '/account' : '/login'}
                className={cn(
                  'min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors',
                  pathname === '/account' || pathname === '/login' ? 'text-fg' : 'text-fg-muted hover:text-fg'
                )}
                aria-label={user ? t('nav.account') : t('nav.signIn')}
                title={user ? t('nav.account') : t('nav.signIn')}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </Link>
            )}
            <ThemeToggle />
            <LanguageToggle />
          </div>
        </nav>

        {/* Mobile Navigation */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            href="/search"
            className={cn(
              'transition-colors hover:text-fg min-w-[44px] min-h-[44px] flex items-center justify-center',
              pathname === '/search' ? 'text-fg' : 'text-fg-muted'
            )}
            aria-label="Search articles"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </Link>
          <LanguageToggle className="md:hidden" />
          <ThemeToggle className="md:hidden" />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-fg-muted hover:text-fg"
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
        <div className="md:hidden border-t border-border bg-surface">
          <nav className="flex flex-col px-4">
            {/* Selected Neighborhoods */}
            {selectedNeighborhoods.length > 0 && (
              <div className="py-4 border-b border-border">
                <p className="text-[10px] tracking-widest uppercase text-fg-muted mb-3 text-right">
                  {t('nav.yourNeighborhoods')}
                </p>
                <div className="flex flex-wrap gap-2 justify-end">
                  {selectedNeighborhoods.slice(0, 6).map((hood) => (
                    <Link
                      key={hood.id}
                      href={`/${getCitySlugFromId(hood.id)}/${getNeighborhoodSlugFromId(hood.id)}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-elevated text-fg rounded"
                    >
                      <span>{hood.name}</span>
                    </Link>
                  ))}
                  {selectedNeighborhoods.length > 6 && (
                    <span className="text-xs text-fg-muted py-1.5">
                      +{selectedNeighborhoods.length - 6} {t('general.more')}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    handleNeighborhoodsClick({ preventDefault: () => {} } as React.MouseEvent);
                    setMobileMenuOpen(false);
                  }}
                  className="mt-3 text-sm text-accent-muted hover:text-accent transition-colors block text-right w-full"
                >
                  {t('nav.editNeighborhoods')}
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
                  'text-sm tracking-widest uppercase transition-colors hover:text-fg text-right py-4 border-b border-border',
                  pathname === '/neighborhoods' || pathname === '/feed' ? 'text-fg font-medium' : 'text-fg-muted'
                )}
              >
                {t('nav.chooseNeighborhoods')}
              </button>
            )}

            {/* Browse by Section */}
            {sections.length > 0 && (
              <div className="py-4 border-b border-border">
                <p className="text-[10px] tracking-widest uppercase text-fg-muted mb-3 text-right">
                  {t('nav.browseBySection')}
                </p>
                <div className="flex flex-wrap gap-2 justify-end">
                  {sections.map((section) => (
                    <Link
                      key={section.id}
                      href={`/feed?section=${section.slug}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-elevated hover:bg-hover text-fg-muted transition-colors"
                    >
                      {section.icon && <span>{section.icon}</span>}
                      <span>{section.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {/* Stories link for all users */}
            <Link
              href="/feed"
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                'text-sm tracking-widest uppercase transition-colors hover:text-fg py-3 border-b border-border block text-right',
                pathname === '/feed' ? 'text-fg font-medium' : 'text-fg-muted'
              )}
            >
              {t('nav.stories')}
            </Link>
            <Link
              href="/destinations"
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                'text-sm tracking-widest uppercase transition-colors hover:text-fg py-3 border-b border-border block text-right',
                pathname === '/destinations' ? 'text-fg font-medium' : 'text-fg-muted'
              )}
            >
              {t('nav.destinations')}
            </Link>
            <Link
              href="/destinations"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm tracking-widest uppercase transition-colors hover:text-fg py-3 border-b border-border text-fg-muted flex items-center justify-end gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              {t('wishlist.title')}
            </Link>

            {!loading && user ? (
              <>
                {isAdmin && (
                  <Link
                    href="/admin/ads"
                    data-admin
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'text-sm tracking-widest uppercase transition-colors hover:text-fg py-3 border-b border-border block text-right',
                      pathname.startsWith('/admin') ? 'text-fg font-medium' : 'text-fg-muted'
                    )}
                  >
                    {t('nav.admin')}
                  </Link>
                )}
                {isAdmin && (
                  <Link
                    href="/advertiser"
                    data-admin
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'text-sm tracking-widest uppercase transition-colors hover:text-fg py-3 border-b border-border block text-right',
                      pathname.startsWith('/advertiser') ? 'text-fg font-medium' : 'text-fg-muted'
                    )}
                  >
                    {t('nav.dashboard')}
                  </Link>
                )}
                <Link
                  href="/account"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'text-sm tracking-widest uppercase transition-colors hover:text-fg py-3 block text-right',
                    pathname === '/account' ? 'text-fg font-medium' : 'text-fg-muted'
                  )}
                >
                  {t('nav.account')}
                </Link>
              </>
            ) : !loading ? (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'text-sm tracking-widest uppercase transition-colors hover:text-fg py-3 block text-right',
                  pathname === '/login' ? 'text-fg font-medium' : 'text-fg-subtle'
                )}
              >
                {t('nav.signIn')}
              </Link>
            ) : null}
          </nav>
        </div>
      )}

    </header>
  );
}
