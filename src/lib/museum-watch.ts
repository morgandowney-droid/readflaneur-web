/**
 * Museum Watch Service
 *
 * Monitors the calendars of Tier 1 Global Museums to alert residents
 * about "Blockbuster" exhibition openings and Member Previews.
 *
 * Strategy:
 * - Weekly scrape of museum "Exhibitions" or "Calendar" pages
 * - Filter for "Blockbuster" shows (Retrospective, Major, Survey, First Time)
 * - Exhibitions must be > 2 months duration (filters out pop-ups)
 * - Trigger story 48h before Member Preview (if exists) or Public Opening
 *
 * Geofence: Tier 1 institutions in Hub Cities only
 * - New York: The Met, MoMA, Whitney, Guggenheim
 * - London: Tate Modern, V&A, Royal Academy, National Gallery
 * - Paris: Louvre, Musée d'Orsay, Centre Pompidou, Bourse de Commerce
 * - Tokyo: Mori Art Museum, National Art Center
 * - Los Angeles: LACMA, The Getty, The Broad
 */

import { GoogleGenAI } from '@google/genai';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';

// Gemini model for story generation
const GEMINI_MODEL = 'gemini-2.0-flash';

// ============================================================================
// MUSEUM TARGETS CONFIGURATION
// ============================================================================

export type HubCity =
  | 'New_York'
  | 'London'
  | 'Paris'
  | 'Tokyo'
  | 'Los_Angeles';

export interface Museum {
  id: string;
  name: string;
  shortName: string;
  city: HubCity;
  calendarUrl: string;
  membershipUrl?: string;
  neighborhoodId: string; // Primary neighborhood for local targeting
  targetFeeds: string[]; // All neighborhoods that should see this
}

/**
 * Tier 1 Global Museums we track
 */
