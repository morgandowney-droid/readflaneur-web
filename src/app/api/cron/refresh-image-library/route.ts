import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateNeighborhoodLibrary } from '@/lib/image-library-generator';
import { sendEmail } from '@/lib/email';

/**
 * Image Library Refresh — Unsplash Photos
 *
 * Searches Unsplash for real neighborhood photos across all active
 * neighborhoods. ~2s per neighborhood, can process all ~272 in a single
 * run (~55s). No more Imagen rate limit bottleneck.
 *
 * Schedule: Daily at 6am UTC (or manual trigger)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.UNSPLASH_ACCESS_KEY) {
    return NextResponse.json({ error: 'UNSPLASH_ACCESS_KEY not configured' }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const functionStart = Date.now();
  const startedAt = new Date().toISOString();
  const now = new Date();
  const currentSeason = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  const results = {
    processed: 0,
    photos_found: 0,
    remaining: 0,
    errors: [] as string[],
  };

  try {
    // Find neighborhoods that need refresh
    const { data: neighborhoods, error: fetchError } = await supabase
      .from('neighborhoods')
      .select('id, name, city, country, broader_area')
      .eq('is_active', true)
      .order('id');

    if (fetchError || !neighborhoods) {
      throw new Error(`Failed to fetch neighborhoods: ${fetchError?.message}`);
    }

    // Get current library status
    const { data: statuses } = await supabase
      .from('image_library_status')
      .select('neighborhood_id, generation_season, unsplash_photos, unsplash_alternates');

    const statusMap = new Map(
      (statuses || []).map(s => [s.neighborhood_id, s])
    );

    // Filter to neighborhoods needing refresh:
    // - No Unsplash photos at all
    // - Missing alternates (feature added mid-quarter, needs backfill)
    // - Different season (quarterly variety refresh)
    const needsRefresh = neighborhoods.filter(n => {
      const status = statusMap.get(n.id);
      if (!status?.unsplash_photos) return true;
      const alts = status.unsplash_alternates;
      if (!alts || (Array.isArray(alts) && alts.length === 0)) return true;
      return status.generation_season !== currentSeason;
    });

    results.remaining = needsRefresh.length;

    if (needsRefresh.length === 0) {
      return NextResponse.json({
        success: true,
        message: `All ${neighborhoods.length} neighborhoods are up to date for ${currentSeason}`,
        ...results,
      });
    }

    console.log(`[refresh-image-library] ${needsRefresh.length} neighborhoods need refresh for ${currentSeason}`);

    // Process all neighborhoods — fast enough for a single run
    for (const neighborhood of needsRefresh) {
      // Safety: stop if approaching 280s (leave buffer for logging)
      if (Date.now() - functionStart > 280_000) {
        results.errors.push(`Time limit approaching after ${results.processed} neighborhoods`);
        break;
      }

      const genResult = await generateNeighborhoodLibrary(supabase, neighborhood);

      results.processed++;
      results.photos_found += genResult.photos_found;
      results.remaining--;

      if (genResult.errors.length > 0) {
        results.errors.push(...genResult.errors.map(e => `${neighborhood.id}: ${e}`));
      }

      // Stop if rate limited
      if (genResult.errors.some(e => e.includes('Rate limited'))) {
        results.errors.push('Stopped: Unsplash rate limited');
        break;
      }
    }

    // Email admin on completion
    if (results.remaining === 0) {
      try {
        await sendEmail({
          to: 'morgan.downey@gmail.com',
          subject: `Image Library Refresh Complete - ${currentSeason} (Unsplash)`,
          html: `<p>Season: ${currentSeason}</p>
<p>Processed: ${results.processed}</p>
<p>Photos found: ${results.photos_found}</p>
${results.errors.length > 0 ? `<p>Errors: ${results.errors.slice(0, 10).join(', ')}</p>` : ''}`,
        });
      } catch {
        // Email notification is best-effort
      }
    }

  } catch (err) {
    results.errors.push(err instanceof Error ? err.message : String(err));
  }

  // Log to cron_executions
  await supabase
    .from('cron_executions')
    .insert({
      job_name: 'refresh-image-library',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: results.photos_found > 0 || results.errors.length === 0,
      errors: results.errors.length > 0 ? results.errors.slice(0, 10) : null,
      response_data: {
        season: currentSeason,
        processed: results.processed,
        photos_found: results.photos_found,
        remaining: results.remaining,
      },
    })
    .then(null, (e: unknown) => console.error('Failed to log cron execution:', e));

  return NextResponse.json({
    success: results.photos_found > 0 || results.errors.length === 0,
    season: currentSeason,
    ...results,
    duration_seconds: parseFloat(((Date.now() - functionStart) / 1000).toFixed(1)),
  });
}
