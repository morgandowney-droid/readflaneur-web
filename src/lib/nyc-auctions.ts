/**
 * NYC Auction Watch Service
 *
 * Scrapes auction house calendars (Sotheby's, Christie's, Phillips) to alert
 * Flâneur residents about major NYC sales across the Northeast Luxury Corridor.
 *
 * Target Markets: NYC Core, NYC Surroundings, Connecticut, New Jersey, Massachusetts
 *
 * Features:
 * - Weekly calendar scraping from Big Three auction houses
 * - "Blue Chip" filter for high-status events
 * - Regional syndication to entire Northeast Luxury Corridor
 * - Tier classification (Mega vs Standard)
 */

import { GoogleGenAI } from '@google/genai';

// Gemini model for story generation
const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Auction house identifiers
 */
export type AuctionHouse = 'Sothebys' | 'Christies' | 'Phillips';

/**
 * Event tier classification
 */
export type AuctionTier = 'Mega' | 'Standard';

/**
 * Target regions for syndication
 */
export const NORTHEAST_LUXURY_CORRIDOR = {
  // NYC Core (11 neighborhoods)
  NYC_CORE: [
    'tribeca',
    'soho',
    'west-village',
    'greenwich-village',
    'chelsea',
    'meatpacking',
    'hudson-yards',
    'upper-east-side',
    'upper-west-side',
    'fidi',
    'williamsburg',
    'brooklyn-west',
  ],
  // NYC Surroundings
  NYC_SURROUNDINGS: [
    'westchester',
    'old-westbury',
    'the-hamptons',
  ],
  // Connecticut Gold Coast
  CONNECTICUT: [
    'greenwich',
    'new-canaan',
    'darien',
    'westport',
  ],
  // New Jersey
  NEW_JERSEY: [
    'bergen-gold',
    'montclair',
    'summit',
    'the-hills',
  ],
  // Massachusetts / Vacation
  MASSACHUSETTS: [
    'marthas-vineyard',
    'nantucket',
  ],
};

/**
 * All target neighborhood IDs for syndication
 */
export const ALL_AUCTION_TARGET_NEIGHBORHOODS = [
  ...NORTHEAST_LUXURY_CORRIDOR.NYC_CORE,
  ...NORTHEAST_LUXURY_CORRIDOR.NYC_SURROUNDINGS,
  ...NORTHEAST_LUXURY_CORRIDOR.CONNECTICUT,
  ...NORTHEAST_LUXURY_CORRIDOR.NEW_JERSEY,
  ...NORTHEAST_LUXURY_CORRIDOR.MASSACHUSETTS,
];

/**
 * Blue Chip filter keywords (whitelist)
 */
const BLUE_CHIP_KEYWORDS = [
  'evening sale',
  'important',
  'magnificent',
  'contemporary',
  'impressionist',
  'modern art',
  'modern design',
  'design',
  'luxury week',
  'the one',
  'masterpiece',
  'masterworks',
  'exceptional',
  '20th century',
  '21st century',
  'post-war',
  'old masters',
  'latin american',
  'asian art',
  'american art',
  'jewelry',
  'jewels',
  'watches',
  'handbags',
  'fashion',
];

/**
 * Keywords that indicate Mega tier events
 */
const MEGA_TIER_KEYWORDS = [
  'evening sale',
  'magnificent',
  'the one',
  'masterpiece',
  'exceptional',
];

/**
 * Exclusion keywords (blacklist)
 */
const EXCLUSION_KEYWORDS = [
  'wine',
  'spirits',
  'whisky',
  'whiskey',
  'posters',
  'online only',
  'online auction',
  'prints',
  'multiples',
  'books',
  'manuscripts',
  'maps',
  'photographs',
  'cameras',
  'interiors',
  'rugs',
  'carpets',
];

/**
 * Auction calendar URLs
 */
const AUCTION_URLS = {
  Sothebys: 'https://www.sothebys.com/en/calendar?locations=New%20York',
  Christies: 'https://www.christies.com/en/calendar?location=new_york',
  Phillips: 'https://www.phillips.com/calendar',
};

/**
 * Auction event data structure
 */
export interface AuctionEvent {
  eventId: string;
  house: AuctionHouse;
  title: string;
  date: string;
  endDate?: string;
  location: string;
  tier: AuctionTier;
  category?: string;
  totalLots?: number;
  estimateRange?: string;
  url?: string;
  targetRegions: string[];
  matchedKeywords: string[];
  rawData?: Record<string, unknown>;
}

/**
 * Generated auction story
 */
export interface AuctionStory {
  eventId: string;
  headline: string;
  body: string;
  previewText: string;
  house: AuctionHouse;
  tier: AuctionTier;
  auctionDate: string;
  generatedAt: string;
}