export const MUSEUM_TARGETS: Museum[] = [
  // New York
  {
    id: 'met',
    name: 'The Metropolitan Museum of Art',
    shortName: 'The Met',
    city: 'New_York',
    calendarUrl: 'https://www.metmuseum.org/exhibitions',
    membershipUrl: 'https://www.metmuseum.org/join-and-give/membership',
    neighborhoodId: 'upper-east-side',
    targetFeeds: ['upper-east-side', 'upper-west-side', 'tribeca', 'soho', 'chelsea', 'west-village'],
  },
  {
    id: 'moma',
    name: 'Museum of Modern Art',
    shortName: 'MoMA',
    city: 'New_York',
    calendarUrl: 'https://www.moma.org/calendar/exhibitions',
    membershipUrl: 'https://www.moma.org/support/membership',
    neighborhoodId: 'midtown',
    targetFeeds: ['tribeca', 'soho', 'chelsea', 'west-village', 'upper-east-side'],
  },
  {
    id: 'whitney',
    name: 'Whitney Museum of American Art',
    shortName: 'The Whitney',
    city: 'New_York',
    calendarUrl: 'https://whitney.org/exhibitions',
    membershipUrl: 'https://whitney.org/support/membership',
    neighborhoodId: 'chelsea',
    targetFeeds: ['chelsea', 'west-village', 'tribeca', 'soho', 'meatpacking'],
  },
  {
    id: 'guggenheim',
    name: 'Solomon R. Guggenheim Museum',
    shortName: 'The Guggenheim',
    city: 'New_York',
    calendarUrl: 'https://www.guggenheim.org/exhibitions',
    membershipUrl: 'https://www.guggenheim.org/support/membership',
    neighborhoodId: 'upper-east-side',
    targetFeeds: ['upper-east-side', 'upper-west-side', 'tribeca', 'chelsea'],
  },

  // London
  {
    id: 'tate-modern',
    name: 'Tate Modern',
    shortName: 'Tate Modern',
    city: 'London',
    calendarUrl: 'https://www.tate.org.uk/whats-on/tate-modern',
    membershipUrl: 'https://www.tate.org.uk/join-support/tate-members',
    neighborhoodId: 'south-bank',
    targetFeeds: ['mayfair', 'chelsea', 'notting-hill', 'kensington', 'south-bank'],
  },
  {
    id: 'va',
    name: 'Victoria and Albert Museum',
    shortName: 'V&A',
    city: 'London',
    calendarUrl: 'https://www.vam.ac.uk/exhibitions',
    membershipUrl: 'https://www.vam.ac.uk/membership',
    neighborhoodId: 'kensington',
    targetFeeds: ['kensington', 'chelsea', 'mayfair', 'notting-hill'],
  },
  {
    id: 'royal-academy',
    name: 'Royal Academy of Arts',
    shortName: 'Royal Academy',
    city: 'London',
    calendarUrl: 'https://www.royalacademy.org.uk/exhibitions',
    membershipUrl: 'https://www.royalacademy.org.uk/support-us/become-a-friend',
    neighborhoodId: 'mayfair',
    targetFeeds: ['mayfair', 'chelsea', 'kensington', 'notting-hill'],
  },
  {
    id: 'national-gallery',
    name: 'The National Gallery',
    shortName: 'National Gallery',
    city: 'London',
    calendarUrl: 'https://www.nationalgallery.org.uk/exhibitions',
    membershipUrl: 'https://www.nationalgallery.org.uk/support-us/membership',
    neighborhoodId: 'westminster',
    targetFeeds: ['mayfair', 'chelsea', 'kensington', 'westminster'],
  },

  // Paris
  {
    id: 'louvre',
    name: 'Musée du Louvre',
    shortName: 'Louvre',
    city: 'Paris',
    calendarUrl: 'https://www.louvre.fr/en/what-s-on/exhibitions',
    membershipUrl: 'https://www.louvre.fr/en/become-patron',
    neighborhoodId: 'marais',
    targetFeeds: ['marais', 'saint-germain', 'champs-elysees'],
  },
  {
    id: 'orsay',
    name: "Musée d'Orsay",
    shortName: "Musée d'Orsay",
    city: 'Paris',
    calendarUrl: 'https://www.musee-orsay.fr/en/exhibitions',
    membershipUrl: 'https://www.musee-orsay.fr/en/support-us',
    neighborhoodId: 'saint-germain',
    targetFeeds: ['saint-germain', 'marais', 'champs-elysees'],
  },
  {
    id: 'pompidou',
    name: 'Centre Pompidou',
    shortName: 'Centre Pompidou',
    city: 'Paris',
    calendarUrl: 'https://www.centrepompidou.fr/en/program/calendar',
    membershipUrl: 'https://www.centrepompidou.fr/en/support-us',
    neighborhoodId: 'marais',
    targetFeeds: ['marais', 'saint-germain'],
  },
  {
    id: 'bourse-de-commerce',
    name: 'Bourse de Commerce — Pinault Collection',
    shortName: 'Bourse de Commerce',
    city: 'Paris',
    calendarUrl: 'https://www.pinaultcollection.com/en/boursedecommerce/exhibitions',
    neighborhoodId: 'marais',
    targetFeeds: ['marais', 'saint-germain', 'champs-elysees'],
  },

  // Tokyo
  {
    id: 'mori',
    name: 'Mori Art Museum',
    shortName: 'Mori Art Museum',
    city: 'Tokyo',
    calendarUrl: 'https://www.mori.art.museum/en/exhibitions/',
    membershipUrl: 'https://www.mori.art.museum/en/membership/',
    neighborhoodId: 'roppongi',
    targetFeeds: ['roppongi', 'ginza', 'shibuya'],
  },
  {
    id: 'nact',
    name: 'The National Art Center, Tokyo',
    shortName: 'National Art Center',
    city: 'Tokyo',
    calendarUrl: 'https://www.nact.jp/english/exhibitions/',
    neighborhoodId: 'roppongi',
    targetFeeds: ['roppongi', 'ginza'],
  },

  // Los Angeles
  {
    id: 'lacma',
    name: 'Los Angeles County Museum of Art',
    shortName: 'LACMA',
    city: 'Los_Angeles',
    calendarUrl: 'https://www.lacma.org/art/exhibitions',
    membershipUrl: 'https://www.lacma.org/support/membership',
    neighborhoodId: 'miracle-mile',
    targetFeeds: ['beverly-hills', 'bel-air', 'west-hollywood', 'brentwood'],
  },
  {
    id: 'getty',
    name: 'The Getty Center',
    shortName: 'The Getty',
    city: 'Los_Angeles',
    calendarUrl: 'https://www.getty.edu/visit/center/exhibitions/',
    membershipUrl: 'https://www.getty.edu/about/governance/support/',
    neighborhoodId: 'brentwood',
    targetFeeds: ['brentwood', 'bel-air', 'beverly-hills', 'pacific-palisades'],
  },
  {
    id: 'broad',
    name: 'The Broad',
    shortName: 'The Broad',
    city: 'Los_Angeles',
    calendarUrl: 'https://www.thebroad.org/art/exhibitions',
    membershipUrl: 'https://www.thebroad.org/support',
    neighborhoodId: 'downtown-la',
    targetFeeds: ['downtown-la', 'beverly-hills', 'west-hollywood'],
  },
];

