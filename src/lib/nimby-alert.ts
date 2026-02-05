/**
 * NIMBY Alert Service
 *
 * Scrapes and parses Community Board / Council Meeting agendas
 * to alert residents about controversial upcoming votes.
 *
 * Strategy: "The Early Warning System"
 * - Controversy keywords in government PDFs
 * - Liquor licenses, zoning changes, social services on agenda
 * - Geofenced to Flâneur neighborhoods
 *
 * Data Sources:
 * - NYC Community Boards (Manhattan CB 1-12, Brooklyn CB 1-6)
 * - London Borough Councils (Westminster, Kensington & Chelsea)
 * - Sydney Councils (Woollahra, City of Sydney)
 *
 * Schedule: Weekly on Mondays at 6 AM UTC
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';

// ============================================================================
// TYPES
// ============================================================================

export type NimbyCity = 'New_York' | 'London' | 'Sydney';

export type ControversyCategory = 'liquor' | 'zoning' | 'social' | 'development' | 'noise';

export interface CommunityBoard {
  id: string;
  name: string;
  city: NimbyCity;
  agendaUrl: string;
  calendarUrl?: string;
  neighborhoodIds: string[];
  // Street patterns for geofencing within the board
  streetPatterns?: RegExp[];
}

export interface MeetingAgenda {
  boardId: string;
  boardName: string;
  city: NimbyCity;
  meetingDate: Date;
  meetingType: string;
  agendaUrl: string;
  pdfContent?: string;
}

export interface ControversyItem {
  id: string;
  category: ControversyCategory;
  title: string;
  description: string;
  address?: string;
  streetName?: string;
  matchedKeywords: string[];
  rawText: string;
  priority: 'high' | 'medium' | 'low';
}

export interface NimbyAlert {
  board: CommunityBoard;
  meeting: MeetingAgenda;
  items: ControversyItem[];
  neighborhoodId: string;
}

export interface NimbyStory {
  alert: NimbyAlert;
  headline: string;
  body: string;
  previewText: string;
  categoryLabel: string;
  targetNeighborhoods: string[];
}

// ============================================================================
// CONTROVERSY FILTERS (REGEX PATTERNS)
// ============================================================================

export const CONTROVERSY_PATTERNS: Record<ControversyCategory, RegExp[]> = {
  liquor: [
    /liquor\s*licen[sc]e/i,
    /alcohol\s*licen[sc]e/i,
    /new\s*liquor/i,
    /4\s*am|4am/i,
    /late[\s-]*night\s*licen[sc]e/i,
    /nightclub/i,
    /cabaret/i,
    /beer\s*garden/i,
    /rooftop\s*bar/i,
    /sidewalk\s*cafe/i,
    /outdoor\s*dining.*alcohol/i,
    /on[\s-]*premise.*licen[sc]e/i,
    /full\s*liquor/i,
    /wine\s*and\s*beer/i,
  ],
  zoning: [
    /zoning\s*variance/i,
    /upzoning/i,
    /rezoning/i,
    /height\s*restriction/i,
    /height\s*variance/i,
    /air\s*rights/i,
    /floor\s*area\s*ratio|FAR\s*increase/i,
    /special\s*permit/i,
    /use\s*variance/i,
    /bulk\s*variance/i,
    /setback\s*waiver/i,
    /landmark\s*alteration/i,
    /certificate\s*of\s*appropriateness/i,
  ],
  social: [
    /homeless\s*shelter/i,
    /shelter\s*facility/i,
    /dispensary/i,
    /cannabis|marijuana/i,
    /methadone\s*clinic/i,
    /treatment\s*facility/i,
    /hotel\s*conversion/i,
    /supportive\s*housing/i,
    /halfway\s*house/i,
    /group\s*home/i,
    /safe\s*injection/i,
    /needle\s*exchange/i,
  ],
  development: [
    /demolition\s*permit/i,
    /new\s*construction/i,
    /tower|high[\s-]*rise/i,
    /affordable\s*housing\s*waiver/i,
    /parking\s*variance/i,
    /loading\s*dock/i,
    /mechanical\s*equipment/i,
    /rooftop\s*addition/i,
    /rear\s*yard\s*variance/i,
    /lot\s*merger/i,
  ],
  noise: [
    /noise\s*variance/i,
    /extended\s*hours/i,
    /live\s*music/i,
    /outdoor\s*amplification/i,
    /special\s*event\s*permit/i,
    /street\s*fair/i,
    /block\s*party/i,
    /construction\s*hours/i,
  ],
};

// Priority keywords that elevate an item
const HIGH_PRIORITY_KEYWORDS = [
  /4\s*am|4am/i,
  /nightclub/i,
  /demolition/i,
  /homeless\s*shelter/i,
  /dispensary/i,
  /tower/i,
  /high[\s-]*rise/i,
];

// ============================================================================
// COMMUNITY BOARD CONFIGURATIONS
// ============================================================================

export const COMMUNITY_BOARDS: CommunityBoard[] = [
  // NYC Manhattan Community Boards
  {
    id: 'nyc-cb1',
    name: 'Manhattan Community Board 1',
    city: 'New_York',
    agendaUrl: 'https://www1.nyc.gov/site/manhattancb1/meetings/agendas.page',
    neighborhoodIds: ['nyc-tribeca', 'nyc-fidi'],
    streetPatterns: [
      /tribeca|greenwich|hudson|west\s*broadway|church\s*st/i,
      /wall\s*st|broad\s*st|water\s*st|front\s*st|pearl\s*st/i,
    ],
  },
  {
    id: 'nyc-cb2',
    name: 'Manhattan Community Board 2',
    city: 'New_York',
    agendaUrl: 'https://www1.nyc.gov/site/manhattancb2/meetings/agendas.page',
    neighborhoodIds: ['nyc-soho', 'nyc-west-village', 'nyc-greenwich-village'],
    streetPatterns: [
      /soho|prince\s*st|spring\s*st|broadway.*houston/i,
      /west\s*village|bleecker|christopher|hudson/i,
      /greenwich\s*village|washington\s*square|macdougal/i,
    ],
  },
  {
    id: 'nyc-cb4',
    name: 'Manhattan Community Board 4',
    city: 'New_York',
    agendaUrl: 'https://www1.nyc.gov/site/manhattancb4/meetings/agendas.page',
    neighborhoodIds: ['nyc-chelsea', 'nyc-hudson-yards', 'nyc-meatpacking'],
    streetPatterns: [
      /chelsea|10th\s*ave|9th\s*ave|23rd\s*st/i,
      /hudson\s*yards|34th\s*st.*west/i,
      /meatpacking|gansevoort|little\s*west\s*12th/i,
    ],
  },
  {
    id: 'nyc-cb5',
    name: 'Manhattan Community Board 5',
    city: 'New_York',
    agendaUrl: 'https://www1.nyc.gov/site/manhattancb5/meetings/agendas.page',
    neighborhoodIds: ['nyc-flatiron', 'nyc-nomad'],
    streetPatterns: [
      /flatiron|23rd\s*st.*5th|broadway.*23rd/i,
      /nomad|madison\s*square|28th\s*st/i,
    ],
  },
  {
    id: 'nyc-cb6',
    name: 'Manhattan Community Board 6',
    city: 'New_York',
    agendaUrl: 'https://www1.nyc.gov/site/manhattancb6/meetings/agendas.page',
    neighborhoodIds: ['nyc-gramercy', 'nyc-murray-hill'],
    streetPatterns: [
      /gramercy|irving\s*place|lexington.*20th/i,
      /murray\s*hill|park\s*ave.*30th/i,
    ],
  },
  {
    id: 'nyc-cb7',
    name: 'Manhattan Community Board 7',
    city: 'New_York',
    agendaUrl: 'https://www1.nyc.gov/site/manhattancb7/meetings/agendas.page',
    neighborhoodIds: ['nyc-upper-west-side'],
    streetPatterns: [
      /upper\s*west|columbus|amsterdam|broadway.*[67890]\d{1}th/i,
      /lincoln\s*center|central\s*park\s*west/i,
    ],
  },
  {
    id: 'nyc-cb8',
    name: 'Manhattan Community Board 8',
    city: 'New_York',
    agendaUrl: 'https://www1.nyc.gov/site/manhattancb8/meetings/agendas.page',
    neighborhoodIds: ['nyc-upper-east-side'],
    streetPatterns: [
      /upper\s*east|madison|lexington|park\s*ave.*[67890]\d{1}th/i,
      /museum\s*mile|5th\s*ave.*[789]\d{1}th/i,
    ],
  },
  // Brooklyn Community Boards
  {
    id: 'nyc-bk-cb1',
    name: 'Brooklyn Community Board 1',
    city: 'New_York',
    agendaUrl: 'https://www1.nyc.gov/site/brooklyncb1/meetings/agendas.page',
    neighborhoodIds: ['nyc-williamsburg', 'nyc-greenpoint'],
    streetPatterns: [
      /williamsburg|bedford|driggs|wythe/i,
      /greenpoint|manhattan\s*ave|mcguinness/i,
    ],
  },
  {
    id: 'nyc-bk-cb2',
    name: 'Brooklyn Community Board 2',
    city: 'New_York',
    agendaUrl: 'https://www1.nyc.gov/site/brooklyncb2/meetings/agendas.page',
    neighborhoodIds: ['nyc-dumbo', 'nyc-brooklyn-heights', 'nyc-cobble-hill'],
    streetPatterns: [
      /dumbo|water\s*st.*brooklyn|front\s*st.*brooklyn/i,
      /brooklyn\s*heights|montague|hicks\s*st/i,
      /cobble\s*hill|court\s*st|clinton\s*st/i,
    ],
  },
  {
    id: 'nyc-bk-cb6',
    name: 'Brooklyn Community Board 6',
    city: 'New_York',
    agendaUrl: 'https://www1.nyc.gov/site/brooklyncb6/meetings/agendas.page',
    neighborhoodIds: ['nyc-park-slope', 'nyc-gowanus'],
    streetPatterns: [
      /park\s*slope|7th\s*ave.*brooklyn|prospect\s*park\s*west/i,
      /gowanus|3rd\s*ave.*brooklyn|union\s*st/i,
    ],
  },

  // London Borough Councils
  {
    id: 'london-westminster',
    name: 'Westminster City Council',
    city: 'London',
    agendaUrl: 'https://committees.westminster.gov.uk/ieListMeetings.aspx?CId=136',
    calendarUrl: 'https://committees.westminster.gov.uk/ieListMeetings.aspx?CommitteeId=136',
    neighborhoodIds: ['london-mayfair', 'london-soho', 'london-marylebone'],
    streetPatterns: [
      /mayfair|bond\s*st|grosvenor|berkeley\s*square/i,
      /soho|wardour|dean\s*st|old\s*compton/i,
      /marylebone|baker\s*st|portland\s*place/i,
    ],
  },
  {
    id: 'london-kensington',
    name: 'Kensington & Chelsea Council',
    city: 'London',
    agendaUrl: 'https://www.rbkc.gov.uk/council-councillors-and-democracy/meetings-and-decisions',
    neighborhoodIds: ['london-chelsea', 'london-notting-hill', 'london-kensington'],
    streetPatterns: [
      /chelsea|kings?\s*road|sloane|fulham\s*road/i,
      /notting\s*hill|portobello|ladbroke/i,
      /kensington|high\s*st\s*kensington/i,
    ],
  },
  {
    id: 'london-camden',
    name: 'Camden Council',
    city: 'London',
    agendaUrl: 'https://democracy.camden.gov.uk/ieListMeetings.aspx?CId=178',
    neighborhoodIds: ['london-hampstead', 'london-primrose-hill'],
    streetPatterns: [
      /hampstead|heath\s*st|flask\s*walk/i,
      /primrose\s*hill|regents?\s*park\s*rd/i,
    ],
  },

  // Sydney Councils
  {
    id: 'sydney-woollahra',
    name: 'Woollahra Municipal Council',
    city: 'Sydney',
    agendaUrl: 'https://www.woollahra.nsw.gov.au/council/council-meetings',
    neighborhoodIds: ['sydney-paddington', 'sydney-double-bay'],
    streetPatterns: [
      /paddington|oxford\s*st|glenmore\s*rd/i,
      /double\s*bay|bay\s*st|new\s*south\s*head/i,
    ],
  },
  {
    id: 'sydney-city',
    name: 'City of Sydney Council',
    city: 'Sydney',
    agendaUrl: 'https://meetings.cityofsydney.nsw.gov.au/',
    neighborhoodIds: ['sydney-surry-hills', 'sydney-potts-point'],
    streetPatterns: [
      /surry\s*hills|crown\s*st|bourke\s*st/i,
      /potts\s*point|victoria\s*st|darlinghurst\s*rd/i,
    ],
  },
];

// ============================================================================
// PDF PARSING & TEXT EXTRACTION
// ============================================================================

/**
 * Extract text from PDF buffer
 * Uses pdf-parse library
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  try {
    // Dynamic import pdf-parse
    const { PDFParse } = await import('pdf-parse');
    // Create parser with buffer data
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
    const textResult = await parser.getText();
    return textResult.text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    return '';
  }
}

/**
 * Fetch PDF from URL and extract text
 */
