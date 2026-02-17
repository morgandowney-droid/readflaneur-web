import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateNeighborhoodLibrary } from '@/lib/image-library-generator';
import { sendEmail } from '@/lib/email';

/**
 * Image Library Generator / Quarterly Refresh
 *
 * Generates or refreshes the pre-generated image library for all active
 * neighborhoods. Processes in batches within time budget, respecting
 * Imagen 4's 70 RPD daily quota limit.
 *
 * During initial generation: runs every 4 hours, ~3 neighborhoods per run,
 * ~9 neighborhoods/day. Once all neighborhoods are complete for the current
 * season, runs are instant no-ops.
 *
 * Schedule: Every 4 hours
 * Cron: 0 every-4h * * *
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIME_BUDGET_MS = 270_000; // 270s budget

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

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
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
    images_generated: 0,
    remaining: 0,
    errors: [] as string[],
  };

  try {
    // Find neighborhoods that need seasonal refresh
    // Either: no library at all, or library from a previous season
    const { data: neighborhoods, error: fetchError } = await supabase
      .from('neighborhoods')
      .select('id, name, city, country')
      .eq('is_active', true)
      .order('id');

    if (fetchError || !neighborhoods) {
      throw new Error(`Failed to fetch neighborhoods: ${fetchError?.message}`);
    }

    // Get current library status
    const { data: statuses } = await supabase
      .from('image_library_status')
      .select('neighborhood_id, generation_season, images_generated');

    const statusMap = new Map(
      (statuses || []).map(s => [s.neighborhood_id, s])
    );

    // Filter to neighborhoods needing refresh
    const needsRefresh = neighborhoods.filter(n => {
      const status = statusMap.get(n.id);
      if (!status) return true; // No library at all
      if (status.images_generated < 8) return true; // Incomplete
      return status.generation_season !== currentSeason; // Different season
    });

    results.remaining = needsRefresh.length;

    if (needsRefresh.length === 0) {
      // All neighborhoods are up to date for this season
      return NextResponse.json({
        success: true,
        message: `All ${neighborhoods.length} neighborhoods are up to date for ${currentSeason}`,
        ...results,
      });
    }

    console.log(`[refresh-image-library] ${needsRefresh.length} neighborhoods need refresh for ${currentSeason}`);

    // Process sequentially within time budget
    for (const neighborhood of needsRefresh) {
      if (Date.now() - functionStart > TIME_BUDGET_MS) {
        results.errors.push(`Time budget exhausted after ${results.processed} neighborhoods`);
        break;
      }

      console.log(`[refresh-image-library] Refreshing ${neighborhood.name}, ${neighborhood.city}...`);

      const genResult = await generateNeighborhoodLibrary(
        supabase,
        neighborhood,
        { useFastModel: false }, // Use standard model for quality
      );

      results.processed++;
      results.images_generated += genResult.images_generated;
      results.remaining--;

      if (genResult.errors.length > 0) {
        results.errors.push(...genResult.errors.map(e => `${neighborhood.id}: ${e}`));
      }

      // Stop if rate limited or quota exhausted
      if (genResult.errors.some(e => e.includes('Rate limited') || e.includes('Quota exhausted'))) {
        results.errors.push('Stopped: rate limited or daily quota exhausted');
        break;
      }
    }

    // Email admin on completion or significant progress
    if (results.remaining === 0 || results.processed > 10) {
      try {
        const subject = results.remaining === 0
          ? `Image Library Refresh Complete - ${currentSeason}`
          : `Image Library Refresh Progress - ${results.processed} done, ${results.remaining} remaining`;

        await sendEmail({
          to: 'morgan.downey@gmail.com',
          subject,
          html: `<p>Season: ${currentSeason}</p>
<p>Processed: ${results.processed}</p>
<p>Images generated: ${results.images_generated}</p>
<p>Remaining: ${results.remaining}</p>
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
      success: results.images_generated > 0 || results.errors.length === 0,
      errors: results.errors.length > 0 ? results.errors.slice(0, 10) : null,
      response_data: {
        season: currentSeason,
        processed: results.processed,
        images_generated: results.images_generated,
        remaining: results.remaining,
      },
    })
    .then(null, (e: unknown) => console.error('Failed to log cron execution:', e));

  return NextResponse.json({
    success: results.images_generated > 0 || results.errors.length === 0,
    season: currentSeason,
    ...results,
    duration_seconds: parseFloat(((Date.now() - functionStart) / 1000).toFixed(1)),
  });
}
