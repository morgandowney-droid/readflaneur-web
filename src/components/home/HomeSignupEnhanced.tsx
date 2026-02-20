'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Neighborhood } from '@/types';
import { cityToSlug, neighborhoodToSlug } from '@/lib/utils';
import { useNeighborhoodModal } from '@/components/neighborhoods/NeighborhoodSelectorModal';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

interface HomeSignupEnhancedProps {
  neighborhoods: Neighborhood[];
}

export function HomeSignupEnhanced({ neighborhoods }: HomeSignupEnhancedProps) {
  const router = useRouter();
  const { openModal, isOpen: modalIsOpen } = useNeighborhoodModal();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const prevModalOpen = useRef(modalIsOpen);

  // Get selected neighborhoods for display
  const selectedNeighborhoods = useMemo(() => {
    return neighborhoods.filter(n => selected.has(n.id));
  }, [neighborhoods, selected]);

  // Load preferences on mount — always merge DB + localStorage to prevent split-brain
  useEffect(() => {
    const loadData = async () => {
      // Always read localStorage first (instant, works for all users)
      let localIds: string[] = [];
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        try { localIds = JSON.parse(stored) as string[]; } catch { /* ignore */ }
      }

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setUserId(session.user.id);
        const { data } = await supabase
          .from('user_neighborhood_preferences')
          .select('neighborhood_id')
          .eq('user_id', session.user.id);

        const dbIds = data?.map(p => p.neighborhood_id) || [];
        // Union both sources — prevents blank homepage after OAuth login
        const merged = new Set([...dbIds, ...localIds]);
        setSelected(merged);

        // Sync localStorage IDs to DB if DB was missing any
        const missingFromDb = localIds.filter(id => !dbIds.includes(id));
        if (missingFromDb.length > 0) {
          Promise.resolve(
            supabase
              .from('user_neighborhood_preferences')
              .upsert(missingFromDb.map(id => ({ user_id: session.user.id, neighborhood_id: id })))
          ).then(null, () => {});
        }
        // Sync DB IDs to localStorage if localStorage was missing any
        if (merged.size > 0) {
          localStorage.setItem(PREFS_KEY, JSON.stringify(Array.from(merged)));
        }
      } else {
        if (localIds.length > 0) {
          setSelected(new Set(localIds));
        }
      }
    };

    loadData();
  }, []);

  // Refresh selections when modal closes (user may have changed them in global modal)
  useEffect(() => {
    // Detect modal close transition
    if (prevModalOpen.current && !modalIsOpen) {
      // Modal just closed - reload preferences from localStorage or DB
      const refreshSelections = async () => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        // Always read localStorage first
        let localIds: string[] = [];
        const stored = localStorage.getItem(PREFS_KEY);
        if (stored) {
          try { localIds = JSON.parse(stored) as string[]; } catch { /* ignore */ }
        }

        if (session?.user) {
          const { data } = await supabase
            .from('user_neighborhood_preferences')
            .select('neighborhood_id')
            .eq('user_id', session.user.id);

          const dbIds = data?.map(p => p.neighborhood_id) || [];
          const merged = new Set([...dbIds, ...localIds]);
          setSelected(merged);
          if (merged.size > 0) {
            localStorage.setItem(PREFS_KEY, JSON.stringify(Array.from(merged)));
          }
        } else {
          if (localIds.length > 0) {
            setSelected(new Set(localIds));
          }
        }
      };

      refreshSelections();
    }
    prevModalOpen.current = modalIsOpen;
  }, [modalIsOpen]);

  const removeNeighborhood = async (id: string) => {
    const newSelected = new Set(selected);
    newSelected.delete(id);
    setSelected(newSelected);

    // Always sync localStorage
    localStorage.setItem(PREFS_KEY, JSON.stringify(Array.from(newSelected)));

    if (userId) {
      const supabase = createClient();
      Promise.resolve(
        supabase
          .from('user_neighborhood_preferences')
          .delete()
          .eq('user_id', userId)
          .eq('neighborhood_id', id)
      ).then(null, () => {});
    }
  };

  const makePrimary = (id: string) => {
    const ids = Array.from(selected);
    const reordered = [id, ...ids.filter(i => i !== id)];
    const newSelected = new Set(reordered);
    setSelected(newSelected);

    // Always sync localStorage
    localStorage.setItem(PREFS_KEY, JSON.stringify(reordered));
  };

  const handleExplore = () => {
    if (selected.size > 0) {
      const ids = Array.from(selected);
      document.cookie = `flaneur-neighborhoods=${ids.join(',')};path=/;max-age=31536000;SameSite=Strict`;
      router.push('/feed');
    } else {
      // Open global modal to choose neighborhoods
      openModal();
    }
  };

  return (
    <div className="space-y-4">
      {/* Selected Neighborhoods Display */}
      <div className="flex flex-wrap gap-2 justify-center items-center">
        {selectedNeighborhoods.slice(0, 5).map((hood, i) => {
          const citySlug = cityToSlug(hood.city);
          const neighborhoodSlug = neighborhoodToSlug(hood.id);
          const feedUrl = `/${citySlug}/${neighborhoodSlug}`;
          const isPrimary = i === 0 && selectedNeighborhoods.length > 1;

          return (
            <span
              key={hood.id}
              className="inline-flex items-center bg-black text-white text-sm leading-none rounded-lg overflow-hidden"
            >
              <Link
                href={feedUrl}
                className="px-3 py-1.5 hover:bg-neutral-800 transition-colors flex items-center gap-1.5"
              >
                {hood.name}
                {isPrimary && (
                  <span className="text-[8px] tracking-wider font-bold text-amber-500/70 uppercase">Primary</span>
                )}
              </Link>
              {!isPrimary && selectedNeighborhoods.length > 1 && (
                <button
                  onClick={() => makePrimary(hood.id)}
                  className="flex items-center justify-center px-2 py-1.5 hover:bg-neutral-700 transition-colors border-l border-neutral-700 text-neutral-500 hover:text-amber-400"
                  aria-label={`Set ${hood.name} as primary`}
                  title="Set as primary"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => {
                  if (window.confirm(`Remove ${hood.name}?`)) {
                    removeNeighborhood(hood.id);
                  }
                }}
                className="flex items-center justify-center px-2 py-1.5 hover:bg-neutral-700 transition-colors border-l border-neutral-700"
                aria-label={`Remove ${hood.name}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          );
        })}
        {selectedNeighborhoods.length > 5 && (
          <button
            onClick={handleExplore}
            className="text-sm text-neutral-500 hover:text-white transition-colors"
          >
            +{selectedNeighborhoods.length - 5} more
          </button>
        )}

        {/* Add Neighborhoods Button - uses global modal */}
        <button
          onClick={() => openModal()}
          className="inline-flex items-center gap-2.5 px-5 py-2.5 border border-dashed border-white/[0.08] text-neutral-400 text-sm tracking-wide hover:border-white/20 hover:text-neutral-100 transition-all duration-200 rounded-lg"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
          {selected.size === 0 ? 'Choose Neighborhoods' : 'Add'}
        </button>
      </div>

      {/* Read Stories Button - only show when neighborhoods are selected */}
      {selected.size > 0 && (
        <div className="pt-4">
          <button
            onClick={handleExplore}
            className="inline-block border border-white/[0.08] text-neutral-100 px-10 py-3.5 text-[11px] tracking-[0.2em] uppercase font-medium hover:bg-white/10 hover:text-white transition-all duration-300 rounded-lg"
          >
            Read Stories
          </button>
        </div>
      )}
    </div>
  );
}
