/**
 * WeeklyBriefService — "The Sunday Edition"
 *
 * Generates a weekly synthesis for each neighborhood:
 *   Section 1: The Rearview — Top 3 significant stories from the past week
 *   Section 2: The Horizon — Top 3 upcoming events for the next week
 *   Section 3: The Weekly Data Point — One rotating high-signal metric
 *
 * Uses Gemini (significance filtering, editorial synthesis, data point)
 * and Grok X Search (event hunting).
 */

import { GoogleGenAI } from '@google/genai';
import { SupabaseClient } from '@supabase/supabase-js';
import { getNeighborhoodIdsForQuery } from './combo-utils';
import { getSearchLocation } from './neighborhood-utils';

/**
 * Replace em dashes and en dashes with regular hyphens.
 * Em/en dashes are a telltale sign of AI-generated content.
 */
function stripDashes(text: string): string {
  return text.replace(/\u2014/g, '-').replace(/\u2013/g, '-').replace(/—/g, '-').replace(/–/g, '-');
}

// ─── Types ───

export interface RearviewStory {
  headline: string;
  significance: string;
}

export interface HorizonEvent {
  day: string;       // e.g., "Saturday Feb 14 2pm" or "Saturday Feb 14 14:00"
  name: string;
  whyItMatters: string;
  category: string;  // High Culture, The Scene, Urban Nature, Real Estate
}

export type DataPointType = 'real_estate' | 'safety' | 'environment' | 'flaneur_index';

export interface WeeklyDataPoint {
  type: DataPointType;
  label: string;
  value: string;
  context: string;
}

export interface WeeklyBriefContent {
  rearviewNarrative: string;
  rearviewStories: RearviewStory[];
  horizonEvents: HorizonEvent[];
  dataPoint: WeeklyDataPoint;
}

// ─── Constants ───

const GROK_API_URL = 'https://api.x.ai/v1/responses';
const GROK_MODEL = 'grok-4-1-fast';

const DATA_POINT_ROTATION: DataPointType[] = [
  'real_estate',
  'safety',
  'environment',
  'flaneur_index',
];

// ─── Main Entry Point ───

/**
 * Generate a complete Sunday Edition for one neighborhood.
 */
