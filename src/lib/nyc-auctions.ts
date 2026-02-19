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
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { AI_MODELS } from '@/config/ai-models';
import { insiderPersona } from '@/lib/ai-persona';
import { grokEventSearch } from '@/lib/grok';

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
 * Fetch all auction calendars from the Big Three using Grok web search
 */
export async function fetchAllAuctionCalendars(
  daysAhead: number = 14
): Promise<AuctionEvent[]> {
  console.log(`Fetching NYC auction calendars for next ${daysAhead} days via Grok`);

  const allEvents: AuctionEvent[] = [];

  // Single batched Grok call for all 3 houses (avoids 3 sequential calls that timeout)
  const raw = await grokEventSearch(
    `You are an art market research assistant. Return ONLY a valid JSON array, no commentary.`,
    `Search for upcoming auctions at Sotheby's, Christie's, and Phillips in New York within the next ${daysAhead} days. Include live in-person auctions only (not online-only sales).

Return a JSON array of objects with these fields:
- "house": "Sothebys" or "Christies" or "Phillips"
- "title": auction title (string)
- "date": start date in YYYY-MM-DD format (string)
- "endDate": end date in YYYY-MM-DD format if multi-day, or null
- "category": auction category like "Contemporary Art", "Jewelry", "Watches" (string)
- "totalLots": number of lots if known, or null
- "estimateRange": total sale estimate if known like "$50M - $75M", or null
- "url": link to the auction page if known, or null

If no upcoming auctions are found, return an empty array [].`,
  );

  if (!raw) {
    console.log('No Grok response for NYC auctions');
    return [];
  }

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log('No JSON array found in Grok response for NYC auctions');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      house?: string;
      title?: string;
      date?: string;
      endDate?: string | null;
      category?: string;
      totalLots?: number | null;
      estimateRange?: string | null;
      url?: string | null;
    }>;

    for (const item of parsed) {
      const title = item.title || '';
      if (!title) continue;

      // Normalize house name
      const houseRaw = (item.house || '').replace(/['']/g, '');
      const house: AuctionHouse =
        houseRaw.toLowerCase().includes('sotheby') ? 'Sothebys' :
        houseRaw.toLowerCase().includes('christie') ? 'Christies' :
        houseRaw.toLowerCase().includes('phillips') ? 'Phillips' :
        'Sothebys'; // fallback

      const blueChipResult = isBlueChip(title);
      if (!blueChipResult.passes) continue;

      const tier = determineAuctionTier(title, blueChipResult.keywords);
      const eventId = `${house.toLowerCase()}-${title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 40)}-${item.date || Date.now()}`;

      allEvents.push({
        eventId,
        house,
        title,
        date: item.date ? parseAuctionDate(item.date) : new Date().toISOString().split('T')[0],
        endDate: item.endDate ? parseAuctionDate(item.endDate) : undefined,
        location: 'New York',
        tier,
        category: item.category || undefined,
        totalLots: item.totalLots || undefined,
        estimateRange: item.estimateRange || undefined,
        url: item.url || AUCTION_URLS[house],
        targetRegions: ['NYC', 'CT', 'NJ', 'MA'],
        matchedKeywords: blueChipResult.keywords,
      });
    }

    console.log(`NYC auctions: Found ${parsed.length} total, ${allEvents.length} passed Blue Chip filter`);
  } catch (err) {
    console.error('Error parsing NYC auction data:', err);
  }

  // Sort by date, then by tier (Mega first)
  allEvents.sort((a, b) => {
    const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateCompare !== 0) return dateCompare;
    if (a.tier !== b.tier) return a.tier === 'Mega' ? -1 : 1;
    return 0;
  });

  console.log(`Found ${allEvents.length} Blue Chip NYC auctions total`);

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

  const systemPrompt = `${insiderPersona('the Tri-State area and the Hamptons/Nantucket', 'Art Market Editor')}

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
  "previewText": "One sentence teaser for feed",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 2-4 link candidates for key entities mentioned in the body (auction house, notable artists, categories).`;

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
    let body = parsed.body || `${event.title} at ${event.house} on ${dateStr}.`;
    if (linkCandidates.length > 0) {
      // NYC context for auction house searches
      body = injectHyperlinks(body, linkCandidates, { name: 'Manhattan', city: 'New York' });
    }

    return {
      eventId: event.eventId,
      headline: parsed.headline || `${event.house}: ${event.title}`,
      body,
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
