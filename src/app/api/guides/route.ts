import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateDistance, NEIGHBORHOOD_CENTERS } from '@/lib/google-places';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const neighborhoodId = searchParams.get('neighborhoodId');
  const categorySlug = searchParams.get('category');
  const subcategorySlug = searchParams.get('subcategory');
  const sortBy = searchParams.get('sort') || 'featured'; // 'featured', 'rating', 'reviews', 'distance'
  const userLat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : null;
  const userLng = searchParams.get('lng') ? parseFloat(searchParams.get('lng')!) : null;

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

  // Get subcategories if needed
  const { data: subcategories } = await supabase
    .from('guide_subcategories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  // Build listings query - get listings first
  let listingsQuery = supabase
    .from('guide_listings')
    .select('*')
    .eq('neighborhood_id', neighborhoodId)
    .eq('is_active', true);

  // Apply sorting based on parameter
  switch (sortBy) {
    case 'rating':
      listingsQuery = listingsQuery
        .order('google_rating', { ascending: false, nullsFirst: false })
        .order('google_reviews_count', { ascending: false, nullsFirst: false });
      break;
    case 'reviews':
      listingsQuery = listingsQuery
        .order('google_reviews_count', { ascending: false, nullsFirst: false })
        .order('google_rating', { ascending: false, nullsFirst: false });
      break;
    case 'distance':
      // Distance sorting will be done client-side after fetching
      listingsQuery = listingsQuery
        .order('name', { ascending: true });
      break;
    default: // 'featured'
      listingsQuery = listingsQuery
        .order('is_featured', { ascending: false })
        .order('google_rating', { ascending: false, nullsFirst: false })
        .order('name', { ascending: true });
  }

  // Filter by category if specified
  if (categorySlug) {
    const category = categories?.find(c => c.slug === categorySlug);
    if (category) {
      listingsQuery = listingsQuery.eq('category_id', category.id);
    }
  }

  // Filter by subcategory if specified
  if (subcategorySlug && subcategories) {
    const subcategory = subcategories.find(s => s.slug === subcategorySlug);
    if (subcategory) {
      listingsQuery = listingsQuery.eq('subcategory_id', subcategory.id);
    }
  }

  const { data: listings, error: listingsError } = await listingsQuery;

  if (listingsError) {
    return NextResponse.json({ error: listingsError.message }, { status: 500 });
  }

  // Create maps for quick lookup
  const categoryMap = new Map((categories || []).map(c => [c.id, c]));
  const subcategoryMap = new Map((subcategories || []).map(s => [s.id, s]));

  // Get neighborhood center for distance calculation fallback
  const neighborhoodCenter = NEIGHBORHOOD_CENTERS[neighborhoodId];
  const centerLat = userLat || neighborhoodCenter?.lat;
  const centerLng = userLng || neighborhoodCenter?.lng;

  // Transform listings - add category, subcategory, and distance
  let transformedListings = (listings || []).map((listing: any) => {
    // Calculate distance if we have coordinates
    let distance = null;
    if (centerLat && centerLng && listing.latitude && listing.longitude) {
      distance = calculateDistance(centerLat, centerLng, listing.latitude, listing.longitude);
    }

    return {
      ...listing,
      category: categoryMap.get(listing.category_id) || null,
      subcategory: subcategoryMap.get(listing.subcategory_id) || null,
      distance, // Distance in km
    };
  });

  // Sort by distance if requested and we have coordinates
  if (sortBy === 'distance' && centerLat && centerLng) {
    transformedListings = transformedListings.sort((a: any, b: any) => {
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });
  }

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

  // Filter subcategories to only those in the selected category (if any)
  let relevantSubcategories = subcategories || [];
  if (categorySlug) {
    const category = categories?.find(c => c.slug === categorySlug);
    if (category) {
      relevantSubcategories = (subcategories || []).filter(
        (s: any) => s.category_id === category.id
      );
    }
  }

  return NextResponse.json({
    categories: categoriesWithCounts,
    subcategories: relevantSubcategories,
    listings: transformedListings,
    total: transformedListings.length,
    userLocation: userLat && userLng ? { lat: userLat, lng: userLng } : null,
  });
}