export async function generateWeeklyBrief(
  supabase: SupabaseClient,
  neighborhoodId: string,
  neighborhoodName: string,
  city: string,
  country: string
): Promise<WeeklyBriefContent> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!geminiKey) throw new Error('GEMINI_API_KEY not configured');

  const genAI = new GoogleGenAI({ apiKey: geminiKey });

  // ─── Section 1: The Rearview ───
  console.log(`[SundayEdition] ${neighborhoodName}: fetching past week's stories...`);

  const queryIds = await getNeighborhoodIdsForQuery(supabase, neighborhoodId);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: weekArticles } = await supabase
    .from('articles')
    .select('id, headline, body_text, category_label, published_at')
    .in('neighborhood_id', queryIds)
    .eq('status', 'published')
    .gt('published_at', sevenDaysAgo.toISOString())
    .order('published_at', { ascending: false })
    .limit(50);

  const articles = weekArticles || [];
  console.log(`[SundayEdition] ${neighborhoodName}: found ${articles.length} articles from past week`);

  // Build headline list for Gemini (no category labels - clean headlines only)
  const headlineList = articles
    .map((a, i) => `${i + 1}. ${a.headline}`)
    .join('\n');

  // Step B: Significance Filter via Gemini
  let topStories: RearviewStory[] = [];
  let narrative = '';

  if (articles.length > 0) {
    const filterResult = await significanceFilter(genAI, headlineList, neighborhoodName, city);
    topStories = filterResult.stories;

    // Step C: Editorial Synthesis via Gemini
    narrative = await editorialSynthesis(
      genAI,
      topStories,
      neighborhoodName,
      city,
      articles
    );
  } else {
    narrative = `Honestly? A quiet week around here. No drama, no surprises - just ${neighborhoodName} humming along the way we like it. Sometimes the best update is that there's nothing to report.`;
  }

  // ─── Section 2: The Horizon ───
  console.log(`[SundayEdition] ${neighborhoodName}: hunting upcoming events...`);

  let horizonEvents: HorizonEvent[] = [];

  // Determine time format based on country (US uses 12h, most others 24h)
  const uses12h = ['USA', 'US', 'Canada', 'Australia', 'Philippines'].includes(country);
  const timeFormat = uses12h ? '12-hour (e.g., "Saturday Feb 14 2pm")' : '24-hour (e.g., "Saturday Feb 14 14:00")';

  if (grokKey) {
    const rawEvents = await huntUpcomingEvents(grokKey, neighborhoodName, city, country);
    if (rawEvents) {
      horizonEvents = await curateEvents(genAI, rawEvents, neighborhoodName, city, timeFormat);
    }
  }

  // Fallback: use Gemini search if Grok unavailable or returned nothing
  if (horizonEvents.length === 0) {
    horizonEvents = await huntEventsWithGemini(genAI, neighborhoodName, city, timeFormat);
  }

  // ─── Section 3: The Weekly Data Point ───
  console.log(`[SundayEdition] ${neighborhoodName}: generating data point...`);

  const isoWeek = getISOWeekNumber(new Date());
  const dataPointType = DATA_POINT_ROTATION[isoWeek % 4];
  const dataPoint = await generateDataPoint(genAI, dataPointType, neighborhoodName, city, country);

  return {
    rearviewNarrative: stripDashes(narrative),
    rearviewStories: topStories.map(s => ({
      ...s,
      headline: stripDashes(s.headline),
      significance: s.significance ? stripDashes(s.significance) : s.significance,
    })),
    horizonEvents: horizonEvents.map(e => ({
      ...e,
      name: stripDashes(e.name),
      whyItMatters: stripDashes(e.whyItMatters),
    })),
    dataPoint: {
      ...dataPoint,
      value: stripDashes(dataPoint.value),
      context: dataPoint.context ? stripDashes(dataPoint.context) : dataPoint.context,
    },
  };
}

// ─── Section 1 Helpers ───

async function significanceFilter(
  genAI: GoogleGenAI,
  headlineList: string,
  neighborhoodName: string,
  city: string
): Promise<{ stories: RearviewStory[] }> {
  const prompt = `You are a 35-year-old insider living in ${neighborhoodName}, ${city}. You own property here, you eat here, you know the neighbors.

Pick the 3 stories from this past week that YOUR PEERS (other successful residents) would actually care about.

STORIES:
${headlineList}

WHAT WE CARE ABOUT:
1. Anything that affects our property values (zoning changes, landmark sales, new developments)
2. Anything that changes our daily life here (new restaurant worth booking, school changes, cultural institution moves)
3. Anything that affects our safety (real patterns, not petty stuff)

IGNORE: Tourist drama, weather complaints, celebrity sightings, routine city noise.

IMPORTANT: Strip any category prefixes like "[Real Estate Weekly]" or "[News Brief]" from headlines. Return clean headlines only.

Respond with ONLY this JSON (no other text):
\`\`\`json
{
  "stories": [
    {"headline": "Clean headline without category prefix", "significance": "One candid sentence - why this matters to us"},
    {"headline": "Clean headline", "significance": "One sentence"},
    {"headline": "Clean headline", "significance": "One sentence"}
  ]
}
\`\`\``;

  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { temperature: 0.3 },
    });

    const text = response.text || '';
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"stories"[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr.trim());
      if (parsed.stories && Array.isArray(parsed.stories)) {
        return { stories: parsed.stories.slice(0, 3) };
      }
    }
  } catch (err) {
    console.error('[SundayEdition] Significance filter error:', err);
  }

  return { stories: [] };
}

