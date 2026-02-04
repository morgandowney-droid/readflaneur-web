'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Neighborhood } from '@/types';
import { cityToSlug, neighborhoodToSlug } from '@/lib/utils';
import { useNeighborhoodModal } from '@/components/neighborhoods/NeighborhoodSelectorModal';

const PREFS_KEY = 'flaneur-neighborhood-preferences';
const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';

interface HomeSignupEnhancedProps {
  neighborhoods: Neighborhood[];
}

export function HomeSignupEnhanced({ neighborhoods }: HomeSignupEnhancedProps) {
  const router = useRouter();
  const { openModal, isOpen: modalIsOpen } = useNeighborhoodModal();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const prevModalOpen = useRef(modalIsOpen);

  // Get selected neighborhoods for display
  const selectedNeighborhoods = useMemo(() => {
    return neighborhoods.filter(n => selected.has(n.id));
  }, [neighborhoods, selected]);

  // Load preferences on mount
  useEffect(() => {
    const loadData = async () => {
      const subscribed = localStorage.getItem(SUBSCRIBED_KEY);
      if (subscribed === 'true') {
        setIsSubscribed(true);
      }

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setUserId(session.user.id);
        const { data } = await supabase
          .from('user_neighborhood_preferences')
          .select('neighborhood_id')
          .eq('user_id', session.user.id);

        if (data && data.length > 0) {
          setSelected(new Set(data.map(p => p.neighborhood_id)));
        }
      } else {
        const stored = localStorage.getItem(PREFS_KEY);
        if (stored) {
          try {
            setSelected(new Set(JSON.parse(stored)));
          } catch {
            // Invalid stored data
          }
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

        if (session?.user) {
          const { data } = await supabase
            .from('user_neighborhood_preferences')
            .select('neighborhood_id')
            .eq('user_id', session.user.id);

          if (data) {
            setSelected(new Set(data.map(p => p.neighborhood_id)));
          }
        } else {
          const stored = localStorage.getItem(PREFS_KEY);
          if (stored) {
            try {
              setSelected(new Set(JSON.parse(stored)));
            } catch {
              // Invalid stored data
            }
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

    if (userId) {
      const supabase = createClient();
      await supabase
        .from('user_neighborhood_preferences')
        .delete()
        .eq('user_id', userId)
        .eq('neighborhood_id', id);
    } else {
      localStorage.setItem(PREFS_KEY, JSON.stringify(Array.from(newSelected)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address');
      setStatus('error');
      return;
    }

    if (selected.size === 0) {
      setErrorMessage('Please select at least one neighborhood');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          neighborhoodIds: Array.from(selected)
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setStatus('success');
        setEmail('');
        localStorage.setItem(SUBSCRIBED_KEY, 'true');
        setIsSubscribed(true);
        const feedUrl = `/feed?neighborhoods=${Array.from(selected).join(',')}`;
        router.push(feedUrl);
      } else {
        setErrorMessage(data.error || 'Failed to subscribe');
        setStatus('error');
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  const handleExplore = () => {
    if (selected.size > 0) {
      router.push(`/feed?neighborhoods=${Array.from(selected).join(',')}`);
    } else {
      // Open global modal to choose neighborhoods
      openModal();
    }
  };

  // Don't show if already subscribed
  if (isSubscribed && status !== 'success') {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Selected Neighborhoods Display */}
      <div className="flex flex-wrap gap-2 justify-center items-center">
        {selectedNeighborhoods.slice(0, 5).map(hood => {
          const citySlug = cityToSlug(hood.city);
          const neighborhoodSlug = neighborhoodToSlug(hood.id);
          const feedUrl = `/${citySlug}/${neighborhoodSlug}`;

          return (
            <span
              key={hood.id}
              className="inline-flex items-center bg-black text-white text-sm leading-none"
            >
              <Link
                href={feedUrl}
                className="px-3 py-1.5 hover:bg-neutral-800 transition-colors"
              >
                {hood.name}
              </Link>
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
          <span className="text-sm text-neutral-500">
            +{selectedNeighborhoods.length - 5} more
          </span>
        )}

        {/* Add Neighborhoods Button - uses global modal */}
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2.5 px-5 py-2.5 border border-dashed border-neutral-300 text-neutral-600 text-sm tracking-wide hover:border-neutral-900 hover:text-neutral-900 transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
          {selected.size === 0 ? 'Choose Neighborhoods' : 'Add'}
        </button>
      </div>

      {/* Explore Button */}
      <div className="pt-4">
        <button
          onClick={handleExplore}
          className="inline-block border border-neutral-900 px-10 py-3.5 text-[11px] tracking-[0.2em] uppercase font-medium hover:bg-neutral-900 hover:text-white transition-all duration-300"
        >
          {selected.size > 0 ? 'Read Stories' : 'Browse All'}
        </button>
      </div>

      {/* Email Input */}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="px-5 py-3 border border-neutral-300 text-center sm:text-left text-sm focus:outline-none focus:border-neutral-900 w-full sm:w-72 transition-colors"
          disabled={status === 'loading'}
        />
        <button
          type="submit"
          disabled={status === 'loading' || selected.size === 0}
          className="px-8 py-3 bg-neutral-900 text-white text-[11px] tracking-[0.2em] uppercase font-medium hover:bg-neutral-800 transition-all duration-300 disabled:bg-neutral-400 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {status === 'loading' ? '...' : 'Subscribe'}
        </button>
      </form>

      {status === 'error' && (
        <p className="text-red-600 text-xs text-center">{errorMessage}</p>
      )}
    </div>
  );
}