// ============================================================================
// EXHIBITION TYPES
// ============================================================================

export interface Exhibition {
  id: string;
  museumId: string;
  title: string;
  artist?: string;
  description: string;
  publicOpeningDate: Date;
  closingDate: Date;
  memberPreviewDate?: Date;
  isBlockbuster: boolean;
  blockbusterKeywords: string[];
  durationMonths: number;
  url?: string;
}

export interface ExhibitionStory {
  exhibitionId: string;
  museumId: string;
  museumName: string;
  exhibitionTitle: string;
  artist?: string;
  city: HubCity;
  headline: string;
  body: string;
  previewText: string;
  targetNeighborhoods: string[];
  triggerType: 'member_preview' | 'public_opening';
  triggerDate: string;
  categoryLabel: string;
  generatedAt: string;
}

export interface MuseumWatchResult {
  museumsScanned: number;
  exhibitionsFound: number;
  blockbustersDetected: number;
  storiesGenerated: number;
  byCity: Record<HubCity, number>;
  byMuseum: Record<string, number>;
  errors: string[];
  stories: ExhibitionStory[];
}

// ============================================================================
// BLOCKBUSTER FILTER
// ============================================================================

/**
 * Keywords that indicate a "Blockbuster" exhibition
 */
const BLOCKBUSTER_KEYWORDS = [
  'retrospective',
  'major',
  'survey',
  'first time',
  'landmark',
  'comprehensive',
  'definitive',
  'career-spanning',
  'unprecedented',
  'largest',
  'complete',
  'masterpieces',
  'masterworks',
  'seminal',
  'historic',
];

/**
 * Minimum duration in months for an exhibition to be considered
 * (filters out small pop-ups and short-term installations)
 */
const MIN_DURATION_MONTHS = 2;

/**
 * Check if an exhibition qualifies as a "Blockbuster"
 */
export function isBlockbusterExhibition(
  title: string,
  description: string,
  durationMonths: number
): { isBlockbuster: boolean; matchedKeywords: string[] } {
  // Must be longer than minimum duration
  if (durationMonths < MIN_DURATION_MONTHS) {
    return { isBlockbuster: false, matchedKeywords: [] };
  }

  const textToSearch = `${title} ${description}`.toLowerCase();
  const matchedKeywords: string[] = [];

  for (const keyword of BLOCKBUSTER_KEYWORDS) {
    if (textToSearch.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
    }
  }

  // Need at least one keyword match, or be explicitly marked as major
  const isBlockbuster = matchedKeywords.length > 0;

  return { isBlockbuster, matchedKeywords };
}

/**
 * Calculate duration in months between two dates
 */
export function calculateDurationMonths(start: Date, end: Date): number {
  const msPerMonth = 30 * 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerMonth);
}

/**
 * Determine if we should trigger a story for this exhibition
 * Returns the trigger date and type
 */
