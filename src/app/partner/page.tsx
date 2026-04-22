import Link from 'next/link';
import type { Metadata } from 'next';

const PARTNER_TITLE = 'Your Name on a Daily Neighborhood Newsletter - Flaneur';
const PARTNER_DESC = 'One luxury real estate broker per neighborhood. 270 neighborhoods across 42 countries. Your name, photo, and listings delivered to your client list every morning at 7 AM. 14-day free trial.';

export const metadata: Metadata = {
  title: PARTNER_TITLE,
  description: PARTNER_DESC,
  openGraph: {
    title: PARTNER_TITLE,
    description: PARTNER_DESC,
    type: 'website',
    siteName: 'Flaneur',
    url: 'https://readflaneur.com/partner',
    // Rendered by src/app/partner/opengraph-image.tsx - a dedicated 1200x630
    // card for the partner program, distinct from the generic Flaneur OG
  },
  twitter: {
    card: 'summary_large_image',
    title: PARTNER_TITLE,
    description: PARTNER_DESC,
  },
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
        <p className="text-fg-subtle text-sm mt-4">
          <Link href="/partner/dashboard" className="text-accent hover:text-fg transition-colors">
            Already a partner? Sign in
          </Link>
        </p>
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
            <p className="font-display text-4xl md:text-5xl font-bold text-fg">Local</p>
            <p className="text-xs tracking-[0.12em] uppercase text-fg-subtle mt-2">Your Neighborhood Daily</p>
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
                <p className="text-fg-muted leading-relaxed">Pick the neighborhood you work in. It becomes exclusively yours - no other agent from any brokerage can brand it. If your neighborhood isn&apos;t listed, we can add it within 24 hours.</p>
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
                <h3 className="text-fg font-semibold text-lg mb-1">Add your clients</h3>
                <p className="text-fg-muted leading-relaxed">Enter client email addresses directly, or share your unique subscribe link and let them sign up themselves. Either way, they start receiving your branded newsletter the next morning.</p>
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
          <h2 className="font-display text-2xl md:text-3xl font-light text-fg mb-3">What Your Clients Receive</h2>
          <p className="text-fg-muted mb-8">One email every day, delivered at 7 AM in the neighborhood&apos;s local timezone - 365 mornings a year.</p>
          <div className="space-y-6">
            <div>
              <h3 className="text-fg font-semibold mb-1">Daily Brief <span className="text-fg-subtle font-normal text-sm">- Every day, 7 AM local time</span></h3>
              <p className="text-fg-muted leading-relaxed">A morning newsletter covering local news, restaurant openings and closings, market activity, and neighborhood developments. Includes a Look Ahead section with events, exhibitions, and happenings in the next seven days. Sent every day of the week, weekends included.</p>
            </div>
            <div>
              <h3 className="text-fg font-semibold mb-1">Your Property Listings <span className="text-fg-subtle font-normal text-sm">- in every email</span></h3>
              <p className="text-fg-muted leading-relaxed">Native placement for your active listings, shown as a natural part of the newsletter - not a banner ad. Your photo and contact details appear in every email.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-border py-16 md:py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl font-light text-fg mb-3 text-center">Pricing</h2>
          <p className="text-fg-muted text-center mb-10">Exclusive to one agent per neighborhood. 14-day free trial. Cancel anytime.</p>

          <div className="max-w-md mx-auto border border-accent/30 rounded-lg p-10 text-center bg-surface">
            <p className="text-xs tracking-[0.12em] uppercase text-fg-subtle mb-2">One neighborhood, one agent</p>
            <p className="font-display text-5xl font-bold text-fg mb-2">US$999</p>
            <p className="text-fg-subtle text-sm mb-6">per month - billed in USD</p>
            <ul className="text-left text-fg-muted text-sm leading-relaxed space-y-2 mb-6">
              <li>&middot; Branded Daily Brief to your clients, every day at 7 AM local</li>
              <li>&middot; Your photo, listings, and contact details in every email</li>
              <li>&middot; You receive a copy of every send, so you see exactly what they see</li>
              <li>&middot; Weekly performance report (opens, clicks, listing impressions)</li>
              <li>&middot; Exclusive to one agent per neighborhood</li>
            </ul>
            <p className="text-accent text-sm font-medium mb-3">14-day free trial. No charge today.</p>
            <p className="text-fg-subtle text-xs leading-relaxed text-left">
              First billing starts 14 days after activation, then monthly on the 15th day after activation. You can cancel anytime before or after the free trial. If you cancel before the end of the free trial, no billing occurs.
            </p>
          </div>

          <div className="mt-8 border border-border rounded-lg p-8 bg-surface">
            <h3 className="text-fg font-semibold mb-3">For context</h3>
            <p className="text-fg-muted leading-relaxed">
              A single print ad in a luxury magazine costs $5-20K and runs once. A social media agency retainer runs $2-5K per month. A direct mail campaign costs $1-3K per drop.
            </p>
            <p className="text-fg-muted leading-relaxed mt-3">
              <strong className="text-fg">This gets you:</strong> 365 daily touchpoints with every past client - for less than a single print ad. And your competitor can&apos;t have it.
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

      {/* Questions */}
      <section className="border-t border-border py-16 md:py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl font-light text-fg mb-8">Questions You&apos;ll Ask</h2>

          <div className="space-y-8">
            <div>
              <h3 className="text-fg font-semibold text-lg mb-2">Do you provide the email list?</h3>
              <p className="text-fg-muted leading-relaxed">
                No. You bring your list. Flaneur does not have a pre-built audience of readers we route to you. At setup you paste in your own client emails - past buyers, sellers, prospects, sphere of influence. No minimum, no maximum. You also get a personal subscribe link (yours alone) to grow the list over time via your website, email signature, or social.
              </p>
              <p className="text-fg-muted leading-relaxed mt-3">
                What we provide is the editorial content, your branding on top, and the tech to deliver it every morning. Your clients stay your clients. If you cancel, you keep every contact you added.
              </p>
            </div>

            <div>
              <h3 className="text-fg font-semibold text-lg mb-2">Can anyone read this content on your website?</h3>
              <p className="text-fg-muted leading-relaxed">
                Yes, the neighborhood content is publicly available on readflaneur.com. But that&apos;s not what you&apos;re paying for. Nobody bookmarks a website and checks it every morning. They do open an email from &ldquo;James Chen: Tribeca Daily&rdquo; at 7 AM over coffee. You&apos;re paying for daily delivery to your clients&apos; inboxes with your name, your photo, and your listings - 365 touchpoints a year that your competitor doesn&apos;t have.
              </p>
            </div>

            <div>
              <h3 className="text-fg font-semibold text-lg mb-2">How large is the Flaneur team?</h3>
              <p className="text-fg-muted leading-relaxed">
                Flaneur is a technology company, not a newsroom. The platform generates editorial content for 266 neighborhoods in 42 countries simultaneously, every day, at 7 AM local time in each market. You&apos;re not licensing a team of writers. You&apos;re licensing a system that&apos;s already running, that doesn&apos;t miss a morning, and that scales to any neighborhood on earth within 24 hours.
              </p>
            </div>

            <div>
              <h3 className="text-fg font-semibold text-lg mb-2">Could we build this ourselves?</h3>
              <p className="text-fg-muted leading-relaxed">
                You could. It involves sourcing local news from RSS feeds, social media, government databases, and event calendars for hundreds of neighborhoods daily. Enriching raw facts into editorial prose. Generating event listings with venue deduplication. Managing image libraries. Handling timezone-aware email delivery across 42 countries. Translation into 9 languages. Health monitoring and self-healing infrastructure. We&apos;ve been building this for over a year. You could start today and be operational in 12-18 months - or you could have it tomorrow.
              </p>
              <p className="text-fg-muted leading-relaxed mt-3">
                Your business is selling real estate. Ours is producing neighborhood content.
              </p>
            </div>
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
        <p className="text-fg-subtle text-sm mt-4">
          <Link href="/partner/dashboard" className="text-accent hover:text-fg transition-colors">
            Already a partner? Sign in
          </Link>
        </p>
        <p className="text-fg-subtle text-sm mt-4">
          Questions? <a href="mailto:md@readflaneur.com" className="text-accent hover:text-fg transition-colors">md@readflaneur.com</a>
        </p>
      </section>
    </div>
  );
}
