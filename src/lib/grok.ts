/**
 * Grok API Integration
 * Uses xAI's Responses API with X Search for real-time local news
 *
 * Pricing (as of 2026):
 * - grok-4-1-fast: $0.20/1M input, $0.50/1M output
 * - X Search tool: $5 per 1,000 calls ($0.005/call)
 * - Web Search tool: $5 per 1,000 calls
 */

import { getSearchLocation } from '@/lib/neighborhood-utils';
import { AI_MODELS } from '@/config/ai-models';

const GROK_API_URL = 'https://api.x.ai/v1';
const GROK_MODEL = AI_MODELS.GROK_FAST;

interface XSearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  author?: string;
  published_at?: string;
}

interface GrokResponsesOutput {
  type: 'message';
  role: 'assistant';
  content: string;
}

interface GrokResponsesResponse {
  id: string;
  output: GrokResponsesOutput[];
  citations?: {
    title?: string;
    url?: string;
  }[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface NeighborhoodBrief {
  headline: string;
  content: string;
  sources: XSearchResult[];
  sourceCount: number;
  model: string;
  searchQuery: string;
}

interface GrokNewsStory {
  headline: string;
  body: string;
  previewText: string;
  sources: XSearchResult[];
  category: string;
}

/**
 * Generate a neighborhood brief using Grok Responses API with X Search
 *
 * @param neighborhoodName - Display name of the neighborhood
 * @param city - City name
 * @param country - Country name (optional)
 * @param nycDataContext - Optional NYC Open Data context to inject (permits, licenses, etc.)
 */
export async function generateNeighborhoodBrief(
  neighborhoodName: string,
  city: string,
  country?: string,
  nycDataContext?: string,
  timezone?: string
): Promise<NeighborhoodBrief | null> {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!apiKey) {
    console.error('Grok API key not configured (GROK_API_KEY or XAI_API_KEY)');
    return null;
  }

  const location = country
    ? getSearchLocation(neighborhoodName, city, country)
    : `${neighborhoodName}, ${city}`;

  // Calculate the local "today" date in the neighborhood's timezone
  const tz = timezone || 'America/New_York';
  const now = new Date();
  const localDateStr = now.toLocaleDateString('en-US', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const searchQuery = `What is happening in ${location} today ${localDateStr}? Local news, events, restaurant openings, community happenings.`;

  try {
    // Use the Responses API with built-in search tools
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
            content: `You are a local news researcher for ${location}. Your job is to find factual, recent news and happenings in the neighborhood by searching X and the web thoroughly.

IMPORTANT DATE CONTEXT: Today's date in ${location} is ${localDateStr}. When you say "today", you mean ${localDateStr}. All date references must match this local date.

Search for recent posts and news about ${location}. Focus on:
- Restaurant/bar/cafe openings or closings
- Local events happening today or this week
- Community news and developments
- Interesting local sightings
- Real estate and development news${nycDataContext ? `

ADDITIONAL CONTEXT FROM NYC PUBLIC DATA:
${nycDataContext}
You may weave this into your brief naturally, e.g., "Meanwhile, DOB records show..." or "In other news, a new liquor license was issued to..."` : ''}

After searching, create a brief "What's Happening Today" summary.

Format your response EXACTLY as:
HEADLINE: [Catchy headline, max 50 characters. Be specific - name the venue, event, or street. Never generic.]
CONTENT: [2-3 short paragraphs, each covering a different topic. Separate paragraphs with blank lines.]

Rules:
- Be specific with venue names, addresses, and locations.
- Keep paragraphs short and punchy (2-3 sentences each).
- Each paragraph should cover one distinct topic or story.
- Prioritize verified facts over rumors.
- If you don't find much, say so.
- DATE REFERENCES: When using relative time words (yesterday, today, tomorrow, Thursday, last week, etc.), ALWAYS include the explicit calendar date - e.g., "yesterday (February 19)", "this Thursday, February 20". Readers may see this days later.`
          },
          {
            role: 'user',
            content: searchQuery
          }
        ],
        tools: [
          { type: 'x_search' },
          { type: 'web_search' }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Grok Responses API failed:', response.status, error);
      throw new Error(`Grok API ${response.status}: ${error.slice(0, 200)}`);
    }

    const data = await response.json();

    // Debug: Log the response structure
    console.log('Grok response structure:', JSON.stringify(data, null, 2).slice(0, 500));

    // Extract the assistant's response - handle different response formats
    let responseText = '';

    if (data.output && Array.isArray(data.output)) {
      // Responses API format
      const assistantOutput = data.output.find((o: { type?: string; role?: string; content?: unknown }) =>
        o.type === 'message' && o.role === 'assistant'
      );
      const content = assistantOutput?.content;
      responseText = typeof content === 'string' ? content :
                     Array.isArray(content) ? content.map((c: { text?: string }) => c.text || '').join('') :
                     JSON.stringify(content);
    } else if (data.choices && Array.isArray(data.choices)) {
      // Chat completions format fallback
      const content = data.choices[0]?.message?.content;
      responseText = typeof content === 'string' ? content : JSON.stringify(content);
    } else if (typeof data === 'string') {
      responseText = data;
    }

    if (!responseText) {
      throw new Error(`No response content from Grok. Response keys: ${Object.keys(data || {}).join(', ')}`);
    }

    // Parse the response
    const headlineMatch = responseText.match(/HEADLINE:\s*(.+?)(?:\n|CONTENT:)/i);
    const contentMatch = responseText.match(/CONTENT:\s*([\s\S]+)/i);

    // Strip citation markers and URLs from headline (e.g., "[[1]](https://...)" or "[1]" or "(1)")
    const rawHeadline = headlineMatch?.[1]?.trim() || `What's Happening in ${neighborhoodName}`;
    const headline = rawHeadline
      .replace(/\[\[\d+\]\]\([^)]*\)/g, '') // [[1]](url)
      .replace(/\[\d+\]/g, '')              // [1]
      .replace(/\s*\(\d+\)/g, '')           // (1)
      .replace(/\s{2,}/g, ' ')              // collapse double spaces
      .trim();
    // Clean citation artifacts from Grok response
    const rawContent = contentMatch?.[1]?.trim() || responseText;
    const content = rawContent
      // Strip raw search result objects leaked from Grok tool output
      // Matches patterns like: {'title': '...', 'url': '...', 'snippet': ...}
      .replace(/\{['"](?:title|url|snippet|author|published_at)['"]:[^}]*(?:\}|$)/gm, '')
      .replace(/\.\(/g, '.')               // .( -> .
      .replace(/\.\s*\(\d+\)/g, '.')       // . (1) -> .
      .replace(/\s*\(\d+\)/g, '')          // inline (1) citation numbers
      .replace(/\(\s*\)/g, '')             // () empty parens
      .replace(/\(\s*$/gm, '')             // Orphaned ( at end of line
      .replace(/\u2014/g, ' - ')           // — (em dash) -> space-hyphen-space
      .replace(/\u2013/g, '-')             // – (en dash) -> hyphen
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Extract citations/sources
    const sources: XSearchResult[] = (data.citations || []).map((c: { title?: string; url?: string }) => ({
      title: c.title,
      url: c.url,
    }));

    return {
      headline,
      content,
      sources,
      sourceCount: sources.length,
      model: GROK_MODEL,
      searchQuery,
    };
  } catch (error) {
    console.error('Grok API error:', error);
    throw error;
  }
}

/**
 * Generate news stories for a neighborhood using Grok Responses API
 * Used as fallback when RSS feeds don't have enough content
 */
export async function generateGrokNewsStories(
  neighborhoodName: string,
  city: string,
  country: string | undefined,
  count: number = 5
): Promise<GrokNewsStory[]> {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!apiKey) {
    console.error('Grok API key not configured');
    return [];
  }

  const location = country
    ? getSearchLocation(neighborhoodName, city, country)
    : `${neighborhoodName}, ${city}`;

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
            content: `You are a local news researcher for ${location}. Your job is to find factual, recent news and happenings in the neighborhood by searching X and the web thoroughly.

Focus on:
- Restaurant/bar/cafe openings, closings, or changes
- Local events and happenings
- Community news and developments
- Interesting local sightings or discoveries
- Real estate and development news
- Local business news

Avoid:
- National/international politics
- Generic content not specific to the neighborhood
- Old news (focus on last 24-48 hours)
- Rumors without substance

DATE REFERENCES: When using relative time words (yesterday, today, tomorrow, Thursday, last week, etc.), ALWAYS include the explicit calendar date - e.g., "yesterday (February 19)", "this Thursday, February 20". Readers may see this days later.`
          },
          {
            role: 'user',
            content: `Search for recent news and posts about ${location}. Find ${count} distinct newsworthy stories from the last 24-48 hours.

For each story, provide:
1. HEADLINE: Engaging headline (max 50 chars, name the venue/event/street, never generic)
2. CATEGORY: One of [opening, closing, event, community, sighting, development, business]
3. PREVIEW: 1-2 sentence teaser
4. BODY: 2-3 paragraph article (150-250 words)

Format each story clearly separated by "---"`
          }
        ],
        tools: [
          { type: 'x_search' },
          { type: 'web_search' }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Grok news generation failed:', response.status, error);
      return [];
    }

    const data: GrokResponsesResponse = await response.json();

    const assistantOutput = data.output?.find(o => o.type === 'message' && o.role === 'assistant');
    const content = assistantOutput?.content || '';

    // Parse stories from response
    const stories: GrokNewsStory[] = [];
    const storyBlocks = content.split('---').filter(block => block.trim());

    for (const block of storyBlocks) {
      const headlineMatch = block.match(/HEADLINE:\s*(.+?)(?:\n|$)/i);
      const categoryMatch = block.match(/CATEGORY:\s*(.+?)(?:\n|$)/i);
      const previewMatch = block.match(/PREVIEW:\s*([\s\S]+?)(?:\n|BODY:)/i);
      const bodyMatch = block.match(/BODY:\s*([\s\S]+?)(?:---|$)/i);

      if (headlineMatch && bodyMatch) {
        // Strip em/en dashes from all text fields
        const stripDashes = (s: string) => s.replace(/\u2014/g, ' - ').replace(/\u2013/g, '-');
        // Strip citation markers from headline
        const cleanedHeadline = headlineMatch[1].trim()
          .replace(/\[\[\d+\]\]\([^)]*\)/g, '')
          .replace(/\[\d+\]/g, '')
          .replace(/\s*\(\d+\)/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        stories.push({
          headline: stripDashes(cleanedHeadline),
          category: categoryMatch?.[1]?.trim().toLowerCase() || 'community',
          previewText: stripDashes(previewMatch?.[1]?.trim() || ''),
          body: stripDashes(bodyMatch[1].trim()),
          sources: [],
        });
      }
    }

    return stories.slice(0, count);
  } catch (error) {
    console.error('Grok news generation error:', error);
    return [];
  }
}

