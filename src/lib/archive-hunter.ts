/**
 * Archive Hunter Service
 *
 * Monitors the in-store inventory of high-end resale boutiques
 * to alert residents when "Investment Grade" pieces arrive.
 *
 * Strategy: "Digital to Physical"
 * - Focus on specific neighborhood stores, not entire internet
 * - Filter for trophy items ($3,000+)
 * - Alert collectors before items sell online
 *
 * Target Resellers:
 * - The RealReal (Madison Ave, SoHo, Melrose, Westbourne Grove)
 * - What Goes Around Comes Around (SoHo, Beverly Hills)
 * - Rebag (SoHo, Miami)
 * - Fashionphile (Chelsea, Carlsbad)
 *
 * Schedule: Twice daily at 9 AM and 5 PM UTC
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_MODELS } from '@/config/ai-models';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { grokEventSearch } from '@/lib/grok';

// ============================================================================
// TYPES
// ============================================================================

export type ResaleStore =
  | 'TheRealReal'
  | 'WhatGoesAroundComesAround'
  | 'Rebag'
  | 'Fashionphile'
  | 'Vestiaire'
  | 'TheVintageBar';

export type LuxuryCategory = 'Handbags' | 'Watches' | 'Jewelry' | 'RTW' | 'Accessories';

export interface StoreLocation {
  id: string;
  store: ResaleStore;
  name: string;
  address: string;
  city: string;
  neighborhoodId: string;
  inventoryUrl: string;
  newArrivalsUrl?: string;
}

export interface ArchiveItem {
  id: string;
  brand: string;
  name: string;
  category: LuxuryCategory;
  price: number;
  currency: string;
  condition: string;
  description?: string;
  imageUrl?: string;
  itemUrl: string;
  storeLocation: StoreLocation;
  dateAdded: Date;
  isRare: boolean;
  investmentGrade: boolean;
}

export interface ArchiveStory {
  item: ArchiveItem;
  headline: string;
  body: string;
  previewText: string;
  categoryLabel: string;
  targetNeighborhoods: string[];
  priority: 'urgent' | 'high' | 'normal';
}

// ============================================================================
// BRAND WHITELIST (Investment Grade Only)
// ============================================================================

export const INVESTMENT_BRANDS: Record<string, { pattern: RegExp; tier: 'Grail' | 'Investment' | 'Collectible' }> = {
  // Grail Tier - Always newsworthy, immediate alert
  'Hermès': { pattern: /herm[eè]s/i, tier: 'Grail' },
  'Chanel': { pattern: /\bchanel\b/i, tier: 'Grail' },
  'Rolex': { pattern: /\brolex\b/i, tier: 'Grail' },
  'Patek Philippe': { pattern: /patek\s*philippe/i, tier: 'Grail' },
  'Audemars Piguet': { pattern: /audemars\s*piguet|AP\s*Royal/i, tier: 'Grail' },

  // Investment Tier - High value, strong resale
  'Louis Vuitton': { pattern: /louis\s*vuitton|\blv\b/i, tier: 'Investment' },
  'Cartier': { pattern: /\bcartier\b/i, tier: 'Investment' },
  'Van Cleef & Arpels': { pattern: /van\s*cleef/i, tier: 'Investment' },
  'Goyard': { pattern: /\bgoyard\b/i, tier: 'Investment' },
  'Dior': { pattern: /\bdior\b/i, tier: 'Investment' },
  'Bottega Veneta': { pattern: /bottega\s*veneta/i, tier: 'Investment' },
  'The Row': { pattern: /the\s*row/i, tier: 'Investment' },
  'Omega': { pattern: /\bomega\b/i, tier: 'Investment' },
  'Tudor': { pattern: /\btudor\b/i, tier: 'Investment' },

  // Collectible Tier - Vintage/rare pieces have value
  'Celine': { pattern: /\bc[eé]line\b/i, tier: 'Collectible' },
  'Prada': { pattern: /\bprada\b/i, tier: 'Collectible' },
  'Gucci': { pattern: /\bgucci\b/i, tier: 'Collectible' },
  'Fendi': { pattern: /\bfendi\b/i, tier: 'Collectible' },
  'Bulgari': { pattern: /\bbulgari\b|\bbvlgari\b/i, tier: 'Collectible' },
  'Tiffany': { pattern: /\btiffany\b/i, tier: 'Collectible' },
  'Valentino': { pattern: /\bvalentino\b/i, tier: 'Collectible' },
  'Balenciaga': { pattern: /\bbalenciaga\b/i, tier: 'Collectible' },
  'Loewe': { pattern: /\bloewe\b/i, tier: 'Collectible' },
};

// Specific rare items that are always newsworthy
const GRAIL_ITEMS = [
  /birkin/i,
  /kelly\s*\d+/i,
  /constance/i,
  /picotin/i,
  /daytona/i,
  /submariner/i,
  /nautilus/i,
  /royal\s*oak/i,
  /boy\s*bag/i,
  /classic\s*flap/i,
  /2\.55/i,
  /speedy/i,
  /neverfull/i,
  /capucines/i,
  /alhambra/i,
  /juste\s*un\s*clou/i,
  /love\s*bracelet/i,
  /tank/i,
  /santos/i,
];

// Price thresholds
export const TROPHY_PRICE_THRESHOLD = 3000; // $3,000 minimum
export const GRAIL_PRICE_THRESHOLD = 10000; // $10,000 for grail tier

// ============================================================================
// STORE LOCATIONS
// ============================================================================

export const STORE_LOCATIONS: StoreLocation[] = [
  // The RealReal
  {
    id: 'trr-soho',
    store: 'TheRealReal',
    name: 'The RealReal SoHo',
    address: '80 Wooster St',
    city: 'New York',
    neighborhoodId: 'nyc-soho',
    inventoryUrl: 'https://www.therealreal.com/locations/soho',
    newArrivalsUrl: 'https://www.therealreal.com/shop/new-arrivals?store=soho',
  },
  {
    id: 'trr-madison',
    store: 'TheRealReal',
    name: 'The RealReal Madison Avenue',
    address: '1128 Madison Ave',
    city: 'New York',
    neighborhoodId: 'nyc-upper-east-side',
    inventoryUrl: 'https://www.therealreal.com/locations/madison-avenue',
    newArrivalsUrl: 'https://www.therealreal.com/shop/new-arrivals?store=madison',
  },
  {
    id: 'trr-melrose',
    store: 'TheRealReal',
    name: 'The RealReal Melrose',
    address: '8500 Melrose Ave',
    city: 'Los Angeles',
    neighborhoodId: 'la-west-hollywood',
    inventoryUrl: 'https://www.therealreal.com/locations/melrose',
    newArrivalsUrl: 'https://www.therealreal.com/shop/new-arrivals?store=melrose',
  },
  {
    id: 'trr-westbourne',
    store: 'TheRealReal',
    name: 'The RealReal Westbourne Grove',
    address: '190 Westbourne Grove',
    city: 'London',
    neighborhoodId: 'london-notting-hill',
    inventoryUrl: 'https://www.therealreal.com/locations/westbourne-grove',
    newArrivalsUrl: 'https://www.therealreal.com/shop/new-arrivals?store=westbourne',
  },
  {
    id: 'trr-sf',
    store: 'TheRealReal',
    name: 'The RealReal San Francisco',
    address: '253 Post St',
    city: 'San Francisco',
    neighborhoodId: 'sf-union-square',
    inventoryUrl: 'https://www.therealreal.com/locations/san-francisco',
    newArrivalsUrl: 'https://www.therealreal.com/shop/new-arrivals?store=sf',
  },

  // What Goes Around Comes Around
  {
    id: 'wgaca-soho',
    store: 'WhatGoesAroundComesAround',
    name: 'What Goes Around Comes Around SoHo',
    address: '351 West Broadway',
    city: 'New York',
    neighborhoodId: 'nyc-soho',
    inventoryUrl: 'https://www.whatgoesaroundnyc.com/store/soho',
    newArrivalsUrl: 'https://www.whatgoesaroundnyc.com/new-arrivals?store=soho',
  },
  {
    id: 'wgaca-beverly',
    store: 'WhatGoesAroundComesAround',
    name: 'What Goes Around Comes Around Beverly Hills',
    address: '320 N Beverly Dr',
    city: 'Los Angeles',
    neighborhoodId: 'la-beverly-hills',
    inventoryUrl: 'https://www.whatgoesaroundnyc.com/store/beverly-hills',
    newArrivalsUrl: 'https://www.whatgoesaroundnyc.com/new-arrivals?store=beverly',
  },

  // Rebag
  {
    id: 'rebag-soho',
    store: 'Rebag',
    name: 'Rebag SoHo',
    address: '137 Spring St',
    city: 'New York',
    neighborhoodId: 'nyc-soho',
    inventoryUrl: 'https://www.rebag.com/stores/soho',
    newArrivalsUrl: 'https://www.rebag.com/shop/new-arrivals?store=soho',
  },
  {
    id: 'rebag-madison',
    store: 'Rebag',
    name: 'Rebag Madison Avenue',
    address: '1007 Madison Ave',
    city: 'New York',
    neighborhoodId: 'nyc-upper-east-side',
    inventoryUrl: 'https://www.rebag.com/stores/madison',
    newArrivalsUrl: 'https://www.rebag.com/shop/new-arrivals?store=madison',
  },
  {
    id: 'rebag-miami',
    store: 'Rebag',
    name: 'Rebag Miami Design District',
    address: '3930 NE 2nd Ave',
    city: 'Miami',
    neighborhoodId: 'miami-design-district',
    inventoryUrl: 'https://www.rebag.com/stores/miami',
    newArrivalsUrl: 'https://www.rebag.com/shop/new-arrivals?store=miami',
  },
  {
    id: 'rebag-la',
    store: 'Rebag',
    name: 'Rebag West Hollywood',
    address: '8500 Sunset Blvd',
    city: 'Los Angeles',
    neighborhoodId: 'la-west-hollywood',
    inventoryUrl: 'https://www.rebag.com/stores/west-hollywood',
    newArrivalsUrl: 'https://www.rebag.com/shop/new-arrivals?store=weho',
  },

  // Fashionphile
  {
    id: 'fashionphile-chelsea',
    store: 'Fashionphile',
    name: 'Fashionphile at Neiman Marcus',
    address: '20 Hudson Yards',
    city: 'New York',
    neighborhoodId: 'nyc-hudson-yards',
    inventoryUrl: 'https://www.fashionphile.com/stores/neiman-marcus-hudson-yards',
    newArrivalsUrl: 'https://www.fashionphile.com/shop/new-arrivals?location=hudson-yards',
  },
  {
    id: 'fashionphile-beverly',
    store: 'Fashionphile',
    name: 'Fashionphile at Neiman Marcus Beverly Hills',
    address: '9700 Wilshire Blvd',
    city: 'Los Angeles',
    neighborhoodId: 'la-beverly-hills',
    inventoryUrl: 'https://www.fashionphile.com/stores/neiman-marcus-beverly-hills',
    newArrivalsUrl: 'https://www.fashionphile.com/shop/new-arrivals?location=beverly',
  },

  // Vestiaire Collective (Pop-ups)
  {
    id: 'vestiaire-selfridges',
    store: 'Vestiaire',
    name: 'Vestiaire at Selfridges',
    address: '400 Oxford St',
    city: 'London',
    neighborhoodId: 'london-mayfair',
    inventoryUrl: 'https://www.vestiairecollective.com/stores/selfridges',
    newArrivalsUrl: 'https://www.vestiairecollective.com/new-arrivals?store=selfridges',
  },
];

// ============================================================================
// INVENTORY SEARCH (via Grok)
// ============================================================================

/**
 * Scrape inventory for a specific store location using Grok web search
 */
