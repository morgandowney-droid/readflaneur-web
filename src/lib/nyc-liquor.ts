/**
 * NYC Liquor License Watch Service
 *
 * Fetches liquor license data from NY State Open Data (public datasets)
 * and generates "Last Call" stories for Flâneur residents.
 *
 * Data sources:
 * - Pending licenses (f8i8-k2gm): New applications — most newsworthy
 * - Active licenses (9s3h-dpkz): Recently granted — confirmed openings
 *
 * Filtered to NYC zip codes within Flâneur coverage areas.
 */

import { GoogleGenAI } from '@google/genai';
import {
  ALL_TARGET_ZIPS,
  getNeighborhoodKeyFromZip,
  NEIGHBORHOOD_ID_TO_CONFIG,
} from '@/config/nyc-locations';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { AI_MODELS } from '@/config/ai-models';

// NY State Open Data endpoints (public, no auth required)
const NY_PENDING_LICENSES_API = 'https://data.ny.gov/resource/f8i8-k2gm.json';
const NY_ACTIVE_LICENSES_API = 'https://data.ny.gov/resource/9s3h-dpkz.json';

// NYC counties for filtering
const NYC_COUNTIES = ['New York', 'NEW YORK', 'Kings', 'KINGS', 'Queens', 'QUEENS', 'Bronx', 'BRONX', 'Richmond', 'RICHMOND'];

// Newsworthy license categories (skip grocery, manufacturer, wholesaler)
const NEWSWORTHY_DESCRIPTIONS = [
  'restaurant',
  'hotel',
  'club',
  'tavern',
  'bar',
  'food & beverage',
  'catering',
  'on-premises',
  'on premises',
];

// Categories to skip
const SKIP_DESCRIPTIONS = [
  'grocery',
  'drug store',
  'manufacturer',
  'wholesaler',
  'farm',
  'importer',
  'warehouse',
  'rectifier',
  'cider',
  'winery',
  'distiller',
  'brewer',
  'bottler',
];

/**
 * Liquor license event for story generation
 */
export interface LiquorLicenseEvent {
  applicationId: string;
  businessName: string;
  legalName: string;
  description: string;
  address: string;
  neighborhood: string;
  neighborhoodId: string;
  zipCode: string;
  status: 'pending' | 'approved' | 'new';
  receivedDate?: string;
  effectiveDate?: string;
  isPending: boolean;
}

/**
 * Generated liquor license story
 */
export interface LiquorStory {
  applicationId: string;
  neighborhoodId: string;
  headline: string;
  body: string;
  previewText: string;
  businessName: string;
  address: string;
  description: string;
  status: string;
  generatedAt: string;
}

/**
 * Check if a license description is newsworthy
 */
function isNewsworthy(description: string): boolean {
  const lower = description.toLowerCase();
  if (SKIP_DESCRIPTIONS.some((skip) => lower.includes(skip))) return false;
  if (NEWSWORTHY_DESCRIPTIONS.some((nw) => lower.includes(nw))) return true;
  // Also include liquor stores as they're interesting for neighborhoods
  if (lower.includes('liquor store')) return true;
  return false;
}

/**
 * Get neighborhood info from zip code
 */
function getNeighborhoodFromZip(
  zipCode: string,
  address: string
): { key: string; id: string } | null {
  const neighborhoodKey = getNeighborhoodKeyFromZip(zipCode, address);
  if (!neighborhoodKey) return null;

  const neighborhoodId = Object.entries(NEIGHBORHOOD_ID_TO_CONFIG).find(
    ([, configKey]) => configKey === neighborhoodKey
  )?.[0];

  if (!neighborhoodId) return null;
  return { key: neighborhoodKey, id: `nyc-${neighborhoodId}` };
}

/**
 * Fetch pending liquor license applications from NY State Open Data
 */
