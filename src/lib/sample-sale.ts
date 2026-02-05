/**
 * Sample Sale Service
 *
 * Scrapes fashion event aggregators to alert residents about high-end
 * sample sales and trunk shows. Time-sensitive events (3-4 days).
 *
 * Strategy: "Insider Access"
 * - Strictly filter for luxury brands to avoid clutter
 * - Time-sensitive alerts (sample sales are short-lived)
 * - "Secret Intel" tone - fashion-conscious audience loves a deal
 *
 * Data Sources:
 * - Chicmi (Global - London/NY/LA/Paris)
 * - 260 Sample Sale (US - NYC)
 * - Arlettie (Paris/London - often "Invite Only")
 * - The Outnet Sample Sales
 * - Gilt City
 *
 * Brand Filter: Reuses LUXURY_BRANDS from retail-watch.ts
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

export type SaleSource = 'Chicmi' | '260_Sample_Sale' | 'Arlettie' | 'The_Outnet' | 'Gilt' | 'Sample_Sale_Guide';

export type SaleCity = 'New_York' | 'London' | 'Paris' | 'Los_Angeles' | 'Milan';

export type SaleType = 'sample_sale' | 'trunk_show' | 'warehouse_sale' | 'private_sale' | 'flash_sale';

export interface SourceConfig {
  name: string;
  source: SaleSource;
  baseUrl: string;
  city: SaleCity;
  selectors?: {
    container: string;
    title: string;
    dates: string;
    location: string;
    brand?: string;
  };
}

export interface DetectedSale {
  id: string;
  source: SaleSource;
  sourceDisplayName: string;
  city: SaleCity;
  brand: string;
  brandTier: 'Ultra' | 'Aspirational';
  brandCategory: string;
  title: string;
  venue: string;
  venueAddress?: string;
  neighborhood?: string;
  neighborhoodId?: string;
  startDate: Date;
  endDate: Date;
  saleType: SaleType;
  discount?: string; // e.g., "Up to 80% off"
  isInviteOnly: boolean;
  url?: string;
}

export interface SampleSaleStory {
  sale: DetectedSale;
  headline: string;
  body: string;
  previewText: string;
  targetNeighborhoods: string[];
  categoryLabel: string;
  generatedAt: string;
}

export interface SampleSaleProcessResult {
  sourcesScraped: number;
  salesDetected: number;
  salesMatched: number;
  storiesGenerated: number;
  bySource: Record<string, number>;
  byCity: Record<string, number>;
  byBrandTier: Record<string, number>;
  stories: SampleSaleStory[];
  errors: string[];
}

// =============================================================================
// LUXURY BRAND CONFIGURATION (Imported from retail-watch concept)
// =============================================================================

export interface LuxuryBrand {
  name: string;
  pattern: RegExp;
  category: string;
  tier: 'Ultra' | 'Aspirational';
  aliases?: string[];
}

/**
 * Luxury brands whitelist - only these brands trigger sample sale alerts
 * Categories: Fashion, Accessories, Beauty, Home
 */
