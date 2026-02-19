/**
 * Residency Radar Service
 *
 * Scrapes hospitality news to find "Seasonal Pop-ups" of major
 * luxury brands in vacation hotspots.
 *
 * Strategy: "Brand Migration"
 * - Luxury brands migrate with the seasons
 * - Winter: St. Moritz, Aspen, Courchevel
 * - Summer: Mykonos, St. Tropez, Hamptons
 * - Track when city brands open vacation outposts
 *
 * Data Sources:
 * - Eater Travel
 * - Robb Report
 * - WWD (Women's Wear Daily)
 * - Wallpaper*
 * - Departures
 *
 * Schedule: Weekly on Wednesdays at 8 AM UTC
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_MODELS } from '@/config/ai-models';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { grokEventSearch } from '@/lib/grok';
import { insiderPersona } from '@/lib/ai-persona';

// ============================================================================
// TYPES
// ============================================================================

export type Season = 'Winter' | 'Summer' | 'Spring' | 'Fall';

export type BrandCategory = 'Hospitality' | 'Fashion' | 'Jewelry' | 'Lifestyle';

export type ResidencyType = 'Restaurant' | 'Beach_Club' | 'Pop_Up_Shop' | 'Spa' | 'Hotel_Takeover';

export interface SeasonalHotspot {
  id: string;
  name: string;
  country: string;
  region: string;
  season: Season;
  peakMonths: number[]; // 1-12
  neighborhoodId?: string; // If we have a Flâneur feed for this location
  feederCities: string[]; // Cities whose residents vacation here
  vibe: string;
}

export interface LuxuryBrand {
  name: string;
  pattern: RegExp;
  category: BrandCategory;
  homeCity: string;
  tier: 'Iconic' | 'Aspirational' | 'Emerging';
}

export interface ResidencyAnnouncement {
  id: string;
  brand: LuxuryBrand;
  location: SeasonalHotspot;
  residencyType: ResidencyType;
  headline: string;
  description: string;
  openingDate?: Date;
  closingDate?: Date;
  source: string;
  sourceUrl: string;
  detectedAt: Date;
}

export interface ResidencyStory {
  announcement: ResidencyAnnouncement;
  headline: string;
  body: string;
  previewText: string;
  categoryLabel: string;
  targetNeighborhoods: string[];
  season: Season;
}

// ============================================================================
// SEASONAL HOTSPOTS CONFIGURATION
// ============================================================================

export const SEASONAL_HOTSPOTS: SeasonalHotspot[] = [
  // Winter Destinations
  {
    id: 'st-moritz',
    name: 'St. Moritz',
    country: 'Switzerland',
    region: 'Alps',
    season: 'Winter',
    peakMonths: [12, 1, 2, 3],
    neighborhoodId: 'switzerland-st-moritz',
    feederCities: ['New York', 'London', 'Milan', 'Paris', 'Geneva'],
    vibe: 'Old money ski glamour, après-ski at Badrutt\'s Palace',
  },
  {
    id: 'aspen',
    name: 'Aspen',
    country: 'USA',
    region: 'Colorado',
    season: 'Winter',
    peakMonths: [12, 1, 2, 3],
    neighborhoodId: 'aspen',
    feederCities: ['New York', 'Los Angeles', 'San Francisco', 'Chicago', 'Miami'],
    vibe: 'Celebrity ski scene, Ajax Mountain, Casa Tua crowd',
  },
  {
    id: 'courchevel',
    name: 'Courchevel 1850',
    country: 'France',
    region: 'French Alps',
    season: 'Winter',
    peakMonths: [12, 1, 2, 3],
    neighborhoodId: 'france-courchevel',
    feederCities: ['Paris', 'London', 'Geneva', 'Moscow'],
    vibe: 'Russian oligarchs, Cheval Blanc, helicopter arrivals',
  },
  {
    id: 'gstaad',
    name: 'Gstaad',
    country: 'Switzerland',
    region: 'Bernese Alps',
    season: 'Winter',
    peakMonths: [12, 1, 2, 3],
    feederCities: ['Geneva', 'Zurich', 'London', 'Paris'],
    vibe: 'Discreet old money, The Palace, chalet culture',
  },
  {
    id: 'verbier',
    name: 'Verbier',
    country: 'Switzerland',
    region: 'Valais',
    season: 'Winter',
    peakMonths: [12, 1, 2, 3],
    feederCities: ['London', 'Geneva', 'Paris'],
    vibe: 'Younger crowd, extreme skiing, Le Chalet d\'Adrien',
  },

  // Summer Destinations
  {
    id: 'mykonos',
    name: 'Mykonos',
    country: 'Greece',
    region: 'Cyclades',
    season: 'Summer',
    peakMonths: [6, 7, 8, 9],
    neighborhoodId: 'greece-mykonos',
    feederCities: ['London', 'Paris', 'Milan', 'Athens', 'Dubai'],
    vibe: 'Beach clubs, Nammos, Scorpios, sunset parties',
  },
  {
    id: 'st-tropez',
    name: 'Saint-Tropez',
    country: 'France',
    region: 'Côte d\'Azur',
    season: 'Summer',
    peakMonths: [6, 7, 8],
    neighborhoodId: 'saint-tropez',
    feederCities: ['Paris', 'London', 'Monaco', 'Milan'],
    vibe: 'Brigitte Bardot legacy, Club 55, rosé all day',
  },
  {
    id: 'hamptons',
    name: 'The Hamptons',
    country: 'USA',
    region: 'Long Island',
    season: 'Summer',
    peakMonths: [5, 6, 7, 8, 9],
    neighborhoodId: 'the-hamptons',
    feederCities: ['New York'],
    vibe: 'NYC escape, farm stands, beach house scene',
  },
  {
    id: 'capri',
    name: 'Capri',
    country: 'Italy',
    region: 'Campania',
    season: 'Summer',
    peakMonths: [5, 6, 7, 8, 9],
    neighborhoodId: 'italy-capri',
    feederCities: ['Rome', 'Milan', 'Naples', 'London'],
    vibe: 'La Fontelina, limoncello, yacht hopping',
  },
  {
    id: 'ibiza',
    name: 'Ibiza',
    country: 'Spain',
    region: 'Balearic Islands',
    season: 'Summer',
    peakMonths: [5, 6, 7, 8, 9],
    neighborhoodId: 'spain-ibiza',
    feederCities: ['London', 'Madrid', 'Barcelona', 'Paris'],
    vibe: 'Superclub culture meets boutique hotels',
  },
  {
    id: 'st-barts',
    name: 'St. Barths',
    country: 'France',
    region: 'Caribbean',
    season: 'Winter',
    peakMonths: [12, 1, 2, 3, 4],
    neighborhoodId: 'st-barts',
    feederCities: ['New York', 'Miami', 'Paris', 'Los Angeles'],
    vibe: 'Billionaire beach, Eden Rock, New Year\'s scene',
  },
  {
    id: 'marbella',
    name: 'Marbella',
    country: 'Spain',
    region: 'Costa del Sol',
    season: 'Summer',
    peakMonths: [5, 6, 7, 8, 9],
    neighborhoodId: 'marbella',
    feederCities: ['London', 'Madrid', 'Dubai'],
    vibe: 'Puerto Banús, beach clubs, golf lifestyle',
  },
  {
    id: 'amalfi',
    name: 'Amalfi Coast',
    country: 'Italy',
    region: 'Campania',
    season: 'Summer',
    peakMonths: [5, 6, 7, 8, 9],
    neighborhoodId: 'italy-amalfi',
    feederCities: ['Rome', 'Milan', 'London', 'New York'],
    vibe: 'Positano cliffs, Le Sirenuse, lemons everything',
  },
  {
    id: 'sardinia',
    name: 'Porto Cervo',
    country: 'Italy',
    region: 'Sardinia',
    season: 'Summer',
    peakMonths: [6, 7, 8],
    neighborhoodId: 'italy-sardinia',
    feederCities: ['Milan', 'Rome', 'Monaco'],
    vibe: 'Superyacht central, Billionaire club, Costa Smeralda',
  },
];

// ============================================================================
// LUXURY BRAND WHITELIST
// ============================================================================

export const MIGRATING_BRANDS: LuxuryBrand[] = [
  // Hospitality - Iconic
  { name: 'Nobu', pattern: /\bnobu\b/i, category: 'Hospitality', homeCity: 'New York/Los Angeles', tier: 'Iconic' },
  { name: 'Cipriani', pattern: /\bcipriani\b/i, category: 'Hospitality', homeCity: 'Venice/New York', tier: 'Iconic' },
  { name: 'Carbone', pattern: /\bcarbone\b/i, category: 'Hospitality', homeCity: 'New York', tier: 'Iconic' },
  { name: 'Casa Tua', pattern: /casa\s*tua/i, category: 'Hospitality', homeCity: 'Miami', tier: 'Iconic' },
  { name: 'Zuma', pattern: /\bzuma\b/i, category: 'Hospitality', homeCity: 'London', tier: 'Iconic' },
  { name: 'Nikki Beach', pattern: /nikki\s*beach/i, category: 'Hospitality', homeCity: 'Miami', tier: 'Iconic' },
  { name: 'Bagatelle', pattern: /\bbagatelle\b/i, category: 'Hospitality', homeCity: 'New York/St. Tropez', tier: 'Iconic' },
  { name: 'Sexy Fish', pattern: /sexy\s*fish/i, category: 'Hospitality', homeCity: 'London', tier: 'Iconic' },
  { name: 'Cecconi\'s', pattern: /cecconi/i, category: 'Hospitality', homeCity: 'London', tier: 'Aspirational' },
  { name: 'Costes', pattern: /\bcostes\b/i, category: 'Hospitality', homeCity: 'Paris', tier: 'Aspirational' },
  { name: 'Nammos', pattern: /\bnammos\b/i, category: 'Hospitality', homeCity: 'Mykonos', tier: 'Iconic' },
  { name: 'Scorpios', pattern: /\bscorpios\b/i, category: 'Hospitality', homeCity: 'Mykonos', tier: 'Aspirational' },
  { name: 'Club 55', pattern: /club\s*55/i, category: 'Hospitality', homeCity: 'St. Tropez', tier: 'Iconic' },

  // Fashion Beach Clubs & Pop-ups
  { name: 'Dior', pattern: /\bdior\b/i, category: 'Fashion', homeCity: 'Paris', tier: 'Iconic' },
  { name: 'Louis Vuitton', pattern: /louis\s*vuitton|\blv\b/i, category: 'Fashion', homeCity: 'Paris', tier: 'Iconic' },
  { name: 'Chanel', pattern: /\bchanel\b/i, category: 'Fashion', homeCity: 'Paris', tier: 'Iconic' },
  { name: 'Gucci', pattern: /\bgucci\b/i, category: 'Fashion', homeCity: 'Florence/Milan', tier: 'Iconic' },
  { name: 'Jacquemus', pattern: /\bjacquemus\b/i, category: 'Fashion', homeCity: 'Paris', tier: 'Emerging' },
  { name: 'Loro Piana', pattern: /loro\s*piana/i, category: 'Fashion', homeCity: 'Milan', tier: 'Iconic' },
  { name: 'Brunello Cucinelli', pattern: /brunello\s*cucinelli/i, category: 'Fashion', homeCity: 'Solomeo', tier: 'Iconic' },
  { name: 'The Row', pattern: /the\s*row/i, category: 'Fashion', homeCity: 'New York', tier: 'Iconic' },
  { name: 'Bottega Veneta', pattern: /bottega\s*veneta/i, category: 'Fashion', homeCity: 'Milan', tier: 'Iconic' },
  { name: 'Prada', pattern: /\bprada\b/i, category: 'Fashion', homeCity: 'Milan', tier: 'Iconic' },
  { name: 'Fendi', pattern: /\bfendi\b/i, category: 'Fashion', homeCity: 'Rome', tier: 'Iconic' },

  // Jewelry & Watches
  { name: 'Cartier', pattern: /\bcartier\b/i, category: 'Jewelry', homeCity: 'Paris', tier: 'Iconic' },
  { name: 'Bulgari', pattern: /\bbulgari\b|\bbvlgari\b/i, category: 'Jewelry', homeCity: 'Rome', tier: 'Iconic' },
  { name: 'Van Cleef & Arpels', pattern: /van\s*cleef/i, category: 'Jewelry', homeCity: 'Paris', tier: 'Iconic' },
  { name: 'Rolex', pattern: /\brolex\b/i, category: 'Jewelry', homeCity: 'Geneva', tier: 'Iconic' },

  // Lifestyle
  { name: 'Aman', pattern: /\baman\b/i, category: 'Lifestyle', homeCity: 'Global', tier: 'Iconic' },
  { name: 'Six Senses', pattern: /six\s*senses/i, category: 'Lifestyle', homeCity: 'Global', tier: 'Aspirational' },
  { name: 'Soho House', pattern: /soho\s*house/i, category: 'Lifestyle', homeCity: 'London', tier: 'Aspirational' },
];

// ============================================================================
// NEWS SOURCES & SEARCH PATTERNS
// ============================================================================

interface NewsSource {
  name: string;
  baseUrl: string;
  feedUrl?: string;
  searchUrl?: string;
}

const NEWS_SOURCES: NewsSource[] = [
  {
    name: 'Eater',
    baseUrl: 'https://www.eater.com',
    feedUrl: 'https://www.eater.com/rss/index.xml',
  },
  {
    name: 'Robb Report',
    baseUrl: 'https://robbreport.com',
    feedUrl: 'https://robbreport.com/feed/',
  },
  {
    name: 'WWD',
    baseUrl: 'https://wwd.com',
    feedUrl: 'https://wwd.com/feed/',
  },
  {
    name: 'Wallpaper',
    baseUrl: 'https://www.wallpaper.com',
    feedUrl: 'https://www.wallpaper.com/rss',
  },
  {
    name: 'Departures',
    baseUrl: 'https://www.departures.com',
    feedUrl: 'https://www.departures.com/feed',
  },
  {
    name: 'Bloomberg Pursuits',
    baseUrl: 'https://www.bloomberg.com/pursuits',
  },
];

const SEARCH_KEYWORDS = [
  'summer residency',
  'winter residency',
  'seasonal pop-up',
  'pop-up opens',
  'beach club takeover',
  'seasonal location',
  'summer outpost',
  'winter outpost',
  'resort pop-up',
  'holiday pop-up',
  'temporary restaurant',
  'seasonal restaurant',
  'opens for the season',
  'summer debut',
  'winter debut',
];

// ============================================================================
// NEWS SCRAPING
// ============================================================================

/**
 * Search for residency announcements using Grok web search
 */
