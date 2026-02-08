'use client';

import { AD_COLLECTIONS } from '@/config/ad-config';
import { GLOBAL_TAKEOVER_RATES } from '@/config/ad-tiers';
import { AdBookingCalendar } from '@/components/advertise/AdBookingCalendar';

export default function AdvertisePage() {
  return (
    <div className="bg-neutral-950 text-white min-h-screen -mt-[1px]">
      {/* Hero */}
      <section className="pt-20 pb-16 px-4 text-center">
        <p className="text-xs tracking-[0.3em] uppercase text-neutral-500 mb-6">
          Advertising
        </p>
        <h1 className="font-[family-name:var(--font-cormorant)] text-4xl md:text-5xl font-light leading-tight max-w-3xl mx-auto mb-6">
          Reach The World&apos;s Most Important People
        </h1>
        <p className="text-neutral-400 max-w-xl mx-auto text-base leading-relaxed">
          Your brand, native in the neighborhoods where wealth concentrates.
          Every placement is hand-reviewed and designed to feel like editorial.
        </p>
      </section>

      {/* Audience Profile Strip */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Avg. Net Worth', value: 'High' },
            { label: 'Email Open Rate', value: '>55%' },
            { label: 'Neighborhoods', value: '128' },
            { label: 'Cities', value: '38' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-neutral-900 border border-neutral-800 p-5 text-center"
            >
              <p className="text-2xl font-light mb-1">{stat.value}</p>
              <p className="text-xs tracking-[0.2em] uppercase text-neutral-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* The Three Collections */}
      <section className="px-4 pb-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-500 mb-10 text-center">
            Collections
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {AD_COLLECTIONS.map((collection) => (
              <div
                key={collection.key}
                className={`bg-neutral-900 border p-8 flex flex-col ${
                  collection.key === 'tier1'
                    ? 'border-amber-800/40'
                    : 'border-neutral-800'
                }`}
              >
                {/* Badge row — invisible placeholder on non-tier1 to align prices */}
                {collection.key === 'tier1' ? (
                  <span className="text-xs tracking-[0.2em] uppercase text-amber-600 mb-3 block">
                    Flagship
                  </span>
                ) : (
                  <span className="text-xs mb-3 block invisible" aria-hidden="true">
                    &nbsp;
                  </span>
                )}
                <h3 className="font-[family-name:var(--font-cormorant)] text-2xl font-light mb-2">
                  {collection.name}
                </h3>
                <p className="text-base text-neutral-400 mb-6 leading-relaxed">
                  {collection.tagline}
                </p>
                <div className="mb-6 space-y-1">
                  <div>
                    <span className="text-3xl font-light">${collection.dailyPrice}</span>
                    <span className="text-neutral-500 text-sm">/day per individual neighborhood</span>
                  </div>
                  <div>
                    <span className="text-xl font-light text-neutral-300">${collection.sundayPrice}</span>
                    <span className="text-neutral-500 text-sm">/day per individual neighborhood</span>
                  </div>
                </div>
                <p className="text-sm text-neutral-500 mb-6 leading-relaxed flex-1">
                  {collection.description}
                </p>
                <div className="mb-6">
                  <p className="text-xs tracking-[0.2em] uppercase text-neutral-600 mb-2">
                    Example Neighborhoods
                  </p>
                  <p className="text-sm text-neutral-400">
                    {collection.exampleNeighborhoods.join(' / ')}
                  </p>
                </div>
                <a
                  href="#book"
                  className="block text-center bg-white text-black py-3 text-sm tracking-widest uppercase rounded-lg hover:bg-neutral-200 transition-colors"
                >
                  Book Now
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Booking Calendar */}
      <section id="book" className="px-4 pb-20">
        <div className="max-w-xl mx-auto">
          <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-500 mb-3 text-center">
            Book a Placement
          </h2>
          <p className="text-neutral-400 text-base text-center mb-8">
            Select a neighborhood, choose your date, and check out securely via Stripe.
          </p>
          <AdBookingCalendar />
        </div>
      </section>

      {/* Global Takeover */}
      <section className="px-4 pb-20">
        <div className="max-w-2xl mx-auto text-center border border-amber-800/30 bg-neutral-900 py-12 px-6">
          <p className="text-xs tracking-[0.2em] uppercase text-amber-600 mb-4">
            Premium
          </p>
          <h2 className="font-[family-name:var(--font-cormorant)] text-2xl font-light mb-4">
            Global Takeover
          </h2>
          <p className="text-base text-neutral-400 mb-6 leading-relaxed max-w-lg mx-auto">
            Own every neighborhood for an entire day. Your brand appears across all 128 neighborhoods
            in 38 cities — the most concentrated wealth audience on the internet.
          </p>
          <div className="flex justify-center gap-8 mb-8">
            <div>
              <span className="text-2xl font-light">${(GLOBAL_TAKEOVER_RATES.dailyBrief / 100).toLocaleString()}</span>
              <span className="text-neutral-500 text-sm">/day</span>
            </div>
            <div>
              <span className="text-2xl font-light">${(GLOBAL_TAKEOVER_RATES.sundayEdition / 100).toLocaleString()}</span>
              <span className="text-neutral-500 text-sm">/Sunday</span>
            </div>
          </div>
          <a
            href="mailto:ads@readflaneur.com?subject=Global%20Takeover%20Inquiry"
            className="inline-block bg-white text-black px-8 py-3 text-sm tracking-widest uppercase rounded-lg hover:bg-neutral-200 transition-colors"
          >
            Contact Us
          </a>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-4 pb-20">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-500 mb-10 text-center">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: '1',
                title: 'Select Date',
                desc: 'Choose your neighborhood and pick an available date from the calendar.',
              },
              {
                step: '2',
                title: 'Pay',
                desc: 'Check out securely through Stripe. Exclusive ownership of your date is guaranteed.',
              },
              {
                step: '3',
                title: 'Upload Creative',
                desc: 'Submit your imagery and message via the upload link sent to your email.',
              },
              {
                step: '4',
                title: 'Go Live',
                desc: 'Our editorial team reviews your ad. On your booked date, it appears in feeds and daily briefs.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-10 h-10 border border-neutral-700 flex items-center justify-center text-sm text-neutral-400 mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-medium text-base mb-2">{item.title}</h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 pb-20">
        <div className="max-w-2xl mx-auto text-center border border-neutral-800 bg-neutral-900 py-12 px-6">
          <h2 className="font-[family-name:var(--font-cormorant)] text-2xl font-light mb-4">
            Ready to reach the world&apos;s most discerning readers?
          </h2>
          <p className="text-base text-neutral-400 mb-8">
            Questions? Email{' '}
            <a
              href="mailto:ads@readflaneur.com"
              className="text-white underline underline-offset-4 hover:text-neutral-300"
            >
              ads@readflaneur.com
            </a>
          </p>
          <a
            href="#book"
            className="inline-block bg-white text-black px-8 py-3 text-sm tracking-widest uppercase rounded-lg hover:bg-neutral-200 transition-colors"
          >
            Book Your Placement
          </a>
        </div>
      </section>
    </div>
  );
}
