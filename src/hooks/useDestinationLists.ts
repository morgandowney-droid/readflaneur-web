'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface DestinationList {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
  is_public: boolean;
  share_token: string | null;
  created_at: string;
  updated_at: string;
  destination_list_items: DestinationListItem[];
}

export interface DestinationListItem {
  neighborhood_id: string;
  sort_order: number;
  added_at: string;
}

/**
 * Hook for managing destination lists (favorites).
 * Fetches all lists for the authenticated user.
 * Returns helpers for CRUD operations on lists and items.
 */
export function useDestinationLists() {
  const [lists, setLists] = useState<DestinationList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchedRef = useRef(false);

  // Fetch all lists on mount
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchLists() {
      try {
        const res = await fetch('/api/lists', { credentials: 'same-origin' });
        if (res.ok) {
          const { lists: data } = await res.json();
          setLists(data || []);
        }
      } catch {
        // Network error - empty lists
      }
      setIsLoading(false);
    }

    // Only fetch if authenticated
    try {
      const authFlag = localStorage.getItem('flaneur-auth');
      if (authFlag) {
        fetchLists();
      } else {
        setIsLoading(false);
      }
    } catch {
      setIsLoading(false);
    }
  }, []);

  const defaultList = lists.find(l => l.is_default) || null;

  const defaultListIds = defaultList
    ? defaultList.destination_list_items
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(i => i.neighborhood_id)
    : [];

  /** Create a new named list */
  const createList = useCallback(async (name: string): Promise<DestinationList | null> => {
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
        credentials: 'same-origin',
      });
      if (res.ok) {
        const { list } = await res.json();
        setLists(prev => [...prev, { ...list, destination_list_items: [] }]);
        return list;
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  /** Add a neighborhood to a list */
  const addToList = useCallback(async (listId: string, neighborhoodId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neighborhoodId }),
        credentials: 'same-origin',
      });
      if (res.ok) {
        // Optimistic update
        setLists(prev => prev.map(list => {
          if (list.id !== listId) return list;
          const exists = list.destination_list_items.some(i => i.neighborhood_id === neighborhoodId);
          if (exists) return list;
          return {
            ...list,
            destination_list_items: [
              ...list.destination_list_items,
              {
                neighborhood_id: neighborhoodId,
                sort_order: list.destination_list_items.length,
                added_at: new Date().toISOString(),
              },
            ],
          };
        }));
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }, []);

  /** Remove a neighborhood from a list */
  const removeFromList = useCallback(async (listId: string, neighborhoodId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/lists/${listId}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neighborhoodId }),
        credentials: 'same-origin',
      });
      if (res.ok) {
        // Optimistic update
        setLists(prev => prev.map(list => {
          if (list.id !== listId) return list;
          return {
            ...list,
            destination_list_items: list.destination_list_items.filter(
              i => i.neighborhood_id !== neighborhoodId
            ),
          };
        }));
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }, []);

  /** Update list properties (name, is_public) */
  const updateList = useCallback(async (listId: string, updates: { name?: string; is_public?: boolean }): Promise<boolean> => {
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        credentials: 'same-origin',
      });
      if (res.ok) {
        const { list } = await res.json();
        setLists(prev => prev.map(l => l.id === listId ? { ...l, ...list } : l));
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }, []);

  /** Delete a list (cannot delete default) */
  const deleteList = useCallback(async (listId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (res.ok) {
        setLists(prev => prev.filter(l => l.id !== listId));
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }, []);

  /** Check if a neighborhood is in any list */
  const isInAnyList = useCallback((neighborhoodId: string): boolean => {
    return lists.some(list =>
      list.destination_list_items.some(i => i.neighborhood_id === neighborhoodId)
    );
  }, [lists]);

  /** Check if a neighborhood is in a specific list */
  const isInList = useCallback((listId: string, neighborhoodId: string): boolean => {
    const list = lists.find(l => l.id === listId);
    return list?.destination_list_items.some(i => i.neighborhood_id === neighborhoodId) || false;
  }, [lists]);

  /** Get all lists that contain a specific neighborhood */
  const getListsContaining = useCallback((neighborhoodId: string): DestinationList[] => {
    return lists.filter(list =>
      list.destination_list_items.some(i => i.neighborhood_id === neighborhoodId)
    );
  }, [lists]);

  return {
    lists,
    defaultList,
    defaultListIds,
    isLoading,
    createList,
    addToList,
    removeFromList,
    updateList,
    deleteList,
    isInAnyList,
    isInList,
    getListsContaining,
  };
}