export const LUXURY_BRANDS: LuxuryBrand[] = [
  // Fashion - Ultra Tier (Heritage Luxury)
  { name: 'Hermès', pattern: /herm[eè]s/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Chanel', pattern: /chanel/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Louis Vuitton', pattern: /louis\s*vuitton|vuitton|\blv\b/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Gucci', pattern: /gucci/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Prada', pattern: /prada/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Dior', pattern: /\bdior\b/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Celine', pattern: /celine|céline/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Saint Laurent', pattern: /saint\s*laurent|ysl/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Bottega Veneta', pattern: /bottega\s*veneta/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Loewe', pattern: /loewe/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Valentino', pattern: /valentino/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Balenciaga', pattern: /balenciaga/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Givenchy', pattern: /givenchy/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Burberry', pattern: /burberry/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Fendi', pattern: /fendi/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'The Row', pattern: /the\s*row/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Loro Piana', pattern: /loro\s*piana/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Brunello Cucinelli', pattern: /brunello\s*cucinelli|cucinelli/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Max Mara', pattern: /max\s*mara/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Miu Miu', pattern: /miu\s*miu/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Alexander McQueen', pattern: /alexander\s*mcqueen|mcqueen/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Stella McCartney', pattern: /stella\s*mccartney/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Proenza Schouler', pattern: /proenza\s*schouler/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Gabriela Hearst', pattern: /gabriela\s*hearst/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Jil Sander', pattern: /jil\s*sander/i, category: 'Fashion', tier: 'Ultra' },

  // Fashion - Aspirational Tier (Contemporary Luxury)
  { name: 'Kith', pattern: /\bkith\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Aimé Leon Dore', pattern: /aim[eé]\s*leon\s*dore|\bald\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Fear of God', pattern: /fear\s*of\s*god/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Off-White', pattern: /off[\s-]*white/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Acne Studios', pattern: /acne\s*studios/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Isabel Marant', pattern: /isabel\s*marant/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Zimmermann', pattern: /zimmermann/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Ulla Johnson', pattern: /ulla\s*johnson/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Veronica Beard', pattern: /veronica\s*beard/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Rag & Bone', pattern: /rag\s*[&and]+\s*bone/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Vince', pattern: /\bvince\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Theory', pattern: /\btheory\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Equipment', pattern: /\bequipment\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Reformation', pattern: /reformation/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Staud', pattern: /\bstaud\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Ganni', pattern: /\bganni\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Totême', pattern: /tot[eê]me/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Nanushka', pattern: /nanushka/i, category: 'Fashion', tier: 'Aspirational' },

  // Shoes - Ultra Tier
  { name: 'Manolo Blahnik', pattern: /manolo\s*blahnik|manolo/i, category: 'Shoes', tier: 'Ultra' },
  { name: 'Christian Louboutin', pattern: /louboutin/i, category: 'Shoes', tier: 'Ultra' },
  { name: 'Jimmy Choo', pattern: /jimmy\s*choo/i, category: 'Shoes', tier: 'Ultra' },
  { name: 'Gianvito Rossi', pattern: /gianvito\s*rossi/i, category: 'Shoes', tier: 'Ultra' },
  { name: 'Aquazzura', pattern: /aquazzura/i, category: 'Shoes', tier: 'Ultra' },
  { name: 'Roger Vivier', pattern: /roger\s*vivier/i, category: 'Shoes', tier: 'Ultra' },
  { name: 'Amina Muaddi', pattern: /amina\s*muaddi/i, category: 'Shoes', tier: 'Ultra' },

  // Accessories - Ultra Tier
  { name: 'Goyard', pattern: /goyard/i, category: 'Accessories', tier: 'Ultra' },
  { name: 'Moynat', pattern: /moynat/i, category: 'Accessories', tier: 'Ultra' },
  { name: 'Delvaux', pattern: /delvaux/i, category: 'Accessories', tier: 'Ultra' },
  { name: 'Anya Hindmarch', pattern: /anya\s*hindmarch/i, category: 'Accessories', tier: 'Ultra' },

  // Jewelry & Watches
  { name: 'Cartier', pattern: /cartier/i, category: 'Jewelry', tier: 'Ultra' },
  { name: 'Van Cleef & Arpels', pattern: /van\s*cleef/i, category: 'Jewelry', tier: 'Ultra' },
  { name: 'Bulgari', pattern: /bulgari|bvlgari/i, category: 'Jewelry', tier: 'Ultra' },
  { name: 'Tiffany', pattern: /tiffany/i, category: 'Jewelry', tier: 'Ultra' },
  { name: 'David Yurman', pattern: /david\s*yurman/i, category: 'Jewelry', tier: 'Aspirational' },
  { name: 'Monica Vinader', pattern: /monica\s*vinader/i, category: 'Jewelry', tier: 'Aspirational' },

  // Beauty & Fragrance
  { name: 'La Mer', pattern: /la\s*mer/i, category: 'Beauty', tier: 'Ultra' },
  { name: 'La Prairie', pattern: /la\s*prairie/i, category: 'Beauty', tier: 'Ultra' },
  { name: 'Sisley', pattern: /sisley/i, category: 'Beauty', tier: 'Ultra' },
  { name: 'Augustinus Bader', pattern: /augustinus\s*bader/i, category: 'Beauty', tier: 'Ultra' },
  { name: 'Creed', pattern: /\bcreed\b/i, category: 'Fragrance', tier: 'Ultra' },
  { name: 'Maison Francis Kurkdjian', pattern: /kurkdjian|mfk/i, category: 'Fragrance', tier: 'Ultra' },
  { name: 'Byredo', pattern: /byredo/i, category: 'Fragrance', tier: 'Aspirational' },
  { name: 'Le Labo', pattern: /le\s*labo/i, category: 'Fragrance', tier: 'Aspirational' },
  { name: 'Diptyque', pattern: /diptyque/i, category: 'Fragrance', tier: 'Aspirational' },
  { name: 'Aesop', pattern: /\baesop\b/i, category: 'Beauty', tier: 'Aspirational' },

  // Home & Lifestyle
  { name: 'Frette', pattern: /frette/i, category: 'Home', tier: 'Ultra' },
  { name: 'Pratesi', pattern: /pratesi/i, category: 'Home', tier: 'Ultra' },
  { name: 'Sferra', pattern: /sferra/i, category: 'Home', tier: 'Aspirational' },
  { name: 'Matouk', pattern: /matouk/i, category: 'Home', tier: 'Aspirational' },
];

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Sample sale source configurations
 */
export const SAMPLE_SALE_SOURCES: SourceConfig[] = [
  {
    name: 'Chicmi NYC',
    source: 'Chicmi',
    baseUrl: 'https://www.chicmi.com/new-york/sample-sales/',
    city: 'New_York',
  },
  {
    name: 'Chicmi London',
    source: 'Chicmi',
    baseUrl: 'https://www.chicmi.com/london/sample-sales/',
    city: 'London',
  },
  {
    name: 'Chicmi Los Angeles',
    source: 'Chicmi',
    baseUrl: 'https://www.chicmi.com/los-angeles/sample-sales/',
    city: 'Los_Angeles',
  },
  {
    name: 'Chicmi Paris',
    source: 'Chicmi',
    baseUrl: 'https://www.chicmi.com/paris/sample-sales/',
    city: 'Paris',
  },
  {
    name: '260 Sample Sale',
    source: '260_Sample_Sale',
    baseUrl: 'https://260samplesale.com/',
    city: 'New_York',
  },
  {
    name: 'Arlettie Paris',
    source: 'Arlettie',
    baseUrl: 'https://www.arlettie.com/',
    city: 'Paris',
  },
  {
    name: 'Arlettie London',
    source: 'Arlettie',
    baseUrl: 'https://www.arlettie.com/',
    city: 'London',
  },
];

/**
 * City to Flâneur neighborhood mapping
 */
export const CITY_NEIGHBORHOODS: Record<SaleCity, string[]> = {
  New_York: [
    'nyc-upper-east-side',
    'nyc-upper-west-side',
    'nyc-tribeca',
    'nyc-west-village',
    'nyc-greenwich-village',
    'nyc-soho',
    'nyc-chelsea',
    'nyc-hudson-yards',
    'nyc-meatpacking',
    'nyc-fidi',
  ],
  London: [
    'london-mayfair',
    'london-chelsea',
    'london-kensington',
    'london-notting-hill',
    'london-hampstead',
    'london-shoreditch',
  ],
  Paris: [
    'paris-7th-arrondissement',
    'paris-16th-arrondissement',
    'paris-le-marais',
    'paris-saint-germain',
  ],
  Los_Angeles: [
    'la-beverly-hills',
    'la-bel-air',
    'la-pacific-palisades',
    'la-santa-monica',
    'la-west-hollywood',
  ],
  Milan: ['milan-brera', 'milan-quadrilatero'],
};

/**
 * Neighborhood patterns for venue address matching
 */
export const NEIGHBORHOOD_PATTERNS: Record<string, RegExp[]> = {
  // NYC
  'nyc-soho': [/\bsoho\b/i, /spring\s*st/i, /prince\s*st/i, /broome\s*st/i, /greene\s*st/i],
  'nyc-chelsea': [/\bchelsea\b/i, /west\s*2[0-9](th|st|nd|rd)/i, /260\s*5th\s*ave/i],
  'nyc-tribeca': [/tribeca/i, /hudson\s*st/i, /canal\s*st/i],
  'nyc-meatpacking': [/meatpacking/i, /gansevoort/i, /14th\s*st.*9th\s*ave/i],
  'nyc-upper-east-side': [/upper\s*east/i, /\bues\b/i, /madison\s*ave/i],
  'nyc-west-village': [/west\s*village/i, /bleecker/i],

  // London
  'london-mayfair': [/mayfair/i, /bond\s*st/i, /dover\s*st/i],
  'london-chelsea': [/\bchelsea\b/i, /kings?\s*road/i],
  'london-shoreditch': [/shoreditch/i, /hoxton/i, /brick\s*lane/i],

  // Paris
  'paris-le-marais': [/marais/i, /rue\s*de\s*turenne/i],
  'paris-saint-germain': [/saint[\s-]*germain/i, /rive\s*gauche/i],

  // LA
  'la-beverly-hills': [/beverly\s*hills/i, /rodeo/i],
  'la-west-hollywood': [/west\s*hollywood/i, /weho/i, /melrose/i],
};

// =============================================================================
// BRAND MATCHING
// =============================================================================

/**
 * Match text against luxury brands whitelist
 */
export function matchBrand(text: string): LuxuryBrand | null {
  for (const brand of LUXURY_BRANDS) {
    if (brand.pattern.test(text)) {
      return brand;
    }
  }
  return null;
}

/**
 * Check if a sale title contains a luxury brand
 */
export function isLuxuryBrandSale(title: string): { isLuxury: boolean; brand: LuxuryBrand | null } {
  const brand = matchBrand(title);
  return {
    isLuxury: brand !== null,
    brand,
  };
}

// =============================================================================
// WEB SCRAPING
// =============================================================================

/**
 * Scrape Chicmi sample sales
 */
export async function scrapeChicmi(config: SourceConfig): Promise<DetectedSale[]> {
  const sales: DetectedSale[] = [];

  try {
    const response = await fetch(config.baseUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.log(`Chicmi fetch failed for ${config.city}:`, response.status);
      return [];
    }

    const html = await response.text();

    // Extract sale entries - Chicmi uses structured data
    // Pattern: "Brand Name Sample Sale" with dates and location
    const salePatterns = [
      /<article[^>]*>[\s\S]*?<h[23][^>]*>([^<]+)<\/h[23]>[\s\S]*?<\/article>/gi,
      /<div[^>]*class="[^"]*sale[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    ];

    // Extract potential sale blocks
    const saleBlocks = html.match(/<div[^>]*class="[^"]*event[^"]*"[^>]*>[\s\S]*?<\/div>/gi) || [];

    for (const block of saleBlocks) {
      // Extract title
      const titleMatch = block.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i) ||
        block.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)</i);

      if (!titleMatch) continue;
      const title = titleMatch[1].trim();

      // Check if luxury brand
      const { isLuxury, brand } = isLuxuryBrandSale(title);
      if (!isLuxury || !brand) continue;

      // Extract dates
      const dateMatch = block.match(/(\w+\s+\d{1,2})\s*[-–]\s*(\w+\s+\d{1,2})/i) ||
        block.match(/(\d{1,2}\s+\w+)\s*[-–]\s*(\d{1,2}\s+\w+)/i);

      let startDate = new Date();
      let endDate = new Date();
      endDate.setDate(endDate.getDate() + 3); // Default 3-day sale

      if (dateMatch) {
        const year = new Date().getFullYear();
        startDate = new Date(`${dateMatch[1]} ${year}`);
        endDate = new Date(`${dateMatch[2]} ${year}`);

        // If dates are in the past, assume next year
        if (startDate < new Date()) {
          startDate.setFullYear(year + 1);
          endDate.setFullYear(year + 1);
        }
      }

      // Extract venue
      const venueMatch = block.match(/(?:at|venue|location)[:\s]*([^<,]+)/i);
      const venue = venueMatch ? venueMatch[1].trim() : 'TBA';

      // Match to neighborhood
      const neighborhoodMatch = matchToNeighborhood(title + ' ' + venue, config.city);

      const sale: DetectedSale = {
        id: `chicmi-${config.city}-${Buffer.from(title).toString('base64').substring(0, 12)}`,
        source: 'Chicmi',
        sourceDisplayName: config.name,
        city: config.city,
        brand: brand.name,
        brandTier: brand.tier,
        brandCategory: brand.category,
        title,
        venue,
        neighborhood: neighborhoodMatch?.name,
        neighborhoodId: neighborhoodMatch?.id,
        startDate,
        endDate,
        saleType: 'sample_sale',
        discount: 'Up to 80% off',
        isInviteOnly: false,
        url: config.baseUrl,
      };

      sales.push(sale);
    }

    console.log(`Chicmi ${config.city}: Found ${sales.length} luxury sales`);
  } catch (error) {
    console.error(`Error scraping Chicmi ${config.city}:`, error);
  }

  return sales;
}

