/**
 * Palm Beach ARCOM Watch Service
 *
 * Monitors the Architectural Commission (ARCOM) agendas for Palm Beach Island.
 * ARCOM controls everything visible from the street - colors, landscaping,
 * materials, demolitions. Wealthy residents fight fiercely over aesthetic changes.
 *
 * Source: Town of Palm Beach ARCOM Agendas
 * https://www.townofpalmbeach.com/165/Architectural-Commission
 *
 * Keywords: demolition, landscape plan, hedge height, new estate, facade, etc.
 * Target neighborhoods: palm-beach-island
 */

import { GoogleGenAI } from '@google/genai';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { AI_MODELS } from '@/config/ai-models';
import { insiderPersona } from '@/lib/ai-persona';

// Town of Palm Beach agenda URLs
const ARCOM_AGENDA_URL =
  'https://www.townofpalmbeach.com/AgendaCenter/Architectural-Commission-5';

// ARCOM keywords that indicate significant changes
const ARCOM_KEYWORDS = [
  'demolition',
  'new construction',
  'new estate',
  'new residence',
  'landscape plan',
  'hedge height',
  'hedge variance',
  'wall height',
  'fence height',
  'major alteration',
  'major addition',
  'pool',
  'seawall',
  'dock',
  'garage',
  'guest house',
  'cabana',
  'color change',
  'exterior color',
  'roof material',
  'roof tile',
  'facade',
  'façade',
  'window replacement',
  'door replacement',
  'generator',
  'air conditioning',
  'mechanical equipment',
  'site plan',
  'setback',
  'variance',
];

// Premium streets on Palm Beach Island
const PREMIUM_STREETS = [
  'south ocean boulevard',
  'north ocean boulevard',
  'north lake way',
  'south lake drive',
  'north county road',
  'south county road',
  'worth avenue',
  'sea view avenue',
  'el bravo way',
  'el vedado',
  'jungle road',
  'banyan road',
  'root trail',
  'estate road',
  'clarendon',
  'seaspray',
  'seabreeze',
  'eden road',
  'indian road',
  'via marina',
];

/**
 * ARCOM project types
 */
export type ARCOMProjectType =
  | 'Demolition'
  | 'New Construction'
  | 'Major Alteration'
  | 'Minor Alteration'
  | 'Landscape'
  | 'Pool/Spa'
  | 'Wall/Fence/Hedge'
  | 'Color Change'
  | 'Mechanical'
  | 'Other';

/**
 * ARCOM agenda item
 */
export interface ARCOMAgendaItem {
  itemId: string;
  caseNumber: string;
  address: string;
  street: string;
  applicant: string;
  owner: string;
  projectType: ARCOMProjectType;
  description: string;
  meetingDate: string;
  status: 'Pending' | 'Approved' | 'Denied' | 'Continued' | 'Withdrawn';
  matchedKeywords: string[];
  isPremiumStreet: boolean;
  isControversial: boolean;
  contentionPoints: string[];
  rawData: Record<string, unknown>;
}

/**
 * ARCOM story/alert
 */
export interface ARCOMAlert {
  itemId: string;
  neighborhoodId: string;
  headline: string;
  body: string;
  previewText: string;
  address: string;
  projectType: ARCOMProjectType;
  meetingDate: string;
  contentionPoints: string[];
  generatedAt: string;
}

/**
 * Check if description contains ARCOM keywords
 */