export async function fetchAndParsePdf(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FlaneurBot/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return extractPdfText(buffer);
  } catch (error) {
    console.error(`Error fetching PDF from ${url}:`, error);
    return '';
  }
}

// ============================================================================
// AGENDA SCRAPERS BY CITY
// ============================================================================

/**
 * Scrape NYC Community Board agenda page
 * Returns list of meeting agendas with PDF links
 */
async function scrapeNYCAgendas(board: CommunityBoard): Promise<MeetingAgenda[]> {
  const agendas: MeetingAgenda[] = [];

  try {
    const response = await fetch(board.agendaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FlaneurBot/1.0)',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${board.name}: ${response.status}`);
      return agendas;
    }

    const html = await response.text();

    // Look for PDF links in the agenda page
    // NYC CB sites typically have patterns like:
    // /assets/.../Full_Board_Agenda.pdf
    // /assets/.../SLA_Committee_Agenda.pdf
    const pdfPattern = /href=["']([^"']*(?:agenda|meeting)[^"']*\.pdf)["']/gi;
    const datePattern = /(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/;

    let match;
    while ((match = pdfPattern.exec(html)) !== null) {
      const pdfUrl = match[1].startsWith('http')
        ? match[1]
        : `https://www1.nyc.gov${match[1].startsWith('/') ? '' : '/'}${match[1]}`;

      // Try to extract date from URL or surrounding context
      const dateMatch = pdfUrl.match(datePattern) || html.slice(Math.max(0, match.index - 100), match.index + 100).match(datePattern);

      let meetingDate = new Date();
      if (dateMatch) {
        const month = parseInt(dateMatch[1]);
        const day = parseInt(dateMatch[2]);
        const year = parseInt(dateMatch[3]) + (parseInt(dateMatch[3]) < 100 ? 2000 : 0);
        meetingDate = new Date(year, month - 1, day);
      }

      // Only include meetings within next 30 days
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      if (meetingDate >= thirtyDaysAgo && meetingDate <= thirtyDaysFromNow) {
        // Determine meeting type from URL
        let meetingType = 'Full Board';
        if (/sla|liquor|license/i.test(pdfUrl)) {
          meetingType = 'SLA/Licensing Committee';
        } else if (/land[\s_-]*use|zoning/i.test(pdfUrl)) {
          meetingType = 'Land Use Committee';
        } else if (/executive/i.test(pdfUrl)) {
          meetingType = 'Executive Committee';
        }

        agendas.push({
          boardId: board.id,
          boardName: board.name,
          city: board.city,
          meetingDate,
          meetingType,
          agendaUrl: pdfUrl,
        });
      }
    }
  } catch (error) {
    console.error(`Error scraping ${board.name}:`, error);
  }

  return agendas;
}

