/**
 * Gala Watch Service
 *
 * Aggregates high-society charity events and distributes them to wealthy neighborhood feeds.
 *
 * Architecture: "Hub Broadcast" Model
 * - Galas happen in City Centers (hubs)
 * - Events are broadcast to associated wealthy residential neighborhoods (spokes)
 *
 * Data Sources:
 * 1. Eventbrite API - Global coverage with "High Ticket" filter (>$500 USD equivalent)
 * 2. Society Pages - Targeted scrapers for NY Social Diary, Tatler UK
 *
 * Story Generation: Gemini with "Insider & Exclusive" FOMO tone
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';

// =============================================================================
// TYPES
// =============================================================================

export type GalaHub =
  | 'New_York'
  | 'London'
  | 'Paris'
  | 'Los_Angeles'
  | 'Sydney'
  | 'Miami'
  | 'Hong_Kong'
  | 'Milan'
  | 'Toronto'
  | 'Global';

export type GalaSource =
  | 'NY_Social_Diary'
  | 'Tatler_Bystander'
  | 'Paris_Diary'
  | 'Eventbrite_NYC'
  | 'Eventbrite_LDN'
  | 'Eventbrite_PAR'
  | 'Eventbrite_LA'
  | 'Eventbrite_SYD'
  | 'Eventbrite_MIA'
  | 'Eventbrite_HK'
  | 'Eventbrite_MIL'
  | 'Eventbrite_TOR'
  | 'Eventbrite_Generic'
  | 'Luma';

export type GalaCurrency = 'USD' | 'GBP' | 'EUR' | 'AUD' | 'CAD' | 'HKD' | 'CHF';

export interface HubConfig {
  sources: GalaSource[];
  targetFeeds: string[]; // Neighborhood IDs
  venues: string[]; // Prestigious venue names for filtering
  currency: GalaCurrency;
  searchRadius?: number; // km from city center
}

export interface GalaEvent {
  id: string;
  name: string;
  venue: string;
  venueAddress?: string;
  date: Date;
  price: number;
  currency: GalaCurrency;
  priceUSD: number; // Normalized price
  description?: string;
  url?: string;
  source: GalaSource;
  hub: GalaHub;
  keywords: string[];
  isBlackTie: boolean;
  isBenefit: boolean;
  organization?: string; // Charity or host organization
}

export interface GalaStory {
  hub: GalaHub;
  event: GalaEvent;
  headline: string;
  body: string;
  previewText: string;
  targetNeighborhoods: string[];
  categoryLabel: string;
  generatedAt: string;
}

export interface GalaProcessResult {
  eventsFound: number;
  storiesGenerated: number;
  byHub: Record<string, number>;
  bySource: Record<string, number>;
  stories: GalaStory[];
  errors: string[];
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Hub Broadcast Configuration
 * City hubs where galas happen -> broadcast to wealthy residential neighborhoods
 */