async function editorialSynthesis(
  genAI: GoogleGenAI,
  topStories: RearviewStory[],
  neighborhoodName: string,
  city: string,
  allArticles: Array<{ headline: string; body_text: string | null }>
): Promise<string> {
  // Find the full article bodies for the top stories
  const storyContext = topStories.map(s => {
    const match = allArticles.find(a =>
      a.headline.toLowerCase().includes(s.headline.toLowerCase().slice(0, 30)) ||
      s.headline.toLowerCase().includes(a.headline.toLowerCase().slice(0, 30))
    );
    const body = match?.body_text?.slice(0, 500) || '';
    return `STORY: ${s.headline}\nSIGNIFICANCE: ${s.significance}\nCONTEXT: ${body}`;
  }).join('\n\n');

  const prompt = `You are a 35-year-old insider living in ${neighborhoodName}, ${city}. You own property here. You eat here. Your audience is your peers - other successful residents.

Write a 200-word weekly update weaving these 3 stories together for your neighbors.

${storyContext}

THE PERSONA: "THE SMART NEIGHBOR"
- First-Person Plural: Use "we," "our," "us." (e.g., "The construction on Hudson St is finally clearing up" NOT "Residents of Hudson St...")
- Confidence, Not Hype: You don't need to sell the neighborhood. We already live here. Be candid.
- The "Coffee Shop" Test: If you wouldn't say it to a friend while waiting for a latte, delete it.
  BAD: "The locale boasts a myriad of culinary delights."
  GOOD: "If you haven't tried the new spot on Duane yet, book it now - reservations are already gone for Friday."

STRUCTURE:
1. The Hook: Start with the thing everyone is talking about (or should be)
2. The Connection: How does the big news actually affect our daily life?
3. The Verdict: Is this good or bad for us?

RULES:
- NO greeting or sign-off. NO markdown, bold, or formatting.
- NEVER use em dashes or en dashes. Use hyphens (-) instead.
- Write flowing prose. Exactly 200 words.`;

  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { temperature: 0.7 },
    });

    return (response.text || '').trim();
  } catch (err) {
    console.error('[SundayEdition] Editorial synthesis error:', err);
    return `This week in ${neighborhoodName} carried the kind of quiet significance that only reveals itself in retrospect.`;
  }
}

// ─── Section 2 Helpers ───