/**
 * Scrape London Borough Council agenda page
 */
async function scrapeLondonAgendas(board: CommunityBoard): Promise<MeetingAgenda[]> {
  const agendas: MeetingAgenda[] = [];

  try {
    const response = await fetch(board.agendaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FlaneurBot/1.0)',
      },
    });

    if (!response.ok) {
      return agendas;
    }

    const html = await response.text();

    // London council sites use Modern.gov platform
    // Look for meeting links with agenda documents
    const meetingPattern = /href=["']([^"']*ieListDocuments[^"']*)["'][^>]*>([^<]*(?:Licensing|Planning)[^<]*)/gi;

    let match;
    while ((match = meetingPattern.exec(html)) !== null) {
      const meetingUrl = match[1].startsWith('http')
        ? match[1]
        : new URL(match[1], board.agendaUrl).href;

      const meetingType = match[2].trim();

      // Try to extract date
      const dateMatch = html.slice(match.index, match.index + 200).match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);

      let meetingDate = new Date();
      if (dateMatch) {
        const months: Record<string, number> = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
        };
        meetingDate = new Date(
          parseInt(dateMatch[3]),
          months[dateMatch[2].toLowerCase().substring(0, 3)],
          parseInt(dateMatch[1])
        );
      }

      // Only future meetings within 30 days
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (meetingDate >= now && meetingDate <= thirtyDaysFromNow) {
        agendas.push({
          boardId: board.id,
          boardName: board.name,
          city: board.city,
          meetingDate,
          meetingType,
          agendaUrl: meetingUrl,
        });
      }
    }
  } catch (error) {
    console.error(`Error scraping ${board.name}:`, error);
  }

  return agendas;
}

