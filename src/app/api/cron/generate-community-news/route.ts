import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isGrokConfigured } from '@/lib/grok';
import { enrichBriefWithGemini } from '@/lib/brief-enricher-gemini';

/**
 * Community News Generator
 *
 * Generates weekly community news articles covering:
 * - Local politics (elections, council meetings, proposed/actual policy changes)
 * - School updates (board meetings, events, changes)
 * - Parks & recreation news
 * - Police/safety updates (crime blotter, community safety)
 * - Other civic resources (library, community centers, etc.)
 *
 * Uses Grok with web/X search to find recent community news,
 * then enriches with Gemini for sources and structure.
 *
 * Schedule: 0 5 * * 1 (Every Monday at 5 AM UTC)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const GROK_API_URL = 'https://api.x.ai/v1';
const GROK_MODEL = 'grok-4-1-fast';

interface CommunityBrief {
  headline: string;
  content: string;
  category: 'politics' | 'schools' | 'parks' | 'police' | 'civic';
}

async function generateCommunityNews(
  neighborhoodName: string,
  city: string,
  country: string
): Promise<CommunityBrief[] | null> {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const location = `${neighborhoodName}, ${city}, ${country}`;

  try {
    const response = await fetch(`${GROK_API_URL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        input: [
          {
            role: 'system',
            content: `You are a local civic reporter for The Flâneur covering ${location}. Search X and the web for recent community news from the past week.

Focus on finding:
1. LOCAL POLITICS: City council/community board meetings, elections, proposed ordinances, zoning changes, tax proposals, budget decisions
2. SCHOOLS: School board meetings, district news, school events, educational policy changes
3. PARKS & RECREATION: Park improvements, community events, recreation programs, environmental initiatives
4. POLICE & SAFETY: Crime reports, community safety meetings, police initiatives, neighborhood watch updates
5. CIVIC RESOURCES: Library programs, community center events, public services, infrastructure updates

Only report on items with SPECIFIC details (names, dates, locations). Skip generic or national news.
If you can't find recent news for a category, skip it entirely.`
          },
          {
            role: 'user',
            content: `Search for community and civic news from ${location} in the past 7 days.

For each newsworthy item found, provide:
- CATEGORY: politics, schools, parks, police, or civic
- HEADLINE: Specific, informative headline (max 80 chars)
- CONTENT: 2-3 paragraph summary with specific details, dates, names

Format each item as:
---
CATEGORY: [category]
HEADLINE: [headline]
CONTENT:
[content paragraphs]
---

Return up to 5 items total. If no relevant local news is found, return: NO_NEWS_FOUND`
          }
        ],
        tools: [
          { type: 'x_search' },
          { type: 'web_search' }
        ],
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Grok community news failed:', response.status, error);
      return null;
    }

    const data = await response.json();

    // Extract response text
    let responseText = '';
    if (data.output && Array.isArray(data.output)) {
      const assistantOutput = data.output.find((o: { type?: string; role?: string; content?: unknown }) =>
        o.type === 'message' && o.role === 'assistant'
      );
      const content = assistantOutput?.content;
      responseText = typeof content === 'string' ? content :
                     Array.isArray(content) ? content.map((c: { text?: string }) => c.text || '').join('') :
                     JSON.stringify(content);
    }

    if (!responseText || responseText.includes('NO_NEWS_FOUND')) {
      return [];
    }

    // Parse the response into structured briefs
    const briefs: CommunityBrief[] = [];
    const items = responseText.split('---').filter(item => item.trim());

    for (const item of items) {
      const categoryMatch = item.match(/CATEGORY:\s*(politics|schools|parks|police|civic)/i);
      const headlineMatch = item.match(/HEADLINE:\s*(.+?)(?:\n|CONTENT:)/i);
      const contentMatch = item.match(/CONTENT:\s*([\s\S]+?)(?:---|$)/i);

      if (categoryMatch && headlineMatch && contentMatch) {
        briefs.push({
          category: categoryMatch[1].toLowerCase() as CommunityBrief['category'],
          headline: headlineMatch[1].trim(),
          content: contentMatch[1].trim(),
        });
      }
    }

    return briefs;
  } catch (error) {
    console.error('Community news generation error:', error);
    return null;
  }
}

function generateSlug(headline: string, neighborhoodSlug: string): string {
  const date = new Date().toISOString().split('T')[0];
  const headlineSlug = headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 40);
  return `${neighborhoodSlug}-community-${date}-${headlineSlug}`;
}


function getCategoryLabel(category: string): string {
  switch (category) {
    case 'politics': return 'Weekly Civic Recap';
    case 'schools': return 'Weekly Schools Recap';
    case 'parks': return 'Weekly Parks Recap';
    case 'police': return 'Weekly Police Recap';
    case 'civic': return 'Weekly Community Recap';
    default: return 'Weekly Recap';
  }
}

export async function GET(request: Request) {
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
  const testNeighborhoodId = url.searchParams.get('test');
  const skipEnrichment = url.searchParams.get('skipEnrich') === 'true';
  const batchSize = parseInt(url.searchParams.get('batch') || '10');

  if (!isGrokConfigured()) {
    return NextResponse.json({
      success: false,
      error: 'Grok API not configured',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    neighborhoods_processed: 0,
    briefs_generated: 0,
    articles_created: 0,
    articles_failed: 0,
    no_news_found: 0,
    errors: [] as string[],
  };

  // Get active neighborhoods (id is used as slug)
  let query = supabase
    .from('neighborhoods')
    .select('id, name, city, country')
    .eq('is_active', true)
    .order('name')
    .limit(batchSize);

  if (testNeighborhoodId) {
    query = query.eq('id', testNeighborhoodId);
  }

  const { data: neighborhoods, error: fetchError } = await query;

  if (fetchError || !neighborhoods) {
    return NextResponse.json({
      success: false,
      error: fetchError?.message || 'Failed to fetch neighborhoods',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }

  // Check for existing community news articles this week to avoid duplicates
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const { data: existingArticles } = await supabase
    .from('articles')
    .select('neighborhood_id, headline')
    .eq('article_type', 'community_news')
    .gte('published_at', oneWeekAgo.toISOString());

  const existingByNeighborhood = new Map<string, Set<string>>();
  for (const article of existingArticles || []) {
    if (!existingByNeighborhood.has(article.neighborhood_id)) {
      existingByNeighborhood.set(article.neighborhood_id, new Set());
    }
    existingByNeighborhood.get(article.neighborhood_id)!.add(article.headline.toLowerCase());
  }

  for (const hood of neighborhoods) {
    try {
      results.neighborhoods_processed++;

      // Generate community news with Grok
      const briefs = await generateCommunityNews(hood.name, hood.city, hood.country);

      if (!briefs || briefs.length === 0) {
        results.no_news_found++;
        continue;
      }

      results.briefs_generated += briefs.length;

      // Process each brief
      for (const brief of briefs) {
        // Skip if we already have a similar article this week
        const existingHeadlines = existingByNeighborhood.get(hood.id);
        if (existingHeadlines?.has(brief.headline.toLowerCase())) {
          continue;
        }

        try {
          // Optionally enrich with Gemini
          let enrichedContent = brief.content;
          let enrichmentModel = null;

          if (!skipEnrichment && process.env.GEMINI_API_KEY) {
            try {
              const enrichResult = await enrichBriefWithGemini(
                brief.content,
                hood.name,
                hood.id,
                hood.city,
                hood.country
              );
              if (enrichResult.rawResponse) {
                enrichedContent = enrichResult.rawResponse;
                enrichmentModel = enrichResult.model;
              }
            } catch (enrichErr) {
              // Continue with unenriched content
              console.error(`Enrichment failed for ${hood.name}:`, enrichErr);
            }
          }

          // Get category label for UI
          const categoryLabel = getCategoryLabel(brief.category);

          // Generate slug
          const slug = generateSlug(brief.headline, hood.id);

          // Create the article
          const { data: insertedArticle, error: insertError } = await supabase
            .from('articles')
            .insert({
              neighborhood_id: hood.id,
              headline: brief.headline,
              body_text: enrichedContent,
              preview_text: brief.content.substring(0, 200) + '...',
              slug,
              status: 'published',
              published_at: new Date().toISOString(),
              author_type: 'ai',
              ai_model: enrichmentModel ? `grok-3-fast + ${enrichmentModel}` : 'grok-3-fast',
              article_type: 'community_news',
              category_label: categoryLabel,
              image_url: '',
            })
            .select('id')
            .single();

          if (insertError) {
            results.articles_failed++;
            results.errors.push(`${hood.name} - ${brief.category}: ${insertError.message}`);
            continue;
          }

          results.articles_created++;

          // Generate image
          try {
            const baseUrl = process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

            await fetch(`${baseUrl}/api/internal/generate-image`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-cron-secret': cronSecret || '',
              },
              body: JSON.stringify({
                article_id: insertedArticle.id,
              }),
            });
          } catch {
            // Image generation is best-effort
          }

          // Track this headline to avoid duplicates in same run
          if (!existingByNeighborhood.has(hood.id)) {
            existingByNeighborhood.set(hood.id, new Set());
          }
          existingByNeighborhood.get(hood.id)!.add(brief.headline.toLowerCase());

        } catch (err) {
          results.articles_failed++;
          results.errors.push(`${hood.name} - ${brief.category}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Rate limiting between neighborhoods
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (err) {
      results.errors.push(`${hood.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    success: results.articles_created > 0 || results.no_news_found === results.neighborhoods_processed,
    ...results,
    timestamp: new Date().toISOString(),
  });
}
