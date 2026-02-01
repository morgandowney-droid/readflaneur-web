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

  // Count total articles today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count: todayCount } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .gte('published_at', today.toISOString());

  const neighborhoods = (neighborhoodsData || []) as Neighborhood[];
  const cityCount = new Set(neighborhoods.map(n => n.city)).size;

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-black text-white py-20 md:py-28 px-4">
        <div className="mx-auto max-w-3xl text-center">
          {/* Logo */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-light tracking-[0.25em] mb-4">
            FLÂNEUR
          </h1>

          {/* Tagline */}
          <p className="text-lg md:text-xl text-neutral-300 mb-8 font-light">
            Stories from neighborhoods you love.
          </p>

          {/* Stats line */}
          <div className="flex items-center justify-center gap-3 text-sm text-neutral-400 mb-10">
            <span>{neighborhoods.length} neighborhoods</span>
            <span className="w-1 h-1 rounded-full bg-neutral-600" />
            <span>{cityCount} cities</span>
            {todayCount && todayCount > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-neutral-600" />
                <span>{todayCount} stories today</span>
              </>
            )}
          </div>

          {/* Decorative line */}
          <div className="w-16 h-px bg-neutral-700 mx-auto" />
        </div>
      </section>

      {/* Neighborhood Selection */}
      <section className="bg-white py-12 px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-xl font-light mb-2 text-neutral-800">
            Choose Your Neighborhoods
          </h2>
          <p className="text-sm text-neutral-500 mb-8">
            Select the places you care about and get personalized stories
          </p>
          <HomeSignupEnhanced neighborhoods={neighborhoods} />
        </div>
      </section>
    </div>
  );
}
