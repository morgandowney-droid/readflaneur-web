/**
 * Upload 8 AI-generated placeholder ad images to Supabase ad-assets bucket
 * and create active paid ad records for display in Daily Brief emails and feed.
 *
 * Usage: node scripts/upload-placeholder-ads.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SUPABASE_URL = 'https://ujpdhueytlfqkwzvqetd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Run with:');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-placeholder-ads.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// The 8 placeholder ad creatives
const ADS = [
  {
    file: 'Flaneur-golf ad.jpg',
    sponsorLabel: 'Emerald Dunes Links',
    headline: 'Where Land Meets Sea',
    body: 'Where land meets sea and legend meets the game.',
    clickUrl: 'https://readflaneur.com/advertise',
    placement: 'daily_brief',
  },
  {
    file: 'Flaneur-ski hotel ad.jpg',
    sponsorLabel: 'The Matterhorn Grand',
    headline: 'Ski into Luxury. Stay in Awe.',
    body: '5-Star Ski-In/Ski-Out Resort, Zermatt.',
    clickUrl: 'https://readflaneur.com/advertise',
    placement: 'daily_brief',
  },
  {
    file: 'Flaneur-yachts ad.jpg',
    sponsorLabel: 'Aethelred Yachts',
    headline: 'Your Private Empire on the Sea',
    body: 'Aethelred Yachts. Your private empire on the sea.',
    clickUrl: 'https://readflaneur.com/advertise',
    placement: 'daily_brief',
  },
  {
    file: 'Flaneur-private jet ad.jpg',
    sponsorLabel: 'Aether Jets',
    headline: 'Your World, Without Limits',
    body: 'Your world, without limits.',
    clickUrl: 'https://readflaneur.com/advertise',
    placement: 'daily_brief',
  },
  {
    file: 'Flaneur-electronics ad.jpg',
    sponsorLabel: 'AURA',
    headline: 'AURA Z-Fold. Unfold Your World.',
    body: 'Unfold your world.',
    clickUrl: 'https://readflaneur.com/advertise',
    placement: 'daily_brief',
  },
  {
    file: 'Flaneur-realestate ad.jpg',
    sponsorLabel: 'Important Property',
    headline: 'Rare Width on Perry Street',
    body: 'Presented by The Important Hudson Advisory.',
    clickUrl: 'https://readflaneur.com/advertise',
    placement: 'daily_brief',
  },
  {
    file: 'Flaneur-restaurant ad.jpg',
    sponsorLabel: "'St Morgan",
    headline: 'Reserve Your Table',
    body: 'Reserve your table for the weekend. The autumn menu has arrived.',
    clickUrl: 'https://readflaneur.com/advertise',
    placement: 'daily_brief',
  },
  {
    file: 'Flaneur-sunglasses ad.jpg',
    sponsorLabel: 'AURUM',
    headline: 'See the World in Gold',
    body: 'See the world in gold.',
    clickUrl: 'https://readflaneur.com/advertise',
    placement: 'sunday_edition',
  },
];

const DOWNLOADS_DIR = resolve(process.env.USERPROFILE || process.env.HOME || '', 'Downloads');

async function main() {
  console.log('Uploading 8 placeholder ad creatives...\n');

  // First, deactivate any existing placeholder ads we may have created before
  const { data: existingAds } = await supabase
    .from('ads')
    .select('id')
    .eq('customer_email', 'placeholder@readflaneur.com');

  if (existingAds && existingAds.length > 0) {
    console.log(`Found ${existingAds.length} existing placeholder ads, setting to expired...`);
    await supabase
      .from('ads')
      .update({ status: 'expired' })
      .eq('customer_email', 'placeholder@readflaneur.com');
  }

  // Set date range: today through 1 year from now
  const today = new Date().toISOString().split('T')[0];
  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const results = [];

  for (const ad of ADS) {
    const filePath = resolve(DOWNLOADS_DIR, ad.file);
    console.log(`Processing: ${ad.sponsorLabel}`);

    // Read the image file
    let fileBuffer;
    try {
      fileBuffer = readFileSync(filePath);
    } catch (err) {
      console.error(`  ERROR: Could not read ${filePath}`);
      continue;
    }

    // Generate a unique filename
    const adId = crypto.randomUUID();
    const fileName = `${adId}.jpg`;

    // Upload to ad-assets bucket
    const { error: uploadError } = await supabase.storage
      .from('ad-assets')
      .upload(fileName, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error(`  Upload error: ${uploadError.message}`);
      continue;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('ad-assets')
      .getPublicUrl(fileName);

    const imageUrl = publicUrlData.publicUrl;
    console.log(`  Uploaded: ${imageUrl}`);

    // Create ad record - global ad (no neighborhood_id), active status
    const { data: adRecord, error: insertError } = await supabase
      .from('ads')
      .insert({
        id: adId,
        sponsor_label: ad.sponsorLabel,
        headline: ad.headline,
        body: ad.body,
        click_url: ad.clickUrl,
        image_url: imageUrl,
        status: 'active',
        approval_status: 'approved',
        placement_type: ad.placement,
        is_global: true,
        is_global_takeover: false,
        start_date: today,
        end_date: oneYearFromNow,
        customer_email: 'placeholder@readflaneur.com',
        impressions: 0,
        clicks: 0,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(`  Insert error: ${insertError.message}`);
      continue;
    }

    console.log(`  Created ad: ${adRecord.id}`);
    results.push({ ...ad, id: adRecord.id, imageUrl });
  }

  console.log(`\nDone! Created ${results.length}/8 placeholder ads.`);
  console.log('\nAd IDs:');
  results.forEach(r => console.log(`  ${r.sponsorLabel}: ${r.id}`));

  // Show summary
  console.log('\nAll ads are global (show for all neighborhoods), active, and valid for 1 year.');
  console.log('7 daily_brief placements + 1 sunday_edition (AURUM sunglasses).');
  console.log('\nTo deactivate all placeholder ads:');
  console.log("  UPDATE ads SET status = 'expired' WHERE customer_email = 'placeholder@readflaneur.com';");
}

main().catch(console.error);
