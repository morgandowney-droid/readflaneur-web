/**
 * NYC Heritage Watch Service
 *
 * Monitors NYC DOB filings for demolition permits, landmark alterations, and tree removal
 * to alert Flâneur residents about neighborhood preservation issues.
 *
 * Data source: NYC Open Data - DOB NOW: Build – Job Application Filings
 *
 * Triggers:
 * - Trigger A: Demolition (DM job type) - "End of an Era" alerts
 * - Trigger B: Landmark alterations (facade, restoration, cornice, etc.)
 * - Trigger C: Tree removal mentions in job descriptions
 */

import { GoogleGenAI } from '@google/genai';
import {
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

// NYC Open Data - DOB NOW: Build Job Application Filings
const NYC_DOB_FILINGS_API = 'https://data.cityofnewyork.us/resource/w9ak-ipjd.json';

// Landmark facade/restoration keywords (Trigger B)
const LANDMARK_KEYWORDS = [
  'facade',
  'façade',
  'restoration',
  'cornice',
  'stoop',
  'brick replacement',
  'brick repair',
  'brownstone',
  'limestone',
  'terra cotta',
  'terracotta',
  'windows',
  'window replacement',
  'historic',
  'ornamental',
  'masonry',
  'parapet',
  'balustrade',
  'ironwork',
  'wrought iron',
  'cast iron',
  'landmarked',
];

// Tree removal keywords (Trigger C)
const TREE_KEYWORDS = [
  'tree removal',
  'remove tree',
  'tree protection',
  'tree work',
  'tree cutting',
  'tree relocation',
  'street tree',
  'specimen tree',
  'mature tree',
];

/**
 * Heritage event types
 */
export type HeritageEventType = 'Demolition' | 'Landmark' | 'Tree';

/**
 * Raw DOB filing from NYC Open Data
 */
interface RawDOBFiling {
  job__?: string;
  job_type?: string;
  job_status?: string;
  job_description?: string;
  filing_date?: string;
  house__?: string;
  street_name?: string;
  borough?: string;
  zip_code?: string;
  block?: string;
  lot?: string;
  bin__?: string;
  community_board?: string;
  landmark?: string;
  city_owned?: string;
  owner_business_name?: string;
  owner_s_first_name?: string;
  owner_s_last_name?: string;
  existing_occupancy_classification?: string;
  proposed_occupancy_classification?: string;
  existing_dwelling_units?: string;
  proposed_dwelling_units?: string;
  existing_stories?: string;
  proposed_stories?: string;
  existing_height?: string;
  proposed_height?: string;
  latitude?: string;
  longitude?: string;
}

/**
 * Transformed heritage event
 */
export interface HeritageEvent {
  eventId: string;
  jobNumber: string;
  address: string;
  neighborhood: string;
  neighborhoodId: string;
  type: HeritageEventType;
  description: string;
  landmarkStatus: boolean;
  matchedKeywords: string[];
  filingDate: string;
  borough: string;
  block: string;
  lot: string;
  ownerName: string;
  existingStories: number | null;
  existingHeight: string | null;
  latitude: number | null;
  longitude: number | null;
  rawData: Record<string, unknown>;
}

/**
 * Generated heritage story
 */
export interface HeritageStory {
  eventId: string;
  neighborhoodId: string;
  headline: string;
  body: string;
  previewText: string;
  eventType: HeritageEventType;
  address: string;
  isLandmark: boolean;
  generatedAt: string;
}

/**
 * Check if job description contains landmark-related keywords
 */
function matchesLandmarkKeywords(description: string): string[] {
  if (!description) return [];
  const lower = description.toLowerCase();
  return LANDMARK_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Check if job description contains tree-related keywords
 */
function matchesTreeKeywords(description: string): string[] {
  if (!description) return [];
  const lower = description.toLowerCase();
  return TREE_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Determine the heritage event type based on filing data
 */
function determineEventType(
  filing: RawDOBFiling
): { type: HeritageEventType; keywords: string[] } | null {
  const jobType = filing.job_type?.toUpperCase() || '';
  const description = filing.job_description || '';
  const isLandmark = filing.landmark?.toUpperCase() === 'Y';

  // Trigger A: Demolition (highest priority)
  if (jobType === 'DM') {
    return { type: 'Demolition', keywords: ['Demolition'] };
  }

  // Trigger B: Landmark alterations (facade, restoration, etc.)
  if (isLandmark) {
    const landmarkMatches = matchesLandmarkKeywords(description);
    if (landmarkMatches.length > 0) {
      return { type: 'Landmark', keywords: landmarkMatches };
    }
  }

  // Trigger C: Tree removal (can appear in any filing)
  const treeMatches = matchesTreeKeywords(description);
  if (treeMatches.length > 0) {
    return { type: 'Tree', keywords: treeMatches };
  }

  return null;
}

/**
 * Format owner name from filing data
 */
function formatOwnerName(filing: RawDOBFiling): string {
  if (filing.owner_business_name) {
    return filing.owner_business_name;
  }
  const firstName = filing.owner_s_first_name || '';
  const lastName = filing.owner_s_last_name || '';
  return `${firstName} ${lastName}`.trim() || 'Unknown';
}

/**
 * Fetch recent DOB filings from NYC Open Data
 * Filters for heritage-relevant filings in Flâneur coverage areas
 */
export async function fetchHeritageFilings(
  hoursBack: number = 24
): Promise<HeritageEvent[]> {
  const since = new Date();
  since.setHours(since.getHours() - hoursBack);
  const sinceStr = since.toISOString().split('T')[0];

  // Build zip code filter
  const zipFilter = ALL_TARGET_ZIPS.map((z) => `'${z}'`).join(',');

  try {
    // SoQL query for recent filings in our zip codes
    const whereClause = [
      `filing_date >= '${sinceStr}'`,
      `zip_code IN (${zipFilter})`,
    ].join(' AND ');

    const params = new URLSearchParams({
      $where: whereClause,
      $order: 'filing_date DESC',
      $limit: '1000',
    });

    const url = `${NYC_DOB_FILINGS_API}?${params}`;
    console.log(`Fetching NYC heritage filings: ${url.substring(0, 100)}...`);

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error(`Heritage filings API error: ${response.status}`);
      return [];
    }

    const data: RawDOBFiling[] = await response.json();
    console.log(`Fetched ${data.length} raw DOB filing records`);

    // Filter and transform filings
    const events: HeritageEvent[] = [];

    for (const filing of data) {
      // Check if this filing matches any heritage trigger
      const eventInfo = determineEventType(filing);
      if (!eventInfo) continue;

      // Get zip code
      const zipCode = filing.zip_code || '';
      if (!ALL_TARGET_ZIPS.includes(zipCode)) continue;

      // Build address
      const address = `${filing.house__ || ''} ${filing.street_name || ''}`.trim();
      if (!address) continue;

      // Get neighborhood
      const neighborhoodKey = getNeighborhoodKeyFromZip(zipCode, address);
      if (!neighborhoodKey) continue;

      // Get neighborhood ID (URL slug)
      const neighborhoodId = Object.entries(NEIGHBORHOOD_ID_TO_CONFIG).find(
        ([, configKey]) => configKey === neighborhoodKey
      )?.[0];

      if (!neighborhoodId) continue;

      const jobNumber = filing.job__ || `heritage-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      events.push({
        eventId: jobNumber,
        jobNumber,
        address,
        neighborhood: neighborhoodKey,
        neighborhoodId,
        type: eventInfo.type,
        description: filing.job_description || '',
        landmarkStatus: filing.landmark?.toUpperCase() === 'Y',
        matchedKeywords: eventInfo.keywords,
        filingDate: filing.filing_date || '',
        borough: filing.borough || 'Manhattan',
        block: filing.block || '',
        lot: filing.lot || '',
        ownerName: formatOwnerName(filing),
        existingStories: filing.existing_stories ? parseInt(filing.existing_stories, 10) : null,
        existingHeight: filing.existing_height || null,
        latitude: filing.latitude ? parseFloat(filing.latitude) : null,
        longitude: filing.longitude ? parseFloat(filing.longitude) : null,
        rawData: filing as unknown as Record<string, unknown>,
      });
    }

    // Sort: Demolitions first, then Landmarks, then Trees
    const typePriority = { Demolition: 0, Landmark: 1, Tree: 2 };
    events.sort((a, b) => {
      if (typePriority[a.type] !== typePriority[b.type]) {
        return typePriority[a.type] - typePriority[b.type];
      }
      // Within same type, landmarks get priority
      if (a.landmarkStatus !== b.landmarkStatus) {
        return a.landmarkStatus ? -1 : 1;
      }
      // Most recent first
      return new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime();
    });

    console.log(`Filtered to ${events.length} heritage events`);
    return events;
  } catch (error) {
    console.error('Heritage filings fetch error:', error);
    return [];
  }
}

/**
 * Generate a heritage story using Gemini
 */
export async function generateHeritageStory(
  event: HeritageEvent
): Promise<HeritageStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Build context based on event type
  let toneGuidance: string;
  let headlinePrefix: string;

  switch (event.type) {
    case 'Demolition':
      toneGuidance = `Tone: 'Eulogy'. A piece of history is leaving the neighborhood. ${
        event.existingStories ? `The building is ${event.existingStories} stories.` : ''
      } ${event.landmarkStatus ? 'This is a LANDMARKED property - this filing will face additional scrutiny.' : ''}`;
      headlinePrefix = 'Teardown Alert';
      break;
    case 'Landmark':
      toneGuidance = `Tone: 'Curator'. Scrutinize the change - is it a faithful restoration or a modern intervention? This is a landmarked property, so changes require Landmarks Preservation Commission (LPC) approval. Keywords matched: ${event.matchedKeywords.join(', ')}.`;
      headlinePrefix = 'Facade Watch';
      break;
    case 'Tree':
      toneGuidance = `Tone: 'Concerned Neighbor'. Mature trees are rare assets in NYC. Keywords matched: ${event.matchedKeywords.join(', ')}.`;
      headlinePrefix = 'Green Loss';
      break;
  }

  const systemPrompt = `You are the Flâneur Editor writing a heritage alert for preservation-minded residents of ${event.neighborhood}.

Writing Style:
- ${toneGuidance}
- Reference specific address and street
- For Landmarks, mention LPC approval requirement
- Keep it brief and informative
- No emojis`;

  const prompt = `Data:
- Address: ${event.address}, ${event.borough}
- Event Type: ${event.type}
- Job Description: ${event.description.substring(0, 300)}${event.description.length > 300 ? '...' : ''}
- Landmark Status: ${event.landmarkStatus ? 'Yes (Landmarked Property)' : 'No'}
- Owner: ${event.ownerName}
${event.existingStories ? `- Existing Building: ${event.existingStories} stories` : ''}
${event.existingHeight ? `- Existing Height: ${event.existingHeight}` : ''}

Task: Write a 40-word blurb about this ${event.type.toLowerCase()} filing.

Headline should start with "${headlinePrefix}:" and reference the address or street.

Return JSON:
{
  "headline": "${headlinePrefix}: [specific detail about the filing] (under 70 chars)",
  "body": "40-word description of the filing and its significance",
  "previewText": "One sentence teaser for feed",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 1-3 link candidates for key entities mentioned in the body (building name, address, landmark).`;

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
    let body = parsed.body || `A ${event.type.toLowerCase()} filing has been submitted for ${event.address}.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, { name: event.neighborhood, city: 'New York' });
    }

    return {
      eventId: event.eventId,
      neighborhoodId: event.neighborhoodId,
      headline: parsed.headline || `${headlinePrefix}: Filing at ${event.address}`,
      body,
      previewText: parsed.previewText || `Heritage alert for ${event.address}.`,
      eventType: event.type,
      address: event.address,
      isLandmark: event.landmarkStatus,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Heritage story generation error:', error);
    return null;
  }
}

/**
 * Fetch filings and generate stories for all affected neighborhoods
 */
export async function processHeritageFilings(
  hoursBack: number = 24
): Promise<{
  events: HeritageEvent[];
  stories: HeritageStory[];
  byType: Record<HeritageEventType, number>;
  errors: string[];
}> {
  const errors: string[] = [];
  const stories: HeritageStory[] = [];
  const byType: Record<HeritageEventType, number> = {
    Demolition: 0,
    Landmark: 0,
    Tree: 0,
  };

  // Fetch filings
  const events = await fetchHeritageFilings(hoursBack);

  // Count by type
  for (const event of events) {
    byType[event.type]++;
  }

  if (events.length === 0) {
    return { events: [], stories: [], byType, errors: [] };
  }

  // Generate stories for top events (limit to avoid API costs)
  // Prioritize: All demolitions, top landmarks, some trees
  const demolitions = events.filter((e) => e.type === 'Demolition').slice(0, 5);
  const landmarks = events.filter((e) => e.type === 'Landmark').slice(0, 5);
  const trees = events.filter((e) => e.type === 'Tree').slice(0, 3);

  const topEvents = [...demolitions, ...landmarks, ...trees];

  for (const event of topEvents) {
    try {
      const story = await generateHeritageStory(event);
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

  return { events, stories, byType, errors };
}

/**
 * Get heritage events for a specific neighborhood
 */
export async function getHeritageEventsForNeighborhood(
  neighborhoodId: string,
  hoursBack: number = 24
): Promise<HeritageEvent[]> {
  const events = await fetchHeritageFilings(hoursBack);
  return events.filter((e) => e.neighborhoodId === neighborhoodId);
}
