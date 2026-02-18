/**
 * Global Auction Watch Service
 *
 * Scrapes the "Big Three" auction house calendars (Sotheby's, Christie's, Phillips)
 * across Global Art Hubs and syndicates stories to nearby Spoke neighborhoods.
 *
 * Hub & Spoke Model:
 * - London → Mayfair, Chelsea, Kensington, Notting Hill, Hampstead
 * - Paris → 7th Arr, 16th Arr, Le Marais, Saint-Germain
 * - Hong Kong → Central, SoHo HK, The Peak
 * - Los Angeles → Beverly Hills, West Hollywood, Santa Monica
 * - Geneva → European Vacation, Global Watch (luxury assets)
 *
 * Features:
 * - Regional Blue Chip keywords (Old Masters for London, Watches for Geneva)
 * - Localized tone (Traditional/Sharp for London, Stealth Wealth for Geneva)
 * - Currency-aware story generation
 * - Hub-to-Spoke distribution
 */

import { GoogleGenAI } from '@google/genai';
import {
  AuctionEvent,
  AuctionHouse,
  AuctionTier,
  AuctionStory,
  isBlueChip as baseIsBlueChip,
  determineAuctionTier,
} from './nyc-auctions';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { AI_MODELS } from '@/config/ai-models';
import { grokEventSearch } from '@/lib/grok';

/**
 * Global Art Hub identifiers
 */
export type ArtHub = 'London' | 'Paris' | 'Hong_Kong' | 'Los_Angeles' | 'Geneva' | 'New_York';

/**
 * Currency codes by hub
 */
export type HubCurrency = 'GBP' | 'EUR' | 'HKD' | 'USD' | 'CHF';

/**
 * Hub configuration with target feeds
 */
export interface HubConfig {
  houses: string[];
  currency: HubCurrency;
  currencySymbol: string;
  targetFeeds: string[];
  tone: string;
  landmarks: string[];
  regionalKeywords: string[];
}

/**
 * Global Art Hubs Configuration
 */
export const ART_HUBS: Record<ArtHub, HubConfig> = {
  London: {
    houses: ['Sothebys_LDN', 'Christies_LDN', 'Phillips_LDN'],
    currency: 'GBP',
    currencySymbol: '£',
    targetFeeds: [
      'london-mayfair',
      'london-chelsea',
      'london-kensington',
      'london-notting-hill',
      'london-hampstead',
    ],
    tone: 'Traditional & Sharp',
    landmarks: ['Bond Street', 'King Street', 'St James\'s'],
    regionalKeywords: ['old master', 'british art', 'impressionist', 'english furniture'],
  },
  Paris: {
    houses: ['Sothebys_PAR', 'Christies_PAR'],
    currency: 'EUR',
    currencySymbol: '€',
    targetFeeds: [
      'paris-7th-arr',
      'paris-16th-arr',
      'paris-le-marais',
      'paris-saint-germain',
    ],
    tone: 'Chic & Intellectual',
    landmarks: ['Drouot', 'Avenue Matignon', 'Rue du Faubourg Saint-Honoré'],
    regionalKeywords: ['design', 'surrealist', 'art d\'asie', 'mobilier', 'art nouveau'],
  },
  Hong_Kong: {
    houses: ['Sothebys_HK', 'Christies_HK', 'Phillips_HK'],
    currency: 'HKD',
    currencySymbol: 'HK$',
    targetFeeds: [
      'hong-kong-central',
      'hong-kong-soho',
      'hong-kong-the-peak',
    ],
    tone: 'Fast-Paced & Investment Heavy',
    landmarks: ['Hong Kong Convention Centre', 'Pacific Place', 'The Peninsula'],
    regionalKeywords: ['20th century', 'contemporary asian', 'watches', 'chinese works of art', 'southeast asian'],
  },
  Los_Angeles: {
    houses: ['Sothebys_LA', 'Christies_LA'],
    currency: 'USD',
    currencySymbol: '$',
    targetFeeds: [
      'la-beverly-hills',
      'la-west-hollywood',
      'la-santa-monica',
      'la-bel-air',
      'la-brentwood',
    ],
    tone: 'Hollywood Glamour & Contemporary Edge',
    landmarks: ['Beverly Hills', 'West Hollywood', 'the Westside'],
    regionalKeywords: ['california art', 'contemporary', 'photography', 'design', 'pop art'],
  },
  Geneva: {
    houses: ['Sothebys_GVA', 'Christies_GVA'],
    currency: 'CHF',
    currencySymbol: 'CHF ',
    targetFeeds: [
      'geneva-old-town',
      'zurich-bahnhofstrasse',
      'european-vacation',
    ],
    tone: 'Stealth Wealth',
    landmarks: ['Hotel des Bergues', 'Quai du Mont-Blanc', 'Place Vendôme'],
    regionalKeywords: ['luxury', 'watches', 'jewels', 'gemstones', 'rare diamonds', 'patek philippe', 'rolex daytona'],
  },
  New_York: {
    houses: ['Sothebys_NYC', 'Christies_NYC', 'Phillips_NYC'],
    currency: 'USD',
    currencySymbol: '$',
    targetFeeds: [], // Handled by nyc-auctions.ts
    tone: 'Power & Prestige',
    landmarks: ['York Avenue', 'Rockefeller Plaza', 'Park Avenue'],
    regionalKeywords: ['american art', 'latin american', 'evening sale'],
  },
};

