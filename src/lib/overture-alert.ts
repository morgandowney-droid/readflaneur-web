/**
 * Overture Alert Service
 *
 * Monitors Opera, Ballet, and Symphony calendars to identify
 * "Opening Nights" of new productions and alert society patrons.
 *
 * Strategy: "The Premiere Filter"
 * - We don't want the 15th performance of "The Nutcracker"
 * - We want the PREMIERE: Opening Night, New Production, Gala
 * - Optional "Star Power" filter for notable conductors/performers
 *
 * Targets: The High Arts venues in major cultural capitals
 * - NYC: Met Opera, NY Philharmonic, NYC Ballet
 * - London: Royal Opera House, English National Ballet
 * - Paris: Opéra Garnier, Opéra Bastille
 * - Milan: Teatro alla Scala
 * - Sydney: Sydney Opera House (Opera Australia)
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
// PERFORMANCE HUBS CONFIGURATION
// ============================================================================

export type PerformanceCity =
  | 'New_York'
  | 'London'
  | 'Paris'
  | 'Milan'
  | 'Sydney';

export type PerformanceType = 'Opera' | 'Ballet' | 'Symphony' | 'Concert';

export interface PerformanceVenue {
  id: string;
  name: string;
  shortName: string;
  city: PerformanceCity;
  type: PerformanceType[];
  calendarUrl: string;
  neighborhoodId: string;
  targetFeeds: string[];
}

/**
 * High Arts Performance Hubs we track
 */
export const PERFORMANCE_HUBS: PerformanceVenue[] = [
  // New York
  {
    id: 'met-opera',
    name: 'The Metropolitan Opera',
    shortName: 'Met Opera',
    city: 'New_York',
    type: ['Opera'],
    calendarUrl: 'https://www.metopera.org/season/calendar/',
    neighborhoodId: 'upper-west-side',
    targetFeeds: ['upper-west-side', 'upper-east-side', 'tribeca', 'west-village', 'chelsea'],
  },
  {
    id: 'ny-philharmonic',
    name: 'New York Philharmonic',
    shortName: 'NY Phil',
    city: 'New_York',
    type: ['Symphony', 'Concert'],
    calendarUrl: 'https://nyphil.org/concerts-tickets/explore',
    neighborhoodId: 'upper-west-side',
    targetFeeds: ['upper-west-side', 'upper-east-side', 'tribeca', 'west-village'],
  },
  {
    id: 'nyc-ballet',
    name: 'New York City Ballet',
    shortName: 'NYC Ballet',
    city: 'New_York',
    type: ['Ballet'],
    calendarUrl: 'https://www.nycballet.com/discover/rep-and-artists/',
    neighborhoodId: 'upper-west-side',
    targetFeeds: ['upper-west-side', 'upper-east-side', 'tribeca', 'chelsea'],
  },

  // London
  {
    id: 'royal-opera-house',
    name: 'Royal Opera House',
    shortName: 'ROH',
    city: 'London',
    type: ['Opera', 'Ballet'],
    calendarUrl: 'https://www.roh.org.uk/whats-on',
    neighborhoodId: 'covent-garden',
    targetFeeds: ['mayfair', 'chelsea', 'kensington', 'covent-garden', 'notting-hill'],
  },
  {
    id: 'english-national-ballet',
    name: 'English National Ballet',
    shortName: 'ENB',
    city: 'London',
    type: ['Ballet'],
    calendarUrl: 'https://www.ballet.org.uk/whats-on/',
    neighborhoodId: 'south-bank',
    targetFeeds: ['mayfair', 'chelsea', 'kensington', 'south-bank'],
  },

  // Paris
  {
    id: 'opera-garnier',
    name: 'Palais Garnier',
    shortName: 'Opéra Garnier',
    city: 'Paris',
    type: ['Opera', 'Ballet'],
    calendarUrl: 'https://www.operadeparis.fr/en/season-calendar',
    neighborhoodId: 'opera',
    targetFeeds: ['marais', 'saint-germain', 'champs-elysees'],
  },
  {
    id: 'opera-bastille',
    name: 'Opéra Bastille',
    shortName: 'Opéra Bastille',
    city: 'Paris',
    type: ['Opera', 'Ballet'],
    calendarUrl: 'https://www.operadeparis.fr/en/season-calendar',
    neighborhoodId: 'bastille',
    targetFeeds: ['marais', 'saint-germain', 'bastille'],
  },

  // Milan
  {
    id: 'la-scala',
    name: 'Teatro alla Scala',
    shortName: 'La Scala',
    city: 'Milan',
    type: ['Opera', 'Ballet', 'Symphony'],
    calendarUrl: 'https://www.teatroallascala.org/en/season/calendar.html',
    neighborhoodId: 'centro-storico',
    targetFeeds: ['centro-storico', 'brera', 'quadrilatero'],
  },

  // Sydney
  {
    id: 'sydney-opera-house',
    name: 'Sydney Opera House',
    shortName: 'Sydney Opera House',
    city: 'Sydney',
    type: ['Opera', 'Symphony', 'Ballet'],
    calendarUrl: 'https://www.sydneyoperahouse.com/events',
    neighborhoodId: 'circular-quay',
    targetFeeds: ['circular-quay', 'potts-point', 'double-bay', 'paddington'],
  },
];

