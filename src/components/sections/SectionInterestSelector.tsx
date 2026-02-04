'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Section } from '@/types';

const GUEST_INTERESTS_KEY = 'flaneur-section-interests';

interface SectionInterestSelectorProps {
  onSave?: (selectedIds: string[]) => void;
  compact?: boolean;
}

export function SectionInterestSelector({ onSave, compact = false }: SectionInterestSelectorProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();

      // Check if user is logged in
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user?.id || null);

      // Fetch all active sections
      const { data: sectionsData } = await supabase
        .from('sections')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      setSections(sectionsData || []);

      // Load existing interests
      if (session?.user?.id) {
        // Load from database for logged-in users
        const { data: interests } = await supabase
          .from('user_section_interests')
          .select('section_id')
          .eq('user_id', session.user.id);

        setSelectedIds(interests?.map(i => i.section_id) || []);
      } else {
        // Load from localStorage for guests
        const stored = localStorage.getItem(GUEST_INTERESTS_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              setSelectedIds(parsed);
            }
          } catch {
            // Invalid stored data
          }
        }
      }

      setLoading(false);
    };

    init();
  }, []);

  const toggleSection = (sectionId: string) => {
    setSelectedIds(prev => {
      if (prev.includes(sectionId)) {
        return prev.filter(id => id !== sectionId);
      }
      return [...prev, sectionId];
    });
  };

  const saveInterests = async () => {
    setSaving(true);

    const supabase = createClient();

    if (userId) {
      // Save to database for logged-in users
      // First, delete all existing interests
      await supabase
        .from('user_section_interests')
        .delete()
        .eq('user_id', userId);

      // Insert new interests
      if (selectedIds.length > 0) {
        const interests = selectedIds.map(section_id => ({
          user_id: userId,
          section_id,
        }));
        await supabase.from('user_section_interests').insert(interests);
      }
    } else {
      // Save to localStorage for guests
      localStorage.setItem(GUEST_INTERESTS_KEY, JSON.stringify(selectedIds));
    }

    setSaving(false);
    onSave?.(selectedIds);
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-neutral-100 rounded w-48 mb-4"></div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-10 bg-neutral-100 rounded w-24"></div>
          ))}
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => toggleSection(section.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border transition-colors ${
                selectedIds.includes(section.id)
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
              }`}
            >
              {section.icon && <span>{section.icon}</span>}
              <span>{section.name}</span>
            </button>
          ))}
        </div>
        <button
          onClick={saveInterests}
          disabled={saving}
          className="text-xs tracking-widest uppercase text-neutral-500 hover:text-black transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-light mb-2">Your Interests</h3>
        <p className="text-sm text-neutral-500">
          Select topics you're interested in to personalize your stories.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => toggleSection(section.id)}
            className={`flex flex-col items-center gap-2 p-4 border transition-colors ${
              selectedIds.includes(section.id)
                ? 'bg-black text-white border-black'
                : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
            }`}
          >
            {section.icon && <span className="text-2xl">{section.icon}</span>}
            <span className="text-sm font-medium">{section.name}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
        <p className="text-xs text-neutral-400">
          {selectedIds.length} of {sections.length} selected
        </p>
        <button
          onClick={saveInterests}
          disabled={saving}
          className="px-6 py-2 bg-black text-white text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>

      {!userId && (
        <p className="text-xs text-neutral-400 text-center">
          Sign in to sync your preferences across devices.
        </p>
      )}
    </div>
  );
}

// Helper function to get guest interests from localStorage
export function getGuestSectionInterests(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(GUEST_INTERESTS_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
