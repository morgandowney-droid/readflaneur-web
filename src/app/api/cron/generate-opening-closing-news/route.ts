import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateWithGrok, isGrokConfigured } from '@/lib/grok';

/**
 * Opening & Closing News Generator
 *
 * Runs daily after sync-guides to generate individual news articles
 * for notable openings and closings detected in the last 24 hours.
 *
 * Sources:
 * 1. Google Places sync: Places discovered/closed in guide_listings
 * 2. Daily briefs: Extract opening/closing mentions from neighborhood briefs
 *
 * Criteria:
 * - Openings: Any new place discovered (no rating filter - new places won't have ratings yet)
 * - Closings: Places with google_rating >= 4.0 that closed
 * - Brief mentions: Openings/closings mentioned in daily neighborhood briefs
 *
 * Schedule: 0 4 * * * (4 AM UTC, 1 hour after sync-guides at 3 AM)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

interface PlaceInfo {
  id: string;
  name: string;
  category_name: string;
  address: string | null;
  google_rating: number | null;
  google_reviews_count: number | null;
  neighborhood_id: string;
  neighborhood_name: string;
  neighborhood_slug: string;
  city: string;
}

function generateSlug(headline: string): string {
  const date = new Date().toISOString().split('T')[0];
  const headlineSlug = headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  return `news-${date}-${headlineSlug}`;
}

async function generateOpeningArticle(place: PlaceInfo): Promise<{
  headline: string;
  body: string;
  preview: string;
} | null> {
  const prompt = `Write a brief, engaging news article about a new business opening in ${place.neighborhood_name}, ${place.city}.

BUSINESS DETAILS:
- Name: ${place.name}
- Type: ${place.category_name}
- Address: ${place.address || 'Address not available'}
${place.google_rating ? `- Google Rating: ${place.google_rating} stars (${place.google_reviews_count} reviews)` : '- New, not yet rated'}

Search the web for any additional information about "${place.name}" in ${place.city} - their specialty, history, owner background, what makes them unique.

Write in the style of a local news correspondent - warm, informative, welcoming the new business to the neighborhood. Keep it factual but engaging. 150-250 words.

Return JSON format:
{
  "headline": "Short, catchy headline (max 70 chars)",
  "body": "Article body in markdown (use **bold** for emphasis)",
  "preview": "One sentence teaser (max 150 chars)"
}`;

  const response = await generateWithGrok(prompt, {
    systemPrompt: `You are a local news correspondent for The Flâneur, covering neighborhood openings and closings. You write warm, factual, engaging short articles. Always return valid JSON.`,
    enableSearch: true,
  });

  if (!response) return null;

  try {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
    const jsonStr = jsonMatch[1]?.trim() || response;
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

interface BriefMention {
  name: string;
  type: 'opening' | 'closing';
  description: string;
  neighborhood_id: string;
  neighborhood_name: string;
  city: string;
  brief_id: string;
}

/**
 * Extract opening/closing mentions from a neighborhood brief
 */
async function extractMentionsFromBrief(
  briefContent: string,
  neighborhoodName: string,
  neighborhoodId: string,
  city: string,
  briefId: string
): Promise<BriefMention[]> {
  const prompt = `Analyze this neighborhood brief and extract any mentions of businesses opening or closing.

BRIEF CONTENT:
${briefContent}

Look for:
- New restaurants, cafes, bars, shops opening
- Businesses closing, shutting down, or saying goodbye
- "Just opened", "now open", "grand opening"
- "Closing", "closed", "shuttering", "farewell", "last day"

Return JSON array (empty if no mentions):
[
  {
    "name": "Business Name",
    "type": "opening" or "closing",
    "description": "Brief description from the text"
  }
]

Only include SPECIFIC business names mentioned. Do not include generic references.
Return empty array [] if no specific openings/closings are mentioned.`;

  const response = await generateWithGrok(prompt, {
    systemPrompt: 'You extract structured data from text. Return only valid JSON arrays.',
    enableSearch: false,
    temperature: 0.3,
  });

  if (!response) return [];

  try {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
    const jsonStr = jsonMatch[1]?.trim() || response;
    const mentions = JSON.parse(jsonStr);

    if (!Array.isArray(mentions)) return [];

    return mentions.map((m: { name: string; type: string; description: string }) => ({
      name: m.name,
      type: m.type as 'opening' | 'closing',
      description: m.description,
      neighborhood_id: neighborhoodId,
      neighborhood_name: neighborhoodName,
      city,
      brief_id: briefId,
    }));
  } catch {
    return [];
  }
}

/**
 * Generate article for a business mention from a brief
 */