// ============================================================================
// STAR POWER WHITELIST
// ============================================================================

/**
 * Notable conductors and performers that elevate a premiere
 */
export const STAR_CONDUCTORS = [
  'Gustavo Dudamel',
  'Yannick Nézet-Séguin',
  'Sir Antonio Pappano',
  'Riccardo Muti',
  'Kirill Petrenko',
  'Andris Nelsons',
  'Simon Rattle',
  'Esa-Pekka Salonen',
  'Jaap van Zweden',
  'Mirga Gražinytė-Tyla',
];

export const STAR_SINGERS = [
  'Anna Netrebko',
  'Jonas Kaufmann',
  'Plácido Domingo',
  'Renée Fleming',
  'Diana Damrau',
  'Juan Diego Flórez',
  'Sonya Yoncheva',
  'Pretty Yende',
  'Lisette Oropesa',
  'Michael Fabiano',
  'Piotr Beczała',
  'Elīna Garanča',
  'Joyce DiDonato',
  'Javier Camarena',
  'Lise Davidsen',
];

export const STAR_DANCERS = [
  'Misty Copeland',
  'Roberto Bolle',
  'Natalia Osipova',
  'Carlos Acosta',
  'Svetlana Zakharova',
  'Sergei Polunin',
  'Isabella Boylston',
  'Alessandra Ferri',
];

// ============================================================================
// PERFORMANCE TYPES
// ============================================================================

export interface Performance {
  id: string;
  venueId: string;
  title: string;
  composer?: string;
  choreographer?: string;
  conductor?: string;
  performers: string[];
  performanceType: PerformanceType;
  date: Date;
  time: string;
  isPremiere: boolean;
  premiereType?: 'opening_night' | 'new_production' | 'premiere' | 'gala' | 'season_opener';
  hasStarPower: boolean;
  starNames: string[];
  url?: string;
}

export interface OvertureStory {
  performanceId: string;
  venueId: string;
  venueName: string;
  title: string;
  composer?: string;
  city: PerformanceCity;
  performanceType: PerformanceType;
  headline: string;
  body: string;
  previewText: string;
  targetNeighborhoods: string[];
  premiereType: string;
  performanceDate: string;
  categoryLabel: string;
  generatedAt: string;
}

export interface OvertureAlertResult {
  venuesScanned: number;
  performancesFound: number;
  premieresDetected: number;
  storiesGenerated: number;
  byCity: Record<PerformanceCity, number>;
  byType: Record<PerformanceType, number>;
  byPremiereType: Record<string, number>;
  errors: string[];
  stories: OvertureStory[];
}

// ============================================================================
// PREMIERE FILTER
// ============================================================================

/**
 * Tags that indicate a premiere/opening night
 */
const PREMIERE_KEYWORDS = [
  'opening night',
  'new production',
  'premiere',
  'world premiere',
  'us premiere',
  'uk premiere',
  'european premiere',
  'gala',
  'gala performance',
  'season opener',
  'season opening',
  'first night',
  'opening performance',
];

/**
 * Check if a performance is a premiere/opening night
 */
export function isPremierePerformance(
  title: string,
  description: string
): { isPremiere: boolean; premiereType?: string } {
  const textToSearch = `${title} ${description}`.toLowerCase();

  for (const keyword of PREMIERE_KEYWORDS) {
    if (textToSearch.includes(keyword.toLowerCase())) {
      // Determine premiere type
      let premiereType: string;
      if (keyword.includes('gala')) {
        premiereType = 'gala';
      } else if (keyword.includes('new production')) {
        premiereType = 'new_production';
      } else if (keyword.includes('world premiere') || keyword.includes('premiere')) {
        premiereType = 'premiere';
      } else if (keyword.includes('season')) {
        premiereType = 'season_opener';
      } else {
        premiereType = 'opening_night';
      }

      return { isPremiere: true, premiereType };
    }
  }

  return { isPremiere: false };
}