/**
 * Check if an auction title passes the Blue Chip filter
 */
export function isBlueChip(title: string): { passes: boolean; keywords: string[] } {
  const lower = title.toLowerCase();

  // Check exclusions first
  for (const exclude of EXCLUSION_KEYWORDS) {
    if (lower.includes(exclude)) {
      return { passes: false, keywords: [] };
    }
  }

  // Check for Blue Chip keywords
  const matchedKeywords = BLUE_CHIP_KEYWORDS.filter((kw) => lower.includes(kw));

  return {
    passes: matchedKeywords.length > 0,
    keywords: matchedKeywords,
  };
}

/**
 * Determine auction tier based on title
 */
export function determineAuctionTier(title: string, keywords: string[]): AuctionTier {
  const lower = title.toLowerCase();

  for (const megaKeyword of MEGA_TIER_KEYWORDS) {
    if (lower.includes(megaKeyword) || keywords.includes(megaKeyword)) {
      return 'Mega';
    }
  }

  return 'Standard';
}

/**
 * Parse date string to standardized format
 */
function parseAuctionDate(dateStr: string): string {
  try {
    // Try to parse various date formats
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
 * Fetch Sotheby's auction calendar
 * Note: In production, use Playwright for full SPA rendering
 */
async function fetchSothebysCalendar(daysAhead: number = 14): Promise<AuctionEvent[]> {
  const events: AuctionEvent[] = [];

  try {
    // Sotheby's has an API endpoint for calendar data
    const apiUrl = 'https://www.sothebys.com/api/v2/calendar';
    const params = new URLSearchParams({
      location: 'New York',
      type: 'auction',
      limit: '50',
    });

    const response = await fetch(`${apiUrl}?${params}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.log(`Sotheby's API returned ${response.status}, trying HTML fallback`);
      return await fetchSothebysHtmlFallback(daysAhead);
    }

    const data = await response.json();

    if (data.auctions && Array.isArray(data.auctions)) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

      for (const auction of data.auctions) {
        const auctionDate = new Date(auction.startDate || auction.date);
        if (auctionDate > cutoffDate) continue;

        const title = auction.title || auction.name || '';
        const blueChipResult = isBlueChip(title);

        if (!blueChipResult.passes) continue;

        const tier = determineAuctionTier(title, blueChipResult.keywords);

        events.push({
          eventId: `sothebys-${auction.id || Date.now()}`,
          house: 'Sothebys',
          title,
          date: parseAuctionDate(auction.startDate || auction.date),
          endDate: auction.endDate ? parseAuctionDate(auction.endDate) : undefined,
          location: auction.location || 'New York',
          tier,
          category: auction.category,
          totalLots: auction.lotCount || auction.totalLots,
          estimateRange: auction.estimateRange,
          url: auction.url || `https://www.sothebys.com${auction.path || ''}`,
          targetRegions: ['NYC', 'CT', 'NJ', 'MA'],
          matchedKeywords: blueChipResult.keywords,
          rawData: auction,
        });
      }
    }
  } catch (error) {
    console.error("Sotheby's fetch error:", error);
    return await fetchSothebysHtmlFallback(daysAhead);
  }

  return events;
}

/**
 * HTML fallback for Sotheby's when API is unavailable
 */
async function fetchSothebysHtmlFallback(daysAhead: number): Promise<AuctionEvent[]> {
  // This would use Playwright in production
  console.log("Sotheby's HTML fallback - would use Playwright in production");
  return [];
}

/**
 * Fetch Christie's auction calendar
 */
async function fetchChristiesCalendar(daysAhead: number = 14): Promise<AuctionEvent[]> {
  const events: AuctionEvent[] = [];

  try {
    // Christie's has a GraphQL API
    const apiUrl = 'https://www.christies.com/api/calendar';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        location: 'new_york',
        type: 'live_auction',
        limit: 50,
      }),
    });

    if (!response.ok) {
      console.log(`Christie's API returned ${response.status}, trying HTML fallback`);
      return await fetchChristiesHtmlFallback(daysAhead);
    }

    const data = await response.json();

    if (data.sales && Array.isArray(data.sales)) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

      for (const sale of data.sales) {
        const saleDate = new Date(sale.startDate || sale.date);
        if (saleDate > cutoffDate) continue;

        const title = sale.title || sale.name || '';
        const blueChipResult = isBlueChip(title);

        if (!blueChipResult.passes) continue;

        const tier = determineAuctionTier(title, blueChipResult.keywords);

        events.push({
          eventId: `christies-${sale.id || Date.now()}`,
          house: 'Christies',
          title,
          date: parseAuctionDate(sale.startDate || sale.date),
          endDate: sale.endDate ? parseAuctionDate(sale.endDate) : undefined,
          location: sale.location || 'New York',
          tier,
          category: sale.category,
          totalLots: sale.lotCount,
          url: sale.url || `https://www.christies.com${sale.path || ''}`,
          targetRegions: ['NYC', 'CT', 'NJ', 'MA'],
          matchedKeywords: blueChipResult.keywords,
          rawData: sale,
        });
      }
    }
  } catch (error) {
    console.error("Christie's fetch error:", error);
    return await fetchChristiesHtmlFallback(daysAhead);
  }

  return events;
}

