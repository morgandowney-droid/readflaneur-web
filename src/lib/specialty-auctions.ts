/**
 * Specialty Auction Service
 *
 * Dual-engine service completing global art coverage:
 *
 * 1. TIER 2 - National Champions (Direct Scraping)
 *    Regional auction houses: Bukowskis, Bruun Rasmussen, Dorotheum,
 *    Grisebach, Finarte, SBI Art, Smith & Singer, Heffel, etc.
 *
 * 2. TIER 3 - Vacation Mappings (Hub Filtering)
 *    Maps Tier 1 global auction events to vacation feeds:
 *    St. Barts, Aspen, The Hamptons, Sylt, Marbella, etc.
 *
 * Features:
 * - Polymorphic scraping with fallback logic
 * - Dual-mode story generation (Patriotic vs Curatorial)
 * - Currency-aware localization
 * - Hub-to-vacation feed syndication
 */

import { GoogleGenAI } from '@google/genai';
import {
  GlobalAuctionEvent,
  ART_HUBS,
  fetchAllGlobalAuctionCalendars,
} from './global-auctions';
import { AuctionTier, isBlueChip, determineAuctionTier } from './nyc-auctions';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';

// Gemini model for story generation
const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Currency codes for regional markets
 */
export type RegionalCurrency =
  | 'SEK'
  | 'DKK'
  | 'EUR'
  | 'JPY'
  | 'AUD'
  | 'CAD'
  | 'USD'
  | 'GBP'
  | 'CHF'
  | 'HKD';

/**
 * Currency symbols
 */
const CURRENCY_SYMBOLS: Record<RegionalCurrency, string> = {
  SEK: 'kr',
  DKK: 'kr',
  EUR: '€',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  USD: '$',
  GBP: '£',
  CHF: 'CHF ',
  HKD: 'HK$',
};

/**
 * Regional auction house target configuration
 */
export interface RegionalTarget {
  city: string;
  country: string;
  house: string;
  url: string;
  apiUrl?: string;
  selector: string;
  dateSelector?: string;
  titleSelector?: string;
  currency: RegionalCurrency;
  vibe: string;
  neighborhoods: string[];
  region: 'nordic' | 'dach' | 'southern-europe' | 'apac' | 'north-america' | 'uk-ireland' | 'oceania';
}

/**
 * Vacation market mapping configuration
 */