/**
 * Check for star power in performers/conductor
 */
export function checkStarPower(
  conductor?: string,
  performers: string[] = []
): { hasStarPower: boolean; starNames: string[] } {
  const starNames: string[] = [];
  const allStars = [...STAR_CONDUCTORS, ...STAR_SINGERS, ...STAR_DANCERS];

  // Check conductor
  if (conductor) {
    for (const star of allStars) {
      if (conductor.toLowerCase().includes(star.toLowerCase())) {
        starNames.push(star);
      }
    }
  }

  // Check performers
  for (const performer of performers) {
    for (const star of allStars) {
      if (performer.toLowerCase().includes(star.toLowerCase())) {
        if (!starNames.includes(star)) {
          starNames.push(star);
        }
      }
    }
  }

  return {
    hasStarPower: starNames.length > 0,
    starNames,
  };
}

/**
 * Determine if we should generate a story for this performance
 */
export function shouldGenerateStory(
  performance: Performance,
  currentDate: Date = new Date()
): boolean {
  // Must be a premiere
  if (!performance.isPremiere) {
    return false;
  }

  // Must be in the future (within next 48 hours ideally)
  const hoursUntil =
    (performance.date.getTime() - currentDate.getTime()) / (60 * 60 * 1000);

  // Generate story if performance is within next 48 hours
  return hoursUntil > 0 && hoursUntil <= 48;
}

// ============================================================================
// STORY GENERATION
// ============================================================================

/**
 * Generate an overture story using Gemini
 */
