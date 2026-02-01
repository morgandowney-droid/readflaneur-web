/**
 * Script to add 4 wealthy Sydney neighborhoods
 *
 * Usage: npx tsx scripts/add-sydney-neighborhoods.ts
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

  const neighborhoods = [
    {
      id: 'sydney-double-bay',
      name: 'Double Bay',
      city: 'Sydney',
      timezone: 'Australia/Sydney',
      country: 'Australia',
      region: 'asia-pacific',
      latitude: -33.8779,
      longitude: 151.2430,
      radius: 800,
      is_coming_soon: false,
      is_active: true,
    },
    {
      id: 'sydney-mosman',
      name: 'Mosman',
      city: 'Sydney',
      timezone: 'Australia/Sydney',
      country: 'Australia',
      region: 'asia-pacific',
      latitude: -33.8290,
      longitude: 151.2440,
      radius: 1000,
      is_coming_soon: false,
      is_active: true,
    },
    {
      id: 'sydney-woollahra',
      name: 'Woollahra',
      city: 'Sydney',
      timezone: 'Australia/Sydney',
      country: 'Australia',
      region: 'asia-pacific',
      latitude: -33.8880,
      longitude: 151.2390,
      radius: 800,
      is_coming_soon: false,
      is_active: true,
    },
    {
      id: 'sydney-vaucluse',
      name: 'Vaucluse',
      city: 'Sydney',
      timezone: 'Australia/Sydney',
      country: 'Australia',
      region: 'asia-pacific',
      latitude: -33.8580,
      longitude: 151.2780,
      radius: 1000,
      is_coming_soon: false,
      is_active: true,
    },
  ];

  console.log('Adding Sydney neighborhoods...\n');

  for (const hood of neighborhoods) {
    const { error } = await supabase
      .from('neighborhoods')
      .upsert(hood, { onConflict: 'id' });

    if (error) {
      console.error(`Error adding ${hood.name}:`, error.message);
    } else {
      console.log(`✓ Added ${hood.name}`);
    }
  }

  console.log('\nDone! Now run the seeder to populate with places:');
  console.log('npx tsx scripts/seed-neighborhoods.ts sydney-double-bay sydney-mosman sydney-woollahra sydney-vaucluse');
}

main().catch(console.error);
