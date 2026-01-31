/**
 * Batch script to seed ALL neighborhoods with Google Places data
 *
 * Usage: npx tsx scripts/seed-all-neighborhoods.ts
 *
 * This will:
 * 1. Query all neighborhoods that have coordinates but aren't seeded yet
 * 2. Seed each one with Google Places data
 * 3. Mark them as active
 *
 * Estimated time: 3-4 hours for 60 neighborhoods (rate limited)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables FIRST
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  if (!googleApiKey) {
    console.error('Missing GOOGLE_PLACES_API_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get all neighborhoods that have coordinates
  const { data: allNeighborhoods, error: fetchError } = await supabase
    .from('neighborhoods')
    .select('id, name, city, latitude, longitude, radius, seeded_at, is_active')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('city');

  if (fetchError || !allNeighborhoods) {
    console.error('Failed to fetch neighborhoods:', fetchError?.message);
    process.exit(1);
  }

  // Filter to unseeded neighborhoods (or optionally reseed all)
  const reseedAll = process.argv.includes('--reseed');
  const neighborhoods = reseedAll
    ? allNeighborhoods
    : allNeighborhoods.filter(n => !n.seeded_at);

  console.log('='.repeat(60));
  console.log('FLANEUR NEIGHBORHOOD BATCH SEEDER');
  console.log('='.repeat(60));
  console.log(`Total neighborhoods with coordinates: ${allNeighborhoods.length}`);
  console.log(`Already seeded: ${allNeighborhoods.filter(n => n.seeded_at).length}`);
  console.log(`To seed now: ${neighborhoods.length}`);
  console.log(`Mode: ${reseedAll ? 'RESEED ALL' : 'NEW ONLY'}`);
  console.log('='.repeat(60));

  if (neighborhoods.length === 0) {
    console.log('\nAll neighborhoods are already seeded!');
    console.log('Use --reseed flag to reseed all neighborhoods.');
    process.exit(0);
  }

  // Get category IDs
  const { data: categories } = await supabase
    .from('guide_categories')
    .select('id, slug, name');

  const categoryMap = new Map(categories?.map((c: any) => [c.slug, c.id]) || []);

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  const results: { id: string; name: string; added: number; status: string }[] = [];

  for (let i = 0; i < neighborhoods.length; i++) {
    const neighborhood = neighborhoods[i];
    const progress = `[${i + 1}/${neighborhoods.length}]`;

    console.log(`\n${progress} Seeding ${neighborhood.name}, ${neighborhood.city}...`);

    try {
      let totalAdded = 0;
      let totalUpdated = 0;
      const syncTimestamp = new Date().toISOString();

      // Set seeded_at BEFORE inserting places
      if (!neighborhood.seeded_at) {
        const seededAtTime = new Date(Date.now() - 1000).toISOString();
        await supabase
          .from('neighborhoods')
          .update({ seeded_at: seededAtTime })
          .eq('id', neighborhood.id);
      }

      for (const categorySlug of CATEGORIES) {
        const categoryId = categoryMap.get(categorySlug);
        if (!categoryId) continue;

        try {
          const coords = {
            lat: parseFloat(neighborhood.latitude),
            lng: parseFloat(neighborhood.longitude),
            radius: neighborhood.radius || 1000,
          };

          const places = await searchPlaces(neighborhood.id, categorySlug, coords);

          let added = 0;
          let updated = 0;

          for (const place of places) {
            const details = places.indexOf(place) < 10
              ? await getPlaceDetails(place.id)
              : null;

            const photoReference = place.photos?.[0]?.name || null;
            const photoUrl = photoReference ? getPhotoUrl(photoReference, 400) : null;

            const listingData = {
              neighborhood_id: neighborhood.id,
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
              updated_at: new Date().toISOString(),
            };

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

          totalAdded += added;
          totalUpdated += updated;

          // Rate limiting between categories
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`    Error in ${categorySlug}:`, error);
        }
      }

      // Mark neighborhood as active
      await supabase
        .from('neighborhoods')
        .update({
          is_active: true,
          is_coming_soon: false,
        })
        .eq('id', neighborhood.id);

      console.log(`  ✓ Added ${totalAdded} places, updated ${totalUpdated}`);
      results.push({ id: neighborhood.id, name: neighborhood.name, added: totalAdded, status: 'success' });
      successCount++;

      // Rate limiting between neighborhoods (2 seconds)
      if (i < neighborhoods.length - 1) {
        console.log('  Waiting 2 seconds before next neighborhood...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error(`  ✗ Failed:`, error);
      results.push({ id: neighborhood.id, name: neighborhood.name, added: 0, status: 'failed' });
      failCount++;
    }
  }

  // Summary
  const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);
  console.log('\n' + '='.repeat(60));
  console.log('SEEDING COMPLETE');
  console.log('='.repeat(60));
  console.log(`Time elapsed: ${elapsed} minutes`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total places added: ${results.reduce((sum, r) => sum + r.added, 0)}`);
  console.log('='.repeat(60));

  // List results
  console.log('\nResults by neighborhood:');
  for (const r of results) {
    const icon = r.status === 'success' ? '✓' : '✗';
    console.log(`  ${icon} ${r.name}: ${r.added} places`);
  }

  console.log('\nDone!');
}

main().catch(console.error);