export const GALA_HUBS: Record<GalaHub, HubConfig> = {
  New_York: {
    sources: ['NY_Social_Diary', 'Eventbrite_NYC'],
    targetFeeds: [
      'nyc-upper-east-side',
      'nyc-upper-west-side',
      'nyc-tribeca',
      'nyc-west-village',
      'nyc-soho',
      'nyc-greenwich-village',
      'nyc-chelsea',
      'nyc-hudson-yards',
      'the-hamptons-the-hamptons',
    ],
    venues: [
      'The Metropolitan Museum of Art',
      'The Met',
      'Lincoln Center',
      'Cipriani',
      'The Plaza',
      'Gotham Hall',
      'The Rainbow Room',
      'Tavern on the Green',
      'New York Public Library',
      'NYPL',
      'American Museum of Natural History',
      'AMNH',
      'MoMA',
      'Museum of Modern Art',
      'Whitney Museum',
      'Guggenheim',
      'The Frick',
      'The Pierre',
      'The Carlyle',
      'Four Seasons',
      'The Breakers',
      'Southampton',
      'East Hampton',
    ],
    currency: 'USD',
    searchRadius: 50,
  },

  London: {
    sources: ['Tatler_Bystander', 'Eventbrite_LDN'],
    targetFeeds: [
      'london-mayfair',
      'london-chelsea',
      'london-kensington',
      'london-notting-hill',
      'london-hampstead',
    ],
    venues: [
      'Victoria and Albert Museum',
      'V&A',
      'The Dorchester',
      "Claridge's",
      'The Ritz',
      'Kensington Palace',
      'Natural History Museum',
      'Royal Albert Hall',
      'The Savoy',
      'Banqueting House',
      'Guildhall',
      'The Grosvenor House',
      'Hurlingham Club',
      'The Lanesborough',
      'Lancaster House',
      'Syon House',
    ],
    currency: 'GBP',
    searchRadius: 30,
  },

  Paris: {
    sources: ['Paris_Diary', 'Eventbrite_PAR'],
    targetFeeds: [
      'paris-7th-arrondissement',
      'paris-16th-arrondissement',
      'paris-le-marais',
      'paris-saint-germain',
    ],
    venues: [
      'Palais Garnier',
      'Opera Garnier',
      'Grand Palais',
      'Petit Palais',
      'Ritz Paris',
      'Le Meurice',
      'Four Seasons George V',
      'Palais de Tokyo',
      'Musée Rodin',
      "Musée d'Orsay",
      'Hôtel de Ville',
      'Château de Versailles',
      'Pavillon Cambon',
      'Pavillon Vendôme',
    ],
    currency: 'EUR',
    searchRadius: 25,
  },

  Los_Angeles: {
    sources: ['Eventbrite_LA'],
    targetFeeds: [
      'la-beverly-hills',
      'la-bel-air',
      'la-malibu',
      'la-pacific-palisades',
      'la-brentwood',
      'la-west-hollywood',
      'la-santa-monica',
    ],
    venues: [
      'Academy Museum',
      'LACMA',
      'Los Angeles County Museum of Art',
      'The Getty',
      'Getty Center',
      'Getty Villa',
      'The Broad',
      'Hollywood Bowl',
      'Walt Disney Concert Hall',
      'Beverly Wilshire',
      'The Beverly Hills Hotel',
      'Bel-Air Hotel',
      'Chateau Marmont',
      'SLS Hotel',
    ],
    currency: 'USD',
    searchRadius: 40,
  },

  Sydney: {
    sources: ['Eventbrite_SYD'],
    targetFeeds: [
      'sydney-double-bay',
      'sydney-mosman',
      'sydney-vaucluse',
      'sydney-paddington',
      'sydney-woollahra',
    ],
    venues: [
      'Sydney Opera House',
      'Art Gallery of NSW',
      'Museum of Contemporary Art',
      'MCA',
      'Customs House',
      'The Star',
      'Taronga Zoo',
      'Royal Botanic Garden',
    ],
    currency: 'AUD',
    searchRadius: 25,
  },

  Miami: {
    sources: ['Eventbrite_MIA'],
    targetFeeds: [
      'miami-south-beach',
      'miami-brickell',
      'miami-design-district',
      'miami-coral-gables',
    ],
    venues: [
      'Pérez Art Museum Miami',
      'PAMM',
      'The Bass',
      'Faena Forum',
      'Vizcaya Museum',
      'Fontainebleau',
      'Edition Miami',
      'Four Seasons Surf Club',
    ],
    currency: 'USD',
    searchRadius: 30,
  },

  Hong_Kong: {
    sources: ['Eventbrite_HK'],
    targetFeeds: ['hk-central', 'hk-the-peak', 'hk-soho'],
    venues: [
      'Hong Kong Convention Centre',
      'HKCEC',
      'M+ Museum',
      'Hong Kong Museum of Art',
      'The Peninsula',
      'Mandarin Oriental',
      'The Upper House',
      'Grand Hyatt',
    ],
    currency: 'HKD',
    searchRadius: 15,
  },

  Milan: {
    sources: ['Eventbrite_MIL'],
    targetFeeds: ['milan-brera', 'milan-quadrilatero'],
    venues: [
      'Teatro alla Scala',
      'La Scala',
      'Palazzo Reale',
      'Triennale Milano',
      'Armani/Silos',
      'Fondazione Prada',
      'Four Seasons Milan',
      'Bulgari Hotel',
    ],
    currency: 'EUR',
    searchRadius: 20,
  },

  Toronto: {
    sources: ['Eventbrite_TOR'],
    targetFeeds: ['toronto-yorkville', 'toronto-rosedale', 'toronto-forest-hill'],
    venues: [
      'Royal Ontario Museum',
      'ROM',
      'Art Gallery of Ontario',
      'AGO',
      'Four Seasons Toronto',
      'Ritz-Carlton Toronto',
      'Fairmont Royal York',
    ],
    currency: 'CAD',
    searchRadius: 25,
  },

  Global: {
    sources: ['Eventbrite_Generic', 'Luma'],
    targetFeeds: [], // Dynamically assigned based on location
    venues: [],
    currency: 'USD',
  },
};

