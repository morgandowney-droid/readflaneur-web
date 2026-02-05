/**
 * Route Alert Service
 *
 * Monitors airline schedules to alert residents when new
 * "Direct Premium Routes" launch from their local hub.
 *
 * Strategy: "The Hub Map"
 * - Map neighborhoods to hub airports
 * - Track new direct premium routes
 * - Filter for leisure destinations and legacy carriers
 *
 * Data Sources:
 * - Routes Online / The Points Guy (new route news)
 * - Airline Press Rooms (Delta, United, BA, Emirates, Qantas)
 *
 * Schedule: Weekly on Thursdays at 7 AM UTC
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';

// ============================================================================
// TYPES
// ============================================================================

export type CarrierTier = 'Legacy' | 'Premium' | 'Low_Cost';

export type DestinationType = 'Leisure_Capital' | 'Financial_Hub' | 'Cultural_Center' | 'Other';

export interface AirportHub {
  code: string;
  name: string;
  city: string;
  country: string;
}

export interface HubMapping {
  airports: AirportHub[];
  neighborhoods: string[];
  cityName: string;
}

export interface Airline {
  name: string;
  code: string;
  tier: CarrierTier;
  pressRoomUrl?: string;
}

export interface Destination {
  code: string;
  city: string;
  country: string;
  type: DestinationType;
  appeal: string; // Editorial description
}

export interface RouteAnnouncement {
  id: string;
  airline: Airline;
  originAirport: AirportHub;
  destination: Destination;
  launchDate?: Date;
  frequency?: string; // "Daily", "3x weekly", etc.
  aircraft?: string;
  headline: string;
  description: string;
  source: string;
  sourceUrl: string;
  detectedAt: Date;
}

export interface RouteStory {
  announcement: RouteAnnouncement;
  headline: string;
  body: string;
  previewText: string;
  categoryLabel: string;
  targetNeighborhoods: string[];
}

// ============================================================================
// AIRPORT HUB CONFIGURATION
// ============================================================================

export const AIRPORT_HUBS: Record<string, HubMapping> = {
  'new-york': {
    airports: [
      { code: 'JFK', name: 'John F. Kennedy International', city: 'New York', country: 'USA' },
      { code: 'EWR', name: 'Newark Liberty International', city: 'Newark', country: 'USA' },
      { code: 'LGA', name: 'LaGuardia', city: 'New York', country: 'USA' },
    ],
    neighborhoods: [
      'nyc-tribeca',
      'nyc-upper-east-side',
      'nyc-upper-west-side',
      'nyc-west-village',
      'nyc-soho',
      'nyc-chelsea',
      'nyc-greenwich-village',
      'nyc-fidi',
      'nyc-hudson-yards',
      'nyc-meatpacking',
      'nyc-williamsburg',
    ],
    cityName: 'New York',
  },
  'london': {
    airports: [
      { code: 'LHR', name: 'Heathrow', city: 'London', country: 'UK' },
      { code: 'LGW', name: 'Gatwick', city: 'London', country: 'UK' },
      { code: 'LCY', name: 'London City', city: 'London', country: 'UK' },
    ],
    neighborhoods: [
      'london-mayfair',
      'london-chelsea',
      'london-notting-hill',
      'london-hampstead',
      'london-kensington',
      'london-marylebone',
    ],
    cityName: 'London',
  },
  'los-angeles': {
    airports: [
      { code: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'USA' },
    ],
    neighborhoods: [
      'la-beverly-hills',
      'la-bel-air',
      'la-malibu',
      'la-west-hollywood',
      'la-santa-monica',
      'la-brentwood',
    ],
    cityName: 'Los Angeles',
  },
  'sydney': {
    airports: [
      { code: 'SYD', name: 'Sydney Kingsford Smith', city: 'Sydney', country: 'Australia' },
    ],
    neighborhoods: [
      'sydney-double-bay',
      'sydney-paddington',
      'sydney-surry-hills',
      'sydney-potts-point',
    ],
    cityName: 'Sydney',
  },
  'paris': {
    airports: [
      { code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'France' },
      { code: 'ORY', name: 'Orly', city: 'Paris', country: 'France' },
    ],
    neighborhoods: [
      'paris-le-marais',
      'paris-saint-germain-des-pres',
      'paris-8th-arrondissement',
      'paris-6th-arrondissement',
    ],
    cityName: 'Paris',
  },
  'miami': {
    airports: [
      { code: 'MIA', name: 'Miami International', city: 'Miami', country: 'USA' },
    ],
    neighborhoods: [
      'miami-miami-beach',
      'miami-design-district',
      'miami-coral-gables',
      'miami-coconut-grove',
    ],
    cityName: 'Miami',
  },
  'san-francisco': {
    airports: [
      { code: 'SFO', name: 'San Francisco International', city: 'San Francisco', country: 'USA' },
    ],
    neighborhoods: [
      'sf-pacific-heights',
      'sf-nob-hill',
      'sf-marina',
    ],
    cityName: 'San Francisco',
  },
  'chicago': {
    airports: [
      { code: 'ORD', name: "O'Hare International", city: 'Chicago', country: 'USA' },
    ],
    neighborhoods: [
      'chicago-gold-coast',
      'chicago-lincoln-park',
      'chicago-river-north',
    ],
    cityName: 'Chicago',
  },
};

// ============================================================================
// AIRLINE CONFIGURATION
// ============================================================================

export const LEGACY_AIRLINES: Airline[] = [
  // US Legacy Carriers
  { name: 'Delta Air Lines', code: 'DL', tier: 'Legacy', pressRoomUrl: 'https://news.delta.com' },
  { name: 'United Airlines', code: 'UA', tier: 'Legacy', pressRoomUrl: 'https://hub.united.com/news' },
  { name: 'American Airlines', code: 'AA', tier: 'Legacy', pressRoomUrl: 'https://news.aa.com' },

  // European Legacy Carriers
  { name: 'British Airways', code: 'BA', tier: 'Legacy', pressRoomUrl: 'https://mediacentre.britishairways.com' },
  { name: 'Air France', code: 'AF', tier: 'Legacy', pressRoomUrl: 'https://corporate.airfrance.com/en/press' },
  { name: 'Lufthansa', code: 'LH', tier: 'Legacy', pressRoomUrl: 'https://newsroom.lufthansagroup.com' },
  { name: 'KLM', code: 'KL', tier: 'Legacy' },
  { name: 'Swiss', code: 'LX', tier: 'Legacy' },
  { name: 'Iberia', code: 'IB', tier: 'Legacy' },

  // Gulf Carriers
  { name: 'Emirates', code: 'EK', tier: 'Premium', pressRoomUrl: 'https://www.emirates.com/media-centre' },
  { name: 'Qatar Airways', code: 'QR', tier: 'Premium' },
  { name: 'Etihad Airways', code: 'EY', tier: 'Premium' },

  // Asian Carriers
  { name: 'Singapore Airlines', code: 'SQ', tier: 'Premium' },
  { name: 'Cathay Pacific', code: 'CX', tier: 'Premium' },
  { name: 'Japan Airlines', code: 'JL', tier: 'Legacy' },
  { name: 'All Nippon Airways', code: 'NH', tier: 'Legacy' },
  { name: 'Korean Air', code: 'KE', tier: 'Legacy' },

  // Oceania Carriers
  { name: 'Qantas', code: 'QF', tier: 'Legacy', pressRoomUrl: 'https://www.qantasnewsroom.com.au' },
  { name: 'Air New Zealand', code: 'NZ', tier: 'Legacy' },

  // Latin American
  { name: 'LATAM Airlines', code: 'LA', tier: 'Legacy' },

  // Premium Leisure Carriers
  { name: 'Virgin Atlantic', code: 'VS', tier: 'Premium' },
  { name: 'JetBlue', code: 'B6', tier: 'Premium' }, // Premium for Mint class
];

// ============================================================================
// LEISURE DESTINATION CONFIGURATION
// ============================================================================

export const LEISURE_DESTINATIONS: Destination[] = [
  // European Leisure Capitals
  { code: 'NCE', city: 'Nice', country: 'France', type: 'Leisure_Capital', appeal: 'French Riviera gateway' },
  { code: 'NAP', city: 'Naples', country: 'Italy', type: 'Leisure_Capital', appeal: 'Amalfi & Capri access' },
  { code: 'FCO', city: 'Rome', country: 'Italy', type: 'Cultural_Center', appeal: 'Eternal city culture' },
  { code: 'VCE', city: 'Venice', country: 'Italy', type: 'Leisure_Capital', appeal: 'Floating city romance' },
  { code: 'BCN', city: 'Barcelona', country: 'Spain', type: 'Leisure_Capital', appeal: 'Mediterranean lifestyle' },
  { code: 'PMI', city: 'Palma de Mallorca', country: 'Spain', type: 'Leisure_Capital', appeal: 'Balearic escape' },
  { code: 'IBZ', city: 'Ibiza', country: 'Spain', type: 'Leisure_Capital', appeal: 'Summer scene' },
  { code: 'LIS', city: 'Lisbon', country: 'Portugal', type: 'Leisure_Capital', appeal: 'Atlantic charm' },
  { code: 'GVA', city: 'Geneva', country: 'Switzerland', type: 'Financial_Hub', appeal: 'Alpine banking center' },
  { code: 'ZRH', city: 'Zurich', country: 'Switzerland', type: 'Financial_Hub', appeal: 'Swiss financial hub' },
  { code: 'EDI', city: 'Edinburgh', country: 'UK', type: 'Cultural_Center', appeal: 'Scottish heritage' },
  { code: 'DUB', city: 'Dublin', country: 'Ireland', type: 'Cultural_Center', appeal: 'Celtic culture' },
  { code: 'ATH', city: 'Athens', country: 'Greece', type: 'Cultural_Center', appeal: 'Ancient meets modern' },
  { code: 'JTR', city: 'Santorini', country: 'Greece', type: 'Leisure_Capital', appeal: 'Cycladic sunsets' },
  { code: 'MYK', city: 'Mykonos', country: 'Greece', type: 'Leisure_Capital', appeal: 'Glamorous beach scene' },
  { code: 'SKG', city: 'Thessaloniki', country: 'Greece', type: 'Cultural_Center', appeal: 'Northern Greece gateway' },

  // Caribbean & Central America
  { code: 'SBH', city: 'St. Barths', country: 'France', type: 'Leisure_Capital', appeal: 'Billionaire beach' },
  { code: 'SXM', city: 'St. Maarten', country: 'Netherlands', type: 'Leisure_Capital', appeal: 'Caribbean crossroads' },
  { code: 'MBJ', city: 'Montego Bay', country: 'Jamaica', type: 'Leisure_Capital', appeal: 'Caribbean luxury' },
  { code: 'NAS', city: 'Nassau', country: 'Bahamas', type: 'Leisure_Capital', appeal: 'Island paradise' },
  { code: 'CUN', city: 'Cancun', country: 'Mexico', type: 'Leisure_Capital', appeal: 'Riviera Maya access' },
  { code: 'SJO', city: 'San José', country: 'Costa Rica', type: 'Leisure_Capital', appeal: 'Eco-luxury gateway' },

  // Asian Destinations
  { code: 'NRT', city: 'Tokyo', country: 'Japan', type: 'Cultural_Center', appeal: 'Modern meets tradition' },
  { code: 'HND', city: 'Tokyo Haneda', country: 'Japan', type: 'Cultural_Center', appeal: 'City center access' },
  { code: 'KIX', city: 'Osaka', country: 'Japan', type: 'Cultural_Center', appeal: 'Kansai food capital' },
  { code: 'HKG', city: 'Hong Kong', country: 'China', type: 'Financial_Hub', appeal: 'East meets West' },
  { code: 'SIN', city: 'Singapore', country: 'Singapore', type: 'Financial_Hub', appeal: 'Garden city' },
  { code: 'BKK', city: 'Bangkok', country: 'Thailand', type: 'Cultural_Center', appeal: 'Southeast Asian hub' },
  { code: 'HKT', city: 'Phuket', country: 'Thailand', type: 'Leisure_Capital', appeal: 'Andaman beaches' },
  { code: 'DPS', city: 'Bali', country: 'Indonesia', type: 'Leisure_Capital', appeal: 'Spiritual retreat' },
  { code: 'MLE', city: 'Malé', country: 'Maldives', type: 'Leisure_Capital', appeal: 'Overwater paradise' },

  // African & Middle Eastern
  { code: 'CPT', city: 'Cape Town', country: 'South Africa', type: 'Leisure_Capital', appeal: 'Wine country views' },
  { code: 'JNB', city: 'Johannesburg', country: 'South Africa', type: 'Financial_Hub', appeal: 'African business hub' },
  { code: 'DXB', city: 'Dubai', country: 'UAE', type: 'Financial_Hub', appeal: 'Desert opulence' },
  { code: 'MRU', city: 'Mauritius', country: 'Mauritius', type: 'Leisure_Capital', appeal: 'Indian Ocean luxury' },
  { code: 'SEZ', city: 'Seychelles', country: 'Seychelles', type: 'Leisure_Capital', appeal: 'Pristine beaches' },
  { code: 'TLV', city: 'Tel Aviv', country: 'Israel', type: 'Cultural_Center', appeal: 'Mediterranean startup scene' },

  // Americas
  { code: 'ASE', city: 'Aspen', country: 'USA', type: 'Leisure_Capital', appeal: 'Rocky Mountain chic' },
  { code: 'EGE', city: 'Vail', country: 'USA', type: 'Leisure_Capital', appeal: 'Colorado ski scene' },
  { code: 'JAC', city: 'Jackson Hole', country: 'USA', type: 'Leisure_Capital', appeal: 'Teton wilderness' },
  { code: 'HNL', city: 'Honolulu', country: 'USA', type: 'Leisure_Capital', appeal: 'Pacific paradise' },
  { code: 'OGG', city: 'Maui', country: 'USA', type: 'Leisure_Capital', appeal: 'Hawaiian luxury' },
  { code: 'SJD', city: 'Los Cabos', country: 'Mexico', type: 'Leisure_Capital', appeal: 'Baja luxury' },

  // Oceania
  { code: 'AKL', city: 'Auckland', country: 'New Zealand', type: 'Cultural_Center', appeal: 'Gateway to NZ' },
  { code: 'ZQN', city: 'Queenstown', country: 'New Zealand', type: 'Leisure_Capital', appeal: 'Adventure capital' },
  { code: 'PPT', city: 'Tahiti', country: 'French Polynesia', type: 'Leisure_Capital', appeal: 'South Pacific luxury' },
  { code: 'NAN', city: 'Fiji', country: 'Fiji', type: 'Leisure_Capital', appeal: 'Island resort paradise' },
];

// ============================================================================
// NEWS SOURCES CONFIGURATION
// ============================================================================

interface NewsSource {
  name: string;
  baseUrl: string;
  feedUrl?: string;
  searchPath?: string;
}

const NEWS_SOURCES: NewsSource[] = [
  {
    name: 'The Points Guy',
    baseUrl: 'https://thepointsguy.com',
    feedUrl: 'https://thepointsguy.com/feed/',
  },
  {
    name: 'Routes Online',
    baseUrl: 'https://www.routesonline.com',
    feedUrl: 'https://www.routesonline.com/news/rss/',
  },
  {
    name: 'Simple Flying',
    baseUrl: 'https://simpleflying.com',
    feedUrl: 'https://simpleflying.com/feed/',
  },
  {
    name: 'One Mile at a Time',
    baseUrl: 'https://onemileatatime.com',
    feedUrl: 'https://onemileatatime.com/feed/',
  },
  {
    name: 'View from the Wing',
    baseUrl: 'https://viewfromthewing.com',
    feedUrl: 'https://viewfromthewing.com/feed/',
  },
];

const ROUTE_KEYWORDS = [
  'new route',
  'new service',
  'launches',
  'launching',
  'resumes',
  'resuming',
  'direct flight',
  'nonstop',
  'non-stop',
  'new destination',
  'inaugural',
  'beginning service',
  'starts service',
  'adds flights',
  'adding service',
];

// ============================================================================
// NEWS SCRAPING
// ============================================================================

/**
 * Scrape news source for route announcements
 */
