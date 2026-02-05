/**
 * OIO Service - "Bunker Watch"
 *
 * Monitors New Zealand's Overseas Investment Office (OIO) decisions.
 * The OIO controls foreign purchases of "Sensitive Land" - the ultimate
 * signal of global titans (Thiel, Page, Cameron) moving in.
 *
 * Data source: LINZ (Land Information NZ) Decision Summaries
 * URL: https://www.linz.govt.nz/our-work/overseas-investment-regulation/decisions
 *
 * Filters:
 * - Asset Value > $10M NZD
 * - Location: Auckland, Queenstown, Wanaka, Central Otago
 * - Applicant: Often Trusts or LLCs hiding billionaire names
 */

import { GoogleGenAI } from '@google/genai';

// Gemini model for story generation
const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * OIO Decision from LINZ
 */
export interface OIODecision {
  decisionId: string;
  decisionDate: string;
  applicant: string;
  assetDescription: string;
  location: string;
  region: string;
  hectares?: number;
  assetValueNZD?: number;
  outcome: 'Approved' | 'Declined' | 'Withdrawn';
  sensitiveType: 'Sensitive Land' | 'Significant Business Assets' | 'Fishing Quota';
  conditions?: string;
  sourceUrl?: string;
}

/**
 * Generated Bunker Watch story
 */
export interface BunkerWatchStory {
  decisionId: string;
  headline: string;
  body: string;
  previewText: string;
  applicant: string;
  location: string;
  hectares?: number;
  assetValueNZD?: number;
  isObscuredApplicant: boolean;
  targetNeighborhoods: string[];
  generatedAt: string;
}

/**
 * Regions of interest for Bunker Watch
 */
const BUNKER_REGIONS = [
  'auckland',
  'waiheke',
  'queenstown',
  'wanaka',
  'wakatipu',
  'central otago',
  'otago',
  'arrowtown',
  'millbrook',
  'dalefield',
  'kelvin heights',
];

/**
 * Minimum asset value threshold ($10M NZD)
 */
const MIN_ASSET_VALUE = 10000000;

/**
 * Patterns indicating obscured/hidden ownership
 */
const OBSCURED_OWNERSHIP_PATTERNS = [
  /trust/i,
  /llc/i,
  /limited/i,
  /ltd/i,
  /holdings/i,
  /investments/i,
  /properties/i,
  /nominees/i,
  /trustees/i,
  /partnership/i,
  /ventures/i,
  /capital/i,
  /management/i,
  /pty/i,
];

/**
 * Map OIO location to Flâneur neighborhood IDs
 */
function mapToNeighborhoods(location: string): string[] {
  const upper = location.toUpperCase();
  const neighborhoods: string[] = [];

  // Auckland
  if (
    upper.includes('AUCKLAND') ||
    upper.includes('HERNE BAY') ||
    upper.includes('REMUERA')
  ) {
    neighborhoods.push('auckland-herne-bay', 'auckland-remuera');
  }

  if (upper.includes('WAIHEKE')) {
    neighborhoods.push('auckland-waiheke');
  }

  // Queenstown / Central Otago
  if (
    upper.includes('QUEENSTOWN') ||
    upper.includes('WAKATIPU') ||
    upper.includes('DALEFIELD') ||
    upper.includes('MILLBROOK') ||
    upper.includes('ARROWTOWN') ||
    upper.includes('WANAKA') ||
    upper.includes('CENTRAL OTAGO')
  ) {
    neighborhoods.push('queenstown-dalefield', 'queenstown-kelvin-heights');
  }

  if (upper.includes('KELVIN HEIGHTS')) {
    if (!neighborhoods.includes('queenstown-kelvin-heights')) {
      neighborhoods.push('queenstown-kelvin-heights');
    }
  }

  return neighborhoods;
}

/**
 * Check if applicant name appears to be a trust/LLC hiding identity
 */
export function isObscuredApplicant(applicant: string): boolean {
  return OBSCURED_OWNERSHIP_PATTERNS.some((p) => p.test(applicant));
}

/**
 * Check if decision is relevant to Bunker Watch
 */
function isRelevantDecision(decision: OIODecision): boolean {
  // Only approved decisions
  if (decision.outcome !== 'Approved') return false;

  // Only sensitive land
  if (decision.sensitiveType !== 'Sensitive Land') return false;

  // Check location matches our regions
  const locationLower = decision.location.toLowerCase();
  const regionLower = decision.region.toLowerCase();
  const isRelevantLocation = BUNKER_REGIONS.some(
    (r) => locationLower.includes(r) || regionLower.includes(r)
  );
  if (!isRelevantLocation) return false;

  // Check asset value threshold
  if (decision.assetValueNZD && decision.assetValueNZD < MIN_ASSET_VALUE) {
    return false;
  }

  return true;
}

/**
 * Fetch OIO decisions from LINZ
 *
 * In production, this would scrape:
 * https://www.linz.govt.nz/our-work/overseas-investment-regulation/decisions
 */
