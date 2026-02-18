/**
 * Nuisance Watch Service
 *
 * Aggregates 311/Council complaints to detect "Quality of Life" hotspots
 * (Noise, Pests, Cleanliness) in Flâneur neighborhoods.
 *
 * Strategy: "The Cluster Detector"
 * Raw 311 data is too noisy. We report HOTSPOTS and SPIKES, not single complaints.
 * A story triggers only when complaints exceed the NUISANCE_THRESHOLD.
 *
 * Privacy Rules:
 * - Commercial venues: Full address, name and shame
 * - Residential: Round to "100 Block" (e.g., "100 Block of Perry St")
 */

import { GoogleGenAI } from '@google/genai';
import { FLANEUR_NYC_CONFIG, ALL_TARGET_ZIPS } from '@/config/nyc-locations';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { AI_MODELS } from '@/config/ai-models';

/**
 * Nuisance thresholds
 */
export const NUISANCE_THRESHOLD = 5; // Minimum complaints to trigger a story
export const SPIKE_MULTIPLIER = 2; // 2x baseline = spike

/**
 * Complaint categories we track
 */
export type ComplaintCategory =
  | 'Noise - Commercial'
  | 'Noise - Residential'
  | 'Rodent'
  | 'Pest'
  | 'Homeless Encampment'
  | 'Sidewalk Condition'
  | 'Trash'
  | 'Graffiti'
  | 'Illegal Dumping';

/**
 * Category severity levels
 */
export type SeverityLevel = 'High' | 'Medium' | 'Low';

/**
 * Complaint category configuration
 */
interface CategoryConfig {
  nycTypes: string[]; // NYC 311 complaint_type values
  severity: SeverityLevel;
  signal: string; // What this category signals
  isCommercial: boolean;
  headlineTemplate: string;
}

/**
 * Category configurations
 */
export const COMPLAINT_CATEGORIES: Record<ComplaintCategory, CategoryConfig> = {
  'Noise - Commercial': {
    nycTypes: ['Noise - Commercial', 'Noise - Helicopter', 'Noise - Vehicle'],
    severity: 'High',
    signal: 'Nightlife friction',
    isCommercial: true,
    headlineTemplate: 'Noise Watch: {count} complaints filed near {location}',
  },
  'Noise - Residential': {
    nycTypes: ['Noise - Residential', 'Noise - Street/Sidewalk', 'Noise'],
    severity: 'Medium',
    signal: 'Neighbor friction',
    isCommercial: false,
    headlineTemplate: 'Block Watch: Noise complaints spike on {location}',
  },
  Rodent: {
    nycTypes: ['Rodent', 'Rat Sighting', 'Mouse Sighting'],
    severity: 'High',
    signal: 'Sanitation decline',
    isCommercial: false,
    headlineTemplate: 'Sanitation Alert: Pest reports surge near {location}',
  },
  Pest: {
    nycTypes: ['Harboring Bees/Wasps', 'Mosquitoes', 'Bed Bugs'],
    severity: 'Medium',
    signal: 'Building condition',
    isCommercial: false,
    headlineTemplate: 'Pest Watch: {count} reports near {location}',
  },
  'Homeless Encampment': {
    nycTypes: ['Homeless Encampment', 'Homeless Person Assistance'],
    severity: 'High',
    signal: 'Safety concern',
    isCommercial: false,
    headlineTemplate: 'Community Alert: Encampment concerns on {location}',
  },
  'Sidewalk Condition': {
    nycTypes: ['Sidewalk Condition', 'Damaged Tree', 'Overgrown Tree/Branches'],
    severity: 'Low',
    signal: 'Infrastructure neglect',
    isCommercial: false,
    headlineTemplate: 'Infrastructure Watch: Sidewalk issues on {location}',
  },
  Trash: {
    nycTypes: ['Dirty Conditions', 'Sanitation Condition', 'Missed Collection'],
    severity: 'Medium',
    signal: 'Sanitation service',
    isCommercial: false,
    headlineTemplate: 'Sanitation Spike: Trash complaints surge on {location}',
  },
  Graffiti: {
    nycTypes: ['Graffiti', 'Illegal Posting'],
    severity: 'Low',
    signal: 'Vandalism',
    isCommercial: false,
    headlineTemplate: 'Street Watch: Graffiti reports on {location}',
  },
  'Illegal Dumping': {
    nycTypes: ['Illegal Dumping', 'Derelict Vehicles', 'Derelict Bicycle'],
    severity: 'Medium',
    signal: 'Dumping activity',
    isCommercial: false,
    headlineTemplate: 'Dumping Alert: Illegal waste reported on {location}',
  },
};

