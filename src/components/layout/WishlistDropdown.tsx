'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useDestinationLists } from '@/hooks/useDestinationLists';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

interface NeighborhoodDetail {
  id: string;
  name: string;
  city: string;
  country: string;
  imageUrl: string | null;
}

export function WishlistDropdown({ className }: { className?: string }) {
  const { defaultList, defaultListIds, removeFromList, isLoading } = useDestinationLists();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<NeighborhoodDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fetchedIdsRef = useRef<string>('');

  const itemCount = defaultListIds.length;
  const hasItems = itemCount > 0;
  const idsKey = defaultListIds.join(',');

  // Fetch neighborhood details when dropdown opens and items exist
  useEffect(() => {
    if (!open || !hasItems || !idsKey) return;
    // Skip if we already fetched these exact IDs
    if (fetchedIdsRef.current === idsKey) return;
    fetchedIdsRef.current = idsKey;

    let cancelled = false;
    setDetailsLoading(true);

    fetch(`/api/lists/details?ids=${encodeURIComponent(idsKey)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data) return;
        const ids = idsKey.split(',');
        const ordered = ids
          .map(id => (data.items as NeighborhoodDetail[]).find(n => n.id === id))
          .filter((n): n is NeighborhoodDetail => !!n);
        setDetails(ordered);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetailsLoading(false); });

    return () => { cancelled = true; };
  }, [open, hasItems, idsKey]);

  // Get share token from the list
  useEffect(() => {
    if (defaultList?.share_token) {
      setShareToken(defaultList.share_token);
    }
  }, [defaultList]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleRemove = async (neighborhoodId: string) => {
    if (!defaultList) return;
    await removeFromList(defaultList.id, neighborhoodId);
    setDetails(prev => prev.filter(d => d.id !== neighborhoodId));
    fetchedIdsRef.current = ''; // Reset so next open refetches
  };

  const handleShare = async () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/lists/${shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      if (navigator.share) {
        navigator.share({ title: 'My Flaneur List', url }).catch(() => {});
      }
    }
  };

  if (isLoading) return null;

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      {/* Heart icon button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors',
          hasItems ? 'text-accent' : 'text-fg-muted hover:text-fg'
        )}
        aria-label={t('wishlist.savedDestinations')}
        title={t('wishlist.savedDestinations')}
      >
        {hasItems ? (
          // Filled heart
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        ) : (
          // Outline heart
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        )}
        {hasItems && (
          <span className="absolute -top-0.5 -right-0.5 bg-accent text-canvas text-[9px] font-medium w-4 h-4 rounded-full flex items-center justify-center leading-none">
            {itemCount > 9 ? '9+' : itemCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-elevated border border-border rounded-sm shadow-lg z-50 overflow-hidden">
          {!hasItems ? (
            // Empty state
            <div className="px-6 py-10 flex flex-col items-center text-center">
              <svg className="w-10 h-10 text-fg-subtle mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <p className="font-display text-lg text-fg mb-1">
                {t('wishlist.noList')}
              </p>
              <p className="text-sm text-fg-muted mb-6 max-w-[220px]">
                {t('wishlist.emptyDescription')}
              </p>
              <Link
                href="/destinations"
                onClick={() => setOpen(false)}
                className="text-[11px] tracking-[0.2em] uppercase text-fg border border-border-strong px-5 py-2.5 rounded-sm hover:bg-hover transition-colors"
              >
                {t('wishlist.addDestinations')}
              </Link>
            </div>
          ) : (
            // Items list
            <div>
              <div className="px-4 pt-4 pb-2 border-b border-border">
                <p className="text-[11px] tracking-[0.2em] uppercase text-fg-muted">
                  {t('wishlist.savedDestinations')}
                </p>
              </div>

              <div className="max-h-[320px] overflow-y-auto">
                {detailsLoading ? (
                  <div className="px-4 py-6 text-center text-sm text-fg-muted">
                    {t('general.loading')}
                  </div>
                ) : (
                  details.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 group"
                    >
                      {/* Thumbnail */}
                      <Link
                        href={`/${getCitySlugFromId(item.id)}/${getNeighborhoodSlugFromId(item.id)}`}
                        onClick={() => setOpen(false)}
                        className="flex-shrink-0 w-12 h-12 rounded-sm overflow-hidden bg-surface"
                      >
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-elevated" />
                        )}
                      </Link>

                      {/* Info */}
                      <Link
                        href={`/${getCitySlugFromId(item.id)}/${getNeighborhoodSlugFromId(item.id)}`}
                        onClick={() => setOpen(false)}
                        className="flex-1 min-w-0"
                      >
                        <p className="text-sm font-medium text-fg truncate">{item.name}</p>
                        <p className="text-xs text-fg-muted truncate">{item.city}, {item.country}</p>
                      </Link>

                      {/* Remove button */}
                      <button
                        onClick={() => handleRemove(item.id)}
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-fg-subtle hover:text-fg transition-colors opacity-0 group-hover:opacity-100"
                        aria-label={t('general.remove')}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Footer actions */}
              <div className="px-4 py-3 border-t border-border flex items-center justify-between">
                <Link
                  href="/destinations"
                  onClick={() => setOpen(false)}
                  className="text-[11px] tracking-[0.15em] uppercase text-fg-muted hover:text-fg transition-colors"
                >
                  {t('wishlist.viewAll')}
                </Link>

                {shareToken && (
                  <button
                    onClick={handleShare}
                    className="text-[11px] tracking-[0.15em] uppercase text-fg-muted hover:text-fg transition-colors flex items-center gap-1.5"
                  >
                    {copied ? (
                      <>
                        <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {t('wishlist.linkCopied')}
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.504a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.343 8.93" />
                        </svg>
                        {t('wishlist.shareList')}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
