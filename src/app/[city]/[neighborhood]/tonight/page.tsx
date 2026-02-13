'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { buildNeighborhoodId } from '@/lib/neighborhood-utils';

interface TonightPick {
  id: string;
  title: string;
  description: string | null;
  venue_name: string | null;
  venue_address: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  category: string | null;
  is_free: boolean;
  price_info: string | null;
  requires_reservation: boolean;
  reservation_url: string | null;
  is_featured: boolean;
  expires_at: string;
}

function formatTime(time: string | null): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${minutes !== '00' ? `:${minutes}` : ''}${ampm}`;
}

function CategoryIcon({ category }: { category: string | null }) {
  switch (category) {
    case 'opening':
      return <span>🎨</span>;
    case 'show':
      return <span>🎭</span>;
    case 'pop-up':
      return <span>✨</span>;
    case 'market':
      return <span>🛍️</span>;
    case 'screening':
      return <span>🎬</span>;
    case 'party':
      return <span>🎉</span>;
    case 'tasting':
      return <span>🍷</span>;
    default:
      return <span>📍</span>;
  }
}

export default function TonightPage() {
  const params = useParams();
  const city = params.city as string;
  const neighborhood = params.neighborhood as string;

  const [picks, setPicks] = useState<TonightPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<'today' | 'tomorrow' | 'weekend'>('today');
  const [neighborhoodName, setNeighborhoodName] = useState('');

  const neighborhoodId = buildNeighborhoodId(city, neighborhood);

  useEffect(() => {
    fetchPicks();
  }, [neighborhoodId, selectedDate]);

  const fetchPicks = async () => {
    setLoading(true);
    const supabase = createClient();

    const now = new Date();
    let startDate: string;
    let endDate: string;

    if (selectedDate === 'today') {
      startDate = now.toISOString().split('T')[0];
      endDate = startDate;
    } else if (selectedDate === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      startDate = tomorrow.toISOString().split('T')[0];
      endDate = startDate;
    } else {
      // Weekend
      const dayOfWeek = now.getDay();
      const saturday = new Date(now);
      saturday.setDate(now.getDate() + (6 - dayOfWeek));
      const sunday = new Date(saturday);
      sunday.setDate(saturday.getDate() + 1);
      startDate = saturday.toISOString().split('T')[0];
      endDate = sunday.toISOString().split('T')[0];
    }

    const { data } = await supabase
      .from('tonight_picks')
      .select('*')
      .eq('neighborhood_id', neighborhoodId)
      .eq('is_published', true)
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .gt('expires_at', now.toISOString())
      .order('is_featured', { ascending: false })
      .order('start_time', { ascending: true });

    setPicks(data || []);

    const formattedName = neighborhood
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    setNeighborhoodName(formattedName);

    setLoading(false);
  };

  const formattedCity = city
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const getDateLabel = () => {
    const now = new Date();
    if (selectedDate === 'today') {
      return now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    } else if (selectedDate === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }
    return 'This Weekend';
  };

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
            className="text-xs tracking-widest uppercase text-fg-muted hover:text-black"
          >
            &larr; {neighborhoodName}
          </Link>
        </div>

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-light mb-1">Tonight</h1>
          <p className="text-sm text-fg-subtle">
            What's happening in {neighborhoodName}.
          </p>
        </header>

        {/* Date Selector */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setSelectedDate('today')}
            className={`px-4 py-2 text-sm transition-colors ${
              selectedDate === 'today'
                ? 'bg-black text-white'
                : 'border border-neutral-200 hover:border-black'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setSelectedDate('tomorrow')}
            className={`px-4 py-2 text-sm transition-colors ${
              selectedDate === 'tomorrow'
                ? 'bg-black text-white'
                : 'border border-neutral-200 hover:border-black'
            }`}
          >
            Tomorrow
          </button>
          <button
            onClick={() => setSelectedDate('weekend')}
            className={`px-4 py-2 text-sm transition-colors ${
              selectedDate === 'weekend'
                ? 'bg-black text-white'
                : 'border border-neutral-200 hover:border-black'
            }`}
          >
            Weekend
          </button>
        </div>

        {/* Date Label */}
        <p className="text-xs tracking-widest uppercase text-fg-muted mb-4">
          {getDateLabel()}
        </p>

        {/* Picks List */}
        {picks.length === 0 ? (
          <div className="text-center py-12 bg-neutral-50">
            <p className="text-fg-subtle">Nothing scheduled yet.</p>
            <p className="text-sm text-fg-muted mt-1">Check back later.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {picks.map((pick) => (
              <div
                key={pick.id}
                className={`p-4 border ${
                  pick.is_featured ? 'border-black bg-neutral-50' : 'border-neutral-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">
                    <CategoryIcon category={pick.category} />
                  </span>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium">{pick.title}</h3>

                    {pick.venue_name && (
                      <p className="text-xs text-neutral-600 mt-1">{pick.venue_name}</p>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-xs text-fg-subtle">
                      {pick.start_time && (
                        <span>
                          {formatTime(pick.start_time)}
                          {pick.end_time && ` - ${formatTime(pick.end_time)}`}
                        </span>
                      )}
                      {pick.is_free ? (
                        <span className="text-green-600">Free</span>
                      ) : pick.price_info ? (
                        <span>{pick.price_info}</span>
                      ) : null}
                      {pick.requires_reservation && (
                        <span className="text-orange-600">RSVP required</span>
                      )}
                    </div>

                    {pick.description && (
                      <p className="text-xs text-neutral-600 mt-2">{pick.description}</p>
                    )}

                    {(pick.reservation_url || pick.venue_address) && (
                      <div className="flex gap-3 mt-3 text-xs">
                        {pick.reservation_url && (
                          <a
                            href={pick.reservation_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-fg-muted hover:text-black transition-colors"
                          >
                            Reserve
                          </a>
                        )}
                        {pick.venue_address && (
                          <a
                            href={`https://maps.google.com/?q=${encodeURIComponent(pick.venue_address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-fg-muted hover:text-black transition-colors"
                          >
                            Directions
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
