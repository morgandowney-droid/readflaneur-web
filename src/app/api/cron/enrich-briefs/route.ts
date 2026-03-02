import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enrichBriefWithGemini, ContinuityItem } from '@/lib/brief-enricher-gemini';
import { selectLibraryImage, getLibraryReadyIds, preloadUnsplashCache } from '@/lib/image-library';
import { toHeadlineCase } from '@/lib/utils';
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
 * Returns last 10 days of enriched briefs (headline + excerpt) and last 7 days of
 * non-brief articles (headline + article_type). Extended windows catch persistent
 * topics that repeat across 1-2 weeks.
 */
async function fetchContinuityContext(
  supabase: SupabaseClient,
  neighborhoodId: string,
  excludeBriefId: string,
  timezone: string
): Promise<ContinuityItem[]> {
  const items: ContinuityItem[] = [];

  try {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Query 1: Last 10 days of enriched briefs (exclude current) - extended
    // from 5 days to catch persistent topics that repeat across 1-2 weeks
    const { data: recentBriefs } = await supabase
      .from('neighborhood_briefs')
      .select('id, headline, enriched_content, generated_at')
      .eq('neighborhood_id', neighborhoodId)
      .neq('id', excludeBriefId)
      .not('enriched_content', 'is', null)
      .gte('generated_at', tenDaysAgo.toISOString())
      .order('generated_at', { ascending: false })
      .limit(10);

    // Query 2: Last 7 days of published articles (exclude brief_summary) -
    // extended from 3 days to give Gemini broader awareness of recent coverage
    const { data: recentArticles } = await supabase
      .from('articles')
      .select('headline, article_type, published_at')
      .eq('neighborhood_id', neighborhoodId)
      .eq('status', 'published')
      .neq('article_type', 'brief_summary')
      .gte('published_at', sevenDaysAgo.toISOString())
      .order('published_at', { ascending: false })
      .limit(20);

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

// ─── Inline article creation helpers (mirrors generate-brief-articles logic) ───

interface ArticleSourceInput {
  source_name: string;
  source_type: 'publication' | 'x_user' | 'platform' | 'other';
  source_url?: string;
}

interface EnrichedCategory {
  name: string;
  stories: Array<{
    entity: string;
    source?: { name: string; url: string } | null;
    secondarySource?: { name: string; url: string };
    context: string;
  }>;
}

function generateBriefSlug(headline: string, neighborhoodSlug: string, generatedAt: string, timezone?: string): string {
  const date = timezone
    ? new Date(generatedAt).toLocaleDateString('en-CA', { timeZone: timezone })
    : new Date(generatedAt).toISOString().split('T')[0];
  const headlineSlug = headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  return `${neighborhoodSlug}-brief-${date}-${headlineSlug}`;
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

function extractSourcesFromCategories(categories: EnrichedCategory[] | null): ArticleSourceInput[] {
  if (!categories || !Array.isArray(categories)) {
    return [
      { source_name: 'X (Twitter)', source_type: 'platform' },
      { source_name: 'Google News', source_type: 'platform' },
    ];
  }

  const sources: ArticleSourceInput[] = [];
  const seenSources = new Set<string>();

  for (const category of categories) {
    for (const story of category.stories || []) {
      if (story.source?.name) {
        const key = story.source.name.toLowerCase();
        if (!seenSources.has(key)) {
          seenSources.add(key);
          let sourceType: ArticleSourceInput['source_type'] = 'publication';
          if (story.source.name.startsWith('@') || story.source.url?.includes('x.com') || story.source.url?.includes('twitter.com')) {
            sourceType = 'x_user';
          }
          const url = story.source.url;
          const isValidUrl = url && !url.includes('google.com/search') && url.startsWith('http');
          sources.push({
            source_name: story.source.name,
            source_type: sourceType,
            source_url: isValidUrl ? url : undefined,
          });
        }
      }
      if (story.secondarySource?.name) {
        const key = story.secondarySource.name.toLowerCase();
        if (!seenSources.has(key)) {
          seenSources.add(key);
          let sourceType: ArticleSourceInput['source_type'] = 'publication';
          if (story.secondarySource.name.startsWith('@') || story.secondarySource.url?.includes('x.com')) {
            sourceType = 'x_user';
          }
          const url = story.secondarySource.url;
          const isValidUrl = url && !url.includes('google.com/search') && url.startsWith('http');
          sources.push({
            source_name: story.secondarySource.name,
            source_type: sourceType,
            source_url: isValidUrl ? url : undefined,
          });
        }
      }
    }
  }

  if (sources.length === 0) {
    return [
      { source_name: 'X (Twitter)', source_type: 'platform' },
      { source_name: 'Google News', source_type: 'platform' },
    ];
  }

  return sources;
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

  // Preload Unsplash image cache for inline article creation
  const libraryReadyIds = await getLibraryReadyIds(supabase);
  await preloadUnsplashCache(supabase);

  const results = {
    briefs_processed: 0,
    briefs_enriched: 0,
    briefs_failed: 0,
    articles_created_inline: 0,
    articles_inline_failed: 0,
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
          model,
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
            model,
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

            // ─── Inline article creation: create brief_summary article immediately ───
            try {
              // Check if article already exists for this brief
              const { data: existingArticle } = await supabase
                .from('articles')
                .select('id')
                .eq('brief_id', brief.id)
                .maybeSingle();

              if (!existingArticle) {
                const enrichedContent = result.rawResponse;
                if (enrichedContent) {
                  const baseHeadline = result.subjectTeaser
                    ? toHeadlineCase(result.subjectTeaser)
                    : (brief.headline || `What's Happening in ${hood.name}`);
                  const articleHeadline = `${hood.name} DAILY BRIEF: ${baseHeadline}`;
                  const slug = generateBriefSlug(articleHeadline, hood.id, brief.generated_at, hood.timezone);
                  const previewText = result.emailTeaser || generatePreviewText(enrichedContent);
                  const extractedSources = extractSourcesFromCategories(result.categories as EnrichedCategory[] | null);

                  const { data: insertedArticle, error: insertError } = await supabase
                    .from('articles')
                    .insert({
                      neighborhood_id: brief.neighborhood_id,
                      headline: articleHeadline,
                      body_text: enrichedContent,
                      preview_text: previewText,
                      slug,
                      status: 'published',
                      published_at: brief.generated_at,
                      author_type: 'ai',
                      ai_model: brief.model ? `${brief.model} + ${result.model}` : `grok + ${result.model}`,
                      article_type: 'brief_summary',
                      category_label: `${hood.name} Daily Brief`,
                      brief_id: brief.id,
                      image_url: selectLibraryImage(brief.neighborhood_id, 'brief_summary', undefined, libraryReadyIds),
                      enriched_at: new Date().toISOString(),
                      enrichment_model: result.model,
                    })
                    .select('id')
                    .single();

                  if (insertError) {
                    // Slug or brief_id collision = article already exists, not an error
                    if (insertError.message?.includes('articles_slug_key') || insertError.message?.includes('articles_brief_id_unique')) {
                      console.log(`[enrich-briefs] Article already exists for ${hood.name} brief ${brief.id}`);
                    } else {
                      console.error(`[enrich-briefs] Inline article creation failed for ${hood.name}: ${insertError.message}`);
                      results.articles_inline_failed++;
                    }
                  } else {
                    results.articles_created_inline++;
                    console.log(`[enrich-briefs] Created article inline for ${hood.name}`);

                    // Insert sources
                    if (extractedSources.length > 0 && insertedArticle?.id) {
                      const sourcesToInsert = extractedSources.map(s => ({
                        article_id: insertedArticle.id,
                        source_name: s.source_name,
                        source_type: s.source_type,
                        source_url: s.source_url,
                      }));
                      await supabase
                        .from('article_sources')
                        .insert(sourcesToInsert)
                        .then(null, (e: unknown) => console.error(`[enrich-briefs] Sources insert failed for ${hood.name}:`, e));
                    }
                  }
                }
              } else {
                console.log(`[enrich-briefs] Article already exists for ${hood.name} brief ${brief.id}, skipping inline creation`);
              }
            } catch (articleErr) {
              // Non-fatal: enrichment succeeded, article creation is bonus
              console.error(`[enrich-briefs] Inline article creation error for ${hood.name}:`, articleErr);
              results.articles_inline_failed++;
            }

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
          articles_created_inline: results.articles_created_inline,
          articles_inline_failed: results.articles_inline_failed,
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