function matchesARCOMKeywords(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return ARCOM_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Check if address is on a premium street
 */
function isPremiumStreet(address: string): boolean {
  const lower = address.toLowerCase();
  return PREMIUM_STREETS.some((street) => lower.includes(street));
}

/**
 * Determine project type from description
 */
function determineProjectType(description: string): ARCOMProjectType {
  const lower = description.toLowerCase();

  if (lower.includes('demolition') || lower.includes('demolish')) {
    return 'Demolition';
  }
  if (
    lower.includes('new construction') ||
    lower.includes('new residence') ||
    lower.includes('new estate')
  ) {
    return 'New Construction';
  }
  if (
    lower.includes('hedge') ||
    lower.includes('wall') ||
    lower.includes('fence')
  ) {
    return 'Wall/Fence/Hedge';
  }
  if (lower.includes('pool') || lower.includes('spa')) {
    return 'Pool/Spa';
  }
  if (
    lower.includes('landscape') ||
    lower.includes('landscaping') ||
    lower.includes('tree')
  ) {
    return 'Landscape';
  }
  if (lower.includes('color') || lower.includes('paint')) {
    return 'Color Change';
  }
  if (
    lower.includes('generator') ||
    lower.includes('mechanical') ||
    lower.includes('hvac') ||
    lower.includes('air conditioning')
  ) {
    return 'Mechanical';
  }
  if (
    lower.includes('major') ||
    lower.includes('addition') ||
    lower.includes('alteration')
  ) {
    return 'Major Alteration';
  }
  if (lower.includes('minor')) {
    return 'Minor Alteration';
  }

  return 'Other';
}

/**
 * Identify potential contention points
 */
function identifyContentionPoints(
  description: string,
  projectType: ARCOMProjectType
): string[] {
  const points: string[] = [];
  const lower = description.toLowerCase();

  // Hedge battles are legendary on Palm Beach
  if (lower.includes('hedge')) {
    if (lower.includes('height') || lower.includes('variance')) {
      points.push('Hedge height variance');
    }
    if (lower.includes('ficus') || lower.includes('clusia')) {
      points.push('Hedge species selection');
    }
  }

  // Wall and fence disputes
  if (lower.includes('wall') || lower.includes('fence')) {
    points.push('Wall/fence visibility from street');
  }

  // Color changes always controversial
  if (projectType === 'Color Change') {
    points.push('Exterior color palette approval');
  }

  // New construction visibility
  if (projectType === 'New Construction' || projectType === 'Demolition') {
    points.push('Neighborhood character impact');
  }

  // Mechanical equipment screening
  if (lower.includes('generator') || lower.includes('mechanical')) {
    points.push('Equipment screening requirements');
  }

  // Pool visibility
  if (lower.includes('pool')) {
    points.push('Pool/spa visibility and screening');
  }

  return points;
}

/**
 * Extract street name from address
 */
function extractStreetName(address: string): string {
  // Remove house number
  const streetMatch = address.match(/\d+\s+(.+)/);
  return streetMatch ? streetMatch[1] : address;
}

/**
 * Fetch ARCOM agenda items
 * Note: In production, this would scrape the actual agenda PDFs/HTML
 */
export async function fetchARCOMAgendaItems(
  daysAhead: number = 14
): Promise<ARCOMAgendaItem[]> {
  try {
    console.log(`Fetching ARCOM agenda items for next ${daysAhead} days...`);

    // In production, would fetch and parse actual agenda from:
    // https://www.townofpalmbeach.com/AgendaCenter/Architectural-Commission-5
    //
    // The agenda is typically a PDF or HTML document listing:
    // - Case numbers
    // - Addresses
    // - Applicant/Owner names
    // - Project descriptions
    // - Meeting dates

    // Return mock data for development
    return getMockARCOMItems();
  } catch (error) {
    console.error('ARCOM agenda fetch error:', error);
    return [];
  }
}

/**
 * Mock ARCOM agenda items for development
 */
function getMockARCOMItems(): ARCOMAgendaItem[] {
  const nextMeeting = new Date();
  nextMeeting.setDate(nextMeeting.getDate() + 7);
  const meetingDate = nextMeeting.toISOString().split('T')[0];

  const items: ARCOMAgendaItem[] = [
    {
      itemId: 'arcom-2026-001',
      caseNumber: 'ARC-2026-0042',
      address: '1095 North Ocean Boulevard',
      street: 'North Ocean Boulevard',
      applicant: 'Smith Architectural Group',
      owner: 'Trust Holdings LLC',
      projectType: 'Demolition',
      description:
        'Complete demolition of existing 1960s residence for construction of new 18,000 sq ft estate. New construction application to follow.',
      meetingDate,
      status: 'Pending',
      matchedKeywords: ['demolition', 'new estate'],
      isPremiumStreet: true,
      isControversial: true,
      contentionPoints: ['Neighborhood character impact'],
      rawData: {},
    },
    {
      itemId: 'arcom-2026-002',
      caseNumber: 'ARC-2026-0043',
      address: '240 El Bravo Way',
      street: 'El Bravo Way',
      applicant: 'Palm Beach Design Associates',
      owner: 'Johnson Family Trust',
      projectType: 'Wall/Fence/Hedge',
      description:
        'Request for variance to increase hedge height from 6 feet to 8 feet along north property line. Clusia hedge to replace existing ficus.',
      meetingDate,
      status: 'Pending',
      matchedKeywords: ['hedge height', 'hedge variance'],
      isPremiumStreet: true,
      isControversial: true,
      contentionPoints: ['Hedge height variance', 'Hedge species selection'],
      rawData: {},
    },
    {
      itemId: 'arcom-2026-003',
      caseNumber: 'ARC-2026-0044',
      address: '456 South County Road',
      street: 'South County Road',
      applicant: 'Coastal Architecture LLC',
      owner: 'Private Owner',
      projectType: 'Color Change',
      description:
        'Exterior color change from white to pale yellow (Benjamin Moore HC-4). Shutters to be repainted dark green.',
      meetingDate,
      status: 'Pending',
      matchedKeywords: ['color change', 'exterior color'],
      isPremiumStreet: true,
      isControversial: false,
      contentionPoints: ['Exterior color palette approval'],
      rawData: {},
    },
  ];

  return items;
}

/**
 * Generate ARCOM alert/story using Gemini
 */
export async function generateARCOMAlert(
  item: ARCOMAgendaItem
): Promise<ARCOMAlert | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Build contention context
  const contentionContext =
    item.contentionPoints.length > 0
      ? `Key contention point(s): ${item.contentionPoints.join(', ')}.`
      : '';

  // Project-specific tone guidance
  let toneGuidance: string;
  switch (item.projectType) {
    case 'Demolition':
      toneGuidance =
        "Tone: 'Eulogy meets Anticipation'. An era ends, another begins.";
      break;
    case 'New Construction':
      toneGuidance =
        "Tone: 'Watchful Observer'. New estates reshape the street.";
      break;
    case 'Wall/Fence/Hedge':
      toneGuidance =
        "Tone: 'Knowing Gossip'. Hedge wars are Palm Beach legend.";
      break;
    case 'Color Change':
      toneGuidance =
        "Tone: 'Amused Sophisticate'. Color choices are serious business.";
      break;
    default:
      toneGuidance =
        "Tone: 'Informed Neighbor'. Changes affect the streetscape.";
  }

  const systemPrompt = `${insiderPersona('Palm Beach Island', 'Design Editor')}

Writing Style:
- ${toneGuidance}
- ARCOM controls everything visible from the street
- Palm Beach has notoriously strict aesthetic standards
- Reference the specific address and street
- Mention the meeting date when neighbors can attend
- No emojis`;

  const prompt = `ARCOM Agenda Item:
- Address: ${item.address}
- Case Number: ${item.caseNumber}
- Project Type: ${item.projectType}
- Description: ${item.description}
- Meeting Date: ${item.meetingDate}
- Applicant: ${item.applicant}
${contentionContext}

Task: Write a 50-word Design Watch alert about this ARCOM review.

The headline should follow this format:
"Design Watch: ARCOM reviews ${item.address}"

Return JSON:
{
  "headline": "Design Watch: ARCOM reviews [address detail] (under 65 chars)",
  "body": "50-word description of what's proposed and why it matters",
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

    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const linkCandidates: LinkCandidate[] = validateLinkCandidates(
      parsed.link_candidates
    );

    let body =
      parsed.body ||
      `ARCOM is reviewing a ${item.projectType.toLowerCase()} proposal for ${item.address}.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, {
        name: 'Palm Beach Island',
        city: 'Palm Beach',
      });
    }

    return {
      itemId: item.itemId,
      neighborhoodId: 'palm-beach-island',
      headline: parsed.headline || `Design Watch: ARCOM reviews ${item.address}`,
      body,
      previewText: parsed.previewText || `ARCOM review for ${item.address}.`,
      address: item.address,
      projectType: item.projectType,
      meetingDate: item.meetingDate,
      contentionPoints: item.contentionPoints,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('ARCOM alert generation error:', error);
    return null;
  }
}

