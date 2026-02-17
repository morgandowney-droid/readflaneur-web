import { createClient } from '@/lib/supabase/server';
import { HeroStats } from '@/components/home/HeroStats';
import { HomepageEnterButton } from '@/components/home/HomepageEnterButton';
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
      <section data-theme="dark" className="relative overflow-hidden bg-black text-white py-28 md:py-36 lg:py-48 px-6">
        {/* Gradient overlay for tonal depth */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at top, rgba(30,30,30,1), rgba(0,0,0,1) 70%)' }}
        />

        <div className="relative mx-auto max-w-3xl text-center">
          {/* Logo */}
          <h1 className="hero-fade-in font-display text-6xl md:text-7xl lg:text-8xl font-light tracking-[0.3em] mb-6">
            FLANEUR
          </h1>

          {/* Tagline */}
          <p className="hero-fade-in-delay-1 text-sm md:text-base text-fg-muted mb-12 font-light tracking-[0.5em] uppercase">
            Local stories, interesting neighborhoods.
          </p>

          {/* Stats */}
          <div className="hero-fade-in-delay-2">
            <HeroStats neighborhoodCount={regularNeighborhoods.length} cityCount={cityCount} />
          </div>

          {/* Decorative element */}
          <div className="hero-fade-in-delay-3 w-8 h-px bg-fg-subtle mx-auto" />

          {/* Enter button */}
          <div className="hero-fade-in-delay-4">
            <HomepageEnterButton />
          </div>
        </div>
      </section>
    </div>
  );
}
