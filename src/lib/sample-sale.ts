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
import { AI_MODELS } from '@/config/ai-models';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { grokEventSearch } from '@/lib/grok';
import { insiderPersona } from '@/lib/ai-persona';

// =============================================================================
// TYPES
// =============================================================================

export type SaleSource = 'Chicmi' | '260_Sample_Sale' | 'Arlettie' | 'The_Outnet' | 'Gilt' | 'Sample_Sale_Guide';

export type SaleCity = 'New_York' | 'London' | 'Paris' | 'Los_Angeles' | 'Milan'
  | 'Stockholm' | 'Copenhagen' | 'Amsterdam' | 'Berlin' | 'Tokyo';

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

  // Scandinavian/Nordic Brands
  { name: 'Filippa K', pattern: /filippa\s*k/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Rodebjer', pattern: /rodebjer/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Blankens', pattern: /blankens/i, category: 'Shoes', tier: 'Aspirational' },
  { name: 'Tiger of Sweden', pattern: /tiger\s*of\s*sweden/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Arket', pattern: /\barket\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'COS', pattern: /\bcos\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Samsøe Samsøe', pattern: /sams[oø]e/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Holzweiler', pattern: /holzweiler/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Baum und Pferdgarten', pattern: /baum\s*(und|&)\s*pferdgarten/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Stine Goya', pattern: /stine\s*goya/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Hope Stockholm', pattern: /\bhope\b.*stockholm/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Minimarket', pattern: /\bminimarket\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'ATP Atelier', pattern: /atp\s*atelier/i, category: 'Shoes', tier: 'Aspirational' },

  // Japanese Brands
  { name: 'Issey Miyake', pattern: /issey\s*miyake|miyake/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Comme des Garçons', pattern: /comme\s*des\s*gar[cç]ons|cdg/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Sacai', pattern: /\bsacai\b/i, category: 'Fashion', tier: 'Ultra' },

  // European DTC
  { name: 'A.P.C.', pattern: /\ba\.?p\.?c\.?\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Sandro', pattern: /\bsandro\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Maje', pattern: /\bmaje\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Zadig & Voltaire', pattern: /zadig/i, category: 'Fashion', tier: 'Aspirational' },

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
  Stockholm: [
    'stockholm-ostermalm',
    'stockholm-sodermalm',
    'stockholm-vasastan',
    'stockholm-norrmalm',
    'stockholm-kungsholmen',
    'stockholm-gamla-stan',
  ],
  Copenhagen: [
    'copenhagen-norrebro',
    'copenhagen-vesterbro',
    'copenhagen-frederiksberg',
    'copenhagen-indre-by',
  ],
  Amsterdam: [
    'amsterdam-jordaan',
    'amsterdam-de-pijp',
    'amsterdam-grachtengordel',
    'amsterdam-oud-zuid',
  ],
  Berlin: [
    'berlin-mitte',
    'berlin-charlottenburg',
    'berlin-prenzlauer-berg',
    'berlin-kreuzberg',
  ],
  Tokyo: [
    'tokyo-shibuya',
    'tokyo-ginza',
    'tokyo-omotesando',
    'tokyo-roppongi',
  ],
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

  // Stockholm
  'stockholm-ostermalm': [/[oö]stermalm/i, /grevgatan/i, /strandv[aä]gen/i, /karla\s*plan/i, /humleg[aå]rden/i],
  'stockholm-sodermalm': [/s[oö]dermalm/i, /s[oö]fo/i, /hornsgatan/i, /g[oö]tgatan/i],
  'stockholm-norrmalm': [/norrmalm/i, /drottninggatan/i, /hamngatan/i, /biblioteksgatan/i],
  'stockholm-vasastan': [/vasastan/i, /odenplan/i, /odengatan/i],
  'stockholm-kungsholmen': [/kungsholmen/i, /fleminggatan/i],
  'stockholm-gamla-stan': [/gamla\s*stan/i, /v[aä]sterlånggatan/i],

  // Copenhagen
  'copenhagen-norrebro': [/n[oø]rrebro/i],
  'copenhagen-vesterbro': [/vesterbro/i],
  'copenhagen-frederiksberg': [/frederiksberg/i],
  'copenhagen-indre-by': [/str[oø]get/i, /indre\s*by/i, /n[oy]havn/i],

  // Amsterdam
  'amsterdam-jordaan': [/jordaan/i],
  'amsterdam-de-pijp': [/de\s*pijp/i, /albert\s*cuyp/i],
  'amsterdam-grachtengordel': [/grachtengordel/i, /herengracht/i, /keizersgracht/i],
  'amsterdam-oud-zuid': [/oud[\s-]*zuid/i, /p\.?c\.?\s*hooftstraat/i],

  // Berlin
  'berlin-mitte': [/\bmitte\b/i, /friedrichstra/i],
  'berlin-charlottenburg': [/charlottenburg/i, /kurf[uü]rstendamm/i, /kudamm/i],
  'berlin-prenzlauer-berg': [/prenzlauer\s*berg/i],
  'berlin-kreuzberg': [/kreuzberg/i, /bergmannstra/i],

  // Tokyo
  'tokyo-shibuya': [/shibuya/i],
  'tokyo-ginza': [/ginza/i],
  'tokyo-omotesando': [/omotesando/i, /harajuku/i],
  'tokyo-roppongi': [/roppongi/i],
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
 * City key -> display name mapping for the batched Grok prompt
 */
const CITY_DISPLAY_NAMES: Record<SaleCity, string> = {
  New_York: 'New York',
  London: 'London',
  Paris: 'Paris',
  Los_Angeles: 'Los Angeles',
  Milan: 'Milan',
  Stockholm: 'Stockholm',
  Copenhagen: 'Copenhagen',
  Amsterdam: 'Amsterdam',
  Berlin: 'Berlin',
  Tokyo: 'Tokyo',
};

/**
 * Reverse lookup: display name -> SaleCity key
 * Normalises to lowercase for fuzzy matching
 */
function resolveCityKey(rawCity: string): SaleCity | null {
  const lower = rawCity.trim().toLowerCase();
  for (const [key, display] of Object.entries(CITY_DISPLAY_NAMES)) {
    if (display.toLowerCase() === lower) return key as SaleCity;
  }
  // Fallback: try matching underscore key directly (e.g. "New_York")
  if (lower.replace(/\s+/g, '_') in CITY_DISPLAY_NAMES) {
    return lower.replace(/\s+/g, '_') as SaleCity;
  }
  return null;
}

/**
 * Search for sample sales across ALL cities in a single batched Grok call.
 * Returns a flat array of DetectedSale with the correct `city` populated
 * by matching the "city" field in Grok's JSON response back to our SaleCity keys.
 */
async function searchSalesAllCities(cities: SaleCity[]): Promise<DetectedSale[]> {
  const cityNames = cities.map(c => CITY_DISPLAY_NAMES[c] || c.replace(/_/g, ' '));
  const cityList = cityNames.join(', ');

  const systemPrompt = `You are a fashion industry researcher. Search the web and X for current and upcoming luxury sample sales in ALL of the following cities: ${cityList}. Focus on designer brands, private sales, and warehouse sales.

Return ONLY a JSON array (no markdown, no explanation). Each object must have:
- city: string (one of: ${cityNames.map(n => `"${n}"`).join(', ')})
- brand: string (brand name)
- venue: string (venue name)
- venueAddress: string or null
- startDate: string (ISO date)
- endDate: string (ISO date)
- discount: string (e.g. "Up to 80% off")
- saleType: "sample_sale" | "trunk_show" | "warehouse_sale" | "private_sale" | "flash_sale"
- isInviteOnly: boolean
- url: string or null (the URL of the page where you found this sale)
- sourceName: string (name of the website/publication where you found this, e.g. "Chicmi", "260 Sample Sale", "Vogue Scandinavia", "The Cut", "TimeOut London")

IMPORTANT: The "city" field MUST be included for every entry so results can be attributed to the correct city.

If no sales are found for any city, return an empty array: []`;

  const userPrompt = `Search for current and upcoming luxury designer sample sales happening right now or in the next 2 weeks in ALL of these cities: ${cityList}. Include sales from brands like Hermès, Chanel, Prada, Gucci, The Row, Bottega Veneta, Saint Laurent, Celine, Valentino, Dior, and other high-end fashion houses. Check sites like Chicmi, 260 Sample Sale, Arlettie, and fashion news outlets. Make sure to search for each city individually and include the city name in every result.`;

  console.log(`Searching Grok for sample sales in all cities: ${cityList}...`);
  const raw = await grokEventSearch(systemPrompt, userPrompt);
  if (!raw) return [];

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      city?: string;
      brand: string;
      venue?: string;
      venueAddress?: string | null;
      startDate?: string;
      endDate?: string;
      discount?: string;
      saleType?: string;
      isInviteOnly?: boolean;
      url?: string | null;
      sourceName?: string | null;
    }>;

    const sales: DetectedSale[] = [];

    for (const p of parsed) {
      if (!p.brand) continue;

      // Resolve city from response back to SaleCity key
      const city = p.city ? resolveCityKey(p.city) : null;
      if (!city) {
        console.warn(`Skipping sale "${p.brand}" - unrecognised city: "${p.city}"`);
        continue;
      }

      // Validate against luxury brand whitelist
      const { isLuxury, brand } = isLuxuryBrandSale(p.brand);
      if (!isLuxury || !brand) continue;

      const venue = p.venue || 'TBA';
      const neighborhoodMatch = matchToNeighborhood(`${p.brand} ${venue} ${p.venueAddress || ''}`, city);

      const startDate = p.startDate ? new Date(p.startDate) : new Date();
      const endDate = p.endDate ? new Date(p.endDate) : new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);

      const validSaleTypes: SaleType[] = ['sample_sale', 'trunk_show', 'warehouse_sale', 'private_sale', 'flash_sale'];
      const saleType = validSaleTypes.includes(p.saleType as SaleType) ? p.saleType as SaleType : 'sample_sale';

      const cityName = CITY_DISPLAY_NAMES[city] || city.replace(/_/g, ' ');

      sales.push({
        id: `grok-${city}-${brand.name.replace(/\W/g, '-').toLowerCase()}-${Date.now()}`,
        source: 'Sample_Sale_Guide',
        sourceDisplayName: p.sourceName || `Grok Search (${cityName})`,
        city,
        brand: brand.name,
        brandTier: brand.tier,
        brandCategory: brand.category,
        title: `${brand.name} ${saleType === 'private_sale' ? 'Private Sale' : 'Sample Sale'}`,
        venue,
        venueAddress: p.venueAddress || undefined,
        neighborhood: neighborhoodMatch?.name,
        neighborhoodId: neighborhoodMatch?.id,
        startDate,
        endDate,
        saleType,
        discount: p.discount || 'Up to 70% off',
        isInviteOnly: p.isInviteOnly || false,
        url: p.url || undefined,
      });
    }

    console.log(`Grok batched search: Found ${sales.length} luxury sales across ${cityList}`);
    return sales;
  } catch (error) {
    console.error(`Error parsing batched Grok response for sample sales:`, error);
    return [];
  }
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

  const prompt = `${insiderPersona(neighborhoodName, 'Fashion Editor')}
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

Task: Write a 150-200 word article in 2-3 paragraphs for Flâneur's Style Alert.

PARAGRAPH STRUCTURE:
- P1: Which brand's sample sale, the venue and address, and when it starts and ends. Set the scene with what kind of sale this is.
- P2: Expected discounts and what categories are available - menswear, womenswear, accessories, footwear. What specific items or lines to look for.
- P3: Pro tips - best days to go (early mornings on day one for top picks, final days for deepest cuts), expected lines, payment methods accepted, and sizing notes.

WRITING RULES:
- Active present tense throughout
- No emojis, no em dashes, no exclamation points
- Tone is knowing insider intel, not advertisement
- Each paragraph should contain 2-3 sentences

Format your response as JSON:
{
  "headline": "Style Alert: ${sale.brand} sample sale starts ${startDay}",
  "body": "150-200 word article in 2-3 paragraphs. First paragraph covers the brand, venue, and dates. Second paragraph details discounts and what categories to shop. Third paragraph shares pro tips on timing, lines, payment, and sizing. Separate paragraphs with double newlines.",
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

  let allSales: DetectedSale[] = [];

  // Search ALL cities for sample sales in a single batched Grok call
  const cities = [...new Set(SAMPLE_SALE_SOURCES.map(s => s.city))];
  result.sourcesScraped = cities.length;

  try {
    allSales = await searchSalesAllCities(cities);

    for (const sale of allSales) {
      result.bySource[sale.source] = (result.bySource[sale.source] || 0) + 1;
    }
  } catch (error) {
    result.errors.push(`Batched search: ${error instanceof Error ? error.message : String(error)}`);
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
// SHOPIFY COLLECTION POLLING
// =============================================================================

export interface ShopifyStoreConfig {
  brand: string;
  storeUrl: string;
  collectionHandles: string[];
  cities: SaleCity[];
}

export const SHOPIFY_STORES: ShopifyStoreConfig[] = [
  // Nordic DTC
  { brand: 'Blankens', storeUrl: 'blankens.com', collectionHandles: ['sale', 'sample-sale'], cities: ['Stockholm'] },
  { brand: 'Filippa K', storeUrl: 'filippa-k.com', collectionHandles: ['sale'], cities: ['Stockholm', 'Copenhagen'] },
  { brand: 'Rodebjer', storeUrl: 'rodebjer.com', collectionHandles: ['sale'], cities: ['Stockholm'] },
  { brand: 'Holzweiler', storeUrl: 'holzweiler.com', collectionHandles: ['sale'], cities: ['Copenhagen', 'Stockholm'] },
  // US DTC
  { brand: 'Kith', storeUrl: 'kith.com', collectionHandles: ['sale'], cities: ['New_York'] },
  { brand: 'Reformation', storeUrl: 'thereformation.com', collectionHandles: ['sale'], cities: ['New_York', 'Los_Angeles'] },
  // UK/EU DTC
  { brand: 'Ganni', storeUrl: 'ganni.com', collectionHandles: ['sale'], cities: ['Copenhagen', 'London'] },
  { brand: 'Samsøe Samsøe', storeUrl: 'samsoe.com', collectionHandles: ['sale'], cities: ['Copenhagen', 'Stockholm'] },
];

/**
 * Poll Shopify stores for active sale collections.
 * Compares against previous state to detect NEW sales only.
 *
 * @param previousActiveSales - Set of "brand:handle" keys from last run (for dedup)
 * @returns Array of newly detected sales + current active state for persistence
 */
export async function pollShopifyStores(
  previousActiveSales: Set<string> = new Set()
): Promise<{ sales: DetectedSale[]; currentState: string[] }> {
  const newSales: DetectedSale[] = [];
  const currentState: string[] = [];

  for (const store of SHOPIFY_STORES) {
    for (const handle of store.collectionHandles) {
      const stateKey = `${store.brand}:${handle}`;
      try {
        const response = await fetch(
          `https://${store.storeUrl}/collections/${handle}.json`,
          {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
          }
        );

        if (!response.ok) continue;

        const data = await response.json();
        const collection = data?.collection;
        if (!collection) continue;

        const productCount = collection.products_count ?? collection.products?.length ?? 0;
        if (productCount === 0) continue;

        // This collection is active with products
        currentState.push(stateKey);

        // Only generate stories for NEW sales (weren't active last run)
        if (previousActiveSales.has(stateKey)) continue;

        const brand = matchBrand(store.brand);
        if (!brand) continue;

        // Create a DetectedSale for each city this store is associated with
        for (const city of store.cities) {
          const cityNeighborhoods = CITY_NEIGHBORHOODS[city] || [];
          const defaultNeighborhoodId = cityNeighborhoods[0];
          const defaultNeighborhoodName = defaultNeighborhoodId
            ? defaultNeighborhoodId.split('-').slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            : undefined;

          newSales.push({
            id: `shopify-${store.brand.replace(/\W/g, '-').toLowerCase()}-${handle}-${city}-${Date.now()}`,
            source: 'Sample_Sale_Guide',
            sourceDisplayName: `Shopify (${store.storeUrl})`,
            city,
            brand: brand.name,
            brandTier: brand.tier,
            brandCategory: brand.category,
            title: `${brand.name} Sale`,
            venue: `${store.storeUrl}`,
            venueAddress: undefined,
            neighborhood: defaultNeighborhoodName,
            neighborhoodId: defaultNeighborhoodId,
            startDate: new Date(),
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Assume 1 week
            saleType: 'flash_sale',
            discount: undefined,
            isInviteOnly: false,
            url: `https://${store.storeUrl}/collections/${handle}`,
          });
        }

        console.log(`[shopify] NEW sale detected: ${store.brand} (${handle}) - ${productCount} products`);
      } catch (err) {
        // Silently skip - store may not use Shopify or collection may not exist
        console.warn(`[shopify] Failed to poll ${store.storeUrl}/collections/${handle}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return { sales: newSales, currentState };
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