export async function fetchPendingLicenses(
  daysBack: number = 90
): Promise<LiquorLicenseEvent[]> {
  const events: LiquorLicenseEvent[] = [];

  try {
    const zipFilter = ALL_TARGET_ZIPS.map((z) => `'${z}'`).join(',');
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const sinceDateStr = sinceDate.toISOString().split('T')[0];

    const whereClause = `zip_code IN (${zipFilter}) AND received_date >= '${sinceDateStr}'`;

    const params = new URLSearchParams({
      $where: whereClause,
      $order: 'received_date DESC',
      $limit: '200',
    });

    const response = await fetch(`${NY_PENDING_LICENSES_API}?${params}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error(`Pending licenses API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    console.log(`Fetched ${data.length} pending license records`);

    for (const record of data) {
      const description = record.description || '';
      if (!isNewsworthy(description)) continue;

      const zipCode = record.zip_code || '';
      const address = record.actual_address_of_premises || '';
      const neighborhoodInfo = getNeighborhoodFromZip(zipCode, address);
      if (!neighborhoodInfo) continue;

      // Filter to NYC counties
      const county = record.premises_county || '';
      if (!NYC_COUNTIES.some((c) => c.toLowerCase() === county.toLowerCase())) continue;

      const businessName = record.dba || record.legalname || 'Unknown';

      events.push({
        applicationId: record.application_id || `pending-${Date.now()}`,
        businessName,
        legalName: record.legalname || '',
        description,
        address: address.trim(),
        neighborhood: neighborhoodInfo.key,
        neighborhoodId: neighborhoodInfo.id,
        zipCode,
        status: 'pending',
        receivedDate: record.received_date,
        isPending: true,
      });
    }
  } catch (error) {
    console.error('Pending licenses fetch error:', error);
  }

  return events;
}

/**
 * Fetch recently granted active liquor licenses from NY State Open Data
 */
export async function fetchNewActiveLicenses(
  daysBack: number = 60
): Promise<LiquorLicenseEvent[]> {
  const events: LiquorLicenseEvent[] = [];

  try {
    const zipFilter = ALL_TARGET_ZIPS.map((z) => `'${z}'`).join(',');
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const sinceDateStr = sinceDate.toISOString().split('T')[0];

    const whereClause = `zipcode IN (${zipFilter}) AND originalissuedate >= '${sinceDateStr}'`;

    const params = new URLSearchParams({
      $where: whereClause,
      $order: 'originalissuedate DESC',
      $limit: '200',
    });

    const response = await fetch(`${NY_ACTIVE_LICENSES_API}?${params}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error(`Active licenses API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    console.log(`Fetched ${data.length} new active license records`);

    for (const record of data) {
      const description = record.description || '';
      if (!isNewsworthy(description)) continue;

      const zipCode = record.zipcode || '';
      const address = record.actualaddressofpremises || '';
      const neighborhoodInfo = getNeighborhoodFromZip(zipCode, address);
      if (!neighborhoodInfo) continue;

      // Filter to NYC counties
      const county = record.premisescounty || '';
      if (!NYC_COUNTIES.some((c) => c.toLowerCase() === county.toLowerCase())) continue;

      const businessName = record.dba || record.legalname || 'Unknown';

      events.push({
        applicationId: record.licensepermitid || record.legacyserialnumber || `active-${Date.now()}`,
        businessName,
        legalName: record.legalname || '',
        description,
        address: address.trim(),
        neighborhood: neighborhoodInfo.key,
        neighborhoodId: neighborhoodInfo.id,
        zipCode,
        status: 'new',
        effectiveDate: record.effectivedate,
        receivedDate: record.originalissuedate,
        isPending: false,
      });
    }
  } catch (error) {
    console.error('Active licenses fetch error:', error);
  }

  return events;
}

/**
 * Generate a "Last Call" story for a liquor license event using Gemini
 */
export async function generateLiquorStory(
  event: LiquorLicenseEvent
): Promise<LiquorStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  const statusText = event.isPending
    ? 'has filed a new liquor license application'
    : 'has been granted a liquor license';

  const toneGuidance = event.isPending
    ? 'This is a pending application — create anticipation but note it is not yet confirmed.'
    : 'This license has been approved — the opening is confirmed.';

  const systemPrompt = `You are the Flâneur Editor writing a "Last Call" alert for ${event.neighborhood} residents.

Writing Style:
- Insider tone, useful for locals
- Reference specific streets
- Brief and scannable
- No emojis
- Focus on what this means for the neighborhood`;

  const dateLabel = event.isPending ? 'Filed' : 'Issued';
  const dateStr = event.receivedDate
    ? new Date(event.receivedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const prompt = `Data:
- Business: ${event.businessName}
- Legal Name: ${event.legalName}
- Type: ${event.description}
- Address: ${event.address}
- Neighborhood: ${event.neighborhood}
- Status: ${event.isPending ? 'Pending application' : 'Newly granted'}
${dateStr ? `- ${dateLabel} Date: ${dateStr}` : ''}

${toneGuidance}

Task: Write a 35-50 word blurb about this ${event.description.toLowerCase()} ${statusText} at ${event.address}.${dateStr ? ` Mention the ${dateLabel.toLowerCase()} date (${dateStr}) in the text.` : ''}

Return JSON:
{
  "headline": "Headline under 60 chars mentioning business and street",
  "body": "35-50 word alert about the license filing",
  "previewText": "One sentence teaser for feed",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 1-2 link candidates for key entities mentioned in the body (business name, street).`;

  try {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: { temperature: 0.7 },
    });

    const rawText = response.text || '';

    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response for liquor story');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    let body = parsed.body || `${event.businessName} ${statusText} at ${event.address}.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, { name: event.neighborhood, city: 'New York' });
    }

    return {
      applicationId: event.applicationId,
      neighborhoodId: event.neighborhoodId,
      headline: parsed.headline || `${event.businessName} files for liquor license at ${event.address}`,
      body,
      previewText: parsed.previewText || `${event.businessName} is coming to ${event.neighborhood}.`,
      businessName: event.businessName,
      address: event.address,
      description: event.description,
      status: event.isPending ? 'pending' : 'approved',
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Liquor story generation error:', error);
    return null;
  }
}

