import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { fetchCityFeeds, RSSItem } from '@/lib/rss-sources';
import { generateGrokNewsStories, isGrokConfigured } from '@/lib/grok';
import { AI_MODELS } from '@/config/ai-models';
import { selectLibraryImage, getLibraryReadyIds, preloadUnsplashCache } from '@/lib/image-library';

/**
 * News Aggregation Cron Job
 *
 * Runs every 6 hours to fetch local news from RSS feeds,
 * filter for neighborhood relevance, and create articles.
 *
 * Schedule: 0 *\/6 * * * (every 6 hours)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const NEWS_SYSTEM_PROMPT = `You are a well-travelled, successful 35-year-old who has lived in the neighborhood for years. You know every corner - the hidden gems, the local drama, the new openings before anyone else does. You determine if news articles are relevant to specific neighborhoods and rewrite them in our voice.

Your style:
- Write as a knowledgeable insider and long-time resident, never as a tourist or outsider
- You drop specific details that only a local would know (exact addresses, which corner, who owns what)
- Present information conversationally, like telling a friend what's happening in the neighborhood
- Focus on what matters to neighborhood residents
- No clickbait or sensationalism
- 100-200 words for rewrites
- Do NOT use lowbrow or overly casual words like "ya", "folks", "eats", "grub", "spot" (for restaurant)
- The reader is well-educated and prefers polished language without slang
- Never use em dashes. Use commas, periods, or hyphens (-) instead.
- IMPORTANT: If the source article uses first-person language ("we", "us", "our") because it was written by the business/organization itself, replace ALL first-person references with the actual entity name. For example, "We are seeking new members" becomes "Bukowskis is seeking new members." Never let the original source's first-person voice bleed through.
- Never explain what a neighborhood "is" or describe it to outsiders. Assume the reader lives there and knows it intimately.
- DATE REFERENCES: When using relative time words (yesterday, today, tomorrow, Thursday, last week, etc.), ALWAYS include the explicit calendar date - e.g., "yesterday (February 19)", "this Thursday, February 20". Readers may see this days later, so relative references alone are confusing.`;

const FILTER_NEWS_PROMPT = (
  item: RSSItem,
  neighborhoods: { id: string; name: string }[]
) => `Evaluate this news article for neighborhood relevance:

TITLE: ${item.title}
SOURCE: ${item.source}
CITY: ${item.city}
EXCERPT: ${item.description?.slice(0, 300) || 'No description'}

NEIGHBORHOODS IN THIS CITY:
${neighborhoods.map(n => `- ${n.name} (${n.id})`).join('\n')}

Return JSON:
{
  "is_relevant": true/false,
  "neighborhood_id": "the-neighborhood-id" or null (if relevant to specific neighborhood),
  "relevance_reason": "brief explanation",
  "rewritten_headline": "Your headline (max 50 chars, punchy and specific)" or null,
  "rewritten_preview": "Your preview (max 150 chars)" or null,
  "rewritten_body": "Your article body (100-200 words, markdown)" or null,
  "confidence": 0.0-1.0
}

Relevance criteria:
- Mentions a specific neighborhood by name
- About a business/venue opening or closing in the area
- Local event or cultural happening
- Real estate/development news for the area
- NOT relevant: city-wide policy, sports, national news`;

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const libraryReadyIds = await getLibraryReadyIds(supabase);
  await preloadUnsplashCache(supabase);
  const startedAt = new Date().toISOString();

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    // Log to cron_executions so monitoring can see the failure
    await supabase.from('cron_executions').insert({
      job_name: 'sync-news',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: false,
      articles_created: 0,
      errors: ['ANTHROPIC_API_KEY not configured'],
      response_data: { dry_run: true },
    }).then(null, (e: unknown) => console.error('Failed to log cron execution:', e));

    return NextResponse.json({
      success: false,
      error: 'ANTHROPIC_API_KEY not configured',
      dry_run: true,
    });
  }

  const anthropic = new Anthropic({ apiKey: anthropicApiKey });
  const results = {
    cities_processed: 0,
    articles_fetched: 0,
    articles_created: 0,
    skipped_irrelevant: 0,
    skipped_duplicate: 0,
    grok_articles_created: 0,
    grok_neighborhoods_filled: 0,
    errors: [] as string[],
  };

  // Track articles created per neighborhood for Grok fallback
  const articlesPerNeighborhood: Record<string, number> = {};

  try {
  // Get time threshold (last 24 hours)
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  // Get all active neighborhoods grouped by city
  const { data: neighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, name, city')
    .eq('is_active', true);

  if (!neighborhoods || neighborhoods.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No active neighborhoods',
      ...results,
    });
  }

  // Group neighborhoods by city
  const neighborhoodsByCity: Record<string, { id: string; name: string }[]> = {};
  for (const n of neighborhoods) {
    if (!neighborhoodsByCity[n.city]) neighborhoodsByCity[n.city] = [];
    neighborhoodsByCity[n.city].push({ id: n.id, name: n.name });
  }

  // Process each city
  for (const [city, cityNeighborhoods] of Object.entries(neighborhoodsByCity)) {
    try {
      // Fetch RSS feeds for this city
      const items = await fetchCityFeeds(city);
      results.articles_fetched += items.length;

      // Update RSS source tracking - mark all feeds for this city as fetched (fire-and-forget)
      supabase
        .from('rss_sources')
        .update({ last_fetched_at: new Date().toISOString() })
        .eq('city', city)
        .eq('is_active', true)
        .then(null, () => {});

      // Filter to recent items only
      const recentItems = items.filter(item => {
        const pubDate = new Date(item.pubDate);
        return pubDate > oneDayAgo;
      });

      // Process each item (limit to prevent timeout)
      for (const item of recentItems.slice(0, 15)) {
        try {
          // Check if we already processed this URL (slug is deterministic on source URL)
          const slug = generateSlug(item.link);
          const { data: existingBySlug } = await supabase
            .from('articles')
            .select('id')
            .eq('slug', slug)
            .single();

          if (existingBySlug) {
            results.skipped_duplicate++;
            continue;
          }

          // Also check editor_notes for the source URL (catches old non-deterministic slugs)
          const { data: existingByUrl } = await supabase
            .from('articles')
            .select('id')
            .eq('neighborhood_id', cityNeighborhoods[0]?.id || '')
            .ilike('editor_notes', `%${item.link}%`)
            .limit(1);

          if (existingByUrl && existingByUrl.length > 0) {
            results.skipped_duplicate++;
            continue;
          }

          // Use AI to determine relevance and rewrite
          const message = await anthropic.messages.create({
            model: AI_MODELS.CLAUDE_SONNET,
            max_tokens: 800,
            system: NEWS_SYSTEM_PROMPT,
            messages: [{
              role: 'user',
              content: FILTER_NEWS_PROMPT(item, cityNeighborhoods),
            }],
          });

          const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

          let result;
          try {
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
            const jsonStr = jsonMatch[1]?.trim() || responseText;
            result = JSON.parse(jsonStr);
          } catch {
            results.errors.push(`Failed to parse AI response for: ${item.title.slice(0, 50)}`);
            continue;
          }

          if (!result.is_relevant || result.confidence < 0.7) {
            results.skipped_irrelevant++;
            continue;
          }

          // Determine neighborhood (use first in city if not specific)
          const neighborhoodId = result.neighborhood_id || cityNeighborhoods[0]?.id;
          if (!neighborhoodId) continue;

          // Create article
          const headline = result.rewritten_headline || item.title;

          const { data: insertedArticle, error: insertError } = await supabase
            .from('articles')
            .insert({
              neighborhood_id: neighborhoodId,
              headline,
              slug,
              preview_text: result.rewritten_preview || item.description?.slice(0, 150),
              body_text: result.rewritten_body || item.description || '',
              image_url: selectLibraryImage(neighborhoodId, 'standard', undefined, libraryReadyIds),
              status: 'published',
              published_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              author_type: 'ai',
              ai_model: 'claude-sonnet-4-5',
              category_label: 'News Brief',
              editor_notes: `Source: ${item.source} - ${item.link}`,
              enriched_at: new Date().toISOString(),
              enrichment_model: 'claude-sonnet-4-5',
            })
            .select('id')
            .single();

          if (insertError) {
            results.errors.push(`Insert failed: ${insertError.message}`);
          } else {
            results.articles_created++;
            articlesPerNeighborhood[neighborhoodId] = (articlesPerNeighborhood[neighborhoodId] || 0) + 1;

            // Save original RSS source to article_sources table
            if (item.source && item.link) {
              await supabase
                .from('article_sources')
                .insert({
                  article_id: insertedArticle.id,
                  source_name: item.source,
                  source_type: 'publication',
                  source_url: item.link,
                })
                .then(null, (err: unknown) => console.error('Failed to save RSS source:', err));
            }

            // Image set via selectLibraryImage() at insert time
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          results.errors.push(`Item error: ${err}`);
        }
      }

      results.cities_processed++;
    } catch (err) {
      results.errors.push(`City ${city}: ${err}`);
    }
  }

  // ========================================
  // GROK FALLBACK: Fill neighborhoods with low article count
  // ========================================
  const MIN_ARTICLES_PER_NEIGHBORHOOD = 5;
  const MAX_GROK_ARTICLES = 10; // Max articles to generate per neighborhood

  if (isGrokConfigured()) {
    // Get today's article count per neighborhood from database
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayArticles } = await supabase
      .from('articles')
      .select('neighborhood_id')
      .gte('created_at', todayStart.toISOString())
      .eq('status', 'published');

    // Count existing articles per neighborhood
    const dbArticleCounts: Record<string, number> = {};
    for (const article of todayArticles || []) {
      if (article.neighborhood_id) {
        dbArticleCounts[article.neighborhood_id] = (dbArticleCounts[article.neighborhood_id] || 0) + 1;
      }
    }

    // Merge with articles created this run
    for (const [nId, count] of Object.entries(articlesPerNeighborhood)) {
      dbArticleCounts[nId] = (dbArticleCounts[nId] || 0) + count;
    }

    // Find neighborhoods that need more content
    const neighborhoodsNeedingContent = neighborhoods.filter(n => {
      const count = dbArticleCounts[n.id] || 0;
      return count < MIN_ARTICLES_PER_NEIGHBORHOOD;
    });

    // Generate Grok articles for neighborhoods with low content
    for (const hood of neighborhoodsNeedingContent.slice(0, 10)) { // Limit to prevent timeout
      const currentCount = dbArticleCounts[hood.id] || 0;
      const needed = Math.min(MAX_GROK_ARTICLES, MIN_ARTICLES_PER_NEIGHBORHOOD - currentCount);

      if (needed <= 0) continue;

      try {
        // Get neighborhood details
        const { data: hoodDetails } = await supabase
          .from('neighborhoods')
          .select('name, city, country')
          .eq('id', hood.id)
          .single();

        if (!hoodDetails) continue;

        // Generate stories using Grok
        const stories = await generateGrokNewsStories(
          hoodDetails.name,
          hoodDetails.city,
          hoodDetails.country,
          needed
        );

        for (const story of stories) {
          // Dedup: check for similar headline in this neighborhood from last 24h
          const { data: similarArticle } = await supabase
            .from('articles')
            .select('id')
            .eq('neighborhood_id', hood.id)
            .ilike('headline', `%${story.headline.slice(0, 40).replace(/[%_]/g, '')}%`)
            .gte('created_at', oneDayAgo.toISOString())
            .limit(1);

          if (similarArticle && similarArticle.length > 0) {
            results.skipped_duplicate++;
            continue;
          }

          // Deterministic slug from neighborhood + headline hash
          const grokHash = story.headline.split('').reduce((acc: number, c: string) => ((acc << 5) + acc + c.charCodeAt(0)) | 0, 5381);
          const slug = `grok-${hood.id}-${Math.abs(grokHash).toString(36)}`;

          const { data: insertedArticle, error: insertError } = await supabase
            .from('articles')
            .insert({
              neighborhood_id: hood.id,
              headline: story.headline,
              slug,
              preview_text: story.previewText,
              body_text: story.body,
              image_url: selectLibraryImage(hood.id, 'standard', undefined, libraryReadyIds),
              status: 'published',
              published_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              author_type: 'ai',
              ai_model: 'grok-4.1-fast',
              editor_notes: `Generated by Grok X Search - Category: ${story.category}`,
              enriched_at: new Date().toISOString(),
              enrichment_model: 'grok-4.1-fast',
            })
            .select('id')
            .single();

          if (insertError) {
            results.errors.push(`Grok insert failed: ${insertError.message}`);
            continue;
          }

          results.grok_articles_created++;

          // Image set via selectLibraryImage() at insert time

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (stories.length > 0) {
          results.grok_neighborhoods_filled++;
        }

      } catch (err) {
        results.errors.push(`Grok fallback for ${hood.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    timestamp: new Date().toISOString(),
  });

  } finally {
    // Always log cron execution for monitoring
    const totalCreated = results.articles_created + results.grok_articles_created;
    await supabase.from('cron_executions').insert({
      job_name: 'sync-news',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: results.errors.length === 0 || totalCreated > 0,
      articles_created: totalCreated,
      errors: results.errors.length > 0 ? results.errors.slice(0, 10) : null,
      response_data: {
        cities_processed: results.cities_processed,
        articles_fetched: results.articles_fetched,
        articles_created: results.articles_created,
        grok_articles_created: results.grok_articles_created,
        grok_neighborhoods_filled: results.grok_neighborhoods_filled,
        skipped_irrelevant: results.skipped_irrelevant,
        skipped_duplicate: results.skipped_duplicate,
      },
    }).then(null, (e: unknown) => console.error('Failed to log cron execution:', e));
  }
}

/**
 * Generate a deterministic URL-safe slug from a URL.
 * Must be stable across calls so dedup lookup finds existing articles.
 */
function generateSlug(input: string): string {
  // djb2 hash - deterministic for the same input
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return `news-${Math.abs(hash).toString(36)}`;
}