/**
 * Gala-identifying keywords
 */
export const GALA_KEYWORDS = [
  'gala',
  'ball',
  'benefit',
  'black tie',
  'charity dinner',
  'fundraiser',
  'philanthropy',
  'annual dinner',
  'anniversary gala',
  'spring gala',
  'fall gala',
  'winter ball',
  'summer soirée',
  'soiree',
  'cocktail reception',
  'patron dinner',
  'chairman dinner',
  'trustees dinner',
];

/**
 * Keywords that indicate NOT a gala (mixers, networking events)
 */
export const EXCLUDE_KEYWORDS = [
  'happy hour',
  'mixer',
  'networking',
  'meetup',
  'workshop',
  'seminar',
  'webinar',
  'class',
  'lesson',
  'training',
  'bootcamp',
  'free event',
  'open bar only',
];

/**
 * Currency conversion rates to USD (approximate, updated periodically)
 */
const CURRENCY_TO_USD: Record<GalaCurrency, number> = {
  USD: 1.0,
  GBP: 1.27, // £1 = $1.27
  EUR: 1.08, // €1 = $1.08
  AUD: 0.65, // A$1 = $0.65
  CAD: 0.74, // C$1 = $0.74
  HKD: 0.13, // HK$1 = $0.13
  CHF: 1.12, // CHF1 = $1.12
};

/**
 * Currency symbols for display
 */
const CURRENCY_SYMBOLS: Record<GalaCurrency, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
  HKD: 'HK$',
  CHF: 'CHF',
};

/**
 * Minimum ticket price threshold in USD for "High Ticket" filter
 */
export const HIGH_TICKET_THRESHOLD_USD = 500;

/**
 * Low ticket price threshold in USD (ignore if below)
 */
export const LOW_TICKET_THRESHOLD_USD = 100;

// =============================================================================
// CURRENCY NORMALIZATION
// =============================================================================

/**
 * Normalize a price to USD equivalent
 */
export function normalizeCurrency(price: number, currency: GalaCurrency): number {
  const rate = CURRENCY_TO_USD[currency] || 1.0;
  return Math.round(price * rate);
}

/**
 * Get the local currency threshold equivalent to $500 USD
 */
export function getLocalThreshold(currency: GalaCurrency): number {
  const rate = CURRENCY_TO_USD[currency] || 1.0;
  return Math.round(HIGH_TICKET_THRESHOLD_USD / rate);
}

/**
 * Format price with currency symbol
 */
export function formatPrice(price: number, currency: GalaCurrency): string {
  const symbol = CURRENCY_SYMBOLS[currency] || '$';
  return `${symbol}${price.toLocaleString()}`;
}

// =============================================================================
// EVENT DETECTION & FILTERING
// =============================================================================

/**
 * Check if an event name/description contains gala keywords
 */
export function containsGalaKeywords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return GALA_KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

/**
 * Check if an event should be excluded (mixers, networking, etc.)
 */
export function shouldExcludeEvent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return EXCLUDE_KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

/**
 * Check if event is at a prestigious venue for the hub
 */
export function isPrestigiousVenue(venue: string, hub: GalaHub): boolean {
  const config = GALA_HUBS[hub];
  if (!config || config.venues.length === 0) return true; // Global fallback

  const lowerVenue = venue.toLowerCase();
  return config.venues.some((v) => lowerVenue.includes(v.toLowerCase()));
}

/**
 * Determine if an event qualifies as a "High Ticket" gala
 */
export function isHighTicketGala(event: Partial<GalaEvent>): boolean {
  // Must have price
  if (!event.price || !event.currency) return false;

  // Normalize to USD
  const priceUSD = normalizeCurrency(event.price, event.currency);

  // Below minimum threshold = not a gala (it's a mixer)
  if (priceUSD < LOW_TICKET_THRESHOLD_USD) return false;

  // Above high ticket threshold = definitely a gala
  if (priceUSD >= HIGH_TICKET_THRESHOLD_USD) return true;

  // In between: check for gala keywords
  const text = `${event.name || ''} ${event.description || ''}`;
  return containsGalaKeywords(text) && !shouldExcludeEvent(text);
}