/**
 * All global target neighborhood IDs for syndication
 */
export const ALL_GLOBAL_AUCTION_TARGETS = Object.values(ART_HUBS)
  .flatMap((hub) => hub.targetFeeds)
  .filter((id) => id.length > 0);

/**
 * Auction house URL patterns by hub
 */
const AUCTION_URLS_BY_HUB: Record<ArtHub, Record<AuctionHouse, string>> = {
  London: {
    Sothebys: 'https://www.sothebys.com/en/calendar?locations=London',
    Christies: 'https://www.christies.com/en/calendar?location=london',
    Phillips: 'https://www.phillips.com/calendar', // Filter by DOM
  },
  Paris: {
    Sothebys: 'https://www.sothebys.com/en/calendar?locations=Paris',
    Christies: 'https://www.christies.com/en/calendar?location=paris',
    Phillips: 'https://www.phillips.com/calendar', // No Paris presence typically
  },
  Hong_Kong: {
    Sothebys: 'https://www.sothebys.com/en/calendar?locations=Hong%20Kong',
    Christies: 'https://www.christies.com/en/calendar?location=hong_kong',
    Phillips: 'https://www.phillips.com/calendar', // Filter by DOM
  },
  Los_Angeles: {
    Sothebys: 'https://www.sothebys.com/en/calendar?locations=Los%20Angeles',
    Christies: 'https://www.christies.com/en/calendar?location=los_angeles',
    Phillips: 'https://www.phillips.com/calendar',
  },
  Geneva: {
    Sothebys: 'https://www.sothebys.com/en/calendar?locations=Geneva',
    Christies: 'https://www.christies.com/en/calendar?location=geneva',
    Phillips: 'https://www.phillips.com/calendar',
  },
  New_York: {
    Sothebys: 'https://www.sothebys.com/en/calendar?locations=New%20York',
    Christies: 'https://www.christies.com/en/calendar?location=new_york',
    Phillips: 'https://www.phillips.com/calendar',
  },
};

/**
 * Extended auction event for global hubs
 */
export interface GlobalAuctionEvent extends AuctionEvent {
  hub: ArtHub;
  currency: HubCurrency;
  currencySymbol: string;
  localizedKeywords: string[];
}

/**
 * Extended auction story for global hubs
 */
export interface GlobalAuctionStory extends AuctionStory {
  hub: ArtHub;
  currency: HubCurrency;
  targetFeeds: string[];
}

/**
 * Check if an auction passes the Blue Chip filter with regional keywords
 */
