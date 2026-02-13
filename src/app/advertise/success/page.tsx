'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

interface BookingItem {
  adId: string;
  neighborhoodName: string;
  cityName: string;
  date: string;
  placementType: string;
}

interface BookingInfo {
  bookings: BookingItem[];
  // Legacy single fields
  neighborhoodName: string;
  cityName: string;
  date: string;
  placementType: string;
  adId: string;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    fetch(`/api/ads/booking-info?session_id=${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setInfo(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  const bookings = info?.bookings || (info ? [info] : []);

  const displayDate = bookings[0]?.date
    ? new Date(bookings[0].date + 'T00:00:00Z').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';

  const placementLabel =
    bookings[0]?.placementType === 'sunday_edition' ? 'Sunday Edition' : 'Daily Brief';

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <p className="text-xs tracking-[0.3em] uppercase text-fg-subtle mb-4">
          Booking Confirmed
        </p>
        <h1 className="font-[family-name:var(--font-cormorant)] text-3xl font-light mb-6">
          {loading ? 'Processing...' : 'Your placement is secured'}
        </h1>

        {bookings.length > 0 && (
          <div className="bg-surface border border-border rounded-lg p-6 mb-8 text-left">
            <div className="space-y-2 text-sm">
              {bookings.length === 1 ? (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">Neighborhood</span>
                  <span>
                    {bookings[0].neighborhoodName}
                    {bookings[0].cityName ? `, ${bookings[0].cityName}` : ''}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-fg-subtle block mb-1">Neighborhoods</span>
                  {bookings.map((b) => (
                    <div key={b.adId} className="flex justify-between py-0.5">
                      <span>
                        {b.neighborhoodName}
                        {b.cityName ? `, ${b.cityName}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-fg-subtle">Date</span>
                <span>{displayDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-subtle">Placement</span>
                <span>{placementLabel}</span>
              </div>
            </div>
          </div>
        )}

        <p className="text-fg-muted text-base leading-relaxed mb-8">
          Check your email for {bookings.length > 1 ? 'links' : 'a link'} to upload your ad
          creative. Our editorial team will review it and notify you when{' '}
          {bookings.length > 1 ? 'your ads are' : "it's"} live.
        </p>

        {/* Upload links */}
        {bookings.length === 1 && bookings[0].adId && (
          <a
            href={`/advertise/upload/${bookings[0].adId}`}
            className="inline-block bg-white text-black px-8 py-3 text-sm tracking-widest uppercase rounded-lg hover:opacity-80 transition-colors mb-4"
          >
            Upload Creative Now
          </a>
        )}

        {bookings.length > 1 && (
          <div className="space-y-2 mb-4">
            {bookings.map((b) => (
              <a
                key={b.adId}
                href={`/advertise/upload/${b.adId}`}
                className="block bg-white text-black px-6 py-3 text-sm tracking-widest uppercase rounded-lg hover:opacity-80 transition-colors"
              >
                Upload — {b.neighborhoodName}
              </a>
            ))}
          </div>
        )}

        <div className="mt-4">
          <a
            href="/advertise"
            className="text-fg-subtle text-sm underline underline-offset-4 hover:text-fg-muted"
          >
            Back to Advertising
          </a>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
          <p className="text-fg-subtle text-sm">Loading...</p>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
