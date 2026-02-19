/**
 * Vancouver View Cone Watch Service
 *
 * Monitors Vancouver development permits for height variance applications
 * that affect protected view cones (North Shore mountains, English Bay, etc.)
 *
 * Data source: Vancouver Open Data - Development Permits
 * https://opendata.vancouver.ca/explore/dataset/development-permits/
 *
 * Trigger: Any permit with keywords related to height variance or view cone relaxation
 * Target neighborhoods: vancouver-west-vancouver, vancouver-point-grey
 */

import { GoogleGenAI } from '@google/genai';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { AI_MODELS } from '@/config/ai-models';
import { insiderPersona } from '@/lib/ai-persona';

// Vancouver Open Data - Development Permits
const VANCOUVER_PERMITS_API =
  'https://opendata.vancouver.ca/api/records/1.0/search/';

// View cone / height variance keywords
const VIEW_CONE_KEYWORDS = [
  'variance',
  'relaxation',
  'height',
  'view cone',
  'view corridor',
  'roof elevation',
  'building height',
  'height relaxation',
  'height variance',
  'sight line',
  'view obstruction',
  'view protection',
  'setback variance',
  'floor space ratio',
  'fsr relaxation',
];

// Premium streets in West Vancouver / Point Grey
const PREMIUM_STREETS = [
  'marine drive',
  'belmont avenue',
  'drummond drive',
  'the crescent',
  'king george',
  'nw marine',
  'chancellor',
  'wesbrook',
  'university boulevard',
  'spanish banks',
  'westmount',
  'chartwell',
  'eyremount',
  'glenmore',
  'palmerston',
];

/**
 * Raw permit from Vancouver Open Data
 */
interface RawVancouverPermit {
  recordid?: string;
  fields?: {
    permitnumber?: string;
    permitelapseddays?: number;
    issueyear?: number;
    issuedate?: string;
    permitcategory?: string;
    permitcategorydesc?: string;
    propertyuse?: string;
    specificusecategory?: string;
    address?: string;
    projectdescription?: string;
    projectvalue?: string;
    typeofwork?: string;
    buildingcontractor?: string;
    buildingcontractoraddress?: string;
    applicant?: string;
    applicantaddress?: string;
    geo_point_2d?: number[];
  };
}

/**
 * Processed view cone permit
 */
export interface ViewConePermit {
  permitId: string;
  address: string;
  neighborhoodId: string;
  projectDescription: string;
  permitCategory: string;
  typeOfWork: string;
  projectValue: number | null;
  issueDate: string;
  applicant: string;
  matchedKeywords: string[];
  isPremiumStreet: boolean;
  latitude: number | null;
  longitude: number | null;
  rawData: Record<string, unknown>;
}

/**
 * Generated view cone story
 */
export interface ViewConeStory {
  permitId: string;
  neighborhoodId: string;
  headline: string;
  body: string;
  previewText: string;
  address: string;
  matchedKeywords: string[];
  generatedAt: string;
}

/**
 * Check if description contains view cone keywords
 */