/**
 * Scrape Sydney Council agenda page
 */
async function scrapeSydneyAgendas(board: CommunityBoard): Promise<MeetingAgenda[]> {
  const agendas: MeetingAgenda[] = [];

  try {
    const response = await fetch(board.agendaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FlaneurBot/1.0)',
      },
    });

    if (!response.ok) {
      return agendas;
    }

    const html = await response.text();

    // Sydney councils typically have "Business Papers" PDFs
    const pdfPattern = /href=["']([^"']*(?:business[\s_-]*paper|agenda)[^"']*\.pdf)["']/gi;

    let match;
    while ((match = pdfPattern.exec(html)) !== null) {
      const pdfUrl = match[1].startsWith('http')
        ? match[1]
        : new URL(match[1], board.agendaUrl).href;

      // Extract date from surrounding context
      const dateMatch = html.slice(Math.max(0, match.index - 100), match.index + 100)
        .match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);

      let meetingDate = new Date();
      if (dateMatch) {
        meetingDate = new Date(`${dateMatch[2]} ${dateMatch[1]}, ${dateMatch[3]}`);
      }

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (meetingDate >= now && meetingDate <= thirtyDaysFromNow) {
        agendas.push({
          boardId: board.id,
          boardName: board.name,
          city: board.city,
          meetingDate,
          meetingType: 'Council Meeting',
          agendaUrl: pdfUrl,
        });
      }
    }
  } catch (error) {
    console.error(`Error scraping ${board.name}:`, error);
  }

  return agendas;
}