/**
 * All NYC 311 complaint types we track
 */
export const ALL_NYC_COMPLAINT_TYPES = Object.values(COMPLAINT_CATEGORIES)
  .flatMap((c) => c.nycTypes);

/**
 * Raw 311 complaint record
 */
export interface RawComplaint {
  complaintId: string;
  createdDate: string;
  closedDate?: string;
  complaintType: string;
  descriptor?: string;
  address: string;
  street: string;
  crossStreets?: string; // "CROSS ST 1 and CROSS ST 2" fallback
  city: string;
  zipCode: string;
  borough?: string;
  latitude?: number;
  longitude?: number;
  status: string;
  resolutionDescription?: string;
  rawData?: Record<string, unknown>;
}

/**
 * Complaint cluster (grouped complaints)
 */
export interface ComplaintCluster {
  id: string;
  location: string; // Exact address or "100 Block of X St"
  displayLocation: string; // Privacy-safe display version
  street: string;
  neighborhood: string;
  neighborhoodId: string;
  category: ComplaintCategory;
  severity: SeverityLevel;
  count: number;
  complaints: RawComplaint[];
  isCommercial: boolean;
  venueName?: string; // If we can identify the commercial venue
  trend: 'spike' | 'elevated' | 'normal';
  baselineCount?: number; // Historical average
  percentChange?: number;
}

/**
 * Generated nuisance story
 */
export interface NuisanceStory {
  clusterId: string;
  category: ComplaintCategory;
  headline: string;
  body: string;
  previewText: string;
  location: string;
  displayLocation: string;
  neighborhood: string;
  neighborhoodId: string;
  complaintCount: number;
  severity: SeverityLevel;
  trend: 'spike' | 'elevated' | 'normal';
  generatedAt: string;
}

/**
 * Get neighborhood info from zip code
 */
function getNeighborhoodFromZip(zipCode: string): { key: string; id: string } | null {
  for (const [key, config] of Object.entries(FLANEUR_NYC_CONFIG)) {
    if (config.zips.includes(zipCode)) {
      const id = key.toLowerCase().replace(/\s+/g, '-');
      return { key, id: `nyc-${id}` };
    }
  }
  return null;
}

/**
 * Map NYC 311 complaint type to our category
 */
function mapComplaintType(nycType: string): ComplaintCategory | null {
  for (const [category, config] of Object.entries(COMPLAINT_CATEGORIES)) {
    if (config.nycTypes.some((t) => nycType.toLowerCase().includes(t.toLowerCase()))) {
      return category as ComplaintCategory;
    }
  }
  return null;
}

/**
 * Title-case a string ("BLEECKER STREET" → "Bleecker Street")
 */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Extract the street name from an address like "123 BLEECKER STREET"
 */
function extractStreetFromAddress(address: string): string {
  // Remove house number prefix to get street name
  return address.replace(/^\d+[-\s]*/, '').trim();
}

/**
 * Anonymize residential address to "100 Block" format
 * Falls back to street extraction from address, then cross streets
 */