function matchesViewConeKeywords(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return VIEW_CONE_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Check if address is on a premium street
 */
function isPremiumStreet(address: string): boolean {
  const lower = address.toLowerCase();
  return PREMIUM_STREETS.some((street) => lower.includes(street));
}

/**
 * Map address to neighborhood ID
 */
function mapToNeighborhood(address: string): string | null {
  const upper = address.toUpperCase();

  // West Vancouver indicators
  if (
    upper.includes('WEST VANCOUVER') ||
    upper.includes('BRITISH PROPERTIES') ||
    upper.includes('CHARTWELL') ||
    upper.includes('DUNDARAVE') ||
    upper.includes('AMBLESIDE') ||
    upper.includes('V7S') ||
    upper.includes('V7T') ||
    upper.includes('V7V')
  ) {
    return 'vancouver-west-vancouver';
  }

  // Point Grey indicators
  if (
    upper.includes('POINT GREY') ||
    upper.includes('SHAUGHNESSY') ||
    upper.includes('UBC') ||
    upper.includes('UNIVERSITY') ||
    upper.includes('BELMONT') ||
    upper.includes('NW MARINE') ||
    upper.includes('V6R') ||
    upper.includes('V6S') ||
    upper.includes('V6T')
  ) {
    return 'vancouver-point-grey';
  }

  return null;
}

/**
 * Fetch development permits from Vancouver Open Data
 */
export async function fetchViewConePermits(
  daysBack: number = 7
): Promise<ViewConePermit[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().split('T')[0];

  try {
    // Query Vancouver Open Data
    const params = new URLSearchParams({
      dataset: 'development-permits',
      rows: '500',
      sort: '-issuedate',
      q: `issuedate >= ${sinceStr}`,
    });

    const url = `${VANCOUVER_PERMITS_API}?${params}`;
    console.log(`Fetching Vancouver permits: ${url.substring(0, 80)}...`);

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error(`Vancouver API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const records: RawVancouverPermit[] = data.records || [];
    console.log(`Fetched ${records.length} Vancouver permit records`);

    const permits: ViewConePermit[] = [];

    for (const record of records) {
      const fields = record.fields || {};
      const description = fields.projectdescription || '';
      const address = fields.address || '';

      // Check for view cone keywords
      const matchedKeywords = matchesViewConeKeywords(description);
      if (matchedKeywords.length === 0) continue;

      // Map to neighborhood
      const neighborhoodId = mapToNeighborhood(address);
      if (!neighborhoodId) continue;

      const permitId =
        fields.permitnumber ||
        record.recordid ||
        `vcv-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      permits.push({
        permitId,
        address,
        neighborhoodId,
        projectDescription: description,
        permitCategory: fields.permitcategorydesc || fields.permitcategory || '',
        typeOfWork: fields.typeofwork || '',
        projectValue: fields.projectvalue ? parseFloat(fields.projectvalue) : null,
        issueDate: fields.issuedate || '',
        applicant: fields.applicant || 'Unknown',
        matchedKeywords,
        isPremiumStreet: isPremiumStreet(address),
        latitude: fields.geo_point_2d?.[0] || null,
        longitude: fields.geo_point_2d?.[1] || null,
        rawData: record as unknown as Record<string, unknown>,
      });
    }

    // Sort: Premium streets first, then by matched keywords count
    permits.sort((a, b) => {
      if (a.isPremiumStreet !== b.isPremiumStreet) {
        return a.isPremiumStreet ? -1 : 1;
      }
      return b.matchedKeywords.length - a.matchedKeywords.length;
    });

    console.log(`Filtered to ${permits.length} view cone permits`);
    return permits;
  } catch (error) {
    console.error('Vancouver permits fetch error:', error);
    return [];
  }
}

/**
 * Generate a view cone story using Gemini
 */
export async function generateViewConeStory(
  permit: ViewConePermit
): Promise<ViewConeStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Extract street name from address
  const streetMatch = permit.address.match(/\d+\s+(.+)/);
  const streetName = streetMatch ? streetMatch[1] : permit.address;

  const systemPrompt = `${insiderPersona('Vancouver', 'Editor')}

Writing Style:
- Tone: 'Concerned Neighbor' meets 'Urban Planning Wonk'
- Vancouver residents fight fiercely for their view corridors
- Reference the specific variance type (height, setback, FSR)
- Mention the objection/comment deadline if applicable
- No emojis`;

  const prompt = `Data:
- Address: ${permit.address}
- Project Description: ${permit.projectDescription.substring(0, 400)}
- Permit Category: ${permit.permitCategory}
- Type of Work: ${permit.typeOfWork}
- Matched Keywords: ${permit.matchedKeywords.join(', ')}
${permit.projectValue ? `- Project Value: $${permit.projectValue.toLocaleString()} CAD` : ''}
- Applicant: ${permit.applicant}

Task: Write a 50-word View Watch alert about this height variance / view cone application.

The headline should follow this format:
"View Watch: Height variance requested on ${streetName}"

Return JSON:
{
  "headline": "View Watch: [specific detail] (under 70 chars)",
  "body": "50-word description explaining what's proposed and why neighbors should care",
  "previewText": "One sentence teaser",
  "link_candidates": [{"text": "exact phrase from body"}]
}`;

  try {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: { temperature: 0.7 },
    });

    const rawText = response.text || '';

    // Extract JSON
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(
      parsed.link_candidates
    );

    // Inject hyperlinks
    let body =
      parsed.body ||
      `A height variance application has been filed for ${permit.address}.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, {
        name: 'West Vancouver',
        city: 'Vancouver',
      });
    }

    return {
      permitId: permit.permitId,
      neighborhoodId: permit.neighborhoodId,
      headline: parsed.headline || `View Watch: Variance requested on ${streetName}`,
      body,
      previewText: parsed.previewText || `Height variance alert for ${permit.address}.`,
      address: permit.address,
      matchedKeywords: permit.matchedKeywords,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('View cone story generation error:', error);
    return null;
  }
}

/**
 * Process all view cone permits and generate stories
 */
export async function processViewConePermits(daysBack: number = 7): Promise<{
  permits: ViewConePermit[];
  stories: ViewConeStory[];
  errors: string[];
}> {
  const errors: string[] = [];
  const stories: ViewConeStory[] = [];

  const permits = await fetchViewConePermits(daysBack);

  if (permits.length === 0) {
    return { permits: [], stories: [], errors: [] };
  }

  // Generate stories for top permits (limit to control costs)
  const topPermits = permits.slice(0, 5);

  for (const permit of topPermits) {
    try {
      const story = await generateViewConeStory(permit);
      if (story) {
        stories.push(story);
      }
      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      errors.push(
        `${permit.permitId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { permits, stories, errors };
}

/**
 * Get view cone permits for a specific neighborhood
 */
export async function getViewConePermitsForNeighborhood(
  neighborhoodId: string,
  daysBack: number = 7
): Promise<ViewConePermit[]> {
  const permits = await fetchViewConePermits(daysBack);
  return permits.filter((p) => p.neighborhoodId === neighborhoodId);
}
