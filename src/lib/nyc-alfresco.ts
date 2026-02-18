/**
 * NYC Alfresco Watch Service
 *
 * Monitors NYC Open Restaurants / Dining Out filings to alert Flâneur residents
 * about new outdoor dining setups in their neighborhoods.
 *
 * Data source: NYC Open Data - Open Restaurants Applications
 *
 * Features:
 * - Geofenced to Flâneur NYC coverage areas via zip codes
 * - Filters for approved sidewalk/roadway seating
 * - Prioritizes sidewalk (cafe culture) over roadway (shed culture)
 * - Excludes chain restaurants
 * - Generates breezy, social stories via Gemini
 */

import { GoogleGenAI } from '@google/genai';
import {
  FLANEUR_NYC_CONFIG,
  ALL_TARGET_ZIPS,
  getNeighborhoodKeyFromZip,
  NEIGHBORHOOD_ID_TO_CONFIG,
} from '@/config/nyc-locations';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';

import { AI_MODELS } from '@/config/ai-models';

// NYC Open Data - Open Restaurants Applications endpoint
const NYC_OPEN_RESTAURANTS_API = 'https://data.cityofnewyork.us/resource/pitm-atqc.json';

// Chain restaurant patterns to exclude (keep the feed premium)
const CHAIN_PATTERNS = [
  /dunkin/i,
  /subway/i,
  /starbucks/i,
  /mcdonald/i,
  /burger king/i,
  /wendy'?s/i,
  /taco bell/i,
  /chipotle/i,
  /panera/i,
  /panda express/i,
  /chick-fil-a/i,
  /popeyes/i,
  /domino/i,
  /papa john/i,
  /pizza hut/i,
  /kfc/i,
  /five guys/i,
  /shake shack/i,
  /sweetgreen/i,
  /cava/i,
  /chopt/i,
  /dig inn/i,
  /just salad/i,
  /pret a manger/i,
  /au bon pain/i,
  /tim hortons/i,
  /baskin.?robbins/i,
  /cold stone/i,
  /dairy queen/i,
  /jamba/i,
  /smoothie king/i,
  /7.?eleven/i,
  /wawa/i,
  /applebee/i,
  /chili'?s/i,
  /olive garden/i,
  /red lobster/i,
  /outback/i,
  /cheesecake factory/i,
  /ihop/i,
  /denny'?s/i,
  /waffle house/i,
  /buffalo wild wings/i,
  /hooters/i,
  /dave.?buster/i,
];

/**
 * Raw open restaurant application from NYC Open Data
 */
interface RawOpenRestaurantApp {
  objectid?: string;
  globalid?: string;
  restaurant_name?: string;
  legal_business_name?: string;
  doing_business_as_dba?: string;
  business_address?: string;
  building?: string;
  street?: string;
  borough?: string;
  zip?: string;
  time_submitted?: string;
  approved_for_sidewalk_seating?: string;
  approved_for_roadway_seating?: string;
  qualify_alcohol?: string;
  sidewalk_dimensions_length?: string;
  sidewalk_dimensions_width?: string;
  sidewalk_dimensions_area?: string;
  roadway_dimensions_length?: string;
  roadway_dimensions_width?: string;
  roadway_dimensions_area?: string;
  seating_interest_sidewalk?: string;
  seating_interest_roadway?: string;
  latitude?: string;
  longitude?: string;
}

/**
 * Transformed outdoor dining event
 */
export interface OutdoorDiningEvent {
  eventId: string;
  restaurantName: string;
  legalName: string;
  address: string;
  neighborhood: string;
  neighborhoodId: string;
  seatingType: 'Sidewalk' | 'Roadway' | 'Both';
  hasAlcohol: boolean;
  isPending: boolean;
  sidewalkArea: number | null;
  roadwayArea: number | null;
  totalSeats: number;
  submittedDate: string;
  borough: string;
  latitude: number | null;
  longitude: number | null;
  rawData: Record<string, unknown>;
}

/**
 * Generated alfresco story
 */
export interface AlfrescoStory {
  eventId: string;
  neighborhoodId: string;
  headline: string;
  body: string;
  previewText: string;
  restaurantName: string;
  seatingType: string;
  hasAlcohol: boolean;
  address: string;
  generatedAt: string;
}

/**
 * Check if a restaurant name matches a chain pattern
 */
export function isChain(restaurantName: string): boolean {
  if (!restaurantName) return false;
  return CHAIN_PATTERNS.some((pattern) => pattern.test(restaurantName));
}

/**
 * Estimate seat count from area (rough approximation)
 * Assumes ~25 sq ft per outdoor seat
 */
function estimateSeats(sidewalkArea: number | null, roadwayArea: number | null): number {
  const totalArea = (sidewalkArea || 0) + (roadwayArea || 0);
  if (totalArea === 0) return 0;
  return Math.round(totalArea / 25);
}

/**
 * Determine seating type from approval fields
 */
function getSeatingType(
  sidewalkApproved: boolean,
  roadwayApproved: boolean
): 'Sidewalk' | 'Roadway' | 'Both' {
  if (sidewalkApproved && roadwayApproved) return 'Both';
  if (sidewalkApproved) return 'Sidewalk';
  return 'Roadway';
}