/**
 * Full pipeline: fetch pending + active, generate stories
 */
export async function processLiquorLicenses(
  daysBack: number = 90
): Promise<{
  pendingFetched: number;
  activeFetched: number;
  storiesGenerated: number;
  stories: LiquorStory[];
  errors: string[];
}> {
  const errors: string[] = [];
  const stories: LiquorStory[] = [];

  // Fetch from both datasets
  const [pendingEvents, activeEvents] = await Promise.all([
    fetchPendingLicenses(daysBack),
    fetchNewActiveLicenses(daysBack),
  ]);

  console.log(`Liquor watch: ${pendingEvents.length} pending, ${activeEvents.length} new active`);

  // Combine, prioritizing pending (more newsworthy) then active
  const allEvents = [...pendingEvents, ...activeEvents];

  // Deduplicate by business name + address (same venue may appear in both datasets)
  const seen = new Set<string>();
  const uniqueEvents = allEvents.filter((e) => {
    const key = `${e.businessName.toLowerCase()}-${e.address.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`${uniqueEvents.length} unique events after dedup`);

  // Generate stories in batches of 5 to stay within function timeout
  const topEvents = uniqueEvents.slice(0, 15);
  const BATCH_SIZE = 5;

  for (let i = 0; i < topEvents.length; i += BATCH_SIZE) {
    const batch = topEvents.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((event) => generateLiquorStory(event))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === 'fulfilled' && result.value) {
        stories.push(result.value);
      } else if (result.status === 'rejected') {
        errors.push(
          `${batch[j].businessName}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
        );
      }
    }

    // Brief pause between batches
    if (i + BATCH_SIZE < topEvents.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return {
    pendingFetched: pendingEvents.length,
    activeFetched: activeEvents.length,
    storiesGenerated: stories.length,
    stories,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────
// Backward-compatible exports for nyc-content-generator.ts
// and generate-nyc-weekly-digest/route.ts which read from the
// nyc_liquor_licenses staging table.
// ─────────────────────────────────────────────────────────────

export interface LiquorLicense {
  serial_number: string;
  license_type: string;
  license_type_code: string;
  premises_name: string;
  effective_date: string;
  expiration_date: string;
  zip_code: string;
  address: string;
  city: string;
  county: string;
  flaneur_neighborhood: string | null;
  neighborhood_id: string | null;
  raw_data: Record<string, unknown>;
}

export function categorizeLicense(license: LiquorLicense): string {
  const type = license.license_type.toLowerCase();
  if (type.includes('restaurant') || type.includes('on-premises') || type.includes('on premises')) return 'restaurant_bar';
  if (type.includes('wine') || type.includes('beer')) return 'wine_beer';
  if (type.includes('club')) return 'club';
  if (type.includes('hotel')) return 'hotel';
  if (type.includes('liquor store') || type.includes('package')) return 'retail';
  if (type.includes('grocery')) return 'grocery';
  if (type.includes('manufacturer') || type.includes('wholesaler') || type.includes('farm')) return 'manufacturer';
  return 'other';
}

export function isNewLicense(license: LiquorLicense): boolean {
  const raw = license.raw_data as Record<string, string>;
  if (raw.license_original_issue_date || raw.originalissuedate) {
    const original = new Date(raw.license_original_issue_date || raw.originalissuedate);
    const effective = new Date(license.effective_date);
    const daysDiff = Math.abs((effective.getTime() - original.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff < 90;
  }
  const effective = new Date(license.effective_date);
  const daysSince = (Date.now() - effective.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince < 90;
}
