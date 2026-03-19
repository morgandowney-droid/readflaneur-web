import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * @swagger
 * /api/syndicate/irish-briefs:
 *   get:
 *     tags: [Internal]
 *     summary: Syndicate Irish county daily briefs and Look Ahead content
 *     description: Returns enriched daily brief and Look Ahead article content for all 32 Irish counties. Secured by shared secret. Designed for consumption by yous.news.
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Date in YYYY-MM-DD format (defaults to today in Europe/Dublin timezone)
 *       - in: query
 *         name: county
 *         schema:
 *           type: string
 *         description: Single county slug to fetch (e.g. "dublin"). Omit for all 32 counties.
 *     security:
 *       - cronSecret: []
 *     responses:
 *       200:
 *         description: County brief and Look Ahead content
 *       401:
 *         description: Invalid or missing secret
 */
export async function GET(request: NextRequest) {
  // Auth: shared secret via header or query param
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;

  const providedSecret = authHeader?.replace('Bearer ', '') || querySecret;
  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Determine target date (default: today in Dublin timezone)
  const dateParam = searchParams.get('date');
  const targetDate = dateParam || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' });

  // Optional: single county filter
  const countyFilter = searchParams.get('county');

  try {
    // 1. Fetch Irish county neighborhoods
    let neighborhoodQuery = supabaseAdmin
      .from('neighborhoods')
      .select('id, name, city, country, latitude, longitude, timezone')
      .like('id', 'ie-county-%')
      .eq('is_active', true);

    if (countyFilter) {
      neighborhoodQuery = neighborhoodQuery.eq('id', `ie-county-${countyFilter}`);
    }

    const { data: neighborhoods, error: nError } = await neighborhoodQuery;
    if (nError) throw nError;
    if (!neighborhoods || neighborhoods.length === 0) {
      return NextResponse.json({ date: targetDate, counties: [], count: 0 });
    }

    const neighborhoodIds = neighborhoods.map(n => n.id);

    // 2. Fetch enriched briefs for target date
    const { data: briefs, error: bError } = await supabaseAdmin
      .from('neighborhood_briefs')
      .select('id, neighborhood_id, headline, subject_teaser, email_teaser, enriched_content, enriched_categories, model, enrichment_model, brief_date, generated_at')
      .in('neighborhood_id', neighborhoodIds)
      .eq('brief_date', targetDate)
      .not('enriched_content', 'is', null)
      .order('created_at', { ascending: false });

    // 3. Fetch brief_summary articles for target date
    const dayStart = `${targetDate}T00:00:00Z`;
    const dayEnd = `${targetDate}T23:59:59Z`;

    const { data: briefArticles, error: aError } = await supabaseAdmin
      .from('articles')
      .select('id, neighborhood_id, headline, preview_text, body_text, image_url, slug, published_at, category_label')
      .in('neighborhood_id', neighborhoodIds)
      .eq('article_type', 'brief_summary')
      .eq('status', 'published')
      .gte('published_at', dayStart)
      .lte('published_at', dayEnd)
      .order('published_at', { ascending: false });

    // 4. Fetch Look Ahead articles (48h window for timezone coverage)
    const lookAheadCutoff = new Date();
    lookAheadCutoff.setHours(lookAheadCutoff.getHours() - 48);

    const { data: lookAheadArticles, error: lError } = await supabaseAdmin
      .from('articles')
      .select('id, neighborhood_id, headline, preview_text, body_text, image_url, slug, published_at, category_label')
      .in('neighborhood_id', neighborhoodIds)
      .eq('article_type', 'look_ahead')
      .eq('status', 'published')
      .gte('published_at', lookAheadCutoff.toISOString())
      .order('published_at', { ascending: false });

    // 5. Fetch sources for all articles
    const allArticleIds = [
      ...(briefArticles || []).map(a => a.id),
      ...(lookAheadArticles || []).map(a => a.id),
    ];

    let sourcesMap: Record<string, { source_name: string; source_url: string | null }[]> = {};
    if (allArticleIds.length > 0) {
      const { data: sources } = await supabaseAdmin
        .from('article_sources')
        .select('article_id, source_name, source_url')
        .in('article_id', allArticleIds);

      if (sources) {
        for (const s of sources) {
          if (!sourcesMap[s.article_id]) sourcesMap[s.article_id] = [];
          sourcesMap[s.article_id].push({ source_name: s.source_name, source_url: s.source_url });
        }
      }
    }

    // 6. Assemble per-county response
    const counties = neighborhoods.map(n => {
      const countySlug = n.id.replace('ie-county-', '');

      // Find brief for this county (latest if multiple somehow)
      const brief = (briefs || []).find(b => b.neighborhood_id === n.id);

      // Find brief article
      const briefArticle = (briefArticles || []).find(a => a.neighborhood_id === n.id);

      // Find look-ahead article
      const lookAhead = (lookAheadArticles || []).find(a => a.neighborhood_id === n.id);

      return {
        county: countySlug,
        countyName: n.name,
        city: n.city,
        neighborhoodId: n.id,
        dailyBrief: brief ? {
          briefId: brief.id,
          headline: brief.headline,
          subjectTeaser: brief.subject_teaser,
          emailTeaser: brief.email_teaser,
          enrichedContent: brief.enriched_content,
          categories: brief.enriched_categories,
          model: brief.model,
          enrichmentModel: brief.enrichment_model,
          briefDate: brief.brief_date,
          generatedAt: brief.generated_at,
          // Article-level data (if article has been created)
          article: briefArticle ? {
            articleId: briefArticle.id,
            headline: briefArticle.headline,
            previewText: briefArticle.preview_text,
            bodyText: briefArticle.body_text,
            imageUrl: briefArticle.image_url,
            slug: briefArticle.slug,
            publishedAt: briefArticle.published_at,
            categoryLabel: briefArticle.category_label,
            sources: sourcesMap[briefArticle.id] || [],
          } : null,
        } : null,
        lookAhead: lookAhead ? {
          articleId: lookAhead.id,
          headline: lookAhead.headline,
          previewText: lookAhead.preview_text,
          bodyText: lookAhead.body_text,
          imageUrl: lookAhead.image_url,
          slug: lookAhead.slug,
          publishedAt: lookAhead.published_at,
          categoryLabel: lookAhead.category_label,
          sources: sourcesMap[lookAhead.id] || [],
        } : null,
      };
    });

    // Sort alphabetically by county name
    counties.sort((a, b) => a.countyName.localeCompare(b.countyName));

    const withBrief = counties.filter(c => c.dailyBrief !== null).length;
    const withLookAhead = counties.filter(c => c.lookAhead !== null).length;

    return NextResponse.json({
      date: targetDate,
      count: counties.length,
      coverage: {
        dailyBriefs: withBrief,
        lookAheads: withLookAhead,
      },
      counties,
    }, {
      headers: {
        'Cache-Control': 'private, max-age=300', // 5 min cache, private (secret-gated)
      },
    });

  } catch (error) {
    console.error('Syndication error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
