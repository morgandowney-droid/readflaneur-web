import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NeighborhoodFeed } from '@/components/feed/NeighborhoodFeed';
import { NeighborhoodBrief } from '@/components/feed/NeighborhoodBrief';
import { LookAheadCard } from '@/components/feed/LookAheadCard';
import { LoadMoreButton } from '@/components/feed/LoadMoreButton';
import { injectAds } from '@/lib/ad-engine';
import { Article, Ad } from '@/types';
import { buildNeighborhoodId } from '@/lib/neighborhood-utils';
import { getNeighborhoodIdsForQuery, getComboInfo, getComboForComponent } from '@/lib/combo-utils';
import { fetchCurrentWeather } from '@/lib/weather';

const INITIAL_PAGE_SIZE = 10;

interface NeighborhoodPageProps {
  params: Promise<{
    city: string;
    neighborhood: string;
  }>;
  searchParams: Promise<{
    category?: string;
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

export default async function NeighborhoodPage({ params, searchParams }: NeighborhoodPageProps) {
  const { city, neighborhood } = await params;
  const { category } = await searchParams;
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

  // Get combo info and query IDs for combo neighborhoods
  const comboInfo = await getComboInfo(supabase, neighborhoodId);
  const queryIds = await getNeighborhoodIdsForQuery(supabase, neighborhoodId);

  // Build articles query with optional category filter
  // For combo neighborhoods, query all component neighborhood IDs
  let articlesQuery = supabase
    .from('articles')
    .select('*, neighborhood:neighborhoods(id, name, city, timezone)')
    .in('neighborhood_id', queryIds)
    .eq('status', 'published');

  // Apply category filter if provided
  // Category slug format: 'weekly-civic-recap' matches category_label like 'Weekly Civic Recap'
  if (category) {
    // Use ilike with pattern matching to find the category
    const categoryPattern = category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    articlesQuery = articlesQuery.ilike('category_label', `%${categoryPattern}%`);
  }

  // Fetch initial articles for this neighborhood (limited for fast load)
  const { data: articles } = await articlesQuery
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(INITIAL_PAGE_SIZE);

  // Check if there are more articles (with same filter)
  // For combo neighborhoods, count across all component IDs
  let countQuery = supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .in('neighborhood_id', queryIds)
    .eq('status', 'published');

  if (category) {
    const categoryPattern = category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    countQuery = countQuery.ilike('category_label', `%${categoryPattern}%`);
  }

  const { count: totalCount } = await countQuery;

  const hasMoreArticles = (totalCount || 0) > INITIAL_PAGE_SIZE;

  // Fetch ads (global or for this neighborhood or component neighborhoods)
  const adsFilter = queryIds.map(id => `neighborhood_id.eq.${id}`).join(',');
  const { data: ads } = await supabase
    .from('ads')
    .select('*')
    .or(`is_global.eq.true,${adsFilter}`);

  // Fetch the latest neighborhood brief (if not expired)
  const now = new Date().toISOString();
  let { data: brief } = await supabase
    .from('neighborhood_briefs')
    .select('id, headline, content, generated_at, sources, enriched_content, enriched_categories, enriched_at')
    .eq('neighborhood_id', neighborhoodId)
    .gt('expires_at', now)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();

  // If no brief and this is a component neighborhood, try the parent combo's brief
  let comboBriefAttribution: string | null = null;
  if (!brief && !neighborhoodData.is_combo) {
    const parentCombo = await getComboForComponent(supabase, neighborhoodId);
    if (parentCombo) {
      const { data: comboBrief } = await supabase
        .from('neighborhood_briefs')
        .select('id, headline, content, generated_at, sources, enriched_content, enriched_categories, enriched_at')
        .eq('neighborhood_id', parentCombo.comboId)
        .gt('expires_at', now)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();
      if (comboBrief) {
        brief = comboBrief;
        comboBriefAttribution = parentCombo.comboName;
      }
    }
  }

  // Fetch weather server-side for instant render
  const initialWeather = neighborhoodData.latitude && neighborhoodData.longitude && neighborhoodData.timezone
    ? await fetchCurrentWeather(neighborhoodData.latitude, neighborhoodData.longitude, neighborhoodData.timezone)
    : null;

  // Inject ads into feed
  const feedItems = injectAds(
    (articles || []) as Article[],
    (ads || []) as Ad[],
    queryIds
  );

  // Convert category slug back to display name
  const categoryDisplayName = category
    ? category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;

  return (
    <div className="py-6 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Category filter banner */}
        {category && categoryDisplayName && (
          <div className="mb-6 p-4 bg-elevated rounded-lg flex items-center justify-between">
            <div>
              <p className="text-xs text-fg-subtle uppercase tracking-wider mb-1">Filtered by category</p>
              <p className="font-medium text-fg">{categoryDisplayName}</p>
            </div>
            <a
              href={`/${city}/${neighborhood}`}
              className="text-sm text-fg-subtle hover:text-fg underline"
            >
              Clear filter
            </a>
          </div>
        )}

        <NeighborhoodFeed
          items={feedItems}
          city={neighborhoodData.city}
          citySlug={city}
          neighborhoodName={neighborhoodData.name}
          neighborhoodSlug={neighborhood}
          neighborhoodId={neighborhoodId}
          defaultView="compact"
          comboInfo={comboInfo}
          timezone={neighborhoodData.timezone}
          country={neighborhoodData.country}
          latitude={neighborhoodData.latitude}
          longitude={neighborhoodData.longitude}
          initialWeather={initialWeather || undefined}
          dailyBrief={!category && brief ? (
            <>
              {comboBriefAttribution && (
                <p className="text-[10px] text-amber-600 italic mb-1">
                  From {comboBriefAttribution} daily brief
                </p>
              )}
              <NeighborhoodBrief
                briefId={brief.id}
                headline={brief.headline}
                content={brief.content}
                generatedAt={brief.generated_at}
                neighborhoodName={neighborhoodData.name}
                neighborhoodId={neighborhoodData.id}
                city={neighborhoodData.city}
                sources={brief.sources || []}
                enrichedContent={brief.enriched_content || undefined}
                enrichedCategories={brief.enriched_categories || undefined}
                enrichedAt={brief.enriched_at || undefined}
                shareUrl={`/${city}/${neighborhood}`}
              />
              <LookAheadCard
                neighborhoodId={neighborhoodData.id}
                neighborhoodName={neighborhoodData.name}
                city={neighborhoodData.city}
              />
            </>
          ) : undefined}
        />

        {hasMoreArticles && (
          <LoadMoreButton
            neighborhoodId={neighborhoodId}
            queryIds={queryIds}
            initialOffset={INITIAL_PAGE_SIZE}
            pageSize={INITIAL_PAGE_SIZE}
            categoryFilter={category}
          />
        )}
      </div>
    </div>
  );
}
