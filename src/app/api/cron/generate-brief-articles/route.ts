import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
export const maxDuration = 120;

function generateSlug(headline: string, neighborhoodSlug: string): string {
  const date = new Date().toISOString().split('T')[0];
  const headlineSlug = headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  return `${neighborhoodSlug}-brief-${date}-${headlineSlug}`;
}

function generatePreviewText(content: string): string {
  // Remove [[headers]] and get first ~200 chars of actual content
  const cleaned = content
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  return cleaned.substring(0, 200) + (cleaned.length > 200 ? '...' : '');
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
  const batchSize = parseInt(url.searchParams.get('batch') || '10');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    briefs_processed: 0,
    articles_created: 0,
    articles_failed: 0,
    errors: [] as string[],
  };

  // Find briefs that have enriched content but no linked article
  let query = supabase
    .from('neighborhood_briefs')
    .select(`
      id,
      neighborhood_id,
      headline,
      content,
      enriched_content,
      enriched_categories,
      generated_at,
      neighborhoods!inner(name, slug, city)
    `)
    .not('enriched_content', 'is', null)
    .order('generated_at', { ascending: false })
    .limit(batchSize);

  if (testBriefId) {
    query = query.eq('id', testBriefId);
  }

  const { data: briefs, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({
      success: false,
      error: fetchError.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }

  if (!briefs || briefs.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No briefs to process',
      ...results,
      timestamp: new Date().toISOString(),
    });
  }

  // Check which briefs already have articles
  const briefIds = briefs.map(b => b.id);
  const { data: existingArticles } = await supabase
    .from('articles')
    .select('brief_id')
    .in('brief_id', briefIds);

  const existingBriefIds = new Set((existingArticles || []).map(a => a.brief_id));

  // Process each brief that doesn't have an article yet
  for (const brief of briefs) {
    if (existingBriefIds.has(brief.id)) {
      continue; // Already has an article
    }

    try {
      results.briefs_processed++;

      const neighborhood = brief.neighborhoods as unknown as { name: string; slug: string; city: string };

      // Generate article headline
      const articleHeadline = brief.headline || `What's Happening in ${neighborhood.name}`;

      // Use enriched content as article body, with brief content as fallback
      const articleBody = brief.enriched_content || brief.content;

      if (!articleBody) {
        results.articles_failed++;
        results.errors.push(`Brief ${brief.id}: No content available`);
        continue;
      }

      // Generate slug
      const slug = generateSlug(articleHeadline, neighborhood.slug);

      // Generate preview text
      const previewText = generatePreviewText(articleBody);

      // Create the article
      const { error: insertError } = await supabase
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
          ai_model: 'grok-3-fast + gemini-3-pro',
          article_type: 'brief_summary',
          brief_id: brief.id,
          image_url: '', // Required field, can be empty
        });

      if (insertError) {
        results.articles_failed++;
        results.errors.push(`Brief ${brief.id}: ${insertError.message}`);
        continue;
      }

      results.articles_created++;

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
}
