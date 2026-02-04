import { createClient } from '@/lib/supabase/server';
import { HomeSignupEnhanced } from '@/components/home/HomeSignupEnhanced';
import { Neighborhood } from '@/types';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createClient();

  // Fetch all neighborhoods
  const { data: neighborhoodsData } = await supabase
    .from('neighborhoods')
    .select('*')
    .eq('is_active', true)
    .order('city')
    .order('name');

  const neighborhoods = (neighborhoodsData || []) as Neighborhood[];
  // Exclude combo neighborhoods from counts (they aggregate other neighborhoods)
  const regularNeighborhoods = neighborhoods.filter(n => !n.is_combo);
  const cityCount = new Set(regularNeighborhoods.map(n => n.city)).size;

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-black text-white py-24 md:py-32 lg:py-40 px-6">
        <div className="mx-auto max-w-3xl text-center">
          {/* Logo */}
          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-light tracking-[0.3em] mb-6">
            FLÂNEUR
          </h1>

          {/* Tagline */}
          <p className="text-base md:text-xl text-neutral-400 mb-12 font-light tracking-wide whitespace-nowrap">
            Local stories, interesting neighborhoods.
          </p>

          {/* Stats */}
          <div className="flex items-center justify-center gap-3 text-xs tracking-[0.2em] uppercase text-neutral-500 mb-12">
            <span>{regularNeighborhoods.length} neighborhoods</span>
            <span className="w-px h-3 bg-neutral-700" />
            <span>{cityCount} cities</span>
          </div>

          {/* Decorative element */}
          <div className="w-8 h-px bg-neutral-600 mx-auto" />
        </div>
      </section>

      {/* Neighborhood Selection */}
      <section className="bg-white py-16 md:py-20 px-6">
        <div className="mx-auto max-w-2xl text-center">
          <HomeSignupEnhanced neighborhoods={neighborhoods} />
        </div>
      </section>
    </div>
  );
}
