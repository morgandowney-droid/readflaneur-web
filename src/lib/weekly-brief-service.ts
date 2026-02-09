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

/**
 * Strip category label prefixes from headlines.
 * e.g., "[Real Estate Weekly] Tribeca Real Estate..." → "Tribeca Real Estate..."
 * Also strips "DAILY BRIEF:" and "News Brief:" prefixes.
 */
function stripCategoryPrefix(headline: string): string {
  return headline
    .replace(/^\[.*?\]\s*/i, '')           // [Category Label] prefix
    .replace(/^[\w\s]+DAILY BRIEF:\s*/i, '') // "Tribeca DAILY BRIEF:" prefix
    .replace(/^News Brief:\s*/i, '')        // "News Brief:" prefix
    .trim();
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

export interface HolidayEvent {
  name: string;
  day: string;       // e.g., "Friday Feb 13 7pm"
  description: string;
}

export interface HolidaySection {
  holidayName: string;
  date: string;       // e.g., "Saturday, February 14"
  events: HolidayEvent[];
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
  holidaySection?: HolidaySection | null;
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
    narrative = `A quiet week in ${neighborhoodName}. No drama, no surprises - just the neighborhood humming along in its familiar rhythm.\n\nSometimes the absence of news is itself a signal. The streets are calm, the cafes are full, and nothing has disrupted the daily routine worth reporting.`;
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

  // Sort horizon events chronologically (closest date first)
  horizonEvents.sort((a, b) => parseEventDayForSort(a.day) - parseEventDayForSort(b.day));

  // ─── Holiday Section: That Time of Year ───
  let holidaySection: HolidaySection | null = null;
  const upcomingHoliday = detectUpcomingHoliday(country);
  if (upcomingHoliday) {
    console.log(`[SundayEdition] ${neighborhoodName}: detected holiday "${upcomingHoliday.name}" on ${upcomingHoliday.date.toDateString()}`);
    try {
      holidaySection = await generateHolidaySection(
        genAI,
        grokKey,
        upcomingHoliday,
        neighborhoodName,
        city,
        country,
        timeFormat,
      );
      if (holidaySection.events.length === 0) {
        console.log(`[SundayEdition] ${neighborhoodName}: no holiday events found, skipping section`);
        holidaySection = null;
      }
    } catch (err) {
      console.error(`[SundayEdition] Holiday section error:`, err);
      holidaySection = null;
    }
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
      headline: stripCategoryPrefix(stripDashes(s.headline)),
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
    holidaySection,
  };
}

// ─── Section 1 Helpers ───

async function significanceFilter(
  genAI: GoogleGenAI,
  headlineList: string,
  neighborhoodName: string,
  city: string
): Promise<{ stories: RearviewStory[] }> {
  const prompt = `You are a well-travelled, successful 35-year-old who has lived in ${neighborhoodName}, ${city} for years. You know every corner of the neighborhood - the hidden gems, the local drama, the new openings before anyone else does.

Pick the 3 stories from this past week that matter most for residents who live here.

STORIES:
${headlineList}

SELECTION CRITERIA:
1. Anything that affects property values (zoning changes, landmark sales, new developments)
2. Anything that permanently changes the neighborhood (restaurant openings, school changes, cultural institutions)
3. Anything that affects safety (real patterns, not petty stuff)

IGNORE: Tourist drama, weather complaints, celebrity sightings, routine city noise.

IMPORTANT: Strip any category prefixes like "[Real Estate Weekly]" or "[News Brief]" from headlines. Return clean headlines only.

TONE: Knowledgeable but not pretentious. You present information conversationally, like telling a friend what happened this week.
Do NOT use lowbrow words like "ya", "folks", "eats", "grub", "spot". The reader is well-educated and prefers polished language.

Respond with ONLY this JSON (no other text):
\`\`\`json
{
  "stories": [
    {"headline": "Clean headline without category prefix", "significance": "One sentence on why this matters"},
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

  const prompt = `You are a well-travelled, successful 35-year-old who has lived in ${neighborhoodName}, ${city} for years. You know every corner of the neighborhood - the hidden gems, the local drama, the new openings before anyone else does.

Write a 200-word weekly synthesis weaving these 3 stories into a cohesive narrative for fellow residents.

${storyContext}

STYLE GUIDE:
- Knowledgeable but not pretentious
- Deadpan humor when appropriate
- You drop specific details that only a local would know (exact addresses, which corner, who owns what)
- You present information conversationally, like telling a friend what's happening in the neighborhood
- Open with a compelling observation that connects the stories
- Close with a forward-looking insight about what this means for the neighborhood

TONE AND VOCABULARY:
- Do NOT use lowbrow or overly casual words like "ya", "folks", "eats", "grub", "spot" (for restaurant)
- The reader is well-educated and prefers polished language without slang
- NEVER use em dashes or en dashes. Use hyphens (-) instead.

STRUCTURE:
- Write in exactly 4 short paragraphs separated by blank lines (each paragraph 2-3 sentences max)
- NO greeting or sign-off. NO markdown, bold, or formatting.
- Approximately 200 words total.`;

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
  environment: (n, c, co) => {
    const useF = co === 'USA' || co === 'US' || co === 'United States';
    const unit = useF ? '°F' : '°C';
    const example = useF ? '45°F' : '12°C';
    return `What is the current temperature in ${n}, ${c}? Provide the temperature in ${unit} ONLY as the value (e.g., "${example}") and one sentence of context about current weather conditions. Do NOT use AQI or air quality index. Do NOT include both °F and °C - use ${unit} only. VOICE: Write as a local insider using "we/our" - e.g., "We're staying indoors today" or "${n} is dealing with a cold snap." NEVER say "Residents are." NEVER use em dashes.`;
  },
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
  "value": "The key number or metric (e.g., '$4.2M', '12% decrease')",
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

// ─── Holiday Detection & Generation ───

interface HolidayDef {
  name: string;
  getDate: (year: number) => Date;
  countries: string[];
}

/** Easter Sunday via Butcher's algorithm. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Nth weekday of a month (weekday: 0=Sun..6=Sat, n: 1-based). */
function nthWeekdayOf(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month - 1, 1);
  const diff = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month - 1, 1 + diff + (n - 1) * 7);
}

/** Last weekday of a month. */
function lastWeekdayOf(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month, 0);
  const diff = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month - 1, last.getDate() - diff);
}

const HOLIDAYS: HolidayDef[] = [
  { name: "New Year's Day", getDate: (y) => new Date(y, 0, 1), countries: ['all'] },
  { name: "Valentine's Day", getDate: (y) => new Date(y, 1, 14), countries: ['all'] },
  { name: "St. Patrick's Day", getDate: (y) => new Date(y, 2, 17), countries: ['USA', 'Ireland', 'UK', 'Canada', 'Australia', 'New Zealand'] },
  { name: "Easter", getDate: easterSunday, countries: ['all'] },
  { name: "Cinco de Mayo", getDate: (y) => new Date(y, 4, 5), countries: ['USA'] },
  { name: "Memorial Day", getDate: (y) => lastWeekdayOf(y, 5, 1), countries: ['USA'] },
  { name: "Canada Day", getDate: (y) => new Date(y, 6, 1), countries: ['Canada'] },
  { name: "Independence Day", getDate: (y) => new Date(y, 6, 4), countries: ['USA'] },
  { name: "Bastille Day", getDate: (y) => new Date(y, 6, 14), countries: ['France'] },
  { name: "National Day", getDate: (y) => new Date(y, 7, 9), countries: ['Singapore'] },
  { name: "Halloween", getDate: (y) => new Date(y, 9, 31), countries: ['USA', 'UK', 'Ireland', 'Canada', 'Australia', 'New Zealand'] },
  { name: "Guy Fawkes Night", getDate: (y) => new Date(y, 10, 5), countries: ['UK'] },
  { name: "Thanksgiving", getDate: (y) => nthWeekdayOf(y, 11, 4, 4), countries: ['USA'] },
  { name: "Christmas", getDate: (y) => new Date(y, 11, 25), countries: ['all'] },
  { name: "New Year's Eve", getDate: (y) => new Date(y, 11, 31), countries: ['all'] },
  { name: "Midsommar", getDate: (y) => {
    const d = new Date(y, 5, 19);
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
    return d;
  }, countries: ['Sweden'] },
  { name: "Australia Day", getDate: (y) => new Date(y, 0, 26), countries: ['Australia'] },
  { name: "ANZAC Day", getDate: (y) => new Date(y, 3, 25), countries: ['Australia', 'New Zealand'] },
  { name: "Labor Day", getDate: (y) => nthWeekdayOf(y, 9, 1, 1), countries: ['USA'] },
];

/**
 * Detect if a major holiday falls within the next 7 days for this country.
 */
function detectUpcomingHoliday(country: string): { name: string; date: Date } | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 7);

  for (const holiday of HOLIDAYS) {
    if (!holiday.countries.includes('all') && !holiday.countries.includes(country)) continue;

    const holidayDate = holiday.getDate(now.getFullYear());
    holidayDate.setHours(0, 0, 0, 0);
    if (holidayDate >= now && holidayDate <= endDate) {
      return { name: holiday.name, date: holidayDate };
    }
  }
  return null;
}

/**
 * Search for holiday events via Grok X Search.
 */
async function searchHolidayEvents(
  grokKey: string,
  holidayName: string,
  neighborhoodName: string,
  city: string,
  country: string,
): Promise<string | null> {
  const searchLocation = getSearchLocation(neighborhoodName, city, country);

  const prompt = `Search for ${holidayName} events, celebrations, and special happenings in ${searchLocation} this year. Include restaurant specials, pop-ups, community events, parties, and any notable ${holidayName}-themed activities happening this week. Find at least 5-8 events with dates, times, venues, and descriptions.`;

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
            content: `You are a local event scout for residents of ${neighborhoodName}, ${city}. Find the best ${holidayName} events and celebrations happening nearby.`,
          },
          { role: 'user', content: prompt },
        ],
        tools: [{ type: 'x_search' }, { type: 'web_search' }],
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      console.error(`[SundayEdition] Holiday Grok error: ${response.status}`);
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
    console.error('[SundayEdition] Holiday Grok search error:', err);
    return null;
  }
}

/**
 * Curate holiday events via Gemini (with Google Search grounding as fallback).
 */
async function curateHolidayEvents(
  genAI: GoogleGenAI,
  holidayName: string,
  rawEvents: string | null,
  neighborhoodName: string,
  city: string,
  timeFormat: string,
): Promise<HolidayEvent[]> {
  const searchContext = rawEvents
    ? `FOUND EVENTS:\n${rawEvents}`
    : `No specific events found from search. Use Google Search to find ${holidayName} events in ${neighborhoodName}, ${city}.`;

  const prompt = `You are a local insider in ${neighborhoodName}, ${city}. Pick the 3 best ${holidayName} events or happenings in and around the neighborhood.

${searchContext}

CRITERIA:
- Exclusive or unique events over generic ones
- Neighborhood-specific over city-wide when possible
- Quality dining specials, pop-ups, or cultural events over chain promotions
- Include a mix of event types (dining, cultural, community)

FORMAT:
- "name": The event or venue name
- "day": Weekday, date and time in ${timeFormat} format (e.g., "Friday Feb 13 7pm" or "Friday Feb 13 19:00")
- "description": One sentence about why this is worth attending, written as a local insider
- NEVER use em dashes or en dashes. Use hyphens (-) instead.

Respond with ONLY this JSON:
\`\`\`json
{
  "events": [
    {"name": "Event/Venue Name", "day": "Saturday Feb 14 7pm", "description": "One insider sentence about why this is worth your time."},
    {"name": "Event Name", "day": "Friday Feb 13 8pm", "description": "One sentence."},
    {"name": "Event Name", "day": "Saturday Feb 14 6pm", "description": "One sentence."}
  ]
}
\`\`\``;

  try {
    const useSearch = !rawEvents;
    const response = await genAI.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
        temperature: 0.5,
      },
    });

    const text = response.text || '';
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*"events"[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr.trim());
      if (parsed.events && Array.isArray(parsed.events)) {
        return parsed.events.slice(0, 3).map((e: HolidayEvent) => ({
          ...e,
          description: stripDashes(e.description),
          name: stripDashes(e.name),
        }));
      }
    }
  } catch (err) {
    console.error('[SundayEdition] Holiday event curation error:', err);
  }

  return [];
}