/**
 * Scrape 260 Sample Sale
 */
export async function scrape260SampleSale(): Promise<DetectedSale[]> {
  const sales: DetectedSale[] = [];

  try {
    const response = await fetch('https://260samplesale.com/', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.log('260 Sample Sale fetch failed:', response.status);
      return [];
    }

    const html = await response.text();

    // 260 Sample Sale typically shows "Upcoming" sales prominently
    // Pattern: Brand name + dates + "260 Fifth Avenue" venue
    const salePatterns = [
      /(?:upcoming|current|now)[^<]*<[^>]*>[\s\S]*?(\w+(?:\s+\w+)*)\s*(?:sample\s*sale)?[\s\S]*?(\w+\s+\d{1,2})\s*[-–]\s*(\w+\s+\d{1,2})/gi,
      /<div[^>]*class="[^"]*sale[^"]*"[^>]*>([^<]+)</gi,
    ];

    // Look for brand names followed by dates
    const brandDatePattern = /([A-Z][a-zA-Z\s&]+?)(?:\s+Sample\s+Sale)?[:\s]+(\w+\s+\d{1,2})\s*[-–]\s*(\w+\s+\d{1,2})/gi;
    let match;

    while ((match = brandDatePattern.exec(html)) !== null) {
      const title = match[1].trim();
      const { isLuxury, brand } = isLuxuryBrandSale(title);

      if (!isLuxury || !brand) continue;

      const year = new Date().getFullYear();
      let startDate = new Date(`${match[2]} ${year}`);
      let endDate = new Date(`${match[3]} ${year}`);

      if (startDate < new Date()) {
        startDate.setFullYear(year + 1);
        endDate.setFullYear(year + 1);
      }

      const sale: DetectedSale = {
        id: `260-${Buffer.from(title).toString('base64').substring(0, 12)}`,
        source: '260_Sample_Sale',
        sourceDisplayName: '260 Sample Sale',
        city: 'New_York',
        brand: brand.name,
        brandTier: brand.tier,
        brandCategory: brand.category,
        title: `${brand.name} Sample Sale`,
        venue: '260 Fifth Avenue',
        venueAddress: '260 5th Ave, New York, NY 10001',
        neighborhood: 'Chelsea',
        neighborhoodId: 'nyc-chelsea',
        startDate,
        endDate,
        saleType: 'sample_sale',
        discount: 'Up to 80% off',
        isInviteOnly: false,
        url: 'https://260samplesale.com/',
      };

      sales.push(sale);
    }

    console.log(`260 Sample Sale: Found ${sales.length} luxury sales`);
  } catch (error) {
    console.error('Error scraping 260 Sample Sale:', error);
  }

  return sales;
}

