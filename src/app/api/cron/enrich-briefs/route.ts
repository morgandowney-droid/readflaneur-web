import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enrichBriefWithGemini, ContinuityItem } from '@/lib/brief-enricher-gemini';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Auto-enrich Neighborhood Briefs + RSS Articles with Gemini
 *
 * Runs every 10 minutes to enrich briefs that were just generated
 * and RSS-sourced articles that haven't been enriched yet.
 * Uses Gemini with Google Search grounding to verify and add sources.
 *
 * Schedule: every 15 minutes
 *
 * Time budget: 280s max (leaves 20s buffer before 300s maxDuration)
 * Phase 1 (briefs): up to 120s, 2 concurrent enrichments
 * Phase 2 (articles): remaining budget, 2 concurrent enrichments
 *
 * Reduced from every-5-min to every-15-min and concurrency 5->2 to stay within Gemini quota.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIME_BUDGET_MS = 280_000; // 280s — leave 20s for logging + response
const PHASE1_BUDGET_MS = 200_000; // 200s for briefs, 80s for articles
const CONCURRENCY = 4; // parallel Gemini calls per batch

// Daily Briefs always use Pro for highest quality; RSS articles use Flash.
const MODEL_PRO = 'gemini-2.5-pro';
const MODEL_FLASH = 'gemini-2.5-flash';

/**
 * Truncate text to ~200 chars at a sentence boundary.
 */
function truncateToSentence(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  // Find last sentence-ending punctuation
  const lastPeriod = truncated.lastIndexOf('.');
  const lastExcl = truncated.lastIndexOf('!');
  const lastQ = truncated.lastIndexOf('?');
  const end = Math.max(lastPeriod, lastExcl, lastQ);
  if (end > 50) return truncated.slice(0, end + 1); // At least 50 chars
  // No sentence boundary - truncate at last space
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) + '...' : truncated;
}

/**
 * Fetch recent coverage history for a neighborhood to give Gemini continuity context.
 * Returns last 5 days of enriched briefs (headline + excerpt) and last 3 days of
 * non-brief articles (headline + article_type).
 */
