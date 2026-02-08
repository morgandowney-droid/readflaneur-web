'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

interface BookingInfo {
  neighborhoodName: string;
  cityName: string;
  date: string;
  placementType: string;
  adId: string;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    // Look up booking details from session ID
    fetch(`/api/ads/booking-info?session_id=${encodeURIComponent(sessionId)}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) setBooking(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  const displayDate = booking?.date
    ? new Date(booking.date + 'T00:00:00Z').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '';

  const placementLabel = booking?.placementType === 'sunday_edition'
    ? 'Sunday Edition'
    : 'Daily Brief';

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <p className="text-xs tracking-[0.3em] uppercase text-neutral-500 mb-4">
          Booking Confirmed
        </p>
        <h1 className="font-[family-name:var(--font-cormorant)] text-3xl font-light mb-6">
          {loading ? 'Processing...' : 'Your placement is secured'}
        </h1>

        {booking && (
          <div className="bg-neutral-900 border border-neutral-800 p-6 mb-8 text-left">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Neighborhood</span>
                <span>{booking.neighborhoodName}{booking.cityName ? `, ${booking.cityName}` : ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Date</span>
                <span>{displayDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Placement</span>
                <span>{placementLabel}</span>
              </div>
            </div>
          </div>
        )}

        <p className="text-neutral-400 text-sm leading-relaxed mb-8">
          Check your email for a link to upload your ad creative.
          Our editorial team will review it and notify you when it&apos;s live.
        </p>

        {booking?.adId && (
          <a
            href={`/advertise/upload/${booking.adId}`}
            className="inline-block bg-white text-black px-8 py-3 text-sm tracking-widest uppercase hover:bg-neutral-200 transition-colors mb-4"
          >
            Upload Creative Now
          </a>
        )}

        <div className="mt-4">
          <a
            href="/advertise"
            className="text-neutral-500 text-sm underline underline-offset-4 hover:text-neutral-300"
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
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-neutral-500 text-sm">Loading...</p>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
