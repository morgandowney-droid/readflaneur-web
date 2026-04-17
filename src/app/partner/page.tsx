import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Partner with Flaneur | Daily Neighborhood Newsletters for Real Estate',
  description: 'Put your name on a daily neighborhood newsletter. 266 luxury neighborhoods, 92 cities, 42 countries. Exclusive to one agent per neighborhood.',
};

export default function PartnerLandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Hero */}
      <section className="py-20 md:py-32 px-6 text-center max-w-3xl mx-auto">
        <p className="text-xs tracking-[0.2em] uppercase text-accent mb-6">Partner with Flaneur</p>
        <h1 className="font-display text-3xl md:text-5xl font-light text-fg leading-tight mb-6">
          A Daily Neighborhood Newsletter for Your Clients
        </h1>
        <p className="text-lg md:text-xl text-fg-muted font-light leading-relaxed max-w-2xl mx-auto mb-10">
          Your clients read about their neighborhood every morning - restaurant openings, cultural events, market moves - with your name at the top. Exclusive to one agent per neighborhood.
        </p>
        <Link
          href="/partner/setup"
          className="btn-primary text-sm tracking-widest uppercase px-10 py-4 inline-block"
        >
          Get Started
        </Link>
      </section>

      {/* Stats */}
      <section className="border-t border-border py-16 px-6">
        <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <p className="font-display text-4xl md:text-5xl font-bold text-fg">266</p>
            <p className="text-xs tracking-[0.12em] uppercase text-fg-subtle mt-2">Neighborhoods</p>
          </div>
          <div>
            <p className="font-display text-4xl md:text-5xl font-bold text-fg">92</p>
            <p className="text-xs tracking-[0.12em] uppercase text-fg-subtle mt-2">Cities</p>
          </div>
          <div>
            <p className="font-display text-4xl md:text-5xl font-bold text-fg">42</p>
            <p className="text-xs tracking-[0.12em] uppercase text-fg-subtle mt-2">Countries</p>
          </div>
          <div>
            <p className="font-display text-4xl md:text-5xl font-bold text-fg">24h</p>
            <p className="text-xs tracking-[0.12em] uppercase text-fg-subtle mt-2">To Add Any Market</p>
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section className="border-t border-border py-16 md:py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl font-light text-fg mb-6">The Problem</h2>
          <p className="text-fg-muted text-lg leading-relaxed">
            You close a deal, hand over the keys, and then have no meaningful reason to stay in touch until the client wants to sell - five to ten years later. Holiday cards go in the trash. Market reports go unread. Your client forgets your name.
          </p>
        </div>
      </section>

      {/* The Solution */}
      <section className="border-t border-border py-16 md:py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl font-light text-fg mb-6">The Solution</h2>
          <p className="text-fg-muted text-lg leading-relaxed mb-4">
            Flaneur produces a daily editorial newsletter for 266 luxury neighborhoods worldwide - from Tribeca to Mayfair to Östermalm. We write about what&apos;s happening this week: new restaurants, gallery openings, school board decisions, permit filings, upcoming events. The things that matter to people who live there.
          </p>
          <p className="text-fg-muted text-lg leading-relaxed">
            We put your name and brand on it. Your clients receive it every morning at 7 AM local time. They stay connected to their neighborhood, and your name is the first thing they see every day.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-border py-16 md:py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl font-light text-fg mb-8">How It Works</h2>
          <div className="space-y-8">
            <div className="flex gap-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-surface flex items-center justify-center text-fg-subtle font-semibold">1</div>
              <div>
                <h3 className="text-fg font-semibold text-lg mb-1">Choose your neighborhood</h3>
                <p className="text-fg-muted leading-relaxed">Pick the neighborhood you work in. It becomes exclusively yours - no other agent from any brokerage can brand it.</p>
              </div>
            </div>
            <div className="flex gap-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-surface flex items-center justify-center text-fg-subtle font-semibold">2</div>
              <div>
                <h3 className="text-fg font-semibold text-lg mb-1">Add your details and listings</h3>
                <p className="text-fg-muted leading-relaxed">Upload your photo, enter your contact info, and add up to 3 featured property listings. You can update these anytime.</p>
              </div>
            </div>
            <div className="flex gap-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-surface flex items-center justify-center text-fg-subtle font-semibold">3</div>
              <div>
                <h3 className="text-fg font-semibold text-lg mb-1">Share your subscribe link</h3>
                <p className="text-fg-muted leading-relaxed">You get a unique link to share with clients. They enter their email and start receiving your branded daily newsletter the next morning.</p>
              </div>
            </div>
            <div className="flex gap-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-surface flex items-center justify-center text-fg-subtle font-semibold">4</div>
              <div>
                <h3 className="text-fg font-semibold text-lg mb-1">We handle the rest</h3>
                <p className="text-fg-muted leading-relaxed">Every morning at 7 AM, your clients receive a beautifully written daily brief about their neighborhood with your name, photo, and listings. You can add or remove client emails, update your listings, and change your details anytime.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What Clients Receive */}
      <section className="border-t border-border py-16 md:py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl font-light text-fg mb-8">What Your Clients Receive</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-fg font-semibold mb-1">Daily Brief</h3>
              <p className="text-fg-muted leading-relaxed">A morning newsletter covering local news, openings, closings, market activity, and neighborhood developments.</p>
            </div>
            <div>
              <h3 className="text-fg font-semibold mb-1">Look Ahead</h3>
              <p className="text-fg-muted leading-relaxed">A forward-looking guide to events, exhibitions, performances, and happenings in the next seven days.</p>
            </div>
            <div>
              <h3 className="text-fg font-semibold mb-1">Sunday Edition</h3>
              <p className="text-fg-muted leading-relaxed">A weekend magazine-style email with long-form neighborhood commentary, data points, and cultural observations.</p>
            </div>
            <div>
              <h3 className="text-fg font-semibold mb-1">Your Property Listings</h3>
              <p className="text-fg-muted leading-relaxed">Native placement for your active listings, shown as a natural part of the newsletter - not a banner ad.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-border py-16 md:py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl font-light text-fg mb-3 text-center">Pricing</h2>
          <p className="text-fg-muted text-center mb-10">Exclusive to one agent per neighborhood. Cancel anytime.</p>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="border border-border rounded-lg p-8 text-center">
              <p className="text-xs tracking-[0.12em] uppercase text-fg-subtle mb-2">Global Cities</p>
              <p className="font-display text-4xl font-bold text-fg mb-1">$1,500</p>
              <p className="text-fg-subtle text-sm mb-1">per neighborhood / month</p>
              <p className="text-accent text-sm font-medium mb-4">$15,000 / year</p>
              <p className="text-fg-subtle text-sm leading-relaxed">New York, London, Paris, Hong Kong, Los Angeles, Tokyo, Singapore, Miami, San Francisco</p>
            </div>
            <div className="border border-accent/30 rounded-lg p-8 text-center bg-surface">
              <p className="text-xs tracking-[0.12em] uppercase text-fg-subtle mb-2">Major Markets</p>
              <p className="font-display text-4xl font-bold text-fg mb-1">$1,000</p>
              <p className="text-fg-subtle text-sm mb-1">per neighborhood / month</p>
              <p className="text-accent text-sm font-medium mb-4">$10,000 / year</p>
              <p className="text-fg-subtle text-sm leading-relaxed">Chicago, Berlin, Sydney, Toronto, Barcelona, Amsterdam, Dubai, Stockholm, Rome, Washington DC</p>
            </div>
            <div className="border border-border rounded-lg p-8 text-center">
              <p className="text-xs tracking-[0.12em] uppercase text-fg-subtle mb-2">Resort & Enclave</p>
              <p className="font-display text-4xl font-bold text-fg mb-1">$750</p>
              <p className="text-fg-subtle text-sm mb-1">per neighborhood / month</p>
              <p className="text-accent text-sm font-medium mb-4">$7,500 / year</p>
              <p className="text-fg-subtle text-sm leading-relaxed">Aspen, The Hamptons, St. Barts, Marbella, Palm Beach, Courchevel, Nantucket, Gstaad</p>
            </div>
          </div>

          <div className="mt-8 border border-border rounded-lg p-8 bg-surface">
            <h3 className="text-fg font-semibold mb-3">For context: a top agent in Tribeca</h3>
            <p className="text-fg-muted leading-relaxed">
              Average sale: $3-5M. Commission on one deal: $90-150K. Marketing budget: $100-300K/year. A single magazine ad costs $5-20K and runs once.
            </p>
            <p className="text-fg-muted leading-relaxed mt-3">
              <strong className="text-fg">$15,000/year gets you:</strong> 365 daily touchpoints with every past client. Less than one magazine ad. Less than two months of a social media agency. And your competitor can&apos;t have it.
            </p>
          </div>
        </div>
      </section>

      {/* See It Live */}
      <section className="border-t border-border py-16 md:py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl font-light text-fg mb-6">See It Live</h2>
          <p className="text-fg-muted text-lg leading-relaxed mb-6">The product is running today. Click through to see what your clients would receive:</p>
          <div className="space-y-3">
            <a href="/new-york/tribeca" className="block text-accent hover:text-fg transition-colors text-lg">Tribeca Daily Brief &rsaquo;</a>
            <a href="/london/mayfair" className="block text-accent hover:text-fg transition-colors text-lg">Mayfair Daily Brief &rsaquo;</a>
            <a href="/los-angeles/beverly-hills" className="block text-accent hover:text-fg transition-colors text-lg">Beverly Hills Daily Brief &rsaquo;</a>
            <a href="/stockholm/ostermalm" className="block text-accent hover:text-fg transition-colors text-lg">Östermalm Daily Brief &rsaquo;</a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-20 md:py-28 px-6 text-center">
        <h2 className="font-display text-2xl md:text-3xl font-light text-fg mb-4">Ready to get started?</h2>
        <p className="text-fg-muted text-lg mb-8">Setup takes about 5 minutes. Your first newsletter goes out tomorrow morning.</p>
        <Link
          href="/partner/setup"
          className="btn-primary text-sm tracking-widest uppercase px-10 py-4 inline-block"
        >
          Get Started
        </Link>
        <p className="text-fg-subtle text-sm mt-6">
          Questions? <a href="mailto:morgan@readflaneur.com" className="text-accent hover:text-fg transition-colors">morgan@readflaneur.com</a>
        </p>
      </section>
    </div>
  );
}
