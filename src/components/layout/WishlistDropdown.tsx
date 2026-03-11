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
  const { lists, defaultList, isLoading, createList, removeFromList, deleteList, updateList } = useDestinationLists();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [details, setDetails] = useState<NeighborhoodDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [listSelectorOpen, setListSelectorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fetchedIdsRef = useRef<string>('');

  // Set active list to default on first load
  useEffect(() => {
    if (!activeListId && defaultList) {
      setActiveListId(defaultList.id);
    }
  }, [activeListId, defaultList]);

  const activeList = lists.find(l => l.id === activeListId) || defaultList;
  const activeItems = activeList
    ? activeList.destination_list_items
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(i => i.neighborhood_id)
    : [];

  const totalItemCount = lists.reduce((sum, l) => sum + l.destination_list_items.length, 0);
  const hasItems = totalItemCount > 0;
  const idsKey = activeItems.join(',');

  // Fetch neighborhood details when dropdown opens and items exist
  useEffect(() => {
    if (!open || !activeItems.length || !idsKey) {
      if (open && !activeItems.length) setDetails([]);
      return;
    }
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
  }, [open, idsKey, activeItems.length]);

  // Reset fetched IDs when active list changes
  useEffect(() => {
    fetchedIdsRef.current = '';
  }, [activeListId]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeAll();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const closeAll = () => {
    setOpen(false);
    setListSelectorOpen(false);
    setMenuOpen(false);
    setShowCreateInput(false);
    setRenaming(false);
  };

  const handleRemove = async (neighborhoodId: string) => {
    if (!activeList) return;
    await removeFromList(activeList.id, neighborhoodId);
    setDetails(prev => prev.filter(d => d.id !== neighborhoodId));
    fetchedIdsRef.current = '';
  };

  const getShareUrl = () =>
    activeList?.share_token ? `${window.location.origin}/lists/${activeList.share_token}` : '';

  const handleOpenShareModal = () => {
    setMenuOpen(false);
    setShareModalOpen(true);
  };

  const handleCopyLink = async () => {
    const url = getShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback handled by other share options
    }
  };

  const handleShareEmail = () => {
    const url = getShareUrl();
    const subject = encodeURIComponent(`Check out my ${activeList?.name || 'list'} on Flaneur`);
    const body = encodeURIComponent(`I wanted to share my curated list of destinations with you:\n\n${url}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
    setShareModalOpen(false);
  };

  const handleShareWhatsApp = () => {
    const url = getShareUrl();
    const text = encodeURIComponent(`Check out my curated list of destinations on Flaneur: ${url}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
    setShareModalOpen(false);
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    setCreating(true);
    const newList = await createList(newListName.trim());
    if (newList) {
      setActiveListId(newList.id);
      fetchedIdsRef.current = '';
    }
    setNewListName('');
    setShowCreateInput(false);
    setCreating(false);
    setListSelectorOpen(false);
  };

  const handleRename = async () => {
    if (!activeList || !renameValue.trim() || renameValue.trim() === activeList.name) {
      setRenaming(false);
      return;
    }
    await updateList(activeList.id, { name: renameValue.trim() });
    setRenaming(false);
    setMenuOpen(false);
  };

  const handleDeleteList = async () => {
    if (!activeList || activeList.is_default) return;
    if (!confirm(`Delete "${activeList.name}"?`)) return;
    await deleteList(activeList.id);
    setActiveListId(defaultList?.id || null);
    fetchedIdsRef.current = '';
    setMenuOpen(false);
  };

  const handleSwitchList = (listId: string) => {
    setActiveListId(listId);
    setListSelectorOpen(false);
    setShowCreateInput(false);
    fetchedIdsRef.current = '';
  };

  if (isLoading) return null;

  return (
    <div ref={dropdownRef} className={cn('relative z-[60]', className)}>
      {/* Heart icon button with count badge */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'relative min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors',
          hasItems ? 'text-accent' : 'text-fg-muted hover:text-fg'
        )}
        aria-label={t('wishlist.savedDestinations')}
        title={t('wishlist.savedDestinations')}
      >
        {hasItems ? (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        )}
        {totalItemCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-fg text-canvas text-[9px] font-medium flex items-center justify-center leading-none">
            {totalItemCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-elevated border border-border rounded-sm shadow-lg z-50 overflow-hidden">
          {!hasItems && lists.length === 0 ? (
            // Empty state - no lists at all
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
            // LC-style list interface
            <div>
              {/* Header - "My favourites" */}
              <div className="px-4 pt-4 pb-3">
                <p className="text-sm text-fg-muted">{t('wishlist.myFavourites')}</p>
              </div>

              {/* List selector + three-dot menu */}
              <div className="px-4 pb-3 flex items-center gap-2">
                {/* List dropdown selector */}
                <div className="relative flex-1">
                  <button
                    onClick={() => { setListSelectorOpen(!listSelectorOpen); setMenuOpen(false); setRenaming(false); }}
                    className="w-full flex items-center justify-between border border-border rounded-sm px-3 py-2 text-sm text-fg hover:border-fg-muted transition-colors"
                  >
                    <span className="truncate">{activeList?.name || 'Favourites'}</span>
                    <svg className={cn('w-4 h-4 text-fg-muted transition-transform', listSelectorOpen && 'rotate-180')} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* List selector dropdown with CREATE A NEW LIST at bottom */}
                  {listSelectorOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-elevated border border-border rounded-sm shadow-lg z-10 overflow-hidden">
                      {lists.map(list => (
                        <button
                          key={list.id}
                          onClick={() => handleSwitchList(list.id)}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between',
                            list.id === activeListId
                              ? 'text-fg bg-surface'
                              : 'text-fg-muted hover:text-fg hover:bg-hover'
                          )}
                        >
                          <span className="truncate">{list.name}</span>
                          <span className="text-xs text-fg-subtle ml-2">{list.destination_list_items.length}</span>
                        </button>
                      ))}

                      {/* Separator */}
                      <div className="border-t border-border" />

                      {/* CREATE A NEW LIST - inline input or button */}
                      {showCreateInput ? (
                        <div className="px-3 py-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={newListName}
                            onChange={e => setNewListName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateList()}
                            placeholder="List name"
                            className="flex-1 bg-surface border border-border rounded-sm px-2 py-1 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                            autoFocus
                            maxLength={50}
                          />
                          <button
                            onClick={handleCreateList}
                            disabled={creating || !newListName.trim()}
                            className="text-xs uppercase tracking-wider bg-fg text-canvas px-2.5 py-1 rounded-sm hover:opacity-90 disabled:opacity-40"
                          >
                            {creating ? '...' : 'OK'}
                          </button>
                          <button
                            onClick={() => { setShowCreateInput(false); setNewListName(''); }}
                            className="text-fg-muted hover:text-fg"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowCreateInput(true)}
                          className="w-full text-left px-3 py-2.5 text-sm text-fg-muted hover:text-fg hover:bg-hover transition-colors flex items-center gap-2"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          <span className="text-[11px] tracking-[0.15em] uppercase">{t('wishlist.createNewList')}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Three-dot menu */}
                <div className="relative">
                  <button
                    onClick={() => { setMenuOpen(!menuOpen); setListSelectorOpen(false); setRenaming(false); }}
                    className="w-8 h-8 flex items-center justify-center text-fg-muted hover:text-fg transition-colors"
                    aria-label="List options"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>

                  {/* LC "Parameters" menu: Share / Rename / Delete */}
                  {menuOpen && (
                    <div className="absolute top-full right-0 mt-1 w-52 bg-elevated border border-border rounded-sm shadow-lg z-10 overflow-hidden">
                      {/* SHARE WITH A FRIEND */}
                      <button
                        onClick={handleOpenShareModal}
                        disabled={!activeList?.share_token}
                        className="w-full text-left px-3 py-2.5 text-sm text-fg-muted hover:text-fg hover:bg-hover transition-colors flex items-center gap-2.5 disabled:opacity-30"
                      >
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                        </svg>
                        <span className="text-[11px] tracking-[0.12em] uppercase">
                          {copied ? t('wishlist.linkCopied') : t('wishlist.shareWithFriend')}
                        </span>
                      </button>

                      {/* RENAME THE LIST */}
                      <button
                        onClick={() => {
                          setRenameValue(activeList?.name || '');
                          setRenaming(true);
                          setMenuOpen(false);
                        }}
                        disabled={!activeList}
                        className="w-full text-left px-3 py-2.5 text-sm text-fg-muted hover:text-fg hover:bg-hover transition-colors flex items-center gap-2.5 disabled:opacity-30"
                      >
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                        <span className="text-[11px] tracking-[0.12em] uppercase">{t('wishlist.renameList')}</span>
                      </button>

                      {/* DELETE THE LIST */}
                      <button
                        onClick={handleDeleteList}
                        disabled={!activeList || activeList.is_default}
                        className="w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-hover transition-colors flex items-center gap-2.5 disabled:opacity-30"
                      >
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        <span className="text-[11px] tracking-[0.12em] uppercase">{t('wishlist.deleteList')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Rename inline input - shown below selector when renaming */}
              {renaming && (
                <div className="px-4 pb-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename();
                      if (e.key === 'Escape') setRenaming(false);
                    }}
                    className="flex-1 bg-surface border border-border rounded-sm px-3 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                    autoFocus
                    maxLength={50}
                  />
                  <button
                    onClick={handleRename}
                    disabled={!renameValue.trim()}
                    className="text-xs uppercase tracking-wider bg-fg text-canvas px-3 py-1.5 rounded-sm hover:opacity-90 disabled:opacity-40"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => setRenaming(false)}
                    className="text-fg-muted hover:text-fg p-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Items list */}
              <div className="max-h-[320px] overflow-y-auto border-t border-border">
                {detailsLoading ? (
                  <div className="px-4 py-6 text-center text-sm text-fg-muted">
                    {t('general.loading')}
                  </div>
                ) : activeItems.length === 0 ? (
                  <div className="px-6 py-8 flex flex-col items-center text-center">
                    <svg className="w-12 h-12 text-fg-subtle mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    <p className="text-sm text-fg-muted mb-1">{t('wishlist.noFavoritesYet')}</p>
                    <p className="text-sm text-fg-muted mb-5 max-w-[240px]">
                      {t('wishlist.emptyListDescription')}
                    </p>
                    <Link
                      href="/destinations"
                      onClick={() => setOpen(false)}
                      className="w-full bg-fg text-canvas text-[11px] tracking-[0.2em] uppercase py-3 rounded-sm hover:opacity-90 transition-opacity font-medium text-center block"
                    >
                      {t('wishlist.addDestinations')}
                    </Link>
                  </div>
                ) : (
                  details.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
                    >
                      {/* Thumbnail */}
                      <Link
                        href={`/${getCitySlugFromId(item.id)}/${getNeighborhoodSlugFromId(item.id)}`}
                        onClick={() => setOpen(false)}
                        className="flex-shrink-0 w-14 h-14 rounded-sm overflow-hidden bg-surface"
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

                      {/* Filled heart to remove (LC pattern) */}
                      <button
                        onClick={() => handleRemove(item.id)}
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-accent hover:text-accent-muted transition-colors"
                        aria-label={t('general.remove')}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Footer CTA - Share this list */}
              {activeItems.length > 0 && (
                <div className="px-4 py-4 border-t border-border">
                  <p className="text-sm text-fg-muted text-center mb-3">
                    {t('wishlist.shareDescription')}
                  </p>
                  <button
                    onClick={handleOpenShareModal}
                    disabled={!activeList?.share_token}
                    className="w-full bg-fg text-canvas text-[11px] tracking-[0.2em] uppercase py-3 rounded-sm hover:opacity-90 transition-opacity disabled:opacity-30 font-medium"
                  >
                    {t('wishlist.shareList')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Share modal overlay (LC "Share my list" pattern) */}
      {shareModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center"
          onClick={() => { setShareModalOpen(false); setCopied(false); }}
        >
          <div
            className="bg-elevated rounded-sm shadow-xl w-[420px] max-w-[90vw] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h3 className="font-display text-lg text-fg">{t('wishlist.shareMyList')}</h3>
              <button
                onClick={() => { setShareModalOpen(false); setCopied(false); }}
                className="text-fg-muted hover:text-fg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Share options */}
            <div className="border-t border-border">
              {/* COPY THE LINK */}
              <button
                onClick={handleCopyLink}
                className="w-full text-left px-6 py-4 text-sm hover:bg-hover transition-colors border-b border-border flex items-center justify-between"
              >
                <span className="text-[11px] tracking-[0.15em] uppercase text-fg">
                  {copied ? t('wishlist.linkCopiedCheck') : t('wishlist.copyTheLink')}
                </span>
                {copied && (
                  <svg className="w-4 h-4 text-fg" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>

              {/* SEND BY E-MAIL */}
              <button
                onClick={handleShareEmail}
                className="w-full text-left px-6 py-4 text-sm hover:bg-hover transition-colors border-b border-border"
              >
                <span className="text-[11px] tracking-[0.15em] uppercase text-fg">{t('wishlist.sendByEmail')}</span>
              </button>

              {/* SEND ON WHATSAPP */}
              <button
                onClick={handleShareWhatsApp}
                className="w-full text-left px-6 py-4 text-sm hover:bg-hover transition-colors"
              >
                <span className="text-[11px] tracking-[0.15em] uppercase text-fg">{t('wishlist.sendOnWhatsApp')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
