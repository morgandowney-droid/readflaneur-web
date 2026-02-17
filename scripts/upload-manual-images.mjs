#!/usr/bin/env node
/**
 * Upload manually-generated neighborhood images to Supabase storage.
 *
 * Usage:
 *   node scripts/upload-manual-images.mjs <neighborhood-id> [folder-path]
 *
 * Convention:
 *   - Place 8 images in a folder (default: manual-images/<neighborhood-id>/)
 *   - Name the Sunday Edition image with "sunday" in the filename
 *   - The other 7 are assigned to rotation categories automatically
 *   - Gemini watermark is auto-cropped from the bottom
 *
 * Example:
 *   node scripts/upload-manual-images.mjs stockholm-ostermalm
 *   node scripts/upload-manual-images.mjs stockholm-ostermalm ~/Downloads/ostermalm-images
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { config } from 'dotenv';

// Load env
config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Image categories - sunday-edition is identified by filename, rest fill in order
const ROTATION_CATEGORIES = [
  'daily-brief-1',
  'daily-brief-2',
  'daily-brief-3',
  'look-ahead-1',
  'look-ahead-2',
  'look-ahead-3',
  'rss-story',
];

const WATERMARK_CROP_PX = 34; // Pixels to crop from bottom (Gemini watermark, scaled for 1408px source)
const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 720; // 16:9

/**
 * Process an image: crop watermark, resize to 16:9 1280x720, output as PNG
 */
async function processImage(inputPath) {
  const metadata = await sharp(inputPath).metadata();
  const { width, height } = metadata;

  // Crop bottom strip to remove Gemini watermark
  const croppedHeight = Math.max(height - WATERMARK_CROP_PX, Math.round(height * 0.9));

  return sharp(inputPath)
    .extract({ left: 0, top: 0, width, height: croppedHeight })
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: 'cover', position: 'centre' })
    .png({ quality: 90, compressionLevel: 6 })
    .toBuffer();
}

/**
 * Upload a processed image buffer to Supabase storage
 */
async function uploadImage(neighborhoodId, category, buffer) {
  const storagePath = `library/${neighborhoodId}/${category}.png`;

  const { error } = await supabase.storage
    .from('images')
    .upload(storagePath, buffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (error) {
    throw new Error(`Upload failed for ${category}: ${error.message}`);
  }

  return storagePath;
}

/**
 * Update the image_library_status table
 */
async function updateStatus(neighborhoodId, imageCount) {
  const now = new Date();
  const season = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  await supabase
    .from('image_library_status')
    .upsert({
      neighborhood_id: neighborhoodId,
      images_generated: imageCount,
      last_generated_at: now.toISOString(),
      generation_season: season,
      prompts_json: { source: 'manual-upload' },
      errors: null,
      updated_at: now.toISOString(),
    });
}

async function main() {
  const neighborhoodId = process.argv[2];
  if (!neighborhoodId) {
    console.error('Usage: node scripts/upload-manual-images.mjs <neighborhood-id> [folder-path]');
    process.exit(1);
  }

  // Determine folder path - check both exact match and numbered prefix (e.g. "01-nyc-dumbo")
  let folderPath = process.argv[3]
    ? resolve(process.argv[3])
    : resolve(`manual-images/${neighborhoodId}`);

  if (!existsSync(folderPath)) {
    // Try finding a numbered folder like "01-nyc-dumbo"
    const manualDir = resolve('manual-images');
    if (existsSync(manualDir)) {
      const match = readdirSync(manualDir).find(f => f.endsWith(`-${neighborhoodId}`) || f === neighborhoodId);
      if (match) folderPath = resolve(`manual-images/${match}`);
    }
  }

  if (!existsSync(folderPath)) {
    console.error(`Folder not found: ${folderPath}`);
    console.error(`Create it and add 8 images (name one with "sunday" for the Sunday Edition)`);
    process.exit(1);
  }

  // Find image files
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
  const allFiles = readdirSync(folderPath)
    .filter(f => imageExtensions.some(ext => f.toLowerCase().endsWith(ext)))
    .sort();

  if (allFiles.length === 0) {
    console.error(`No image files found in ${folderPath}`);
    process.exit(1);
  }

  // Identify Sunday image
  const sundayFile = allFiles.find(f => f.toLowerCase().includes('sunday'));
  const rotationFiles = allFiles.filter(f => f !== sundayFile);

  console.log(`\nNeighborhood: ${neighborhoodId}`);
  console.log(`Folder: ${folderPath}`);
  console.log(`Images found: ${allFiles.length}`);
  console.log(`Sunday image: ${sundayFile || '(none - will use last rotation image)'}`);
  console.log(`Rotation images: ${rotationFiles.length}`);
  console.log('');

  // Verify neighborhood exists
  const { data: neighborhood } = await supabase
    .from('neighborhoods')
    .select('id, name, city')
    .eq('id', neighborhoodId)
    .single();

  if (!neighborhood) {
    console.error(`Neighborhood not found: ${neighborhoodId}`);
    process.exit(1);
  }

  console.log(`Confirmed: ${neighborhood.name}, ${neighborhood.city}`);
  console.log('');

  let uploaded = 0;
  const errors = [];

  // Upload Sunday image
  if (sundayFile) {
    try {
      const inputPath = join(folderPath, sundayFile);
      console.log(`Processing sunday-edition: ${sundayFile}...`);
      const buffer = await processImage(inputPath);
      const path = await uploadImage(neighborhoodId, 'sunday-edition', buffer);
      console.log(`  Uploaded: ${path} (${(buffer.length / 1024).toFixed(0)} KB)`);
      uploaded++;
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      errors.push(`sunday-edition: ${err.message}`);
    }
  }

  // Upload rotation images
  for (let i = 0; i < rotationFiles.length && i < ROTATION_CATEGORIES.length; i++) {
    const file = rotationFiles[i];
    const category = ROTATION_CATEGORIES[i];

    try {
      const inputPath = join(folderPath, file);
      console.log(`Processing ${category}: ${file}...`);
      const buffer = await processImage(inputPath);
      const path = await uploadImage(neighborhoodId, category, buffer);
      console.log(`  Uploaded: ${path} (${(buffer.length / 1024).toFixed(0)} KB)`);
      uploaded++;
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      errors.push(`${category}: ${err.message}`);
    }
  }

  // Update status
  await updateStatus(neighborhoodId, uploaded);

  console.log('');
  console.log(`Done! ${uploaded}/${allFiles.length} images uploaded for ${neighborhood.name}`);
  if (errors.length > 0) {
    console.log(`Errors: ${errors.join(', ')}`);
  }

  // Verify with public URL
  const { data: urlData } = supabase.storage
    .from('images')
    .getPublicUrl(`library/${neighborhoodId}/daily-brief-1.png`);
  console.log(`\nVerify: ${urlData.publicUrl}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
