import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateLookAhead } from '@/lib/grok';
import { enrichBriefWithGemini } from '@/lib/brief-enricher-gemini';
import { getActiveNeighborhoodIds } from '@/lib/active-neighborhoods';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

/**
 * Generate Look Ahead Articles
 *
 * Single-pass cron: Grok search -> Gemini Flash enrichment -> article creation.
 * Only processes neighborhoods with active subscribers.
 *
 * Schedule: 0 8 * * * (8 AM UTC daily)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIME_BUDGET_MS = 270_000; // 270s budget (leave 30s for logging)
const CONCURRENCY = 3;

interface ArticleSourceInput {
  source_name: string;
  source_type: 'publication' | 'x_user' | 'platform' | 'other';
  source_url?: string;
}

function generateSlug(headline: string, neighborhoodId: string): string {
  const date = new Date().toISOString().split('T')[0];
  const headlineSlug = headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  return `${neighborhoodId}-look-ahead-${date}-${headlineSlug}`;
}

function generatePreviewText(content: string): string {
  const cleaned = content
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  if (cleaned.length <= 200) return cleaned;
  const slice = cleaned.substring(0, 200);
  const lastPeriod = slice.lastIndexOf('.');
  const lastExcl = slice.lastIndexOf('!');
  const lastQuestion = slice.lastIndexOf('?');
  const lastEnd = Math.max(lastPeriod, lastExcl, lastQuestion);
  if (lastEnd > 0) return cleaned.slice(0, lastEnd + 1);
  const lastSpace = slice.lastIndexOf(' ');
  return lastSpace > 0 ? cleaned.slice(0, lastSpace) : slice;
}

function extractSources(enrichedData: { categories?: Array<{ stories: Array<{ source?: { name: string; url: string } | null; secondarySource?: { name: string; url: string } }> }> }): ArticleSourceInput[] {
  if (!enrichedData?.categories) {
    return [
      { source_name: 'X (Twitter)', source_type: 'platform' },
      { source_name: 'Google News', source_type: 'platform' },
    ];
  }

  const sources: ArticleSourceInput[] = [];
  const seen = new Set<string>();

  for (const category of enrichedData.categories) {
    for (const story of category.stories || []) {
      if (story.source?.name && !seen.has(story.source.name.toLowerCase())) {
        seen.add(story.source.name.toLowerCase());
        const isX = story.source.name.startsWith('@') || story.source.url?.includes('x.com') || story.source.url?.includes('twitter.com');
        const url = story.source.url;
        const isValidUrl = url && !url.includes('google.com/search') && url.startsWith('http');
        sources.push({
          source_name: story.source.name,
          source_type: isX ? 'x_user' : 'publication',
          source_url: isValidUrl ? url : undefined,
        });
      }
      if (story.secondarySource?.name && !seen.has(story.secondarySource.name.toLowerCase())) {
        seen.add(story.secondarySource.name.toLowerCase());
        sources.push({
          source_name: story.secondarySource.name,
          source_type: 'publication',
          source_url: story.secondarySource.url?.startsWith('http') ? story.secondarySource.url : undefined,
        });
      }
    }
  }

  return sources.length > 0 ? sources : [
    { source_name: 'X (Twitter)', source_type: 'platform' },
    { source_name: 'Google News', source_type: 'platform' },
  ];
}

export async function GET(request: Request) {
  const functionStart = Date.now();

  // Auth
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GROK_API_KEY && !process.env.XAI_API_KEY) {
    return NextResponse.json({ success: false, error: 'Grok API key not configured' }, { status: 500 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ success: false, error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const testNeighborhoodId = url.searchParams.get('test');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const startedAt = new Date().toISOString();
  const results = {
    neighborhoods_eligible: 0,
    neighborhoods_skipped: 0,
    articles_created: 0,
    articles_failed: 0,
    errors: [] as string[],
  };

  try {
    // Determine which neighborhoods to process
    let neighborhoodIds: string[];

    if (testNeighborhoodId) {
      neighborhoodIds = [testNeighborhoodId];
    } else {
      // Only process neighborhoods with active subscribers
      const activeIds = await getActiveNeighborhoodIds(supabase);
      neighborhoodIds = Array.from(activeIds);
    }

    if (neighborhoodIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active neighborhoods to process',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Fetch neighborhood data
    const { data: neighborhoods, error: fetchError } = await supabase
      .from('neighborhoods')
      .select('id, name, city, country, timezone, is_combo, is_active')
      .in('id', neighborhoodIds)
      .eq('is_active', true)
      .eq('is_combo', false); // Skip combo neighborhoods (components are processed individually)

    if (fetchError || !neighborhoods) {
      throw new Error(`Failed to fetch neighborhoods: ${fetchError?.message}`);
    }

    results.neighborhoods_eligible = neighborhoods.length;

    // Dedup: check which neighborhoods already have a Look Ahead article today
    const today = new Date().toISOString().split('T')[0];
    const { data: existingArticles } = await supabase
      .from('articles')
      .select('neighborhood_id')
      .eq('article_type', 'look_ahead')
      .gte('published_at', `${today}T00:00:00Z`)
      .lt('published_at', `${today}T23:59:59Z`);

    const alreadyProcessed = new Set(
      (existingArticles || []).map(a => a.neighborhood_id)
    );

    const toProcess = neighborhoods.filter(n => !alreadyProcessed.has(n.id));
    results.neighborhoods_skipped = neighborhoods.length - toProcess.length;

    if (toProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: `All ${neighborhoods.length} neighborhoods already have Look Ahead articles today`,
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[generate-look-ahead] Processing ${toProcess.length} neighborhoods (${results.neighborhoods_skipped} already done)`);

    // Process in batches with concurrency
    for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
      if (Date.now() - functionStart > TIME_BUDGET_MS) {
        results.errors.push(`Time budget exhausted after ${results.articles_created} articles`);
        break;
      }

      const batch = toProcess.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (neighborhood) => {
          const { id, name, city, country, timezone } = neighborhood;

          // Step 1: Grok search for upcoming events
          console.log(`[generate-look-ahead] Grok search for ${name}, ${city}...`);
          const lookAheadBrief = await generateLookAhead(name, city, country || undefined);

          if (!lookAheadBrief || !lookAheadBrief.content) {
            console.log(`[generate-look-ahead] No content from Grok for ${name}`);
            return null;
          }

          // Step 2: Gemini Flash enrichment
          console.log(`[generate-look-ahead] Enriching ${name} with Gemini Flash...`);
          const neighborhoodSlug = getNeighborhoodSlugFromId(id);
          const enriched = await enrichBriefWithGemini(
            lookAheadBrief.content,
            name,
            neighborhoodSlug,
            city,
            country || 'USA',
            {
              articleType: 'look_ahead',
              modelOverride: 'gemini-2.5-flash',
              date: new Date().toLocaleDateString('en-US', {
                timeZone: timezone || 'America/New_York',
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
            }
          );

          const articleBody = enriched.rawResponse;
          if (!articleBody) {
            console.log(`[generate-look-ahead] No enriched content for ${name}`);
            return null;
          }

          // Step 3: Create article
          const headline = lookAheadBrief.headline;
          const articleHeadline = `${name} LOOK AHEAD: ${headline}`;
          const slug = generateSlug(headline, id);
          const previewText = generatePreviewText(articleBody);

          const { data: inserted, error: insertError } = await supabase
            .from('articles')
            .insert({
              neighborhood_id: id,
              headline: articleHeadline,
              body_text: articleBody,
              preview_text: previewText,
              slug,
              status: 'published',
              published_at: new Date().toISOString(),
              author_type: 'ai',
              ai_model: 'grok-4-1-fast + gemini-2.5-flash',
              article_type: 'look_ahead',
              category_label: `${name} Look Ahead`,
              image_url: '',
              enriched_at: new Date().toISOString(),
              enrichment_model: 'gemini-2.5-flash',
            })
            .select('id')
            .single();

          if (insertError) {
            if (insertError.message?.includes('articles_slug_key')) {
              console.log(`[generate-look-ahead] Slug collision for ${name}, skipping`);
              return 'skipped';
            }
            throw new Error(`Insert failed for ${name}: ${insertError.message}`);
          }

          // Step 4: Store sources
          if (inserted?.id) {
            const sources = extractSources(enriched);
            if (sources.length > 0) {
              await supabase
                .from('article_sources')
                .insert(sources.map(s => ({
                  article_id: inserted.id,
                  source_name: s.source_name,
                  source_type: s.source_type,
                  source_url: s.source_url,
                })))
                .then(null, (err: Error) => {
                  console.error(`Failed to insert sources for ${name}:`, err.message);
                });
            }

            // Step 5: Trigger image generation
            try {
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '')
                || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

              fetch(`${baseUrl}/api/internal/generate-image`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-cron-secret': cronSecret || '',
                },
                body: JSON.stringify({ articleId: inserted.id }),
              }).catch(() => {}); // Fire-and-forget
            } catch {}
          }

          console.log(`[generate-look-ahead] Created Look Ahead article for ${name}`);
          return 'created';
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          if (result.value === 'created') results.articles_created++;
          else if (result.value === 'skipped') results.neighborhoods_skipped++;
          // null = no content found, counts as failed
          else if (result.value === null) results.articles_failed++;
        } else {
          results.articles_failed++;
          results.errors.push(result.reason?.message || String(result.reason));
        }
      }
    }

  } catch (err) {
    results.errors.push(err instanceof Error ? err.message : String(err));
  }

  // Log to cron_executions
  try {
    await supabase
      .from('cron_executions')
      .insert({
        job_name: 'generate-look-ahead',
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        success: results.errors.length === 0,
        errors: results.errors.length > 0 ? results.errors : null,
        response_data: results,
      })
      .then(null, (err: Error) => console.error('Failed to log cron execution:', err.message));
  } catch {}

  const duration = ((Date.now() - functionStart) / 1000).toFixed(1);
  console.log(`[generate-look-ahead] Done in ${duration}s: ${results.articles_created} created, ${results.articles_failed} failed, ${results.neighborhoods_skipped} skipped`);

  return NextResponse.json({
    success: results.errors.length === 0,
    ...results,
    duration_seconds: parseFloat(duration),
    timestamp: new Date().toISOString(),
  });
}
