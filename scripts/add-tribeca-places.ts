/**
 * Script to manually add Bubby's and Walker's to Tribeca
 *
 * Usage: npx tsx scripts/add-tribeca-places.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get restaurants category ID
  const { data: categories } = await supabase
    .from('guide_categories')
    .select('id, slug')
    .eq('slug', 'restaurants')
    .single();

  if (!categories) {
    console.error('Restaurants category not found');
    process.exit(1);
  }

  const restaurantCategoryId = categories.id;
  console.log('Restaurant category ID:', restaurantCategoryId);

  // Places to add
  const places = [
    {
      neighborhood_id: 'nyc-tribeca',
      category_id: restaurantCategoryId,
      name: "Bubby's",
      address: '120 Hudson St, New York, NY 10013',
      description: "Tribeca institution since 1990. Famous for their homemade pies, pancakes, and classic American comfort food. A neighborhood staple for brunch and family dinners.",
      website_url: 'https://bubbys.com',
      phone: '+1 212-219-0666',
      price_range: '$$',
      tags: ['brunch', 'american', 'family-friendly', 'outdoor seating', 'local favorite'],
      google_rating: 4.4,
      google_reviews_count: 2847,
      google_place_id: 'ChIJbUwxTYBZwokRhj_-q9fj-sI', // Bubby's Tribeca
      is_featured: true,
      is_active: true,
    },
    {
      neighborhood_id: 'nyc-tribeca',
      category_id: restaurantCategoryId,
      name: "Walker's",
      address: '16 N Moore St, New York, NY 10013',
      description: "Classic Tribeca tavern since 1890. Old-school charm with tin ceilings, a well-worn bar, and solid pub fare. A true neighborhood institution.",
      website_url: null,
      phone: '+1 212-941-0142',
      price_range: '$$',
      tags: ['bar', 'american', 'historic', 'casual', 'local favorite'],
      google_rating: 4.5,
      google_reviews_count: 487,
      google_place_id: 'ChIJP_BNi4FZwokRxhXbwqUmq5A', // Walker's
      is_featured: true,
      is_active: true,
    },
  ];

  console.log('\nAdding places to Tribeca...\n');

  for (const place of places) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('guide_listings')
      .select('id, name')
      .eq('neighborhood_id', 'nyc-tribeca')
      .ilike('name', place.name)
      .single();

    if (existing) {
      console.log(`✓ ${place.name} already exists, updating...`);

      const { error: updateError } = await supabase
        .from('guide_listings')
        .update({
          ...place,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error(`  Error updating ${place.name}:`, updateError.message);
      } else {
        console.log(`  Updated ${place.name}`);
      }
    } else {
      console.log(`+ Adding ${place.name}...`);

      const { error: insertError } = await supabase
        .from('guide_listings')
        .insert({
          ...place,
          discovered_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error(`  Error adding ${place.name}:`, insertError.message);
      } else {
        console.log(`  Added ${place.name}`);
      }
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