function anonymizeAddress(address: string, street: string, crossStreets?: string): string {
  // Resolve the street name: prefer street_name, fall back to parsing address
  const resolvedStreet = titleCase(street || extractStreetFromAddress(address));

  // If we have a house number, round to block
  const match = address.match(/^(\d+)/);
  if (match && resolvedStreet) {
    const houseNumber = parseInt(match[1], 10);
    const block = Math.floor(houseNumber / 100) * 100;
    // "0 Block" looks odd — use just the street name for low numbers
    if (block === 0) return resolvedStreet;
    return `${block} Block of ${resolvedStreet}`;
  }

  // No house number but have a street
  if (resolvedStreet) return resolvedStreet;

  // Last resort: cross streets
  if (crossStreets) return titleCase(crossStreets);

  return '';
}

/**
 * Generate cluster ID from location and category
 */
function generateClusterId(location: string, category: ComplaintCategory): string {
  const cleanLocation = location.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const cleanCategory = category.toLowerCase().replace(/[^a-z]/g, '-');
  return `cluster-${cleanCategory}-${cleanLocation}`.substring(0, 60);
}

/**
 * Fetch NYC 311 complaints
 */
export async function fetchNYC311Complaints(
  since?: Date
): Promise<RawComplaint[]> {
  const complaints: RawComplaint[] = [];

  try {
    // NYC 311 Service Requests API
    const baseUrl = 'https://data.cityofnewyork.us/resource/erm2-nwe9.json';

    // Build date filter (default: last 7 days)
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateFilter = sinceDate.toISOString().split('T')[0];

    // Filter by our target zip codes and complaint types
    const zipList = ALL_TARGET_ZIPS.map((z) => `'${z}'`).join(',');
    const typeList = ALL_NYC_COMPLAINT_TYPES.map((t) => `'${t}'`).join(',');

    const whereClause = `created_date >= '${dateFilter}' AND incident_zip IN (${zipList}) AND complaint_type IN (${typeList})`;

    const params = new URLSearchParams({
      $where: whereClause,
      $limit: '2000',
      $order: 'created_date DESC',
    });

    const response = await fetch(`${baseUrl}?${params}`, {
      headers: {
        Accept: 'application/json',
        'X-App-Token': process.env.SOCRATA_APP_TOKEN || '',
      },
    });

    if (!response.ok) {
      console.error(`NYC 311 API returned ${response.status}`);
      return [];
    }

    const data = await response.json();

    for (const record of data) {
      const zipCode = record.incident_zip || '';
      if (!ALL_TARGET_ZIPS.includes(zipCode)) continue;

      const address = record.incident_address || '';
      const street = record.street_name || '';
      const cross1 = record.cross_street_1 || '';
      const cross2 = record.cross_street_2 || '';
      const crossStreets = cross1 && cross2
        ? `${cross1.trim()} and ${cross2.trim()}`
        : (cross1 || cross2).trim();

      complaints.push({
        complaintId: record.unique_key || `311-${Date.now()}`,
        createdDate: record.created_date || new Date().toISOString(),
        closedDate: record.closed_date,
        complaintType: record.complaint_type || '',
        descriptor: record.descriptor,
        address: address.trim(),
        street: street.trim(),
        crossStreets: crossStreets || undefined,
        city: record.city || 'New York',
        zipCode,
        borough: record.borough,
        latitude: record.latitude ? parseFloat(record.latitude) : undefined,
        longitude: record.longitude ? parseFloat(record.longitude) : undefined,
        status: record.status || 'Open',
        resolutionDescription: record.resolution_description,
        rawData: record,
      });
    }
  } catch (error) {
    console.error('NYC 311 fetch error:', error);
  }

  return complaints;
}

/**
 * Group complaints into clusters
 */