/**
 * Scrape agendas for a community board based on city
 */
export async function scrapeAgendas(board: CommunityBoard): Promise<MeetingAgenda[]> {
  switch (board.city) {
    case 'New_York':
      return scrapeNYCAgendas(board);
    case 'London':
      return scrapeLondonAgendas(board);
    case 'Sydney':
      return scrapeSydneyAgendas(board);
    default:
      return [];
  }
}

// ============================================================================
// CONTROVERSY DETECTION
// ============================================================================

/**
 * Extract street name from text near a keyword match
 */
function extractStreetName(text: string, matchIndex: number): string | undefined {
  // Look in a window around the match
  const windowStart = Math.max(0, matchIndex - 200);
  const windowEnd = Math.min(text.length, matchIndex + 200);
  const window = text.slice(windowStart, windowEnd);

  // Common street patterns
  const streetPatterns = [
    // US patterns
    /(\d+(?:-\d+)?)\s+([NSEW]\.?\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Place|Pl|Drive|Dr|Lane|Ln|Way|Court|Ct)/i,
    // UK patterns
    /(\d+(?:-\d+)?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(Street|Road|Lane|Place|Square|Gardens|Terrace|Mews|Close)/i,
    // Named street without number
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(Street|St|Avenue|Ave|Road|Rd)/i,
  ];

  for (const pattern of streetPatterns) {
    const match = window.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return undefined;
}

/**
 * Determine priority based on matched keywords
 */
function determinePriority(matchedKeywords: string[]): 'high' | 'medium' | 'low' {
  for (const keyword of matchedKeywords) {
    for (const highPriorityPattern of HIGH_PRIORITY_KEYWORDS) {
      if (highPriorityPattern.test(keyword)) {
        return 'high';
      }
    }
  }

  // Multiple categories = medium priority
  if (matchedKeywords.length >= 3) {
    return 'medium';
  }

  return 'low';
}

/**
 * Scan agenda text for controversy items
 */
export function detectControversyItems(
  text: string,
  boardId: string
): ControversyItem[] {
  const items: ControversyItem[] = [];

  // Split text into sections/items (try to find natural breaks)
  const sections = text.split(/(?:\n\s*\n|\r\n\s*\r\n|item\s*\d+|agenda\s*item)/i);

  for (const section of sections) {
    if (section.length < 50) continue; // Skip very short sections

    const matchedKeywords: string[] = [];
    let category: ControversyCategory | null = null;

    // Check each category's patterns
    for (const [cat, patterns] of Object.entries(CONTROVERSY_PATTERNS)) {
      for (const pattern of patterns) {
        const match = section.match(pattern);
        if (match) {
          if (!category) {
            category = cat as ControversyCategory;
          }
          matchedKeywords.push(match[0]);
        }
      }
    }

    if (category && matchedKeywords.length > 0) {
      // Try to extract a title (first non-empty line or sentence)
      const titleMatch = section.match(/^[^\n.!?]*[.!?]?/);
      const title = titleMatch
        ? titleMatch[0].trim().substring(0, 100)
        : `${category.charAt(0).toUpperCase() + category.slice(1)} Matter`;

      // Extract street name if possible
      const streetName = extractStreetName(section, 0);

      // Create unique ID
      const id = `${boardId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      items.push({
        id,
        category,
        title,
        description: section.trim().substring(0, 500),
        streetName,
        matchedKeywords: [...new Set(matchedKeywords)],
        rawText: section.trim(),
        priority: determinePriority(matchedKeywords),
      });
    }
  }

  return items;
}

/**
 * Assign controversy item to specific neighborhood within board coverage
 */
export function assignToNeighborhood(
  item: ControversyItem,
  board: CommunityBoard
): string {
  // If we extracted a street name, try to match it to a specific neighborhood
  if (item.streetName && board.streetPatterns) {
    for (let i = 0; i < board.streetPatterns.length; i++) {
      if (board.streetPatterns[i].test(item.streetName)) {
        // Return the corresponding neighborhood
        if (board.neighborhoodIds[i]) {
          return board.neighborhoodIds[i];
        }
      }
    }
  }

  // Default to first neighborhood in board's coverage
  return board.neighborhoodIds[0];
}

// ============================================================================
// GEMINI STORY GENERATION
// ============================================================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const NIMBY_SYSTEM_PROMPT = `You are the Civic Alert Editor for Flâneur, a luxury neighborhood news platform.

Your tone is "Early Warning System" - informative, slightly urgent, empowering residents to participate.

Rules:
1. Never use sensational or fear-mongering language
2. Present facts neutrally but note potential impacts
3. Always include the meeting date and how to participate
4. Keep it concise - residents should be able to scan quickly
5. Reference specific streets or landmarks, not addresses
6. Avoid taking sides - present as civic information

Format: Return JSON with "headline" and "body" keys.`;

export async function generateNimbyStory(
  alert: NimbyAlert
): Promise<NimbyStory | null> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Get neighborhood name from ID
    const neighborhoodName = alert.neighborhoodId
      .replace(/^(nyc|london|sydney|la|paris)-/, '')
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const categoryLabels: Record<ControversyCategory, string> = {
      liquor: 'Licensing Alert',
      zoning: 'Zoning Watch',
      social: 'Community Notice',
      development: 'Development Alert',
      noise: 'Quality of Life',
    };

    // Determine primary category from items
    const categories = alert.items.map((i) => i.category);
    const primaryCategory = categories.sort(
      (a, b) =>
        categories.filter((c) => c === b).length -
        categories.filter((c) => c === a).length
    )[0];

    const prompt = `You are the Civic Editor for Flâneur in ${neighborhoodName}.

Meeting Information:
- Board: ${alert.board.name}
- Date: ${alert.meeting.meetingDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
- Meeting Type: ${alert.meeting.meetingType}

Agenda Items of Interest:
${alert.items.map((item) => `
- Category: ${item.category}
- Title: ${item.title}
- Keywords: ${item.matchedKeywords.join(', ')}
- Street/Location: ${item.streetName || 'Not specified'}
- Description excerpt: ${item.description.substring(0, 200)}...
`).join('\n')}

Write a concise alert for ${neighborhoodName} residents. Include:
1. What's being proposed/discussed
2. Why it matters to the neighborhood
3. When the meeting is and how to participate

Return JSON: { "headline": "...", "body": "...", "link_candidates": [{"text": "exact text from body"}] }

Include 1-2 link candidates for key entities mentioned in the body (streets, venues, organizations).`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: NIMBY_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
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
      const cityName = alert.board.city.replace(/_/g, ' ');
      body = injectHyperlinks(body, linkCandidates, { name: neighborhoodName, city: cityName });
    }

    return {
      alert,
      headline: parsed.headline,
      body,
      previewText: parsed.body.substring(0, 150) + '...',
      categoryLabel: categoryLabels[primaryCategory] || 'Civic Alert',
      targetNeighborhoods: [alert.neighborhoodId],
    };
  } catch (error) {
    console.error('Error generating NIMBY story:', error);
    return null;
  }
}

// ============================================================================
// MAIN PROCESSING PIPELINE
// ============================================================================

export interface ProcessResult {
  boardsScraped: number;
  agendasFound: number;
  controversiesDetected: number;
  storiesGenerated: number;
  byCity: Record<string, number>;
  byCategory: Record<string, number>;
  stories: NimbyStory[];
  errors: string[];
}

/**
 * Process all community boards and generate alerts
 */
export async function processNimbyAlerts(): Promise<ProcessResult> {
  const result: ProcessResult = {
    boardsScraped: 0,
    agendasFound: 0,
    controversiesDetected: 0,
    storiesGenerated: 0,
    byCity: {},
    byCategory: {},
    stories: [],
    errors: [],
  };

  for (const board of COMMUNITY_BOARDS) {
    try {
      console.log(`Processing ${board.name}...`);
      result.boardsScraped++;

      // Scrape agendas
      const agendas = await scrapeAgendas(board);
      result.agendasFound += agendas.length;

      for (const agenda of agendas) {
        try {
          // Fetch and parse PDF
          const pdfText = await fetchAndParsePdf(agenda.agendaUrl);

          if (!pdfText) {
            continue;
          }

          agenda.pdfContent = pdfText;

          // Detect controversy items
          const items = detectControversyItems(pdfText, board.id);

          if (items.length === 0) {
            continue;
          }

          result.controversiesDetected += items.length;

          // Track by category
          for (const item of items) {
            result.byCategory[item.category] = (result.byCategory[item.category] || 0) + 1;
          }

          // Group items by neighborhood
          const itemsByNeighborhood: Record<string, ControversyItem[]> = {};
          for (const item of items) {
            const neighborhoodId = assignToNeighborhood(item, board);
            if (!itemsByNeighborhood[neighborhoodId]) {
              itemsByNeighborhood[neighborhoodId] = [];
            }
            itemsByNeighborhood[neighborhoodId].push(item);
          }

          // Generate stories for each neighborhood
          for (const [neighborhoodId, neighborhoodItems] of Object.entries(itemsByNeighborhood)) {
            const alert: NimbyAlert = {
              board,
              meeting: agenda,
              items: neighborhoodItems,
              neighborhoodId,
            };

            const story = await generateNimbyStory(alert);

            if (story) {
              result.stories.push(story);
              result.storiesGenerated++;
              result.byCity[board.city] = (result.byCity[board.city] || 0) + 1;
            }
          }
        } catch (agendaError) {
          result.errors.push(`${board.name}/${agenda.meetingType}: ${agendaError instanceof Error ? agendaError.message : String(agendaError)}`);
        }
      }
    } catch (boardError) {
      result.errors.push(`${board.name}: ${boardError instanceof Error ? boardError.message : String(boardError)}`);
    }
  }

  return result;
}

// ============================================================================
// SAMPLE DATA FOR TESTING
// ============================================================================

export function createSampleAlerts(): NimbyAlert[] {
  const sampleBoard = COMMUNITY_BOARDS[1]; // CB2 (SoHo/West Village)

  return [
    {
      board: sampleBoard,
      meeting: {
        boardId: sampleBoard.id,
        boardName: sampleBoard.name,
        city: 'New_York',
        meetingDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
        meetingType: 'SLA/Licensing Committee',
        agendaUrl: 'https://example.com/agenda.pdf',
      },
      items: [
        {
          id: 'sample-1',
          category: 'liquor',
          title: 'New Full Liquor License Application',
          description: 'Application for full liquor license with 4am closing for new nightclub concept at 123 Spring Street. Proposed capacity: 200 persons. Outdoor seating requested.',
          streetName: '123 Spring Street',
          matchedKeywords: ['full liquor', '4am', 'nightclub'],
          rawText: 'Full text of agenda item...',
          priority: 'high',
        },
      ],
      neighborhoodId: 'nyc-soho',
    },
    {
      board: COMMUNITY_BOARDS[2], // CB4 (Chelsea)
      meeting: {
        boardId: 'nyc-cb4',
        boardName: 'Manhattan Community Board 4',
        city: 'New_York',
        meetingDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        meetingType: 'Land Use Committee',
        agendaUrl: 'https://example.com/agenda2.pdf',
      },
      items: [
        {
          id: 'sample-2',
          category: 'zoning',
          title: 'Zoning Variance for Height Increase',
          description: 'Application for zoning variance to allow 45-story tower at 10th Avenue and 23rd Street. Current zoning permits 25 stories. Air rights transfer from adjacent lot.',
          streetName: '10th Avenue and 23rd Street',
          matchedKeywords: ['zoning variance', 'tower', 'air rights'],
          rawText: 'Full text of agenda item...',
          priority: 'high',
        },
        {
          id: 'sample-3',
          category: 'social',
          title: 'Supportive Housing Facility',
          description: 'Proposal for 50-unit supportive housing facility for formerly homeless individuals on West 25th Street.',
          streetName: 'West 25th Street',
          matchedKeywords: ['supportive housing'],
          rawText: 'Full text of agenda item...',
          priority: 'medium',
        },
      ],
      neighborhoodId: 'nyc-chelsea',
    },
  ];
}