export function shouldTriggerStory(
  exhibition: Exhibition,
  currentDate: Date = new Date()
): {
  shouldTrigger: boolean;
  triggerType?: 'member_preview' | 'public_opening';
  triggerDate?: Date;
} {
  if (!exhibition.isBlockbuster) {
    return { shouldTrigger: false };
  }

  // 48 hours in milliseconds
  const hoursAhead48 = 48 * 60 * 60 * 1000;

  // Check Member Preview first (if it exists)
  if (exhibition.memberPreviewDate) {
    const timeUntilPreview = exhibition.memberPreviewDate.getTime() - currentDate.getTime();
    // Trigger within 48h window before member preview
    if (timeUntilPreview > 0 && timeUntilPreview <= hoursAhead48) {
      return {
        shouldTrigger: true,
        triggerType: 'member_preview',
        triggerDate: exhibition.memberPreviewDate,
      };
    }
  }

  // Fall back to Public Opening
  const timeUntilOpening = exhibition.publicOpeningDate.getTime() - currentDate.getTime();
  if (timeUntilOpening > 0 && timeUntilOpening <= hoursAhead48) {
    return {
      shouldTrigger: true,
      triggerType: 'public_opening',
      triggerDate: exhibition.publicOpeningDate,
    };
  }

  return { shouldTrigger: false };
}

// ============================================================================
// STORY GENERATION
// ============================================================================

/**
 * Generate an exhibition story using Gemini
 */
