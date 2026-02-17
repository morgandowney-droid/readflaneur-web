import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateNeighborhoodLibrary } from '@/lib/image-library-generator';
import { checkLibraryStatus } from '@/lib/image-library';

/**
 * Admin: Generate Neighborhood Image Library
 *
 * POST - Batch generate library images for neighborhoods
 * Body: {
 *   batchSize?: number (default 5, max 10),
 *   startFrom?: string (neighborhood ID cursor for pagination),
 *   forceRegenerate?: boolean (regenerate even if complete),
 *   neighborhoodId?: string (generate for a single neighborhood),
 *   useFastModel?: boolean (use cheaper Imagen 4 Fast model)
 * }
 *
 * GET - Check library status (counts per neighborhood)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIME_BUDGET_MS = 270_000; // 270s budget

function isAdmin(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  return (
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-cron-secret') === cronSecret ||
    process.env.NODE_ENV === 'development'
  );
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const status = await checkLibraryStatus(supabase);

  return NextResponse.json({
    success: true,
    ...status,
    categories_per_neighborhood: 8,
  });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await request.json().catch(() => ({}));
  const {
    batchSize = 5,
    startFrom,
    forceRegenerate = false,
    neighborhoodId,
    useFastModel = false,
  } = body;

  const effectiveBatchSize = Math.min(Math.max(1, batchSize), 10);
  const startedAt = new Date().toISOString();
  const functionStart = Date.now();

  const results = {
    processed: 0,
    images_generated: 0,
    errors: [] as string[],
    neighborhoods: [] as Array<{ id: string; name: string; images: number; errors: string[] }>,
    next_cursor: null as string | null,
  };

  try {
    // Single neighborhood mode
    if (neighborhoodId) {
      const { data: neighborhood } = await supabase
        .from('neighborhoods')
        .select('id, name, city, country')
        .eq('id', neighborhoodId)
        .single();

      if (!neighborhood) {
        return NextResponse.json({ error: 'Neighborhood not found' }, { status: 404 });
      }

      const genResult = await generateNeighborhoodLibrary(
        supabase,
        neighborhood,
        { useFastModel, skipExisting: !forceRegenerate },
      );

      results.processed = 1;
      results.images_generated = genResult.images_generated;
      results.errors = genResult.errors;
      results.neighborhoods.push({
        id: neighborhood.id,
        name: neighborhood.name,
        images: genResult.images_generated,
        errors: genResult.errors,
      });

      return NextResponse.json({ success: true, ...results });
    }

    // Batch mode: get neighborhoods that need libraries
    let query = supabase
      .from('neighborhoods')
      .select('id, name, city, country')
      .eq('is_active', true)
      .order('id');

    if (startFrom) {
      query = query.gt('id', startFrom);
    }

    // Fetch more than batch size to account for skipping complete ones
    const { data: neighborhoods, error: fetchError } = await query.limit(effectiveBatchSize * 3);

    if (fetchError || !neighborhoods) {
      return NextResponse.json({
        error: fetchError?.message || 'Failed to fetch neighborhoods',
      }, { status: 500 });
    }

    // Filter out neighborhoods with complete libraries (unless force regenerate)
    let toProcess = neighborhoods;
    if (!forceRegenerate) {
      const { data: statuses } = await supabase
        .from('image_library_status')
        .select('neighborhood_id, images_generated')
        .in('neighborhood_id', neighborhoods.map(n => n.id));

      const completeSet = new Set(
        (statuses || [])
          .filter(s => s.images_generated >= 8)
          .map(s => s.neighborhood_id)
      );

      toProcess = neighborhoods.filter(n => !completeSet.has(n.id));
    }

    // Take only batch size
    const batch = toProcess.slice(0, effectiveBatchSize);

    // Process each neighborhood sequentially
    for (const neighborhood of batch) {
      if (Date.now() - functionStart > TIME_BUDGET_MS) {
        results.errors.push(`Time budget exhausted after ${results.processed} neighborhoods`);
        break;
      }

      console.log(`[image-library] Generating library for ${neighborhood.name}, ${neighborhood.city}...`);

      const genResult = await generateNeighborhoodLibrary(
        supabase,
        neighborhood,
        { useFastModel, skipExisting: !forceRegenerate },
      );

      results.processed++;
      results.images_generated += genResult.images_generated;
      results.neighborhoods.push({
        id: neighborhood.id,
        name: neighborhood.name,
        images: genResult.images_generated,
        errors: genResult.errors,
      });

      if (genResult.errors.length > 0) {
        results.errors.push(...genResult.errors.map(e => `${neighborhood.id}: ${e}`));
      }

      // If rate limited, stop the whole batch
      if (genResult.errors.some(e => e.includes('Rate limited') || e.includes('Stopping early'))) {
        results.errors.push('Batch stopped due to rate limiting');
        break;
      }
    }

    // Set cursor for pagination
    if (batch.length > 0) {
      const lastProcessed = batch[batch.length - 1];
      // Check if there are more neighborhoods after this one
      const { data: remaining } = await supabase
        .from('neighborhoods')
        .select('id')
        .eq('is_active', true)
        .gt('id', lastProcessed.id)
        .limit(1);

      if (remaining && remaining.length > 0) {
        results.next_cursor = lastProcessed.id;
      }
    }

  } catch (err) {
    results.errors.push(err instanceof Error ? err.message : String(err));
  }

  // Log to cron_executions
  await supabase
    .from('cron_executions')
    .insert({
      job_name: 'generate-image-library',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: results.images_generated > 0,
      errors: results.errors.length > 0 ? results.errors.slice(0, 20) : null,
      response_data: {
        processed: results.processed,
        images_generated: results.images_generated,
        neighborhoods: results.neighborhoods.map(n => ({
          id: n.id,
          images: n.images,
        })),
      },
    })
    .then(null, (e: unknown) => console.error('Failed to log cron execution:', e));

  return NextResponse.json({
    success: results.images_generated > 0 || results.errors.length === 0,
    ...results,
    duration_seconds: parseFloat(((Date.now() - functionStart) / 1000).toFixed(1)),
  });
}
