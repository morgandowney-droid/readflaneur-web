import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  generateWeeklyBrief,
  formatWeeklyBriefAsArticle,
} from '@/lib/weekly-brief-service';
import { AI_MODELS } from '@/config/ai-models';
import { selectLibraryImage, getLibraryReadyIds, preloadUnsplashCache } from '@/lib/image-library';

/**
 * Generate "The Sunday Edition" weekly briefs for all active neighborhoods.
 *
 * Creates a weekly_briefs record and an article in the feed for each neighborhood.
 * Runs early Sunday morning so content is ready for 7 AM local sends.
 *
 * Schedule: 0 4 * * 0 (4:00 AM UTC every Sunday)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIME_BUDGET_MS = 280_000;
// Each generateWeeklyBrief makes ~5 Gemini calls (significance, editorial, horizon, data point, holiday)
const GEMINI_CALLS_PER_NEIGHBORHOOD = 5;
const MODEL_PRO = AI_MODELS.GEMINI_PRO;
const MODEL_FLASH = AI_MODELS.GEMINI_FLASH;
// Pro RPD limit is 1K. enrich-briefs uses up to 900. We get the remainder.
const PRO_RPD_LIMIT = 1000;

export async function GET(request: Request) {
  const functionStart = Date.now();

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

  const url = new URL(request.url);
  const testNeighborhoodId = url.searchParams.get('test');
  // Process all neighborhoods - batch=10 caused starvation (only 10/270 per week)
  const batchSize = parseInt(url.searchParams.get('batch') || '500');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const libraryReadyIds = await getLibraryReadyIds(supabase);
  await preloadUnsplashCache(supabase);
  const startedAt = new Date().toISOString();
  // The Sunday date for this edition - always calculate "this Sunday" so all runs
  // during the Saturday+Sunday window share the same weekDate for dedup.
  // Allow override via ?date= for catch-up runs.
  let weekDate = url.searchParams.get('date') || '';
  if (!weekDate) {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sunday, 6=Saturday
    if (dayOfWeek === 0) {
      // Already Sunday - use today
      weekDate = now.toISOString().split('T')[0];
    } else {
      // Saturday (6) or any other day - find this coming Sunday
      const daysUntilSunday = 7 - dayOfWeek;
      const sunday = new Date(now);
      sunday.setUTCDate(sunday.getUTCDate() + daysUntilSunday);
      weekDate = sunday.toISOString().split('T')[0];
    }
  }

  // Pro-first, Flash-fallback: check how much Pro RPD remains today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Count all Pro usage today (enrichment + previous Sunday Edition runs)
  const { count: proUsedToday } = await supabase
    .from('neighborhood_briefs')
    .select('*', { count: 'exact', head: true })
    .eq('enrichment_model', MODEL_PRO)
    .gte('enriched_at', todayStart.toISOString());

  // Also count Pro usage from articles (enrich-briefs Phase 2)
  const { count: articleProUsed } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('enrichment_model', MODEL_PRO)
    .gte('enriched_at', todayStart.toISOString());

  let proRemainingToday = PRO_RPD_LIMIT - (proUsedToday || 0) - (articleProUsed || 0);
  console.log(`[SundayEdition] Pro used today: ${(proUsedToday || 0) + (articleProUsed || 0)}/${PRO_RPD_LIMIT}, remaining: ${proRemainingToday}`);

  function getModelForNeighborhood(): string {
    if (proRemainingToday >= GEMINI_CALLS_PER_NEIGHBORHOOD) {
      proRemainingToday -= GEMINI_CALLS_PER_NEIGHBORHOOD;
      return MODEL_PRO;
    }
    return MODEL_FLASH;
  }

  const results = {
    neighborhoods_processed: 0,
    briefs_generated: 0,
    articles_created: 0,
    pro_neighborhoods: 0,
    flash_neighborhoods: 0,
    errors: [] as string[],
  };

  try {
    // Get neighborhoods to process
    let neighborhoodsQuery = supabase
      .from('neighborhoods')
      .select('id, name, city, country')
      .eq('is_active', true)
      .order('name');

    if (testNeighborhoodId) {
      neighborhoodsQuery = supabase
        .from('neighborhoods')
        .select('id, name, city, country')
        .eq('id', testNeighborhoodId);
    } else {
      neighborhoodsQuery = neighborhoodsQuery.limit(batchSize);
    }

    const { data: neighborhoods, error: fetchError } = await neighborhoodsQuery;

    if (fetchError || !neighborhoods) {
      return NextResponse.json({
        success: false,
        error: fetchError?.message || 'No neighborhoods found',
      }, { status: 500 });
    }

    // Skip neighborhoods that already have a brief for this week
    const { data: existingBriefs } = await supabase
      .from('weekly_briefs')
      .select('neighborhood_id')
      .eq('week_date', weekDate);

    const existingSet = new Set((existingBriefs || []).map(b => b.neighborhood_id));

    const toProcess = testNeighborhoodId
      ? neighborhoods
      : neighborhoods.filter(n => !existingSet.has(n.id));

    console.log(`[SundayEdition] Processing ${toProcess.length} neighborhoods (${existingSet.size} already done)`);

    // Process neighborhoods in concurrent batches of 5 for throughput
    // At ~45s per neighborhood, concurrency 5 yields ~10 per 280s run
    // Combined with Saturday+Sunday schedule (48h), covers all 270 neighborhoods
    const CONCURRENCY = 5;
    const queue = [...toProcess];

    while (queue.length > 0) {
      if (Date.now() - functionStart > TIME_BUDGET_MS) {
        console.log(`[SundayEdition] Time budget exceeded at ${Date.now() - functionStart}ms`);
        break;
      }

      const batch = queue.splice(0, CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (neighborhood) => {
          results.neighborhoods_processed++;
          const model = getModelForNeighborhood();
          if (model === MODEL_PRO) results.pro_neighborhoods++;
          else results.flash_neighborhoods++;
          console.log(`[SundayEdition] Generating for ${neighborhood.name} [${model}]...`);

          const content = await generateWeeklyBrief(
            supabase,
            neighborhood.id,
            neighborhood.name,
            neighborhood.city,
            neighborhood.country || 'USA',
            model,
            weekDate
          );

          // Create feed article
          const bodyText = formatWeeklyBriefAsArticle(content, neighborhood.name);
          const headline = `The Sunday Edition: ${neighborhood.name}`;
          const slug = `${neighborhood.id}-sunday-edition-${weekDate}`;

          const { data: article, error: articleError } = await supabase
            .from('articles')
            .insert({
              headline,
              body_text: bodyText,
              slug,
              neighborhood_id: neighborhood.id,
              status: 'published',
              published_at: new Date().toISOString(),
              category_label: 'The Sunday Edition',
              author_type: 'ai',
              ai_model: model,
              image_url: selectLibraryImage(neighborhood.id, 'weekly_recap', 'The Sunday Edition', libraryReadyIds),
            })
            .select('id')
            .single();

          if (articleError) {
            results.errors.push(`${neighborhood.name} article: ${articleError.message}`);
          } else {
            results.articles_created++;
          }

          // Save structured brief data
          const { error: briefError } = await supabase
            .from('weekly_briefs')
            .upsert({
              neighborhood_id: neighborhood.id,
              week_date: weekDate,
              rearview_narrative: content.rearviewNarrative,
              rearview_stories: content.rearviewStories,
              horizon_events: content.horizonEvents,
              data_point: content.dataPoint,
              holiday_section: content.holidaySection || null,
              subject_teaser: content.subjectTeaser || null,
              article_id: article?.id || null,
              generated_at: new Date().toISOString(),
            }, {
              onConflict: 'neighborhood_id,week_date',
            });

          if (briefError) {
            results.errors.push(`${neighborhood.name} brief: ${briefError.message}`);
          } else {
            results.briefs_generated++;
          }

          console.log(`[SundayEdition] ${neighborhood.name} complete`);
          return neighborhood.name;
        })
      );

      // Log any failures
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        if (result.status === 'rejected') {
          const name = batch[i]?.name || 'unknown';
          results.errors.push(`${name}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
          console.error(`[SundayEdition] ${name} error:`, result.reason);
        }
      }

      // Brief delay between batches
      if (queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } finally {
    // Log execution
    if (!testNeighborhoodId) {
      await supabase.from('cron_executions').insert({
        job_name: 'sync-weekly-brief',
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        success: results.briefs_generated > 0,
        articles_created: results.articles_created,
        errors: results.errors.length > 0 ? results.errors : null,
        response_data: results,
      }).then(null, (e: unknown) => console.error('Failed to log cron execution:', e));
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    elapsed_ms: Date.now() - functionStart,
    timestamp: new Date().toISOString(),
  });
}
