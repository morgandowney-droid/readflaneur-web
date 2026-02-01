import { createClient } from '@/lib/supabase/server';
import { EditorialHero } from '@/components/home/EditorialHero';
import { HomeSignupEnhanced } from '@/components/home/HomeSignupEnhanced';
import { Neighborhood } from '@/types';

export const dynamic = 'force-dynamic';

// Map city prefix to URL city slug
const prefixToCitySlug: Record<string, string> = {
  'nyc': 'new-york',
  'sf': 'san-francisco',
  'la': 'los-angeles',
  'chicago': 'chicago',
  'miami': 'miami',
  'dc': 'washington-dc',
  'toronto': 'toronto',
  'london': 'london',
  'paris': 'paris',
  'berlin': 'berlin',
  'amsterdam': 'amsterdam',
  'stockholm': 'stockholm',
  'copenhagen': 'copenhagen',
  'barcelona': 'barcelona',
  'milan': 'milan',
  'lisbon': 'lisbon',
  'tokyo': 'tokyo',
  'hongkong': 'hong-kong',
  'singapore': 'singapore',
  'sydney': 'sydney',
  'melbourne': 'melbourne',
  'dubai': 'dubai',
  'telaviv': 'tel-aviv',
};

export default async function HomePage() {
  const supabase = await createClient();

  // Fetch featured stories with images for the editorial hero
  const { data: articles } = await supabase
    .from('articles')
    .select('id, headline, slug, preview_text, image_url, neighborhood_id, published_at')
    .eq('status', 'published')
    .not('image_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(5);

  // Fetch all neighborhoods
  const { data: neighborhoodsData } = await supabase
    .from('neighborhoods')
    .select('*')
    .order('city')
    .order('name');

  // Build neighborhood lookup map
  const neighborhoodMap = new Map((neighborhoodsData || []).map((n: any) => [n.id, n]));

  // Transform articles for the editorial hero
  const featuredStories = (articles || []).map((a: any) => {
    const hood = neighborhoodMap.get(a.neighborhood_id);
    let url = '#';

    const articleSlug = a.slug || a.id;

    if (hood && articleSlug && a.neighborhood_id) {
      const parts = a.neighborhood_id.split('-');
      const prefix = parts[0];
      const neighborhoodSlug = parts.slice(1).join('-');
      const citySlug = prefixToCitySlug[prefix] || prefix;
      url = `/${citySlug}/${neighborhoodSlug}/${articleSlug}`;
    }

    return {
      headline: a.headline,
      preview: a.preview_text || '',
      neighborhood: hood?.name || 'Local',
      imageUrl: a.image_url,
      url,
      publishedAt: a.published_at || new Date().toISOString(),
    };
  });

  const neighborhoods = (neighborhoodsData || []) as Neighborhood[];

  return (
    <div className="min-h-screen bg-black">
      {/* Hero Section */}
      <section className="relative">
        {/* Logo + Tagline Overlay */}
        <div className="absolute top-0 left-0 right-0 z-10 pt-8 pb-6 text-center pointer-events-none">
          <h1 className="text-3xl md:text-4xl font-light tracking-[0.25em] text-white drop-shadow-lg">
            FLÂNEUR
          </h1>
          <p className="mt-2 text-sm text-white/70 tracking-wide">
            Stories from neighborhoods you love
          </p>
        </div>

        {/* Editorial Hero */}
        <EditorialHero stories={featuredStories} rotationInterval={7000} />
      </section>

      {/* Neighborhood Selection */}
      <section className="bg-white py-10 px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm text-neutral-500 mb-6">
            Choose your neighborhoods and get stories in your inbox
          </p>
          <HomeSignupEnhanced neighborhoods={neighborhoods} />
        </div>
      </section>
    </div>
  );
}
