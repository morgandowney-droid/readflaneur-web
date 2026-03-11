'use client';

import { useState, useEffect } from 'react';
import type { DestinationList } from '@/hooks/useDestinationLists';
import { useTranslation } from '@/hooks/useTranslation';

interface NeighborhoodThumb {
  id: string;
  imageUrl: string | null;
}

interface Props {
  neighborhoodId: string;
  neighborhoodName: string;
  lists: DestinationList[];
  onAdd: (listId: string) => Promise<boolean>;
  onClose: () => void;
  onCreateList: (name: string) => Promise<DestinationList | null>;
}

export function AddToListModal({
  neighborhoodName,
  lists,
  onAdd,
  onClose,
  onCreateList,
}: Props) {
  const { t } = useTranslation();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);
  const [listThumbs, setListThumbs] = useState<Record<string, NeighborhoodThumb[]>>({});

  // Fetch thumbnails for each list's items
  useEffect(() => {
    const allIds = new Set<string>();
    for (const list of lists) {
      for (const item of list.destination_list_items) {
        allIds.add(item.neighborhood_id);
      }
    }
    if (allIds.size === 0) return;

    fetch(`/api/lists/details?ids=${encodeURIComponent([...allIds].join(','))}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.items) return;
        const map: Record<string, NeighborhoodThumb[]> = {};
        for (const list of lists) {
          map[list.id] = list.destination_list_items
            .slice(0, 4)
            .map(item => {
              const detail = (data.items as NeighborhoodThumb[]).find(n => n.id === item.neighborhood_id);
              return { id: item.neighborhood_id, imageUrl: detail?.imageUrl || null };
            });
        }
        setListThumbs(map);
      })
      .catch(() => {});
  }, [lists]);

  const handleValidate = async () => {
    if (!selectedListId) return;
    setAdding(true);
    await onAdd(selectedListId);
    setAdding(false);
  };

  const handleCreate = async () => {
    if (!newListName.trim()) return;
    setCreating(true);
    const newList = await onCreateList(newListName.trim());
    if (newList) {
      setSelectedListId(newList.id);
    }
    setNewListName('');
    setShowCreateInput(false);
    setCreating(false);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-canvas rounded-sm shadow-xl w-[480px] max-w-[90vw] max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h3 className="font-display text-lg text-fg">
            Add {neighborhoodName} to the list
          </h3>
          <button
            onClick={onClose}
            className="text-fg-muted hover:text-fg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List options */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-3">
          {lists.map(list => {
            const thumbs = listThumbs[list.id] || [];
            const itemCount = list.destination_list_items.length;
            const isSelected = selectedListId === list.id;

            return (
              <button
                key={list.id}
                onClick={() => setSelectedListId(list.id)}
                className={`w-full flex items-center gap-4 p-3 rounded-sm border transition-colors text-left ${
                  isSelected
                    ? 'border-fg bg-surface'
                    : 'border-border hover:border-fg-muted'
                }`}
              >
                {/* Thumbnail grid (2x2) */}
                <div className="shrink-0 w-16 h-16 grid grid-cols-2 grid-rows-2 gap-0.5 rounded-sm overflow-hidden bg-elevated">
                  {thumbs.length > 0 ? (
                    thumbs.slice(0, 4).map((thumb, i) => (
                      thumb.imageUrl ? (
                        <img
                          key={i}
                          src={thumb.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div key={i} className="w-full h-full bg-elevated flex items-center justify-center">
                          <svg className="w-3 h-3 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        </div>
                      )
                    ))
                  ) : (
                    <div className="col-span-2 row-span-2 flex items-center justify-center">
                      <svg className="w-5 h-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* List info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{list.name}</p>
                  <p className="text-xs text-fg-muted">
                    {itemCount} {itemCount === 1 ? 'neighborhood' : 'neighborhoods'}
                  </p>
                </div>

                {/* Radio indicator */}
                <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  isSelected ? 'border-fg' : 'border-fg-subtle'
                }`}>
                  {isSelected && (
                    <div className="w-2.5 h-2.5 rounded-full bg-fg" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer: Create new list + Validate */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          {showCreateInput ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="List name"
                className="flex-1 bg-surface border border-border rounded-sm px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-fg"
                autoFocus
                maxLength={50}
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newListName.trim()}
                className="text-xs uppercase tracking-wider bg-fg text-canvas px-3 py-2 rounded-sm hover:opacity-90 disabled:opacity-40"
              >
                {creating ? '...' : 'OK'}
              </button>
              <button
                onClick={() => { setShowCreateInput(false); setNewListName(''); }}
                className="text-fg-muted hover:text-fg"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateInput(true)}
              className="text-[11px] tracking-[0.12em] uppercase text-fg underline underline-offset-4 decoration-fg-subtle hover:decoration-fg transition-colors"
            >
              {t('wishlist.createNewList')}
            </button>
          )}

          <button
            onClick={handleValidate}
            disabled={!selectedListId || adding}
            className="bg-fg text-canvas text-[11px] tracking-[0.15em] uppercase px-6 py-2.5 rounded-sm hover:opacity-90 transition-opacity disabled:opacity-30 font-medium"
          >
            {adding ? '...' : 'VALIDATE'}
          </button>
        </div>
      </div>
    </div>
  );
}
