import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { fetchCityFeeds, RSSItem } from '@/lib/rss-sources';

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
    errors: [] as string[],
  };

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

          // Create article
          const slug = generateSlug(item.link);
          const { error: insertError } = await supabase.from('articles').insert({
            neighborhood_id: neighborhoodId,
            headline: result.rewritten_headline || item.title,
            slug,
            preview_text: result.rewritten_preview || item.description?.slice(0, 150),
            body_text: result.rewritten_body || item.description || '',
            image_url: '', // Could extract from RSS if available
            status: 'published',
            published_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            // Store source reference in editor_notes
            editor_notes: `Source: ${item.source} - ${item.link}`,
          });

          if (insertError) {
            results.errors.push(`Insert failed: ${insertError.message}`);
          } else {
            results.articles_created++;
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