/**
 * HTML fallback for Christie's
 */
async function fetchChristiesHtmlFallback(daysAhead: number): Promise<AuctionEvent[]> {
  console.log("Christie's HTML fallback - would use Playwright in production");
  return [];
}

/**
 * Fetch Phillips auction calendar
 */
async function fetchPhillipsCalendar(daysAhead: number = 14): Promise<AuctionEvent[]> {
  const events: AuctionEvent[] = [];

  try {
    // Phillips has a REST API
    const apiUrl = 'https://www.phillips.com/api/auctions';

    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.log(`Phillips API returned ${response.status}, trying HTML fallback`);
      return await fetchPhillipsHtmlFallback(daysAhead);
    }

    const data = await response.json();

    if (data.auctions && Array.isArray(data.auctions)) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

      for (const auction of data.auctions) {
        // Filter for New York
        const location = auction.location || auction.city || '';
        if (!location.toLowerCase().includes('new york')) continue;

        const auctionDate = new Date(auction.startDate || auction.date);
        if (auctionDate > cutoffDate) continue;

        const title = auction.title || auction.name || '';
        const blueChipResult = isBlueChip(title);

        if (!blueChipResult.passes) continue;

        const tier = determineAuctionTier(title, blueChipResult.keywords);

        events.push({
          eventId: `phillips-${auction.id || Date.now()}`,
          house: 'Phillips',
          title,
          date: parseAuctionDate(auction.startDate || auction.date),
          endDate: auction.endDate ? parseAuctionDate(auction.endDate) : undefined,
          location: 'New York',
          tier,
          category: auction.category || auction.department,
          totalLots: auction.lotCount,
          url: auction.url || `https://www.phillips.com${auction.path || ''}`,
          targetRegions: ['NYC', 'CT', 'NJ', 'MA'],
          matchedKeywords: blueChipResult.keywords,
          rawData: auction,
        });
      }
    }
  } catch (error) {
    console.error('Phillips fetch error:', error);
    return await fetchPhillipsHtmlFallback(daysAhead);
  }

  return events;
}

/**
 * HTML fallback for Phillips
 */
async function fetchPhillipsHtmlFallback(daysAhead: number): Promise<AuctionEvent[]> {
  console.log('Phillips HTML fallback - would use Playwright in production');
  return [];
}

/**
 * Fetch all auction calendars from the Big Three
 */
export async function fetchAllAuctionCalendars(
  daysAhead: number = 14
): Promise<AuctionEvent[]> {
  console.log(`Fetching auction calendars for next ${daysAhead} days`);

  const [sothebys, christies, phillips] = await Promise.all([
    fetchSothebysCalendar(daysAhead),
    fetchChristiesCalendar(daysAhead),
    fetchPhillipsCalendar(daysAhead),
  ]);

  const allEvents = [...sothebys, ...christies, ...phillips];

  // Sort by date, then by tier (Mega first)
  allEvents.sort((a, b) => {
    const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateCompare !== 0) return dateCompare;
    if (a.tier !== b.tier) return a.tier === 'Mega' ? -1 : 1;
    return 0;
  });

  console.log(`Found ${allEvents.length} Blue Chip auctions (Sotheby's: ${sothebys.length}, Christie's: ${christies.length}, Phillips: ${phillips.length})`);

  return allEvents;
}

/**
 * Generate an auction story using Gemini
 */
