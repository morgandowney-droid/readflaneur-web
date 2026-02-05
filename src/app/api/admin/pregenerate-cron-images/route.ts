/**
 * Pre-generate Cron Images Admin API
 *
 * Generates and caches all category images for recurring cron stories.
 * Run this once after deployment to populate the image cache, saving
 * Gemini token costs on subsequent cron runs.
 *
 * Usage:
 * - GET /api/admin/pregenerate-cron-images - List current cached images
 * - POST /api/admin/pregenerate-cron-images - Generate all missing images
 * - POST /api/admin/pregenerate-cron-images?force=true - Regenerate all images
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  pregenerateAllCronImages,
  listCachedCronImages,
  CRON_IMAGE_CATEGORIES,
  CronImageCategory,
} from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for all generations

export async function GET(request: Request) {
  // Verify admin authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const cachedImages = await listCachedCronImages(supabase);

    const categories = Object.keys(CRON_IMAGE_CATEGORIES) as CronImageCategory[];
    const cached = categories.filter((c) => cachedImages[c] !== null);
    const missing = categories.filter((c) => cachedImages[c] === null);

    return NextResponse.json({
      total_categories: categories.length,
      cached_count: cached.length,
      missing_count: missing.length,
      cached_categories: cached,
      missing_categories: missing,
      images: cachedImages,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Verify admin authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceRegenerate = url.searchParams.get('force') === 'true';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    console.log(
      `Pre-generating cron images (force=${forceRegenerate})...`
    );

    const results = await pregenerateAllCronImages(supabase);

    const categories = Object.keys(results) as CronImageCategory[];
    const successful = categories.filter((c) => results[c].success);
    const failed = categories.filter((c) => !results[c].success);

    return NextResponse.json({
      success: failed.length === 0,
      total_categories: categories.length,
      successful_count: successful.length,
      failed_count: failed.length,
      successful_categories: successful,
      failed_categories: failed,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