/**
 * Detect if an event is black tie
 */
export function isBlackTie(text: string): boolean {
  const lowerText = text.toLowerCase();
  return (
    lowerText.includes('black tie') ||
    lowerText.includes('formal attire') ||
    lowerText.includes('evening dress') ||
    lowerText.includes('cocktail attire')
  );
}

/**
 * Detect if an event is a benefit/charity event
 */
export function isBenefitEvent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return (
    lowerText.includes('benefit') ||
    lowerText.includes('charity') ||
    lowerText.includes('fundraiser') ||
    lowerText.includes('philanthropy') ||
    lowerText.includes('foundation')
  );
}

// =============================================================================
// DATA SOURCE A: EVENTBRITE API
// =============================================================================

interface EventbriteEvent {
  id: string;
  name: { text: string };
  description?: { text: string };
  start: { local: string };
  venue?: {
    name: string;
    address?: {
      localized_address_display: string;
    };
  };
  ticket_availability?: {
    minimum_ticket_price?: {
      major_value: string;
      currency: string;
    };
  };
  url: string;
}

/**
 * Fetch events from Eventbrite API for a specific hub
 * Note: Requires EVENTBRITE_API_KEY environment variable
 */
export async function fetchEventbriteEvents(
  hub: GalaHub,
  daysAhead: number = 30
): Promise<GalaEvent[]> {
  const apiKey = process.env.EVENTBRITE_API_KEY;
  if (!apiKey) {
    console.log('EVENTBRITE_API_KEY not configured, skipping Eventbrite fetch');
    return [];
  }

  const config = GALA_HUBS[hub];
  if (!config) return [];

  const events: GalaEvent[] = [];

  try {
    // Build search query
    const keywords = GALA_KEYWORDS.slice(0, 5).join(' OR '); // Eventbrite has query limits
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysAhead);

    // Eventbrite API endpoint
    const params = new URLSearchParams({
      q: keywords,
      'start_date.range_start': startDate.toISOString(),
      'start_date.range_end': endDate.toISOString(),
      expand: 'venue,ticket_availability',
    });

    // Add location based on hub
    const hubLocations: Record<string, string> = {
      New_York: 'New York, NY',
      London: 'London, UK',
      Paris: 'Paris, France',
      Los_Angeles: 'Los Angeles, CA',
      Sydney: 'Sydney, Australia',
      Miami: 'Miami, FL',
      Hong_Kong: 'Hong Kong',
      Milan: 'Milan, Italy',
      Toronto: 'Toronto, Canada',
    };

    if (hubLocations[hub]) {
      params.append('location.address', hubLocations[hub]);
      params.append('location.within', `${config.searchRadius || 50}km`);
    }

    const response = await fetch(
      `https://www.eventbriteapi.com/v3/events/search/?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Eventbrite API error for ${hub}:`, response.status);
      return [];
    }

    const data = await response.json();
    const ebEvents: EventbriteEvent[] = data.events || [];

    for (const eb of ebEvents) {
      // Extract price
      const priceStr = eb.ticket_availability?.minimum_ticket_price?.major_value;
      const currencyStr = eb.ticket_availability?.minimum_ticket_price?.currency || 'USD';
      const price = priceStr ? parseFloat(priceStr) : 0;
      const currency = currencyStr as GalaCurrency;

      const eventText = `${eb.name.text} ${eb.description?.text || ''}`;

      // Skip excluded events
      if (shouldExcludeEvent(eventText)) continue;

      const galaEvent: GalaEvent = {
        id: `eventbrite-${eb.id}`,
        name: eb.name.text,
        venue: eb.venue?.name || 'Venue TBA',
        venueAddress: eb.venue?.address?.localized_address_display,
        date: new Date(eb.start.local),
        price,
        currency,
        priceUSD: normalizeCurrency(price, currency),
        description: eb.description?.text,
        url: eb.url,
        source: `Eventbrite_${hub === 'New_York' ? 'NYC' : hub.substring(0, 3).toUpperCase()}` as GalaSource,
        hub,
        keywords: GALA_KEYWORDS.filter((k) => eventText.toLowerCase().includes(k)),
        isBlackTie: isBlackTie(eventText),
        isBenefit: isBenefitEvent(eventText),
      };

      // Apply High Ticket filter
      if (isHighTicketGala(galaEvent)) {
        events.push(galaEvent);
      }
    }
  } catch (error) {
    console.error(`Error fetching Eventbrite events for ${hub}:`, error);
  }

  return events;
}