export function isGlobalBlueChip(
  title: string,
  hub: ArtHub
): { passes: boolean; keywords: string[]; localizedKeywords: string[] } {
  // First check base Blue Chip filter
  const baseResult = baseIsBlueChip(title);

  // Then check regional keywords
  const hubConfig = ART_HUBS[hub];
  const lower = title.toLowerCase();
  const localizedKeywords = hubConfig.regionalKeywords.filter((kw) =>
    lower.includes(kw.toLowerCase())
  );

  // Pass if base passes OR if regional keywords match
  const passes = baseResult.passes || localizedKeywords.length > 0;

  return {
    passes,
    keywords: baseResult.keywords,
    localizedKeywords,
  };
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
 * Fetch all auction calendars for a specific hub using Grok web search
 */
export async function fetchAuctionCalendarsForHub(
  hub: ArtHub,
  daysAhead: number = 14
): Promise<GlobalAuctionEvent[]> {
  const hubConfig = ART_HUBS[hub];
  const displayLocation: Record<ArtHub, string> = {
    London: 'London',
    Paris: 'Paris',
    Hong_Kong: 'Hong Kong',
    Los_Angeles: 'Los Angeles',
    Geneva: 'Geneva',
    New_York: 'New York',
  };
  const city = displayLocation[hub];
  const houses: AuctionHouse[] = ['Sothebys', 'Christies', 'Phillips'];
  const houseDisplayNames: Record<AuctionHouse, string> = {
    Sothebys: "Sotheby's",
    Christies: "Christie's",
    Phillips: 'Phillips',
  };

  console.log(`Fetching ${hub} auction calendars for next ${daysAhead} days via Grok`);

  const allEvents: GlobalAuctionEvent[] = [];

  for (const house of houses) {
    const displayName = houseDisplayNames[house];

    const raw = await grokEventSearch(
      `You are an art market research assistant. Return ONLY a valid JSON array, no commentary.`,
      `Search for upcoming auctions at ${displayName} in ${city} within the next ${daysAhead} days. Include live in-person auctions only (not online-only sales).

Return a JSON array of objects with these fields:
- "title": auction title (string)
- "date": start date in YYYY-MM-DD format (string)
- "endDate": end date in YYYY-MM-DD format if multi-day, or null
- "category": auction category like "Contemporary Art", "Jewelry", "Watches" (string)
- "totalLots": number of lots if known, or null
- "estimateRange": total sale estimate if known using local currency (${hubConfig.currencySymbol}), or null
- "url": link to the auction page if known, or null

If no upcoming auctions are found, return an empty array [].`,
    );

    if (!raw) {
      console.log(`No Grok response for ${displayName} ${city} auctions`);
      continue;
    }

    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.log(`No JSON array found in Grok response for ${displayName} ${city}`);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
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

        const blueChipResult = isGlobalBlueChip(title, hub);
        if (!blueChipResult.passes) continue;

        const allKeywords = [...blueChipResult.keywords, ...blueChipResult.localizedKeywords];
        const tier = determineAuctionTier(title, allKeywords);
        const eventId = `${house.toLowerCase()}-${hub.toLowerCase()}-${title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 40)}-${item.date || Date.now()}`;

        allEvents.push({
          eventId,
          house,
          title,
          date: item.date ? parseAuctionDate(item.date) : new Date().toISOString().split('T')[0],
          endDate: item.endDate ? parseAuctionDate(item.endDate) : undefined,
          location: city,
          tier,
          category: item.category || undefined,
          totalLots: item.totalLots || undefined,
          estimateRange: item.estimateRange || undefined,
          url: item.url || AUCTION_URLS_BY_HUB[hub][house],
          targetRegions: hubConfig.targetFeeds,
          matchedKeywords: blueChipResult.keywords,
          hub,
          currency: hubConfig.currency,
          currencySymbol: hubConfig.currencySymbol,
          localizedKeywords: blueChipResult.localizedKeywords,
        });
      }

      console.log(`${displayName} ${city}: Found ${parsed.length} auctions, ${allEvents.filter(e => e.house === house).length} passed Blue Chip filter`);
    } catch (err) {
      console.error(`Error parsing ${displayName} ${city} auction data:`, err);
    }
  }

  // Sort by date, then by tier (Mega first)
  allEvents.sort((a, b) => {
    const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateCompare !== 0) return dateCompare;
    if (a.tier !== b.tier) return a.tier === 'Mega' ? -1 : 1;
    return 0;
  });

  console.log(`${hub}: Found ${allEvents.length} Blue Chip auctions total`);

  return allEvents;
}

