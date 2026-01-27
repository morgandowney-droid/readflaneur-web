import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Neighborhood } from '@/types';

export const metadata = {
  title: 'All Neighborhoods | Flâneur',
  description: 'Browse all neighborhoods covered by Flâneur.',
};

export default async function NeighborhoodsPage() {
  const supabase = await createClient();

  const { data: neighborhoods } = await supabase
    .from('neighborhoods')
    .select('*')
    .order('city', { ascending: true });

  // Group by city
  const groupedByCity: Record<string, Neighborhood[]> = (neighborhoods || []).reduce(
    (acc: Record<string, Neighborhood[]>, n: Neighborhood) => {
      if (!acc[n.city]) acc[n.city] = [];
      acc[n.city].push(n);
      return acc;
    },
    {}
  );

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-light tracking-wide mb-2">Neighborhoods</h1>
        <p className="text-neutral-500 mb-12">
          Choose a neighborhood to see local stories.
        </p>

        {(Object.entries(groupedByCity) as [string, Neighborhood[]][]).map(([city, items]) => (
          <div key={city} className="mb-12">
            <h2 className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-4">
              {city}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((neighborhood) => (
                <Link
                  key={neighborhood.id}
                  href={`/${city.toLowerCase().replace(/\s+/g, '-')}/${neighborhood.id.split('-').slice(1).join('-')}`}
                  className="group block p-6 bg-white border border-neutral-200 hover:border-black transition-colors"
                >
                  <h3 className="text-lg font-medium group-hover:underline">
                    {neighborhood.name}
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