export async function scrapeAllSources(): Promise<ResidencyAnnouncement[]> {
  const allAnnouncements: ResidencyAnnouncement[] = [];
  const currentSeason = getCurrentSeason();

  // Search for brand residencies in seasonal hotspots
  const relevantHotspots = SEASONAL_HOTSPOTS.filter(h =>
    h.peakMonths.includes(new Date().getMonth() + 1)
  );

  // Group hotspots by region to reduce API calls
  const hotspotNames = relevantHotspots.map(h => h.name).join(', ');
  const brandNames = MIGRATING_BRANDS.slice(0, 15).map(b => b.name).join(', ');

  const systemPrompt = `You are a luxury hospitality researcher. Search the web and X for recent announcements of luxury brands opening seasonal pop-ups, restaurants, beach clubs, or hotel residencies at vacation destinations.

Return ONLY a JSON array (no markdown, no explanation). Each object must have:
- brandName: string (luxury brand name)
- locationName: string (destination name)
- residencyType: "Restaurant" | "Beach_Club" | "Pop_Up_Shop" | "Spa" | "Hotel_Takeover"
- headline: string
- description: string (1-2 sentences)
- openingDate: string or null (ISO date)
- closingDate: string or null (ISO date)
- sourceUrl: string or null

If no announcements are found, return an empty array: []`;

  const userPrompt = `Search for luxury brand hospitality announcements in the last 30 days: new hotel restaurants, branded residences, pop-up cafes by fashion houses, seasonal beach clubs, or branded experiences at vacation destinations. Focus on brands like ${brandNames} opening in destinations like ${hotspotNames}. Examples: Dior cafe opening in St. Tropez, Louis Vuitton restaurant in St. Moritz, Gucci beach club in Mykonos.`;

  console.log(`Searching Grok for residency announcements (${currentSeason} season)...`);
  const raw = await grokEventSearch(systemPrompt, userPrompt);
  if (!raw) return [];

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      brandName: string;
      locationName?: string;
      residencyType?: string;
      headline?: string;
      description?: string;
      openingDate?: string | null;
      closingDate?: string | null;
      sourceUrl?: string | null;
    }>;

    for (const p of parsed) {
      if (!p.brandName || !p.locationName) continue;

      // Match brand to our config
      const brand = MIGRATING_BRANDS.find(b =>
        b.pattern.test(p.brandName)
      );
      if (!brand) continue;

      // Match location to our hotspots
      const location = SEASONAL_HOTSPOTS.find(h =>
        h.name.toLowerCase() === (p.locationName || '').toLowerCase() ||
        (p.locationName || '').toLowerCase().includes(h.name.toLowerCase())
      );
      if (!location) continue;

      const validTypes: ResidencyType[] = ['Restaurant', 'Beach_Club', 'Pop_Up_Shop', 'Spa', 'Hotel_Takeover'];
      const residencyType = validTypes.includes(p.residencyType as ResidencyType)
        ? p.residencyType as ResidencyType : 'Pop_Up_Shop';

      allAnnouncements.push({
        id: `grok-${brand.name.replace(/\W/g, '-').toLowerCase()}-${location.id}-${Date.now()}`,
        brand,
        location,
        residencyType,
        headline: p.headline || `${brand.name} opens in ${location.name}`,
        description: p.description || '',
        openingDate: p.openingDate ? new Date(p.openingDate) : undefined,
        closingDate: p.closingDate ? new Date(p.closingDate) : undefined,
        source: 'Grok Search',
        sourceUrl: p.sourceUrl || '',
        detectedAt: new Date(),
      });
    }
  } catch (error) {
    console.error('Error parsing Grok response for residency announcements:', error);
  }

  // Deduplicate by brand + location
  const seen = new Set<string>();
  return allAnnouncements.filter((a) => {
    const key = `${a.brand.name}-${a.location.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current season based on date
 */
export function getCurrentSeason(date: Date = new Date()): Season {
  const month = date.getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return 'Spring';
  if (month >= 6 && month <= 8) return 'Summer';
  if (month >= 9 && month <= 11) return 'Fall';
  return 'Winter';
}

/**
 * Get hotspots that are currently in season
 */
export function getInSeasonHotspots(date: Date = new Date()): SeasonalHotspot[] {
  const month = date.getMonth() + 1;
  return SEASONAL_HOTSPOTS.filter((h) => h.peakMonths.includes(month));
}

/**
 * Map feeder city to Flâneur neighborhoods
 */
function mapFeederCityToNeighborhoods(city: string): string[] {
  const cityMappings: Record<string, string[]> = {
    'New York': ['nyc-upper-east-side', 'nyc-tribeca', 'nyc-soho', 'nyc-west-village'],
    'Los Angeles': ['la-beverly-hills', 'la-bel-air', 'la-malibu', 'la-west-hollywood'],
    'London': ['london-mayfair', 'london-chelsea', 'london-notting-hill', 'london-hampstead'],
    'Paris': ['paris-le-marais', 'paris-saint-germain-des-pres', 'paris-8th-arrondissement'],
    'Milan': ['milan-brera', 'milan-quadrilatero'],
    'Miami': ['miami-miami-beach', 'miami-design-district'],
    'San Francisco': ['sf-pacific-heights', 'sf-nob-hill'],
    'Chicago': ['chicago-gold-coast', 'chicago-lincoln-park'],
    'Geneva': ['geneva-old-town'],
    'Monaco': ['monaco-monte-carlo'],
    'Dubai': ['dubai-downtown'],
  };

  return cityMappings[city] || [];
}

/**
 * Get all target neighborhoods for an announcement
 */
export function getTargetNeighborhoods(announcement: ResidencyAnnouncement): string[] {
  const neighborhoods = new Set<string>();

  // Add the vacation destination if we have a feed for it
  if (announcement.location.neighborhoodId) {
    neighborhoods.add(announcement.location.neighborhoodId);
  }

  // Add feeder city neighborhoods
  for (const city of announcement.location.feederCities) {
    const cityNeighborhoods = mapFeederCityToNeighborhoods(city);
    cityNeighborhoods.forEach((n) => neighborhoods.add(n));
  }

  return Array.from(neighborhoods);
}

// ============================================================================
// GEMINI STORY GENERATION
// ============================================================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');


export async function generateResidencyStory(
  announcement: ResidencyAnnouncement
): Promise<ResidencyStory | null> {
  try {
    const model = genAI.getGenerativeModel({ model: AI_MODELS.GEMINI_FLASH });

    const season = announcement.location.season;
    const targetNeighborhoods = getTargetNeighborhoods(announcement);

    const prompt = `${insiderPersona(announcement.location.name, 'Lifestyle Editor')}

Brand: ${announcement.brand.name}
- Category: ${announcement.brand.category}
- Home City: ${announcement.brand.homeCity}
- Tier: ${announcement.brand.tier}

Vacation Location: ${announcement.location.name}, ${announcement.location.country}
- Region: ${announcement.location.region}
- Season: ${season}
- Vibe: ${announcement.location.vibe}

Residency Type: ${announcement.residencyType.replace(/_/g, ' ')}
Headline from source: ${announcement.headline}
Description: ${announcement.description}

Context:
- A famous city brand is opening a vacation outpost
- Audience: Wants familiar luxury in exotic places
- This is relevant to residents of: ${announcement.location.feederCities.join(', ')}
- Tone: 'Scene Watch'

Task: Write a 35-word blurb.
Format headline as: 'Scene Watch: ${announcement.brand.name} lands in ${announcement.location.name} for the ${season}'

Return JSON: { "headline": "...", "body": "...", "link_candidates": [{"text": "exact text from body"}] }

Include 1-2 link candidates for key entities mentioned in the body (brand, destination).`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
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
      body = injectHyperlinks(body, linkCandidates, { name: announcement.location.name, city: announcement.location.name });
    }

    return {
      announcement,
      headline: parsed.headline,
      body,
      previewText: parsed.body.substring(0, 120) + '...',
      categoryLabel: `Scene Watch • ${season}`,
      targetNeighborhoods,
      season,
    };
  } catch (error) {
    console.error('Error generating residency story:', error);
    return null;
  }
}

// ============================================================================
// MAIN PROCESSING PIPELINE
// ============================================================================

export interface ProcessResult {
  sourcesScraped: number;
  announcementsFound: number;
  storiesGenerated: number;
  byCategory: Record<string, number>;
  bySeason: Record<string, number>;
  byLocation: Record<string, number>;
  stories: ResidencyStory[];
  errors: string[];
}

/**
 * Process all sources and generate residency stories
 */
export async function processResidencyRadar(): Promise<ProcessResult> {
  const result: ProcessResult = {
    sourcesScraped: NEWS_SOURCES.length,
    announcementsFound: 0,
    storiesGenerated: 0,
    byCategory: {},
    bySeason: {},
    byLocation: {},
    stories: [],
    errors: [],
  };

  try {
    console.log('Scraping news sources for residency announcements...');
    const announcements = await scrapeAllSources();
    result.announcementsFound = announcements.length;

    for (const announcement of announcements) {
      try {
        // Track stats
        result.byCategory[announcement.brand.category] =
          (result.byCategory[announcement.brand.category] || 0) + 1;
        result.bySeason[announcement.location.season] =
          (result.bySeason[announcement.location.season] || 0) + 1;
        result.byLocation[announcement.location.name] =
          (result.byLocation[announcement.location.name] || 0) + 1;

        // Generate story
        const story = await generateResidencyStory(announcement);
        if (story) {
          result.stories.push(story);
          result.storiesGenerated++;
        }
      } catch (error) {
        result.errors.push(
          `${announcement.brand.name}/${announcement.location.name}: ${error instanceof Error ? error.message : String(error)}`
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

export function createSampleAnnouncements(): ResidencyAnnouncement[] {
  return [
    {
      id: 'sample-1',
      brand: MIGRATING_BRANDS.find((b) => b.name === 'Carbone')!,
      location: SEASONAL_HOTSPOTS.find((h) => h.id === 'hamptons')!,
      residencyType: 'Restaurant',
      headline: 'Carbone Opens Summer Outpost in the Hamptons',
      description: 'The beloved Greenwich Village Italian spot brings its red sauce magic to Montauk for summer 2024.',
      openingDate: new Date('2024-05-15'),
      closingDate: new Date('2024-09-15'),
      source: 'Eater',
      sourceUrl: 'https://eater.com',
      detectedAt: new Date(),
    },
    {
      id: 'sample-2',
      brand: MIGRATING_BRANDS.find((b) => b.name === 'Dior')!,
      location: SEASONAL_HOTSPOTS.find((h) => h.id === 'mykonos')!,
      residencyType: 'Beach_Club',
      headline: 'Dior Takes Over Nammos Beach Club in Mykonos',
      description: 'The French fashion house transforms the iconic Psarou Beach club with a summer-long pop-up featuring exclusive pieces.',
      openingDate: new Date('2024-06-01'),
      closingDate: new Date('2024-09-01'),
      source: 'WWD',
      sourceUrl: 'https://wwd.com',
      detectedAt: new Date(),
    },
    {
      id: 'sample-3',
      brand: MIGRATING_BRANDS.find((b) => b.name === 'Nobu')!,
      location: SEASONAL_HOTSPOTS.find((h) => h.id === 'st-moritz')!,
      residencyType: 'Restaurant',
      headline: 'Nobu Returns to St. Moritz for Winter Season',
      description: 'The global sushi empire reopens its alpine outpost at Badrutt\'s Palace for the ski season.',
      openingDate: new Date('2024-12-15'),
      closingDate: new Date('2025-03-31'),
      source: 'Robb Report',
      sourceUrl: 'https://robbreport.com',
      detectedAt: new Date(),
    },
    {
      id: 'sample-4',
      brand: MIGRATING_BRANDS.find((b) => b.name === 'Jacquemus')!,
      location: SEASONAL_HOTSPOTS.find((h) => h.id === 'capri')!,
      residencyType: 'Pop_Up_Shop',
      headline: 'Jacquemus Opens Capri Pop-Up',
      description: 'Simon Porte Jacquemus brings his sun-drenched aesthetic to the Italian island with an exclusive summer boutique.',
      openingDate: new Date('2024-06-15'),
      closingDate: new Date('2024-08-31'),
      source: 'Wallpaper',
      sourceUrl: 'https://wallpaper.com',
      detectedAt: new Date(),
    },
  ];
}