export async function generateAuctionStory(
  event: AuctionEvent
): Promise<AuctionStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Format the auction date
  const auctionDate = new Date(event.date);
  const dateStr = auctionDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Build tier-specific tone guidance
  let toneGuidance: string;
  if (event.tier === 'Mega') {
    toneGuidance = `Tone: 'Destination Event'. This is a marquee sale that serious collectors travel for. Imply it's worth the drive from Greenwich or flight from Nantucket. Emphasize prestige and rarity.`;
  } else {
    toneGuidance = `Tone: 'Informed Insider'. A solid sale for engaged collectors. Mention specific categories that might appeal.`;
  }

  // House-specific flavor
  const houseStyle: Record<AuctionHouse, string> = {
    Sothebys: "Sotheby's brings centuries of expertise",
    Christies: "Christie's signature white-glove presentation",
    Phillips: "Phillips' contemporary edge and emerging categories",
  };

  const systemPrompt = `You are the Art Market Editor for Flâneur, writing for wealthy collectors across the Tri-State area and the Hamptons/Nantucket.

Writing Style:
- ${toneGuidance}
- Reference the auction house's reputation
- If known, mention notable lots or estimate ranges
- Keep it sophisticated but accessible
- No emojis`;

  const prompt = `Data:
- Auction House: ${event.house}
- Title: ${event.title}
- Date: ${dateStr}
- Location: ${event.location}
- Tier: ${event.tier}
- Category: ${event.category || 'Fine Art & Luxury'}
${event.totalLots ? `- Total Lots: ${event.totalLots}` : ''}
${event.estimateRange ? `- Estimate Range: ${event.estimateRange}` : ''}
- Keywords: ${event.matchedKeywords.join(', ')}

House Note: ${houseStyle[event.house]}

Task: Write a 45-word blurb about this upcoming auction.

Return JSON:
{
  "headline": "Headline mentioning house and key category (under 70 chars)",
  "body": "45-word description emphasizing prestige and collector appeal",
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
      headline: parsed.headline || `${event.house}: ${event.title}`,
      body: parsed.body || `${event.title} at ${event.house} on ${dateStr}.`,
      previewText: parsed.previewText || `Major auction at ${event.house}.`,
      house: event.house,
      tier: event.tier,
      auctionDate: event.date,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Auction story generation error:', error);
    return null;
  }
}

/**
 * Process all auctions and generate stories
 */
export async function processAuctionCalendars(
  daysAhead: number = 14
): Promise<{
  events: AuctionEvent[];
  stories: AuctionStory[];
  byHouse: Record<AuctionHouse, number>;
  byTier: Record<AuctionTier, number>;
  errors: string[];
}> {
  const errors: string[] = [];
  const stories: AuctionStory[] = [];
  const byHouse: Record<AuctionHouse, number> = {
    Sothebys: 0,
    Christies: 0,
    Phillips: 0,
  };
  const byTier: Record<AuctionTier, number> = {
    Mega: 0,
    Standard: 0,
  };

  // Fetch all calendars
  const events = await fetchAllAuctionCalendars(daysAhead);

  // Count by house and tier
  for (const event of events) {
    byHouse[event.house]++;
    byTier[event.tier]++;
  }

  if (events.length === 0) {
    return { events: [], stories: [], byHouse, byTier, errors: [] };
  }

  // Generate stories for top events
  // Prioritize: All Mega tier, then top Standard
  const megaEvents = events.filter((e) => e.tier === 'Mega').slice(0, 5);
  const standardEvents = events.filter((e) => e.tier === 'Standard').slice(0, 5);

  const topEvents = [...megaEvents, ...standardEvents];

  for (const event of topEvents) {
    try {
      const story = await generateAuctionStory(event);
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

  return { events, stories, byHouse, byTier, errors };
}

/**
 * Create a demo/sample auction event for testing
 * This can be used when APIs are unavailable
 */
export function createSampleAuctionEvents(): AuctionEvent[] {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return [
    {
      eventId: 'sample-sothebys-1',
      house: 'Sothebys',
      title: 'Contemporary Art Evening Sale',
      date: nextWeek.toISOString().split('T')[0],
      location: 'New York',
      tier: 'Mega',
      category: 'Contemporary Art',
      totalLots: 45,
      estimateRange: '$50M - $75M',
      url: 'https://www.sothebys.com',
      targetRegions: ['NYC', 'CT', 'NJ', 'MA'],
      matchedKeywords: ['evening sale', 'contemporary'],
    },
    {
      eventId: 'sample-christies-1',
      house: 'Christies',
      title: 'Magnificent Jewels',
      date: nextWeek.toISOString().split('T')[0],
      location: 'New York',
      tier: 'Mega',
      category: 'Jewelry',
      totalLots: 200,
      url: 'https://www.christies.com',
      targetRegions: ['NYC', 'CT', 'NJ', 'MA'],
      matchedKeywords: ['magnificent', 'jewels'],
    },
    {
      eventId: 'sample-phillips-1',
      house: 'Phillips',
      title: '20th Century & Contemporary Art Day Sale',
      date: nextWeek.toISOString().split('T')[0],
      location: 'New York',
      tier: 'Standard',
      category: 'Contemporary Art',
      totalLots: 150,
      url: 'https://www.phillips.com',
      targetRegions: ['NYC', 'CT', 'NJ', 'MA'],
      matchedKeywords: ['20th century', 'contemporary'],
    },
  ];
}
