import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { selectLibraryImage, getLibraryReadyIds, preloadUnsplashCache } from '@/lib/image-library';
import { toHeadlineCase } from '@/lib/utils';

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

/**
 * Extract sources from enriched categories JSON
 */
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

/**
 * Generate Articles from Neighborhood Briefs
 *
 * Runs after briefs are generated and creates news articles from the
 * enriched brief content. These appear in the neighborhood's news feed.
 *
 * Schedule: 30 minutes past each hour (after brief generation at :00)
 * Processes briefs that have enriched_content but no linked article yet.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

function generateSlug(headline: string, neighborhoodSlug: string, generatedAt: string): string {
  // Use brief's generation date, not "now" - consistent across retries
  const date = new Date(generatedAt).toISOString().split('T')[0];
  const headlineSlug = headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  return `${neighborhoodSlug}-brief-${date}-${headlineSlug}`;
}

function generatePreviewText(content: string): string {
  // Remove [[headers]], **bold** markers, and markdown links, then get first ~200 chars
  const cleaned = content
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markers, keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove link markup, keep text
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

  const url = new URL(request.url);
  const testBriefId = url.searchParams.get('test');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const libraryReadyIds = await getLibraryReadyIds(supabase);
  await preloadUnsplashCache(supabase);
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + 270_000; // 270s budget (leave 30s for logging + images)
  const results = {
    briefs_processed: 0,
    articles_created: 0,
    articles_skipped: 0,
    articles_failed: 0,
    errors: [] as string[],
  };

  try {

  // Time window: last 36h covers all timezone morning windows
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 36);

  // Step 1: Get IDs of recent enriched briefs
  let idsQuery = supabase
    .from('neighborhood_briefs')
    .select('id')
    .not('enriched_content', 'is', null)
    .gte('generated_at', cutoff.toISOString())
    .limit(500);

  if (testBriefId) {
    idsQuery = supabase
      .from('neighborhood_briefs')
      .select('id')
      .eq('id', testBriefId);
  }

  const { data: recentBriefIds, error: idsError } = await idsQuery;

  if (idsError || !recentBriefIds || recentBriefIds.length === 0) {
    if (idsError) {
      return NextResponse.json({ success: false, error: idsError.message }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      message: 'No recent enriched briefs to process',
      ...results,
      timestamp: new Date().toISOString(),
    });
  }

  // Step 2: Find which already have articles (batch-safe for large sets)
  const allBriefIds = recentBriefIds.map(b => b.id);
  const existingBriefIds = new Set<string>();

  // Query in chunks of 100 to stay within PostgREST URL limits
  for (let i = 0; i < allBriefIds.length; i += 100) {
    const chunk = allBriefIds.slice(i, i + 100);
    const { data: existing } = await supabase
      .from('articles')
      .select('brief_id')
      .in('brief_id', chunk);
    if (existing) {
      for (const a of existing) existingBriefIds.add(a.brief_id);
    }
  }

  // Step 3: Filter to only brief IDs that need articles
  const needsArticleIds = allBriefIds.filter(id => !existingBriefIds.has(id));
  results.articles_skipped = allBriefIds.length - needsArticleIds.length;

  if (needsArticleIds.length === 0) {
    return NextResponse.json({
      success: true,
      message: `All ${allBriefIds.length} recent briefs already have articles`,
      ...results,
      timestamp: new Date().toISOString(),
    });
  }

  // Step 4: Fetch full data only for briefs that need articles (chunks of 50)
  const briefs: any[] = [];
  for (let i = 0; i < needsArticleIds.length; i += 50) {
    const chunk = needsArticleIds.slice(i, i + 50);
    const { data, error } = await supabase
      .from('neighborhood_briefs')
      .select(`
        id,
        neighborhood_id,
        headline,
        subject_teaser,
        content,
        enriched_content,
        enriched_categories,
        enrichment_model,
        model,
        generated_at,
        email_teaser,
        neighborhoods!inner(id, name, city)
      `)
      .in('id', chunk)
      .order('generated_at', { ascending: false });

    if (error) {
      results.errors.push(`Fetch chunk error: ${error.message}`);
      continue;
    }
    if (data) briefs.push(...data);
  }

  if (briefs.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No briefs need articles',
      ...results,
      timestamp: new Date().toISOString(),
    });
  }

  // Dedup: only keep the latest brief per neighborhood per day
  // This prevents duplicate articles when multiple briefs exist for the same neighborhood
  const dedupMap = new Map<string, typeof briefs[0]>();
  for (const brief of briefs) {
    const date = new Date(brief.generated_at).toISOString().split('T')[0];
    const key = `${brief.neighborhood_id}::${date}`;
    const existing = dedupMap.get(key);
    if (!existing || new Date(brief.generated_at) > new Date(existing.generated_at)) {
      dedupMap.set(key, brief);
    }
  }
  const dedupedBriefs = Array.from(dedupMap.values());
  const dedupSkipped = briefs.length - dedupedBriefs.length;
  if (dedupSkipped > 0) {
    console.log(`[generate-brief-articles] Deduped ${dedupSkipped} duplicate briefs (${briefs.length} → ${dedupedBriefs.length})`);
    results.articles_skipped += dedupSkipped;
  }

  // Process each brief (all are pre-filtered and deduped)
  for (const brief of dedupedBriefs) {
    // Time budget check - stop before we run out of time
    if (Date.now() > deadline) {
      results.errors.push(`Time budget exhausted after ${results.articles_created} articles`);
      break;
    }

    try {
      results.briefs_processed++;

      const neighborhood = brief.neighborhoods as unknown as { id: string; name: string; city: string };

      // Use subject_teaser (Title Case) as headline when available, fall back to Grok headline
      const baseHeadline = brief.subject_teaser
        ? toHeadlineCase(brief.subject_teaser)
        : (brief.headline || `What's Happening in ${neighborhood.name}`);
      const articleHeadline = `${neighborhood.name} DAILY BRIEF: ${baseHeadline}`;

      // Only use enriched content — never publish raw/unenriched briefs
      const articleBody = brief.enriched_content;

      if (!articleBody) {
        results.articles_failed++;
        results.errors.push(`Brief ${brief.id}: No enriched content available`);
        continue;
      }

      // Generate slug using neighborhood id and brief's generation date
      const slug = generateSlug(articleHeadline, neighborhood.id, brief.generated_at);

      // Use email_teaser from Gemini enrichment if available, otherwise auto-generate
      const previewText = brief.email_teaser || generatePreviewText(articleBody);

      // Extract sources from enriched categories
      const extractedSources = extractSourcesFromCategories(brief.enriched_categories as EnrichedCategory[] | null);

      // Create the article
      const { data: insertedArticle, error: insertError } = await supabase
        .from('articles')
        .insert({
          neighborhood_id: brief.neighborhood_id,
          headline: articleHeadline,
          body_text: articleBody,
          preview_text: previewText,
          slug,
          status: 'published',
          published_at: brief.generated_at,
          author_type: 'ai',
          ai_model: brief.model ? `${brief.model} + ${brief.enrichment_model || 'gemini'}` : `grok + ${brief.enrichment_model || 'gemini'}`,
          article_type: 'brief_summary',
          category_label: `${neighborhood.name} Daily Brief`,
          brief_id: brief.id,
          image_url: selectLibraryImage(brief.neighborhood_id, 'brief_summary', undefined, libraryReadyIds),
          enriched_at: new Date().toISOString(),
          enrichment_model: brief.enrichment_model || 'gemini-2.5-flash',
        })
        .select('id')
        .single();

      if (insertError) {
        // Slug collision means an article already exists for this date/neighborhood/headline
        // (likely from a re-generated brief with different ID) - safe to skip
        if (insertError.message?.includes('articles_slug_key')) {
          results.articles_skipped++;
          continue;
        }
        results.articles_failed++;
        results.errors.push(`Brief ${brief.id}: ${insertError.message}`);
        continue;
      }

      results.articles_created++;

      // Store sources for attribution
      if (extractedSources.length > 0 && insertedArticle?.id) {
        const sourcesToInsert = extractedSources.map(s => ({
          article_id: insertedArticle.id,
          source_name: s.source_name,
          source_type: s.source_type,
          source_url: s.source_url,
        }));

        const { error: sourcesError } = await supabase
          .from('article_sources')
          .insert(sourcesToInsert);

        if (sourcesError) {
          console.error(`Failed to insert sources for article ${insertedArticle.id}:`, sourcesError.message);
        }
      }

    } catch (err) {
      results.articles_failed++;
      results.errors.push(`Brief ${brief.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    success: results.articles_failed === 0 || results.articles_created > 0,
    ...results,
    timestamp: new Date().toISOString(),
  });

  } finally {
    // Always log cron execution for monitoring
    await supabase.from('cron_executions').insert({
      job_name: 'generate-brief-articles',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: results.articles_failed === 0 || results.articles_created > 0,
      articles_created: results.articles_created,
      errors: results.errors.length > 0 ? results.errors.slice(0, 10) : null,
      response_data: {
        briefs_processed: results.briefs_processed,
        articles_created: results.articles_created,
        articles_failed: results.articles_failed,
      },
    }).then(null, (e: unknown) => console.error('Failed to log cron execution:', e));
  }
}
