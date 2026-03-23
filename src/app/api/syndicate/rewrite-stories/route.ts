import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';
import { insiderPersona } from '@/lib/ai-persona';

const RETRY_DELAYS = [2000, 5000, 15000];

interface InputStory {
  id?: string;
  headline: string;
  sourceUrl: string;
  secondarySourceUrl?: string;
  sourceName: string;
  secondarySourceName?: string;
  category: string;
  originalBlurb?: string;
  publishedAt?: string;
  originalPublishedAt?: string;
}

interface RewrittenStory {
  id?: string;
  headline: string;
  blurb: string;
  bodyText: string;
  sourceUrl: string;
  secondarySourceUrl?: string;
}

/**
 * @swagger
 * /api/syndicate/rewrite-stories:
 *   post:
 *     tags: [Internal]
 *     summary: Rewrite stories using Flaneur's editorial voice
 *     description: Accepts Yous.News story data (headline, source URLs, blurb) and returns Flaneur-quality rewrites with 3-sentence blurbs and 150-200 word article bodies. Secured by CRON_SECRET.
 *     security:
 *       - cronSecret: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stories]
 *             properties:
 *               stories:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [headline, sourceUrl, sourceName, category]
 *                   properties:
 *                     id:
 *                       type: string
 *                     headline:
 *                       type: string
 *                     sourceUrl:
 *                       type: string
 *                     secondarySourceUrl:
 *                       type: string
 *                     sourceName:
 *                       type: string
 *                     secondarySourceName:
 *                       type: string
 *                     category:
 *                       type: string
 *                     originalBlurb:
 *                       type: string
 *                     publishedAt:
 *                       type: string
 *                     originalPublishedAt:
 *                       type: string
 *     responses:
 *       200:
 *         description: Rewritten stories
 *       401:
 *         description: Invalid or missing secret
 */
export async function POST(request: NextRequest) {
  // Auth
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = authHeader?.replace('Bearer ', '') ||
    new URL(request.url).searchParams.get('secret');

  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const { stories } = await request.json() as { stories: InputStory[] };
  if (!stories || !Array.isArray(stories) || stories.length === 0) {
    return NextResponse.json({ error: 'stories array required' }, { status: 400 });
  }

  // Cap at 20 stories per request
  const batch = stories.slice(0, 20);
  const genAI = new GoogleGenAI({ apiKey });

  const results: RewrittenStory[] = [];
  const errors: { headline: string; error: string }[] = [];

  // Process in parallel batches of 5
  for (let i = 0; i < batch.length; i += 5) {
    const chunk = batch.slice(i, i + 5);
    const promises = chunk.map(story => rewriteStory(genAI, story));
    const settled = await Promise.allSettled(promises);

    for (let j = 0; j < settled.length; j++) {
      const result = settled[j];
      const story = chunk[j];
      if (result.status === 'fulfilled' && result.value) {
        results.push({
          id: story.id,
          headline: story.headline,
          blurb: result.value.blurb,
          bodyText: result.value.bodyText,
          sourceUrl: story.sourceUrl,
          secondarySourceUrl: story.secondarySourceUrl,
        });
      } else {
        errors.push({
          headline: story.headline,
          error: result.status === 'rejected' ? result.reason?.message : 'Empty result',
        });
      }
    }
  }

  return NextResponse.json({
    count: results.length,
    errors: errors.length,
    stories: results,
    errorDetails: errors.length > 0 ? errors : undefined,
  });
}

async function rewriteStory(
  genAI: GoogleGenAI,
  story: InputStory
): Promise<{ blurb: string; bodyText: string } | null> {

  const persona = insiderPersona('Ireland', 'News Editor');

  const sourceContext = [
    `Primary source: ${story.sourceName} - ${story.sourceUrl}`,
    story.secondarySourceUrl ? `Secondary source: ${story.secondarySourceName || 'Additional source'} - ${story.secondarySourceUrl}` : '',
    story.originalBlurb ? `Existing summary: ${story.originalBlurb}` : '',
    story.originalPublishedAt ? `Originally reported: ${story.originalPublishedAt}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `${persona}

You are rewriting a news story for an Irish audience. Use the source URLs and context below to write:

1. A BLURB: Exactly 3 sentences. Information-dense, Morning Brew style. Lead with the news fact, add context or numbers, end with what happens next or why it matters. Active present tense. No filler words. No em dashes.

2. A BODY: 150-200 words in 2-3 paragraphs. Structured like a quality newspaper brief. Include specific names, numbers, dates, and facts from the source material. Write in third person, present tense. No greeting, no sign-off, no "Good morning" - just the story content.

STORY TO REWRITE:
Headline: ${story.headline}
Category: ${story.category}
${sourceContext}

RULES:
- Use Google Search to read the source URLs for full context and facts
- Keep the lowercase teaser headline exactly as provided - do not change it
- Include specific facts: names, euro amounts, dates, locations, vote counts
- Active voice, present tense ("The cabinet is weighing" not "The cabinet has been considering")
- No em dashes. Use commas, periods, or hyphens
- No filler: "It remains to be seen", "Time will tell", "Only time will tell"
- Write for an Irish reader who follows the news daily
- If sources conflict, note both positions

Return ONLY a JSON object (no markdown, no code fences):
{"blurb": "Three sentence blurb here.", "bodyText": "Full 150-200 word article here. Second paragraph. Third paragraph."}`;

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

      // Parse JSON from response (strip markdown fences if present)
      const jsonStr = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // Attempt JSON repair for truncated output
        parsed = repairJson(jsonStr);
      }

      if (parsed.blurb && parsed.bodyText) {
        return {
          blurb: cleanText(parsed.blurb),
          bodyText: cleanText(parsed.bodyText),
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < RETRY_DELAYS.length && (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED'))) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw err;
    }
  }

  return null;
}

function repairJson(text: string): { blurb?: string; bodyText?: string } | null {
  // Try to extract blurb and bodyText from truncated JSON
  const blurbMatch = text.match(/"blurb"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
  const bodyMatch = text.match(/"bodyText"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);

  if (blurbMatch?.[1] || bodyMatch?.[1]) {
    return {
      blurb: blurbMatch?.[1]?.replace(/\\"/g, '"').replace(/\\n/g, '\n') || '',
      bodyText: bodyMatch?.[1]?.replace(/\\"/g, '"').replace(/\\n/g, '\n') || '',
    };
  }
  return null;
}

function cleanText(text: string): string {
  return text
    .replace(/\u2014/g, ' - ')   // em dash to hyphen
    .replace(/\u2013/g, '-')     // en dash to hyphen
    .replace(/\s{2,}/g, ' ')     // collapse double spaces
    .trim();
}
