import { createClient } from '@/lib/supabase/server';
import { buildNeighborhoodId, formatNeighborhoodName } from '@/lib/neighborhood-utils';
import { getNeighborhoodIdsForQuery, getComboInfo } from '@/lib/combo-utils';
import { GuidesClient } from './GuidesClient';

interface GuidesPageProps {
  params: Promise<{
    city: string;
    neighborhood: string;
  }>;
}

export default async function GuidesPage({ params }: GuidesPageProps) {
  const { city, neighborhood } = await params;
  const neighborhoodId = buildNeighborhoodId(city, neighborhood);

  const neighborhoodName = neighborhood
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Fetch initial data server-side for instant load
  const supabase = await createClient();

  // Get combo info and query IDs (expands combo to components, or returns [id] for regular)
  const comboInfo = await getComboInfo(supabase, neighborhoodId);
  const queryIds = await getNeighborhoodIdsForQuery(supabase, neighborhoodId);

  // Get categories
  const { data: categories } = await supabase
    .from('guide_categories')
    .select('*')
    .order('display_order', { ascending: true });

  // Get subcategories
  const { data: subcategories } = await supabase
    .from('guide_subcategories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  // Get neighborhood seeded_at timestamps (for combo, use earliest)
  const { data: neighborhoodsData } = await supabase
    .from('neighborhoods')
    .select('seeded_at')
    .in('id', queryIds);

  const seededDates = (neighborhoodsData || [])
    .map(n => n.seeded_at ? new Date(n.seeded_at) : null)
    .filter((d): d is Date => d !== null);
  const seededAt = seededDates.length > 0
    ? new Date(Math.min(...seededDates.map(d => d.getTime())))
    : null;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get initial listings (restaurants, sorted by best)
  // For combo neighborhoods, query all component IDs
  const restaurantCategory = categories?.find(c => c.slug === 'restaurants');

  let listingsQuery = supabase
    .from('guide_listings')
    .select('*')
    .in('neighborhood_id', queryIds)
    .eq('is_active', true)
    .gte('google_rating', 4.0);

  if (restaurantCategory) {
    listingsQuery = listingsQuery.eq('category_id', restaurantCategory.id);
  }

  const { data: listings } = await listingsQuery;

  // Create category map
  const categoryMap = new Map((categories || []).map(c => [c.id, c]));
  const subcategoryMap = new Map((subcategories || []).map(s => [s.id, s]));

  // Transform listings with category info and popularity score
  const transformedListings = (listings || [])
    .map((listing: any) => {
      const isNew = seededAt && listing.discovered_at &&
        new Date(listing.discovered_at) > seededAt;

      return {
        ...listing,
        category: categoryMap.get(listing.category_id) || null,
        subcategory: subcategoryMap.get(listing.subcategory_id) || null,
        distance: null,
        isNew,
        isClosed: false,
        popularityScore: listing.google_rating && listing.google_reviews_count
          ? listing.google_rating * Math.log10(listing.google_reviews_count + 1)
          : 0,
      };
    })
    .sort((a: any, b: any) => b.popularityScore - a.popularityScore);

  // Count listings per category
  const categoryCounts: Record<string, number> = {};
  transformedListings.forEach((listing: any) => {
    if (listing.category?.slug) {
      categoryCounts[listing.category.slug] = (categoryCounts[listing.category.slug] || 0) + 1;
    }
  });

  const categoriesWithCounts = (categories || []).map(cat => ({
    ...cat,
    listing_count: categoryCounts[cat.slug] || 0,
  }));

  // Count new places (across all component neighborhoods for combos)
  let newCount = 0;
  if (seededAt) {
    const { count } = await supabase
      .from('guide_listings')
      .select('*', { count: 'exact', head: true })
      .in('neighborhood_id', queryIds)
      .eq('is_active', true)
      .gte('google_rating', 4.0)
      .gt('discovered_at', seededAt.toISOString());
    newCount = count || 0;
  }

  const { count: closedCount } = await supabase
    .from('guide_listings')
    .select('*', { count: 'exact', head: true })
    .in('neighborhood_id', queryIds)
    .eq('is_active', false)
    .gte('google_rating', 4.0)
    .gte('closed_at', thirtyDaysAgo.toISOString());

  const { count: michelinCount } = await supabase
    .from('guide_listings')
    .select('*', { count: 'exact', head: true })
    .in('neighborhood_id', queryIds)
    .eq('is_active', true)
    .gte('google_rating', 4.0)
    .or('michelin_stars.not.is.null,michelin_designation.not.is.null');

  return (
    <GuidesClient
      city={city}
      neighborhood={neighborhood}
      neighborhoodName={neighborhoodName}
      neighborhoodId={neighborhoodId}
      comboInfo={comboInfo}
      initialData={{
        categories: categoriesWithCounts,
        subcategories: subcategories || [],
        listings: transformedListings,
        newCount: newCount || 0,
        closedCount: closedCount || 0,
        michelinCount: michelinCount || 0,
      }}
    />
  );
}