/**
 * Generate a forward-looking neighborhood brief using Grok Responses API
 * Covers tomorrow and the next 7 days: events, openings, exhibitions, community meetings, etc.
 */
export async function generateLookAhead(
  neighborhoodName: string,
  city: string,
  country?: string
): Promise<NeighborhoodBrief | null> {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!apiKey) {
    console.error('Grok API key not configured (GROK_API_KEY or XAI_API_KEY)');
    return null;
  }

  const location = country
    ? getSearchLocation(neighborhoodName, city, country)
    : `${neighborhoodName}, ${city}`;

  // This cron runs at 8 PM UTC but publishes at 7 AM local time the next morning.
  // Frame the search as "tomorrow" from the reader's perspective.
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const searchQuery = `What events, openings, and happenings are coming up in ${location} tomorrow and over the next 7 days?`;

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
            content: `You are a local events researcher for ${location}. Your job is to find factual, confirmed upcoming events by searching X and the web thoroughly.

IMPORTANT TIMING CONTEXT: This content will be published at 7 AM local time tomorrow morning (${tomorrowStr}). When you write "tomorrow", you mean the day AFTER ${tomorrowStr}. When you write "today", you mean ${tomorrowStr}. Frame all dates from the reader's perspective of reading this at 7 AM on ${tomorrowStr}.

Search X and the web for upcoming events, openings, and happenings in ${location} starting from ${tomorrowStr} and over the following 7 days. Focus on:
- Confirmed events with specific dates and times
- Restaurant, bar, or cafe openings
- Art exhibitions, gallery openings, museum events
- Community meetings, town halls, local government events
- Sports events, races, outdoor activities
- Seasonal happenings (markets, festivals, pop-ups)
- Theater, music, and performance events

CRITICAL RULES:
- ONLY include events that are CONFIRMED and upcoming (${tomorrowStr} through the following 7 days)
- NEVER include past events or vague "coming soon" items without dates
- Every item MUST have a specific date or date range
- If you cannot find upcoming events, say so honestly

After searching, create a "Look Ahead" summary.

Format your response EXACTLY as:
HEADLINE: [Catchy headline, max 50 characters. Be specific - name the event or venue. Never generic.]
CONTENT: [Organize by "Today" (meaning ${tomorrowStr}) then "This Week". Each item: what it is, where, when, and why it matters. Separate sections with blank lines.]

Rules:
- Be specific with venue names, addresses, dates, and times.
- Each entry should cover one distinct event or happening.
- Prioritize verified facts over rumors.
- If you don't find much, say so.
- Do NOT include any greeting like "Good morning" or sign-off. Jump directly into the content.
- DATE REFERENCES: When using relative time words (yesterday, today, tomorrow, Thursday, this weekend, etc.), ALWAYS include the explicit calendar date - e.g., "this Thursday, February 20", "this weekend (February 22-23)". Readers may see this days later.
- Do NOT include citation references like [[1]] or (1) in the HEADLINE.
- NEVER use passive, defeatist, or "nothing happening" headlines. There is ALWAYS something worth highlighting. Banned headline patterns: "Quiet Week", "Slow Week", "Not Much Going On", "A Calm Week", "Nothing Major". Always lead with the most interesting specific event or venue name.
- EXCLUDE long-running tourist attractions and permanent shows (e.g., "Mamma Mia!", "The Lion King", "Phantom of the Opera", museum permanent exhibitions). Only include these if something genuinely unusual is happening (closing, cast change, anniversary, special event). Focus on events that are NEW or time-limited for local residents.`
          },
          {
            role: 'user',
            content: searchQuery
          }
        ],
        tools: [
          { type: 'x_search' },
          { type: 'web_search' }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Grok Look Ahead API failed:', response.status, error);
      throw new Error(`Grok API ${response.status}: ${error.slice(0, 200)}`);
    }

    const data = await response.json();

    // Extract the assistant's response
    let responseText = '';

    if (data.output && Array.isArray(data.output)) {
      const assistantOutput = data.output.find((o: { type?: string; role?: string; content?: unknown }) =>
        o.type === 'message' && o.role === 'assistant'
      );
      const content = assistantOutput?.content;
      responseText = typeof content === 'string' ? content :
                     Array.isArray(content) ? content.map((c: { text?: string }) => c.text || '').join('') :
                     JSON.stringify(content);
    } else if (data.choices && Array.isArray(data.choices)) {
      const content = data.choices[0]?.message?.content;
      responseText = typeof content === 'string' ? content : JSON.stringify(content);
    } else if (typeof data === 'string') {
      responseText = data;
    }

    if (!responseText) {
      throw new Error(`No response content from Grok. Response keys: ${Object.keys(data || {}).join(', ')}`);
    }

    // Parse the response
    const headlineMatch = responseText.match(/HEADLINE:\s*(.+?)(?:\n|CONTENT:)/i);
    const contentMatch = responseText.match(/CONTENT:\s*([\s\S]+)/i);

    const rawHeadline = headlineMatch?.[1]?.trim() || `What's Coming Up in ${neighborhoodName}`;
    // Strip citation markers and URLs from headline (e.g., "[[1]](https://...)" or "(1)")
    const headline = rawHeadline
      .replace(/\[\[\d+\]\]\([^)]*\)/g, '') // [[1]](url)
      .replace(/\[\d+\]/g, '')              // [1]
      .replace(/\s*\(\d+\)/g, '')           // (1)
      .replace(/https?:\/\/\S+/g, '')       // bare URLs
      .replace(/\s{2,}/g, ' ')              // collapse whitespace
      .trim();
    const rawContent = contentMatch?.[1]?.trim() || responseText;
    const content = rawContent
      .replace(/\{['"](?:title|url|snippet|author|published_at)['"]:[^}]*(?:\}|$)/gm, '')
      .replace(/\.\(/g, '.')
      .replace(/\.\s*\(\d+\)/g, '.')
      .replace(/\s*\(\d+\)/g, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\(\s*$/gm, '')
      .replace(/\u2014/g, ' - ')
      .replace(/\u2013/g, '-')
      // Strip greeting lines (Grok sometimes adds these despite instructions)
      .replace(/^(Good morning|God morgon|Bonjour|Buongiorno|Goedemorgen|Buenos d[ií]as|Guten Morgen|Bom dia|Morning),?\s*[^\n]*\.\s*\n+/i, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Extract citations/sources
    const sources: XSearchResult[] = (data.citations || []).map((c: { title?: string; url?: string }) => ({
      title: c.title,
      url: c.url,
    }));

    return {
      headline,
      content,
      sources,
      sourceCount: sources.length,
      model: GROK_MODEL,
      searchQuery,
    };
  } catch (error) {
    console.error('Grok Look Ahead error:', error);
    throw error;
  }
}

/**
 * Generic event search using Grok Responses API with web + X search.
 * Used by crons that need to discover real-world events (auctions, galas, exhibitions, etc.)
 *
 * @param systemPrompt - System prompt with search instructions
 * @param userPrompt - User prompt describing what to search for
 * @returns Raw text response from Grok (caller parses into its own interface), or null on failure
 */
export async function grokEventSearch(
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!apiKey) {
    console.error('Grok API key not configured (GROK_API_KEY or XAI_API_KEY)');
    return null;
  }

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          { type: 'web_search' },
          { type: 'x_search' },
        ],
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Grok event search failed:', response.status, error.slice(0, 200));
      return null;
    }

    const data = await response.json();

    // Extract response text from Responses API format
    let responseText = '';

    if (data.output && Array.isArray(data.output)) {
      const assistantOutput = data.output.find((o: { type?: string; role?: string; content?: unknown }) =>
        o.type === 'message' && o.role === 'assistant'
      );
      const content = assistantOutput?.content;
      responseText = typeof content === 'string' ? content :
                     Array.isArray(content) ? content.map((c: { text?: string }) => c.text || '').join('') :
                     JSON.stringify(content);
    } else if (data.choices && Array.isArray(data.choices)) {
      const content = data.choices[0]?.message?.content;
      responseText = typeof content === 'string' ? content : JSON.stringify(content);
    }

    return responseText || null;
  } catch (error) {
    console.error('Grok event search error:', error);
    return null;
  }
}

/**
 * Check if Grok API is configured and available
 */
export function isGrokConfigured(): boolean {
  return !!(process.env.GROK_API_KEY || process.env.XAI_API_KEY);
}

/**
 * Generic Grok generation with optional web/X search
 * Used for flexible content generation tasks
 */
export async function generateWithGrok(
  prompt: string,
  options?: {
    systemPrompt?: string;
    enableSearch?: boolean;
    temperature?: number;
  }
): Promise<string | null> {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!apiKey) {
    console.error('Grok API key not configured');
    return null;
  }

  const { systemPrompt, enableSearch = true, temperature = 0.7 } = options || {};

  try {
    const tools = enableSearch ? [{ type: 'x_search' }, { type: 'web_search' }] : undefined;

    const input = systemPrompt
      ? [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ]
      : [{ role: 'user', content: prompt }];

    const response = await fetch(`${GROK_API_URL}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        input,
        tools,
        temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Grok API failed:', response.status, error);
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
    } else if (data.choices && Array.isArray(data.choices)) {
      const content = data.choices[0]?.message?.content;
      responseText = typeof content === 'string' ? content : JSON.stringify(content);
    }

    return responseText || null;
  } catch (error) {
    console.error('Grok generation error:', error);
    return null;
  }
}