async function scrapeNewsSource(source: NewsSource): Promise<RouteAnnouncement[]> {
  const announcements: RouteAnnouncement[] = [];

  try {
    const url = source.feedUrl || source.baseUrl;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FlaneurBot/1.0)',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${source.name}: ${response.status}`);
      return announcements;
    }

    const content = await response.text();

    // Check for route keywords
    const hasRouteNews = ROUTE_KEYWORDS.some((keyword) =>
      content.toLowerCase().includes(keyword.toLowerCase())
    );

    if (!hasRouteNews) return announcements;

    // Look for airline + destination combinations
    for (const airline of LEGACY_AIRLINES) {
      const airlinePattern = new RegExp(airline.name, 'i');
      if (!airlinePattern.test(content)) continue;

      for (const destination of LEISURE_DESTINATIONS) {
        // Check for destination city or code
        const destPattern = new RegExp(`\\b(${destination.city}|${destination.code})\\b`, 'i');
        if (!destPattern.test(content)) continue;

        // Check for hub airport mentions
        for (const [hubKey, hubMapping] of Object.entries(AIRPORT_HUBS)) {
          for (const airport of hubMapping.airports) {
            const airportPattern = new RegExp(`\\b(${airport.code}|${airport.name}|${airport.city})\\b`, 'i');
            if (!airportPattern.test(content)) continue;

            // Find context around matches
            const airlineMatch = content.match(airlinePattern);
            const destMatch = content.match(destPattern);
            const airportMatch = content.match(airportPattern);

            if (airlineMatch && destMatch && airportMatch) {
              // Check if all three are within reasonable proximity
              const airlineIndex = content.indexOf(airlineMatch[0]);
              const destIndex = content.indexOf(destMatch[0]);
              const airportIndex = content.indexOf(airportMatch[0]);

              const maxIndex = Math.max(airlineIndex, destIndex, airportIndex);
              const minIndex = Math.min(airlineIndex, destIndex, airportIndex);
              const distance = maxIndex - minIndex;

              // If within 1500 characters, likely same article
              if (distance < 1500) {
                // Verify it's a new route announcement
                const contextStart = Math.max(0, minIndex - 200);
                const contextEnd = Math.min(content.length, maxIndex + 500);
                const context = content.slice(contextStart, contextEnd);

                const isNewRoute = ROUTE_KEYWORDS.some((keyword) =>
                  context.toLowerCase().includes(keyword.toLowerCase())
                );

                if (isNewRoute) {
                  // Extract headline
                  const headlineMatch =
                    context.match(/<title>([^<]+)<\/title>/i) ||
                    context.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i);
                  const headline =
                    headlineMatch?.[1].trim() ||
                    `${airline.name} launches ${destination.city} service from ${airport.code}`;

                  // Extract potential launch date
                  const dateMatch = context.match(
                    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?/i
                  );

                  announcements.push({
                    id: `${source.name}-${airline.code}-${airport.code}-${destination.code}-${Date.now()}`,
                    airline,
                    originAirport: airport,
                    destination,
                    launchDate: dateMatch ? new Date(dateMatch[0]) : undefined,
                    headline,
                    description: context.replace(/<[^>]+>/g, '').trim().substring(0, 400),
                    source: source.name,
                    sourceUrl: source.baseUrl,
                    detectedAt: new Date(),
                  });
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error scraping ${source.name}:`, error);
  }

  return announcements;
}

/**
 * Scrape all news sources
 */
export async function scrapeAllSources(): Promise<RouteAnnouncement[]> {
  const allAnnouncements: RouteAnnouncement[] = [];

  for (const source of NEWS_SOURCES) {
    const announcements = await scrapeNewsSource(source);
    allAnnouncements.push(...announcements);
  }

  // Deduplicate by airline + origin + destination
  const seen = new Set<string>();
  return allAnnouncements.filter((a) => {
    const key = `${a.airline.code}-${a.originAirport.code}-${a.destination.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get neighborhoods served by an airport
 */
export function getNeighborhoodsForAirport(airportCode: string): string[] {
  for (const [, hubMapping] of Object.entries(AIRPORT_HUBS)) {
    if (hubMapping.airports.some((a) => a.code === airportCode)) {
      return hubMapping.neighborhoods;
    }
  }
  return [];
}

/**
 * Get city name for an airport
 */
export function getCityForAirport(airportCode: string): string {
  for (const [, hubMapping] of Object.entries(AIRPORT_HUBS)) {
    if (hubMapping.airports.some((a) => a.code === airportCode)) {
      return hubMapping.cityName;
    }
  }
  return 'Unknown';
}

/**
 * Check if a route qualifies as "premium leisure"
 */
export function isPremiumRoute(announcement: RouteAnnouncement): boolean {
  // Must be legacy or premium carrier
  if (announcement.airline.tier === 'Low_Cost') return false;

  // Must be a leisure or financial destination
  const validTypes: DestinationType[] = ['Leisure_Capital', 'Financial_Hub', 'Cultural_Center'];
  if (!validTypes.includes(announcement.destination.type)) return false;

  return true;
}

// ============================================================================
// GEMINI STORY GENERATION
// ============================================================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const ROUTE_SYSTEM_PROMPT = `You are the Travel Editor for Flâneur, a luxury neighborhood news platform.

Your tone is "Utility" - practical information for time-conscious travelers who value direct connections.

Rules:
1. Focus on the convenience of non-stop service
2. Mention the airline's premium offerings if relevant
3. Include launch date if known
4. Reference the destination's appeal briefly
5. Keep it practical, not promotional

Format: Return JSON with "headline" and "body" keys.`;

export async function generateRouteStory(
  announcement: RouteAnnouncement
): Promise<RouteStory | null> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const originCity = getCityForAirport(announcement.originAirport.code);
    const targetNeighborhoods = getNeighborhoodsForAirport(announcement.originAirport.code);

    const launchInfo = announcement.launchDate
      ? `Launch Date: ${announcement.launchDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
      : 'Launch Date: TBA';

    const prompt = `You are the Travel Editor for Flâneur in ${originCity}.

Route Details:
- Airline: ${announcement.airline.name} (${announcement.airline.tier} carrier)
- Origin: ${announcement.originAirport.name} (${announcement.originAirport.code})
- Destination: ${announcement.destination.city}, ${announcement.destination.country} (${announcement.destination.code})
- Destination Type: ${announcement.destination.type.replace(/_/g, ' ')}
- Destination Appeal: ${announcement.destination.appeal}
- ${launchInfo}
${announcement.frequency ? `- Frequency: ${announcement.frequency}` : ''}
${announcement.aircraft ? `- Aircraft: ${announcement.aircraft}` : ''}

Source headline: ${announcement.headline}
Description: ${announcement.description}

Context:
- A new direct flight removes the hassle of connections.
- Audience: Values time above all else.
- Tone: 'Utility'. 'Your summer plans just got easier.'

Task: Write a 35-word blurb.
Format headline as: 'Flight Check: Direct service to ${announcement.destination.city} launches [Date/Soon].'
Body: Focus on convenience and destination appeal.

Return JSON: { "headline": "...", "body": "...", "link_candidates": [{"text": "exact text from body"}] }

Include 1-2 link candidates for key entities mentioned in the body (airline, destination).`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: ROUTE_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 250,
      },
    });

    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error('No JSON found in Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || '';
    if (linkCandidates.length > 0 && body) {
      body = injectHyperlinks(body, linkCandidates, { name: originCity, city: originCity });
    }

    return {
      announcement,
      headline: parsed.headline,
      body,
      previewText: parsed.body.substring(0, 120) + '...',
      categoryLabel: `Flight Check • ${announcement.destination.type.replace(/_/g, ' ')}`,
      targetNeighborhoods,
    };
  } catch (error) {
    console.error('Error generating route story:', error);
    return null;
  }
}

// ============================================================================
// MAIN PROCESSING PIPELINE
// ============================================================================

export interface ProcessResult {
  sourcesScraped: number;
  announcementsFound: number;
  premiumRoutesCount: number;
  storiesGenerated: number;
  byAirline: Record<string, number>;
  byDestinationType: Record<string, number>;
  byHub: Record<string, number>;
  stories: RouteStory[];
  errors: string[];
}

/**
 * Process all sources and generate route stories
 */
export async function processRouteAlerts(): Promise<ProcessResult> {
  const result: ProcessResult = {
    sourcesScraped: NEWS_SOURCES.length,
    announcementsFound: 0,
    premiumRoutesCount: 0,
    storiesGenerated: 0,
    byAirline: {},
    byDestinationType: {},
    byHub: {},
    stories: [],
    errors: [],
  };

  try {
    console.log('Scraping news sources for route announcements...');
    const announcements = await scrapeAllSources();
    result.announcementsFound = announcements.length;

    // Filter for premium routes
    const premiumRoutes = announcements.filter(isPremiumRoute);
    result.premiumRoutesCount = premiumRoutes.length;

    for (const announcement of premiumRoutes) {
      try {
        // Track stats
        result.byAirline[announcement.airline.name] =
          (result.byAirline[announcement.airline.name] || 0) + 1;
        result.byDestinationType[announcement.destination.type] =
          (result.byDestinationType[announcement.destination.type] || 0) + 1;
        result.byHub[announcement.originAirport.code] =
          (result.byHub[announcement.originAirport.code] || 0) + 1;

        // Generate story
        const story = await generateRouteStory(announcement);
        if (story) {
          result.stories.push(story);
          result.storiesGenerated++;
        }
      } catch (error) {
        result.errors.push(
          `${announcement.airline.code}/${announcement.destination.code}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } catch (error) {
    result.errors.push(`Scraping failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

// ============================================================================
// SAMPLE DATA FOR TESTING
// ============================================================================

export function createSampleAnnouncements(): RouteAnnouncement[] {
  return [
    {
      id: 'sample-1',
      airline: LEGACY_AIRLINES.find((a) => a.code === 'DL')!,
      originAirport: AIRPORT_HUBS['new-york'].airports[0], // JFK
      destination: LEISURE_DESTINATIONS.find((d) => d.code === 'NCE')!, // Nice
      launchDate: new Date('2024-05-15'),
      frequency: 'Daily',
      aircraft: 'Airbus A330-900neo',
      headline: 'Delta Launches Daily Non-Stop Service Between JFK and Nice',
      description:
        'Delta Air Lines will launch daily non-stop service between New York-JFK and Nice, France beginning May 15, 2024. The route will be operated by an Airbus A330-900neo featuring Delta One suites.',
      source: 'The Points Guy',
      sourceUrl: 'https://thepointsguy.com',
      detectedAt: new Date(),
    },
    {
      id: 'sample-2',
      airline: LEGACY_AIRLINES.find((a) => a.code === 'BA')!,
      originAirport: AIRPORT_HUBS['london'].airports[0], // LHR
      destination: LEISURE_DESTINATIONS.find((d) => d.code === 'HKT')!, // Phuket
      launchDate: new Date('2024-10-27'),
      frequency: '3x weekly',
      headline: 'British Airways Resumes Direct London-Phuket Route',
      description:
        'British Airways is resuming direct flights from London Heathrow to Phuket, Thailand starting October 27. The route will operate three times weekly.',
      source: 'Routes Online',
      sourceUrl: 'https://routesonline.com',
      detectedAt: new Date(),
    },
    {
      id: 'sample-3',
      airline: LEGACY_AIRLINES.find((a) => a.code === 'QF')!,
      originAirport: AIRPORT_HUBS['sydney'].airports[0], // SYD
      destination: LEISURE_DESTINATIONS.find((d) => d.code === 'FCO')!, // Rome
      launchDate: new Date('2024-06-23'),
      frequency: '4x weekly',
      aircraft: 'Boeing 787-9 Dreamliner',
      headline: 'Qantas Announces Sydney-Rome Direct Service',
      description:
        'Qantas will launch the first direct flights between Sydney and Rome in June 2024, making it the longest route in its international network.',
      source: 'Simple Flying',
      sourceUrl: 'https://simpleflying.com',
      detectedAt: new Date(),
    },
    {
      id: 'sample-4',
      airline: LEGACY_AIRLINES.find((a) => a.code === 'EK')!,
      originAirport: AIRPORT_HUBS['los-angeles'].airports[0], // LAX
      destination: LEISURE_DESTINATIONS.find((d) => d.code === 'MLE')!, // Maldives
      headline: 'Emirates Adds Second Daily Los Angeles Flight with Maldives Connection',
      description:
        'Emirates is adding a second daily flight from Los Angeles to Dubai, offering improved connections to the Maldives via its Dubai hub.',
      source: 'One Mile at a Time',
      sourceUrl: 'https://onemileatatime.com',
      detectedAt: new Date(),
    },
  ];
}
