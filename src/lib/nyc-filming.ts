/**
 * NYC Filming Location Watch Service
 *
 * Fetches NYC Film Permits and generates "Set Life" stories for Flâneur residents.
 * Data source: NYC Open Data - Film Permits
 *
 * Features:
 * - Geofenced to Flâneur NYC coverage areas via zip codes
 * - Filters for premium productions (TV, Film, Commercial)
 * - Extracts street-level impact from parking_held field
 * - Generates insider-tone stories via Gemini
 */

import { GoogleGenAI } from '@google/genai';
import {
  FLANEUR_NYC_CONFIG,
  ALL_TARGET_ZIPS,
  getNeighborhoodKeyFromZip,
  NEIGHBORHOOD_ID_TO_CONFIG,
} from '@/config/nyc-locations';

// NYC Open Data Film Permits endpoint
const NYC_FILM_PERMITS_API = 'https://data.cityofnewyork.us/resource/tg4x-b46p.json';

// Gemini model for story generation
const GEMINI_MODEL = 'gemini-2.0-flash';

// Known major productions (for prioritization)
const KNOWN_PRODUCTIONS = [
  'law & order',
  'law and order',
  'svu',
  'organized crime',
  'and just like that',
  'sex and the city',
  'succession',
  'billions',
  'mr. robot',
  'gossip girl',
  'blue bloods',
  'manifest',
  'the gilded age',
  'only murders',
  'the marvelous mrs. maisel',
  'maisel',
  'bull',
  'fbi',
  'new amsterdam',
  'evil',
  'person of interest',
  'elementary',
  'madam secretary',
  'the blacklist',
  'younger',
  'girls',
  'pose',
  'russian doll',
  'high maintenance',
  'broad city',
  'master of none',
];

// Categories to include
const PREMIUM_CATEGORIES = ['Television', 'Feature', 'Commercial', 'WEB'];

// Categories to exclude
const EXCLUDED_CATEGORIES = ['Student', 'Still Photography', 'Theater'];

/**
 * Raw film permit from NYC Open Data
 */
interface RawFilmPermit {
  event_id?: string;
  event_type?: string;
  start_date_time?: string;
  end_date_time?: string;
  entered_on?: string;
  event_agency?: string;
  parking_held?: string;
  borough?: string;
  community_board_s_?: string;
  police_precinct_s_?: string;
  category?: string;
  sub_category_name?: string;
  country?: string;
  zipcode_s_?: string;
}

/**
 * Transformed filming event
 */
export interface FilmingEvent {
  eventId: string;
  projectName: string;
  category: string;
  subCategory?: string;
  neighborhood: string;
  neighborhoodId: string;
  streets: string[];
  parkingHeld: string;
  startDate: string;
  endDate: string;
  impact: 'High' | 'Medium' | 'Low';
  isKnownProduction: boolean;
  borough: string;
  rawData: Record<string, unknown>;
}

/**
 * Generated filming story
 */
export interface FilmingStory {
  eventId: string;
  neighborhoodId: string;
  headline: string;
  body: string;
  previewText: string;
  projectName: string;
  category: string;
  streets: string[];
  impact: string;
  shootDate: string;
  generatedAt: string;
}

/**
 * Fetch upcoming film permits from NYC Open Data
 * Filters for premium productions in Flâneur coverage areas
 */