/**
 * Fetch all auction calendars across all global hubs
 */
export async function fetchAllGlobalAuctionCalendars(
  daysAhead: number = 14,
  hubs?: ArtHub[]
): Promise<GlobalAuctionEvent[]> {
  const targetHubs = hubs || (['London', 'Paris', 'Hong_Kong', 'Los_Angeles', 'Geneva'] as ArtHub[]);

  console.log(`Fetching global auction calendars for hubs: ${targetHubs.join(', ')}`);

  const results = await Promise.all(
    targetHubs.map((hub) => fetchAuctionCalendarsForHub(hub, daysAhead))
  );

  const allEvents = results.flat();

  // Sort by date, then by tier
  allEvents.sort((a, b) => {
    const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateCompare !== 0) return dateCompare;
    if (a.tier !== b.tier) return a.tier === 'Mega' ? -1 : 1;
    return 0;
  });

  console.log(`Global: Found ${allEvents.length} total Blue Chip auctions across ${targetHubs.length} hubs`);

  return allEvents;
}

/**
 * Generate a localized auction story using Gemini
 */
export async function generateGlobalAuctionStory(
  event: GlobalAuctionEvent
): Promise<GlobalAuctionStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });
  const hubConfig = ART_HUBS[event.hub];

  // Format the auction date
  const auctionDate = new Date(event.date);
  const dateStr = auctionDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Build hub-specific context
  const hubContextMap: Record<ArtHub, string> = {
    London: `Tone: Traditional & Sharp. Reference 'Bond Street' or 'King Street'. Emphasize heritage, provenance, and the old auction house traditions. The collectors here value discretion and pedigree.`,
    Paris: `Tone: Chic & Intellectual. Reference 'Drouot' or 'Avenue Matignon'. Emphasize artistic significance, cultural heritage, and European sophistication. The collectors here appreciate art history and design legacy.`,
    Hong_Kong: `Tone: Fast-Paced & Investment Heavy. Reference the Convention Centre or Pacific Place. Emphasize market momentum, record prices, and cross-border collector interest. Asian collectors view art as both cultural and financial asset.`,
    Los_Angeles: `Tone: Hollywood Glamour & Contemporary Edge. Reference Beverly Hills or the Westside. Emphasize celebrity provenance, contemporary relevance, and California cool. Entertainment industry collectors set trends.`,
    Geneva: `Tone: Stealth Wealth. Reference the lakefront or Hotel des Bergues. Focus on rarity, craftsmanship, and investment-grade luxury (Patek Philippe, rare diamonds). Swiss collectors value discretion above all.`,
    New_York: `Tone: Power & Prestige. Reference York Avenue or Rockefeller Plaza. Emphasize market leadership, record-breaking lots, and global collector competition.`,
  };

  // House-specific flavor
  const houseStyle: Record<AuctionHouse, string> = {
    Sothebys: "Sotheby's brings centuries of expertise",
    Christies: "Christie's signature white-glove presentation",
    Phillips: "Phillips' contemporary edge and emerging categories",
  };

  // Build tier-specific guidance
  let toneGuidance: string;
  if (event.tier === 'Mega') {
    toneGuidance = `This is a MARQUEE SALE. Collectors fly in specifically for this. Emphasize prestige, rarity, and the "event" nature of the sale.`;
  } else {
    toneGuidance = `A solid sale for engaged collectors. Mention specific categories that might appeal to local tastes.`;
  }

  const systemPrompt = `You are the Art Market Editor for Flâneur in ${event.location}.

${hubContextMap[event.hub]}

Writing Style:
- ${toneGuidance}
- Reference the auction house's reputation
- Use the correct local currency symbol (${event.currencySymbol})
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
- Blue Chip Keywords: ${event.matchedKeywords.join(', ')}
- Regional Keywords: ${event.localizedKeywords.join(', ') || 'N/A'}

House Note: ${houseStyle[event.house]}
Reference Landmarks: ${hubConfig.landmarks.join(', ')}

Task: Write a 35-word blurb about this upcoming auction for local residents.

Headline Format: "Auction Alert: [House] brings [Title] to [City]."
Body: "The collectors are circling [Location/Landmark] for this key sale. Expect high interest in the [Specific Artist/Category] lots."

Return JSON:
{
  "headline": "Headline under 70 chars",
  "body": "35-word description for local collectors",
  "previewText": "One sentence teaser for feed",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 1-3 link candidates for key entities mentioned in the body (auction house, artists, categories).`;

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
    let body = parsed.body || `The collectors are circling ${event.location} for this key sale.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, { name: event.location, city: event.location });
    }

    return {
      eventId: event.eventId,
      headline: parsed.headline || `Auction Alert: ${event.house} brings ${event.title} to ${event.location}`,
      body,
      previewText: parsed.previewText || `${event.house} presents ${event.title}.`,
      house: event.house,
      tier: event.tier,
      auctionDate: event.date,
      generatedAt: new Date().toISOString(),
      hub: event.hub,
      currency: event.currency,
      targetFeeds: hubConfig.targetFeeds,
    };
  } catch (error) {
    console.error(`Global auction story generation error for ${event.hub}:`, error);
    return null;
  }
}

/**
 * Distribute a story to all target feeds for a hub
 */
export function distributeStory(story: GlobalAuctionStory): {
  story: GlobalAuctionStory;
  distributions: Array<{ neighborhoodId: string; slug: string }>;
} {
  const distributions: Array<{ neighborhoodId: string; slug: string }> = [];

  // Create a clean slug base
  const cleanEventId = story.eventId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 30);
  const baseSlug = `auction-${cleanEventId}`;

  // Distribute to each target feed
  for (const neighborhoodId of story.targetFeeds) {
    distributions.push({
      neighborhoodId,
      slug: `${baseSlug}-${neighborhoodId}`,
    });
  }

  return { story, distributions };
}

/**
 * Process all global auctions and generate stories
 */
export async function processGlobalAuctionCalendars(
  daysAhead: number = 14,
  hubs?: ArtHub[]
): Promise<{
  events: GlobalAuctionEvent[];
  stories: GlobalAuctionStory[];
  byHub: Record<ArtHub, number>;
  byHouse: Record<AuctionHouse, number>;
  byTier: Record<AuctionTier, number>;
  errors: string[];
}> {
  const targetHubs = hubs || (['London', 'Paris', 'Hong_Kong', 'Los_Angeles', 'Geneva'] as ArtHub[]);

  const errors: string[] = [];
  const stories: GlobalAuctionStory[] = [];
  const byHub: Record<ArtHub, number> = {
    London: 0,
    Paris: 0,
    Hong_Kong: 0,
    Los_Angeles: 0,
    Geneva: 0,
    New_York: 0,
  };
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
  const events = await fetchAllGlobalAuctionCalendars(daysAhead, targetHubs);

  // Count by hub, house, and tier
  for (const event of events) {
    byHub[event.hub]++;
    byHouse[event.house]++;
    byTier[event.tier]++;
  }

  if (events.length === 0) {
    return { events: [], stories: [], byHub, byHouse, byTier, errors: [] };
  }

  // Generate stories for top events per hub
  // Prioritize: All Mega tier, then top Standard per hub
  for (const hub of targetHubs) {
    const hubEvents = events.filter((e) => e.hub === hub);
    const megaEvents = hubEvents.filter((e) => e.tier === 'Mega').slice(0, 3);
    const standardEvents = hubEvents.filter((e) => e.tier === 'Standard').slice(0, 2);
    const topEvents = [...megaEvents, ...standardEvents];

    for (const event of topEvents) {
      try {
        const story = await generateGlobalAuctionStory(event);
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
  }

  return { events, stories, byHub, byHouse, byTier, errors };
}

/**
 * Create sample global auction events for testing
 */
export function createSampleGlobalAuctionEvents(): GlobalAuctionEvent[] {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dateStr = nextWeek.toISOString().split('T')[0];

  return [
    // London
    {
      eventId: 'sample-sothebys-london-1',
      house: 'Sothebys',
      title: 'Old Master Paintings Evening Sale',
      date: dateStr,
      location: 'London',
      tier: 'Mega',
      category: 'Old Masters',
      totalLots: 50,
      estimateRange: '£30M - £50M',
      url: 'https://www.sothebys.com',
      targetRegions: ART_HUBS.London.targetFeeds,
      matchedKeywords: ['evening sale'],
      hub: 'London',
      currency: 'GBP',
      currencySymbol: '£',
      localizedKeywords: ['old master'],
    },
    // Paris
    {
      eventId: 'sample-christies-paris-1',
      house: 'Christies',
      title: 'Art Nouveau et Design',
      date: dateStr,
      location: 'Paris',
      tier: 'Standard',
      category: 'Design',
      totalLots: 80,
      url: 'https://www.christies.com',
      targetRegions: ART_HUBS.Paris.targetFeeds,
      matchedKeywords: ['design'],
      hub: 'Paris',
      currency: 'EUR',
      currencySymbol: '€',
      localizedKeywords: ['design', 'art nouveau'],
    },
    // Hong Kong
    {
      eventId: 'sample-phillips-hk-1',
      house: 'Phillips',
      title: '20th Century & Contemporary Asian Art',
      date: dateStr,
      location: 'Hong Kong',
      tier: 'Mega',
      category: 'Contemporary Asian',
      totalLots: 120,
      estimateRange: 'HK$200M - HK$300M',
      url: 'https://www.phillips.com',
      targetRegions: ART_HUBS.Hong_Kong.targetFeeds,
      matchedKeywords: ['20th century', 'contemporary'],
      hub: 'Hong_Kong',
      currency: 'HKD',
      currencySymbol: 'HK$',
      localizedKeywords: ['20th century', 'contemporary asian'],
    },
    // Geneva
    {
      eventId: 'sample-christies-geneva-1',
      house: 'Christies',
      title: 'Magnificent Jewels and Rare Watches',
      date: dateStr,
      location: 'Geneva',
      tier: 'Mega',
      category: 'Watches & Jewels',
      totalLots: 150,
      estimateRange: 'CHF 50M - CHF 80M',
      url: 'https://www.christies.com',
      targetRegions: ART_HUBS.Geneva.targetFeeds,
      matchedKeywords: ['magnificent', 'jewels', 'watches'],
      hub: 'Geneva',
      currency: 'CHF',
      currencySymbol: 'CHF ',
      localizedKeywords: ['jewels', 'watches'],
    },
    // Los Angeles
    {
      eventId: 'sample-sothebys-la-1',
      house: 'Sothebys',
      title: 'Contemporary Art Los Angeles',
      date: dateStr,
      location: 'Los Angeles',
      tier: 'Standard',
      category: 'Contemporary',
      totalLots: 60,
      url: 'https://www.sothebys.com',
      targetRegions: ART_HUBS.Los_Angeles.targetFeeds,
      matchedKeywords: ['contemporary'],
      hub: 'Los_Angeles',
      currency: 'USD',
      currencySymbol: '$',
      localizedKeywords: ['contemporary', 'california art'],
    },
  ];
}
