'use client';

import { useState } from 'react';

interface BookingFormProps {
  neighborhoodIds: string[];
  placementType: 'daily_brief' | 'sunday_edition';
  date: string;
  totalPriceCents: number;
}

export function BookingForm({ neighborhoodIds, placementType, date, totalPriceCents }: BookingFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleBook = async () => {
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/ads/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          neighborhoodIds,
          placementType,
          customerEmail: email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Booking failed');
        setLoading(false);
        return;
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const count = neighborhoodIds.length;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs tracking-[0.2em] uppercase text-neutral-500 mb-2">
          Your Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(''); }}
          placeholder="you@company.com"
          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-base text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        onClick={handleBook}
        disabled={loading}
        className="w-full bg-white text-black py-3 text-sm tracking-widest uppercase rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? 'Processing...'
          : `Book ${count > 1 ? `${count} neighborhoods for ` : 'for '}$${(totalPriceCents / 100).toFixed(0)}`}
      </button>

      <p className="text-xs text-neutral-600 text-center">
        You&apos;ll be redirected to Stripe for secure payment.
      </p>
    </div>
  );
}
