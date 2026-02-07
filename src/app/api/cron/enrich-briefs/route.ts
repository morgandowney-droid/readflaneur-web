import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enrichBriefWithGemini } from '@/lib/brief-enricher-gemini';

/**
 * Auto-enrich Neighborhood Briefs + RSS Articles with Gemini
 *
 * Runs 15 minutes after the hour to enrich briefs that were just generated
 * and RSS-sourced articles that haven't been enriched yet.
 * Uses Gemini with Google Search grounding to verify and add sources.
 *
 * Schedule: 15 * * * * (15 minutes past each hour)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
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
  const batchSize = parseInt(url.searchParams.get('batch') || '5');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const startedAt = new Date().toISOString();

  const results = {
    briefs_processed: 0,
    briefs_enriched: 0,
    briefs_failed: 0,
    articles_processed: 0,
    articles_enriched: 0,
    articles_failed: 0,
    errors: [] as string[],
  };

  // Find briefs that need enrichment:
  // - Generated in the last 2 hours (recent)
  // - Don't have enriched_content yet
  const twoHoursAgo = new Date();
  twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

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
        country
      )
    `)
    .is('enriched_content', null)
    .gt('generated_at', twoHoursAgo.toISOString())
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
          country
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

  // Process each brief
  for (const brief of (briefs || [])) {
    try {
      results.briefs_processed++;

      const hood = brief.neighborhoods as unknown as {
        name: string;
        id: string;
        city: string;
        country: string;
      };

      console.log(`Enriching brief for ${hood.name}...`);

      // Enrich with Gemini
      const result = await enrichBriefWithGemini(
        brief.content,
        hood.name,
        hood.id,
        hood.city,
        hood.country || 'USA',
        {
          briefGeneratedAt: brief.generated_at,
        }
      );

      // Store the enriched data
      const { error: updateError } = await supabase
        .from('neighborhood_briefs')
        .update({
          enriched_content: result.rawResponse || null,
          enriched_categories: result.categories,
          enriched_at: new Date().toISOString(),
          enrichment_model: result.model,
        })
        .eq('id', brief.id);

      if (updateError) {
        results.briefs_failed++;
        results.errors.push(`${hood.name}: ${updateError.message}`);
        continue;
      }

      results.briefs_enriched++;
      console.log(`Successfully enriched brief for ${hood.name}`);

      // Rate limiting - avoid hitting Gemini API limits
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (err) {
      results.briefs_failed++;
      const hood = brief.neighborhoods as unknown as { name: string };
      results.errors.push(`${hood?.name || brief.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── Phase 2: Enrich RSS-sourced articles ───
  // Find RSS articles (ai_model = 'claude-sonnet-4') that haven't been enriched
  // Use 48-hour window by default, or no window for backfill mode
  const isBackfill = url.searchParams.get('backfill') === 'true';
  const articleBatchSize = parseInt(url.searchParams.get('article-batch') || '10');

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
        country
      )
    `)
    .eq('ai_model', 'claude-sonnet-4')
    .eq('status', 'published')
    .is('enriched_at', null);

  if (!isBackfill && !testArticleId) {
    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);
    articleQuery = articleQuery.gt('published_at', fortyEightHoursAgo.toISOString());
  }

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
          country
        )
      `)
      .eq('id', testArticleId);
  }

  const { data: articles, error: articleFetchError } = await articleQuery;

  if (articleFetchError) {
    results.errors.push(`Article fetch: ${articleFetchError.message}`);
  }

  for (const article of (articles || [])) {
    try {
      results.articles_processed++;

      const hood = article.neighborhoods as unknown as {
        name: string;
        id: string;
        city: string;
        country: string;
      };

      if (!hood) {
        results.articles_failed++;
        results.errors.push(`Article ${article.id}: no neighborhood data`);
        continue;
      }

      console.log(`Enriching RSS article "${article.headline?.slice(0, 50)}" for ${hood.name}...`);

      // Pass article body through Gemini enrichment (weekly_recap style = no greeting/sign-off)
      const result = await enrichBriefWithGemini(
        article.body_text || '',
        hood.name,
        hood.id,
        hood.city,
        hood.country || 'USA',
        {
          briefGeneratedAt: article.published_at,
          articleType: 'weekly_recap',
        }
      );

      // Update article with enriched body text
      const enrichedBody = result.rawResponse || article.body_text;
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          body_text: enrichedBody,
          enriched_at: new Date().toISOString(),
          enrichment_model: result.model,
        })
        .eq('id', article.id);

      if (updateError) {
        results.articles_failed++;
        results.errors.push(`Article ${article.id}: ${updateError.message}`);
        continue;
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
          // Deduplicate by source URL
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

      results.articles_enriched++;
      console.log(`Successfully enriched article for ${hood.name}`);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (err) {
      results.articles_failed++;
      results.errors.push(`Article ${article.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const totalEnriched = results.briefs_enriched + results.articles_enriched;
  const totalFailed = results.briefs_failed + results.articles_failed;
  const isSuccess = totalFailed === 0 || totalEnriched > 0;

  // Log execution to cron_executions table
  if (!testBriefId && !testArticleId) {
    await supabase.from('cron_executions').insert({
      job_name: 'enrich-briefs',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: isSuccess,
      articles_created: totalEnriched,
      errors: results.errors.length > 0 ? results.errors : [],
      response_data: {
        briefs_processed: results.briefs_processed,
        briefs_enriched: results.briefs_enriched,
        articles_processed: results.articles_processed,
        articles_enriched: results.articles_enriched,
      },
    }).then(null, (e: unknown) => console.error('Failed to log cron execution:', e));
  }

  return NextResponse.json({
    success: isSuccess,
    ...results,
    timestamp: new Date().toISOString(),
  });
}
