/**
 * Retail Watch Service
 *
 * Monitors Signage and Advertisement permits to detect upcoming luxury
 * retail openings in Flâneur neighborhoods.
 *
 * Strategy: "The Brand Reveal"
 * Unlike construction permits (structure), signage permits reveal IDENTITY.
 * They show WHO is moving in, typically 3-4 months before opening.
 *
 * Data Sources:
 * - NYC: DOB NOW / BIS (job_type = "SG" for Sign)
 * - London: Planning (application_type = "Advertisement Consent")
 * - Other cities via global adapters
 */

import { GoogleGenAI } from '@google/genai';
import { FLANEUR_NYC_CONFIG, ALL_TARGET_ZIPS } from '@/config/nyc-locations';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';

// Gemini model for story generation
const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Luxury brand categories
 */
export type BrandCategory =
  | 'Fashion'
  | 'Watches & Jewelry'
  | 'Beauty & Fragrance'
  | 'Fitness & Wellness'
  | 'Private Clubs'
  | 'Hospitality'
  | 'Home & Design';

/**
 * Luxury brand entry
 */
export interface LuxuryBrand {
  name: string;
  pattern: RegExp;
  category: BrandCategory;
  tier: 'Ultra' | 'Aspirational';
}

/**
 * The Luxury List - Brands we track for retail openings
 */
