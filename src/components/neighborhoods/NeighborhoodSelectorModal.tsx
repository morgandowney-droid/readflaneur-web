'use client';

import { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Neighborhood, GlobalRegion } from '@/types';
import { getCityCode } from '@/lib/neighborhood-utils';

const PREFS_KEY = 'flaneur-neighborhood-preferences';

// City gradient configurations
const CITY_GRADIENTS: Record<string, string> = {
  'New York': 'from-slate-900 to-neutral-700',
  'San Francisco': 'from-orange-400 to-rose-400',
  'Los Angeles': 'from-purple-400 to-orange-300',
  'Chicago': 'from-sky-800 to-indigo-800',
  'Miami': 'from-cyan-400 to-emerald-400',
  'Washington DC': 'from-slate-600 to-zinc-600',
  'Toronto': 'from-red-600 to-red-700',
  'London': 'from-slate-500 to-stone-500',
  'Paris': 'from-rose-300 to-amber-100',
  'Berlin': 'from-zinc-700 to-stone-700',
  'Amsterdam': 'from-orange-500 to-yellow-500',
  'Stockholm': 'from-blue-400 to-cyan-400',
  'Copenhagen': 'from-indigo-400 to-sky-400',
  'Barcelona': 'from-amber-500 to-red-500',
  'Milan': 'from-emerald-600 to-cyan-600',
  'Lisbon': 'from-yellow-400 to-blue-500',
  'Tokyo': 'from-pink-500 to-purple-600',
  'Hong Kong': 'from-red-500 to-pink-500',
  'Singapore': 'from-emerald-500 to-teal-500',
  'Sydney': 'from-sky-500 to-indigo-400',
  'Melbourne': 'from-violet-500 to-fuchsia-400',
  'Dubai': 'from-amber-500 to-orange-400',
  'Tel Aviv': 'from-blue-500 to-cyan-400',
};

// Modal Context
interface NeighborhoodModalContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const NeighborhoodModalContext = createContext<NeighborhoodModalContextType | null>(null);

export function useNeighborhoodModal() {
  const context = useContext(NeighborhoodModalContext);
  if (!context) {
    throw new Error('useNeighborhoodModal must be used within NeighborhoodModalProvider');
  }
  return context;
}

export function NeighborhoodModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <NeighborhoodModalContext.Provider
      value={{
        isOpen,
        openModal: () => setIsOpen(true),
        closeModal: () => setIsOpen(false),
      }}
    >
      {children}
      <GlobalNeighborhoodModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </NeighborhoodModalContext.Provider>
  );
}

function GlobalNeighborhoodModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);

  // Load neighborhoods and preferences
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setLoading(true);
      const supabase = createClient();

      // Fetch neighborhoods
      const { data: neighborhoodsData } = await supabase
        .from('neighborhoods')
        .select('*')
        .eq('is_active', true)
        .order('city')
        .order('name');

      if (neighborhoodsData) {
        setNeighborhoods(neighborhoodsData as Neighborhood[]);
      }

      // Check auth and load preferences
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

      setLoading(false);
    };

    loadData();
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Group neighborhoods by city
  const citiesWithNeighborhoods = useMemo(() => {
    const map = new Map<string, Neighborhood[]>();
    neighborhoods.forEach(n => {
      if (!map.has(n.city)) map.set(n.city, []);
      map.get(n.city)!.push(n);
    });
    return Array.from(map.entries()).map(([city, hoods]) => ({
      city,
      code: getCityCode(city),
      neighborhoods: hoods,
      gradient: CITY_GRADIENTS[city] || 'from-neutral-600 to-neutral-800',
    }));
  }, [neighborhoods]);

  // Filter based on search
  const filteredCities = useMemo(() => {
    if (!searchQuery.trim()) return citiesWithNeighborhoods;
    const query = searchQuery.toLowerCase();
    return citiesWithNeighborhoods
      .map(c => ({
        ...c,
        neighborhoods: c.neighborhoods.filter(n =>
          n.name.toLowerCase().includes(query) ||
          n.city.toLowerCase().includes(query)
        ),
      }))
      .filter(c => c.neighborhoods.length > 0);
  }, [citiesWithNeighborhoods, searchQuery]);

  const toggleNeighborhood = async (id: string) => {
    const newSelected = new Set(selected);

    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }

    setSelected(newSelected);

    if (userId) {
      const supabase = createClient();
      if (selected.has(id)) {
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
      localStorage.setItem(PREFS_KEY, JSON.stringify(Array.from(newSelected)));
    }
  };

  const selectAllInCity = async (cityNeighborhoods: Neighborhood[]) => {
    const ids = cityNeighborhoods.filter(n => !n.is_coming_soon).map(n => n.id);
    const newSelected = new Set([...selected, ...ids]);

    setSelected(newSelected);

    if (userId) {
      const supabase = createClient();
      const toAdd = ids.filter(id => !selected.has(id));
      if (toAdd.length > 0) {
        await supabase
          .from('user_neighborhood_preferences')
          .upsert(toAdd.map(id => ({ user_id: userId, neighborhood_id: id })));
      }
    } else {
      localStorage.setItem(PREFS_KEY, JSON.stringify(Array.from(newSelected)));
    }
  };

  const handleExplore = () => {
    if (selected.size > 0) {
      router.push(`/feed?neighborhoods=${Array.from(selected).join(',')}`);
    } else {
      router.push('/neighborhoods');
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        ref={modalRef}
        className="absolute inset-4 sm:inset-8 md:inset-12 lg:inset-y-12 lg:inset-x-24 xl:inset-y-16 xl:inset-x-32 bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-neutral-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-light tracking-tight text-neutral-900">
                Choose Neighborhoods
              </h2>
              <p className="text-sm text-neutral-500 mt-1">
                {selected.size > 0 ? (
                  <><span className="font-medium text-neutral-900">{selected.size}</span> selected</>
                ) : (
                  'Select neighborhoods to personalize your feed'
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 -m-2 text-neutral-400 hover:text-neutral-900 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="mt-4 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search cities or neighborhoods..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-neutral-100 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:bg-white transition-all"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Modal Body - Cities Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-neutral-200 border-t-black rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCities.map(({ city, code, neighborhoods: cityHoods, gradient }) => {
                const selectedInCity = cityHoods.filter(n => selected.has(n.id)).length;
                const isExpanded = activeCity === city || searchQuery.length > 0;

                return (
                  <div
                    key={city}
                    className={`rounded-xl overflow-hidden border transition-all duration-200 ${
                      selectedInCity > 0
                        ? 'border-neutral-900 shadow-lg'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    {/* City Header */}
                    <button
                      onClick={() => setActiveCity(activeCity === city ? null : city)}
                      className="w-full text-left"
                    >
                      <div className={`relative h-16 bg-gradient-to-br ${gradient}`}>
                        <div className="absolute inset-0 flex items-center justify-between px-4">
                          <div>
                            <h3 className="text-sm font-semibold text-white drop-shadow">
                              {city}
                            </h3>
                            <p className="text-xs text-white/70">
                              {code} · {cityHoods.length} area{cityHoods.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                          {selectedInCity > 0 && (
                            <span className="px-2 py-0.5 bg-white rounded-full text-xs font-medium text-neutral-900 shadow">
                              {selectedInCity}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Neighborhoods */}
                    <div className={`bg-white transition-all duration-200 ${isExpanded ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-neutral-100">
                          <span className="text-xs text-neutral-400">Neighborhoods</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              selectAllInCity(cityHoods);
                            }}
                            className="text-xs text-neutral-500 hover:text-neutral-900 font-medium"
                          >
                            Select all
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {cityHoods.map(hood => {
                            const isSelected = selected.has(hood.id);
                            return (
                              <button
                                key={hood.id}
                                onClick={() => toggleNeighborhood(hood.id)}
                                disabled={hood.is_coming_soon}
                                className={`relative px-2.5 py-1 text-xs rounded-md transition-all ${
                                  hood.is_coming_soon
                                    ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                                    : isSelected
                                    ? 'bg-neutral-900 text-white'
                                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                                }`}
                              >
                                {hood.name}
                                {hood.is_coming_soon && <span className="ml-1 text-[10px]">(Soon)</span>}
                                {isSelected && (
                                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center">
                                    <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredCities.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-neutral-500">No neighborhoods found for "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-sm text-neutral-900 font-medium hover:underline"
              >
                Clear search
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            {selected.size > 0 ? (
              <><span className="font-medium text-neutral-900">{selected.size}</span> neighborhood{selected.size !== 1 ? 's' : ''} selected</>
            ) : (
              'Select at least one neighborhood'
            )}
          </p>
          <button
            onClick={handleExplore}
            disabled={selected.size === 0}
            className="px-5 py-2 text-sm font-medium bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {selected.size > 0 ? 'Explore Feed' : 'Browse All'}
          </button>
        </div>
      </div>
    </div>
  );
}
