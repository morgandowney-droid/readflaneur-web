import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const neighborhoodId = searchParams.get('neighborhoodId');
  const categorySlug = searchParams.get('category');

  if (!neighborhoodId) {
    return NextResponse.json({ error: 'neighborhoodId required' }, { status: 400 });
  }

  const supabase = await createClient();

  // Get categories with listing counts for this neighborhood
  const { data: categories, error: catError } = await supabase
    .from('guide_categories')
    .select('*')
    .order('display_order', { ascending: true });

  if (catError) {
    return NextResponse.json({ error: catError.message }, { status: 500 });
  }

  // Build listings query - get listings first
  let listingsQuery = supabase
    .from('guide_listings')
    .select('*')
    .eq('neighborhood_id', neighborhoodId)
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  // Filter by category if specified
  if (categorySlug) {
    const category = categories?.find(c => c.slug === categorySlug);
    if (category) {
      listingsQuery = listingsQuery.eq('category_id', category.id);
    }
  }

  const { data: listings, error: listingsError } = await listingsQuery;

  if (listingsError) {
    return NextResponse.json({ error: listingsError.message }, { status: 500 });
  }

  // Create a map of categories by ID for quick lookup
  const categoryMap = new Map((categories || []).map(c => [c.id, c]));

  // Transform listings - add category from map
  const transformedListings = (listings || []).map((listing: any) => ({
    ...listing,
    category: categoryMap.get(listing.category_id) || null,
  }));

  // Count listings per category
  const categoryCounts: Record<string, number> = {};
  transformedListings.forEach((listing: any) => {
    if (listing.category?.slug) {
      categoryCounts[listing.category.slug] = (categoryCounts[listing.category.slug] || 0) + 1;
    }
  });

  // Add counts to categories
  const categoriesWithCounts = (categories || []).map(cat => ({
    ...cat,
    listing_count: categoryCounts[cat.slug] || 0,
  }));

  return NextResponse.json({
    categories: categoriesWithCounts,
    listings: transformedListings,
    total: transformedListings.length,
  });
}
