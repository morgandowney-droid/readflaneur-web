import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  generateWeeklyBrief,
  formatWeeklyBriefAsArticle,
} from '@/lib/weekly-brief-service';
import { getCronImage } from '@/lib/cron-images';

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

  const startedAt = new Date().toISOString();
  const today = new Date();
  // The Sunday date for this edition
  const weekDate = today.toISOString().split('T')[0];

  const results = {
    neighborhoods_processed: 0,
    briefs_generated: 0,
    articles_created: 0,
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

    // Get or generate the Sunday Edition image
    let imageUrl: string | null = null;
    try {
      imageUrl = await getCronImage('sunday-edition', supabase);
    } catch {
      console.error('[SundayEdition] Failed to get image');
    }

    for (const neighborhood of toProcess) {
      if (Date.now() - functionStart > TIME_BUDGET_MS) {
        console.log(`[SundayEdition] Time budget exceeded at ${Date.now() - functionStart}ms`);
        break;
      }

      try {
        results.neighborhoods_processed++;
        console.log(`[SundayEdition] Generating for ${neighborhood.name}...`);

        const content = await generateWeeklyBrief(
          supabase,
          neighborhood.id,
          neighborhood.name,
          neighborhood.city,
          neighborhood.country || 'USA'
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
            ai_model: 'gemini-2.5-pro',
            image_url: imageUrl,
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

        // Rate limit between neighborhoods
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (err) {
        results.errors.push(`${neighborhood.name}: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`[SundayEdition] ${neighborhood.name} error:`, err);
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
