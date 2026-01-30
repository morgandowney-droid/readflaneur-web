'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface SpottedItem {
  id: string;
  content: string;
  category: string;
  location_description: string | null;
  business_name: string | null;
  verification_count: number;
  ai_sentiment: string | null;
  ai_urgency: string | null;
  is_featured: boolean;
  spotted_at: string;
  created_at: string;
}

function timeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString();
}

function CategoryBadge({ category }: { category: string }) {
  const badges: Record<string, { label: string; color: string }> = {
    restaurant_crowd: { label: 'Crowds', color: 'bg-orange-100 text-orange-700' },
    construction: { label: 'Construction', color: 'bg-yellow-100 text-yellow-700' },
    celebrity: { label: 'Spotted', color: 'bg-purple-100 text-purple-700' },
    new_business: { label: 'Opening', color: 'bg-green-100 text-green-700' },
    closure: { label: 'Closing', color: 'bg-red-100 text-red-700' },
    traffic: { label: 'Traffic', color: 'bg-blue-100 text-blue-700' },
    event: { label: 'Event', color: 'bg-pink-100 text-pink-700' },
    general: { label: 'General', color: 'bg-neutral-100 text-neutral-700' },
  };

  const badge = badges[category] || badges.general;

  return (
    <span className={`text-[10px] px-1.5 py-0.5 ${badge.color}`}>
      {badge.label}
    </span>
  );
}

function UrgencyIndicator({ urgency }: { urgency: string | null }) {
  if (urgency === 'breaking') {
    return <span className="text-red-500 text-[10px] font-medium">LIVE</span>;
  }
  if (urgency === 'timely') {
    return <span className="text-orange-500 text-[10px]">NOW</span>;
  }
  return null;
}

export default function SpottedPage() {
  const params = useParams();
  const city = params.city as string;
  const neighborhood = params.neighborhood as string;

  const [items, setItems] = useState<SpottedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [neighborhoodName, setNeighborhoodName] = useState('');

  const cityPrefixMap: Record<string, string> = {
    'new-york': 'nyc',
    'san-francisco': 'sf',
    'london': 'london',
    'sydney': 'sydney',
    'stockholm': 'stockholm',
  };
  const prefix = cityPrefixMap[city] || city;
  const neighborhoodId = `${prefix}-${neighborhood}`;

  useEffect(() => {
    fetchItems();

    // Set up real-time subscription for new items
    const supabase = createClient();
    const subscription = supabase
      .channel('spotted_items')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'spotted_items',
          filter: `neighborhood_id=eq.${neighborhoodId}`,
        },
        (payload) => {
          if ((payload.new as SpottedItem).is_published) {
            setItems((prev) => [payload.new as SpottedItem, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [neighborhoodId]);

  const fetchItems = async () => {
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('spotted_items')
      .select('*')
      .eq('neighborhood_id', neighborhoodId)
      .eq('is_published', true)
      .order('spotted_at', { ascending: false })
      .limit(100);

    setItems(data || []);

    const formattedName = neighborhood
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    setNeighborhoodName(formattedName);

    setLoading(false);
  };

  const filteredItems = filter
    ? items.filter(item => item.category === filter)
    : items;

  const formattedCity = city
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  if (loading) {
    return (
      <div className="py-8 px-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-center py-24">
            <div className="inline-block w-8 h-8 border-2 border-neutral-200 border-t-black rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 px-4">
      <div className="mx-auto max-w-3xl">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href={`/${city}/${neighborhood}`}
            className="text-xs tracking-widest uppercase text-neutral-400 hover:text-black"
          >
            &larr; {neighborhoodName}
          </Link>
        </div>

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-light mb-1">Spotted</h1>
          <p className="text-sm text-neutral-500">
            Real-time sightings from {neighborhoodName}.
          </p>
        </header>

        {/* Filter */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setFilter(null)}
            className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
              !filter ? 'bg-black text-white' : 'border border-neutral-200 hover:border-black'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('restaurant_crowd')}
            className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
              filter === 'restaurant_crowd' ? 'bg-black text-white' : 'border border-neutral-200 hover:border-black'
            }`}
          >
            Crowds
          </button>
          <button
            onClick={() => setFilter('new_business')}
            className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
              filter === 'new_business' ? 'bg-black text-white' : 'border border-neutral-200 hover:border-black'
            }`}
          >
            Openings
          </button>
          <button
            onClick={() => setFilter('closure')}
            className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
              filter === 'closure' ? 'bg-black text-white' : 'border border-neutral-200 hover:border-black'
            }`}
          >
            Closings
          </button>
          <button
            onClick={() => setFilter('construction')}
            className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
              filter === 'construction' ? 'bg-black text-white' : 'border border-neutral-200 hover:border-black'
            }`}
          >
            Construction
          </button>
        </div>

        {/* Items List */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 bg-neutral-50">
            <p className="text-neutral-500">Nothing spotted yet.</p>
            <p className="text-sm text-neutral-400 mt-1">Be the first to report something.</p>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-neutral-100">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`py-4 ${item.is_featured ? 'bg-neutral-50 -mx-4 px-4' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <CategoryBadge category={item.category} />
                      <UrgencyIndicator urgency={item.ai_urgency} />
                      {item.verification_count > 1 && (
                        <span className="text-[10px] text-neutral-400">
                          {item.verification_count} reports
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-neutral-800">{item.content}</p>

                    {(item.location_description || item.business_name) && (
                      <p className="text-xs text-neutral-500 mt-1">
                        {item.business_name && <span className="font-medium">{item.business_name}</span>}
                        {item.business_name && item.location_description && ' · '}
                        {item.location_description}
                      </p>
                    )}
                  </div>

                  <span className="text-xs text-neutral-400 whitespace-nowrap">
                    {timeAgo(item.spotted_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submit Tip CTA */}
        <div className="mt-8 p-6 bg-neutral-50 border border-neutral-200 text-center">
          <p className="text-sm text-neutral-600 mb-3">
            See something? Say something.
          </p>
          <Link
            href={`/${city}/${neighborhood}?tip=true`}
            className="inline-block px-6 py-2 bg-black text-white text-xs tracking-widest uppercase hover:bg-neutral-800 transition-colors"
          >
            Submit a Tip
          </Link>
        </div>
      </div>
    </div>
  );
}
