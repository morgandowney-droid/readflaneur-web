import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TypewriterHeadlines } from '@/components/home/TypewriterHeadlines';
import { HomeSignupEnhanced } from '@/components/home/HomeSignupEnhanced';
import { Neighborhood } from '@/types';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createClient();

  // Fetch recent headlines for the typewriter
  const { data: articles } = await supabase
    .from('articles')
    .select('id, headline, slug, neighborhood_id')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(10);

  // Fetch all neighborhoods (used for both headlines and signup)
  const { data: neighborhoodsData } = await supabase
    .from('neighborhoods')
    .select('*')
    .order('city')
    .order('name');

  // Build neighborhood lookup map
  const neighborhoodMap = new Map((neighborhoodsData || []).map((n: any) => [n.id, n]));

  // Map city prefix to URL city slug
  const prefixToCitySlug: Record<string, string> = {
    'nyc': 'new-york',
    'sf': 'san-francisco',
    'london': 'london',
    'sydney': 'sydney',
    'stockholm': 'stockholm',
  };

  const headlines = (articles || []).map((a: any) => {
    const hood = neighborhoodMap.get(a.neighborhood_id);
    let url = '#';

    // Use slug if available, otherwise fall back to id
    const articleSlug = a.slug || a.id;

    if (hood && articleSlug && a.neighborhood_id) {
      // Extract prefix and neighborhood part from id like "nyc-west-village"
      const parts = a.neighborhood_id.split('-');
      const prefix = parts[0];
      const neighborhoodSlug = parts.slice(1).join('-'); // "west-village"
      const citySlug = prefixToCitySlug[prefix] || prefix;
      url = `/${citySlug}/${neighborhoodSlug}/${articleSlug}`;
    }

    return {
      text: a.headline,
      neighborhood: hood?.name || 'Local',
      url,
    };
  });

  const neighborhoods = (neighborhoodsData || []) as Neighborhood[];

  return (
    <div>
      {/* Hero */}
      <section className="bg-black text-white py-24 px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl md:text-5xl font-light tracking-[0.2em] mb-6">
            FLÂNEUR
          </h1>
          <p className="text-lg text-neutral-300 mb-8">
            Stories daily from neighborhoods you love.
          </p>

          {/* Typewriter Headlines */}
          <div className="mb-8">
            <TypewriterHeadlines headlines={headlines} />
          </div>
        </div>
      </section>

      {/* Neighborhood Selection & Explore */}
      <section className="py-6 px-4 border-t border-neutral-200">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm text-neutral-500 mb-4">
            Choose your neighborhoods and get stories in your inbox
          </p>
          <HomeSignupEnhanced neighborhoods={neighborhoods} />
        </div>
      </section>
    </div>
  );
}