export async function generateExhibitionStory(
  exhibition: Exhibition,
  museum: Museum
): Promise<ExhibitionStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Determine trigger type
  const triggerInfo = shouldTriggerStory(exhibition);
  if (!triggerInfo.shouldTrigger || !triggerInfo.triggerDate || !triggerInfo.triggerType) {
    return null;
  }

  // TypeScript narrowing - extract values after guard check
  const triggerType = triggerInfo.triggerType;
  const triggerDate = triggerInfo.triggerDate;

  // Format dates
  const triggerDateStr = triggerDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const closingDateStr = exhibition.closingDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // City-specific context
  const cityContext: Record<HubCity, string> = {
    New_York: `Reference the Upper East Side Museum Mile, Fifth Avenue, or Central Park. New York collectors value being first. Mention the opening night social scene.`,
    London: `Reference Bond Street, Mayfair, or the West End. British patrons value tradition and scholarship. Afternoon tea at the members' lounge.`,
    Paris: `Reference the Rive Droite or Saint-Germain. French cultural appreciation. Intellectual discourse. The vernissage matters.`,
    Tokyo: `Reference Roppongi or Ginza. Japanese attention to detail and craft. Quiet appreciation. Private viewings.`,
    Los_Angeles: `Reference Beverly Hills, Brentwood, or the Westside. Hollywood collectors and patrons. Opening galas with celebrity sightings.`,
  };

  const systemPrompt = `You are the Culture Editor for Flâneur in ${museum.city.replace('_', ' ')}.

Context:
- A major cultural event is opening at ${museum.name}.
- Your audience: Museum Members and Patrons who value exclusive access.
- Tone: Intellectual & Exclusive. "See it before the crowds."

${cityContext[museum.city]}

Writing Style:
- Sophisticated, cultured, informed
- Insider knowledge - you've been to the press preview
- Create urgency for members to attend the preview
- No emojis
- Reference the artist's significance and the exhibition's importance`;

  const prompt = `Exhibition: ${exhibition.title}
${exhibition.artist ? `Artist: ${exhibition.artist}` : ''}
Museum: ${museum.name} (${museum.shortName})
City: ${museum.city.replace('_', ' ')}
${triggerType === 'member_preview' ? `Member Preview: ${triggerDateStr}` : `Public Opening: ${triggerDateStr}`}
Closing: ${closingDateStr}
Duration: ${exhibition.durationMonths} months

Description: ${exhibition.description}

Blockbuster indicators: ${exhibition.blockbusterKeywords.join(', ')}

Task: Write a 35-word "Culture Watch" blurb for Flâneur members.
${triggerType === 'member_preview' ? 'Focus on the exclusive Member Preview opportunity.' : 'Focus on the public opening and why this show matters.'}

Return JSON:
{
  "headline": "Culture Watch: [Exhibit Name] opens at [Museum] - under 70 chars",
  "body": "35-word blurb emphasizing exclusivity and cultural significance",
  "previewText": "One sentence teaser for the feed",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 2-4 link candidates for key entities mentioned in the body (museum name, artist name, exhibition title).`;

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
      console.error('Failed to extract JSON from Gemini response for exhibition story');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || `A major exhibition opens at ${museum.name}.`;
    if (linkCandidates.length > 0) {
      // Use museum's primary neighborhood for context
      const neighborhoodName = museum.neighborhoodId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const cityName = museum.city.replace(/_/g, ' ');
      body = injectHyperlinks(body, linkCandidates, { name: neighborhoodName, city: cityName });
    }

    // Determine category label
    const categoryLabel =
      triggerType === 'member_preview'
        ? 'Culture Watch: Member Preview'
        : 'Culture Watch';

    return {
      exhibitionId: exhibition.id,
      museumId: museum.id,
      museumName: museum.name,
      exhibitionTitle: exhibition.title,
      artist: exhibition.artist,
      city: museum.city,
      headline: parsed.headline || `Culture Watch: ${exhibition.title} opens at ${museum.shortName}`,
      body,
      previewText: parsed.previewText || `${museum.shortName} presents ${exhibition.title}.`,
      targetNeighborhoods: museum.targetFeeds,
      triggerType,
      triggerDate: triggerDate.toISOString().split('T')[0],
      categoryLabel,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Exhibition story generation error for ${exhibition.title}:`, error);
    return null;
  }
}

// ============================================================================
// SCRAPING / DATA FETCHING
// ============================================================================

/**
 * Fetch exhibitions from a museum's calendar page
 * In production, this would scrape the actual museum websites
 * For now, returns mock data that can be replaced with real scraping
 */
export async function fetchMuseumExhibitions(
  museum: Museum,
  _daysAhead: number = 7
): Promise<Exhibition[]> {
  // TODO: Implement actual web scraping for each museum
  // Each museum has different page structure, so we'd need specific parsers
  //
  // For now, return empty array - in production, this would:
  // 1. Fetch the museum's exhibitions page
  // 2. Parse exhibition titles, dates, descriptions
  // 3. Filter for "new" exhibitions (opening in next 7 days)
  // 4. Check for member preview dates in description

  console.log(`Would fetch exhibitions from ${museum.name} at ${museum.calendarUrl}`);
  return [];
}

/**
 * Process all museum calendars and generate stories
 */
export async function processMuseumWatch(
  daysAhead: number = 7
): Promise<MuseumWatchResult> {
  const result: MuseumWatchResult = {
    museumsScanned: 0,
    exhibitionsFound: 0,
    blockbustersDetected: 0,
    storiesGenerated: 0,
    byCity: {
      New_York: 0,
      London: 0,
      Paris: 0,
      Tokyo: 0,
      Los_Angeles: 0,
    },
    byMuseum: {},
    errors: [],
    stories: [],
  };

  const currentDate = new Date();

  for (const museum of MUSEUM_TARGETS) {
    try {
      result.museumsScanned++;
      result.byMuseum[museum.id] = 0;

      // Fetch exhibitions
      const exhibitions = await fetchMuseumExhibitions(museum, daysAhead);
      result.exhibitionsFound += exhibitions.length;

      // Process each exhibition
      for (const exhibition of exhibitions) {
        // Check blockbuster status
        const { isBlockbuster, matchedKeywords } = isBlockbusterExhibition(
          exhibition.title,
          exhibition.description,
          exhibition.durationMonths
        );

        if (isBlockbuster) {
          result.blockbustersDetected++;
          exhibition.isBlockbuster = true;
          exhibition.blockbusterKeywords = matchedKeywords;

          // Check if we should trigger a story
          const triggerInfo = shouldTriggerStory(exhibition, currentDate);

          if (triggerInfo.shouldTrigger) {
            // Generate story
            const story = await generateExhibitionStory(exhibition, museum);

            if (story) {
              result.stories.push(story);
              result.storiesGenerated++;
              result.byCity[museum.city]++;
              result.byMuseum[museum.id]++;
            }

            // Rate limiting
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }
    } catch (err) {
      result.errors.push(
        `${museum.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

// ============================================================================
// SAMPLE DATA FOR TESTING
// ============================================================================

/**
 * Create sample exhibition data for testing
 */
export function createSampleExhibitions(): Array<{
  exhibition: Exhibition;
  museum: Museum;
}> {
  const now = new Date();

  // Sample exhibitions opening in the next 48 hours
  const samples: Array<{ exhibition: Exhibition; museum: Museum }> = [
    {
      museum: MUSEUM_TARGETS.find((m) => m.id === 'met')!,
      exhibition: {
        id: 'sample-met-retrospective',
        museumId: 'met',
        title: 'Van Gogh: A Retrospective',
        artist: 'Vincent van Gogh',
        description:
          'The most comprehensive survey of Van Gogh ever assembled. Over 200 masterpieces from private collections and major museums worldwide, seen together for the first time.',
        publicOpeningDate: new Date(now.getTime() + 36 * 60 * 60 * 1000), // 36h from now
        closingDate: new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000), // 4 months
        memberPreviewDate: new Date(now.getTime() + 12 * 60 * 60 * 1000), // 12h from now (member preview first)
        isBlockbuster: true,
        blockbusterKeywords: ['retrospective', 'comprehensive', 'survey', 'first time', 'masterpieces'],
        durationMonths: 4,
        url: 'https://www.metmuseum.org/exhibitions/sample',
      },
    },
    {
      museum: MUSEUM_TARGETS.find((m) => m.id === 'tate-modern')!,
      exhibition: {
        id: 'sample-tate-yayoi',
        museumId: 'tate-modern',
        title: 'Yayoi Kusama: Infinity Mirror Rooms',
        artist: 'Yayoi Kusama',
        description:
          'A major survey of Kusama\'s legendary Infinity Mirror Rooms spanning six decades. Landmark exhibition featuring rarely seen early works.',
        publicOpeningDate: new Date(now.getTime() + 40 * 60 * 60 * 1000), // 40h from now
        closingDate: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), // 3 months
        isBlockbuster: true,
        blockbusterKeywords: ['major', 'survey', 'landmark'],
        durationMonths: 3,
        url: 'https://www.tate.org.uk/whats-on/sample',
      },
    },
    {
      museum: MUSEUM_TARGETS.find((m) => m.id === 'louvre')!,
      exhibition: {
        id: 'sample-louvre-vermeer',
        museumId: 'louvre',
        title: 'Vermeer: The Complete Works',
        artist: 'Johannes Vermeer',
        description:
          'An unprecedented gathering of Vermeer\'s entire surviving oeuvre. All 35 authenticated paintings together for the first time in history.',
        publicOpeningDate: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24h from now
        closingDate: new Date(now.getTime() + 150 * 24 * 60 * 60 * 1000), // 5 months
        memberPreviewDate: new Date(now.getTime() + 6 * 60 * 60 * 1000), // 6h from now
        isBlockbuster: true,
        blockbusterKeywords: ['unprecedented', 'complete', 'first time', 'historic'],
        durationMonths: 5,
        url: 'https://www.louvre.fr/en/exhibitions/sample',
      },
    },
  ];

  return samples;
}

/**
 * Get museum by ID
 */
export function getMuseumById(id: string): Museum | undefined {
  return MUSEUM_TARGETS.find((m) => m.id === id);
}

/**
 * Get all museums for a city
 */
export function getMuseumsForCity(city: HubCity): Museum[] {
  return MUSEUM_TARGETS.filter((m) => m.city === city);
}

/**
 * Get all museums targeting a specific neighborhood
 */
export function getMuseumsForNeighborhood(neighborhoodId: string): Museum[] {
  return MUSEUM_TARGETS.filter((m) => m.targetFeeds.includes(neighborhoodId));
}