// =============================================================================
// DATA SOURCE B: SOCIETY PAGE SCRAPERS
// =============================================================================

/**
 * Scrape New York Social Diary calendar
 * URL: https://www.newyorksocialdiary.com/calendar/
 */
export async function scrapeNYSocialDiary(): Promise<GalaEvent[]> {
  const events: GalaEvent[] = [];

  try {
    const response = await fetch('https://www.newyorksocialdiary.com/calendar/', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.log('NY Social Diary fetch failed:', response.status);
      return [];
    }

    const html = await response.text();

    // Extract benefit events using regex patterns
    // Looking for patterns like: "Event Name at Venue - Date"
    const eventPatterns = [
      // Pattern: "Benefit for Organization at Venue"
      /(?:benefit|gala|ball|dinner)\s+(?:for|at|celebrating)\s+([^<]+?)(?:\s+at\s+([^<]+?))?(?:\s*[-–]\s*(\w+\s+\d+))?/gi,
      // Pattern: "Annual Gala at Venue"
      /(\d+(?:st|nd|rd|th)?\s+annual\s+[^<]+?(?:gala|ball|benefit))\s+(?:at\s+)?([^<]+?)(?:\s*[-–]\s*(\w+\s+\d+))?/gi,
    ];

    for (const pattern of eventPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const eventName = match[1]?.trim();
        const venue = match[2]?.trim() || 'TBA';
        const dateStr = match[3]?.trim();

        if (eventName && eventName.length > 5) {
          // Parse date or use upcoming date
          let eventDate = new Date();
          if (dateStr) {
            const parsed = new Date(dateStr + ' ' + new Date().getFullYear());
            if (!isNaN(parsed.getTime())) {
              eventDate = parsed;
            }
          }

          // NY Social Diary events are typically high-end ($500+)
          const event: GalaEvent = {
            id: `nysd-${Buffer.from(eventName).toString('base64').substring(0, 12)}`,
            name: eventName,
            venue: venue,
            date: eventDate,
            price: 500, // Assumed minimum for NYSD events
            currency: 'USD',
            priceUSD: 500,
            url: 'https://www.newyorksocialdiary.com/calendar/',
            source: 'NY_Social_Diary',
            hub: 'New_York',
            keywords: GALA_KEYWORDS.filter((k) => eventName.toLowerCase().includes(k)),
            isBlackTie: isBlackTie(eventName),
            isBenefit: true, // NYSD focuses on benefits
          };

          events.push(event);
        }
      }
    }

    console.log(`NY Social Diary: Found ${events.length} events`);
  } catch (error) {
    console.error('Error scraping NY Social Diary:', error);
  }

  return events;
}

/**
 * Scrape Tatler UK parties/events
 * URL: https://www.tatler.com/topic/parties
 */
export async function scrapeTatler(): Promise<GalaEvent[]> {
  const events: GalaEvent[] = [];

  try {
    const response = await fetch('https://www.tatler.com/topic/parties', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.log('Tatler fetch failed:', response.status);
      return [];
    }

    const html = await response.text();

    // Extract article titles that mention upcoming events
    // Tatler format: "Save the date for X" or "Inside the Y Ball"
    const titlePatterns = [
      /<h[23][^>]*>([^<]*(?:ball|gala|benefit|charity dinner)[^<]*)<\/h[23]>/gi,
      /save the date[^<]*for[^<]*([^<]+)/gi,
      /upcoming[^<]*([^<]+(?:ball|gala|benefit)[^<]*)/gi,
    ];

    for (const pattern of titlePatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const eventName = match[1]?.trim().replace(/<[^>]+>/g, '');

        if (eventName && eventName.length > 5 && eventName.length < 150) {
          // Extract venue if mentioned
          const venueMatch = eventName.match(/at\s+(?:the\s+)?([^,]+)/i);
          const venue = venueMatch ? venueMatch[1].trim() : 'London';

          const event: GalaEvent = {
            id: `tatler-${Buffer.from(eventName).toString('base64').substring(0, 12)}`,
            name: eventName,
            venue: venue,
            date: new Date(), // Tatler doesn't always have exact dates
            price: 400, // UK equivalent of $500
            currency: 'GBP',
            priceUSD: normalizeCurrency(400, 'GBP'),
            url: 'https://www.tatler.com/topic/parties',
            source: 'Tatler_Bystander',
            hub: 'London',
            keywords: GALA_KEYWORDS.filter((k) => eventName.toLowerCase().includes(k)),
            isBlackTie: isBlackTie(eventName),
            isBenefit: isBenefitEvent(eventName),
          };

          events.push(event);
        }
      }
    }

    console.log(`Tatler: Found ${events.length} events`);
  } catch (error) {
    console.error('Error scraping Tatler:', error);
  }

  return events;
}