export async function scrapeStoreInventory(location: StoreLocation): Promise<ArchiveItem[]> {
  const brandNames = Object.keys(INVESTMENT_BRANDS).join(', ');

  const systemPrompt = `You are a luxury resale market researcher. Search the web for notable rare or investment-grade vintage luxury items recently listed at ${location.name} (${location.address}, ${location.city}). Focus on high-value items from brands like ${brandNames}.

Return ONLY a JSON array (no markdown, no explanation). Each object must have:
- brand: string (brand name)
- name: string (item name, e.g. "Birkin 25 Togo Gold Hardware")
- category: "Handbags" | "Watches" | "Jewelry" | "RTW" | "Accessories"
- price: number (price in USD)
- condition: string (e.g. "Excellent", "Very Good")
- description: string or null
- itemUrl: string or null

If no notable items are found, return an empty array: []`;

  const userPrompt = `Search for notable rare or investment-grade luxury items recently listed or available at ${location.name} in ${location.city}. Focus on Hermès Birkin/Kelly, Chanel Classic Flap, Rolex Submariner/Daytona, Patek Philippe Nautilus, Cartier Love/Juste un Clou, Van Cleef Alhambra, and other grail-tier items priced over $3,000. Check ${location.inventoryUrl} and related listings.`;

  console.log(`Searching Grok for inventory at ${location.name}...`);
  const raw = await grokEventSearch(systemPrompt, userPrompt);
  if (!raw) return [];

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      brand: string;
      name?: string;
      category?: string;
      price?: number;
      condition?: string;
      description?: string | null;
      itemUrl?: string | null;
    }>;

    const items: ArchiveItem[] = [];

    for (const p of parsed) {
      if (!p.brand || !p.name || !p.price) continue;

      // Validate against investment brands
      const brandEntry = Object.entries(INVESTMENT_BRANDS).find(([, config]) =>
        config.pattern.test(p.brand)
      );
      if (!brandEntry) continue;

      const [brandName, brandConfig] = brandEntry;
      const price = p.price;

      // Check minimum price threshold
      if (price < TROPHY_PRICE_THRESHOLD) continue;

      // Check if it's a grail item
      const isRare = GRAIL_ITEMS.some(pattern => pattern.test(p.name || ''));
      const investmentGrade = brandConfig.tier === 'Grail' || (brandConfig.tier === 'Investment' && price >= GRAIL_PRICE_THRESHOLD) || isRare;

      const validCategories: LuxuryCategory[] = ['Handbags', 'Watches', 'Jewelry', 'RTW', 'Accessories'];
      const category = validCategories.includes(p.category as LuxuryCategory)
        ? p.category as LuxuryCategory : 'Accessories';

      items.push({
        id: `grok-${location.id}-${brandName.replace(/\W/g, '-').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        brand: brandName,
        name: p.name,
        category,
        price,
        currency: 'USD',
        condition: p.condition || 'Good',
        description: p.description || undefined,
        itemUrl: p.itemUrl || location.inventoryUrl,
        storeLocation: location,
        dateAdded: new Date(),
        isRare,
        investmentGrade,
      });
    }

    console.log(`Grok ${location.name}: Found ${items.length} investment-grade items`);
    return items;
  } catch (error) {
    console.error(`Error parsing Grok response for ${location.name}:`, error);
    return [];
  }
}

// ============================================================================
// GEMINI STORY GENERATION
// ============================================================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const ARCHIVE_SYSTEM_PROMPT = `You are the Shopping Editor for Flâneur, a luxury neighborhood news platform.

Your tone is "Urgent" - informing collectors about rare finds before they sell.

Rules:
1. Emphasize the physical availability (it's ON THE FLOOR, not just online)
2. Create urgency without being pushy
3. Reference the specific store and neighborhood
4. Mention condition and rarity if known
5. Never use excessive exclamation marks or ALL CAPS
6. Be knowledgeable about luxury goods

Format: Return JSON with "headline" and "body" keys.`;

export async function generateArchiveStory(item: ArchiveItem): Promise<ArchiveStory | null> {
  try {
    const model = genAI.getGenerativeModel({ model: AI_MODELS.GEMINI_FLASH });

    // Get neighborhood name
    const neighborhoodName = item.storeLocation.neighborhoodId
      .replace(/^(nyc|la|london|sf|miami)-/, '')
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const brandTier = INVESTMENT_BRANDS[item.brand]?.tier || 'Collectible';

    const prompt = `You are the Shopping Editor for Flâneur in ${neighborhoodName}.

Item Details:
- Brand: ${item.brand}
- Item: ${item.name}
- Category: ${item.category}
- Price: $${item.price.toLocaleString()}
- Condition: ${item.condition}
- Rarity: ${item.isRare ? 'Rare/Collectible' : 'Standard'}
- Investment Grade: ${item.investmentGrade ? 'Yes' : 'No'}

Store:
- Name: ${item.storeLocation.name}
- Address: ${item.storeLocation.address}
- Neighborhood: ${neighborhoodName}

Context:
- This ${brandTier === 'Grail' ? 'grail-tier' : 'investment-grade'} piece just landed physically in the local shop
- Audience: Collectors who want to grab it before it sells online
- Tone: 'Urgent' but sophisticated

Task: Write a 30-word blurb for ${neighborhoodName} residents.
Headline format: 'Archive Alert: ${item.brand} [ItemName] lands at ${item.storeLocation.name}'

Return JSON: { "headline": "...", "body": "...", "link_candidates": [{"text": "exact text from body"}] }

Include 1-2 link candidates for key entities mentioned in the body (brand, store, item name).`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: ARCHIVE_SYSTEM_PROMPT,
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
      const cityName = item.storeLocation.city.replace(/_/g, ' ');
      body = injectHyperlinks(body, linkCandidates, { name: neighborhoodName, city: cityName });
    }

    // Determine priority
    let priority: 'urgent' | 'high' | 'normal' = 'normal';
    if (brandTier === 'Grail' || (item.isRare && item.price >= GRAIL_PRICE_THRESHOLD)) {
      priority = 'urgent';
    } else if (item.investmentGrade) {
      priority = 'high';
    }

    return {
      item,
      headline: parsed.headline,
      body,
      previewText: parsed.body.substring(0, 100) + '...',
      categoryLabel: `Archive Alert • ${item.category}`,
      targetNeighborhoods: [item.storeLocation.neighborhoodId],
      priority,
    };
  } catch (error) {
    console.error('Error generating archive story:', error);
    return null;
  }
}

// ============================================================================
// MAIN PROCESSING PIPELINE
// ============================================================================

export interface ProcessResult {
  storesScanned: number;
  itemsFound: number;
  investmentGradeCount: number;
  storiesGenerated: number;
  byStore: Record<string, number>;
  byBrand: Record<string, number>;
  byCategory: Record<string, number>;
  stories: ArchiveStory[];
  errors: string[];
}

/**
 * Process all store locations and generate archive alerts
 */
export async function processArchiveHunter(): Promise<ProcessResult> {
  const result: ProcessResult = {
    storesScanned: 0,
    itemsFound: 0,
    investmentGradeCount: 0,
    storiesGenerated: 0,
    byStore: {},
    byBrand: {},
    byCategory: {},
    stories: [],
    errors: [],
  };

  for (const location of STORE_LOCATIONS) {
    try {
      console.log(`Scanning ${location.name}...`);
      result.storesScanned++;

      const items = await scrapeStoreInventory(location);
      result.itemsFound += items.length;
      result.byStore[location.store] = (result.byStore[location.store] || 0) + items.length;

      // Filter to investment grade only for stories
      const investmentItems = items.filter((item) => item.investmentGrade);
      result.investmentGradeCount += investmentItems.length;

      for (const item of investmentItems) {
        // Track by brand and category
        result.byBrand[item.brand] = (result.byBrand[item.brand] || 0) + 1;
        result.byCategory[item.category] = (result.byCategory[item.category] || 0) + 1;

        // Generate story
        const story = await generateArchiveStory(item);
        if (story) {
          result.stories.push(story);
          result.storiesGenerated++;
        }
      }
    } catch (error) {
      result.errors.push(`${location.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

// ============================================================================
// SAMPLE DATA FOR TESTING
// ============================================================================

export function createSampleItems(): ArchiveItem[] {
  return [
    {
      id: 'sample-1',
      brand: 'Hermès',
      name: 'Birkin 25 Togo Gold Hardware',
      category: 'Handbags',
      price: 18500,
      currency: 'USD',
      condition: 'Excellent',
      description: 'Rare colorway, excellent condition, original receipt',
      itemUrl: 'https://www.therealreal.com/products/sample',
      storeLocation: STORE_LOCATIONS[0], // TRR SoHo
      dateAdded: new Date(),
      isRare: true,
      investmentGrade: true,
    },
    {
      id: 'sample-2',
      brand: 'Rolex',
      name: 'Submariner Date 126610LN',
      category: 'Watches',
      price: 14500,
      currency: 'USD',
      condition: 'Unworn',
      description: 'Full set, 2023 card',
      itemUrl: 'https://www.fashionphile.com/products/sample',
      storeLocation: STORE_LOCATIONS.find((s) => s.id === 'fashionphile-chelsea')!,
      dateAdded: new Date(),
      isRare: true,
      investmentGrade: true,
    },
    {
      id: 'sample-3',
      brand: 'Chanel',
      name: 'Classic Flap Medium Caviar Black',
      category: 'Handbags',
      price: 8900,
      currency: 'USD',
      condition: 'Very Good',
      description: 'Gold hardware, card included',
      itemUrl: 'https://www.whatgoesaroundnyc.com/products/sample',
      storeLocation: STORE_LOCATIONS.find((s) => s.id === 'wgaca-soho')!,
      dateAdded: new Date(),
      isRare: true,
      investmentGrade: true,
    },
    {
      id: 'sample-4',
      brand: 'Van Cleef & Arpels',
      name: 'Alhambra 20 Motif Necklace',
      category: 'Jewelry',
      price: 32000,
      currency: 'USD',
      condition: 'Excellent',
      description: 'Yellow gold, mother of pearl',
      itemUrl: 'https://www.rebag.com/products/sample',
      storeLocation: STORE_LOCATIONS.find((s) => s.id === 'rebag-madison')!,
      dateAdded: new Date(),
      isRare: true,
      investmentGrade: true,
    },
  ];
}
