'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDestinationLists } from '@/hooks/useDestinationLists';
import { useTranslation } from '@/hooks/useTranslation';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

interface NeighborhoodDetail {
  id: string;
  name: string;
  city: string;
  country: string;
  imageUrl: string | null;
}

export default function MyListsPage() {
  const router = useRouter();
  const { lists, defaultList, isLoading, createList, removeFromList, deleteList } = useDestinationLists();
  const { t } = useTranslation();
  const [details, setDetails] = useState<Map<string, NeighborhoodDetail[]>>(new Map());
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [isAuth, setIsAuth] = useState(false);

  // Auth check
  useEffect(() => {
    try {
      const auth = localStorage.getItem('flaneur-auth');
      if (!auth) {
        router.push('/login');
        return;
      }
      setIsAuth(true);
    } catch {
      router.push('/login');
    }
  }, [router]);

  // Fetch neighborhood details for all lists
  useEffect(() => {
    if (isLoading || lists.length === 0) return;

    const allIds = new Set<string>();
    for (const list of lists) {
      for (const item of list.destination_list_items) {
        allIds.add(item.neighborhood_id);
      }
    }

    if (allIds.size === 0) return;

    setDetailsLoading(true);
    fetch(`/api/lists/details?ids=${encodeURIComponent([...allIds].join(','))}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.items) return;
        const itemMap = new Map<string, NeighborhoodDetail>();
        for (const item of data.items as NeighborhoodDetail[]) {
          itemMap.set(item.id, item);
        }

        const grouped = new Map<string, NeighborhoodDetail[]>();
        for (const list of lists) {
          const ordered = list.destination_list_items
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(i => itemMap.get(i.neighborhood_id))
            .filter((n): n is NeighborhoodDetail => !!n);
          grouped.set(list.id, ordered);
        }
        setDetails(grouped);
      })
      .catch(() => {})
      .finally(() => setDetailsLoading(false));
  }, [isLoading, lists]);

  const handleCreateList = useCallback(async () => {
    if (!newListName.trim()) return;
    setCreating(true);
    await createList(newListName.trim());
    setNewListName('');
    setShowCreateInput(false);
    setCreating(false);
  }, [newListName, createList]);

  const handleShare = useCallback(async (shareToken: string) => {
    const url = `${window.location.origin}/lists/${shareToken}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My Flaneur List', url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopiedToken(shareToken);
        setTimeout(() => setCopiedToken(null), 2000);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setCopiedToken(shareToken);
        setTimeout(() => setCopiedToken(null), 2000);
      } catch { /* ignore */ }
    }
  }, []);

  const handleRemoveItem = useCallback(async (listId: string, neighborhoodId: string) => {
    await removeFromList(listId, neighborhoodId);
    setDetails(prev => {
      const next = new Map(prev);
      const items = next.get(listId);
      if (items) {
        next.set(listId, items.filter(i => i.id !== neighborhoodId));
      }
      return next;
    });
  }, [removeFromList]);

  const handleDeleteList = useCallback(async (listId: string) => {
    await deleteList(listId);
    setDetails(prev => {
      const next = new Map(prev);
      next.delete(listId);
      return next;
    });
  }, [deleteList]);

  if (!isAuth || isLoading) {
    return (
      <main className="min-h-screen bg-canvas flex items-center justify-center">
        <p className="text-fg-muted text-sm">{t('general.loading')}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 pt-10 pb-8">
        <Link
          href="/feed"
          className="text-xs tracking-[0.15em] uppercase text-fg-muted hover:text-fg transition-colors inline-flex items-center gap-1.5 mb-6"
        >
          <span>&larr;</span> Back to Feed
        </Link>

        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl md:text-4xl tracking-[0.1em] font-light text-fg">
              My Lists
            </h1>
            <p className="text-fg-muted text-sm mt-2">
              {lists.length} {lists.length === 1 ? 'list' : 'lists'}
            </p>
          </div>

          {/* Create new list button */}
          {!showCreateInput ? (
            <button
              onClick={() => setShowCreateInput(true)}
              className="text-[11px] tracking-[0.15em] uppercase text-fg border border-border-strong px-5 py-2.5 rounded-sm hover:bg-hover transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New List
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateList()}
                placeholder="List name"
                className="bg-surface border border-border rounded-sm px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent w-48"
                autoFocus
                maxLength={50}
              />
              <button
                onClick={handleCreateList}
                disabled={creating || !newListName.trim()}
                className="text-[11px] tracking-[0.15em] uppercase bg-fg text-canvas px-4 py-2.5 rounded-sm hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {creating ? '...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowCreateInput(false); setNewListName(''); }}
                className="text-fg-muted hover:text-fg p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="border-t border-border" />
      </div>

      {/* Lists */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-10 space-y-16">
        {lists.length === 0 ? (
          <div className="text-center py-20">
            <svg className="w-12 h-12 text-fg-subtle mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <p className="font-display text-xl text-fg mb-2">No lists yet</p>
            <p className="text-sm text-fg-muted mb-6 max-w-xs mx-auto">
              Save destinations you love and share curated lists with friends.
            </p>
            <Link
              href="/destinations"
              className="text-[11px] tracking-[0.2em] uppercase text-fg border border-border-strong px-6 py-3 rounded-sm hover:bg-hover transition-colors"
            >
              Browse Destinations
            </Link>
          </div>
        ) : (
          lists.map(list => {
            const items = details.get(list.id) || [];
            const isCopied = copiedToken === list.share_token;

            return (
              <section key={list.id}>
                {/* List header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <h2 className="font-display text-xl md:text-2xl text-fg">
                      {list.name}
                    </h2>
                    {list.is_default && (
                      <span className="text-[9px] tracking-[0.2em] uppercase text-accent border border-accent/30 px-2 py-0.5 rounded-sm">
                        Default
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Share button */}
                    {list.share_token && (
                      <button
                        onClick={() => handleShare(list.share_token!)}
                        className="text-[11px] tracking-[0.15em] uppercase text-fg-muted hover:text-fg transition-colors flex items-center gap-1.5"
                      >
                        {isCopied ? (
                          <>
                            <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Link copied
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.504a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.343 8.93" />
                            </svg>
                            Share
                          </>
                        )}
                      </button>
                    )}

                    {/* Delete list (non-default only) */}
                    {!list.is_default && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${list.name}"? This cannot be undone.`)) {
                            handleDeleteList(list.id);
                          }
                        }}
                        className="text-fg-subtle hover:text-red-400 transition-colors p-1"
                        title="Delete list"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* List items grid */}
                {detailsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.from({ length: Math.min(items.length || 4, 8) }).map((_, i) => (
                      <div key={i} className="aspect-[4/3] rounded-sm bg-surface animate-pulse" />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="border border-dashed border-border rounded-sm py-12 text-center">
                    <p className="text-sm text-fg-muted mb-3">This list is empty</p>
                    <Link
                      href="/destinations"
                      className="text-xs text-accent hover:underline"
                    >
                      Browse destinations to add
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {items.map(item => (
                      <div key={item.id} className="group relative">
                        <Link
                          href={`/${getCitySlugFromId(item.id)}/${getNeighborhoodSlugFromId(item.id)}`}
                          className="block"
                        >
                          {/* Image */}
                          <div className="aspect-[4/3] rounded-sm overflow-hidden bg-elevated relative">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="font-display text-2xl text-fg-subtle">{item.name[0]}</span>
                              </div>
                            )}

                            {/* Gradient scrim */}
                            <div
                              className="absolute inset-0"
                              style={{ background: 'linear-gradient(180deg, transparent 30%, rgba(32,32,32,0.75) 100%)' }}
                            />

                            {/* Text on image */}
                            <div className="absolute bottom-0 left-0 right-0 p-3">
                              <h3 className="font-display text-base text-white font-light leading-tight">
                                {item.name}
                              </h3>
                              <p className="text-[10px] tracking-[0.15em] uppercase text-white/60 mt-0.5">
                                {item.city}, {item.country}
                              </p>
                            </div>
                          </div>
                        </Link>

                        {/* Remove button (visible on hover) */}
                        <button
                          onClick={() => handleRemoveItem(list.id, item.id)}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:bg-black/60 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove from list"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}

                    {/* Add more card */}
                    <Link
                      href="/destinations"
                      className="aspect-[4/3] rounded-sm border border-dashed border-border hover:border-accent/50 flex flex-col items-center justify-center gap-2 transition-colors group"
                    >
                      <svg className="w-6 h-6 text-fg-subtle group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-[10px] tracking-[0.15em] uppercase text-fg-subtle group-hover:text-accent transition-colors">
                        Add more
                      </span>
                    </Link>
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