export async function fetchFilmingPermits(
  hoursAhead: number = 48
): Promise<FilmingEvent[]> {
  const now = new Date();
  const futureDate = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  // Format dates for SoQL query
  const nowStr = now.toISOString();
  const futureStr = futureDate.toISOString();

  // Build zip code filter
  const zipFilter = ALL_TARGET_ZIPS.map((z) => `'${z}'`).join(',');

  try {
    // SoQL query for upcoming permits in our zip codes
    const whereClause = [
      `start_date_time >= '${nowStr}'`,
      `start_date_time <= '${futureStr}'`,
    ].join(' AND ');

    const params = new URLSearchParams({
      $where: whereClause,
      $order: 'start_date_time ASC',
      $limit: '500',
    });

    const url = `${NYC_FILM_PERMITS_API}?${params}`;
    console.log(`Fetching NYC film permits: ${url.substring(0, 100)}...`);

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error(`Film permits API error: ${response.status}`);
      return [];
    }

    const data: RawFilmPermit[] = await response.json();
    console.log(`Fetched ${data.length} raw film permit records`);

    // Filter and transform permits
    const events: FilmingEvent[] = [];

    for (const permit of data) {
      // Skip excluded categories
      const category = permit.category || '';
      if (EXCLUDED_CATEGORIES.some((exc) => category.toLowerCase().includes(exc.toLowerCase()))) {
        continue;
      }

      // Check if premium category
      const isPremium = PREMIUM_CATEGORIES.some((cat) =>
        category.toLowerCase().includes(cat.toLowerCase())
      );
      if (!isPremium) continue;

      // Check zip codes - permits can have multiple zips
      const permitZips = (permit.zipcode_s_ || '')
        .split(',')
        .map((z) => z.trim())
        .filter(Boolean);

      // Find matching neighborhoods
      const matchingZips = permitZips.filter((z) => ALL_TARGET_ZIPS.includes(z));
      if (matchingZips.length === 0) continue;

      // Get the primary neighborhood for this permit
      const parkingHeld = permit.parking_held || '';
      const neighborhoodKey = getNeighborhoodKeyFromZip(matchingZips[0], parkingHeld);
      if (!neighborhoodKey) continue;

      // Get neighborhood ID (URL slug)
      const neighborhoodId = Object.entries(NEIGHBORHOOD_ID_TO_CONFIG).find(
        ([, configKey]) => configKey === neighborhoodKey
      )?.[0];

      if (!neighborhoodId) continue;

      // Extract project name from event details
      const projectName = extractProjectName(permit);

      // Check if known production
      const isKnown = KNOWN_PRODUCTIONS.some((prod) =>
        projectName.toLowerCase().includes(prod)
      );

      // Extract streets from parking_held
      const streets = extractStreets(parkingHeld);

      // Determine impact level
      const impact = determineImpact(parkingHeld, streets.length);

      events.push({
        eventId: permit.event_id || `film-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        projectName,
        category: permit.category || 'Unknown',
        subCategory: permit.sub_category_name,
        neighborhood: neighborhoodKey,
        neighborhoodId,
        streets,
        parkingHeld,
        startDate: permit.start_date_time || '',
        endDate: permit.end_date_time || '',
        impact,
        isKnownProduction: isKnown,
        borough: permit.borough || 'Manhattan',
        rawData: permit as unknown as Record<string, unknown>,
      });
    }

    // Sort: Known productions first, then by impact, then by date
    events.sort((a, b) => {
      if (a.isKnownProduction !== b.isKnownProduction) {
        return a.isKnownProduction ? -1 : 1;
      }
      const impactOrder = { High: 0, Medium: 1, Low: 2 };
      if (impactOrder[a.impact] !== impactOrder[b.impact]) {
        return impactOrder[a.impact] - impactOrder[b.impact];
      }
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });

    console.log(`Filtered to ${events.length} relevant filming events`);
    return events;
  } catch (error) {
    console.error('Film permits fetch error:', error);
    return [];
  }
}

/**
 * Extract project name from permit data
 * Film permits often use code names - try to identify real productions
 */
function extractProjectName(permit: RawFilmPermit): string {
  // The event_type field sometimes contains the actual show name
  const eventType = permit.event_type || '';
  const subCategory = permit.sub_category_name || '';
  const category = permit.category || '';

  // Check if event_type looks like a real production name
  if (eventType && eventType.length > 2 && !eventType.match(/^[A-Z0-9]+$/)) {
    // Not just a code - might be a real name
    return eventType;
  }

  // If subcategory has useful info
  if (subCategory && subCategory !== category) {
    return subCategory;
  }

  // Fall back to event type or generic
  return eventType || `${category} Production`;
}

/**
 * Extract street names from parking_held field
 * Parking held format: "STREET NAME between CROSS1 and CROSS2"
 */
function extractStreets(parkingHeld: string): string[] {
  if (!parkingHeld) return [];

  const streets: string[] = [];
  const lines = parkingHeld.split(/[,;]/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Extract the main street name (before "between" or "from")
    const streetMatch = trimmed.match(/^([A-Z0-9\s]+?)(?:\s+(?:between|from|at|on)\s+)/i);
    if (streetMatch) {
      const street = streetMatch[1].trim();
      if (street && !streets.includes(street)) {
        streets.push(street);
      }
    } else if (trimmed.length < 50) {
      // Short enough to be just a street reference
      const cleaned = trimmed.replace(/\s+/g, ' ').trim();
      if (cleaned && !streets.includes(cleaned)) {
        streets.push(cleaned);
      }
    }
  }

  return streets.slice(0, 5); // Limit to 5 streets
}

/**
 * Determine impact level based on parking footprint
 */
function determineImpact(
  parkingHeld: string,
  streetCount: number
): 'High' | 'Medium' | 'Low' {
  const length = parkingHeld.length;

  // High impact: Large footprint (lots of trucks, multiple blocks)
  if (length > 300 || streetCount >= 4) {
    return 'High';
  }

  // Medium impact: Moderate footprint
  if (length > 150 || streetCount >= 2) {
    return 'Medium';
  }

  // Low impact: Small footprint
  return 'Low';
}

/**
 * Generate a "Set Life" story for a filming event using Gemini
 */
export async function generateFilmingStory(
  event: FilmingEvent
): Promise<FilmingStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Format the shoot date
  const shootDate = new Date(event.startDate);
  const dateStr = shootDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = shootDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  // Build street list for prompt
  const streetList = event.streets.length > 0
    ? event.streets.join(', ')
    : 'nearby streets';

  // Determine tone based on category
  let toneGuidance: string;
  if (event.category.toLowerCase().includes('television') ||
      event.category.toLowerCase().includes('feature')) {
    toneGuidance = `Tone: 'Star Spotting' mixed with 'Traffic Alert'. ${event.isKnownProduction ? 'This is a known production - emphasize the show name.' : 'This appears to be a new or code-named production - maintain mystery.'}`;
  } else if (event.category.toLowerCase().includes('commercial')) {
    toneGuidance = "Tone: 'Aesthetic Alert'. Focus on the visual disruption and the glamour of a commercial shoot.";
  } else {
    toneGuidance = "Tone: Insider, useful, slightly gossipy.";
  }

  const systemPrompt = `You are the Flâneur Editor writing a "Set Life" alert for ${event.neighborhood} residents.

Writing Style:
- Insider tone, useful information, slightly gossipy
- Reference specific streets and blocks
- If impact is High, warn about traffic/parking disruptions
- Keep it brief and scannable
- No emojis`;

  const prompt = `Data:
- Project: ${event.projectName}
- Category: ${event.category}${event.subCategory ? ` (${event.subCategory})` : ''}
- Neighborhood: ${event.neighborhood}
- Streets affected: ${streetList}
- Parking suspended: ${event.parkingHeld.substring(0, 200)}${event.parkingHeld.length > 200 ? '...' : ''}
- Date: ${dateStr} starting ${timeStr}
- Impact Level: ${event.impact}
- Known Production: ${event.isKnownProduction ? 'Yes' : 'No/Code Name'}

${toneGuidance}

Task: Write a 40-50 word blurb alerting residents about this film shoot.

Return JSON:
{
  "headline": "Headline under 60 chars mentioning project and street",
  "body": "40-50 word alert with specific streets and timing",
  "previewText": "One sentence teaser for feed"
}`;

  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: {
        temperature: 0.7,
      },
    });

    const rawText = response.text || '';

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      eventId: event.eventId,
      neighborhoodId: event.neighborhoodId,
      headline: parsed.headline || `${event.projectName} filming in ${event.neighborhood}`,
      body: parsed.body || `Film crews for ${event.projectName} will be shooting on ${streetList}.`,
      previewText: parsed.previewText || `${event.projectName} is filming nearby.`,
      projectName: event.projectName,
      category: event.category,
      streets: event.streets,
      impact: event.impact,
      shootDate: event.startDate,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Filming story generation error:', error);
    return null;
  }
}

/**
 * Fetch permits and generate stories for all affected neighborhoods
 */
export async function processFilmingPermits(
  hoursAhead: number = 48
): Promise<{
  events: FilmingEvent[];
  stories: FilmingStory[];
  errors: string[];
}> {
  const errors: string[] = [];
  const stories: FilmingStory[] = [];

  // Fetch permits
  const events = await fetchFilmingPermits(hoursAhead);

  if (events.length === 0) {
    return { events: [], stories: [], errors: [] };
  }

  // Generate stories for top events (limit to avoid API costs)
  const topEvents = events.slice(0, 20);

  for (const event of topEvents) {
    try {
      const story = await generateFilmingStory(event);
      if (story) {
        stories.push(story);
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      errors.push(
        `${event.eventId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { events, stories, errors };
}

/**
 * Get filming events for a specific neighborhood
 */
export async function getFilmingEventsForNeighborhood(
  neighborhoodId: string,
  hoursAhead: number = 48
): Promise<FilmingEvent[]> {
  const events = await fetchFilmingPermits(hoursAhead);
  return events.filter((e) => e.neighborhoodId === neighborhoodId);
}