/**
 * Get the current season for contextual content
 */
function getCurrentSeason(): 'Spring' | 'Summer' | 'Fall' | 'Winter' {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Fall';
  return 'Winter';
}

/**
 * Fetch recent outdoor dining applications from NYC Open Data
 * Filters for approved applications in Flâneur coverage areas
 */
export async function fetchAlfrescoPermits(
  daysBack: number = 30
): Promise<OutdoorDiningEvent[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString();

  // Build zip code filter
  const zipFilter = ALL_TARGET_ZIPS.map((z) => `'${z}'`).join(',');

  try {
    // SoQL query for recent applications in our zip codes
    // Include both approved AND pending (interest expressed) applications
    const whereClause = [
      `time_submitted >= '${sinceStr}'`,
      `zip IN (${zipFilter})`,
      `(approved_for_sidewalk_seating = 'yes' OR approved_for_roadway_seating = 'yes' OR seating_interest_sidewalk = 'yes' OR seating_interest_roadway = 'yes')`,
    ].join(' AND ');

    const params = new URLSearchParams({
      $where: whereClause,
      $order: 'time_submitted DESC',
      $limit: '500',
    });

    const url = `${NYC_OPEN_RESTAURANTS_API}?${params}`;
    console.log(`Fetching NYC alfresco permits: ${url.substring(0, 100)}...`);

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error(`Alfresco permits API error: ${response.status}`);
      return [];
    }

    const data: RawOpenRestaurantApp[] = await response.json();
    console.log(`Fetched ${data.length} raw alfresco permit records`);

    // Filter and transform permits
    const events: OutdoorDiningEvent[] = [];

    for (const app of data) {
      // Get restaurant name (try multiple fields)
      const restaurantName =
        app.doing_business_as_dba ||
        app.restaurant_name ||
        app.legal_business_name ||
        'Unknown Restaurant';

      // Skip chains
      if (isChain(restaurantName)) {
        continue;
      }

      // Get zip code
      const zipCode = app.zip || '';
      if (!ALL_TARGET_ZIPS.includes(zipCode)) continue;

      // Get neighborhood
      const address = app.business_address || `${app.building || ''} ${app.street || ''}`.trim();
      const neighborhoodKey = getNeighborhoodKeyFromZip(zipCode, address);
      if (!neighborhoodKey) continue;

      // Get neighborhood ID (URL slug)
      const neighborhoodId = Object.entries(NEIGHBORHOOD_ID_TO_CONFIG).find(
        ([, configKey]) => configKey === neighborhoodKey
      )?.[0];

      if (!neighborhoodId) continue;

      // Check approval status (approved OR interest expressed)
      const sidewalkApproved = app.approved_for_sidewalk_seating?.toLowerCase() === 'yes';
      const roadwayApproved = app.approved_for_roadway_seating?.toLowerCase() === 'yes';
      const sidewalkInterest = app.seating_interest_sidewalk?.toLowerCase() === 'yes';
      const roadwayInterest = app.seating_interest_roadway?.toLowerCase() === 'yes';

      const isApproved = sidewalkApproved || roadwayApproved;
      const isPending = !isApproved && (sidewalkInterest || roadwayInterest);

      // Skip if neither approved nor pending interest
      if (!isApproved && !isPending) continue;

      // Parse areas
      const sidewalkArea = parseFloat(app.sidewalk_dimensions_area || '0') || null;
      const roadwayArea = parseFloat(app.roadway_dimensions_area || '0') || null;

      // Check alcohol qualification
      const hasAlcohol = app.qualify_alcohol?.toLowerCase() === 'yes';

      // Determine seating type (use approved status if available, otherwise interest)
      const seatingType = isApproved
        ? getSeatingType(sidewalkApproved, roadwayApproved)
        : getSeatingType(sidewalkInterest, roadwayInterest);

      // Estimate seats
      const totalSeats = estimateSeats(sidewalkArea, roadwayArea);

      events.push({
        eventId: app.globalid || app.objectid || `alfresco-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        restaurantName,
        legalName: app.legal_business_name || restaurantName,
        address,
        neighborhood: neighborhoodKey,
        neighborhoodId,
        seatingType,
        hasAlcohol,
        isPending,
        sidewalkArea,
        roadwayArea,
        totalSeats,
        submittedDate: app.time_submitted || '',
        borough: app.borough || 'Manhattan',
        latitude: app.latitude ? parseFloat(app.latitude) : null,
        longitude: app.longitude ? parseFloat(app.longitude) : null,
        rawData: app as unknown as Record<string, unknown>,
      });
    }

    // Sort: Prioritize sidewalk seating, then alcohol-serving, then by date
    events.sort((a, b) => {
      // Sidewalk-only or Both first
      const seatingPriority = { Sidewalk: 0, Both: 1, Roadway: 2 };
      if (seatingPriority[a.seatingType] !== seatingPriority[b.seatingType]) {
        return seatingPriority[a.seatingType] - seatingPriority[b.seatingType];
      }
      // Alcohol-serving next
      if (a.hasAlcohol !== b.hasAlcohol) {
        return a.hasAlcohol ? -1 : 1;
      }
      // Most recent first
      return new Date(b.submittedDate).getTime() - new Date(a.submittedDate).getTime();
    });

    console.log(`Filtered to ${events.length} relevant alfresco events`);
    return events;
  } catch (error) {
    console.error('Alfresco permits fetch error:', error);
    return [];
  }
}

/**
 * Generate an "Alfresco Alert" story for an outdoor dining event using Gemini
 */
export async function generateAlfrescoStory(
  event: OutdoorDiningEvent
): Promise<AlfrescoStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Get current season for contextual content
  const season = getCurrentSeason();

  // Build seating description
  let seatingDesc: string;
  if (event.seatingType === 'Sidewalk') {
    seatingDesc = 'Parisian-style sidewalk seating perfect for people-watching';
  } else if (event.seatingType === 'Both') {
    seatingDesc = 'both sidewalk and expanded roadway seating';
  } else {
    seatingDesc = 'expanded roadway seating with increased capacity';
  }

  // Seasonal context
  let seasonalContext: string;
  if (season === 'Spring' || season === 'Summer') {
    seasonalContext = 'Just in time for the season - perfect weather for dining outdoors.';
  } else if (season === 'Fall') {
    seasonalContext = 'Catch the last of the pleasant weather before winter sets in.';
  } else {
    seasonalContext = 'Look for heated and covered options for cozy outdoor dining.';
  }

  // Alcohol note
  const alcoholNote = event.hasAlcohol
    ? 'Licensed for outdoor alcohol service.'
    : '';

  const systemPrompt = `You are the Flâneur Editor writing an "Alfresco Alert" for ${event.neighborhood} residents.

Writing Style:
- Breezy, social, inviting tone
- Reference specific streets and the vibe of the location
- If sidewalk seating, frame as cafe culture and people-watching
- If roadway seating, focus on expanded capacity
- Keep it brief and scannable
- No emojis`;

  const statusNote = event.isPending
    ? 'This restaurant has APPLIED for outdoor seating but is not yet approved. Use language like "has applied for" or "is seeking approval for" rather than stating it as confirmed.'
    : 'This restaurant has been APPROVED for outdoor seating.';

  const prompt = `Data:
- Restaurant: ${event.restaurantName}
- Address: ${event.address}
- Neighborhood: ${event.neighborhood}
- Seating Type: ${event.seatingType} (${seatingDesc})
- Status: ${event.isPending ? 'Application Pending' : 'Approved'}
- Alcohol Service: ${event.hasAlcohol ? 'Yes' : 'No'}
- Estimated Seats: ${event.totalSeats > 0 ? event.totalSeats : 'Unknown'}
- Season: ${season}

${statusNote}
${seasonalContext}
${alcoholNote}

Task: Write a 35-40 word blurb about this ${event.isPending ? 'pending outdoor dining application' : 'new outdoor dining spot'}.

Return JSON:
{
  "headline": "Al Fresco Alert: [Restaurant Name] adds [seating type] seats (under 60 chars)",
  "body": "35-40 word description mentioning location and vibe",
  "previewText": "One sentence teaser for feed",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 1-3 link candidates for key entities mentioned in the body (restaurant name, street/location).`;

  try {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
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

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || `${event.restaurantName} at ${event.address} now offers ${event.seatingType.toLowerCase()} seating.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, { name: event.neighborhood, city: 'New York' });
    }

    return {
      eventId: event.eventId,
      neighborhoodId: event.neighborhoodId,
      headline: parsed.headline || `Al Fresco Alert: ${event.restaurantName} adds outdoor seating`,
      body,
      previewText: parsed.previewText || `New outdoor dining at ${event.restaurantName}.`,
      restaurantName: event.restaurantName,
      seatingType: event.seatingType,
      hasAlcohol: event.hasAlcohol,
      address: event.address,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Alfresco story generation error:', error);
    return null;
  }
}

/**
 * Fetch permits and generate stories for all affected neighborhoods
 */
export async function processAlfrescoPermits(
  daysBack: number = 30
): Promise<{
  events: OutdoorDiningEvent[];
  stories: AlfrescoStory[];
  errors: string[];
}> {
  const errors: string[] = [];
  const stories: AlfrescoStory[] = [];

  // Fetch permits
  const events = await fetchAlfrescoPermits(daysBack);

  if (events.length === 0) {
    return { events: [], stories: [], errors: [] };
  }

  // Generate stories for top events (limit to avoid API costs)
  const topEvents = events.slice(0, 15);

  for (const event of topEvents) {
    try {
      const story = await generateAlfrescoStory(event);
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
 * Get alfresco events for a specific neighborhood
 */
export async function getAlfrescoEventsForNeighborhood(
  neighborhoodId: string,
  daysBack: number = 30
): Promise<OutdoorDiningEvent[]> {
  const events = await fetchAlfrescoPermits(daysBack);
  return events.filter((e) => e.neighborhoodId === neighborhoodId);
}