export const LUXURY_BRANDS: LuxuryBrand[] = [
  // ─────────────────────────────────────────────────────────────
  // FASHION - Ultra Tier
  // ─────────────────────────────────────────────────────────────
  { name: 'Hermès', pattern: /herm[eè]s/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Chanel', pattern: /chanel/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Louis Vuitton', pattern: /louis\s*vuitton|vuitton/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Gucci', pattern: /gucci/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Prada', pattern: /prada/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Dior', pattern: /\bdior\b/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Saint Laurent', pattern: /saint\s*laurent|ysl/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Céline', pattern: /c[eé]line/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Loewe', pattern: /loewe/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Bottega Veneta', pattern: /bottega\s*veneta|bottega/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Brunello Cucinelli', pattern: /brunello\s*cucinelli|cucinelli/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Loro Piana', pattern: /loro\s*piana/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Ermenegildo Zegna', pattern: /zegna/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Valentino', pattern: /valentino/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Balenciaga', pattern: /balenciaga/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Fendi', pattern: /fendi/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Burberry', pattern: /burberry/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Givenchy', pattern: /givenchy/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Tom Ford', pattern: /tom\s*ford/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'The Row', pattern: /\bthe\s*row\b/i, category: 'Fashion', tier: 'Ultra' },

  // ─────────────────────────────────────────────────────────────
  // FASHION - Aspirational Tier (Streetwear Luxury)
  // ─────────────────────────────────────────────────────────────
  { name: 'Kith', pattern: /\bkith\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Aimé Leon Dore', pattern: /aim[eé]\s*leon\s*dore|ald\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Fear of God', pattern: /fear\s*of\s*god/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Off-White', pattern: /off[\s-]*white/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Supreme', pattern: /\bsupreme\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Palace', pattern: /\bpalace\s*skate/i, category: 'Fashion', tier: 'Aspirational' },

  // ─────────────────────────────────────────────────────────────
  // WATCHES & JEWELRY
  // ─────────────────────────────────────────────────────────────
  { name: 'Rolex', pattern: /rolex/i, category: 'Watches & Jewelry', tier: 'Ultra' },
  { name: 'Patek Philippe', pattern: /patek\s*philippe|patek/i, category: 'Watches & Jewelry', tier: 'Ultra' },
  { name: 'Audemars Piguet', pattern: /audemars\s*piguet|audemars/i, category: 'Watches & Jewelry', tier: 'Ultra' },
  { name: 'Cartier', pattern: /cartier/i, category: 'Watches & Jewelry', tier: 'Ultra' },
  { name: 'Van Cleef & Arpels', pattern: /van\s*cleef/i, category: 'Watches & Jewelry', tier: 'Ultra' },
  { name: 'Tiffany & Co.', pattern: /tiffany/i, category: 'Watches & Jewelry', tier: 'Ultra' },
  { name: 'Bulgari', pattern: /bulgari|bvlgari/i, category: 'Watches & Jewelry', tier: 'Ultra' },
  { name: 'Harry Winston', pattern: /harry\s*winston/i, category: 'Watches & Jewelry', tier: 'Ultra' },
  { name: 'Chopard', pattern: /chopard/i, category: 'Watches & Jewelry', tier: 'Ultra' },
  { name: 'Omega', pattern: /\bomega\b/i, category: 'Watches & Jewelry', tier: 'Aspirational' },
  { name: 'IWC', pattern: /\biwc\b/i, category: 'Watches & Jewelry', tier: 'Aspirational' },
  { name: 'Jaeger-LeCoultre', pattern: /jaeger[\s-]*lecoultre/i, category: 'Watches & Jewelry', tier: 'Ultra' },
  { name: 'Vacheron Constantin', pattern: /vacheron/i, category: 'Watches & Jewelry', tier: 'Ultra' },
  { name: 'A. Lange & Söhne', pattern: /lange\s*&?\s*s[oö]hne|a\.\s*lange/i, category: 'Watches & Jewelry', tier: 'Ultra' },

  // ─────────────────────────────────────────────────────────────
  // BEAUTY & FRAGRANCE
  // ─────────────────────────────────────────────────────────────
  { name: 'Aesop', pattern: /\baesop\b/i, category: 'Beauty & Fragrance', tier: 'Aspirational' },
  { name: 'Le Labo', pattern: /le\s*labo/i, category: 'Beauty & Fragrance', tier: 'Aspirational' },
  { name: 'Diptyque', pattern: /diptyque/i, category: 'Beauty & Fragrance', tier: 'Aspirational' },
  { name: 'Byredo', pattern: /byredo/i, category: 'Beauty & Fragrance', tier: 'Aspirational' },
  { name: 'Jo Malone', pattern: /jo\s*malone/i, category: 'Beauty & Fragrance', tier: 'Aspirational' },
  { name: 'Creed', pattern: /\bcreed\b/i, category: 'Beauty & Fragrance', tier: 'Ultra' },
  { name: 'Santa Maria Novella', pattern: /santa\s*maria\s*novella/i, category: 'Beauty & Fragrance', tier: 'Ultra' },
  { name: 'Maison Francis Kurkdjian', pattern: /kurkdjian|mfk\b/i, category: 'Beauty & Fragrance', tier: 'Ultra' },
  { name: 'Credo Beauty', pattern: /credo\s*beauty|credo/i, category: 'Beauty & Fragrance', tier: 'Aspirational' },
  { name: 'Goop', pattern: /\bgoop\b/i, category: 'Beauty & Fragrance', tier: 'Aspirational' },
  { name: 'Bluemercury', pattern: /bluemercury/i, category: 'Beauty & Fragrance', tier: 'Aspirational' },

  // ─────────────────────────────────────────────────────────────
  // FITNESS & WELLNESS
  // ─────────────────────────────────────────────────────────────
  { name: 'Equinox', pattern: /equinox/i, category: 'Fitness & Wellness', tier: 'Aspirational' },
  { name: 'SoulCycle', pattern: /soulcycle|soul\s*cycle/i, category: 'Fitness & Wellness', tier: 'Aspirational' },
  { name: "Barry's Bootcamp", pattern: /barry'?s\s*(bootcamp)?/i, category: 'Fitness & Wellness', tier: 'Aspirational' },
  { name: 'Rumble', pattern: /\brumble\b/i, category: 'Fitness & Wellness', tier: 'Aspirational' },
  { name: 'Alo Yoga', pattern: /alo\s*yoga/i, category: 'Fitness & Wellness', tier: 'Aspirational' },
  { name: 'Tracy Anderson', pattern: /tracy\s*anderson/i, category: 'Fitness & Wellness', tier: 'Aspirational' },
  { name: 'The Class', pattern: /\bthe\s*class\b/i, category: 'Fitness & Wellness', tier: 'Aspirational' },

  // ─────────────────────────────────────────────────────────────
  // PRIVATE CLUBS
  // ─────────────────────────────────────────────────────────────
  { name: 'Soho House', pattern: /soho\s*house/i, category: 'Private Clubs', tier: 'Aspirational' },
  { name: 'Zero Bond', pattern: /zero\s*bond/i, category: 'Private Clubs', tier: 'Ultra' },
  { name: 'Casa Cipriani', pattern: /casa\s*cipriani/i, category: 'Private Clubs', tier: 'Ultra' },
  { name: 'Core Club', pattern: /core\s*club/i, category: 'Private Clubs', tier: 'Ultra' },
  { name: "San Vicente Bungalows", pattern: /san\s*vicente/i, category: 'Private Clubs', tier: 'Ultra' },
  { name: 'The Ned', pattern: /\bthe\s*ned\b/i, category: 'Private Clubs', tier: 'Aspirational' },

  // ─────────────────────────────────────────────────────────────
  // HOSPITALITY (Restaurants/Hotels)
  // ─────────────────────────────────────────────────────────────
  { name: 'Nobu', pattern: /\bnobu\b/i, category: 'Hospitality', tier: 'Aspirational' },
  { name: 'Cipriani', pattern: /cipriani/i, category: 'Hospitality', tier: 'Ultra' },
  { name: 'Carbone', pattern: /\bcarbone\b/i, category: 'Hospitality', tier: 'Ultra' },
  { name: 'Aman', pattern: /\baman\b/i, category: 'Hospitality', tier: 'Ultra' },
  { name: 'Four Seasons', pattern: /four\s*seasons/i, category: 'Hospitality', tier: 'Ultra' },
  { name: 'Rosewood', pattern: /rosewood/i, category: 'Hospitality', tier: 'Ultra' },
  { name: 'Edition', pattern: /\bedition\b/i, category: 'Hospitality', tier: 'Aspirational' },
  { name: 'Pendry', pattern: /pendry/i, category: 'Hospitality', tier: 'Aspirational' },

  // ─────────────────────────────────────────────────────────────
  // HOME & DESIGN
  // ─────────────────────────────────────────────────────────────
  { name: 'RH (Restoration Hardware)', pattern: /\brh\b|restoration\s*hardware/i, category: 'Home & Design', tier: 'Aspirational' },
  { name: 'Ligne Roset', pattern: /ligne\s*roset/i, category: 'Home & Design', tier: 'Ultra' },
  { name: 'B&B Italia', pattern: /b\s*&\s*b\s*italia/i, category: 'Home & Design', tier: 'Ultra' },
  { name: 'Poliform', pattern: /poliform/i, category: 'Home & Design', tier: 'Ultra' },
  { name: 'Roche Bobois', pattern: /roche\s*bobois/i, category: 'Home & Design', tier: 'Ultra' },
  { name: 'De Gournay', pattern: /de\s*gournay/i, category: 'Home & Design', tier: 'Ultra' },
  { name: 'Flos', pattern: /\bflos\b/i, category: 'Home & Design', tier: 'Ultra' },
  { name: 'Artemide', pattern: /artemide/i, category: 'Home & Design', tier: 'Ultra' },
];

/**
 * Signage permit data structure
 */
export interface SignagePermit {
  permitId: string;
  city: string;
  neighborhood: string;
  neighborhoodId: string;
  address: string;
  street: string;
  zipCode: string;
  filingDate: string;
  description: string;
  applicantName?: string;
  ownerName?: string;
  signType?: string;
  rawData?: Record<string, unknown>;
}

/**
 * Detected retail opening
 */
export interface RetailOpening {
  permit: SignagePermit;
  brand: LuxuryBrand;
  confidence: 'High' | 'Medium';
  matchedText: string;
}

/**
 * Generated retail story
 */
export interface RetailStory {
  permitId: string;
  brandName: string;
  brandCategory: BrandCategory;
  brandTier: 'Ultra' | 'Aspirational';
  headline: string;
  body: string;
  previewText: string;
  address: string;
  street: string;
  neighborhood: string;
  neighborhoodId: string;
  estimatedOpening: string;
  generatedAt: string;
}

/**
 * Detect luxury brand in permit description
 */
export function detectLuxuryBrand(permit: SignagePermit): RetailOpening | null {
  // Combine all searchable text
  const searchText = [
    permit.description,
    permit.applicantName,
    permit.ownerName,
  ]
    .filter(Boolean)
    .join(' ');

  // Search for luxury brand matches
  for (const brand of LUXURY_BRANDS) {
    const match = searchText.match(brand.pattern);
    if (match) {
      // Determine confidence based on match context
      const confidence: 'High' | 'Medium' =
        permit.description.match(brand.pattern) ? 'High' : 'Medium';

      return {
        permit,
        brand,
        confidence,
        matchedText: match[0],
      };
    }
  }

  return null;
}

/**
 * Get neighborhood key from zip code
 */
function getNeighborhoodFromZip(zipCode: string): { key: string; id: string } | null {
  for (const [key, config] of Object.entries(FLANEUR_NYC_CONFIG)) {
    if (config.zips.includes(zipCode)) {
      // Convert key to neighborhood ID format
      const id = key.toLowerCase().replace(/\s+/g, '-');
      return { key, id: `nyc-${id}` };
    }
  }
  return null;
}

/**
 * Fetch NYC DOB signage permits
 */
export async function fetchNYCSignagePermits(
  since?: Date
): Promise<SignagePermit[]> {
  const permits: SignagePermit[] = [];

  try {
    // NYC DOB NOW API for signage permits
    const baseUrl = 'https://data.cityofnewyork.us/resource/ipu4-2q9a.json';

    // Build date filter
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateFilter = sinceDate.toISOString().split('T')[0];

    // Filter for signage permits (SG) in our target zips
    const zipList = ALL_TARGET_ZIPS.map((z) => `'${z}'`).join(',');
    const whereClause = `filing_date >= '${dateFilter}' AND job_type = 'SG' AND zip_code IN (${zipList})`;

    const params = new URLSearchParams({
      $where: whereClause,
      $limit: '200',
      $order: 'filing_date DESC',
    });

    const response = await fetch(`${baseUrl}?${params}`, {
      headers: {
        Accept: 'application/json',
        'X-App-Token': process.env.SOCRATA_APP_TOKEN || '',
      },
    });

    if (!response.ok) {
      console.error(`NYC DOB API returned ${response.status}`);
      return [];
    }

    const data = await response.json();

    for (const record of data) {
      const zipCode = record.zip_code || '';
      const neighborhoodInfo = getNeighborhoodFromZip(zipCode);

      if (!neighborhoodInfo) continue;

      // Extract street name from address
      const address = record.house_no
        ? `${record.house_no} ${record.street_name || ''}`
        : record.street_name || '';
      const street = record.street_name || '';

      permits.push({
        permitId: record.job_number || record.job__ || `NYC-${Date.now()}`,
        city: 'New York',
        neighborhood: neighborhoodInfo.key,
        neighborhoodId: neighborhoodInfo.id,
        address: address.trim(),
        street: street.trim(),
        zipCode,
        filingDate: record.filing_date || new Date().toISOString(),
        description: record.job_description || '',
        applicantName: record.applicant_first_name
          ? `${record.applicant_first_name} ${record.applicant_last_name || ''}`
          : undefined,
        ownerName: record.owner_s_first_name
          ? `${record.owner_s_first_name} ${record.owner_s_last_name || ''}`
          : record.owner_s_business_name,
        signType: record.work_type,
        rawData: record,
      });
    }
  } catch (error) {
    console.error('NYC signage permits fetch error:', error);
  }

  return permits;
}

/**
 * London Planning Advertisement Consent adapter
 */
export async function fetchLondonSignagePermits(
  since?: Date
): Promise<SignagePermit[]> {
  const permits: SignagePermit[] = [];

  // London Planning Portal API would go here
  // This is a placeholder for the actual implementation
  console.log('London signage permits - adapter to be implemented');

  return permits;
}

/**
 * Process signage permits and detect luxury retail openings
 */
export async function processSignagePermits(
  permits: SignagePermit[]
): Promise<RetailOpening[]> {
  const openings: RetailOpening[] = [];

  for (const permit of permits) {
    const opening = detectLuxuryBrand(permit);
    if (opening) {
      openings.push(opening);
      console.log(
        `Detected: ${opening.brand.name} at ${permit.address} (${opening.confidence} confidence)`
      );
    }
  }

  // Sort by brand tier (Ultra first) then confidence
  openings.sort((a, b) => {
    if (a.brand.tier !== b.brand.tier) {
      return a.brand.tier === 'Ultra' ? -1 : 1;
    }
    return a.confidence === 'High' ? -1 : 1;
  });

  return openings;
}

/**
 * Generate retail opening story using Gemini
 */
export async function generateRetailStory(
  opening: RetailOpening
): Promise<RetailStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });
  const { permit, brand } = opening;

  // Calculate estimated opening (3-4 months from permit)
  const filingDate = new Date(permit.filingDate);
  const estimatedOpening = new Date(filingDate.getTime() + 100 * 24 * 60 * 60 * 1000);
  const estimatedOpeningStr = estimatedOpening.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Build tier-specific guidance
  const tierGuidance =
    brand.tier === 'Ultra'
      ? `This is an ULTRA-LUXURY brand. Emphasize exclusivity, collector clientele, and the prestige this brings to the street.`
      : `This is an ASPIRATIONAL LUXURY brand popular with the neighborhood's younger, fashion-forward residents.`;

  // Category-specific angle
  const categoryAngles: Record<BrandCategory, string> = {
    Fashion: 'Focus on the fashion impact, runway influence, and wardrobe appeal.',
    'Watches & Jewelry': 'Focus on investment value, heritage, and collector appeal.',
    'Beauty & Fragrance': 'Focus on the sensory experience, clean beauty trends, and self-care ritual.',
    'Fitness & Wellness': 'Focus on the community, lifestyle integration, and neighborhood fit.',
    'Private Clubs': 'Focus on exclusivity, the social scene, and "who will you see" factor.',
    Hospitality: 'Focus on culinary excellence, ambiance, and destination dining/staying.',
    'Home & Design': 'Focus on design aesthetics, interior trends, and home as sanctuary.',
  };

  const systemPrompt = `You are the Style Editor for Flâneur, covering retail and luxury lifestyle.

${tierGuidance}
${categoryAngles[brand.category]}

Context:
- A new shop is opening in ${permit.neighborhood}.
- Signage permits usually precede opening by 3-4 months.
- Audience Vibe: Excited about property value and shopping convenience.
- The reader lives in this neighborhood and cares about what opens nearby.

Writing Style:
- Sophisticated but excited
- Mention specific streets and context
- No emojis
- Create anticipation for the opening`;

  const prompt = `Brand: ${brand.name}
Category: ${brand.category}
Tier: ${brand.tier}
Address: ${permit.address}
Street: ${permit.street}
Neighborhood: ${permit.neighborhood}
City: ${permit.city}
Filing Date: ${permit.filingDate}
Estimated Opening: ${estimatedOpeningStr}
Permit Description: ${permit.description}
${permit.ownerName ? `Owner/Applicant: ${permit.ownerName}` : ''}

Task: Write a 35-word "Retail Watch" blurb.

Headline Format: "Retail Watch: [Brand] confirms location at [Address/Street]."
Body: "Signage permits were filed today. This solidifies [Street Name] as the neighborhood's [luxury corridor/retail destination]. Expect doors to open by [Estimated Opening]."

Return JSON:
{
  "headline": "Headline under 70 chars",
  "body": "35-word description creating anticipation",
  "previewText": "One sentence teaser for feed",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 1-3 link candidates for key entities mentioned in the body (brand name, street/location).`;

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
      console.error('Failed to extract JSON from Gemini response for retail story');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || `Signage permits filed for ${brand.name} at ${permit.address}.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, { name: permit.neighborhood, city: permit.city });
    }

    return {
      permitId: permit.permitId,
      brandName: brand.name,
      brandCategory: brand.category,
      brandTier: brand.tier,
      headline: parsed.headline || `Retail Watch: ${brand.name} confirms location at ${permit.address}`,
      body,
      previewText: parsed.previewText || `${brand.name} is coming to ${permit.neighborhood}.`,
      address: permit.address,
      street: permit.street,
      neighborhood: permit.neighborhood,
      neighborhoodId: permit.neighborhoodId,
      estimatedOpening: estimatedOpeningStr,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Retail story generation error for ${brand.name}:`, error);
    return null;
  }
}