// =============================================================================
// GEMINI STORY GENERATION
// =============================================================================

/**
 * Generate a gala story using Gemini
 * Tone: "Insider & Exclusive" FOMO engine
 */
export async function generateGalaStory(event: GalaEvent): Promise<GalaStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const config = GALA_HUBS[event.hub];
  const cityName = event.hub.replace(/_/g, ' ');
  const priceDisplay = formatPrice(event.price, event.currency);

  // Determine dress code context
  const dressCode = event.isBlackTie ? 'Black tie expected.' : 'Cocktail attire.';

  // Determine event type
  const eventType = event.isBenefit ? 'charity benefit' : 'high-society gala';

  const prompt = `You are the Society Editor for Flâneur in ${cityName}.
Data: ${JSON.stringify({
    name: event.name,
    venue: event.venue,
    date: event.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    price: priceDisplay,
    isBlackTie: event.isBlackTie,
    isBenefit: event.isBenefit,
    organization: event.organization,
  })}

Context:
- This is a high-status ${eventType} (Ticket price: ${priceDisplay}).
- Audience: People who go to these to be photographed, and those who need to know what's happening.
- Tone: 'Insider & Exclusive'. Even if readers aren't attending, they need to know it's happening (to avoid traffic, or to mention it knowledgeably).
- ${dressCode}

Task: Write a blurb for the Flâneur Social Calendar.

Format your response as JSON:
{
  "headline": "Social Calendar: [Event Name] at [Venue]",
  "body": "[35-40 word blurb mentioning the venue, expected crowd, and ticket price]",
  "previewText": "[15-word teaser for feed cards]",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 2-3 link candidates for key entities mentioned in the body (venue, organization, event name).

Constraints:
- Headline MUST start with "Social Calendar:"
- Body MUST mention the specific venue name
- Body MUST mention the ticket price
- Tone: Knowing, not breathless. Like insider gossip.
- Example body: "The city's philanthropists descend on [Venue] tonight. Expect heavy black cars and high fashion. Tickets started at [Price]."`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Gemini response for gala story');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || `High society gathers at ${event.venue}. Tickets from ${priceDisplay}.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, { name: cityName, city: cityName });
    }

    return {
      hub: event.hub,
      event,
      headline: parsed.headline || `Social Calendar: ${event.name}`,
      body,
      previewText: parsed.previewText || `${event.name} at ${event.venue}`,
      targetNeighborhoods: config.targetFeeds,
      categoryLabel: 'Social Calendar',
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error generating gala story:', error);
    return null;
  }
}

// =============================================================================
// MAIN PROCESSING PIPELINE
// =============================================================================

/**
 * Process all gala events across all hubs
 */
