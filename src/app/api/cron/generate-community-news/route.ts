import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isGrokConfigured } from '@/lib/grok';
import { enrichBriefWithGemini, EnrichedBriefOutput } from '@/lib/brief-enricher-gemini';
import { getSearchLocation } from '@/lib/neighborhood-utils';
import { getComboInfo } from '@/lib/combo-utils';
import { selectLibraryImage } from '@/lib/image-library';

interface ArticleSourceInput {
  source_name: string;
  source_type: 'publication' | 'x_user' | 'platform' | 'other';
  source_url?: string;
}

/**
 * Extract sources from Gemini enrichment response
 * Only includes URLs that appear valid (no dead links)
 */
function extractSourcesFromEnrichment(enrichResult: EnrichedBriefOutput): ArticleSourceInput[] {
  const sources: ArticleSourceInput[] = [];
  const seenSources = new Set<string>();

  for (const category of enrichResult.categories) {
    for (const story of category.stories) {
      if (story.source && story.source.name) {
        const key = story.source.name.toLowerCase();
        if (!seenSources.has(key)) {
          seenSources.add(key);

          // Determine source type based on name/url
          let sourceType: ArticleSourceInput['source_type'] = 'publication';
          if (story.source.name.startsWith('@') || story.source.url?.includes('x.com') || story.source.url?.includes('twitter.com')) {
            sourceType = 'x_user';
          }

          // Only include URL if it looks valid (not a search URL or placeholder)
          const url = story.source.url;
          const isValidUrl = url &&
            !url.includes('google.com/search') &&
            !url.includes('example.com') &&
            url.startsWith('http');

          sources.push({
            source_name: story.source.name,
            source_type: sourceType,
            source_url: isValidUrl ? url : undefined,
          });
        }
      }

      // Also check secondary source
      if (story.secondarySource && story.secondarySource.name) {
        const key = story.secondarySource.name.toLowerCase();
        if (!seenSources.has(key)) {
          seenSources.add(key);

          let sourceType: ArticleSourceInput['source_type'] = 'publication';
          if (story.secondarySource.name.startsWith('@') || story.secondarySource.url?.includes('x.com')) {
            sourceType = 'x_user';
          }

          const url = story.secondarySource.url;
          const isValidUrl = url &&
            !url.includes('google.com/search') &&
            !url.includes('example.com') &&
            url.startsWith('http');

          sources.push({
            source_name: story.secondarySource.name,
            source_type: sourceType,
            source_url: isValidUrl ? url : undefined,
          });
        }
      }
    }
  }

  // If no specific sources found, add platform-level attribution
  if (sources.length === 0) {
    sources.push({
      source_name: 'X (Twitter)',
      source_type: 'platform',
    });
    sources.push({
      source_name: 'Google News',
      source_type: 'platform',
    });
  }

  return sources;
}

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
  category: 'politics' | 'schools' | 'spaces' | 'parks' | 'police' | 'infrastructure' | 'civic';
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

  // Get expanded search location (e.g., "The Hamptons" becomes "The Hamptons or Montauk...")
  const location = getSearchLocation(neighborhoodName, city, country);

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
2. SCHOOLS: School board meetings, district news, school events, educational policy changes, PTA meetings, school construction or renovations
3. PUBLIC SPACES: Park improvements, playground renovations, dog park updates, community gardens, public plazas, waterfront access, green space initiatives, recreation programs
4. POLICE & SAFETY: Crime reports, community safety meetings, police initiatives, neighborhood watch updates
5. INFRASTRUCTURE: Road repairs, street resurfacing, pothole fixes, sidewalk construction, bike lane additions, water main work, sewer repairs, municipal construction projects, bridge work, traffic signal changes
6. CIVIC RESOURCES: Library programs, community center events, public services, sanitation updates

