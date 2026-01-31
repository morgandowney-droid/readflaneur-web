import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  searchPlaces,
  getPlaceDetails,
  formatPriceRange,
  generateTags,
  generateDescription,
  getPhotoUrl,
} from '@/lib/google-places';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

const CATEGORIES = [
  'restaurants',
  'coffee-cafes',
  'bars-nightlife',
  'shopping',
  'services',
  'parks-recreation',
  'arts-culture',
  'family-kids',
];

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { neighborhoodId } = body;

    if (!neighborhoodId) {
      return NextResponse.json({ error: 'neighborhoodId required' }, { status: 400 });
    }

    // Get neighborhood from database (need coordinates)
    const { data: neighborhood, error: hoodError } = await supabase
      .from('neighborhoods')
      .select('*')
      .eq('id', neighborhoodId)
      .single();

    if (hoodError || !neighborhood) {
      return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
    }

    if (!neighborhood.latitude || !neighborhood.longitude) {
      return NextResponse.json(
        { error: 'Neighborhood missing coordinates. Please set latitude/longitude first.' },
        { status: 400 }
      );
    }

    if (!process.env.GOOGLE_PLACES_API_KEY) {
      return NextResponse.json(
        { error: 'GOOGLE_PLACES_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Use service role for database writes
    const adminSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    // Get category IDs from database
    const { data: categories } = await adminSupabase
      .from('guide_categories')
      .select('id, slug, name');

    const categoryMap = new Map(categories?.map(c => [c.slug, c.id]) || []);

    const results: { category: string; added: number; updated: number }[] = [];
    let totalAdded = 0;
    let totalUpdated = 0;
    const syncTimestamp = new Date().toISOString();

    // Process each category
    for (const categorySlug of CATEGORIES) {
      const categoryId = categoryMap.get(categorySlug);
      if (!categoryId) continue;

      try {
        // Fetch places from Google
        const places = await searchPlaces(neighborhoodId, categorySlug);

        let added = 0;
        let updated = 0;

        for (const place of places) {
          // Get detailed info for top places
          const details = places.indexOf(place) < 10
            ? await getPlaceDetails(place.id)
            : null;

          // Get photo URL if available
          const photoReference = place.photos?.[0]?.name || null;
          const photoUrl = photoReference ? getPhotoUrl(photoReference, 400) : null;

          const listingData = {
            neighborhood_id: neighborhoodId,
            category_id: categoryId,
            name: place.displayName?.text || 'Unknown',
            address: place.shortFormattedAddress || place.formattedAddress || null,
            description: generateDescription(place, details),
            website_url: details?.websiteUri || place.websiteUri || null,
            phone: details?.nationalPhoneNumber || place.nationalPhoneNumber || null,
            price_range: formatPriceRange(place.priceLevel),
            tags: generateTags(place),
            is_featured: (place.rating || 0) >= 4.5 && (place.userRatingCount || 0) >= 100,
            is_active: true,
            google_place_id: place.id,
            google_rating: place.rating || null,
            google_reviews_count: place.userRatingCount || null,
            google_photo_url: photoUrl,
            google_photo_reference: photoReference,
            latitude: place.location?.latitude || null,
            longitude: place.location?.longitude || null,
            updated_at: new Date().toISOString(),
          };

          // Upsert: update if exists (by google_place_id), insert if new
          const { data: existing } = await adminSupabase
            .from('guide_listings')
            .select('id')
            .eq('google_place_id', place.id)
            .single();

          if (existing) {
            // Update existing place
            await adminSupabase
              .from('guide_listings')
              .update({
                ...listingData,
                last_seen_at: syncTimestamp,
              })
              .eq('id', existing.id);
            updated++;
          } else {
            // Insert new place
            await adminSupabase
              .from('guide_listings')
              .insert({
                ...listingData,
                discovered_at: syncTimestamp,
                last_seen_at: syncTimestamp,
              });
            added++;
          }
        }

        results.push({ category: categorySlug, added, updated });
        totalAdded += added;
        totalUpdated += updated;

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error syncing ${neighborhoodId}/${categorySlug}:`, error);
        results.push({ category: categorySlug, added: 0, updated: 0 });
      }
    }

    // Mark neighborhood as active after successful seeding
    // Only set seeded_at if this is the first time seeding (seeded_at is null)
    const updateData: Record<string, any> = {
      is_active: true,
      is_coming_soon: false,
    };

    // Check if this is the first seed
    if (!neighborhood.seeded_at) {
      updateData.seeded_at = syncTimestamp;
    }

    await adminSupabase
      .from('neighborhoods')
      .update(updateData)
      .eq('id', neighborhoodId);

    return NextResponse.json({
      success: true,
      message: `Seeded ${neighborhoodId}: ${totalAdded} added, ${totalUpdated} updated`,
      neighborhoodId,
      results,
      totalAdded,
      totalUpdated,
      timestamp: syncTimestamp,
    });
  } catch (err) {
    console.error('Admin seed-neighborhood API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
