import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';
import { insiderPersona } from '@/lib/ai-persona';

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

  // If requesting just the national brief, we still need all county data to synthesize it
  const isNationalOnly = countyFilter === 'ireland';

  try {
    // 1. Fetch Irish county neighborhoods (always fetch all for national brief)
    let neighborhoodQuery = supabaseAdmin
      .from('neighborhoods')
      .select('id, name, city, country, latitude, longitude, timezone')
      .like('id', 'ie-county-%')
      .eq('is_active', true);

    if (countyFilter && !isNationalOnly) {
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

    // 7. Generate national "ireland" brief from county data
    // Include when: no filter (all counties + national), or explicitly requesting ireland
    const includeNational = !countyFilter || isNationalOnly;
    let nationalEntry = null;

    if (includeNational && withBrief > 0) {
      nationalEntry = await generateNationalBrief(counties, targetDate);
    }

    // If requesting only the national brief, return just that
    if (isNationalOnly) {
      const nationalEntries = nationalEntry ? [nationalEntry] : [];
      return NextResponse.json({
        date: targetDate,
        count: nationalEntries.length,
        coverage: {
          dailyBriefs: nationalEntry?.dailyBrief ? 1 : 0,
          lookAheads: 0,
        },
        counties: nationalEntries,
      }, {
        headers: {
          'Cache-Control': 'private, max-age=300',
        },
      });
    }

    // Build final response - national entry first if present
    const allEntries = nationalEntry
      ? [nationalEntry, ...counties]
      : counties;

    return NextResponse.json({
      date: targetDate,
      count: allEntries.length,
      coverage: {
        dailyBriefs: withBrief + (nationalEntry?.dailyBrief ? 1 : 0),
        lookAheads: withLookAhead + (nationalEntry?.lookAhead ? 1 : 0),
      },
      counties: allEntries,
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

// ---------------------------------------------------------------------------
// National brief generation — synthesizes top stories from all 32 counties
// ---------------------------------------------------------------------------

interface CountyEntry {
  county: string;
  countyName: string;
  dailyBrief: {
    headline: string;
    subjectTeaser: string | null;
    emailTeaser: string | null;
    enrichedContent: string | null;
    categories: unknown;
    article: {
      headline: string;
      bodyText: string;
      previewText: string;
      sources: { source_name: string; source_url: string | null }[];
    } | null;
  } | null;
  lookAhead: {
    headline: string;
    bodyText: string;
    previewText: string;
    sources: { source_name: string; source_url: string | null }[];
  } | null;
}

const RETRY_DELAYS = [2000, 5000];

async function generateNationalBrief(
  counties: CountyEntry[],
  targetDate: string
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  // Collect top stories from counties that have briefs
  const countyStories: string[] = [];
  const allSources: { source_name: string; source_url: string | null }[] = [];

  for (const c of counties) {
    if (!c.dailyBrief?.article?.bodyText) continue;
    // Take first 300 chars of each county's brief for context
    const snippet = c.dailyBrief.article.bodyText.slice(0, 300);
    countyStories.push(`[${c.countyName}] ${c.dailyBrief.article.headline}: ${snippet}`);

    // Collect sources
    if (c.dailyBrief.article.sources) {
      for (const s of c.dailyBrief.article.sources) {
        if (!allSources.some(x => x.source_name === s.source_name)) {
          allSources.push(s);
        }
      }
    }
  }

  if (countyStories.length < 3) return null;

  const persona = insiderPersona('Ireland', 'National Editor');

  const prompt = `${persona}

You are writing the All Ireland national daily brief for ${targetDate}. This is a summary of the most important stories happening across all 32 Irish counties today.

COUNTY BRIEFS (${countyStories.length} counties reporting):
${countyStories.join('\n\n')}

TASK: Write a national brief that:
1. Leads with the single biggest story across all of Ireland today
2. Covers 5-7 of the most significant stories from across the counties
3. Groups related stories (e.g., if multiple counties report on the same national issue)
4. Mentions which counties/cities are affected where relevant
5. Ends with a lighter or human interest story if available

RULES:
- 300-400 words in 4-6 paragraphs
- Active present tense, no em dashes
- Write as a national overview, not a county-by-county list
- Include specific names, numbers, dates, locations
- Use Google Search to verify and add the latest facts to the stories
- MUST start with an Irish-language greeting as the very first line, e.g. "Maidin mhaith, a chomharsana." (Good morning, neighbors) or "Tráthnóna maith, a chomharsana." (Good afternoon) depending on time of day
- MUST end with an Irish-language sign-off as the very last line, e.g. "Bain sult as an lá." (Enjoy the day) or "Oíche mhaith." (Good night) depending on time of day

Also generate:
- A 1-4 word "information gap" subject teaser (lowercase, punchy, e.g. "fuel duty bombshell")
- A 2-3 sentence email teaser packed with specific facts

Return ONLY valid JSON (no markdown fences):
{
  "headline": "Short headline for the national brief",
  "subjectTeaser": "fuel duty bombshell",
  "emailTeaser": "Two-three sentence information-dense teaser.",
  "bodyText": "Full 300-400 word national brief...",
  "previewText": "First sentence or two for card display."
}`;

  const genAI = new GoogleGenAI({ apiKey });

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await genAI.models.generateContent({
        model: AI_MODELS.GEMINI_FLASH,
        contents: prompt,
        config: {
          temperature: 0.4,
          maxOutputTokens: 2000,
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = response.text?.trim();
      if (!text) continue;

      const jsonStr = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // Try to extract fields from malformed JSON
        const headlineMatch = jsonStr.match(/"headline"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const bodyMatch = jsonStr.match(/"bodyText"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (headlineMatch?.[1] && bodyMatch?.[1]) {
          parsed = {
            headline: headlineMatch[1].replace(/\\"/g, '"'),
            bodyText: bodyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
          };
        }
      }

      if (parsed?.bodyText) {
        const cleanBody = parsed.bodyText
          .replace(/\u2014/g, ' - ')
          .replace(/\u2013/g, '-')
          .trim();

        return {
          county: 'ireland',
          countyName: 'Ireland',
          city: 'Ireland',
          neighborhoodId: 'ie-ireland',
          dailyBrief: {
            briefId: null,
            headline: parsed.headline || 'All Ireland Brief',
            subjectTeaser: parsed.subjectTeaser || null,
            emailTeaser: parsed.emailTeaser || null,
            enrichedContent: null,
            categories: null,
            model: AI_MODELS.GEMINI_FLASH,
            enrichmentModel: null,
            briefDate: targetDate,
            generatedAt: new Date().toISOString(),
            article: {
              articleId: null,
              headline: parsed.headline || 'All Ireland Brief',
              previewText: parsed.previewText || cleanBody.split('.').slice(0, 2).join('.') + '.',
              bodyText: cleanBody,
              imageUrl: null,
              slug: null,
              publishedAt: new Date().toISOString(),
              categoryLabel: 'All Ireland Brief',
              sources: allSources.slice(0, 10),
            },
          },
          lookAhead: null,
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < RETRY_DELAYS.length && (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED'))) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      console.error('National brief generation failed:', msg);
      return null;
    }
  }

  return null;
}
