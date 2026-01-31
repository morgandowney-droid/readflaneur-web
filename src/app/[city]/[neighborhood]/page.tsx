import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NeighborhoodFeed } from '@/components/feed/NeighborhoodFeed';
import { LoadMoreButton } from '@/components/feed/LoadMoreButton';
import { injectAds } from '@/lib/ad-engine';
import { Article, Ad } from '@/types';
import { buildNeighborhoodId } from '@/lib/neighborhood-utils';

const INITIAL_PAGE_SIZE = 10;

interface NeighborhoodPageProps {
  params: Promise<{
    city: string;
    neighborhood: string;
  }>;
}

export async function generateMetadata({ params }: NeighborhoodPageProps) {
  const { city, neighborhood } = await params;
  const supabase = await createClient();

  // Find neighborhood by constructing possible IDs
  const possibleIds = [
    `${city}-${neighborhood}`,
    `${city.slice(0, 3)}-${neighborhood}`,
    neighborhood,
  ];

  const { data } = await supabase
    .from('neighborhoods')
    .select('*')
    .or(possibleIds.map((id) => `id.eq.${id}`).join(','))
    .single();

  if (!data) {
    return { title: 'Neighborhood | Flâneur' };
  }

  return {
    title: `${data.name}, ${data.city} | Flâneur`,
    description: `Local stories from ${data.name} in ${data.city}.`,
  };
}

export default async function NeighborhoodPage({ params }: NeighborhoodPageProps) {
  const { city, neighborhood } = await params;
  const supabase = await createClient();

  // Map city slug to neighborhood prefix
  const neighborhoodId = buildNeighborhoodId(city, neighborhood);

  // Fetch neighborhood details
  const { data: neighborhoodData } = await supabase
    .from('neighborhoods')
    .select('*')
    .eq('id', neighborhoodId)
    .single();

  if (!neighborhoodData) {
    notFound();
  }

  // Fetch initial articles for this neighborhood (limited for fast load)
  const { data: articles } = await supabase
    .from('articles')
    .select('*, neighborhood:neighborhoods(id, name, city)')
    .eq('neighborhood_id', neighborhoodId)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(INITIAL_PAGE_SIZE);

  // Check if there are more articles
  const { count: totalCount } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('neighborhood_id', neighborhoodId)
    .eq('status', 'published');

  const hasMoreArticles = (totalCount || 0) > INITIAL_PAGE_SIZE;

  // Fetch ads (global or for this neighborhood)
  const { data: ads } = await supabase
    .from('ads')
    .select('*')
    .or(`is_global.eq.true,neighborhood_id.eq.${neighborhoodId}`);

  // Inject ads into feed
  const feedItems = injectAds(
    (articles || []) as Article[],
    (ads || []) as Ad[],
    [neighborhoodId]
  );

  return (
    <div className="py-6 px-4">
      <div className="mx-auto max-w-2xl">
        <NeighborhoodFeed
          items={feedItems}
          city={neighborhoodData.city}
          citySlug={city}
          neighborhoodName={neighborhoodData.name}
          neighborhoodSlug={neighborhood}
          neighborhoodId={neighborhoodId}
          defaultView="compact"
        />

        {hasMoreArticles && (
          <LoadMoreButton
            neighborhoodId={neighborhoodId}
            initialOffset={INITIAL_PAGE_SIZE}
            pageSize={INITIAL_PAGE_SIZE}
          />
        )}
      </div>
    </div>
  );
}
