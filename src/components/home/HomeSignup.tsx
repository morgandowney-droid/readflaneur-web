'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
}

interface HomeSignupProps {
  neighborhoods: Neighborhood[];
}

const PREFS_KEY = 'flaneur-neighborhood-preferences';
const SUBSCRIBED_KEY = 'flaneur-newsletter-subscribed';

export function HomeSignup({ neighborhoods }: HomeSignupProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Load preferences on mount
  useEffect(() => {
    const loadData = async () => {
      // Check if already subscribed
      const subscribed = localStorage.getItem(SUBSCRIBED_KEY);
      if (subscribed === 'true') {
        setIsSubscribed(true);
      }

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setUserId(session.user.id);
        // Load from database for logged-in users
        const { data } = await supabase
          .from('user_neighborhood_preferences')
          .select('neighborhood_id')
          .eq('user_id', session.user.id);

        if (data && data.length > 0) {
          setSelected(data.map(p => p.neighborhood_id));
        }
      } else {
        // Load from localStorage for guests
        const stored = localStorage.getItem(PREFS_KEY);
        if (stored) {
          try {
            setSelected(JSON.parse(stored));
          } catch {
            // Invalid stored data
          }
        }
      }
    };

    loadData();
  }, []);

  const toggleNeighborhood = async (id: string) => {
    const newSelected = selected.includes(id)
      ? selected.filter(s => s !== id)
      : [...selected, id];

    setSelected(newSelected);

    if (userId) {
      // Save to database for logged-in users
      const supabase = createClient();
      if (selected.includes(id)) {
        await supabase
          .from('user_neighborhood_preferences')
          .delete()
          .eq('user_id', userId)
          .eq('neighborhood_id', id);
      } else {
        await supabase
          .from('user_neighborhood_preferences')
          .insert({ user_id: userId, neighborhood_id: id });
      }
    } else {
      // Save to localStorage for guests
      localStorage.setItem(PREFS_KEY, JSON.stringify(newSelected));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address');
      setStatus('error');
      return;
    }

    if (selected.length === 0) {
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
          neighborhoodIds: selected
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setStatus('success');
        setEmail('');
        localStorage.setItem(SUBSCRIBED_KEY, 'true');
        setIsSubscribed(true);
        // Redirect to feed with selected neighborhoods
        const feedUrl = `/feed?neighborhoods=${selected.join(',')}`;
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

  // Don't show if already subscribed
  if (isSubscribed && status !== 'success') {
    return null;
  }


  const handleExplore = () => {
    if (selected.length > 0) {
      // Go directly to feed with selected neighborhoods
      router.push(`/feed?neighborhoods=${selected.join(',')}`);
    } else {
      // No selection, go to neighborhoods page
      router.push('/neighborhoods');
    }
  };

  return (
    <div className="space-y-3">
      {/* Neighborhood Selection - Simple centered chips */}
      <div className="flex flex-wrap gap-2 justify-center max-w-full overflow-hidden">
        {neighborhoods.map(hood => (
          <button
            key={hood.id}
            onClick={() => toggleNeighborhood(hood.id)}
            type="button"
            className={`px-4 py-2.5 text-sm border transition-colors min-h-[44px] ${
              selected.includes(hood.id)
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-surface text-neutral-400 border-white/[0.08] hover:border-white/20'
            }`}
          >
            {hood.name}
          </button>
        ))}
        <a
          href="/suggest"
          className="px-4 py-2.5 text-sm border border-dashed border-white/[0.08] text-neutral-500 hover:border-white/20 hover:text-neutral-400 transition-colors min-h-[44px] flex items-center"
        >
          + Suggest
        </a>
      </div>

      {/* Explore Button - goes to feed if neighborhoods selected */}
      <div className="pt-2">
        <button
          onClick={handleExplore}
          className="inline-block border border-white/[0.08] text-neutral-100 px-8 py-3 text-sm tracking-widest uppercase hover:bg-white/10 hover:text-white transition-colors"
        >
          Explore Neighborhoods
        </button>
      </div>

      {/* Email Input */}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 justify-center items-center">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="px-4 py-2 bg-surface border border-white/[0.08] text-neutral-100 rounded-none text-center sm:text-left text-sm focus:outline-none focus:border-amber-500 placeholder:text-neutral-500 w-full sm:w-64"
          disabled={status === 'loading'}
        />
        <button
          type="submit"
          disabled={status === 'loading' || selected.length === 0}
          className="px-6 py-2 bg-black text-white text-xs tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50 whitespace-nowrap"
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