/**
 * Scrape Arlettie (Paris/London private sales)
 */
export async function scrapeArlettie(config: SourceConfig): Promise<DetectedSale[]> {
  const sales: DetectedSale[] = [];

  try {
    const response = await fetch(config.baseUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.log(`Arlettie fetch failed for ${config.city}:`, response.status);
      return [];
    }

    const html = await response.text();

    // Arlettie shows private sales - often "Invite Only"
    // Pattern: Brand names in sale listings
    const saleBlocks = html.match(/<div[^>]*class="[^"]*vente[^"]*"[^>]*>[\s\S]*?<\/div>/gi) || [];

    for (const block of saleBlocks) {
      // Extract brand name
      const brandMatch = block.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i);
      if (!brandMatch) continue;

      const title = brandMatch[1].trim();
      const { isLuxury, brand } = isLuxuryBrandSale(title);

      if (!isLuxury || !brand) continue;

      // Extract dates
      const dateMatch = block.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(\w+)/i);
      let startDate = new Date();
      let endDate = new Date();

      if (dateMatch) {
        const month = dateMatch[3];
        const year = new Date().getFullYear();
        startDate = new Date(`${month} ${dateMatch[1]}, ${year}`);
        endDate = new Date(`${month} ${dateMatch[2]}, ${year}`);
      }

      // Arlettie sales are typically invite-only
      const isInviteOnly = /invite|privée|exclusive|member/i.test(block);

      const neighborhoodMatch = matchToNeighborhood(title, config.city);

      const sale: DetectedSale = {
        id: `arlettie-${config.city}-${Buffer.from(title).toString('base64').substring(0, 12)}`,
        source: 'Arlettie',
        sourceDisplayName: `Arlettie ${config.city === 'Paris' ? 'Paris' : 'London'}`,
        city: config.city,
        brand: brand.name,
        brandTier: brand.tier,
        brandCategory: brand.category,
        title: `${brand.name} Private Sale`,
        venue: 'Arlettie Showroom',
        neighborhood: neighborhoodMatch?.name,
        neighborhoodId: neighborhoodMatch?.id || CITY_NEIGHBORHOODS[config.city][0],
        startDate,
        endDate,
        saleType: 'private_sale',
        discount: 'Up to 70% off',
        isInviteOnly,
        url: config.baseUrl,
      };

      sales.push(sale);
    }

    console.log(`Arlettie ${config.city}: Found ${sales.length} luxury sales`);
  } catch (error) {
    console.error(`Error scraping Arlettie ${config.city}:`, error);
  }

  return sales;
}