/**
 * Process ARCOM agenda and generate alerts
 */
export async function processARCOMAgenda(daysAhead: number = 14): Promise<{
  items: ARCOMAgendaItem[];
  alerts: ARCOMAlert[];
  byType: Record<ARCOMProjectType, number>;
  errors: string[];
}> {
  const errors: string[] = [];
  const alerts: ARCOMAlert[] = [];
  const byType: Record<ARCOMProjectType, number> = {
    Demolition: 0,
    'New Construction': 0,
    'Major Alteration': 0,
    'Minor Alteration': 0,
    Landscape: 0,
    'Pool/Spa': 0,
    'Wall/Fence/Hedge': 0,
    'Color Change': 0,
    Mechanical: 0,
    Other: 0,
  };

  const items = await fetchARCOMAgendaItems(daysAhead);

  // Count by type
  for (const item of items) {
    byType[item.projectType]++;
  }

  if (items.length === 0) {
    return { items: [], alerts: [], byType, errors: [] };
  }

  // Filter for significant items (premium streets, demolitions, controversial)
  const significantItems = items.filter(
    (item) =>
      item.isPremiumStreet ||
      item.projectType === 'Demolition' ||
      item.projectType === 'New Construction' ||
      item.isControversial ||
      item.matchedKeywords.length >= 2
  );

  // Generate alerts for top items
  const topItems = significantItems.slice(0, 5);

  for (const item of topItems) {
    try {
      const alert = await generateARCOMAlert(item);
      if (alert) {
        alerts.push(alert);
      }
      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      errors.push(
        `${item.itemId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { items, alerts, byType, errors };
}

/**
 * Get ARCOM items for next meeting
 */
export async function getUpcomingARCOMItems(): Promise<ARCOMAgendaItem[]> {
  const items = await fetchARCOMAgendaItems(14);
  // Sort by meeting date, then by premium street status
  return items.sort((a, b) => {
    const dateCompare =
      new Date(a.meetingDate).getTime() - new Date(b.meetingDate).getTime();
    if (dateCompare !== 0) return dateCompare;
    if (a.isPremiumStreet !== b.isPremiumStreet) {
      return a.isPremiumStreet ? -1 : 1;
    }
    return 0;
  });
}

/**
 * Check if an item is newsworthy
 */
export function isNewsworthyItem(item: ARCOMAgendaItem): boolean {
  // Demolitions are always newsworthy
  if (item.projectType === 'Demolition') return true;

  // New construction is newsworthy
  if (item.projectType === 'New Construction') return true;

  // Premium streets get coverage
  if (item.isPremiumStreet) return true;

  // Controversial items
  if (item.isControversial) return true;

  // Multiple keywords indicate significance
  if (item.matchedKeywords.length >= 2) return true;

  return false;
}