export function clusterComplaints(
  complaints: RawComplaint[]
): ComplaintCluster[] {
  const clusters: Map<string, ComplaintCluster> = new Map();

  for (const complaint of complaints) {
    const category = mapComplaintType(complaint.complaintType);
    if (!category) continue;

    const neighborhoodInfo = getNeighborhoodFromZip(complaint.zipCode);
    if (!neighborhoodInfo) continue;

    const categoryConfig = COMPLAINT_CATEGORIES[category];

    // Determine location key
    // For commercial: use exact address
    // For residential: use street name (will be aggregated)
    let locationKey: string;
    let displayLocation: string;

    if (categoryConfig.isCommercial && complaint.address) {
      locationKey = complaint.address.toLowerCase();
      displayLocation = complaint.address;
    } else {
      // Round to 100 block for privacy
      displayLocation = anonymizeAddress(complaint.address, complaint.street, complaint.crossStreets);
      locationKey = displayLocation.toLowerCase();
    }

    // Skip complaints with no resolvable location — they produce empty headlines
    if (!displayLocation) continue;

    const clusterId = generateClusterId(locationKey, category);

    if (clusters.has(clusterId)) {
      const existing = clusters.get(clusterId)!;
      existing.count++;
      existing.complaints.push(complaint);
    } else {
      clusters.set(clusterId, {
        id: clusterId,
        location: complaint.address,
        displayLocation,
        street: complaint.street,
        neighborhood: neighborhoodInfo.key,
        neighborhoodId: neighborhoodInfo.id,
        category,
        severity: categoryConfig.severity,
        count: 1,
        complaints: [complaint],
        isCommercial: categoryConfig.isCommercial,
        trend: 'normal',
      });
    }
  }

  // Convert to array and filter by threshold
  const clusterArray = Array.from(clusters.values())
    .filter((c) => c.count >= NUISANCE_THRESHOLD);

  // Sort by severity, then by count
  const severityOrder: Record<SeverityLevel, number> = {
    High: 0,
    Medium: 1,
    Low: 2,
  };

  clusterArray.sort((a, b) => {
    if (a.severity !== b.severity) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return b.count - a.count;
  });

  return clusterArray;
}

/**
 * Detect trend (spike vs elevated)
 */
export async function detectTrends(
  clusters: ComplaintCluster[],
  historicalData?: Map<string, number>
): Promise<ComplaintCluster[]> {
  // If we have historical data, calculate trends
  if (historicalData) {
    for (const cluster of clusters) {
      const baseline = historicalData.get(cluster.id);
      if (baseline && baseline > 0) {
        cluster.baselineCount = baseline;
        cluster.percentChange = Math.round(
          ((cluster.count - baseline) / baseline) * 100
        );

        if (cluster.count >= baseline * SPIKE_MULTIPLIER) {
          cluster.trend = 'spike';
        } else if (cluster.count > baseline) {
          cluster.trend = 'elevated';
        }
      } else {
        // No baseline = treat as spike if count is high
        cluster.trend = cluster.count >= NUISANCE_THRESHOLD * 2 ? 'spike' : 'elevated';
      }
    }
  } else {
    // Without historical data, infer from count
    for (const cluster of clusters) {
      if (cluster.count >= NUISANCE_THRESHOLD * 2) {
        cluster.trend = 'spike';
      } else {
        cluster.trend = 'elevated';
      }
    }
  }

  return clusters;
}

/**
 * Generate nuisance story using Gemini
 */
