'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
}

interface NeighborhoodSelectorProps {
  neighborhoods: Neighborhood[];
  onSelectionChange?: (selectedIds: string[]) => void;
}

const PREFS_KEY = 'flaneur-neighborhood-preferences';

export function NeighborhoodSelector({
  neighborhoods,
  onSelectionChange
}: NeighborhoodSelectorProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
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
          const ids = data.map(p => p.neighborhood_id);
          setSelected(ids);
          onSelectionChange?.(ids);
        }
      } else {
        // Load from localStorage for guests
        const stored = localStorage.getItem(PREFS_KEY);
        if (stored) {
          try {
            const ids = JSON.parse(stored);
            setSelected(ids);
            onSelectionChange?.(ids);
          } catch {
            // Invalid stored data
          }
        }
      }
    };

    loadPreferences();
  }, []);

  const toggleNeighborhood = async (id: string) => {
    setSaving(true);
    const newSelected = selected.includes(id)
      ? selected.filter(s => s !== id)
      : [...selected, id];

    setSelected(newSelected);
    onSelectionChange?.(newSelected);

    if (userId) {
      // Save to database for logged-in users
      const supabase = createClient();
      if (selected.includes(id)) {
        // Remove
        await supabase
          .from('user_neighborhood_preferences')
          .delete()
          .eq('user_id', userId)
          .eq('neighborhood_id', id);
      } else {
        // Add
        await supabase
          .from('user_neighborhood_preferences')
          .insert({ user_id: userId, neighborhood_id: id });
      }
    } else {
      // Save to localStorage for guests
      localStorage.setItem(PREFS_KEY, JSON.stringify(newSelected));
    }

    setSaving(false);
  };

  // Group neighborhoods by city
  const byCity = neighborhoods.reduce((acc, n) => {
    if (!acc[n.city]) acc[n.city] = [];
    acc[n.city].push(n);
    return acc;
  }, {} as Record<string, Neighborhood[]>);

  return (
    <div className="space-y-4">
      {Object.entries(byCity).map(([city, hoods]) => (
        <div key={city}>
          <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
            {city}
          </p>
          <div className="flex flex-wrap gap-2">
            {hoods.map(hood => (
              <button
                key={hood.id}
                onClick={() => toggleNeighborhood(hood.id)}
                disabled={saving}
                className={`px-3 py-1.5 text-sm border transition-colors ${
                  selected.includes(hood.id)
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-neutral-600 border-neutral-300 hover:border-black'
                } disabled:opacity-50`}
              >
                {hood.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      {selected.length > 0 && (
        <p className="text-xs text-neutral-500 mt-2">
          {selected.length} neighborhood{selected.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}

// Export function to get preferences (for use in newsletter signup)
export function getStoredNeighborhoodPreferences(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(PREFS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  return [];
}
