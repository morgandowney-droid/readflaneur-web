'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

const REFERRAL_STORAGE_KEY = 'flaneur-referral-code';

export function InviteHero() {
  const searchParams = useSearchParams();
  const refCode = searchParams.get('ref');

  useEffect(() => {
    if (!refCode) return;

    // Store referral code for attribution during subscribe
    sessionStorage.setItem(REFERRAL_STORAGE_KEY, refCode);

    // Fire-and-forget click tracking
    try {
      fetch('/api/referral/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: refCode }),
      }).catch(() => {});
    } catch {
      // Silent fail
    }
  }, [refCode]);

  return (
    <section className="relative overflow-hidden bg-black text-white py-28 md:py-36 lg:py-48 px-6">
      {/* Gradient overlay for tonal depth */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at top, rgba(30,30,30,1), rgba(0,0,0,1) 70%)' }}
      />

      <div className="relative mx-auto max-w-3xl text-center">
        {/* Subheading */}
        {refCode && (
          <p className="hero-fade-in text-sm text-neutral-500 mb-6 font-light tracking-[0.3em] uppercase">
            A friend invited you to
          </p>
        )}

        {/* Logo */}
        <h1 className="hero-fade-in font-display text-6xl md:text-7xl lg:text-8xl font-light tracking-[0.3em] mb-6">
          FLANEUR
        </h1>

        {/* Tagline */}
        <p className="hero-fade-in-delay-1 text-sm md:text-base text-neutral-400 mb-12 font-light tracking-[0.5em] uppercase">
          {refCode
            ? 'Local stories, interesting neighborhoods.'
            : 'Local stories, interesting neighborhoods.'
          }
        </p>

        {/* Decorative element */}
        <div className="hero-fade-in-delay-2 w-8 h-px bg-neutral-600 mx-auto" />
      </div>
    </section>
  );
}
