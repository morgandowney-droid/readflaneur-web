import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { NeighborhoodMap } from '@/components/maps/NeighborhoodMap';

interface MapPageProps {
  params: Promise<{
    city: string;
    neighborhood: string;
  }>;
}

export async function generateMetadata({ params }: MapPageProps) {
  const { city, neighborhood } = await params;
  const supabase = await createClient();

  const cityPrefixMap: Record<string, string> = {
    'new-york': 'nyc',
    'san-francisco': 'sf',
    'london': 'london',
    'sydney': 'sydney',
    'stockholm': 'stockholm',
  };

  const prefix = cityPrefixMap[city] || city;
  const neighborhoodId = `${prefix}-${neighborhood}`;

  const { data } = await supabase
    .from('neighborhoods')
    .select('name, city')
    .eq('id', neighborhoodId)
    .single();

  if (!data) {
    return { title: 'Map | Flâneur' };
  }

  return {
    title: `${data.name} Map | Flâneur`,
    description: `Interactive map of ${data.name} in ${data.city}.`,
  };
}

export default async function MapPage({ params }: MapPageProps) {
  const { city, neighborhood } = await params;
  const supabase = await createClient();

  const cityPrefixMap: Record<string, string> = {
    'new-york': 'nyc',
    'san-francisco': 'sf',
    'london': 'london',
    'sydney': 'sydney',
    'stockholm': 'stockholm',
  };

  const prefix = cityPrefixMap[city] || city;
  const neighborhoodId = `${prefix}-${neighborhood}`;

  const { data: neighborhoodData } = await supabase
    .from('neighborhoods')
    .select('*')
    .eq('id', neighborhoodId)
    .single();

  if (!neighborhoodData) {
    notFound();
  }

  return (
    <div className="py-8 px-4">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 text-center">
          <Link
            href={`/${city}/${neighborhood}`}
            className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-neutral-400 hover:text-black mb-4"
          >
            <span>&larr;</span>
            <span>Back to {neighborhoodData.name}</span>
          </Link>
          <p className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-2">
            {neighborhoodData.city}
          </p>
          <h1 className="text-2xl font-light tracking-wide">
            {neighborhoodData.name} Map
          </h1>
        </header>

        <div className="aspect-[4/3] w-full">
          <NeighborhoodMap neighborhoodId={neighborhoodId} className="h-full" />
        </div>

        <div className="mt-6 text-center text-sm text-neutral-500">
          <p>The highlighted area shows the core neighborhood boundaries.</p>
        </div>
      </div>
    </div>
  );
}