export interface VacationMapping {
  id: string;
  name: string;
  neighborhoodId: string;
  sourceHubs: string[];
  keywords: string[];
  tone: string;
  region: 'us-vacation' | 'caribbean-vacation' | 'europe-vacation';
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TIER 2: NATIONAL CHAMPIONS CONFIGURATION
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const REGIONAL_TARGETS: RegionalTarget[] = [
  // ─────────────────────────────────────────────────────────────
  // NORDICS & DACH
  // ─────────────────────────────────────────────────────────────
  {
    city: 'Stockholm',
    country: 'Sweden',
    house: 'Bukowskis',
    url: 'https://www.bukowskis.com/en/auctions',
    selector: '.auction-list-item',
    dateSelector: '.auction-date',
    titleSelector: '.auction-title',
    currency: 'SEK',
    vibe: 'Scandi-Luxury, Modern Design, Svenskt Tenn. The Scandinavian auction establishment since 1870.',
    neighborhoods: ['stockholm-ostermalm', 'stockholm-djursholm'],
    region: 'nordic',
  },
  {
    city: 'Copenhagen',
    country: 'Denmark',
    house: 'Bruun Rasmussen',
    url: 'https://bruun-rasmussen.dk/m/auctions',
    selector: '.auction-card',
    dateSelector: '.date',
    titleSelector: '.title',
    currency: 'DKK',
    vibe: 'Danish Modern, Silver, Mid-Century Classics. The authority on Scandinavian design.',
    neighborhoods: ['copenhagen-norrebro', 'copenhagen-nyhavn', 'copenhagen-vesterbro'],
    region: 'nordic',
  },
  {
    city: 'Vienna',
    country: 'Austria',
    house: 'Dorotheum',
    url: 'https://www.dorotheum.com/en/auctions/current-auctions/',
    selector: '.auction-row',
    dateSelector: '.auction-date',
    titleSelector: '.auction-name',
    currency: 'EUR',
    vibe: 'Imperial History, Silver, Old Masters. One of the oldest auction houses in the world (1707).',
    neighborhoods: ['vienna-innere-stadt'],
    region: 'dach',
  },
  {
    city: 'Berlin',
    country: 'Germany',
    house: 'Grisebach',
    url: 'https://www.grisebach.com/en/',
    selector: '.auction-list',
    dateSelector: '.date',
    titleSelector: '.title',
    currency: 'EUR',
    vibe: 'German Expressionism, Intellectual Collecting. The leading German auction house.',
    neighborhoods: ['berlin-charlottenburg', 'berlin-grunewald'],
    region: 'dach',
  },
  {
    city: 'Munich',
    country: 'Germany',
    house: 'Ketterer Kunst',
    url: 'https://www.kettererkunst.com/auctions/',
    selector: '.auction-item',
    currency: 'EUR',
    vibe: 'Modern Art, German Expressionism, Post-War. Bavarian elegance meets art market.',
    neighborhoods: ['munich-schwabing', 'munich-bogenhausen'],
    region: 'dach',
  },
  {
    city: 'Zurich',
    country: 'Switzerland',
    house: 'Koller',
    url: 'https://www.kollerauctions.com/en/auctions/',
    selector: '.auction-tile',
    currency: 'CHF',
    vibe: 'Swiss Precision, Old Masters, Decorative Arts. The premier Swiss auction house.',
    neighborhoods: ['zurich-bahnhofstrasse', 'zurich-seefeld'],
    region: 'dach',
  },

  // ─────────────────────────────────────────────────────────────
  // SOUTHERN EUROPE
  // ─────────────────────────────────────────────────────────────
  {
    city: 'Milan',
    country: 'Italy',
    house: 'Finarte',
    url: 'https://www.finarte.it/en/auctions/',
    selector: '.auction-item',
    currency: 'EUR',
    vibe: 'Italian Industrial Design, Post-War Modern. The Milanese design world at auction.',
    neighborhoods: ['milan-brera', 'milan-navigli', 'milan-porta-nuova'],
    region: 'southern-europe',
  },
  {
    city: 'Rome',
    country: 'Italy',
    house: 'Cambi',
    url: 'https://www.cambiaste.com/en/auctions/',
    selector: '.auction-card',
    currency: 'EUR',
    vibe: 'Renaissance, Baroque, Italian Masters. Centuries of Italian heritage.',
    neighborhoods: ['rome-parioli', 'rome-centro'],
    region: 'southern-europe',
  },
  {
    city: 'Barcelona',
    country: 'Spain',
    house: 'Balclis',
    url: 'https://www.balclis.com/en/auctions/',
    selector: '.auction-grid',
    currency: 'EUR',
    vibe: 'Catalan Modernism, Spanish Antiques. The Mediterranean art market.',
    neighborhoods: ['barcelona-eixample', 'barcelona-el-born', 'barcelona-gracia'],
    region: 'southern-europe',
  },
  {
    city: 'Madrid',
    country: 'Spain',
    house: 'Fernando Durán',
    url: 'https://www.fernandoduran.com/en/auctions/',
    selector: '.sale-list',
    currency: 'EUR',
    vibe: 'Spanish Masters, Colonial Art, Decorative Arts. Madrid elegance.',
    neighborhoods: ['madrid-salamanca', 'madrid-chamberi'],
    region: 'southern-europe',
  },
  {
    city: 'Lisbon',
    country: 'Portugal',
    house: 'Veritas',
    url: 'https://veritas.art/en/auctions/',
    selector: '.sale-row',
    currency: 'EUR',
    vibe: 'Portuguese Colonial, Azulejos, Antiques. Atlantic heritage.',
    neighborhoods: ['lisbon-chiado', 'lisbon-principe-real', 'lisbon-alfama'],
    region: 'southern-europe',
  },

  // ─────────────────────────────────────────────────────────────
  // APAC
  // ─────────────────────────────────────────────────────────────
  {
    city: 'Tokyo',
    country: 'Japan',
    house: 'SBI Art Auction',
    url: 'https://www.sbiartauction.co.jp/en/',
    selector: '.schedule-list',
    currency: 'JPY',
    vibe: 'Cutting-edge Contemporary, Manga Art, Street Culture. The future of Asian art.',
    neighborhoods: ['tokyo-aoyama', 'tokyo-ginza', 'tokyo-daikanyama'],
    region: 'apac',
  },
  {
    city: 'Tokyo',
    country: 'Japan',
    house: 'Mainichi Auction',
    url: 'https://www.my-auction.co.jp/en/',
    selector: '.auction-schedule',
    currency: 'JPY',
    vibe: 'Traditional Japanese Art, Ceramics, Prints. Heritage collecting.',
    neighborhoods: ['tokyo-nihonbashi', 'tokyo-roppongi'],
    region: 'apac',
  },
  {
    city: 'Sydney',
    country: 'Australia',
    house: 'Smith & Singer',
    url: 'https://www.smithandsinger.com.au/',
    selector: '.catalogue-grid',
    currency: 'AUD',
    vibe: 'Australian Impressionism, Harbor Wealth. The leading Australian auction house.',
    neighborhoods: ['sydney-double-bay', 'sydney-mosman', 'sydney-vaucluse'],
    region: 'apac',
  },
  {
    city: 'Melbourne',
    country: 'Australia',
    house: 'Leonard Joel',
    url: 'https://www.leonardjoel.com.au/auctions/',
    selector: '.auction-listing',
    currency: 'AUD',
    vibe: 'Australian Art, Decorative Arts, Jewellery. Melbourne sophistication.',
    neighborhoods: ['melbourne-toorak', 'melbourne-south-yarra'],
    region: 'apac',
  },
  {
    city: 'Singapore',
    country: 'Singapore',
    house: '33 Auction',
    url: 'https://www.33auction.com/auctions/',
    selector: '.auction-item',
    currency: 'USD',
    vibe: 'Southeast Asian Art, Chinese Ceramics, Singapore School.',
    neighborhoods: ['singapore-orchard', 'singapore-tanglin'],
    region: 'apac',
  },

  // ─────────────────────────────────────────────────────────────
  // NORTH AMERICA REGIONAL
  // ─────────────────────────────────────────────────────────────
  {
    city: 'Toronto',
    country: 'Canada',
    house: 'Heffel',
    url: 'https://www.heffel.com/auction/calendar',
    selector: '.sale-row',
    currency: 'CAD',
    vibe: 'Canadian Post-War, Group of Seven, Indigenous Art. The Canadian art authority.',
    neighborhoods: ['toronto-yorkville', 'toronto-queen-west', 'toronto-distillery'],
    region: 'north-america',
  },
  {
    city: 'Montreal',
    country: 'Canada',
    house: 'Iegor',
    url: 'https://iegor.net/en/auctions/',
    selector: '.auction-card',
    currency: 'CAD',
    vibe: 'Quebec Heritage, Canadian Art, European Antiques. French-Canadian collecting.',
    neighborhoods: ['montreal-westmount', 'montreal-mile-end'],
    region: 'north-america',
  },
  {
    city: 'Chicago',
    country: 'USA',
    house: 'Hindman',
    url: 'https://hindmanauctions.com/auctions',
    selector: '.auction-tile',
    currency: 'USD',
    vibe: 'American Furniture, Prints, Mid-West Estates. Chicago institution since 1982.',
    neighborhoods: ['chicago-gold-coast', 'chicago-lincoln-park'],
    region: 'north-america',
  },
  {
    city: 'San Francisco',
    country: 'USA',
    house: 'Bonhams SF',
    url: 'https://www.bonhams.com/locations/san-francisco/',
    selector: '.calendar-list',
    currency: 'USD',
    vibe: 'California Impressionism, Asian Art, Wine. West Coast elegance.',
    neighborhoods: ['sf-pacific-heights', 'sf-russian-hill', 'sf-marina'],
    region: 'north-america',
  },
  {
    city: 'Dallas',
    country: 'USA',
    house: 'Heritage Auctions',
    url: 'https://www.ha.com/upcoming-auctions/',
    selector: '.auction-item',
    currency: 'USD',
    vibe: 'Comics, Coins, Sports Memorabilia, Fine Art. The collectibles powerhouse.',
    neighborhoods: ['dallas-highland-park', 'dallas-uptown'],
    region: 'north-america',
  },
  {
    city: 'Boston',
    country: 'USA',
    house: 'Skinner',
    url: 'https://www.skinnerinc.com/auctions/',
    selector: '.sale-listing',
    currency: 'USD',
    vibe: 'American Antiques, Maritime Art, New England Heritage.',
    neighborhoods: ['boston-back-bay', 'boston-beacon-hill'],
    region: 'north-america',
  },

  // ─────────────────────────────────────────────────────────────
  // UK & IRELAND
  // ─────────────────────────────────────────────────────────────
  {
    city: 'Dublin',
    country: 'Ireland',
    house: "Adam's",
    url: 'https://www.adams.ie/upcoming-auctions',
    selector: '.auction-list-item',
    currency: 'EUR',
    vibe: 'Classic Irish Art, Jack B. Yeats, Period Furniture. The leading Irish auction house since 1887.',
    neighborhoods: ['dublin-ballsbridge', 'dublin-ranelagh', 'dublin-dalkey'],
    region: 'uk-ireland',
  },
  {
    city: 'Dublin',
    country: 'Ireland',
    house: "Whyte's",
    url: 'https://whytes.ie/',
    selector: '.auction_row',
    currency: 'EUR',
    vibe: 'History, Irish Republic Memorabilia, Fine Art. Specialists in Irish heritage and collectibles.',
    neighborhoods: ['dublin-ballsbridge'],
    region: 'uk-ireland',
  },

  // ─────────────────────────────────────────────────────────────
  // OCEANIA (New Zealand - Kiwi Champions)
  // ─────────────────────────────────────────────────────────────
  {
    city: 'Auckland',
    country: 'New Zealand',
    house: "Webb's",
    url: 'https://www.webbs.co.nz/auction-calendar/',
    selector: '.auction-item',
    currency: 'NZD',
    vibe: 'Colin McCahon, Goldie, Vintage Cars. The leading NZ auction house since 1976.',
    neighborhoods: ['auckland-herne-bay', 'auckland-remuera'],
    region: 'oceania',
  },
  {
    city: 'Auckland',
    country: 'New Zealand',
    house: 'Art+Object',
    url: 'https://www.artandobject.co.nz/auctions',
    selector: '.auction-list',
    currency: 'NZD',
    vibe: 'Contemporary NZ Art, Modernism, Ralph Hotere. Auckland art market authority.',
    neighborhoods: ['auckland-herne-bay', 'auckland-remuera', 'auckland-waiheke'],
    region: 'oceania',
  },
];

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TIER 3: VACATION MAPPINGS CONFIGURATION
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const VACATION_MAPPINGS: VacationMapping[] = [
  // US Vacation
  {
    id: 'st-barts',
    name: 'St. Barts',
    neighborhoodId: 'st-barts-st-barts',
    sourceHubs: ['New_York', 'Paris'],
    keywords: ['resort', 'jewels', 'watches', 'hermes', 'handbags', 'luxury', 'design'],
    tone: 'Villa Lifestyle. Caribbean chic meets Parisian sophistication.',
    region: 'caribbean-vacation',
  },
  {
    id: 'aspen',
    name: 'Aspen',
    neighborhoodId: 'aspen-aspen',
    sourceHubs: ['New_York', 'Los_Angeles'],
    keywords: ['western art', 'american art', 'design', 'photography', 'contemporary'],
    tone: 'Chalet Decor. Mountain luxury with cultural depth.',
    region: 'us-vacation',
  },
  {
    id: 'the-hamptons',
    name: 'The Hamptons',
    neighborhoodId: 'the-hamptons-the-hamptons',
    sourceHubs: ['New_York'],
    keywords: ['contemporary', 'design', 'prints', 'editions', 'photography', 'modern'],
    tone: 'Summer House Aesthetic. Hamptons elegance, gallery quality.',
    region: 'us-vacation',
  },
  {
    id: 'marthas-vineyard',
    name: "Martha's Vineyard",
    neighborhoodId: 'marthas-vineyard-marthas-vineyard',
    sourceHubs: ['New_York'],
    keywords: ['maritime', 'americana', 'prints', 'photography', 'folk art'],
    tone: 'Coastal Heritage. New England charm, presidential pedigree.',
    region: 'us-vacation',
  },
  {
    id: 'nantucket',
    name: 'Nantucket',
    neighborhoodId: 'nantucket-nantucket',
    sourceHubs: ['New_York'],
    keywords: ['maritime', 'americana', 'antiques', 'folk art', 'prints'],
    tone: 'Island Heritage. Whaling history meets summer society.',
    region: 'us-vacation',
  },

  // European Vacation
  {
    id: 'sylt',
    name: 'Sylt',
    neighborhoodId: 'sylt-sylt',
    sourceHubs: ['London'],
    keywords: ['photography', 'modern', 'contemporary', 'design'],
    tone: 'North Sea Retreat. German discretion, artistic sophistication.',
    region: 'europe-vacation',
  },
  {
    id: 'marbella',
    name: 'Marbella',
    neighborhoodId: 'marbella-marbella',
    sourceHubs: ['London'],
    keywords: ['contemporary', 'luxury', 'jewels', 'design', 'modern'],
    tone: 'Mediterranean Luxury. Golden Mile glamour.',
    region: 'europe-vacation',
  },
  {
    id: 'saint-tropez',
    name: 'Saint-Tropez',
    neighborhoodId: 'saint-tropez-saint-tropez',
    sourceHubs: ['Paris', 'London'],
    keywords: ['contemporary', 'impressionist', 'modern', 'design', 'jewels'],
    tone: 'Riviera Glamour. French Riviera meets art market.',
    region: 'europe-vacation',
  },
  {
    id: 'ibiza',
    name: 'Ibiza',
    neighborhoodId: 'ibiza-ibiza',
    sourceHubs: ['London', 'Paris'],
    keywords: ['contemporary', 'photography', 'design', 'modern'],
    tone: 'Bohemian Luxury. Island creativity meets collecting.',
    region: 'europe-vacation',
  },
  {
    id: 'amalfi',
    name: 'Amalfi Coast',
    neighborhoodId: 'amalfi-amalfi',
    sourceHubs: ['London', 'Paris'],
    keywords: ['italian', 'design', 'ceramics', 'antiques', 'old masters'],
    tone: 'Italian Dolce Vita. Cliffside luxury, Renaissance heritage.',
    region: 'europe-vacation',
  },
];

/**
 * All vacation neighborhood IDs
 */
export const ALL_VACATION_NEIGHBORHOODS = VACATION_MAPPINGS.map((m) => m.neighborhoodId);

/**
 * Regional auction event
 */
export interface RegionalAuctionEvent {
  eventId: string;
  house: string;
  city: string;
  country: string;
  title: string;
  date: string;
  endDate?: string;
  tier: AuctionTier;
  category?: string;
  currency: RegionalCurrency;
  currencySymbol: string;
  url?: string;
  targetNeighborhoods: string[];
  vibe: string;
  region: string;
  matchedKeywords: string[];
  rawData?: Record<string, unknown>;
}

/**
 * Vacation-mapped auction event
 */
export interface VacationAuctionEvent {
  sourceEvent: GlobalAuctionEvent;
  vacationMapping: VacationMapping;
  relevanceScore: number;
  matchedKeywords: string[];
}

/**
 * Generated specialty auction story
 */
export interface SpecialtyAuctionStory {
  eventId: string;
  mode: 'national' | 'vacation';
  house: string;
  title: string;
  headline: string;
  body: string;
  previewText: string;
  city: string;
  sourceCity?: string; // For vacation mode
  currency: RegionalCurrency;
  currencySymbol: string;
  targetNeighborhoods: string[];
  tier: AuctionTier;
  generatedAt: string;
}

/**
 * Parse date string to standardized format
 */
function parseAuctionDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch {
    // Fall through
  }
  return dateStr;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TIER 2: NATIONAL CHAMPIONS SCRAPING
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Fetch regional auction calendar via API (preferred)
 * Falls back to HTML scraping if API unavailable
 */
async function fetchRegionalCalendar(
  target: RegionalTarget,
  daysAhead: number = 14
): Promise<RegionalAuctionEvent[]> {
  const events: RegionalAuctionEvent[] = [];

  try {
    // Try API endpoint first if available
    if (target.apiUrl) {
      const response = await fetch(target.apiUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Process API response (structure varies by house)
        return processApiResponse(data, target, daysAhead);
      }
    }

    // Fall back to HTML scraping
    const response = await fetch(target.url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.log(`${target.house} returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    return extractAuctionsFromHtml(html, target, daysAhead);
  } catch (error) {
    console.error(`${target.house} fetch error:`, error);
    return [];
  }
}

/**
 * Process API response into events
 */
function processApiResponse(
  data: unknown,
  target: RegionalTarget,
  daysAhead: number
): RegionalAuctionEvent[] {
  const events: RegionalAuctionEvent[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

  // Handle various API response formats
  const auctions = Array.isArray(data)
    ? data
    : (data as Record<string, unknown>).auctions ||
      (data as Record<string, unknown>).sales ||
      (data as Record<string, unknown>).items ||
      [];

  if (!Array.isArray(auctions)) return [];

  for (const auction of auctions) {
    const auctionData = auction as Record<string, unknown>;
    const dateField =
      auctionData.date ||
      auctionData.startDate ||
      auctionData.start_date ||
      auctionData.auction_date;
    if (!dateField) continue;

    const auctionDate = new Date(String(dateField));
    if (auctionDate > cutoffDate) continue;

    const title = String(
      auctionData.title || auctionData.name || auctionData.auction_name || ''
    );
    if (!title) continue;

    const blueChipResult = isBlueChip(title);
    // Regional houses get looser filtering - we want most events
    const tier = blueChipResult.passes
      ? determineAuctionTier(title, blueChipResult.keywords)
      : 'Standard';

    events.push({
      eventId: `${target.house.toLowerCase().replace(/\s+/g, '-')}-${auctionData.id || Date.now()}`,
      house: target.house,
      city: target.city,
      country: target.country,
      title,
      date: parseAuctionDate(String(dateField)),
      tier,
      category: String(auctionData.category || auctionData.department || ''),
      currency: target.currency,
      currencySymbol: CURRENCY_SYMBOLS[target.currency],
      url: String(auctionData.url || auctionData.link || target.url),
      targetNeighborhoods: target.neighborhoods,
      vibe: target.vibe,
      region: target.region,
      matchedKeywords: blueChipResult.keywords,
    });
  }

  return events;
}

/**
 * Extract auctions from HTML using regex patterns
 * Note: In production, use Playwright for React/Angular sites
 */
function extractAuctionsFromHtml(
  html: string,
  target: RegionalTarget,
  daysAhead: number
): RegionalAuctionEvent[] {
  const events: RegionalAuctionEvent[] = [];

  // Basic extraction patterns
  // This is a fallback - Playwright would be used in production
  const datePattern = /(\d{1,2}[\s-]\w+[\s-]\d{4}|\w+\s+\d{1,2},?\s+\d{4})/g;
  const titlePattern = /<h[23][^>]*>([^<]+)<\/h[23]>/gi;

  const dates = html.match(datePattern) || [];
  const titleMatches = [...html.matchAll(titlePattern)];

  // Create basic events from extracted data
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

  for (let i = 0; i < Math.min(dates.length, titleMatches.length, 10); i++) {
    try {
      const dateStr = dates[i];
      const title = titleMatches[i]?.[1]?.trim() || '';

      if (!title || title.length < 5) continue;

      const auctionDate = new Date(dateStr);
      if (isNaN(auctionDate.getTime()) || auctionDate > cutoffDate) continue;

      const blueChipResult = isBlueChip(title);
      const tier = blueChipResult.passes
        ? determineAuctionTier(title, blueChipResult.keywords)
        : 'Standard';

      events.push({
        eventId: `${target.house.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${i}`,
        house: target.house,
        city: target.city,
        country: target.country,
        title,
        date: parseAuctionDate(dateStr),
        tier,
        currency: target.currency,
        currencySymbol: CURRENCY_SYMBOLS[target.currency],
        url: target.url,
        targetNeighborhoods: target.neighborhoods,
        vibe: target.vibe,
        region: target.region,
        matchedKeywords: blueChipResult.keywords,
      });
    } catch {
      // Continue on parse errors
    }
  }

  return events;
}

/**
 * Fetch all regional auction calendars
 */
export async function fetchAllRegionalCalendars(
  daysAhead: number = 14,
  regions?: string[]
): Promise<RegionalAuctionEvent[]> {
  const targets = regions
    ? REGIONAL_TARGETS.filter((t) => regions.includes(t.region))
    : REGIONAL_TARGETS;

  console.log(`Fetching calendars from ${targets.length} regional auction houses`);

  const results = await Promise.allSettled(
    targets.map((target) => fetchRegionalCalendar(target, daysAhead))
  );

  const events: RegionalAuctionEvent[] = [];
  let successCount = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      events.push(...result.value);
      if (result.value.length > 0) successCount++;
    } else {
      console.error(`${targets[i].house} failed:`, result.reason);
    }
  }

  console.log(
    `Regional: Found ${events.length} events from ${successCount}/${targets.length} houses`
  );

  // Sort by date
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return events;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TIER 3: VACATION MAPPINGS
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Filter global auction events for vacation markets
 */
export async function filterEventsForVacation(
  vacationMapping: VacationMapping,
  globalEvents?: GlobalAuctionEvent[]
): Promise<VacationAuctionEvent[]> {
  // Fetch global events if not provided
  const events =
    globalEvents ||
    (await fetchAllGlobalAuctionCalendars(14, vacationMapping.sourceHubs as never[]));

  const matched: VacationAuctionEvent[] = [];

  for (const event of events) {
    // Check if event is from a source hub
    if (!vacationMapping.sourceHubs.includes(event.hub)) continue;

    // Score relevance based on keyword matches
    const eventText = `${event.title} ${event.category || ''}`.toLowerCase();
    const matchedKeywords = vacationMapping.keywords.filter((kw) =>
      eventText.includes(kw.toLowerCase())
    );

    // Require at least one keyword match
    if (matchedKeywords.length === 0) continue;

    // Calculate relevance score
    const relevanceScore =
      matchedKeywords.length * 10 + (event.tier === 'Mega' ? 20 : 0);

    matched.push({
      sourceEvent: event,
      vacationMapping,
      relevanceScore,
      matchedKeywords,
    });
  }

  // Sort by relevance score
  matched.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return matched;
}

/**
 * Get all vacation-relevant events across all mappings
 */
export async function fetchAllVacationEvents(
  daysAhead: number = 14
): Promise<VacationAuctionEvent[]> {
  // Get unique source hubs
  const allHubs = [...new Set(VACATION_MAPPINGS.flatMap((m) => m.sourceHubs))];

  // Fetch global events once
  const globalEvents = await fetchAllGlobalAuctionCalendars(
    daysAhead,
    allHubs as never[]
  );

  // Filter for each vacation market
  const allVacationEvents: VacationAuctionEvent[] = [];

  for (const mapping of VACATION_MAPPINGS) {
    const events = await filterEventsForVacation(mapping, globalEvents);
    allVacationEvents.push(...events);
  }

  console.log(`Vacation: Found ${allVacationEvents.length} relevant events`);

  return allVacationEvents;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * STORY GENERATION
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Generate story for a National Champion event
 */
export async function generateNationalChampionStory(
  event: RegionalAuctionEvent
): Promise<SpecialtyAuctionStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Format date
  const auctionDate = new Date(event.date);
  const dateStr = auctionDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const systemPrompt = `You are the Flâneur Editor for ${event.city}, ${event.country}.

This is a NATIONAL CHAMPION auction house - the premier local institution.

Context:
- ${event.house} is THE auction authority in ${event.city}.
- ${event.vibe}
- Tone: 'Patriotic & Heritage'. Use terms like 'homecoming', 'local treasure', or 'national pride'.

Writing Style:
- Sophisticated and proud
- Reference the house's reputation and heritage
- Use the correct local currency symbol (${event.currencySymbol})
- No emojis`;

  const prompt = `Auction House: ${event.house}
Location: ${event.city}, ${event.country}
Title: ${event.title}
Date: ${dateStr}
Category: ${event.category || 'Fine Art & Antiques'}
Tier: ${event.tier}
Currency: ${event.currency} (${event.currencySymbol})

Headline Format: "Local Gavel: ${event.house} hosts [Sale Title]"

Task: Write a 35-word blurb for local collectors about this auction.

Return JSON:
{
  "headline": "Headline under 70 chars",
  "body": "35-word description emphasizing local heritage and collector appeal",
  "previewText": "One sentence teaser",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 1-3 link candidates for key entities mentioned in the body (auction house, artists, categories).`;

  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: {
        temperature: 0.7,
      },
    });

    const rawText = response.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || `${event.house} presents ${event.title} on ${dateStr}.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, { name: event.city, city: event.city });
    }

    return {
      eventId: event.eventId,
      mode: 'national',
      house: event.house,
      title: event.title,
      headline: parsed.headline || `Local Gavel: ${event.house} hosts ${event.title}`,
      body,
      previewText: parsed.previewText || `${event.house} auction in ${event.city}.`,
      city: event.city,
      currency: event.currency,
      currencySymbol: event.currencySymbol,
      targetNeighborhoods: event.targetNeighborhoods,
      tier: event.tier,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`National champion story generation error:`, error);
    return null;
  }
}

/**
 * Generate story for a Vacation-mapped event
 */
export async function generateVacationMappedStory(
  vacationEvent: VacationAuctionEvent
): Promise<SpecialtyAuctionStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });
  const { sourceEvent, vacationMapping } = vacationEvent;

