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

// ─── Types ───

export interface RearviewStory {
  headline: string;
  significance: string;
}

export interface HorizonEvent {
  day: string;       // e.g., "Tuesday"
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

  // Build headline list for Gemini
  const headlineList = articles
    .map((a, i) => `${i + 1}. [${a.category_label || 'News'}] ${a.headline}`)
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
    narrative = `A quiet week in ${neighborhoodName}. Sometimes the absence of news is itself a signal\u2014the neighborhood hums along in its familiar rhythm, undisturbed by the kind of disruptions that make headlines elsewhere.`;
  }

  // ─── Section 2: The Horizon ───
  console.log(`[SundayEdition] ${neighborhoodName}: hunting upcoming events...`);

  let horizonEvents: HorizonEvent[] = [];

  if (grokKey) {
    const rawEvents = await huntUpcomingEvents(grokKey, neighborhoodName, city, country);
    if (rawEvents) {
      horizonEvents = await curateEvents(genAI, rawEvents, neighborhoodName, city);
    }
  }

  // Fallback: use Gemini search if Grok unavailable or returned nothing
  if (horizonEvents.length === 0) {
    horizonEvents = await huntEventsWithGemini(genAI, neighborhoodName, city);
  }

  // ─── Section 3: The Weekly Data Point ───
  console.log(`[SundayEdition] ${neighborhoodName}: generating data point...`);

  const isoWeek = getISOWeekNumber(new Date());
  const dataPointType = DATA_POINT_ROTATION[isoWeek % 4];
  const dataPoint = await generateDataPoint(genAI, dataPointType, neighborhoodName, city, country);

  return {
    rearviewNarrative: narrative,
    rearviewStories: topStories,
    horizonEvents,
    dataPoint,
  };
}

// ─── Section 1 Helpers ───

async function significanceFilter(
  genAI: GoogleGenAI,
  headlineList: string,
  neighborhoodName: string,
  city: string
): Promise<{ stories: RearviewStory[] }> {
  const prompt = `You are the Editor of a luxury neighborhood newsletter for ${neighborhoodName}, ${city}.
Review these stories from the past week and select the Top 3 based on **Long-Term Impact** for a resident with $10M+ net worth.

STORIES:
${headlineList}

SELECTION CRITERIA:
1. **Asset Value:** Does this affect property prices? (Zoning changes, landmark sales, infrastructure projects)
2. **Quality of Life:** Does this permanently change the neighborhood? (Michelin-star opening, new school, cultural institution)
3. **Safety:** Significant patterns or incidents (not petty theft or minor nuisances)

IGNORE: Viral oddities, weather complaints, minor traffic, celebrity sightings, routine events.

Respond with ONLY this JSON (no other text):
\`\`\`json
{
  "stories": [
    {"headline": "The exact headline from the list", "significance": "One sentence on why this matters long-term"},
    {"headline": "The exact headline", "significance": "One sentence"},
    {"headline": "The exact headline", "significance": "One sentence"}
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

  const prompt = `You are the Editor of a luxury weekly digest for ${neighborhoodName}, ${city}.
Write a 200-word cohesive narrative weaving these 3 stories into a single editorial essay.

${storyContext}

STYLE GUIDE:
- Voice: Sophisticated, "Vanity Fair" meets "Financial Times Weekend"
- Weave the stories together thematically, don't list them separately
- Open with a compelling observation that connects the stories
- Include specific details (addresses, names, numbers) where available
- Close with a forward-looking insight about what this means for the neighborhood
- DO NOT use a greeting or sign-off
- DO NOT use markdown headers, bold, or formatting
- Write in flowing prose paragraphs

BAD: "Here are three things that happened this week."
GOOD: "While the city focused on the subway delays, the real story in ${neighborhoodName} this week was..."

Write exactly 200 words. No more, no less.`;

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

For each event found, provide: the day of the week, event name, venue, and why it matters.
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
  city: string
): Promise<HorizonEvent[]> {
  const prompt = `You are curating an event agenda for ultra-high-net-worth residents of ${neighborhoodName}, ${city}.

From these raw event listings, select the 3 most relevant and exclusive events:

${rawEvents}

CRITERIA:
- Relevance to wealthy, culturally sophisticated residents
- Exclusivity (private views, limited access, opening nights preferred)
- Variety across categories (don't pick 3 restaurant events)

Respond with ONLY this JSON:
\`\`\`json
{
  "events": [
    {"day": "Tuesday", "name": "Event Name at Venue", "whyItMatters": "One compelling sentence", "category": "High Culture"},
    {"day": "Thursday", "name": "Event Name", "whyItMatters": "One sentence", "category": "The Scene"},
    {"day": "Saturday", "name": "Event Name", "whyItMatters": "One sentence", "category": "Urban Nature"}
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
  city: string
): Promise<HorizonEvent[]> {
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const fromDate = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const toDate = nextWeek.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const prompt = `Search for the top 3 upcoming high-value events in ${neighborhoodName}, ${city} between ${fromDate} and ${toDate}.

Categories to consider:
1. High Culture & Arts (exhibitions, premieres, gallery openings)
2. Dining & Social (restaurant openings, exclusive pop-ups, galas)
3. Urban Nature & Public Space (park events, festivals)
4. Real Estate & Design (open houses, architecture tours)

Exclude tourist traps, comedy clubs, happy hours.

Respond with ONLY this JSON:
\`\`\`json
{
  "events": [
    {"day": "Tuesday", "name": "Event Name at Venue", "whyItMatters": "One sentence", "category": "High Culture"},
    {"day": "Thursday", "name": "Event Name", "whyItMatters": "One sentence", "category": "The Scene"},
    {"day": "Saturday", "name": "Event Name", "whyItMatters": "One sentence", "category": "Urban Nature"}
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
    `What is the current average residential listing price in ${n}, ${c}? Compare to last month. Provide one number and one sentence of context. If exact data unavailable, give the best available indicator.`,
  safety: (n, c) =>
    `What are the recent crime or safety statistics for ${n}, ${c}? Compare to last year same period. Provide one key metric and one sentence of context.`,
  environment: (n, c) =>
    `What is the current air quality or notable environmental condition in ${n}, ${c}? Provide one measurement and one sentence of context.`,
  flaneur_index: (n, c, co) => {
    const currency = co === 'USA' ? 'USD' : co === 'UK' ? 'GBP' : co === 'Sweden' ? 'SEK' : co === 'Australia' ? 'AUD' : 'local currency';
    return `What is the average price of a latte at premium cafes in ${n}, ${c}? Give the price in ${currency} and compare to the city average. This is our "Flaneur Index" - a lighthearted cost-of-living indicator.`;
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
      body += `${event.day}: ${event.name} \u2014 ${event.whyItMatters}\n\n`;
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