export async function generateOvertureStory(
  performance: Performance,
  venue: PerformanceVenue
): Promise<OvertureStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Format date
  const performanceDateStr = performance.date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // City-specific context
  const cityContext: Record<PerformanceCity, string> = {
    New_York: `Reference Lincoln Center, the Met Opera's red carpet, or the Upper West Side pre-theater dinner circuit. New York society values being seen. The patrons' circle matters.`,
    London: `Reference Covent Garden, the Crush Room, or pre-show champagne. British high society attends. Royalty may be present. Black tie is essential.`,
    Paris: `Reference the Palais Garnier's grand staircase, the Opera District, or post-performance suppers. Parisian elegance. Haute couture on display.`,
    Milan: `Reference La Scala's legendary opening night on December 7th (Sant'Ambrogio), the Milanese aristocracy, and Italian operatic tradition. This is opera's spiritual home.`,
    Sydney: `Reference the iconic sails of the Opera House, Circular Quay, and Australian cultural elite. The harbor views from intermission. Summer black tie.`,
  };

  // Performance type context
  const typeContext: Record<PerformanceType, string> = {
    Opera: `This is opera at its finest. The singers, the orchestra, the staging - everything must align. Mention the composer and the significance of the work.`,
    Ballet: `This is dance at its most elevated. The corps de ballet, the principal dancers, the choreography. Grace and athleticism in perfect harmony.`,
    Symphony: `This is the orchestra at full power. The conductor's interpretation, the repertoire selection. A night of musical brilliance.`,
    Concert: `A special concert event. The program, the performers, the occasion.`,
  };

  // Build star power mention
  let starPowerNote = '';
  if (performance.hasStarPower && performance.starNames.length > 0) {
    starPowerNote = `Star Power: ${performance.starNames.join(', ')} - mention this draws the cognoscenti.`;
  }

  const systemPrompt = `You are the Arts Editor for Flâneur in ${venue.city.replace('_', ' ')}.

Context:
- It is Opening Night at ${venue.name}.
- Your audience: Society figures and opera/ballet/symphony patrons.
- Tone: Glittering. This is THE cultural event.

${cityContext[venue.city]}

${typeContext[performance.performanceType]}

${starPowerNote}

Writing Style:
- Sophisticated, cultured, effervescent
- Create the sense of occasion - this is a night to be seen
- Black tie is expected
- No emojis
- Mention what makes this premiere special`;

  const prompt = `Performance: ${performance.title}
${performance.composer ? `Composer: ${performance.composer}` : ''}
${performance.choreographer ? `Choreographer: ${performance.choreographer}` : ''}
${performance.conductor ? `Conductor: ${performance.conductor}` : ''}
${performance.performers.length > 0 ? `Performers: ${performance.performers.join(', ')}` : ''}
Venue: ${venue.name} (${venue.shortName})
City: ${venue.city.replace('_', ' ')}
Date: ${performanceDateStr} at ${performance.time}
Type: ${performance.performanceType}
Premiere Type: ${performance.premiereType || 'Opening Night'}

Task: Write a 30-word "Curtain Up" blurb for Flâneur society readers.

Return JSON:
{
  "headline": "Curtain Up: [Show Name] premieres at [Venue] tonight - under 70 chars",
  "body": "30-word blurb capturing the glittering occasion and why this premiere matters",
  "previewText": "One sentence teaser for the feed",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 2-4 link candidates for key entities mentioned in the body (venue, performance title, notable performers).`;

  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: {
        temperature: 0.8,
      },
    });

    const rawText = response.text || '';

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response for overture story');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || `Opening night at ${venue.name}. Black tie expected.`;
    if (linkCandidates.length > 0) {
      // Use venue's primary neighborhood for context
      const neighborhoodName = venue.neighborhoodId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const cityName = venue.city.replace(/_/g, ' ');
      body = injectHyperlinks(body, linkCandidates, { name: neighborhoodName, city: cityName });
    }

    // Determine category label based on premiere type
    let categoryLabel: string;
    switch (performance.premiereType) {
      case 'gala':
        categoryLabel = 'Curtain Up: Gala';
        break;
      case 'season_opener':
        categoryLabel = 'Curtain Up: Season Opener';
        break;
      case 'new_production':
        categoryLabel = 'Curtain Up: New Production';
        break;
      case 'premiere':
        categoryLabel = 'Curtain Up: Premiere';
        break;
      default:
        categoryLabel = 'Curtain Up';
    }

    return {
      performanceId: performance.id,
      venueId: venue.id,
      venueName: venue.name,
      title: performance.title,
      composer: performance.composer,
      city: venue.city,
      performanceType: performance.performanceType,
      headline: parsed.headline || `Curtain Up: ${performance.title} premieres at ${venue.shortName}`,
      body,
      previewText: parsed.previewText || `${venue.shortName} presents ${performance.title}.`,
      targetNeighborhoods: venue.targetFeeds,
      premiereType: performance.premiereType || 'opening_night',
      performanceDate: performance.date.toISOString().split('T')[0],
      categoryLabel,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Overture story generation error for ${performance.title}:`, error);
    return null;
  }
}

// ============================================================================
// SCRAPING / DATA FETCHING
// ============================================================================

/**
 * Fetch upcoming performances from a venue's calendar
 * In production, this would scrape the actual venue websites
 */
export async function fetchVenuePerformances(
  venue: PerformanceVenue,
  _hoursAhead: number = 48
): Promise<Performance[]> {
  // TODO: Implement actual web scraping for each venue
  // Each venue has different calendar structure
  //
  // For now, return empty array - in production, this would:
  // 1. Fetch the venue's calendar page
  // 2. Parse performance titles, dates, times
  // 3. Filter for premieres using the premiere filter
  // 4. Check for star power

  console.log(`Would fetch performances from ${venue.name} at ${venue.calendarUrl}`);
  return [];
}

/**
 * Process all venue calendars and generate stories
 */
export async function processOvertureAlerts(
  hoursAhead: number = 48
): Promise<OvertureAlertResult> {
  const result: OvertureAlertResult = {
    venuesScanned: 0,
    performancesFound: 0,
    premieresDetected: 0,
    storiesGenerated: 0,
    byCity: {
      New_York: 0,
      London: 0,
      Paris: 0,
      Milan: 0,
      Sydney: 0,
    },
    byType: {
      Opera: 0,
      Ballet: 0,
      Symphony: 0,
      Concert: 0,
    },
    byPremiereType: {},
    errors: [],
    stories: [],
  };

  const currentDate = new Date();

  for (const venue of PERFORMANCE_HUBS) {
    try {
      result.venuesScanned++;

      // Fetch performances
      const performances = await fetchVenuePerformances(venue, hoursAhead);
      result.performancesFound += performances.length;

      // Process each performance
      for (const performance of performances) {
        if (performance.isPremiere) {
          result.premieresDetected++;

          // Check if we should generate a story
          if (shouldGenerateStory(performance, currentDate)) {
            const story = await generateOvertureStory(performance, venue);

            if (story) {
              result.stories.push(story);
              result.storiesGenerated++;
              result.byCity[venue.city]++;
              result.byType[performance.performanceType]++;

              // Track by premiere type
              const premiereType = performance.premiereType || 'opening_night';
              result.byPremiereType[premiereType] =
                (result.byPremiereType[premiereType] || 0) + 1;
            }

            // Rate limiting
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }
    } catch (err) {
      result.errors.push(
        `${venue.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

// ============================================================================
// SAMPLE DATA FOR TESTING
// ============================================================================

/**
 * Create sample performance data for testing
 */
export function createSamplePerformances(): Array<{
  performance: Performance;
  venue: PerformanceVenue;
}> {
  const now = new Date();

  const samples: Array<{ performance: Performance; venue: PerformanceVenue }> = [
    // Met Opera - New Production of La Traviata
    {
      venue: PERFORMANCE_HUBS.find((v) => v.id === 'met-opera')!,
      performance: {
        id: 'sample-met-traviata',
        venueId: 'met-opera',
        title: 'La Traviata',
        composer: 'Giuseppe Verdi',
        conductor: 'Yannick Nézet-Séguin',
        performers: ['Lisette Oropesa', 'Michael Fabiano'],
        performanceType: 'Opera',
        date: new Date(now.getTime() + 12 * 60 * 60 * 1000), // 12h from now
        time: '7:30 PM',
        isPremiere: true,
        premiereType: 'new_production',
        hasStarPower: true,
        starNames: ['Yannick Nézet-Séguin', 'Lisette Oropesa', 'Michael Fabiano'],
        url: 'https://www.metopera.org/season/sample',
      },
    },
    // Royal Opera House - Opening Night Gala
    {
      venue: PERFORMANCE_HUBS.find((v) => v.id === 'royal-opera-house')!,
      performance: {
        id: 'sample-roh-tosca',
        venueId: 'royal-opera-house',
        title: 'Tosca',
        composer: 'Giacomo Puccini',
        conductor: 'Sir Antonio Pappano',
        performers: ['Anna Netrebko', 'Jonas Kaufmann'],
        performanceType: 'Opera',
        date: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24h from now
        time: '7:00 PM',
        isPremiere: true,
        premiereType: 'gala',
        hasStarPower: true,
        starNames: ['Sir Antonio Pappano', 'Anna Netrebko', 'Jonas Kaufmann'],
        url: 'https://www.roh.org.uk/sample',
      },
    },
    // NYC Ballet - Season Opener
    {
      venue: PERFORMANCE_HUBS.find((v) => v.id === 'nyc-ballet')!,
      performance: {
        id: 'sample-nycb-nutcracker',
        venueId: 'nyc-ballet',
        title: 'The Nutcracker',
        choreographer: 'George Balanchine',
        performers: ['Misty Copeland', 'Tiler Peck'],
        performanceType: 'Ballet',
        date: new Date(now.getTime() + 36 * 60 * 60 * 1000), // 36h from now
        time: '8:00 PM',
        isPremiere: true,
        premiereType: 'season_opener',
        hasStarPower: true,
        starNames: ['Misty Copeland'],
        url: 'https://www.nycballet.com/sample',
      },
    },
    // La Scala - December 7th Opening (Sant'Ambrogio)
    {
      venue: PERFORMANCE_HUBS.find((v) => v.id === 'la-scala')!,
      performance: {
        id: 'sample-scala-boris',
        venueId: 'la-scala',
        title: 'Boris Godunov',
        composer: 'Modest Mussorgsky',
        conductor: 'Riccardo Muti',
        performers: ['Ildar Abdrazakov'],
        performanceType: 'Opera',
        date: new Date(now.getTime() + 6 * 60 * 60 * 1000), // 6h from now
        time: '6:00 PM',
        isPremiere: true,
        premiereType: 'season_opener',
        hasStarPower: true,
        starNames: ['Riccardo Muti'],
        url: 'https://www.teatroallascala.org/sample',
      },
    },
  ];

  return samples;
}

/**
 * Get venue by ID
 */
export function getVenueById(id: string): PerformanceVenue | undefined {
  return PERFORMANCE_HUBS.find((v) => v.id === id);
}

/**
 * Get all venues for a city
 */
export function getVenuesForCity(city: PerformanceCity): PerformanceVenue[] {
  return PERFORMANCE_HUBS.filter((v) => v.city === city);
}

/**
 * Get all venues targeting a specific neighborhood
 */
export function getVenuesForNeighborhood(neighborhoodId: string): PerformanceVenue[] {
  return PERFORMANCE_HUBS.filter((v) => v.targetFeeds.includes(neighborhoodId));
}