  // Format date
  const auctionDate = new Date(sourceEvent.date);
  const dateStr = auctionDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const systemPrompt = `You are the Flâneur Editor for ${vacationMapping.name}.

There is NO auction house in ${vacationMapping.name}, but this sale in ${sourceEvent.location} is relevant to your readers.

Context:
- ${vacationMapping.tone}
- Readers are vacationing here and decorating their homes.
- Tone: 'Curatorial'. "Perfect pieces for your ${vacationMapping.name.includes('Barts') ? 'villa' : 'vacation home'}."

Writing Style:
- Aspirational and advisory
- Connect the sale to the vacation lifestyle
- Use the source city's currency (${sourceEvent.currencySymbol})
- No emojis`;

  const prompt = `Source City: ${sourceEvent.location}
Auction House: ${sourceEvent.house}
Title: ${sourceEvent.title}
Date: ${dateStr}
Category: ${sourceEvent.category || 'Fine Art'}
Matched Keywords: ${vacationEvent.matchedKeywords.join(', ')}
Currency: ${sourceEvent.currency} (${sourceEvent.currencySymbol})

Your Vacation Market: ${vacationMapping.name}
Tone: ${vacationMapping.tone}

Headline Format: "Market Watch: [Sale Title] in ${sourceEvent.location}"

Task: Write a 35-word blurb explaining why this sale matters to ${vacationMapping.name} residents.

Return JSON:
{
  "headline": "Headline under 70 chars",
  "body": "35-word description connecting the sale to vacation living",
  "previewText": "One sentence teaser",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 1-3 link candidates for key entities mentioned in the body (auction house, artists, categories).`;

  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: {
        temperature: 0.7,
      },
    });

    const rawText = response.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || `A relevant sale for ${vacationMapping.name} residents.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, { name: vacationMapping.name, city: sourceEvent.location });
    }

    return {
      eventId: `vacation-${vacationMapping.id}-${sourceEvent.eventId}`,
      mode: 'vacation',
      house: sourceEvent.house,
      title: sourceEvent.title,
      headline:
        parsed.headline ||
        `Market Watch: ${sourceEvent.title} in ${sourceEvent.location}`,
      body,
      previewText: parsed.previewText || `From ${sourceEvent.location} to ${vacationMapping.name}.`,
      city: vacationMapping.name,
      sourceCity: sourceEvent.location,
      currency: sourceEvent.currency,
      currencySymbol: sourceEvent.currencySymbol,
      targetNeighborhoods: [vacationMapping.neighborhoodId],
      tier: sourceEvent.tier,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Vacation mapped story generation error:`, error);
    return null;
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PROCESSING PIPELINE
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Process all specialty auctions
 */
