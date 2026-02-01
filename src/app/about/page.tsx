'use client';

import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-light tracking-wide mb-8">About</h1>

        <section className="mb-12">
          <p className="text-sm text-neutral-700 leading-relaxed mb-6">
            Flâneur is a hyper-local news platform for the discerning reader. We believe that the
            best stories are found in the neighborhoods where we live, work, and wander.
          </p>
          <p className="text-sm text-neutral-700 leading-relaxed mb-6">
            The word <em>flâneur</em> comes from the French verb <em>flâner</em>, meaning to stroll
            or to saunter. A flâneur is an urban explorer, someone who walks the city with no
            particular destination, absorbing the life of the streets and the stories they tell.
          </p>
          <p className="text-sm text-neutral-700 leading-relaxed">
            We bring that spirit of curious wandering to local journalism, covering the openings
            and closings, the people and places, the culture and commerce that make each
            neighborhood unique.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-medium mb-4">What We Cover</h2>
          <div className="grid grid-cols-2 gap-4 text-sm text-neutral-700">
            <div>
              <p className="font-medium mb-1">Dining & Drinks</p>
              <p className="text-neutral-500">Restaurant openings, chef moves, bar news</p>
            </div>
            <div>
              <p className="font-medium mb-1">Culture</p>
              <p className="text-neutral-500">Art, music, theater, exhibitions</p>
            </div>
            <div>
              <p className="font-medium mb-1">Retail & Commerce</p>
              <p className="text-neutral-500">Shop openings, market news, local business</p>
            </div>
            <div>
              <p className="font-medium mb-1">Real Estate</p>
              <p className="text-neutral-500">Development, property trends, notable sales</p>
            </div>
            <div>
              <p className="font-medium mb-1">Community</p>
              <p className="text-neutral-500">Local events, neighborhood issues, people</p>
            </div>
            <div>
              <p className="font-medium mb-1">Tonight</p>
              <p className="text-neutral-500">What&apos;s happening in your neighborhood today</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-medium mb-4">Our Coverage</h2>
          <p className="text-sm text-neutral-700 leading-relaxed mb-4">
            We currently cover 91 neighborhoods across 23 cities worldwide, from the West Village
            in New York to Marais in Paris, Shoreditch in London to Shibuya in Tokyo.
          </p>
          <p className="text-sm text-neutral-700 leading-relaxed">
            Each neighborhood has its own dedicated feed, curated guide, and local events calendar.
            Select the neighborhoods you care about and we&apos;ll deliver the stories that matter to you.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-medium mb-4">Community-Sourced</h2>
          <p className="text-sm text-neutral-700 leading-relaxed mb-4">
            The best local news comes from the people who live it. We welcome tips and suggestions
            from our readers about what&apos;s happening in their neighborhoods. Spotted something
            interesting? Heard about a new opening? Have an idea for a story? Let us know.
          </p>
          <Link
            href="/contact"
            className="inline-block text-xs tracking-widest uppercase border border-black px-4 py-2 hover:bg-black hover:text-white transition-colors"
          >
            Share a Tip or Suggestion
          </Link>
        </section>

        <section className="mb-12">
          <h2 className="text-lg font-medium mb-4">Advertise With Us</h2>
          <p className="text-sm text-neutral-700 leading-relaxed mb-4">
            Reach engaged, local readers in the neighborhoods where they live and spend.
            Our advertising is designed to fit seamlessly into the reading experience while
            supporting independent local journalism.
          </p>
          <Link
            href="/advertise"
            className="inline-block text-xs tracking-widest uppercase border border-black px-4 py-2 hover:bg-black hover:text-white transition-colors"
          >
            Learn More
          </Link>
        </section>

        <section className="border-t border-neutral-200 pt-8">
          <h2 className="text-lg font-medium mb-4">Contact</h2>
          <p className="text-sm text-neutral-700 mb-2">
            General inquiries: <a href="mailto:contact@readflaneur.com" className="underline hover:text-black">contact@readflaneur.com</a>
          </p>
          <p className="text-sm text-neutral-700 mb-2">
            Advertising: <a href="mailto:ads@readflaneur.com" className="underline hover:text-black">ads@readflaneur.com</a>
          </p>
          <p className="text-sm text-neutral-700">
            Tips: <a href="mailto:tips@readflaneur.com" className="underline hover:text-black">tips@readflaneur.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}
