/**
 * Fashion Week Service
 *
 * Special Event engine that triggers high-alert coverage during
 * Global Fashion Weeks (NYFW, LFW, MFW, PFW).
 *
 * Architecture: "The Calendar Override"
 * - Detect active Fashion Week windows
 * - Scrape official show schedules daily
 * - Map venue addresses to Flâneur neighborhoods
 * - Generate "Traffic Alert" + "Runway Watch" stories
 * - Override daily briefs into "Fashion Mode"
 *
 * Schedule: Daily at 5 AM UTC during active fashion weeks
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_MODELS } from '@/config/ai-models';
import {
  FASHION_CALENDAR,
  FashionWeekConfig,
  FashionWeekCity,
  getFashionWeekConfig,
} from '@/config/fashion-weeks';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { insiderPersona } from '@/lib/ai-persona';

// ============================================================================
// TYPES
// ============================================================================

export type FashionWeekState = 'upcoming' | 'active' | 'ended' | 'off_season';

export interface FashionWeekWindow {
  config: FashionWeekConfig;
  state: FashionWeekState;
  startDate: Date;
  endDate: Date;
  currentDay?: number; // Day 1, 2, 3... of the week
  daysUntilStart?: number;
}

export interface ShowSchedule {
  id: string;
  designer: string;
  venue: string;
  venueAddress?: string;
  time: string;
  date: Date;
  neighborhoodId?: string;
  isHighProfile: boolean;
}

export interface DailyShowSummary {
  fashionWeek: FashionWeekConfig;
  date: Date;
  dayNumber: number;
  totalShows: number;
  showsByNeighborhood: Record<string, ShowSchedule[]>;
  highProfileCount: number;
  trafficAlerts: string[];
}

export interface FashionWeekStory {
  fashionWeek: FashionWeekConfig;
  summary: DailyShowSummary;
  neighborhoodId: string;
  headline: string;
  body: string;
  previewText: string;
  categoryLabel: string;
  priority: 'hero' | 'high' | 'normal';
}

// High-profile designers that warrant extra coverage
const HIGH_PROFILE_DESIGNERS = [
  // NYFW
  'Marc Jacobs', 'Michael Kors', 'Ralph Lauren', 'Tom Ford', 'Carolina Herrera',
  'Oscar de la Renta', 'Proenza Schouler', 'Altuzarra', 'Tory Burch', 'Coach',
  // LFW
  'Burberry', 'JW Anderson', 'Simone Rocha', 'Erdem', 'Victoria Beckham',
  'Christopher Kane', 'Roksanda', 'Molly Goddard', 'Richard Quinn',
  // MFW
  'Prada', 'Gucci', 'Versace', 'Dolce & Gabbana', 'Armani', 'Fendi',
  'Bottega Veneta', 'Moschino', 'Missoni', 'Etro', 'Marni', 'Max Mara',
  // PFW
  'Chanel', 'Dior', 'Louis Vuitton', 'Saint Laurent', 'Balenciaga', 'Valentino',
  'Givenchy', 'Hermès', 'Celine', 'Loewe', 'Miu Miu', 'Schiaparelli', 'Maison Margiela',
];

// Traffic impact keywords
const TRAFFIC_IMPACT_KEYWORDS = [
  'tuileries', 'grand palais', 'palais de tokyo', 'place vendome', 'concorde',
  'spring studios', 'skylight', 'pier 59', 'the shed',
  '180 strand', 'freemasons hall', 'royal academy',
  'via montenapoleone', 'piazza duomo', 'fondazione prada',
];

// ============================================================================
// FASHION WEEK WINDOW DETECTION
// ============================================================================

/**
 * Calculate the approximate date range for a fashion week
 */