export async function processSpecialtyAuctions(
  daysAhead: number = 14
): Promise<{
  regionalEventsFound: number;
  vacationEventsFound: number;
  storiesGenerated: number;
  stories: SpecialtyAuctionStory[];
  byRegion: Record<string, number>;
  byVacation: Record<string, number>;
  errors: string[];
}> {
  const errors: string[] = [];
  const stories: SpecialtyAuctionStory[] = [];
  const byRegion: Record<string, number> = {};
  const byVacation: Record<string, number> = {};

  // Fetch regional events
  const regionalEvents = await fetchAllRegionalCalendars(daysAhead);
  const regionalEventsFound = regionalEvents.length;

  // Count by region
  for (const event of regionalEvents) {
    byRegion[event.region] = (byRegion[event.region] || 0) + 1;
  }

  // Fetch vacation events
  const vacationEvents = await fetchAllVacationEvents(daysAhead);
  const vacationEventsFound = vacationEvents.length;

  // Count by vacation destination
  for (const event of vacationEvents) {
    byVacation[event.vacationMapping.name] =
      (byVacation[event.vacationMapping.name] || 0) + 1;
  }

  // Generate stories for top regional events (limit to manage costs)
  const topRegional = regionalEvents.slice(0, 10);
  for (const event of topRegional) {
    try {
      const story = await generateNationalChampionStory(event);
      if (story) stories.push(story);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      errors.push(`${event.house}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Generate stories for top vacation events
  const topVacation = vacationEvents.slice(0, 10);
  for (const event of topVacation) {
    try {
      const story = await generateVacationMappedStory(event);
      if (story) stories.push(story);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      errors.push(
        `${event.vacationMapping.name}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    regionalEventsFound,
    vacationEventsFound,
    storiesGenerated: stories.length,
    stories,
    byRegion,
    byVacation,
    errors,
  };
}

/**
 * Create sample events for testing
 */
export function createSampleSpecialtyEvents(): {
  regional: RegionalAuctionEvent[];
  vacation: VacationAuctionEvent[];
} {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dateStr = nextWeek.toISOString().split('T')[0];

  const regional: RegionalAuctionEvent[] = [
    {
      eventId: 'sample-bukowskis-1',
      house: 'Bukowskis',
      city: 'Stockholm',
      country: 'Sweden',
      title: 'Important Nordic Design',
      date: dateStr,
      tier: 'Mega',
      category: 'Design',
      currency: 'SEK',
      currencySymbol: 'kr',
      url: 'https://www.bukowskis.com',
      targetNeighborhoods: ['stockholm-ostermalm'],
      vibe: 'Scandi-Luxury, Modern Design, Svenskt Tenn.',
      region: 'nordic',
      matchedKeywords: ['design'],
    },
  ];

  const vacation: VacationAuctionEvent[] = [
    {
      sourceEvent: {
        eventId: 'sample-sothebys-nyc-1',
        house: 'Sothebys',
        title: 'Contemporary Art Evening Sale',
        date: dateStr,
        location: 'New York',
        tier: 'Mega',
        category: 'Contemporary',
        currency: 'USD',
        currencySymbol: '$',
        url: 'https://www.sothebys.com',
        targetRegions: [],
        matchedKeywords: ['contemporary', 'evening sale'],
        hub: 'New_York',
        localizedKeywords: [],
      },
      vacationMapping: VACATION_MAPPINGS.find((m) => m.id === 'the-hamptons')!,
      relevanceScore: 30,
      matchedKeywords: ['contemporary'],
    },
  ];

  return { regional, vacation };
}