/**
 * Full pipeline: fetch, detect, generate
 */
export async function processRetailWatch(
  since?: Date
): Promise<{
  permitsScanned: number;
  openingsDetected: number;
  storiesGenerated: number;
  stories: RetailStory[];
  byCategory: Record<BrandCategory, number>;
  byTier: Record<'Ultra' | 'Aspirational', number>;
  errors: string[];
}> {
  const errors: string[] = [];
  const stories: RetailStory[] = [];
  const byCategory: Record<BrandCategory, number> = {
    Fashion: 0,
    'Watches & Jewelry': 0,
    'Beauty & Fragrance': 0,
    'Fitness & Wellness': 0,
    'Private Clubs': 0,
    Hospitality: 0,
    'Home & Design': 0,
  };
  const byTier: Record<'Ultra' | 'Aspirational', number> = {
    Ultra: 0,
    Aspirational: 0,
  };

  // Fetch permits from all sources
  const [nycPermits, londonPermits] = await Promise.all([
    fetchNYCSignagePermits(since),
    fetchLondonSignagePermits(since),
  ]);

  const allPermits = [...nycPermits, ...londonPermits];
  const permitsScanned = allPermits.length;

  console.log(`Scanned ${permitsScanned} signage permits`);

  // Detect luxury brand openings
  const openings = await processSignagePermits(allPermits);
  const openingsDetected = openings.length;

  console.log(`Detected ${openingsDetected} luxury retail openings`);

  // Count by category and tier
  for (const opening of openings) {
    byCategory[opening.brand.category]++;
    byTier[opening.brand.tier]++;
  }

  // Generate stories (limit to top 10 to manage API costs)
  const topOpenings = openings.slice(0, 10);

  for (const opening of topOpenings) {
    try {
      const story = await generateRetailStory(opening);
      if (story) {
        stories.push(story);
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      errors.push(
        `${opening.brand.name}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    permitsScanned,
    openingsDetected,
    storiesGenerated: stories.length,
    stories,
    byCategory,
    byTier,
    errors,
  };
}

/**
 * Create sample retail opening for testing
 */
export function createSampleRetailOpening(): RetailOpening {
  const samplePermit: SignagePermit = {
    permitId: 'SAMPLE-001',
    city: 'New York',
    neighborhood: 'SoHo',
    neighborhoodId: 'nyc-soho',
    address: '77 Greene Street',
    street: 'Greene Street',
    zipCode: '10012',
    filingDate: new Date().toISOString(),
    description: 'INSTALL NON-ILLUMINATED SIGN FOR HERMÈS BOUTIQUE',
    ownerName: 'HERMÈS OF PARIS INC',
    signType: 'Fascia Sign',
  };

  return {
    permit: samplePermit,
    brand: LUXURY_BRANDS.find((b) => b.name === 'Hermès')!,
    confidence: 'High',
    matchedText: 'HERMÈS',
  };
}