async function huntUpcomingEvents(
  grokKey: string,
  neighborhoodName: string,
  city: string,
  country: string
): Promise<string | null> {
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const fromDate = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const toDate = nextWeek.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const searchLocation = getSearchLocation(neighborhoodName, city, country);

  const prompt = `Search for upcoming high-value events in ${searchLocation} between ${fromDate} and ${toDate}.

Prioritize these 4 categories:
1. **High Culture & Arts:** Museum exhibitions, gallery vernissages, opera/symphony premieres, exclusive book signings
2. **The Scene (Dining/Social):** Restaurant soft openings, exclusive pop-ups, charity galas, members' club events
3. **Urban Nature & Public Space:** Park festivals, botanical garden blooms, major waterfront events
4. **Real Estate & Design:** Trophy property open houses, architecture tours, design weeks

Exclude: Generic tourist traps, comedy clubs, happy hours, lower-tier nightlife, chain restaurant promotions.

For each event found, provide: the specific date and time (e.g., "Saturday Feb 14 2pm"), event name, venue, and why it matters.
Return at least 5-8 events if available.`;

  try {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${grokKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        input: [
          {
            role: 'system',
            content: `You are a cultural concierge for ultra-high-net-worth residents of ${neighborhoodName}, ${city}. Find exclusive, noteworthy upcoming events.`,
          },
          { role: 'user', content: prompt },
        ],
        tools: [{ type: 'x_search' }, { type: 'web_search' }],
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      console.error(`[SundayEdition] Grok error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const output = data.output || [];
    const messageContent = output
      .filter((o: { type: string }) => o.type === 'message')
      .map((o: { content: Array<{ type: string; text: string }> | string }) => {
        if (typeof o.content === 'string') return o.content;
        if (Array.isArray(o.content)) {
          return o.content
            .filter((c: { type: string }) => c.type === 'output_text')
            .map((c: { text: string }) => c.text)
            .join('');
        }
        return '';
      })
      .join('\n');

    return messageContent || null;
  } catch (err) {
    console.error('[SundayEdition] Grok event hunt error:', err);
    return null;
  }
}

async function curateEvents(
  genAI: GoogleGenAI,
  rawEvents: string,
  neighborhoodName: string,
  city: string,
  timeFormat: string
): Promise<HorizonEvent[]> {
  const prompt = `You are a 35-year-old insider living in ${neighborhoodName}, ${city}. Pick the 3 events your neighbors would actually want to know about.

From these raw event listings, select the 3 most relevant:

${rawEvents}

CRITERIA:
- Would you actually tell a friend about this over coffee?
- Exclusivity matters (private views, opening nights, limited access)
- Variety across categories (don't pick 3 restaurant events)

FORMAT:
- "day" must include the date AND time in ${timeFormat} format
- "whyItMatters" should sound like you're texting a friend, not writing a press release
- NEVER use em dashes or en dashes. Use hyphens (-) instead.

Respond with ONLY this JSON:
\`\`\`json
{
  "events": [
    {"day": "Saturday Feb 14 2pm", "name": "Event Name at Venue", "whyItMatters": "One candid sentence", "category": "High Culture"},
    {"day": "Thursday Feb 12 7pm", "name": "Event Name", "whyItMatters": "One sentence", "category": "The Scene"},
    {"day": "Sunday Feb 15 11am", "name": "Event Name", "whyItMatters": "One sentence", "category": "Urban Nature"}
  ]
}
\`\`\``;

  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { temperature: 0.4 },
    });

    const text = response.text || '';
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"events"[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr.trim());
      if (parsed.events && Array.isArray(parsed.events)) {
        return parsed.events.slice(0, 3);
      }
    }
  } catch (err) {
    console.error('[SundayEdition] Event curation error:', err);
  }

  return [];
}

async function huntEventsWithGemini(
  genAI: GoogleGenAI,
  neighborhoodName: string,
  city: string,
  timeFormat: string
): Promise<HorizonEvent[]> {
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const fromDate = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const toDate = nextWeek.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const prompt = `Search for the top 3 upcoming events in ${neighborhoodName}, ${city} between ${fromDate} and ${toDate} that a well-connected local would actually care about.

Categories to consider:
1. High Culture & Arts (exhibitions, premieres, gallery openings)
2. Dining & Social (restaurant openings, exclusive pop-ups, galas)
3. Urban Nature & Public Space (park events, festivals)
4. Real Estate & Design (open houses, architecture tours)

Exclude tourist traps, comedy clubs, happy hours.

FORMAT:
- "day" must include the date AND time in ${timeFormat} format
- "whyItMatters" should sound like a friend recommending it, not a press release
- NEVER use em dashes or en dashes. Use hyphens (-) instead.

Respond with ONLY this JSON:
\`\`\`json
{
  "events": [
    {"day": "Saturday Feb 14 2pm", "name": "Event Name at Venue", "whyItMatters": "One candid sentence", "category": "High Culture"},
    {"day": "Thursday Feb 12 7pm", "name": "Event Name", "whyItMatters": "One sentence", "category": "The Scene"},
    {"day": "Sunday Feb 15 11am", "name": "Event Name", "whyItMatters": "One sentence", "category": "Urban Nature"}
  ]
}
\`\`\``;

  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.5,
      },
    });

    const text = response.text || '';
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"events"[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr.trim());
      if (parsed.events && Array.isArray(parsed.events)) {
        return parsed.events.slice(0, 3);
      }
    }
  } catch (err) {
    console.error('[SundayEdition] Gemini event hunt error:', err);
  }

  return [];
}

// ─── Section 3 Helpers ───

