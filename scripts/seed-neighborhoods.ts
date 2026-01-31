/**
 * Script to seed neighborhoods with Google Places data
 *
 * Usage: npx tsx scripts/seed-neighborhoods.ts nyc-tribeca la-beverly-hills
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables FIRST before any other imports
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Now do dynamic imports after env is loaded
async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const googlePlaces = await import('../src/lib/google-places');
  const {
    searchPlaces,
    getPlaceDetails,
    formatPriceRange,
    generateTags,
    generateDescription,
    getPhotoUrl,
  } = googlePlaces;

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

  async function seedNeighborhood(neighborhoodId: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }

    if (!googleApiKey) {
      console.error('Missing GOOGLE_PLACES_API_KEY');
      console.error('Current value:', process.env.GOOGLE_PLACES_API_KEY);
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get neighborhood
    const { data: neighborhood, error: hoodError } = await supabase
      .from('neighborhoods')
      .select('*')
      .eq('id', neighborhoodId)
      .single();

    if (hoodError || !neighborhood) {
      console.error(`Neighborhood not found: ${neighborhoodId}`);
      return { success: false, error: 'Neighborhood not found' };
    }

    if (!neighborhood.latitude || !neighborhood.longitude) {
      console.error(`Neighborhood missing coordinates: ${neighborhoodId}`);
      return { success: false, error: 'Missing coordinates' };
    }

    console.log(`\nSeeding ${neighborhood.name} (${neighborhoodId})...`);
    console.log(`Location: ${neighborhood.latitude}, ${neighborhood.longitude}`);

    // Get category IDs
    const { data: categories } = await supabase
      .from('guide_categories')
      .select('id, slug, name');

    const categoryMap = new Map(categories?.map((c: any) => [c.slug, c.id]) || []);

    let totalAdded = 0;
    let totalUpdated = 0;
    const syncTimestamp = new Date().toISOString();

    for (const categorySlug of CATEGORIES) {
      const categoryId = categoryMap.get(categorySlug);
      if (!categoryId) {
        console.log(`  Skipping ${categorySlug} (category not found)`);
        continue;
      }

      try {
        console.log(`  Fetching ${categorySlug}...`);
        // Pass coordinates from database to searchPlaces
        const coords = {
          lat: parseFloat(neighborhood.latitude),
          lng: parseFloat(neighborhood.longitude),
          radius: neighborhood.radius || 1000,
        };
        const places = await searchPlaces(neighborhoodId, categorySlug, coords);
        console.log(`    Found ${places.length} places`);

        let added = 0;
        let updated = 0;

        for (const place of places) {
          // Get detailed info for top places only
          const details = places.indexOf(place) < 10
            ? await getPlaceDetails(place.id)
            : null;

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

          // Check if exists
          const { data: existing } = await supabase
            .from('guide_listings')
            .select('id')
            .eq('google_place_id', place.id)
            .single();

          if (existing) {
            await supabase
              .from('guide_listings')
              .update({ ...listingData, last_seen_at: syncTimestamp })
              .eq('id', existing.id);
            updated++;
          } else {
            await supabase
              .from('guide_listings')
              .insert({
                ...listingData,
                discovered_at: syncTimestamp,
                last_seen_at: syncTimestamp,
              });
            added++;
          }
        }

        console.log(`    Added: ${added}, Updated: ${updated}`);
        totalAdded += added;
        totalUpdated += updated;

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`  Error in ${categorySlug}:`, error);
      }
    }

    // Mark neighborhood as active
    const updateData: Record<string, any> = {
      is_active: true,
      is_coming_soon: false,
    };

    if (!neighborhood.seeded_at) {
      updateData.seeded_at = syncTimestamp;
    }

    await supabase
      .from('neighborhoods')
      .update(updateData)
      .eq('id', neighborhoodId);

    console.log(`\n✓ ${neighborhoodId}: ${totalAdded} added, ${totalUpdated} updated`);
    return { success: true, added: totalAdded, updated: totalUpdated };
  }

  // Run seeding
  const neighborhoodIds = process.argv.slice(2);

  if (neighborhoodIds.length === 0) {
    console.log('Usage: npx tsx scripts/seed-neighborhoods.ts <neighborhood-id> [neighborhood-id...]');
    console.log('Example: npx tsx scripts/seed-neighborhoods.ts nyc-tribeca la-beverly-hills');
    process.exit(1);
  }

  console.log(`Seeding ${neighborhoodIds.length} neighborhood(s)...`);
  console.log(`Google API Key configured: ${process.env.GOOGLE_PLACES_API_KEY ? 'Yes' : 'No'}`);

  for (const id of neighborhoodIds) {
    await seedNeighborhood(id);
  }

  console.log('\nDone!');
}

main().catch(console.error);