/**
 * Match venue/location to a Flâneur neighborhood
 */
function matchToNeighborhood(
  text: string,
  city: SaleCity
): { id: string; name: string } | null {
  const cityNeighborhoods = CITY_NEIGHBORHOODS[city] || [];

  for (const neighborhoodId of cityNeighborhoods) {
    const patterns = NEIGHBORHOOD_PATTERNS[neighborhoodId];
    if (!patterns) continue;

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        const name = neighborhoodId
          .split('-')
          .slice(1)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        return { id: neighborhoodId, name };
      }
    }
  }

  // Default to first neighborhood in city
  if (cityNeighborhoods.length > 0) {
    const defaultId = cityNeighborhoods[0];
    const name = defaultId
      .split('-')
      .slice(1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return { id: defaultId, name };
  }

  return null;
}

// =============================================================================
// GEMINI STORY GENERATION
// =============================================================================

/**
 * Generate a sample sale story using Gemini
 * Tone: "Secret Intel" - insider access to deals
 */
export async function generateSampleSaleStory(sale: DetectedSale): Promise<SampleSaleStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const neighborhoodName = sale.neighborhood || sale.city.replace(/_/g, ' ');

  // Format dates
  const startDay = sale.startDate.toLocaleDateString('en-US', { weekday: 'long' });
  const startDateStr = sale.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endDateStr = sale.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const duration = Math.ceil((sale.endDate.getTime() - sale.startDate.getTime()) / (1000 * 60 * 60 * 24));

  // Build context
  let exclusivityNote = '';
  if (sale.isInviteOnly) {
    exclusivityNote = 'This is an INVITE-ONLY private sale. Very exclusive.';
  }

  const tierContext = sale.brandTier === 'Ultra'
    ? 'This is a heritage luxury house. Sample sales for this brand are rare.'
    : 'This is a sought-after contemporary label.';

  const prompt = `You are the Fashion Editor for Flâneur in ${neighborhoodName}.
Data: ${JSON.stringify({
    brand: sale.brand,
    venue: sale.venue,
    startDate: startDateStr,
    endDate: endDateStr,
    startDay,
    duration: `${duration} days`,
    discount: sale.discount,
    isInviteOnly: sale.isInviteOnly,
    brandCategory: sale.brandCategory,
    brandTier: sale.brandTier,
  })}

Context:
- A luxury sample sale is happening nearby.
- ${tierContext}
- ${exclusivityNote}
- Audience: Fashion-conscious, loves a deal, hates lines.
- Tone: 'Secret Intel'. Think insider tip, not advertisement.

Task: Write a blurb for Flâneur's Style Alert.

Format your response as JSON:
{
  "headline": "Style Alert: ${sale.brand} sample sale starts ${startDay}",
  "body": "[30-35 word blurb. Mention the discount, venue, and a pro tip about timing. Don't use exclamation points. Tone is knowing, not excited.]",
  "previewText": "[12-15 word teaser for feed cards]",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 1-3 link candidates for key entities mentioned in the body (brand name, venue).

Constraints:
- Headline under 55 characters
- Body must mention the venue
- Body should include a "pro tip" about timing or strategy
- If invite-only, mention exclusivity subtly
- Don't use "Don't miss!" or similar salesy language`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Gemini response for sample sale story');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || `${sale.discount} at ${sale.venue}. Pro tip: Go early on the first day for the best selection.`;
    if (linkCandidates.length > 0) {
      const cityName = sale.city.replace(/_/g, ' ');
      body = injectHyperlinks(body, linkCandidates, { name: neighborhoodName, city: cityName });
    }

    // Get target neighborhoods for the city
    const targetNeighborhoods = sale.neighborhoodId
      ? [sale.neighborhoodId]
      : CITY_NEIGHBORHOODS[sale.city] || [];

    // Determine category label based on sale type
    const categoryLabels: Record<SaleType, string> = {
      sample_sale: 'Style Alert',
      trunk_show: 'Trunk Show',
      warehouse_sale: 'Style Alert',
      private_sale: 'Private Sale',
      flash_sale: 'Flash Sale',
    };

    return {
      sale,
      headline: parsed.headline || `Style Alert: ${sale.brand} sample sale starts ${startDay}`,
      body,
      previewText: parsed.previewText || `${sale.brand} sample sale this week`,
      targetNeighborhoods,
      categoryLabel: sale.isInviteOnly ? 'Private Sale' : categoryLabels[sale.saleType],
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error generating sample sale story:', error);
    return null;
  }
}