const DATA_POINT_PROMPTS: Record<DataPointType, (n: string, c: string, co: string) => string> = {
  real_estate: (n, c) =>
    `What is the current average residential listing price in ${n}, ${c}? Compare to last month. Provide one number and one sentence of context. If exact data unavailable, give the best available indicator. VOICE: Write as a local insider using "we/our" - e.g., "Our median listing is holding at $4.2M" or "${n} is seeing steady demand." NEVER say "Residents are" - that sounds like a third party. NEVER use em dashes.`,
  safety: (n, c) =>
    `What are the recent crime or safety statistics for ${n}, ${c}? Compare to last year same period. Provide one key metric and one sentence of context. VOICE: Write as a local insider using "we/our" - e.g., "We're seeing a 12% drop in incidents" or "${n} is holding steady." NEVER say "Residents are." NEVER use em dashes.`,
  environment: (n, c) =>
    `What is the current air quality or notable environmental condition in ${n}, ${c}? Provide one measurement and one sentence of context. VOICE: Write as a local insider using "we/our" - e.g., "We're breathing easy today" or "${n} is dealing with a cold snap." NEVER say "Residents are." NEVER use em dashes.`,
  flaneur_index: (n, c, co) => {
    const currency = co === 'USA' ? 'USD' : co === 'UK' ? 'GBP' : co === 'Sweden' ? 'SEK' : co === 'Australia' ? 'AUD' : 'local currency';
    return `What is the average price of a latte at premium cafes in ${n}, ${c}? Give the price in ${currency} and compare to the city average. This is our "Flaneur Index" - a lighthearted cost-of-living indicator. VOICE: Write as a local insider - e.g., "Our morning latte runs about $6.50" or "We're paying a premium." NEVER say "Residents are." NEVER use em dashes.`;
  },
};

const DATA_POINT_LABELS: Record<DataPointType, string> = {
  real_estate: 'The Market',
  safety: 'The Safety Index',
  environment: 'The Air We Breathe',
  flaneur_index: 'The Flaneur Index',
};

async function generateDataPoint(
  genAI: GoogleGenAI,
  type: DataPointType,
  neighborhoodName: string,
  city: string,
  country: string
): Promise<WeeklyDataPoint> {
  const promptFn = DATA_POINT_PROMPTS[type];
  const searchPrompt = promptFn(neighborhoodName, city, country);

  const prompt = `${searchPrompt}

Respond with ONLY this JSON:
\`\`\`json
{
  "value": "The key number or metric (e.g., '$4.2M', '12% decrease', 'AQI 42')",
  "context": "One sentence explaining what this means for residents."
}
\`\`\``;

  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.3,
      },
    });

    const text = response.text || '';
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"value"[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr.trim());
      return {
        type,
        label: DATA_POINT_LABELS[type],
        value: parsed.value || 'Data unavailable',
        context: parsed.context || '',
      };
    }
  } catch (err) {
    console.error(`[SundayEdition] Data point (${type}) error:`, err);
  }

  return {
    type,
    label: DATA_POINT_LABELS[type],
    value: 'Data unavailable this week',
    context: '',
  };
}

// ─── Utility ───

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Format the weekly brief as article body text for the neighborhood feed.
 */
export function formatWeeklyBriefAsArticle(
  content: WeeklyBriefContent,
  neighborhoodName: string
): string {
  let body = '';

  // Section 1: The Rearview
  body += '[[The Rearview]]\n\n';
  body += content.rearviewNarrative + '\n\n';

  // Section 2: The Horizon
  if (content.horizonEvents.length > 0) {
    body += '[[The Agenda]]\n\n';
    for (const event of content.horizonEvents) {
      body += `${event.day}: ${event.name} - ${event.whyItMatters}\n\n`;
    }
  }

  // Section 3: Data Point
  if (content.dataPoint.value !== 'Data unavailable this week') {
    body += `[[${content.dataPoint.label}]]\n\n`;
    body += `${content.dataPoint.value}\n`;
    if (content.dataPoint.context) {
      body += `${content.dataPoint.context}\n`;
    }
  }

  return body.trim();
}