export async function generateNuisanceStory(
  cluster: ComplaintCluster
): Promise<NuisanceStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });
  const categoryConfig = COMPLAINT_CATEGORIES[cluster.category];

  // Build trend context
  let trendContext: string;
  if (cluster.trend === 'spike' && cluster.percentChange) {
    trendContext = `This represents a ${cluster.percentChange}% increase over the baseline. This is a SPIKE worth noting.`;
  } else if (cluster.trend === 'spike') {
    trendContext = `This is an unusually high volume for this location. This is a SPIKE worth noting.`;
  } else {
    trendContext = `This is elevated activity but not unusual for the area.`;
  }

  // Build category-specific guidance
  const categoryGuidance: Record<ComplaintCategory, string> = {
    'Noise - Commercial': `Focus on nightlife friction. Mention that neighbors are actively reporting. Imply scrutiny on the venue without libel.`,
    'Noise - Residential': `Focus on quality of life. Mention the block is experiencing friction. Keep it neighborly, not accusatory.`,
    Rodent: `Focus on sanitation. This is a "decline signal" - mention it factually but don't catastrophize. Residents expect action.`,
    Pest: `Focus on building conditions. This could indicate maintenance issues worth monitoring.`,
    'Homeless Encampment': `Handle sensitively. Focus on resident safety concerns without dehumanizing language. Mention community resources.`,
    'Sidewalk Condition': `Focus on infrastructure. Pedestrian safety is the angle. This is a city services story.`,
    Trash: `Focus on sanitation services. This could be a collection issue or illegal dumping.`,
    Graffiti: `Focus on the visual impact. Keep it light - graffiti can be controversial (art vs vandalism).`,
    'Illegal Dumping': `Focus on enforcement. Someone is treating the street as a dump. Residents are frustrated.`,
  };

  const systemPrompt = `You are the Community Editor for Flâneur, covering quality of life issues.

${categoryGuidance[cluster.category]}

Context:
- We found a cluster of ${cluster.count} complaints at ${cluster.displayLocation} in ${cluster.neighborhood}.
- ${trendContext}
- Signal: ${categoryConfig.signal}
- Severity: ${categoryConfig.severity}

Writing Style:
- Factual but engaged
- Mention specific complaint counts
- No accusatory language
- Reference the "neighbors are active" angle
- No emojis`;

  const prompt = `Complaint Category: ${cluster.category}
Location: ${cluster.displayLocation}
Street: ${cluster.street}
Neighborhood: ${cluster.neighborhood}
Complaint Count: ${cluster.count} in 7 days
Trend: ${cluster.trend}${cluster.percentChange ? ` (${cluster.percentChange}% change)` : ''}
Is Commercial Venue: ${cluster.isCommercial ? 'Yes' : 'No'}
${cluster.venueName ? `Venue Name: ${cluster.venueName}` : ''}

Sample Complaint Types: ${[...new Set(cluster.complaints.slice(0, 5).map((c) => c.descriptor || c.complaintType))].join(', ')}

Headline Template: "${categoryConfig.headlineTemplate}"
(Replace {count} with ${cluster.count} and {location} with ${cluster.displayLocation})

Task: Write a 40-word "Community Watch" blurb.

Body: Contextualize the volume. Example: "Neighbors are active this week. This represents [elevated/significant] activity for [Street/Block]. The complaints cite [specific issues from descriptors]."

Return JSON:
{
  "headline": "Headline under 70 chars using the template",
  "body": "40-word description contextualizing the complaints",
  "previewText": "One sentence teaser for feed",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 1-2 link candidates for key locations mentioned in the body (streets, blocks, venues).`;

  try {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: {
        temperature: 0.6, // Slightly lower for factual reporting
      },
    });

    const rawText = response.text || '';

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response for nuisance story');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || `${cluster.count} complaints filed near ${cluster.displayLocation} this week.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, { name: cluster.neighborhood, city: 'New York' });
    }

    // Build fallback headline from template
    const fallbackHeadline = categoryConfig.headlineTemplate
      .replace('{count}', cluster.count.toString())
      .replace('{location}', cluster.displayLocation);

    return {
      clusterId: cluster.id,
      category: cluster.category,
      headline: parsed.headline || fallbackHeadline,
      body,
      previewText: parsed.previewText || `Community Watch: ${cluster.category} concerns.`,
      location: cluster.location,
      displayLocation: cluster.displayLocation,
      neighborhood: cluster.neighborhood,
      neighborhoodId: cluster.neighborhoodId,
      complaintCount: cluster.count,
      severity: cluster.severity,
      trend: cluster.trend,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Nuisance story generation error for ${cluster.category}:`, error);
    return null;
  }
}

/**
 * Generate a consolidated roundup story for a neighborhood with multiple hotspots.
 * Instead of 5 separate articles, produces one "Noise Watch: 5 hotspots across {neighborhood}" article.
 */
export async function generateNuisanceRoundup(
  clusters: ComplaintCluster[],
  neighborhoodName: string,
  neighborhoodId: string
): Promise<NuisanceStory | null> {
  if (clusters.length < 2) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  const totalComplaints = clusters.reduce((sum, c) => sum + c.count, 0);
  const hotspotCount = clusters.length;

  // Sort clusters by complaint count descending
  const sorted = [...clusters].sort((a, b) => b.count - a.count);

  // Build location list for the prompt
  const locationList = sorted
    .map((c) => `- ${c.displayLocation}: ${c.count} complaints (${c.category}${c.isCommercial ? ', commercial venue' : ''})`)
    .join('\n');

  // Collect all descriptor types
  const allDescriptors = [
    ...new Set(sorted.flatMap((c) => c.complaints.slice(0, 3).map((comp) => comp.descriptor || comp.complaintType))),
  ].slice(0, 6);

  // Determine overall severity
  const hasHighSeverity = sorted.some((c) => c.severity === 'High');
  const hasSpike = sorted.some((c) => c.trend === 'spike');

  const systemPrompt = `You are the Community Editor for Flâneur, writing a neighborhood-wide noise roundup.

This is a ROUNDUP of ${hotspotCount} complaint hotspots across ${neighborhoodName}, totaling ${totalComplaints} complaints this week.

Writing Style:
- Factual, concise, informative
- Mention the total complaint count and number of hotspots
- Reference the top 2-3 locations by name with their counts
- Note the types of complaints (construction noise, nightlife, etc.)
- No accusatory language, no emojis
- Civic-engagement tone: "Neighbors are making their voices heard"`;

  const prompt = `Neighborhood: ${neighborhoodName}
Total Complaints: ${totalComplaints} across ${hotspotCount} locations in 7 days
${hasSpike ? 'TREND: Spike detected at multiple locations' : 'TREND: Elevated activity'}

Hotspot Locations:
${locationList}

Complaint Types: ${allDescriptors.join(', ')}

Task: Write a consolidated "Neighborhood Noise Roundup" blurb (60-80 words).

Headline: "Noise Watch: ${hotspotCount} hotspots, ${totalComplaints} complaints across ${neighborhoodName}"

Body: Summarize the week's noise activity across the neighborhood. Mention the top 2-3 locations by name with their complaint counts. Note the predominant complaint types.

Return JSON:
{
  "headline": "Under 70 chars",
  "body": "60-80 word roundup mentioning specific locations and counts",
  "previewText": "One sentence teaser for feed",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}`;

  try {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: { temperature: 0.6 },
    });

    const rawText = response.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from roundup response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Inject hyperlinks
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);
    let body = parsed.body || `${totalComplaints} complaints filed across ${hotspotCount} locations in ${neighborhoodName} this week.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, { name: neighborhoodName, city: 'New York' });
    }

    const fallbackHeadline = `Noise Watch: ${hotspotCount} hotspots, ${totalComplaints} complaints across ${neighborhoodName}`;

    return {
      clusterId: `roundup-${neighborhoodId}`,
      category: sorted[0].category, // Use the top cluster's category
      headline: parsed.headline || fallbackHeadline,
      body,
      previewText: parsed.previewText || `${totalComplaints} noise complaints across ${hotspotCount} locations in ${neighborhoodName}.`,
      location: neighborhoodName,
      displayLocation: neighborhoodName,
      neighborhood: neighborhoodName,
      neighborhoodId,
      complaintCount: totalComplaints,
      severity: hasHighSeverity ? 'High' : 'Medium',
      trend: hasSpike ? 'spike' : 'elevated',
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Nuisance roundup generation error for ${neighborhoodName}:`, error);
    return null;
  }
}

/**
 * Full pipeline: fetch, cluster, detect trends, generate stories
 */
export async function processNuisanceWatch(
  since?: Date
): Promise<{
  complaintsScanned: number;
  clustersDetected: number;
  storiesGenerated: number;
  stories: NuisanceStory[];
  clusters: ComplaintCluster[];
  byCategory: Record<ComplaintCategory, number>;
  bySeverity: Record<SeverityLevel, number>;
  byTrend: Record<'spike' | 'elevated' | 'normal', number>;
  errors: string[];
}> {
  const errors: string[] = [];
  const stories: NuisanceStory[] = [];
  const byCategory: Record<ComplaintCategory, number> = {
    'Noise - Commercial': 0,
    'Noise - Residential': 0,
    Rodent: 0,
    Pest: 0,
    'Homeless Encampment': 0,
    'Sidewalk Condition': 0,
    Trash: 0,
    Graffiti: 0,
    'Illegal Dumping': 0,
  };
  const bySeverity: Record<SeverityLevel, number> = {
    High: 0,
    Medium: 0,
    Low: 0,
  };
  const byTrend: Record<'spike' | 'elevated' | 'normal', number> = {
    spike: 0,
    elevated: 0,
    normal: 0,
  };

  // Fetch complaints
  const complaints = await fetchNYC311Complaints(since);
  const complaintsScanned = complaints.length;

  console.log(`Scanned ${complaintsScanned} 311 complaints`);

  // Cluster complaints
  let clusters = clusterComplaints(complaints);
  console.log(`Detected ${clusters.length} clusters above threshold`);

  // Detect trends
  clusters = await detectTrends(clusters);

  const clustersDetected = clusters.length;

  // Count by category, severity, trend
  for (const cluster of clusters) {
    byCategory[cluster.category]++;
    bySeverity[cluster.severity]++;
    byTrend[cluster.trend]++;
  }

  if (clusters.length === 0) {
    return {
      complaintsScanned,
      clustersDetected: 0,
      storiesGenerated: 0,
      stories: [],
      clusters: [],
      byCategory,
      bySeverity,
      byTrend,
      errors: [],
    };
  }

  // Generate stories for top clusters (limit to manage API costs)
  // Prioritize: High severity spikes first
  const topClusters = clusters
    .filter((c) => c.trend === 'spike' || c.severity === 'High')
    .slice(0, 10);

  for (const cluster of topClusters) {
    try {
      const story = await generateNuisanceStory(cluster);
      if (story) {
        stories.push(story);
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      errors.push(
        `${cluster.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    complaintsScanned,
    clustersDetected,
    storiesGenerated: stories.length,
    stories,
    clusters: topClusters,
    byCategory,
    bySeverity,
    byTrend,
    errors,
  };
}

/**
 * Create sample cluster for testing
 */
export function createSampleCluster(): ComplaintCluster {
  const now = new Date();

  const sampleComplaints: RawComplaint[] = Array(7)
    .fill(null)
    .map((_, i) => ({
      complaintId: `SAMPLE-${i}`,
      createdDate: new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString(),
      complaintType: 'Noise - Commercial',
      descriptor: 'Loud Music/Party',
      address: '123 Bleecker Street',
      street: 'Bleecker Street',
      city: 'New York',
      zipCode: '10014',
      borough: 'Manhattan',
      status: 'Open',
    }));

  return {
    id: 'sample-cluster-noise-commercial',
    location: '123 Bleecker Street',
    displayLocation: '123 Bleecker Street',
    street: 'Bleecker Street',
    neighborhood: 'West Village',
    neighborhoodId: 'nyc-west-village',
    category: 'Noise - Commercial',
    severity: 'High',
    count: 7,
    complaints: sampleComplaints,
    isCommercial: true,
    venueName: undefined,
    trend: 'spike',
    percentChange: 250,
  };
}
