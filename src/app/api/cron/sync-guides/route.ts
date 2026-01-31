import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  searchPlaces,
  getPlaceDetails,
  formatPriceRange,
  generateTags,
  generateDescription,
  getPhotoUrl,
} from '@/lib/google-places';
import { notifyAdminNewPlaces, notifyAdminClosedPlaces } from '@/lib/email';

// Vercel Cron configuration - runs daily at 3 AM UTC
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

export async function GET(request: Request) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Allow access if: correct auth header, or called from Vercel Cron, or in development
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json(
      { error: 'GOOGLE_PLACES_API_KEY not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results: { neighborhood: string; category: string; added: number; updated: number }[] = [];
  let totalAdded = 0;
  let totalUpdated = 0;

  // Track new places for email notification
  const newPlaces: {
    id: string;
    name: string;
    address: string | null;
    neighborhood_id: string;
    category_name: string;
    google_rating: number | null;
    google_reviews_count: number | null;
    latitude: number | null;
    longitude: number | null;
  }[] = [];

  // Track all place IDs seen in this sync (to detect closures)
  const seenPlaceIds = new Set<string>();
  const syncTimestamp = new Date().toISOString();

  // Get category IDs from database
  const { data: categories } = await supabase
    .from('guide_categories')
    .select('id, slug, name');

  const categoryMap = new Map(categories?.map(c => [c.slug, c.id]) || []);
  const categoryNameMap = new Map(categories?.map(c => [c.slug, c.name]) || []);

  // Fetch active neighborhoods from database
  const { data: activeNeighborhoods, error: neighborhoodError } = await supabase
    .from('neighborhoods')
    .select('id, latitude, longitude, radius')
    .eq('is_active', true);

  if (neighborhoodError) {
    return NextResponse.json({ error: neighborhoodError.message }, { status: 500 });
  }

  if (!activeNeighborhoods || activeNeighborhoods.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No active neighborhoods to sync',
      results: [],
      newPlacesCount: 0,
      closedPlacesCount: 0,
      timestamp: new Date().toISOString(),
    });
  }

  // Build set of active neighborhood IDs for closure detection
  const activeNeighborhoodIds = new Set(activeNeighborhoods.map(n => n.id));

  // Process each neighborhood
  for (const neighborhood of activeNeighborhoods) {
    const neighborhoodId = neighborhood.id;

    // Skip if missing coordinates
    if (!neighborhood.latitude || !neighborhood.longitude) {
      console.warn(`Skipping ${neighborhoodId}: missing coordinates`);
      continue;
    }

    const coordinates = {
      lat: parseFloat(neighborhood.latitude),
      lng: parseFloat(neighborhood.longitude),
      radius: neighborhood.radius || 1000,
    };

    for (const categorySlug of CATEGORIES) {
      const categoryId = categoryMap.get(categorySlug);
      if (!categoryId) continue;

      try {
        // Fetch places from Google using database coordinates
        const places = await searchPlaces(neighborhoodId, categorySlug, coordinates);

        let added = 0;
        let updated = 0;

        for (const place of places) {
          // Track that we saw this place in this sync
          seenPlaceIds.add(place.id);

          // Check if place already exists BEFORE calling getPlaceDetails (cost optimization)
          const { data: existing } = await supabase
            .from('guide_listings')
            .select('id')
            .eq('google_place_id', place.id)
            .single();

          // Get photo URL if available
          const photoReference = place.photos?.[0]?.name || null;
          const photoUrl = photoReference ? getPhotoUrl(photoReference, 400) : null;

          if (existing) {
            // EXISTING PLACE: Light update using only searchNearby data (no getPlaceDetails call)
            // This saves ~$0.025 per place, which adds up significantly
            await supabase
              .from('guide_listings')
              .update({
                // Update ratings/reviews which may have changed
                google_rating: place.rating || null,
                google_reviews_count: place.userRatingCount || null,
                // Update featured status based on current ratings
                is_featured: (place.rating || 0) >= 4.5 && (place.userRatingCount || 0) >= 100,
                // Update photo if changed
                google_photo_url: photoUrl,
                google_photo_reference: photoReference,
                // Mark as seen
                last_seen_at: syncTimestamp,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
            updated++;
          } else {
            // NEW PLACE: Get full details (only for genuinely new discoveries)
            const details = await getPlaceDetails(place.id);

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

            // Insert new place - set discovered_at and last_seen_at
            const { data: inserted } = await supabase
              .from('guide_listings')
              .insert({
                ...listingData,
                discovered_at: syncTimestamp,
                last_seen_at: syncTimestamp,
              })
              .select('id')
              .single();

            added++;

            // Track for email notification
            if (inserted) {
              newPlaces.push({
                id: inserted.id,
                name: listingData.name,
                address: listingData.address,
                neighborhood_id: neighborhoodId,
                category_name: categoryNameMap.get(categorySlug) || categorySlug,
                google_rating: listingData.google_rating,
                google_reviews_count: listingData.google_reviews_count,
                latitude: listingData.latitude,
                longitude: listingData.longitude,
              });
            }
          }
        }

        results.push({ neighborhood: neighborhoodId, category: categorySlug, added, updated });
        totalAdded += added;
        totalUpdated += updated;

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error syncing ${neighborhoodId}/${categorySlug}:`, error);
      }
    }
  }

  // Detect closed places: active listings not seen in this sync
  // Only check places that have been synced before (have last_seen_at)
  const { data: potentiallyClosed } = await supabase
    .from('guide_listings')
    .select('id, name, address, neighborhood_id, category_id, latitude, longitude, google_place_id')
    .eq('is_active', true)
    .not('google_place_id', 'is', null)
    .lt('last_seen_at', syncTimestamp);

  const closedPlaces: {
    id: string;
    name: string;
    address: string | null;
    neighborhood_id: string;
    category_name: string;
    latitude: number | null;
    longitude: number | null;
  }[] = [];

  // Mark places as closed if they weren't seen in this sync
  for (const place of potentiallyClosed || []) {
    // Only mark as closed if we synced that neighborhood in this run
    // and didn't see this place
    if (activeNeighborhoodIds.has(place.neighborhood_id) && !seenPlaceIds.has(place.google_place_id)) {
      await supabase
        .from('guide_listings')
        .update({
          is_active: false,
          closed_at: syncTimestamp,
        })
        .eq('id', place.id);

      // Find category name for email
      const category = categories?.find(c => c.id === place.category_id);
      closedPlaces.push({
        id: place.id,
        name: place.name,
        address: place.address,
        neighborhood_id: place.neighborhood_id,
        category_name: category?.name || 'Unknown',
        latitude: place.latitude,
        longitude: place.longitude,
      });
    }
  }

  // Send email notifications
  if (newPlaces.length > 0) {
    try {
      await notifyAdminNewPlaces(newPlaces);
      console.log(`Email sent for ${newPlaces.length} new places`);
    } catch (emailError) {
      console.error('Failed to send new places email:', emailError);
    }
  }

  if (closedPlaces.length > 0) {
    try {
      await notifyAdminClosedPlaces(closedPlaces);
      console.log(`Email sent for ${closedPlaces.length} closed places`);
    } catch (emailError) {
      console.error('Failed to send closed places email:', emailError);
    }
  }

  return NextResponse.json({
    success: true,
    message: `Sync complete: ${totalAdded} added, ${totalUpdated} updated, ${closedPlaces.length} closed`,
    results,
    newPlacesCount: newPlaces.length,
    closedPlacesCount: closedPlaces.length,
    timestamp: new Date().toISOString(),
  });
}