/**
 * Generate the complete holiday section for the Sunday Edition.
 */
async function generateHolidaySection(
  genAI: GoogleGenAI,
  grokKey: string | undefined,
  holiday: { name: string; date: Date },
  neighborhoodName: string,
  city: string,
  country: string,
  timeFormat: string,
): Promise<HolidaySection> {
  const dateStr = holiday.date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  let rawEvents: string | null = null;
  if (grokKey) {
    rawEvents = await searchHolidayEvents(grokKey, holiday.name, neighborhoodName, city, country);
  }

  const events = await curateHolidayEvents(genAI, holiday.name, rawEvents, neighborhoodName, city, timeFormat);

  return {
    holidayName: holiday.name,
    date: dateStr,
    events,
  };
}

// ─── Event Sorting ───

/**
 * Parse an event day string (e.g., "Tuesday Feb 10 6pm") into a timestamp for sorting.
 */
function parseEventDayForSort(dayStr: string): number {
  const match = dayStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/i);
  if (!match) return 0;

  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const month = months[match[1].toLowerCase()];
  const day = parseInt(match[2]);
  if (month === undefined || isNaN(day)) return 0;

  let hour = 0;
  const time12 = dayStr.match(/(\d{1,2})(am|pm)/i);
  const time24 = dayStr.match(/(\d{1,2}):(\d{2})/);
  if (time12) {
    hour = parseInt(time12[1]);
    if (time12[2].toLowerCase() === 'pm' && hour !== 12) hour += 12;
    if (time12[2].toLowerCase() === 'am' && hour === 12) hour = 0;
  } else if (time24) {
    hour = parseInt(time24[1]);
  }

  const year = new Date().getFullYear();
  return new Date(year, month, day, hour).getTime();
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

  // Holiday Section: That Time of Year
  if (content.holidaySection && content.holidaySection.events.length > 0) {
    body += `[[That Time of Year: ${content.holidaySection.holidayName}]]\n`;
    body += `${content.holidaySection.date}\n\n`;
    for (const event of content.holidaySection.events) {
      body += `${event.day}: ${event.name} - ${event.description}\n\n`;
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