async function generateMentionArticle(mention: BriefMention): Promise<{
  headline: string;
  body: string;
  preview: string;
} | null> {
  const typeLabel = mention.type === 'opening' ? 'new business opening' : 'business closure';
  const prompt = `Write a brief, engaging news article about a ${typeLabel} in ${mention.neighborhood_name}, ${mention.city}.

FROM THE LOCAL BRIEF:
"${mention.description}"

Business name: ${mention.name}

Search the web for more information about "${mention.name}" in ${mention.city} to add context.

Write in the style of a local news correspondent. Keep it factual but engaging. 150-250 words.

Return JSON format:
{
  "headline": "Short, catchy headline (max 70 chars)",
  "body": "Article body in markdown (use **bold** for emphasis)",
  "preview": "One sentence teaser (max 150 chars)"
}`;

  const response = await generateWithGrok(prompt, {
    systemPrompt: `You are a local news correspondent for The Flâneur, covering neighborhood openings and closings. You write warm, factual, engaging short articles. Always return valid JSON.`,
    enableSearch: true,
  });

  if (!response) return null;

  try {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
    const jsonStr = jsonMatch[1]?.trim() || response;
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

async function generateClosingArticle(place: PlaceInfo): Promise<{
  headline: string;
  body: string;
  preview: string;
} | null> {
  const prompt = `Write a brief, respectful news article about a business closure in ${place.neighborhood_name}, ${place.city}.

BUSINESS DETAILS:
- Name: ${place.name}
- Type: ${place.category_name}
- Address: ${place.address || 'Address not available'}
- Google Rating: ${place.google_rating} stars (${place.google_reviews_count} reviews)

Search the web for any information about why "${place.name}" closed, how long they operated, community reactions, or what made them special to the neighborhood.

Write in the style of a local news correspondent - respectful of the closure, acknowledging what the business meant to the neighborhood. Keep it factual and tasteful. 150-250 words.

Return JSON format:
{
  "headline": "Short headline (max 70 chars, avoid overly negative tone)",
  "body": "Article body in markdown (use **bold** for emphasis)",
  "preview": "One sentence teaser (max 150 chars)"
}`;

  const response = await generateWithGrok(prompt, {
    systemPrompt: `You are a local news correspondent for The Flâneur, covering neighborhood openings and closings. You write respectful, factual articles about closures - acknowledging what businesses meant to communities. Always return valid JSON.`,
    enableSearch: true,
  });

  if (!response) return null;

  try {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
    const jsonStr = jsonMatch[1]?.trim() || response;
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
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

  // Support query params for testing
  const url = new URL(request.url);
  const testPlaceId = url.searchParams.get('test');
  const testType = url.searchParams.get('type') as 'opening' | 'closing' | null;
  const hoursBack = parseInt(url.searchParams.get('hours') || '24');
  const batchSize = parseInt(url.searchParams.get('batch') || '10');

  // Check if Grok is configured
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
    openings_found: 0,
    closings_found: 0,
    brief_mentions_found: 0,
    articles_created: 0,
    articles_failed: 0,
    images_generated: 0,
    errors: [] as string[],
  };

  // Get date range
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursBack);
  const cutoffISO = cutoffDate.toISOString();

  // Get category names
  const { data: categories } = await supabase
    .from('guide_categories')
    .select('id, name');
  const categoryMap = new Map(categories?.map(c => [c.id, c.name]) || []);

  // ============================================
  // FIND NEW OPENINGS (last 24 hours)
  // ============================================
  let openingsQuery = supabase
    .from('guide_listings')
    .select(`
      id, name, category_id, address, google_rating, google_reviews_count, neighborhood_id,
      neighborhoods!inner(name, slug, city, seeded_at)
    `)
    .eq('is_active', true)
    .gte('discovered_at', cutoffISO)
    .order('discovered_at', { ascending: false })
    .limit(batchSize);

  if (testPlaceId && testType === 'opening') {
    openingsQuery = supabase
      .from('guide_listings')
      .select(`
        id, name, category_id, address, google_rating, google_reviews_count, neighborhood_id,
        neighborhoods!inner(name, slug, city, seeded_at)
      `)
      .eq('id', testPlaceId);
  }

  const { data: rawOpenings } = await openingsQuery;

  // Filter openings to only include places discovered AFTER neighborhood was seeded
  const openings: PlaceInfo[] = (rawOpenings || [])
    .filter(p => {
      const neighborhood = p.neighborhoods as unknown as { seeded_at: string | null };
      // Only count as "new" if discovered after the neighborhood was seeded
      return neighborhood.seeded_at !== null;
    })
    .map(p => {
      const neighborhood = p.neighborhoods as unknown as { name: string; slug: string; city: string };
      return {
        id: p.id,
        name: p.name,
        category_name: categoryMap.get(p.category_id) || 'Business',
        address: p.address,
        google_rating: p.google_rating,
        google_reviews_count: p.google_reviews_count,
        neighborhood_id: p.neighborhood_id,
        neighborhood_name: neighborhood.name,
        neighborhood_slug: neighborhood.slug,
        city: neighborhood.city,
      };
    });

  results.openings_found = openings.length;

  // ============================================
  // FIND NOTABLE CLOSINGS (last 24 hours, 4.0+ rating)
  // ============================================
  let closingsQuery = supabase
    .from('guide_listings')
    .select(`
      id, name, category_id, address, google_rating, google_reviews_count, neighborhood_id,
      neighborhoods!inner(name, slug, city)
    `)
    .eq('is_active', false)
    .gte('closed_at', cutoffISO)
    .gte('google_rating', 4.0)
    .order('closed_at', { ascending: false })
    .limit(batchSize);

  if (testPlaceId && testType === 'closing') {
    closingsQuery = supabase
      .from('guide_listings')
      .select(`
        id, name, category_id, address, google_rating, google_reviews_count, neighborhood_id,
        neighborhoods!inner(name, slug, city)
      `)
      .eq('id', testPlaceId);
  }

  const { data: rawClosings } = await closingsQuery;

  const closings: PlaceInfo[] = (rawClosings || []).map(p => {
    const neighborhood = p.neighborhoods as unknown as { name: string; slug: string; city: string };
    return {
      id: p.id,
      name: p.name,
      category_name: categoryMap.get(p.category_id) || 'Business',
      address: p.address,
      google_rating: p.google_rating,
      google_reviews_count: p.google_reviews_count,
      neighborhood_id: p.neighborhood_id,
      neighborhood_name: neighborhood.name,
      neighborhood_slug: neighborhood.slug,
      city: neighborhood.city,
    };
  });

  results.closings_found = closings.length;

  // ============================================
  // EXTRACT MENTIONS FROM DAILY BRIEFS
  // ============================================
  const briefMentions: BriefMention[] = [];

  // Fetch recent briefs (last 24 hours)
  const { data: recentBriefs } = await supabase
    .from('neighborhood_briefs')
    .select(`
      id, content, neighborhood_id,
      neighborhoods!inner(name, city)
    `)
    .gte('generated_at', cutoffISO)
    .not('content', 'is', null)
    .limit(50);

  if (recentBriefs && recentBriefs.length > 0) {
    for (const brief of recentBriefs) {
      try {
        const neighborhood = brief.neighborhoods as unknown as { name: string; city: string };
        const mentions = await extractMentionsFromBrief(
          brief.content,
          neighborhood.name,
          brief.neighborhood_id,
          neighborhood.city,
          brief.id
        );

        if (mentions.length > 0) {
          briefMentions.push(...mentions);
        }

        // Rate limiting between brief parsing
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        results.errors.push(`Brief ${brief.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  results.brief_mentions_found = briefMentions.length;

  // Return early if nothing to process
  if (openings.length === 0 && closings.length === 0 && briefMentions.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No openings, closings, or brief mentions found in the last 24 hours',
      ...results,
      timestamp: new Date().toISOString(),
    });
  }

  // Check for existing articles to avoid duplicates
  const placeIds = [...openings, ...closings].map(p => p.id);
  const { data: existingArticles } = await supabase
    .from('articles')
    .select('place_id')
    .in('place_id', placeIds);

  const existingPlaceIds = new Set((existingArticles || []).map(a => a.place_id));

  // ============================================
  // GENERATE ARTICLES
  // ============================================
  const articlesToCreate: Array<{
    place: PlaceInfo;
    type: 'opening' | 'closing';
    content: { headline: string; body: string; preview: string };
  }> = [];

  // Process openings
  for (const place of openings) {
    if (existingPlaceIds.has(place.id)) {
      continue; // Already has an article
    }

    try {
      const article = await generateOpeningArticle(place);
      if (article) {
        articlesToCreate.push({ place, type: 'opening', content: article });
      } else {
        results.articles_failed++;
        results.errors.push(`${place.name}: Failed to generate opening article`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      results.articles_failed++;
      results.errors.push(`${place.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Process closings
  for (const place of closings) {
    if (existingPlaceIds.has(place.id)) {
      continue; // Already has an article
    }

    try {
      const article = await generateClosingArticle(place);
      if (article) {
        articlesToCreate.push({ place, type: 'closing', content: article });
      } else {
        results.articles_failed++;
        results.errors.push(`${place.name}: Failed to generate closing article`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      results.articles_failed++;
      results.errors.push(`${place.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Track articles created from brief mentions
  const mentionArticlesToCreate: Array<{
    mention: BriefMention;
    content: { headline: string; body: string; preview: string };
  }> = [];

  // Process brief mentions (check for duplicates by headline similarity)
  const existingHeadlines = new Set<string>();
  for (const item of articlesToCreate) {
    existingHeadlines.add(item.content.headline.toLowerCase());
  }

  for (const mention of briefMentions) {
    // Skip if we already have an article for a place with the same name
    const alreadyCovered = articlesToCreate.some(
      a => a.place.name.toLowerCase() === mention.name.toLowerCase()
    );
    if (alreadyCovered) {
      continue;
    }

    try {
      const article = await generateMentionArticle(mention);
      if (article) {
        // Avoid duplicate headlines
        if (!existingHeadlines.has(article.headline.toLowerCase())) {
          mentionArticlesToCreate.push({ mention, content: article });
          existingHeadlines.add(article.headline.toLowerCase());
        }
      } else {
        results.articles_failed++;
        results.errors.push(`Brief mention ${mention.name}: Failed to generate article`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      results.articles_failed++;
      results.errors.push(`Brief mention ${mention.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ============================================
  // INSERT ARTICLES
  // ============================================
  for (const item of articlesToCreate) {
    try {
      const slug = generateSlug(item.content.headline);
      const articleType = item.type === 'opening' ? 'new_opening' : 'closure';

      const { data: insertedArticle, error: insertError } = await supabase
        .from('articles')
        .insert({
          neighborhood_id: item.place.neighborhood_id,
          headline: item.content.headline,
          body_text: item.content.body,
          preview_text: item.content.preview,
          slug,
          status: 'published',
          published_at: new Date().toISOString(),
          author_type: 'ai',
          ai_model: 'grok-3-fast',
          article_type: articleType,
          place_id: item.place.id, // Link to the place
          image_url: '', // Will be generated
        })
        .select('id')
        .single();

      if (insertError) {
        results.articles_failed++;
        results.errors.push(`${item.place.name}: ${insertError.message}`);
        continue;
      }

      results.articles_created++;

      // Generate image
      try {
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

        const imageResponse = await fetch(`${baseUrl}/api/internal/generate-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': cronSecret || '',
          },
          body: JSON.stringify({
            article_id: insertedArticle.id,
          }),
        });

        if (imageResponse.ok) {
          const imageResult = await imageResponse.json();
          if (imageResult.successful > 0) {
            results.images_generated++;
          }
        }
      } catch (imgErr) {
        results.errors.push(`${item.place.name}: Image generation failed`);
      }

    } catch (err) {
      results.articles_failed++;
      results.errors.push(`${item.place.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Insert articles from brief mentions
  for (const item of mentionArticlesToCreate) {
    try {
      const slug = generateSlug(item.content.headline);
      const articleType = item.mention.type === 'opening' ? 'new_opening' : 'closure';

      const { data: insertedArticle, error: insertError } = await supabase
        .from('articles')
        .insert({
          neighborhood_id: item.mention.neighborhood_id,
          headline: item.content.headline,
          body_text: item.content.body,
          preview_text: item.content.preview,
          slug,
          status: 'published',
          published_at: new Date().toISOString(),
          author_type: 'ai',
          ai_model: 'grok-3-fast',
          article_type: articleType,
          brief_id: item.mention.brief_id, // Link to source brief
          image_url: '', // Will be generated
        })
        .select('id')
        .single();

      if (insertError) {
        results.articles_failed++;
        results.errors.push(`Brief mention ${item.mention.name}: ${insertError.message}`);
        continue;
      }

      results.articles_created++;

      // Generate image
      try {
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

        const imageResponse = await fetch(`${baseUrl}/api/internal/generate-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': cronSecret || '',
          },
          body: JSON.stringify({
            article_id: insertedArticle.id,
          }),
        });

        if (imageResponse.ok) {
          const imageResult = await imageResponse.json();
          if (imageResult.successful > 0) {
            results.images_generated++;
          }
        }
      } catch (imgErr) {
        results.errors.push(`Brief mention ${item.mention.name}: Image generation failed`);
      }

    } catch (err) {
      results.articles_failed++;
      results.errors.push(`Brief mention ${item.mention.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    success: results.articles_created > 0 || (results.openings_found === 0 && results.closings_found === 0 && results.brief_mentions_found === 0),
    ...results,
    timestamp: new Date().toISOString(),
  });
}