// =============================================================================
// MAIN PROCESSING PIPELINE
// =============================================================================

/**
 * Process all sample sale sources
 */
export async function processSampleSales(): Promise<SampleSaleProcessResult> {
  const result: SampleSaleProcessResult = {
    sourcesScraped: 0,
    salesDetected: 0,
    salesMatched: 0,
    storiesGenerated: 0,
    bySource: {},
    byCity: {},
    byBrandTier: { Ultra: 0, Aspirational: 0 },
    stories: [],
    errors: [],
  };

  const allSales: DetectedSale[] = [];

  // Scrape each source
  for (const config of SAMPLE_SALE_SOURCES) {
    result.sourcesScraped++;

    try {
      let sales: DetectedSale[] = [];

      switch (config.source) {
        case 'Chicmi':
          sales = await scrapeChicmi(config);
          break;
        case '260_Sample_Sale':
          sales = await scrape260SampleSale();
          break;
        case 'Arlettie':
          sales = await scrapeArlettie(config);
          break;
      }

      for (const sale of sales) {
        result.bySource[sale.source] = (result.bySource[sale.source] || 0) + 1;
      }

      allSales.push(...sales);

      // Rate limit between sources
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      result.errors.push(`${config.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  result.salesDetected = allSales.length;

  // Deduplicate by brand + city
  const seenSales = new Set<string>();
  const uniqueSales: DetectedSale[] = [];

  for (const sale of allSales) {
    const key = `${sale.brand.toLowerCase()}-${sale.city}`;
    if (!seenSales.has(key)) {
      seenSales.add(key);
      uniqueSales.push(sale);
    }
  }

  result.salesMatched = uniqueSales.length;

  // Count by city and tier
  for (const sale of uniqueSales) {
    result.byCity[sale.city] = (result.byCity[sale.city] || 0) + 1;
    result.byBrandTier[sale.brandTier]++;
  }

  // Generate stories for each sale
  for (const sale of uniqueSales) {
    try {
      const story = await generateSampleSaleStory(sale);
      if (story) {
        result.stories.push(story);
        result.storiesGenerated++;
      }

      // Rate limit Gemini calls
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      result.errors.push(`Story for ${sale.brand}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

// =============================================================================
// SAMPLE DATA FOR TESTING
// =============================================================================

/**
 * Create sample sales for testing
 */
export function createSampleSales(): DetectedSale[] {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return [
    {
      id: 'sample-row-1',
      source: '260_Sample_Sale',
      sourceDisplayName: '260 Sample Sale',
      city: 'New_York',
      brand: 'The Row',
      brandTier: 'Ultra',
      brandCategory: 'Fashion',
      title: 'The Row Sample Sale',
      venue: '260 Fifth Avenue',
      venueAddress: '260 5th Ave, New York, NY 10001',
      neighborhood: 'Chelsea',
      neighborhoodId: 'nyc-chelsea',
      startDate: now,
      endDate: nextWeek,
      saleType: 'sample_sale',
      discount: 'Up to 80% off',
      isInviteOnly: false,
      url: 'https://260samplesale.com/',
    },
    {
      id: 'sample-diptyque-1',
      source: 'Chicmi',
      sourceDisplayName: 'Chicmi London',
      city: 'London',
      brand: 'Diptyque',
      brandTier: 'Aspirational',
      brandCategory: 'Fragrance',
      title: 'Diptyque Sample Sale',
      venue: 'The Truman Brewery',
      venueAddress: '91 Brick Lane, London E1 6QL',
      neighborhood: 'Shoreditch',
      neighborhoodId: 'london-shoreditch',
      startDate: now,
      endDate: nextWeek,
      saleType: 'sample_sale',
      discount: 'Up to 70% off',
      isInviteOnly: false,
      url: 'https://www.chicmi.com/london/',
    },
    {
      id: 'sample-celine-1',
      source: 'Arlettie',
      sourceDisplayName: 'Arlettie Paris',
      city: 'Paris',
      brand: 'Celine',
      brandTier: 'Ultra',
      brandCategory: 'Fashion',
      title: 'Celine Private Sale',
      venue: 'Arlettie Showroom',
      neighborhood: 'Le Marais',
      neighborhoodId: 'paris-le-marais',
      startDate: now,
      endDate: nextWeek,
      saleType: 'private_sale',
      discount: 'Up to 70% off',
      isInviteOnly: true,
      url: 'https://www.arlettie.com/',
    },
  ];
}
