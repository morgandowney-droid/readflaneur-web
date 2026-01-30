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

// Vercel Cron configuration - runs daily at 3 AM UTC
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

const NEIGHBORHOODS = [
  'nyc-west-village',
  'london-notting-hill',
  'sf-pacific-heights',
  'stockholm-ostermalm',
  'sydney-paddington',
];

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

  // Get category IDs from database
  const { data: categories } = await supabase
    .from('guide_categories')
    .select('id, slug');

  const categoryMap = new Map(categories?.map(c => [c.slug, c.id]) || []);

  // Process each neighborhood
  for (const neighborhoodId of NEIGHBORHOODS) {
    for (const categorySlug of CATEGORIES) {
      const categoryId = categoryMap.get(categorySlug);
      if (!categoryId) continue;

      try {
        // Fetch places from Google
        const places = await searchPlaces(neighborhoodId, categorySlug);

        let added = 0;
        let updated = 0;

        for (const place of places) {
          // Get detailed info for top places (using place.id from new API)
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
          const { data: existing } = await supabase
            .from('guide_listings')
            .select('id')
            .eq('google_place_id', place.id)
            .single();

          if (existing) {
            await supabase
              .from('guide_listings')
              .update(listingData)
              .eq('id', existing.id);
            updated++;
          } else {
            await supabase
              .from('guide_listings')
              .insert(listingData);
            added++;
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

  return NextResponse.json({
    success: true,
    message: `Sync complete: ${totalAdded} added, ${totalUpdated} updated`,
    results,
    timestamp: new Date().toISOString(),
  });
}