function calculateFashionWeekDates(config: FashionWeekConfig, month: number, year: number): { start: Date; end: Date } {
  // Fashion weeks typically occur in the 2nd-4th week of the month
  const weekStart = (config.typicalWeek - 1) * 7 + 1;
  const start = new Date(year, month - 1, weekStart);
  const end = new Date(start.getTime() + config.durationDays * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Check if we're currently in or near a fashion week window
 */
export function detectFashionWeekWindow(date: Date = new Date()): FashionWeekWindow[] {
  const windows: FashionWeekWindow[] = [];
  const year = date.getFullYear();
  const currentMonth = date.getMonth() + 1; // 1-12

  for (const config of FASHION_CALENDAR) {
    for (const month of config.months) {
      // Check current year
      const { start, end } = calculateFashionWeekDates(config, month, year);

      // Also check if we're approaching (within 14 days)
      const daysUntilStart = Math.floor((start.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
      const daysUntilEnd = Math.floor((end.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));

      let state: FashionWeekState = 'off_season';
      let currentDay: number | undefined;

      if (date >= start && date <= end) {
        state = 'active';
        currentDay = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      } else if (daysUntilStart > 0 && daysUntilStart <= 14) {
        state = 'upcoming';
      } else if (daysUntilEnd < 0 && daysUntilEnd >= -3) {
        state = 'ended';
      }

      if (state !== 'off_season') {
        windows.push({
          config,
          state,
          startDate: start,
          endDate: end,
          currentDay,
          daysUntilStart: daysUntilStart > 0 ? daysUntilStart : undefined,
        });
      }
    }
  }

  return windows;
}

/**
 * Check if a specific city's fashion week is currently active
 */
export function isFashionWeekActive(city: FashionWeekCity, date: Date = new Date()): boolean {
  const windows = detectFashionWeekWindow(date);
  return windows.some((w) => w.config.city === city && w.state === 'active');
}

/**
 * Get all currently active fashion weeks
 */
export function getActiveFashionWeeks(date: Date = new Date()): FashionWeekWindow[] {
  return detectFashionWeekWindow(date).filter((w) => w.state === 'active');
}

// ============================================================================
// SHOW SCHEDULE SCRAPING
// ============================================================================

/**
 * Scrape NYFW schedule from official sources
 */
async function scrapeNYFWSchedule(date: Date): Promise<ShowSchedule[]> {
  const shows: ShowSchedule[] = [];
  const config = getFashionWeekConfig('New_York')!;

  try {
    // CFDA Calendar API or scrape
    const response = await fetch('https://cfda.com/fashion-calendar', {
      headers: { 'User-Agent': 'Flaneur/1.0 (Fashion Coverage)' },
    });

    if (response.ok) {
      const html = await response.text();
      // Parse schedule from HTML
      // Look for patterns like "Designer Name at Venue, Time"
      const schedulePattern = /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-?\s*([A-Z][a-zA-Z\s&]+?)\s*(?:at|@)\s*([A-Za-z\s]+)/gi;
      let match;

      while ((match = schedulePattern.exec(html)) !== null) {
        const [, time, designer, venue] = match;
        const venueConfig = config.venues.find((v) =>
          venue.toLowerCase().includes(v.name.toLowerCase().split(' ')[0])
        );

        shows.push({
          id: `nyfw-${date.toISOString().split('T')[0]}-${designer.replace(/\s/g, '-')}`,
          designer: designer.trim(),
          venue: venue.trim(),
          venueAddress: venueConfig?.address,
          time,
          date,
          neighborhoodId: venueConfig?.neighborhoodId,
          isHighProfile: HIGH_PROFILE_DESIGNERS.some((d) =>
            designer.toLowerCase().includes(d.toLowerCase())
          ),
        });
      }
    }
  } catch (error) {
    console.error('Error scraping NYFW schedule:', error);
  }

  // If scraping fails, use known venues to estimate
  if (shows.length === 0) {
    for (const venue of config.venues) {
      shows.push({
        id: `nyfw-${date.toISOString().split('T')[0]}-${venue.name.replace(/\s/g, '-')}`,
        designer: 'Multiple Designers',
        venue: venue.name,
        venueAddress: venue.address,
        time: 'Various',
        date,
        neighborhoodId: venue.neighborhoodId,
        isHighProfile: false,
      });
    }
  }

  return shows;
}

/**
 * Scrape LFW schedule
 */
async function scrapeLFWSchedule(date: Date): Promise<ShowSchedule[]> {
  const shows: ShowSchedule[] = [];
  const config = getFashionWeekConfig('London')!;

  try {
    const response = await fetch('https://londonfashionweek.co.uk/schedule', {
      headers: { 'User-Agent': 'Flaneur/1.0 (Fashion Coverage)' },
    });

    if (response.ok) {
      const html = await response.text();
      // Parse British Fashion Council schedule format
      const schedulePattern = /(\d{1,2}:\d{2})\s*([A-Z][a-zA-Z\s&]+)/gi;
      let match;

      while ((match = schedulePattern.exec(html)) !== null) {
        const [, time, designer] = match;
        // Default to 180 Strand as main venue
        const defaultVenue = config.venues[0];

        shows.push({
          id: `lfw-${date.toISOString().split('T')[0]}-${designer.replace(/\s/g, '-')}`,
          designer: designer.trim(),
          venue: defaultVenue.name,
          venueAddress: defaultVenue.address,
          time,
          date,
          neighborhoodId: defaultVenue.neighborhoodId,
          isHighProfile: HIGH_PROFILE_DESIGNERS.some((d) =>
            designer.toLowerCase().includes(d.toLowerCase())
          ),
        });
      }
    }
  } catch (error) {
    console.error('Error scraping LFW schedule:', error);
  }

  // Fallback to known venues
  if (shows.length === 0) {
    for (const venue of config.venues) {
      shows.push({
        id: `lfw-${date.toISOString().split('T')[0]}-${venue.name.replace(/\s/g, '-')}`,
        designer: 'Multiple Designers',
        venue: venue.name,
        venueAddress: venue.address,
        time: 'Various',
        date,
        neighborhoodId: venue.neighborhoodId,
        isHighProfile: false,
      });
    }
  }

  return shows;
}

/**
 * Scrape MFW schedule
 */
async function scrapeMFWSchedule(date: Date): Promise<ShowSchedule[]> {
  const shows: ShowSchedule[] = [];
  const config = getFashionWeekConfig('Milan')!;

  try {
    const response = await fetch('https://www.cameramoda.it/en/calendar/', {
      headers: { 'User-Agent': 'Flaneur/1.0 (Fashion Coverage)' },
    });

    if (response.ok) {
      const html = await response.text();
      // Parse Camera Moda schedule
      const schedulePattern = /(\d{1,2}:\d{2})\s*([A-Z][a-zA-Z\s&]+)/gi;
      let match;

      while ((match = schedulePattern.exec(html)) !== null) {
        const [, time, designer] = match;
        const venue = config.venues.find((v) =>
          HIGH_PROFILE_DESIGNERS.some((d) => designer.toLowerCase().includes(d.toLowerCase()))
        ) || config.venues[0];

        shows.push({
          id: `mfw-${date.toISOString().split('T')[0]}-${designer.replace(/\s/g, '-')}`,
          designer: designer.trim(),
          venue: venue.name,
          venueAddress: venue.address,
          time,
          date,
          neighborhoodId: venue.neighborhoodId,
          isHighProfile: HIGH_PROFILE_DESIGNERS.some((d) =>
            designer.toLowerCase().includes(d.toLowerCase())
          ),
        });
      }
    }
  } catch (error) {
    console.error('Error scraping MFW schedule:', error);
  }

  // Fallback
  if (shows.length === 0) {
    for (const venue of config.venues) {
      shows.push({
        id: `mfw-${date.toISOString().split('T')[0]}-${venue.name.replace(/\s/g, '-')}`,
        designer: 'Multiple Designers',
        venue: venue.name,
        venueAddress: venue.address,
        time: 'Various',
        date,
        neighborhoodId: venue.neighborhoodId,
        isHighProfile: false,
      });
    }
  }

  return shows;
}

/**
 * Scrape PFW schedule
 */
async function scrapePFWSchedule(date: Date): Promise<ShowSchedule[]> {
  const shows: ShowSchedule[] = [];
  const config = getFashionWeekConfig('Paris')!;

  try {
    const response = await fetch('https://fhcm.paris/en/calendars', {
      headers: { 'User-Agent': 'Flaneur/1.0 (Fashion Coverage)' },
    });

    if (response.ok) {
      const html = await response.text();
      // Parse FHCM schedule
      const schedulePattern = /(\d{1,2}[h:]\d{2})\s*([A-Z][a-zA-Z\s&]+)/gi;
      let match;

      while ((match = schedulePattern.exec(html)) !== null) {
        const [, time, designer] = match;
        const venue = config.venues.find((v) =>
          html.toLowerCase().includes(v.name.toLowerCase())
        ) || config.venues[0];

        shows.push({
          id: `pfw-${date.toISOString().split('T')[0]}-${designer.replace(/\s/g, '-')}`,
          designer: designer.trim(),
          venue: venue.name,
          venueAddress: venue.address,
          time,
          date,
          neighborhoodId: venue.neighborhoodId,
          isHighProfile: HIGH_PROFILE_DESIGNERS.some((d) =>
            designer.toLowerCase().includes(d.toLowerCase())
          ),
        });
      }
    }
  } catch (error) {
    console.error('Error scraping PFW schedule:', error);
  }

  // Fallback
  if (shows.length === 0) {
    for (const venue of config.venues) {
      shows.push({
        id: `pfw-${date.toISOString().split('T')[0]}-${venue.name.replace(/\s/g, '-')}`,
        designer: 'Multiple Designers',
        venue: venue.name,
        venueAddress: venue.address,
        time: 'Various',
        date,
        neighborhoodId: venue.neighborhoodId,
        isHighProfile: false,
      });
    }
  }

  return shows;
}

/**
 * Scrape show schedule for a specific fashion week
 */
export async function scrapeShowSchedule(
  city: FashionWeekCity,
  date: Date = new Date()
): Promise<ShowSchedule[]> {
  switch (city) {
    case 'New_York':
      return scrapeNYFWSchedule(date);
    case 'London':
      return scrapeLFWSchedule(date);
    case 'Milan':
      return scrapeMFWSchedule(date);
    case 'Paris':
      return scrapePFWSchedule(date);
    default:
      return [];
  }
}

// ============================================================================
// DAILY SUMMARY GENERATION
// ============================================================================

/**
 * Generate daily show summary with traffic alerts
 */
export async function generateDailySummary(
  window: FashionWeekWindow,
  date: Date = new Date()
): Promise<DailyShowSummary> {
  const shows = await scrapeShowSchedule(window.config.city, date);

  // Group shows by neighborhood
  const showsByNeighborhood: Record<string, ShowSchedule[]> = {};
  for (const show of shows) {
    const neighborhood = show.neighborhoodId || window.config.targetFeeds[0];
    if (!showsByNeighborhood[neighborhood]) {
      showsByNeighborhood[neighborhood] = [];
    }
    showsByNeighborhood[neighborhood].push(show);
  }

  // Detect traffic alerts
  const trafficAlerts: string[] = [];
  for (const [neighborhood, neighborhoodShows] of Object.entries(showsByNeighborhood)) {
    // More than 3 shows = Traffic Alert
    if (neighborhoodShows.length >= 3) {
      const venues = [...new Set(neighborhoodShows.map((s) => s.venue))];
      trafficAlerts.push(
        `Heavy fashion traffic expected in ${neighborhood.replace(/^[a-z]+-/, '').replace(/-/g, ' ')}: ${venues.join(', ')}`
      );
    }

    // High-profile shows = Extra alert
    const highProfile = neighborhoodShows.filter((s) => s.isHighProfile);
    if (highProfile.length > 0) {
      trafficAlerts.push(
        `Major shows: ${highProfile.map((s) => s.designer).join(', ')} will draw large crowds`
      );
    }
  }

  return {
    fashionWeek: window.config,
    date,
    dayNumber: window.currentDay || 1,
    totalShows: shows.length,
    showsByNeighborhood,
    highProfileCount: shows.filter((s) => s.isHighProfile).length,
    trafficAlerts,
  };
}

// ============================================================================
// GEMINI STORY GENERATION
// ============================================================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');


export async function generateFashionWeekStory(
  summary: DailyShowSummary,
  neighborhoodId: string
): Promise<FashionWeekStory | null> {
  try {
    const model = genAI.getGenerativeModel({ model: AI_MODELS.GEMINI_FLASH });

    const neighborhoodShows = summary.showsByNeighborhood[neighborhoodId] || [];
    const showCount = neighborhoodShows.length;

    if (showCount === 0) {
      return null;
    }

    // Get neighborhood name
    const neighborhoodName = neighborhoodId
      .replace(/^(nyc|london|milan|paris)-/, '')
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const highProfileDesigners = neighborhoodShows
      .filter((s) => s.isHighProfile)
      .map((s) => s.designer);

    const venues = [...new Set(neighborhoodShows.map((s) => s.venue))];

    // Determine day phase for unique daily angle
    const totalDays = summary.fashionWeek.durationDays;
    const dayPhase = summary.dayNumber <= 2 ? 'opening days'
      : summary.dayNumber >= totalDays - 1 ? 'final stretch'
      : 'midweek';

    const dateStr = summary.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    const prompt = `${insiderPersona(neighborhoodName, 'Style Editor')}

Event: ${summary.fashionWeek.name} - Day ${summary.dayNumber} of ${totalDays} (${dayPhase})
Date: ${dateStr}
Neighborhood Vibe: ${summary.fashionWeek.vibe}

Today's Schedule in ${neighborhoodName}:
- Total shows: ${showCount}
- Venues: ${venues.join(', ')}
${highProfileDesigners.length > 0 ? `- Major designers showing: ${highProfileDesigners.join(', ')}` : '- No headline designers today - focus on emerging talent and venue atmosphere'}
${summary.trafficAlerts.length > 0 ? `- Alerts: ${summary.trafficAlerts.join('; ')}` : ''}

Context:
- It is ${summary.fashionWeek.shortName} - one of the Big Four fashion weeks
- Residents care about: 1) Spotting celebrities, 2) Avoiding the traffic mess
- Tone: 'Chaotic Chic'
- This is Day ${summary.dayNumber} - make the headline UNIQUE to today. Do NOT reuse yesterday's angle.

Task: Write a 35-word blurb for ${neighborhoodName} residents.
Headline: MUST include "Day ${summary.dayNumber}" and reference something specific to today (a designer, venue, the ${dayPhase} energy, or the day's vibe). Never just "takes over [Location]" - that's too generic.

Return JSON: { "headline": "...", "body": "...", "link_candidates": [{"text": "exact text from body"}] }

Include 1-3 link candidates for key entities mentioned in the body (designers, venues, fashion week name).`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 300,
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
      const cityName = summary.fashionWeek.city.replace(/_/g, ' ');
      body = injectHyperlinks(body, linkCandidates, { name: neighborhoodName, city: cityName });
    }

    // Determine priority
    let priority: 'hero' | 'high' | 'normal' = 'normal';
    if (highProfileDesigners.length >= 2) {
      priority = 'hero';
    } else if (showCount >= 3 || highProfileDesigners.length >= 1) {
      priority = 'high';
    }

    return {
      fashionWeek: summary.fashionWeek,
      summary,
      neighborhoodId,
      headline: parsed.headline,
      body,
      previewText: parsed.body.substring(0, 120) + '...',
      categoryLabel: `${summary.fashionWeek.shortName} Day ${summary.dayNumber}`,
      priority,
    };
  } catch (error) {
    console.error('Error generating fashion week story:', error);
    return null;
  }
}

// ============================================================================
// MAIN PROCESSING PIPELINE
// ============================================================================

export interface ProcessResult {
  activeWeeks: number;
  showsScraped: number;
  storiesGenerated: number;
  neighborhoodsCovered: number;
  byCity: Record<string, number>;
  stories: FashionWeekStory[];
  trafficAlerts: string[];
  errors: string[];
}

/**
 * Process all active fashion weeks and generate stories
 */
export async function processFashionWeeks(date: Date = new Date()): Promise<ProcessResult> {
  const result: ProcessResult = {
    activeWeeks: 0,
    showsScraped: 0,
    storiesGenerated: 0,
    neighborhoodsCovered: 0,
    byCity: {},
    stories: [],
    trafficAlerts: [],
    errors: [],
  };

  const activeWindows = getActiveFashionWeeks(date);
  result.activeWeeks = activeWindows.length;

  if (activeWindows.length === 0) {
    console.log('No active fashion weeks detected');
    return result;
  }

  for (const window of activeWindows) {
    try {
      console.log(`Processing ${window.config.name} - Day ${window.currentDay}...`);

      const summary = await generateDailySummary(window, date);
      result.showsScraped += summary.totalShows;
      result.trafficAlerts.push(...summary.trafficAlerts);
      result.byCity[window.config.city] = summary.totalShows;

      // Generate stories for each neighborhood with shows
      for (const neighborhoodId of Object.keys(summary.showsByNeighborhood)) {
        const story = await generateFashionWeekStory(summary, neighborhoodId);

        if (story) {
          result.stories.push(story);
          result.storiesGenerated++;
        }
      }

      result.neighborhoodsCovered += Object.keys(summary.showsByNeighborhood).length;
    } catch (error) {
      result.errors.push(
        `${window.config.shortName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}

// ============================================================================
// SAMPLE DATA FOR TESTING
// ============================================================================

export function createSampleSummaries(): DailyShowSummary[] {
  const today = new Date();

  return [
    {
      fashionWeek: FASHION_CALENDAR[0], // NYFW
      date: today,
      dayNumber: 3,
      totalShows: 12,
      showsByNeighborhood: {
        'nyc-tribeca': [
          { id: '1', designer: 'Marc Jacobs', venue: 'Spring Studios', time: '10:00 AM', date: today, neighborhoodId: 'nyc-tribeca', isHighProfile: true },
          { id: '2', designer: 'Coach', venue: 'Spring Studios', time: '2:00 PM', date: today, neighborhoodId: 'nyc-tribeca', isHighProfile: true },
          { id: '3', designer: 'Proenza Schouler', venue: 'Spring Studios', time: '6:00 PM', date: today, neighborhoodId: 'nyc-tribeca', isHighProfile: true },
        ],
        'nyc-chelsea': [
          { id: '4', designer: 'Tom Ford', venue: 'Pier 59 Studios', time: '8:00 PM', date: today, neighborhoodId: 'nyc-chelsea', isHighProfile: true },
        ],
        'nyc-meatpacking': [
          { id: '5', designer: 'Tory Burch', venue: 'Industria', time: '11:00 AM', date: today, neighborhoodId: 'nyc-meatpacking', isHighProfile: true },
          { id: '6', designer: 'Emerging Designer', venue: 'Industria', time: '3:00 PM', date: today, neighborhoodId: 'nyc-meatpacking', isHighProfile: false },
        ],
      },
      highProfileCount: 5,
      trafficAlerts: [
        'Heavy fashion traffic expected in Tribeca: Spring Studios',
        'Major shows: Marc Jacobs, Coach, Proenza Schouler will draw large crowds',
      ],
    },
    {
      fashionWeek: FASHION_CALENDAR[3], // PFW
      date: today,
      dayNumber: 5,
      totalShows: 18,
      showsByNeighborhood: {
        'paris-1st-arrondissement': [
          { id: '7', designer: 'Chanel', venue: 'Grand Palais', time: '10:30', date: today, neighborhoodId: 'paris-1st-arrondissement', isHighProfile: true },
          { id: '8', designer: 'Dior', venue: 'Jardin des Tuileries', time: '14:30', date: today, neighborhoodId: 'paris-1st-arrondissement', isHighProfile: true },
          { id: '9', designer: 'Louis Vuitton', venue: 'Palais Royal', time: '20:00', date: today, neighborhoodId: 'paris-1st-arrondissement', isHighProfile: true },
        ],
        'paris-le-marais': [
          { id: '10', designer: 'Maison Margiela', venue: 'Carreau du Temple', time: '17:00', date: today, neighborhoodId: 'paris-le-marais', isHighProfile: true },
        ],
      },
      highProfileCount: 4,
      trafficAlerts: [
        'Heavy fashion traffic expected in 1st Arrondissement: Grand Palais, Tuileries, Palais Royal',
        'Major shows: Chanel, Dior, Louis Vuitton - expect impossible traffic at Concorde',
      ],
    },
  ];
}
