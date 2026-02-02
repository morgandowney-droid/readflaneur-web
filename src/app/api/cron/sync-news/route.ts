import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { fetchCityFeeds, RSSItem } from '@/lib/rss-sources';
import { generateGrokNewsStories, isGrokConfigured } from '@/lib/grok';

// Image generation - use local API if GEMINI_API_KEY is set, otherwise fallback to flaneur-azure
const USE_LOCAL_IMAGE_GEN = !!process.env.GEMINI_API_KEY;
const FLANEUR_API_URL = process.env.FLANEUR_API_URL || 'https://flaneur-azure.vercel.app';

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

const NEWS_SYSTEM_PROMPT = `You are The Flâneur's news curator. You determine if news articles are relevant to specific neighborhoods and rewrite them in our voice.

Your style:
- Local, informed perspective
- Focus on what matters to neighborhood residents
- No clickbait or sensationalism
- 100-200 words for rewrites`;

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
  "rewritten_headline": "Your headline (max 80 chars)" or null,
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

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
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

      // Filter to recent items only
      const recentItems = items.filter(item => {
        const pubDate = new Date(item.pubDate);
        return pubDate > oneDayAgo;
      });

      // Process each item (limit to prevent timeout)
      for (const item of recentItems.slice(0, 15)) {
        try {
          // Check if we already processed this URL
          const { data: existing } = await supabase
            .from('articles')
            .select('id')
            .eq('slug', generateSlug(item.link))
            .single();

          if (existing) {
            results.skipped_duplicate++;
            continue;
          }

          // Use AI to determine relevance and rewrite
          const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
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

          // Create article first
          const headline = result.rewritten_headline || item.title;
          const slug = generateSlug(item.link);

          const { data: insertedArticle, error: insertError } = await supabase
            .from('articles')
            .insert({
              neighborhood_id: neighborhoodId,
              headline,
              slug,
              preview_text: result.rewritten_preview || item.description?.slice(0, 150),
              body_text: result.rewritten_body || item.description || '',
              image_url: '', // Will be filled by flaneur API
              status: 'published',
              published_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              editor_notes: `Source: ${item.source} - ${item.link}`,
            })
            .select('id')
            .single();

          if (insertError) {
            results.errors.push(`Insert failed: ${insertError.message}`);
          } else {
            results.articles_created++;
            articlesPerNeighborhood[neighborhoodId] = (articlesPerNeighborhood[neighborhoodId] || 0) + 1;

            // Generate image for this article
            try {
              const imageApiUrl = USE_LOCAL_IMAGE_GEN
                ? `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/internal/generate-image`
                : `${FLANEUR_API_URL}/api/regenerate-images`;

              const imgResponse = await fetch(imageApiUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-cron-secret': cronSecret || '',
                },
                body: JSON.stringify({
                  article_id: insertedArticle.id,
                  provider: 'gemini',
                }),
              });

              if (!imgResponse.ok) {
                const imgError = await imgResponse.text();
                results.errors.push(`Image API ${imgResponse.status}: ${imgError.slice(0, 100)}`);
              }
            } catch (imgErr) {
              results.errors.push(`Image generation failed for: ${headline.slice(0, 30)}`);
            }
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
          // Create article
          const slug = `grok-${hood.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

          const { data: insertedArticle, error: insertError } = await supabase
            .from('articles')
            .insert({
              neighborhood_id: hood.id,
              headline: story.headline,
              slug,
              preview_text: story.previewText,
              body_text: story.body,
              image_url: '',
              status: 'published',
              published_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              author_type: 'ai',
              ai_model: 'grok-4.1-fast',
              editor_notes: `Generated by Grok X Search - Category: ${story.category}`,
            })
            .select('id')
            .single();

          if (insertError) {
            results.errors.push(`Grok insert failed: ${insertError.message}`);
            continue;
          }

          results.grok_articles_created++;

          // Generate image for this article
          try {
            const imageApiUrl = USE_LOCAL_IMAGE_GEN
              ? `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/internal/generate-image`
              : `${FLANEUR_API_URL}/api/regenerate-images`;

            await fetch(imageApiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-cron-secret': cronSecret || '',
              },
              body: JSON.stringify({
                article_id: insertedArticle.id,
                provider: 'gemini',
              }),
            });
          } catch {
            // Image generation failure is non-critical
          }

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
}

/**
 * Generate a URL-safe slug from a URL or title
 */
function generateSlug(input: string): string {
  // Use URL hash to create unique but consistent slug
  const hash = input.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);

  return `news-${Math.abs(hash).toString(36)}-${Date.now().toString(36)}`;
}