async function fetchContinuityContext(
  supabase: SupabaseClient,
  neighborhoodId: string,
  excludeBriefId: string,
  timezone: string
): Promise<ContinuityItem[]> {
  const items: ContinuityItem[] = [];

  try {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Query 1: Last 5 enriched briefs (exclude current)
    const { data: recentBriefs } = await supabase
      .from('neighborhood_briefs')
      .select('id, headline, enriched_content, generated_at')
      .eq('neighborhood_id', neighborhoodId)
      .neq('id', excludeBriefId)
      .not('enriched_content', 'is', null)
      .gte('generated_at', fiveDaysAgo.toISOString())
      .order('generated_at', { ascending: false })
      .limit(5);

    // Query 2: Last 3 days of published articles (exclude brief_summary)
    const { data: recentArticles } = await supabase
      .from('articles')
      .select('headline, article_type, published_at')
      .eq('neighborhood_id', neighborhoodId)
      .eq('status', 'published')
      .neq('article_type', 'brief_summary')
      .gte('published_at', threeDaysAgo.toISOString())
      .order('published_at', { ascending: false })
      .limit(10);

    const tz = timezone || 'America/New_York';

    if (recentBriefs) {
      for (const b of recentBriefs) {
        const dateStr = new Date(b.generated_at).toLocaleDateString('en-US', {
          timeZone: tz,
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        // Strip section headers and clean for excerpt
        const cleanContent = (b.enriched_content || '')
          .replace(/\[\[[^\]]+\]\]/g, '')
          .replace(/\n+/g, ' ')
          .trim();
        items.push({
          date: dateStr,
          headline: b.headline || 'Daily Brief',
          excerpt: truncateToSentence(cleanContent),
          type: 'brief',
        });
      }
    }

    if (recentArticles) {
      for (const a of recentArticles) {
        const dateStr = new Date(a.published_at).toLocaleDateString('en-US', {
          timeZone: tz,
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        items.push({
          date: dateStr,
          headline: a.headline || 'Article',
          type: 'article',
          articleType: a.article_type || undefined,
        });
      }
    }
  } catch (err) {
    // Non-fatal: enrichment proceeds without context
    console.warn(`[enrich-briefs] Failed to fetch continuity context for ${neighborhoodId}:`, err);
  }

  return items;
}

export async function GET(request: Request) {
  const functionStart = Date.now();

  // Verify cron authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if Gemini is configured
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      success: false,
      error: 'GEMINI_API_KEY not configured',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }

  const url = new URL(request.url);
  const testBriefId = url.searchParams.get('test');
  const testArticleId = url.searchParams.get('test-article');
  const batchSize = parseInt(url.searchParams.get('batch') || '30');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const startedAt = new Date().toISOString();

  // Daily Briefs always get Pro; RSS articles get Flash
  console.log(`[enrich-briefs] Model policy: Pro for briefs (Phase 1), Flash for articles (Phase 2)`);

  const results = {
    briefs_processed: 0,
    briefs_enriched: 0,
    briefs_failed: 0,
    articles_processed: 0,
    articles_enriched: 0,
    articles_failed: 0,
    errors: [] as string[],
    skipped_time_budget: false,
    model_pro_used: 0,
    model_flash_used: 0,
  };

  const elapsed = () => Date.now() - functionStart;
  const hasTimeBudget = () => elapsed() < TIME_BUDGET_MS;

  try {
    // ─── Phase 1: Enrich neighborhood briefs (skip in backfill mode) ───
    const isBackfill = url.searchParams.get('backfill') === 'true';

    if (!isBackfill) {
      // Find briefs that need enrichment:
      // - Generated in the last 10 days (wide window to clear backlog from Feb 4-10)
      // - Don't have enriched_content yet
      const lookbackWindow = new Date();
      lookbackWindow.setDate(lookbackWindow.getDate() - 10);

      let query = supabase
        .from('neighborhood_briefs')
        .select(`
          id,
          content,
          headline,
          neighborhood_id,
          generated_at,
          neighborhoods (
            name,
            id,
            city,
            country,
            timezone
          )
        `)
        .is('enriched_content', null)
        .gt('generated_at', lookbackWindow.toISOString())
        .order('generated_at', { ascending: false })
        .limit(batchSize);

      if (testBriefId) {
        query = supabase
          .from('neighborhood_briefs')
          .select(`
            id,
            content,
            headline,
            neighborhood_id,
            generated_at,
            neighborhoods (
              name,
              id,
              city,
              country,
              timezone
            )
          `)
          .eq('id', testBriefId);
      }

      const { data: briefs, error: fetchError } = await query;

      if (fetchError) {
        return NextResponse.json({
          success: false,
          error: fetchError.message,
          timestamp: new Date().toISOString(),
        }, { status: 500 });
      }

      // Process briefs in parallel batches (with time budget check)
      const briefQueue = [...(briefs || [])];

      while (briefQueue.length > 0) {
        if (!hasTimeBudget() || elapsed() > PHASE1_BUDGET_MS) {
          console.log(`Phase 1 stopping: ${elapsed()}ms elapsed (budget: ${PHASE1_BUDGET_MS}ms)`);
          results.skipped_time_budget = true;
          break;
        }

        const batch = briefQueue.splice(0, CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async (brief) => {
            const hood = brief.neighborhoods as unknown as {
              name: string;
              id: string;
              city: string;
              country: string;
              timezone: string;
            };

            // Fetch recent coverage history for narrative continuity
            const continuityItems = await fetchContinuityContext(
              supabase,
              hood.id,
              brief.id,
              hood.timezone
            );
            if (continuityItems.length > 0) {
              console.log(`[enrich-briefs] ${hood.name}: ${continuityItems.length} continuity items (${continuityItems.filter(i => i.type === 'brief').length} briefs, ${continuityItems.filter(i => i.type === 'article').length} articles)`);
            }

            console.log(`Enriching brief for ${hood.name} [${MODEL_PRO}]...`);

            const result = await enrichBriefWithGemini(
              brief.content,
              hood.name,
              hood.id,
              hood.city,
              hood.country || 'USA',
              {
                briefGeneratedAt: brief.generated_at,
                timezone: hood.timezone,
                modelOverride: MODEL_PRO,
                continuityContext: continuityItems.length > 0 ? continuityItems : undefined,
              }
            );

            results.model_pro_used++;

            const { error: updateError } = await supabase
              .from('neighborhood_briefs')
              .update({
                enriched_content: result.rawResponse || null,
                enriched_categories: result.categories,
                enriched_at: new Date().toISOString(),
                enrichment_model: result.model,
                subject_teaser: result.subjectTeaser || null,
                email_teaser: result.emailTeaser || null,
              })
              .eq('id', brief.id);

            if (updateError) {
              throw new Error(`${hood.name}: ${updateError.message}`);
            }

            console.log(`Successfully enriched brief for ${hood.name} [${MODEL_PRO}]`);
            return hood.name;
          })
        );

        for (const r of batchResults) {
          results.briefs_processed++;
          if (r.status === 'fulfilled') {
            results.briefs_enriched++;
          } else {
            results.briefs_failed++;
            const errorMsg = r.reason?.message || String(r.reason);
            results.errors.push(errorMsg);

            // If any call in this batch hit quota, stop Phase 1 early
            if (errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('429')) {
              console.warn('Gemini quota exhausted, stopping Phase 1 early');
              briefQueue.length = 0; // drain the queue
            }
          }
        }

        // Small delay between batches to avoid burst quota hits
        if (briefQueue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } // end if (!isBackfill)

    // ─── Phase 2: Enrich recent published articles ───
    // Only enrich articles from the last 4 days (older unenriched content is skipped)
    // Newest articles enriched first (published_at DESC)
    const articleBatchSize = parseInt(url.searchParams.get('article-batch') || '15');
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

    let articleQuery = supabase
      .from('articles')
      .select(`
        id,
        headline,
        body_text,
        neighborhood_id,
        published_at,
        editor_notes,
        neighborhoods (
          name,
          id,
          city,
          country,
          timezone
        )
      `)
      .eq('status', 'published')
      .is('enriched_at', null)
      .neq('article_type', 'brief_summary')  // Brief summaries are already enriched by Phase 1
      .neq('article_type', 'look_ahead')     // Look Aheads are already enriched by their own pipeline
      .gt('published_at', fourDaysAgo.toISOString());

    articleQuery = articleQuery
      .order('published_at', { ascending: false })
      .limit(testArticleId ? 1 : articleBatchSize);

    if (testArticleId) {
      articleQuery = supabase
        .from('articles')
        .select(`
          id,
          headline,
          body_text,
          neighborhood_id,
          published_at,
          editor_notes,
          neighborhoods (
            name,
            id,
            city,
            country,
            timezone
          )
        `)
        .eq('id', testArticleId);
    }

    const { data: articles, error: articleFetchError } = await articleQuery;

    if (articleFetchError) {
      results.errors.push(`Article fetch: ${articleFetchError.message}`);
    }

    // Process articles in parallel batches of 3 (with time budget check)
    const articleQueue = [...(articles || [])];

    while (articleQueue.length > 0) {
      if (!hasTimeBudget()) {
        console.log(`Phase 2 stopping: ${elapsed()}ms elapsed (budget: ${TIME_BUDGET_MS}ms)`);
        results.skipped_time_budget = true;
        break;
      }

      const batch = articleQueue.splice(0, CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (article) => {
          const hood = article.neighborhoods as unknown as {
            name: string;
            id: string;
            city: string;
            country: string;
            timezone: string;
          };

          if (!hood) {
            throw new Error(`Article ${article.id}: no neighborhood data`);
          }

          console.log(`Enriching RSS article "${article.headline?.slice(0, 50)}" for ${hood.name} [${MODEL_FLASH}]...`);

          const result = await enrichBriefWithGemini(
            article.body_text || '',
            hood.name,
            hood.id,
            hood.city,
            hood.country || 'USA',
            {
              briefGeneratedAt: article.published_at,
              timezone: hood.timezone,
              articleType: 'weekly_recap',
              modelOverride: MODEL_FLASH,
            }
          );

          results.model_flash_used++;

          const enrichedBody = result.rawResponse || article.body_text;
          // Regenerate preview_text from enriched body so it stays in sync
          const enrichedPreview = enrichedBody
            .replace(/\[\[[^\]]+\]\]/g, '')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\n+/g, ' ')
            .trim()
            .substring(0, 200);
          const { error: updateError } = await supabase
            .from('articles')
            .update({
              body_text: enrichedBody,
              preview_text: (() => {
                if (enrichedPreview.length < 200) return enrichedPreview;
                const lp = enrichedPreview.lastIndexOf('.');
                const le = enrichedPreview.lastIndexOf('!');
                const lq = enrichedPreview.lastIndexOf('?');
                const end = Math.max(lp, le, lq);
                if (end > 0) return enrichedPreview.slice(0, end + 1);
                const ls = enrichedPreview.lastIndexOf(' ');
                return ls > 0 ? enrichedPreview.slice(0, ls) : enrichedPreview;
              })(),
              enriched_at: new Date().toISOString(),
              enrichment_model: result.model,
            })
            .eq('id', article.id);

          if (updateError) {
            throw new Error(`Article ${article.id}: ${updateError.message}`);
          }

          // Extract and save sources from enriched categories
          if (result.categories && result.categories.length > 0) {
            const sourcesToInsert: Array<{
              article_id: string;
              source_name: string;
              source_type: string;
              source_url: string;
            }> = [];

            for (const category of result.categories) {
              for (const story of category.stories) {
                if (story.source?.url && story.source?.name) {
                  sourcesToInsert.push({
                    article_id: article.id,
                    source_name: story.source.name,
                    source_type: 'publication',
                    source_url: story.source.url,
                  });
                }
                if (story.secondarySource?.url && story.secondarySource?.name) {
                  sourcesToInsert.push({
                    article_id: article.id,
                    source_name: story.secondarySource.name,
                    source_type: 'publication',
                    source_url: story.secondarySource.url,
                  });
                }
              }
            }

            if (sourcesToInsert.length > 0) {
              const seen = new Set<string>();
              const uniqueSources = sourcesToInsert.filter(s => {
                if (seen.has(s.source_url)) return false;
                seen.add(s.source_url);
                return true;
              });

              const { error: sourcesError } = await supabase
                .from('article_sources')
                .insert(uniqueSources);

              if (sourcesError) {
                console.error(`Failed to insert sources for article ${article.id}:`, sourcesError.message);
              } else {
                console.log(`Saved ${uniqueSources.length} sources for article ${article.id}`);
              }
            }
          }

          console.log(`Successfully enriched article for ${hood.name}`);
          return hood.name;
        })
      );

      for (const r of batchResults) {
        results.articles_processed++;
        if (r.status === 'fulfilled') {
          results.articles_enriched++;
        } else {
          results.articles_failed++;
          const errorMsg = r.reason?.message || String(r.reason);
          results.errors.push(errorMsg);

          // If any call in this batch hit quota, stop Phase 2 early
          if (errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('429')) {
            console.warn('Gemini quota exhausted, stopping Phase 2 early');
            articleQueue.length = 0;
          }
        }
      }

      // Small delay between batches to avoid burst quota hits
      if (articleQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } finally {
    // Always log execution (even if function is about to timeout)
    const totalEnriched = results.briefs_enriched + results.articles_enriched;
    const totalFailed = results.briefs_failed + results.articles_failed;
    const isSuccess = totalFailed === 0 || totalEnriched > 0;

    if (!testBriefId && !testArticleId) {
      await supabase.from('cron_executions').insert({
        job_name: 'enrich-briefs',
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        success: isSuccess,
        articles_created: totalEnriched,
        errors: results.errors.length > 0 ? results.errors : null,
        response_data: {
          briefs_processed: results.briefs_processed,
          briefs_enriched: results.briefs_enriched,
          articles_processed: results.articles_processed,
          articles_enriched: results.articles_enriched,
          model_pro_used: results.model_pro_used,
          model_flash_used: results.model_flash_used,
          elapsed_ms: Date.now() - functionStart,
          skipped_time_budget: results.skipped_time_budget,
        },
      }).then(null, (e: unknown) => console.error('Failed to log cron execution:', e));
    }

    const totalProcessed = results.briefs_processed + results.articles_processed;
    console.log(`enrich-briefs complete: ${totalEnriched}/${totalProcessed} enriched, ${totalFailed} failed, ${Date.now() - functionStart}ms`);
  }

  const totalEnriched = results.briefs_enriched + results.articles_enriched;
  const totalFailed = results.briefs_failed + results.articles_failed;
  const isSuccess = totalFailed === 0 || totalEnriched > 0;

  return NextResponse.json({
    success: isSuccess,
    ...results,
    elapsed_ms: Date.now() - functionStart,
    timestamp: new Date().toISOString(),
  });
}
