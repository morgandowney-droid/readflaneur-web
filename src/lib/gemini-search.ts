/**
 * Gemini Search - Parallel fact-gathering using Google Search grounding.
 *
 * Runs alongside Grok to provide supplemental facts from Google's index,
 * reaching official event calendars, local news sites, and business listings
 * that Grok's X-heavy search surface misses.
 *
 * Used by: sync-neighborhood-briefs, generate-look-ahead, weekly-brief-service
 */

import { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';
import type { StructuredEvent } from './look-ahead-events';

const RETRY_DELAYS = [2000, 5000, 15000]; // 2s, 5s, 15s exponential backoff

/**
 * Search for supplemental neighborhood facts via Gemini with Google Search grounding.
 * Focuses on what Grok misses: official calendars, local news, business press, city government.
 *
 * @param neighborhoodName - Display name (or comma-separated component names for combos)
 * @param city - City name
 * @param country - Country name
 * @param timezone - IANA timezone string
 * @param recentTopics - Headlines from last 5 briefs to avoid repetition
 */
export async function searchNeighborhoodFacts(
  neighborhoodName: string,
  city: string,
  country?: string,
  timezone?: string,
  recentTopics?: string[]
): Promise<{ facts: string; sourceCount: number } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const genAI = new GoogleGenAI({ apiKey });
  const tz = timezone || 'America/New_York';
  const now = new Date();
  const localDateStr = now.toLocaleDateString('en-US', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const location = country
    ? `${neighborhoodName}, ${city}, ${country}`
    : `${neighborhoodName}, ${city}`;

  const avoidBlock = recentTopics && recentTopics.length > 0
    ? `\n\nAVOID repeating these recently covered topics:\n${recentTopics.map(t => `- ${t}`).join('\n')}\nFind DIFFERENT stories and angles instead.`
    : '';

  const prompt = `Search for recent news and happenings in ${location} as of ${localDateStr}. Focus specifically on sources that a social media search would miss:

1. Local newspaper articles and neighborhood blogs published in the last 48 hours
2. Official event calendars (galleries, museums, cultural centers, community boards)
3. Restaurant and retail openings/closings from local business press
4. City government announcements (permits, zoning, infrastructure projects)
5. Real estate listings and market movements from property sites
6. Community board meeting agendas and outcomes

DO NOT search X/Twitter or social media - another system handles that.
DO focus on official institutional sources, local journalism, and business directories.

Return your findings as a bullet-point list of distinct facts. Each bullet should be one factual finding with its source. Include 5-10 facts if available.

Format each bullet as:
- [FACT]: What happened or is happening, with specific names, dates, addresses. (Source: publication or site name)
${avoidBlock}`;

  try {
    const response = await callGeminiWithRetry(genAI, prompt, `You are a local news researcher for ${location}. Search Google for recent news, events, and developments. Today is ${localDateStr}.`);

    const text = response?.text?.trim();
    if (!text || text.length < 50) return null;

    // Count bullet points as a rough source count
    const bulletCount = (text.match(/^-\s/gm) || []).length;

    return {
      facts: text,
      sourceCount: Math.max(bulletCount, 1),
    };
  } catch (err) {
    console.error(`[gemini-search] searchNeighborhoodFacts failed for ${neighborhoodName}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Search for upcoming events via Gemini with Google Search grounding.
 * Targets institutional sources: gallery calendars, museum schedules, event listings.
 *
 * @param neighborhoodName - Display name
 * @param city - City name
 * @param country - Country name
 * @param timezone - IANA timezone string
 * @param targetLocalDate - YYYY-MM-DD of the publication date in local time
 */
export async function searchUpcomingEvents(
  neighborhoodName: string,
  city: string,
  country?: string,
  timezone?: string,
  targetLocalDate?: string
): Promise<{ events: string; structuredEvents: StructuredEvent[]; sourceCount: number } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const genAI = new GoogleGenAI({ apiKey });
  const tz = timezone || 'America/New_York';

  // Compute date range: target date + 7 days
  const localDate = targetLocalDate || new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const [year, month, day] = localDate.split('-').map(Number);
  const startDate = new Date(year, month - 1, day);
  const endDate = new Date(year, month - 1, day + 7);

  const fromStr = startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const toStr = endDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const location = country
    ? `${neighborhoodName}, ${city}, ${country}`
    : `${neighborhoodName}, ${city}`;

  const prompt = `Search for upcoming events in ${location} from ${fromStr} through ${toStr}.

Search specifically for:
1. Gallery exhibitions and opening receptions with dates
2. Museum special exhibitions and schedule changes
3. Restaurant opening announcements and soft opening dates
4. Concert, theater, and live music listings at local venues
5. Farmers markets, pop-up events, and street fairs
6. Community board meetings and public hearings
7. Sports events at local venues
8. Food festivals, wine tastings, book signings

For each event found, provide: the specific date (YYYY-MM-DD), day of week, time if available, event name, category, venue name, address, and price if listed.

IMPORTANT: Only include events with confirmed dates within the ${fromStr} to ${toStr} window. Skip anything without a specific date.

After listing all events, output a JSON array in this exact format:
EVENTS_JSON:
[
  {"date": "YYYY-MM-DD", "day_label": "Saturday", "time": "19:00", "name": "Event Name", "category": "Art Exhibition", "location": "Venue Name", "address": "123 Main St", "price": "Free"},
  ...
]

List the events in prose first, then the JSON array.`;

  try {
    const response = await callGeminiWithRetry(genAI, prompt, `You are an events researcher for ${location}. Search Google for upcoming events, exhibitions, performances, and happenings. Focus on official event calendars and listing sites.`);

    const text = response?.text?.trim();
    if (!text || text.length < 50) return null;

    // Parse EVENTS_JSON from response
    let structuredEvents: StructuredEvent[] = [];
    const jsonMatch = text.match(/EVENTS_JSON:\s*\n?\s*(\[[\s\S]*?\])/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed)) {
          structuredEvents = parsed
            .filter((e: Record<string, unknown>) => e.date && e.name)
            .map((e: Record<string, unknown>) => ({
              date: String(e.date || ''),
              day_label: String(e.day_label || ''),
              time: e.time ? String(e.time) : null,
              name: String(e.name || ''),
              category: e.category ? String(e.category) : null,
              location: e.location ? String(e.location) : null,
              address: e.address ? String(e.address) : null,
              price: e.price ? String(e.price) : null,
            }));
        }
      } catch {
        console.warn('[gemini-search] Failed to parse EVENTS_JSON');
      }
    }

    // Extract prose (everything before EVENTS_JSON)
    const proseEnd = text.indexOf('EVENTS_JSON:');
    const prose = proseEnd > -1 ? text.substring(0, proseEnd).trim() : text;

    const bulletCount = (prose.match(/^[-\d]/gm) || []).length;

    return {
      events: prose,
      structuredEvents,
      sourceCount: Math.max(bulletCount, structuredEvents.length, 1),
    };
  } catch (err) {
    console.error(`[gemini-search] searchUpcomingEvents failed for ${neighborhoodName}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Merge Grok content with Gemini supplemental facts.
 * If both exist, appends Gemini facts with an "ALSO NOTED" label so the
 * downstream enrichment step (Gemini Pro) understands the supplemental material.
 */
export function mergeContent(
  grokContent: string | null,
  geminiContent: string | null
): string {
  if (grokContent && geminiContent) {
    return `${grokContent}\n\nALSO NOTED:\n${geminiContent}`;
  }
  return grokContent || geminiContent || '';
}

/**
 * Merge and deduplicate structured events from Grok and Gemini.
 * Deduplicates by lowercase event name similarity (if name A contains name B
 * or vice versa, keeps the one with more populated fields).
 * Sorts chronologically by date.
 */
export function mergeStructuredEvents(
  grokEvents: StructuredEvent[],
  geminiEvents: StructuredEvent[]
): StructuredEvent[] {
  if (grokEvents.length === 0) return geminiEvents;
  if (geminiEvents.length === 0) return grokEvents;

  const merged: StructuredEvent[] = [...grokEvents];

  for (const geminiEvent of geminiEvents) {
    const geminiName = geminiEvent.name.trim().toLowerCase();
    const isDuplicate = merged.some(existing => {
      const existingName = existing.name.trim().toLowerCase();
      // Check if one name contains the other (fuzzy dedup)
      return existingName.includes(geminiName) ||
        geminiName.includes(existingName) ||
        // Also check same date + very similar short names
        (existing.date === geminiEvent.date && nameSimilarity(existingName, geminiName) > 0.7);
    });

    if (!isDuplicate) {
      merged.push(geminiEvent);
    }
  }

  // Sort chronologically by date, then by time
  return merged.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    const timeA = a.time?.match(/\d{1,2}:\d{2}/)?.[0] || '99:99';
    const timeB = b.time?.match(/\d{1,2}:\d{2}/)?.[0] || '99:99';
    return timeA.localeCompare(timeB);
  });
}

/**
 * Simple word-overlap similarity for event name dedup.
 * Returns 0-1 ratio of shared words.
 */
function nameSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.min(wordsA.size, wordsB.size);
}

/**
 * Call Gemini Flash with Google Search grounding and retry on quota errors.
 */
async function callGeminiWithRetry(
  genAI: GoogleGenAI,
  prompt: string,
  systemInstruction: string
): Promise<{ text: string } | null> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await genAI.models.generateContent({
        model: AI_MODELS.GEMINI_FLASH,
        contents: `${systemInstruction}\n\n${prompt}`,
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.5,
        },
      });
      return { text: response.text || '' };
    } catch (err: unknown) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isQuotaError = errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429');

      if (!isQuotaError || attempt >= RETRY_DELAYS.length) {
        throw err;
      }

      console.warn(`[gemini-search] Quota hit (attempt ${attempt + 1}/${RETRY_DELAYS.length + 1}), retrying in ${RETRY_DELAYS[attempt]}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
    }
  }

  throw lastError || new Error('Gemini search failed after retries');
}