export async function processGalaWatch(daysAhead: number = 30): Promise<GalaProcessResult> {
  const result: GalaProcessResult = {
    eventsFound: 0,
    storiesGenerated: 0,
    byHub: {},
    bySource: {},
    stories: [],
    errors: [],
  };

  const allEvents: GalaEvent[] = [];

  // Fetch from all hubs
  for (const [hubName, config] of Object.entries(GALA_HUBS)) {
    const hub = hubName as GalaHub;
    if (hub === 'Global') continue; // Skip global for now

    try {
      // Fetch from Eventbrite
      if (config.sources.some((s) => s.startsWith('Eventbrite'))) {
        const ebEvents = await fetchEventbriteEvents(hub, daysAhead);
        allEvents.push(...ebEvents);

        for (const event of ebEvents) {
          result.bySource[event.source] = (result.bySource[event.source] || 0) + 1;
        }
      }

      // Fetch from society pages
      if (config.sources.includes('NY_Social_Diary')) {
        const nysdEvents = await scrapeNYSocialDiary();
        allEvents.push(...nysdEvents);
        result.bySource['NY_Social_Diary'] = (result.bySource['NY_Social_Diary'] || 0) + nysdEvents.length;
      }

      if (config.sources.includes('Tatler_Bystander')) {
        const tatlerEvents = await scrapeTatler();
        allEvents.push(...tatlerEvents);
        result.bySource['Tatler_Bystander'] = (result.bySource['Tatler_Bystander'] || 0) + tatlerEvents.length;
      }
    } catch (error) {
      result.errors.push(`${hub}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  result.eventsFound = allEvents.length;

  // Deduplicate by event name similarity
  const uniqueEvents = deduplicateEvents(allEvents);

  // Count by hub
  for (const event of uniqueEvents) {
    result.byHub[event.hub] = (result.byHub[event.hub] || 0) + 1;
  }

  // Generate stories for each unique event
  for (const event of uniqueEvents) {
    try {
      const story = await generateGalaStory(event);
      if (story) {
        result.stories.push(story);
        result.storiesGenerated++;
      }
    } catch (error) {
      result.errors.push(`Story gen for ${event.name}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Rate limit
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return result;
}

/**
 * Deduplicate events by name similarity
 */
function deduplicateEvents(events: GalaEvent[]): GalaEvent[] {
  const seen = new Map<string, GalaEvent>();

  for (const event of events) {
    // Normalize name for comparison
    const normalizedName = event.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 30);

    // Keep the one with more info (higher price, more keywords)
    const existing = seen.get(normalizedName);
    if (!existing || event.priceUSD > existing.priceUSD || event.keywords.length > existing.keywords.length) {
      seen.set(normalizedName, event);
    }
  }

  return Array.from(seen.values());
}

// =============================================================================
// SAMPLE DATA FOR TESTING
// =============================================================================

/**
 * Create sample gala events for testing
 */
export function createSampleGalaEvents(): GalaEvent[] {
  return [
    {
      id: 'sample-met-gala',
      name: 'The Met Gala 2026',
      venue: 'The Metropolitan Museum of Art',
      venueAddress: '1000 Fifth Avenue, New York, NY',
      date: new Date('2026-05-05'),
      price: 35000,
      currency: 'USD',
      priceUSD: 35000,
      description: 'The annual fundraising gala for the Metropolitan Museum of Art',
      url: 'https://www.metmuseum.org',
      source: 'NY_Social_Diary',
      hub: 'New_York',
      keywords: ['gala', 'benefit', 'black tie'],
      isBlackTie: true,
      isBenefit: true,
      organization: 'Metropolitan Museum of Art',
    },
    {
      id: 'sample-serpentine',
      name: 'Serpentine Summer Party 2026',
      venue: 'Serpentine Galleries',
      venueAddress: 'Kensington Gardens, London',
      date: new Date('2026-06-28'),
      price: 1500,
      currency: 'GBP',
      priceUSD: normalizeCurrency(1500, 'GBP'),
      description: 'Annual summer party celebrating contemporary art',
      url: 'https://www.serpentinegalleries.org',
      source: 'Tatler_Bystander',
      hub: 'London',
      keywords: ['gala', 'charity'],
      isBlackTie: false,
      isBenefit: true,
      organization: 'Serpentine Galleries',
    },
    {
      id: 'sample-lacma',
      name: 'LACMA Art+Film Gala',
      venue: 'Los Angeles County Museum of Art',
      venueAddress: '5905 Wilshire Blvd, Los Angeles',
      date: new Date('2026-11-08'),
      price: 5000,
      currency: 'USD',
      priceUSD: 5000,
      description: 'Annual fundraiser honoring film and art',
      url: 'https://www.lacma.org',
      source: 'Eventbrite_LA',
      hub: 'Los_Angeles',
      keywords: ['gala', 'benefit', 'black tie'],
      isBlackTie: true,
      isBenefit: true,
      organization: 'LACMA',
    },
  ];
}