export async function fetchOIODecisions(
  since?: Date
): Promise<OIODecision[]> {
  const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  console.log(`Fetching OIO decisions since ${sinceDate.toISOString()}`);

  // In production, this would:
  // 1. Fetch the LINZ decisions page
  // 2. Parse the decision summaries table
  // 3. Filter by date
  // 4. Return structured data
  //
  // The LINZ page publishes monthly summaries with:
  // - Decision Date
  // - Applicant Name
  // - Asset Description
  // - Location
  // - Hectares
  // - Asset Value
  // - Outcome

  // Placeholder: Return empty array
  // In production, implement actual scraping
  return [];
}

/**
 * Filter decisions for Bunker Watch relevance
 */
export function filterRelevantDecisions(
  decisions: OIODecision[]
): OIODecision[] {
  return decisions.filter(isRelevantDecision);
}

/**
 * Generate Bunker Watch story for an OIO decision
 */
export async function generateBunkerWatchStory(
  decision: OIODecision
): Promise<BunkerWatchStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  const isObscured = isObscuredApplicant(decision.applicant);
  const targetNeighborhoods = mapToNeighborhoods(decision.location);

  if (targetNeighborhoods.length === 0) {
    console.log(`No target neighborhoods for location: ${decision.location}`);
    return null;
  }

  // Format values
  const hectaresStr = decision.hectares
    ? `${decision.hectares.toLocaleString()} hectares`
    : 'undisclosed acreage';
  const valueStr = decision.assetValueNZD
    ? `$${(decision.assetValueNZD / 1000000).toFixed(1)}M NZD`
    : 'undisclosed value';

  const systemPrompt = `You are the Flâneur Bunker Watch editor for New Zealand.

New Zealand's Overseas Investment Office (OIO) controls foreign purchases of "Sensitive Land."
Approved acquisitions signal global titans establishing footholds in NZ.

Tone: Understated intrigue. "The paperwork is filed, the gates are going up."
Style: Factual but suggestive. Note if the applicant is a Trust/LLC (often hiding billionaire names).

Do not speculate on the identity behind trusts. Do not mention specific tech billionaires by name.
Focus on the location, scale, and what this signals about the area.`;

  const prompt = `OIO Decision Approved:
Applicant: ${decision.applicant}
Asset: ${decision.assetDescription}
Location: ${decision.location}
Region: ${decision.region}
Size: ${hectaresStr}
Value: ${valueStr}
Applicant Type: ${isObscured ? 'Corporate Entity (Trust/LLC)' : 'Named Individual'}

Task: Write a "Bunker Watch" alert for Flâneur readers in ${decision.region}.

Return JSON:
{
  "headline": "Bunker Alert: [brief headline under 70 chars]",
  "body": "35-word description noting the acquisition and what it signals",
  "previewText": "One sentence teaser"
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
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      decisionId: decision.decisionId,
      headline:
        parsed.headline ||
        `Bunker Alert: OIO approves ${valueStr} acquisition in ${decision.region}`,
      body:
        parsed.body ||
        `A foreign entity has received approval to acquire ${hectaresStr} of sensitive land in ${decision.location}.`,
      previewText:
        parsed.previewText ||
        `New foreign land acquisition approved in ${decision.region}.`,
      applicant: decision.applicant,
      location: decision.location,
      hectares: decision.hectares,
      assetValueNZD: decision.assetValueNZD,
      isObscuredApplicant: isObscured,
      targetNeighborhoods,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Bunker Watch story generation error:', error);
    return null;
  }
}

/**
 * Process all OIO decisions for Bunker Watch
 */
export async function processBunkerWatch(
  since?: Date
): Promise<{
  decisionsFound: number;
  relevantDecisions: number;
  storiesGenerated: number;
  stories: BunkerWatchStory[];
  errors: string[];
}> {
  const errors: string[] = [];
  const stories: BunkerWatchStory[] = [];

  // Fetch decisions
  const allDecisions = await fetchOIODecisions(since);
  const decisionsFound = allDecisions.length;

  // Filter for relevance
  const relevant = filterRelevantDecisions(allDecisions);
  const relevantDecisions = relevant.length;

  console.log(
    `OIO Bunker Watch: ${decisionsFound} total, ${relevantDecisions} relevant`
  );

  // Generate stories
  for (const decision of relevant) {
    try {
      const story = await generateBunkerWatchStory(decision);
      if (story) {
        stories.push(story);
      }
      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      errors.push(
        `${decision.decisionId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    decisionsFound,
    relevantDecisions,
    storiesGenerated: stories.length,
    stories,
    errors,
  };
}

/**
 * Create sample OIO decision for testing
 */
export function createSampleOIODecision(): OIODecision {
  return {
    decisionId: 'sample-oio-2026-001',
    decisionDate: new Date().toISOString().split('T')[0],
    applicant: 'Pacific Ventures Trust Limited',
    assetDescription:
      'Rural lifestyle property with existing homestead and outbuildings',
    location: 'Dalefield, Queenstown',
    region: 'Otago',
    hectares: 125,
    assetValueNZD: 28500000,
    outcome: 'Approved',
    sensitiveType: 'Sensitive Land',
    conditions: 'Standard conditions apply',
    sourceUrl:
      'https://www.linz.govt.nz/our-work/overseas-investment-regulation/decisions',
  };
}