Only report on items with SPECIFIC details (names, dates, locations). Skip generic or national news.
If you can't find recent news for a category, skip it entirely.`
          },
          {
            role: 'user',
            content: `Search for community and civic news from ${location} in the past 7 days.

For each newsworthy item found, provide:
- CATEGORY: politics, schools, spaces, police, infrastructure, or civic
- HEADLINE: Specific, informative headline (max 80 chars)
- CONTENT: 2-3 paragraph summary with specific details, dates, names

Categories explained:
- politics: government meetings, elections, zoning, budgets
- schools: school board, education news, school construction
- spaces: parks, playgrounds, dog parks, public plazas, green spaces
- police: crime, safety, neighborhood watch
- infrastructure: road repairs, construction, sidewalks, bike lanes, utilities
- civic: libraries, community centers, sanitation, other public services

Format each item as:
---
CATEGORY: [category]
HEADLINE: [headline]
CONTENT:
[content paragraphs]
---

Return up to 7 items total. If no relevant local news is found, return: NO_NEWS_FOUND`
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
      const categoryMatch = item.match(/CATEGORY:\s*(politics|schools|spaces|parks|police|infrastructure|civic)/i);
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


function getCategorySectionHeader(category: string): string {
  switch (category) {
    case 'politics': return 'Civic & Politics';
    case 'schools': return 'Schools & Education';
    case 'spaces': return 'Parks & Public Spaces';
    case 'parks': return 'Parks & Public Spaces'; // legacy category
    case 'police': return 'Police & Safety';
    case 'infrastructure': return 'Roads & Infrastructure';
    case 'civic': return 'Community Updates';
    default: return 'Local News';
  }
}

/**
 * Combine multiple briefs into a single structured content block
 * with section headers for each category
 */
function combineBriefsIntoContent(briefs: CommunityBrief[]): string {
  // Group briefs by category
  const byCategory = new Map<string, CommunityBrief[]>();
  for (const brief of briefs) {
    if (!byCategory.has(brief.category)) {
      byCategory.set(brief.category, []);
    }
    byCategory.get(brief.category)!.push(brief);
  }

  // Build combined content with section headers
  const sections: string[] = [];

  // Order categories logically
  const categoryOrder = ['police', 'politics', 'infrastructure', 'spaces', 'parks', 'schools', 'civic'];

  for (const category of categoryOrder) {
    const categoryBriefs = byCategory.get(category);
    if (categoryBriefs && categoryBriefs.length > 0) {
      const header = getCategorySectionHeader(category);
      sections.push(`[[${header}]]`);

      for (const brief of categoryBriefs) {
        sections.push(`**${brief.headline}**\n${brief.content}`);
      }
    }
  }

  return sections.join('\n\n');
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
    .select('id, name, city, country, is_combo')
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

      // Skip if we already have a community recap this week for this neighborhood
      const existingHeadlines = existingByNeighborhood.get(hood.id);
      if (existingHeadlines?.has(`${hood.name} weekly community recap`.toLowerCase())) {
        continue;
      }

      // For combo neighborhoods, use component names for search
      let searchName = hood.name;
      if (hood.is_combo) {
        const comboInfo = await getComboInfo(supabase, hood.id);
        if (comboInfo && comboInfo.components.length > 0) {
          // Use component names: "Dumbo, Cobble Hill, Park Slope"
          searchName = comboInfo.components.map(c => c.name).join(', ');
        }
      }

      // Generate community news with Grok
      const briefs = await generateCommunityNews(searchName, hood.city, hood.country);

      if (!briefs || briefs.length === 0) {
        results.no_news_found++;
        continue;
      }

      results.briefs_generated += briefs.length;

      try {
        // Combine all briefs into one structured content block
        const combinedContent = combineBriefsIntoContent(briefs);

        // Optionally enrich with Gemini using weekly_recap style
        let enrichedContent = combinedContent;
        let enrichmentModel = null;
        let extractedSources: ArticleSourceInput[] = [];

        if (!skipEnrichment && process.env.GEMINI_API_KEY) {
          try {
            const enrichResult = await enrichBriefWithGemini(
              combinedContent,
              hood.name,
              hood.id,
              hood.city,
              hood.country,
              { articleType: 'weekly_recap' }
            );
            if (enrichResult.rawResponse) {
              enrichedContent = enrichResult.rawResponse;
              enrichmentModel = enrichResult.model;
            }
            // Extract sources from enrichment
            extractedSources = extractSourcesFromEnrichment(enrichResult);
          } catch (enrichErr) {
            // Continue with unenriched content
            console.error(`Enrichment failed for ${hood.name}:`, enrichErr);
          }
        }

        // If no enrichment or no sources found, add default platform sources
        if (extractedSources.length === 0) {
          extractedSources = [
            { source_name: 'X (Twitter)', source_type: 'platform' },
            { source_name: 'Web Search', source_type: 'platform' },
          ];
        }

        // Generate headline for the combined recap
        const headline = `${hood.name} Weekly Community Recap`;

        // Generate preview text from first brief
        const previewText = briefs[0].content.substring(0, 200) + '...';

        // Generate slug
        const slug = generateSlug(headline, hood.id);

        // Create the single combined article
        const { data: insertedArticle, error: insertError } = await supabase
          .from('articles')
          .insert({
            neighborhood_id: hood.id,
            headline: headline,
            body_text: enrichedContent,
            preview_text: previewText,
            slug,
            status: 'published',
            published_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: enrichmentModel ? `grok-4-1-fast + ${enrichmentModel}` : 'grok-4-1-fast',
            article_type: 'community_news',
            category_label: 'Weekly Community Recap',
            image_url: selectLibraryImage(hood.id, 'community_news'),
          })
          .select('id')
          .single();

        if (insertError) {
          results.articles_failed++;
          results.errors.push(`${hood.name}: ${insertError.message}`);
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

        // Image set via selectLibraryImage() at insert time

        // Track this headline to avoid duplicates in same run
        if (!existingByNeighborhood.has(hood.id)) {
          existingByNeighborhood.set(hood.id, new Set());
        }
        existingByNeighborhood.get(hood.id)!.add(headline.toLowerCase());

      } catch (err) {
        results.articles_failed++;
        results.errors.push(`${hood.name}: ${err instanceof Error ? err.message : String(err)}`);
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
