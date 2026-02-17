#!/usr/bin/env node
/**
 * Image Library Status Dashboard
 *
 * Shows which neighborhoods need images, prioritized by subscriber count.
 *
 * Usage:
 *   node scripts/image-library-status.mjs              # Full status
 *   node scripts/image-library-status.mjs --missing     # Only missing neighborhoods
 *   node scripts/image-library-status.mjs --search xyz  # Search by name/city
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const args = process.argv.slice(2);
  const missingOnly = args.includes('--missing');
  const searchIdx = args.indexOf('--search');
  const searchTerm = searchIdx >= 0 ? args[searchIdx + 1]?.toLowerCase() : null;

  // 1. Get all active neighborhoods
  const { data: neighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, name, city, country, is_combo')
    .eq('is_active', true)
    .order('name');

  // 2. Get image library status
  const { data: statuses } = await supabase
    .from('image_library_status')
    .select('neighborhood_id, images_generated, last_generated_at');

  const statusMap = new Map(
    (statuses || []).map(s => [s.neighborhood_id, s])
  );

  // 3. Get subscriber counts per neighborhood (active subscribers)
  const { data: subscriberPrefs } = await supabase
    .from('user_neighborhood_preferences')
    .select('neighborhood_id');

  const { data: newsletterSubs } = await supabase
    .from('newsletter_subscribers')
    .select('neighborhood_ids');

  // Count subscribers per neighborhood
  const subCounts = new Map();
  for (const pref of (subscriberPrefs || [])) {
    subCounts.set(pref.neighborhood_id, (subCounts.get(pref.neighborhood_id) || 0) + 1);
  }
  for (const sub of (newsletterSubs || [])) {
    if (sub.neighborhood_ids) {
      for (const id of sub.neighborhood_ids) {
        subCounts.set(id, (subCounts.get(id) || 0) + 1);
      }
    }
  }

  // 4. Build display list
  let list = neighborhoods
    .filter(n => !n.is_combo) // Skip combo neighborhoods (use component images)
    .map(n => {
      const status = statusMap.get(n.id);
      const images = status?.images_generated || 0;
      const subscribers = subCounts.get(n.id) || 0;
      return {
        id: n.id,
        name: n.name,
        city: n.city,
        country: n.country || '',
        images,
        complete: images >= 8,
        subscribers,
        lastGenerated: status?.last_generated_at
          ? new Date(status.last_generated_at).toLocaleDateString()
          : null,
      };
    });

  // Apply filters
  if (missingOnly) {
    list = list.filter(n => !n.complete);
  }
  if (searchTerm) {
    list = list.filter(n =>
      n.name.toLowerCase().includes(searchTerm) ||
      n.city.toLowerCase().includes(searchTerm) ||
      n.id.toLowerCase().includes(searchTerm) ||
      n.country.toLowerCase().includes(searchTerm)
    );
  }

  // Sort: subscribers desc, then name asc
  list.sort((a, b) => b.subscribers - a.subscribers || a.name.localeCompare(b.name));

  // 5. Summary stats
  const total = neighborhoods.filter(n => !n.is_combo).length;
  const complete = list.filter(n => n.complete).length;
  const missing = list.filter(n => !n.complete).length;
  const withSubs = list.filter(n => n.subscribers > 0 && !n.complete).length;

  console.log('=== Image Library Status ===');
  console.log(`Total: ${total} | Complete: ${neighborhoods.filter(n => !n.is_combo && (statusMap.get(n.id)?.images_generated || 0) >= 8).length} | Missing: ${total - neighborhoods.filter(n => !n.is_combo && (statusMap.get(n.id)?.images_generated || 0) >= 8).length}`);
  console.log(`Missing with active subscribers: ${withSubs} (DO THESE FIRST)`);
  console.log('');

  if (list.length === 0) {
    console.log('No results found.');
    return;
  }

  // 6. Display table
  const idWidth = 32;
  const nameWidth = 24;
  const cityWidth = 18;

  console.log(
    'ID'.padEnd(idWidth) +
    'Name'.padEnd(nameWidth) +
    'City'.padEnd(cityWidth) +
    'Subs'.padStart(5) +
    '  Images' +
    '  Status'
  );
  console.log('-'.repeat(idWidth + nameWidth + cityWidth + 25));

  for (const n of list) {
    const status = n.complete ? 'DONE' : n.images > 0 ? `${n.images}/8` : '---';
    const subStr = n.subscribers > 0 ? String(n.subscribers) : '.';
    const highlight = !n.complete && n.subscribers > 0 ? ' <-- PRIORITY' : '';

    console.log(
      n.id.padEnd(idWidth) +
      n.name.substring(0, nameWidth - 1).padEnd(nameWidth) +
      n.city.substring(0, cityWidth - 1).padEnd(cityWidth) +
      subStr.padStart(5) +
      ('  ' + status).padEnd(10) +
      highlight
    );
  }

  // 7. Quick copy-paste section for priority neighborhoods
  if (!searchTerm) {
    const priority = list.filter(n => n.subscribers > 0 && !n.complete);
    if (priority.length > 0) {
      console.log('');
      console.log(`=== Priority Upload Commands (${priority.length} neighborhoods with subscribers) ===`);
      console.log('After saving images to manual-images/{id}/, run:');
      console.log('');
      for (const n of priority.slice(0, 20)) {
        console.log(`  node scripts/upload-manual-images.mjs ${n.id}`);
      }
      if (priority.length > 20) {
        console.log(`  ... and ${priority.length - 20} more`);
      }
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
