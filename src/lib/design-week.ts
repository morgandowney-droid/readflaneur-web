/**
 * Design Week Service
 *
 * Special Event engine that triggers coverage during Global Design Weeks
 * (Salone del Mobile, London Design Festival, Design Miami, etc.).
 *
 * Architecture: Static Calendar
 * - Design Weeks are fixed annual events
 * - Each event has associated neighborhood hubs
 * - Daily highlights focus on different aspects/locations
 *
 * Daily Highlight Logic:
 * - During active week, we highlight the "Neighborhood Hub" of the day
 * - Milan: Fiera Milano → Fuorisalone/Brera → Alcova
 * - London: V&A → Shoreditch → Chelsea Harbour
 */

import { GoogleGenAI } from '@google/genai';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { AI_MODELS } from '@/config/ai-models';

// ============================================================================
// DESIGN CALENDAR CONFIGURATION
// ============================================================================

export type DesignCity = 'Milan' | 'London' | 'Miami' | 'Copenhagen' | 'Stockholm' | 'New_York';

export type EventState = 'Preview' | 'Live' | 'Wrap' | 'Dormant';

export interface DailyFocus {
  day: number;
  name: string;
  neighborhood: string;
  description: string;
}

export interface DesignEvent {
  id: string;
  name: string;
  shortName: string;
  city: DesignCity;
  month: number; // 1-12
  approxWeek: number; // 1-4 (which week of the month)
  durationDays: number;
  targetFeeds: string[];
  vibe: string;
  venue?: string;
  website?: string;
  dailyFocuses: DailyFocus[];
}

/**
 * Static Design Events Calendar
 */
export const DESIGN_EVENTS: DesignEvent[] = [
  {
    id: 'salone-del-mobile',
    name: 'Salone del Mobile',
    shortName: 'Salone',
    city: 'Milan',
    month: 4, // April
    approxWeek: 2,
    durationDays: 6,
    targetFeeds: ['brera', 'porta-nuova', 'centro-storico', 'navigli'],
    vibe: 'Furniture, Installations, Palazzo Parties. The world capital of design descends on Milan.',
    venue: 'Fiera Milano & Fuorisalone citywide',
    website: 'https://www.salonemilano.it',
    dailyFocuses: [
      {
        day: 1,
        name: 'Fiera Milano',
        neighborhood: 'rho-fiera',
        description: 'The trade show. Where deals are made. The big brands unveil.',
      },
      {
        day: 2,
        name: 'Fuorisalone Brera',
        neighborhood: 'brera',
        description: 'The cool street installations. Cocktails among the furniture.',
      },
      {
        day: 3,
        name: 'Alcova',
        neighborhood: 'porta-nuova',
        description: 'The edgy exhibition. Emerging designers in abandoned spaces.',
      },
      {
        day: 4,
        name: 'Tortona District',
        neighborhood: 'navigli',
        description: 'The design district. Showrooms and after-parties.',
      },
      {
        day: 5,
        name: 'Via Durini',
        neighborhood: 'centro-storico',
        description: 'The permanent showrooms. Where the classics live.',
      },
      {
        day: 6,
        name: 'Closing Celebrations',
        neighborhood: 'brera',
        description: 'The final palazzo parties. Making connections for next year.',
      },
    ],
  },
  {
    id: 'london-design-festival',
    name: 'London Design Festival',
    shortName: 'LDF',
    city: 'London',
    month: 9, // September
    approxWeek: 2,
    durationDays: 9,
    targetFeeds: ['shoreditch', 'chelsea', 'kensington', 'kings-cross'],
    vibe: 'Creative, Craft, Showrooms. British design meets global innovation.',
    venue: 'V&A Hub & citywide',
    website: 'https://www.londondesignfestival.com',
    dailyFocuses: [
      {
        day: 1,
        name: 'V&A Museum Hub',
        neighborhood: 'kensington',
        description: 'The anchor venue. Major installations and talks.',
      },
      {
        day: 2,
        name: 'Shoreditch Design Triangle',
        neighborhood: 'shoreditch',
        description: 'The creative heart. Emerging talent and workshops.',
      },
      {
        day: 3,
        name: 'Chelsea Harbour',
        neighborhood: 'chelsea',
        description: 'The luxury showrooms. Interior design trade.',
      },
      {
        day: 4,
        name: 'Kings Cross',
        neighborhood: 'kings-cross',
        description: 'The new design quarter. Coal Drops Yard and beyond.',
      },
      {
        day: 5,
        name: 'Brompton Design District',
        neighborhood: 'kensington',
        description: 'Around the V&A. Galleries and pop-ups.',
      },
    ],
  },
  {
    id: 'design-miami',
    name: 'Design Miami',
    shortName: 'Design Miami',
    city: 'Miami',
    month: 12, // December (during Art Basel Miami Beach)
    approxWeek: 1,
    durationDays: 5,
    targetFeeds: ['south-beach', 'design-district', 'wynwood', 'brickell'],
    vibe: 'Collectible Design, Gallerists. Where art meets furniture.',
    venue: 'Miami Beach Convention Center & Design District',
    website: 'https://designmiami.com',
    dailyFocuses: [
      {
        day: 1,
        name: 'Design Miami Fair',
        neighborhood: 'south-beach',
        description: 'The main tent. Gallery booths and museum-quality design.',
      },
      {
        day: 2,
        name: 'Design District',
        neighborhood: 'design-district',
        description: 'The permanent showrooms. Flagship stores open late.',
      },
      {
        day: 3,
        name: 'Wynwood Walls',
        neighborhood: 'wynwood',
        description: 'Street art meets design. The edge of the fair.',
      },
      {
        day: 4,
        name: 'Satellite Fairs',
        neighborhood: 'south-beach',
        description: 'The overflow. NADA, Untitled, and private collections.',
      },
      {
        day: 5,
        name: 'Closing Night',
        neighborhood: 'design-district',
        description: 'Final sales and collector dinners.',
      },
    ],
  },
  {
    id: '3-days-of-design',
    name: '3 Days of Design',
    shortName: '3 Days',
    city: 'Copenhagen',
    month: 6, // June
    approxWeek: 2,
    durationDays: 3,
    targetFeeds: ['norrebro', 'osterbro', 'frederiksberg', 'vesterbro'],
    vibe: 'Scandi Chic, Open Showrooms. Danish design at its source.',
    venue: 'Citywide showrooms',
    website: 'https://3daysofdesign.dk',
    dailyFocuses: [
      {
        day: 1,
        name: 'Brand Showrooms',
        neighborhood: 'osterbro',
        description: 'The icons open their doors. Fritz Hansen, HAY, &Tradition.',
      },
      {
        day: 2,
        name: 'Emerging Studios',
        neighborhood: 'norrebro',
        description: 'The next generation. Young designers and collectives.',
      },
      {
        day: 3,
        name: 'Warehouse Events',
        neighborhood: 'vesterbro',
        description: 'The offbeat spaces. Installations and parties.',
      },
    ],
  },
  {
    id: 'stockholm-design-week',
    name: 'Stockholm Design Week',
    shortName: 'SDW',
    city: 'Stockholm',
    month: 2, // February
    approxWeek: 1,
    durationDays: 5,
    targetFeeds: ['ostermalm', 'sodermalm', 'gamla-stan'],
    vibe: 'Scandinavian modernism meets innovation. The February highlight.',
    venue: 'Stockholm Furniture Fair & citywide',
    website: 'https://stockholmdesignweek.com',
    dailyFocuses: [
      {
        day: 1,
        name: 'Furniture Fair',
        neighborhood: 'ostermalm',
        description: 'The main event at Stockholmsmässan.',
      },
      {
        day: 2,
        name: 'Södermalm Studios',
        neighborhood: 'sodermalm',
        description: 'The creative south. Independent designers.',
      },
      {
        day: 3,
        name: 'Showroom Walks',
        neighborhood: 'ostermalm',
        description: 'The brand flagships. Design icons at home.',
      },
    ],
  },
  {
    id: 'nycxdesign',
    name: 'NYCxDESIGN',
    shortName: 'NYCxD',
    city: 'New_York',
    month: 5, // May
    approxWeek: 2,
    durationDays: 10,
    targetFeeds: ['soho', 'chelsea', 'tribeca', 'williamsburg'],
    vibe: 'The American design moment. Studios, showrooms, and installations.',
    venue: 'Citywide',
    website: 'https://nycxdesign.org',
    dailyFocuses: [
      {
        day: 1,
        name: 'ICFF',
        neighborhood: 'chelsea',
        description: 'The main trade show at Javits Center.',
      },
      {
        day: 2,
        name: 'SoHo Design District',
        neighborhood: 'soho',
        description: 'The flagship showrooms. Cast-iron design.',
      },
      {
        day: 3,
        name: 'Brooklyn Studios',
        neighborhood: 'williamsburg',
        description: 'The maker movement. Artisan workshops.',
      },
      {
        day: 4,
        name: 'WantedDesign',
        neighborhood: 'tribeca',
        description: 'The curated fair. International and local designers.',
      },
    ],
  },
];

// ============================================================================
// EVENT STATE DETECTION
// ============================================================================

/**
 * Get approximate dates for a design event in a given year
 */
export function getEventDatesForYear(
  event: DesignEvent,
  year: number
): { start: Date; end: Date; previewStart: Date } {
  // Calculate the start date based on month and approximate week
  const monthStart = new Date(year, event.month - 1, 1);
  const dayOfWeek = monthStart.getDay();

  // Find the Monday of the target week
  let daysToAdd = (event.approxWeek - 1) * 7;
  if (dayOfWeek > 1) {
    daysToAdd += 8 - dayOfWeek; // Skip to next week's Monday
  } else if (dayOfWeek === 0) {
    daysToAdd += 1; // Sunday -> Monday
  }

  const start = new Date(year, event.month - 1, 1 + daysToAdd);
  const end = new Date(start.getTime() + (event.durationDays - 1) * 24 * 60 * 60 * 1000);
  const previewStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);

  return { start, end, previewStart };
}

/**
 * Get the current state of a design event
 */
export function getEventState(
  event: DesignEvent,
  currentDate: Date = new Date()
): {
  state: EventState;
  dates: { start: Date; end: Date; previewStart: Date };
  dayOfEvent?: number;
  todaysFocus?: DailyFocus;
} {
  const year = currentDate.getFullYear();

  // Check current year first
  let dates = getEventDatesForYear(event, year);

  // If we're past this year's event, check next year
  if (currentDate > new Date(dates.end.getTime() + 3 * 24 * 60 * 60 * 1000)) {
    dates = getEventDatesForYear(event, year + 1);
  }

  const { start, end, previewStart } = dates;
  const wrapEnd = new Date(end.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Determine state
  if (currentDate >= previewStart && currentDate < start) {
    return { state: 'Preview', dates };
  }

  if (currentDate >= start && currentDate <= end) {
    // Calculate which day of the event we're on
    const dayOfEvent = Math.floor(
      (currentDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
    ) + 1;

    // Get today's focus (cycle through if event is longer than focuses)
    const focusIndex = ((dayOfEvent - 1) % event.dailyFocuses.length);
    const todaysFocus = event.dailyFocuses[focusIndex];

    return { state: 'Live', dates, dayOfEvent, todaysFocus };
  }

  if (currentDate > end && currentDate <= wrapEnd) {
    return { state: 'Wrap', dates };
  }

  return { state: 'Dormant', dates };
}

/**
 * Get all currently active design events
 */
export function getActiveDesignEvents(
  currentDate: Date = new Date()
): Array<{
  event: DesignEvent;
  state: EventState;
  dates: { start: Date; end: Date; previewStart: Date };
  dayOfEvent?: number;
  todaysFocus?: DailyFocus;
}> {
  const activeEvents: Array<{
    event: DesignEvent;
    state: EventState;
    dates: { start: Date; end: Date; previewStart: Date };
    dayOfEvent?: number;
    todaysFocus?: DailyFocus;
  }> = [];

  for (const event of DESIGN_EVENTS) {
    const stateInfo = getEventState(event, currentDate);

    if (stateInfo.state !== 'Dormant') {
      activeEvents.push({
        event,
        ...stateInfo,
      });
    }
  }

  return activeEvents;
}

// ============================================================================
// STORY TYPES
// ============================================================================

export interface DesignStory {
  eventId: string;
  eventName: string;
  city: DesignCity;
  state: EventState;
  headline: string;
  body: string;
  previewText: string;
  targetNeighborhoods: string[];
  dayOfEvent?: number;
  dailyFocus?: string;
  categoryLabel: string;
  priority: 'Hero' | 'Standard';
  generatedAt: string;
}

export interface DesignWeekResult {
  activeEvents: number;
  storiesGenerated: number;
  byCity: Record<DesignCity, number>;
  byState: Record<EventState, number>;
  errors: string[];
  stories: DesignStory[];
}

// ============================================================================
// STORY GENERATION
// ============================================================================

/**
 * Generate a design week story using Gemini
 */
export async function generateDesignStory(
  event: DesignEvent,
  state: EventState,
  dayOfEvent?: number,
  todaysFocus?: DailyFocus
): Promise<DesignStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Build state-specific guidance
  let stateGuidance: string;
  let headlineHint: string;

  switch (state) {
    case 'Preview':
      stateGuidance = `This is PREVIEW week - ${event.name} starts next week.
Focus on:
- What to expect this year
- Which brands and designers are generating buzz
- The must-see installations being announced
- Hotel and dinner reservations filling up
- The sense of anticipation in the design world`;
      headlineHint = `"Design Week Preview: ${event.name} arrives next week"`;
      break;

    case 'Live':
      stateGuidance = `This is LIVE coverage - ${event.name} is happening NOW.
Day ${dayOfEvent || 1} of the event.
${todaysFocus ? `Today's Focus: ${todaysFocus.name} - ${todaysFocus.description}` : ''}

Focus on:
- What's happening TODAY specifically
- The buzz on the ground
- Which installations are generating lines
- Where the crowd is heading
- The energy and atmosphere`;
      headlineHint = todaysFocus
        ? `"${event.shortName} Day ${dayOfEvent}: ${todaysFocus.name}"`
        : `"${event.shortName}: Live from ${event.city}"`;
      break;

    case 'Wrap':
      stateGuidance = `This is WRAP coverage - ${event.name} just ended.
Focus on:
- The standout moments
- Which designers broke through
- The pieces everyone was talking about
- Trends emerging for next year
- The aftermath and what it means for design`;
      headlineHint = `"${event.shortName} Wrap: The standouts and surprises"`;
      break;

    default:
      return null;
  }

  // City-specific context
  const cityContext: Record<DesignCity, string> = {
    Milan: `Reference Brera, the aperitivo circuit, and the palazzo parties. Milan Design Week is the Super Bowl of furniture. Everyone who matters is here. The Italians invented this.`,
    London: `Reference the V&A, Shoreditch warehouses, and Design District. British craft meets global creativity. The trade side and the public side mix.`,
    Miami: `Reference the Design District, the beach, and the Art Basel overlap. Collectible design for serious collectors. The money is here.`,
    Copenhagen: `Reference hygge, Scandinavian minimalism, and the open showroom culture. Danish design at the source. Unpretentious and pure.`,
    Stockholm: `Reference the design heritage, the February darkness, and the warmth inside. Swedish modernism continues to evolve.`,
    New_York: `Reference SoHo showrooms, Brooklyn makers, and the ICFF trade show. American design's biggest week. Commerce and creativity collide.`,
  };

  const systemPrompt = `You are the Design Editor for Flâneur in ${event.city.replace('_', ' ')}.

Event: ${event.name}
Vibe: ${event.vibe}

${cityContext[event.city]}

${stateGuidance}

Writing Style:
- Sophisticated but energetic
- Insider knowledge - you know the scene
- Name specific neighborhoods and venues
- Create FOMO for those not there
- No emojis`;

  const prompt = `Event: ${event.name}
City: ${event.city.replace('_', ' ')}
State: ${state}
${dayOfEvent ? `Day: ${dayOfEvent}` : ''}
${todaysFocus ? `Focus: ${todaysFocus.name} (${todaysFocus.neighborhood}) - ${todaysFocus.description}` : ''}

Headline Hint: ${headlineHint}

Task: Write a 35-word "Design Week" blurb for Flâneur design enthusiasts.

Return JSON:
{
  "headline": "Attention-grabbing headline under 70 chars",
  "body": "35-word blurb capturing the design week moment",
  "previewText": "One sentence teaser for the feed",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 2-4 link candidates for key entities mentioned in the body (event name, venues, designers, brands).`;

  try {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: {
        temperature: 0.8,
      },
    });

    const rawText = response.text || '';

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response for design story');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || `${event.name} is the talk of ${event.city}.`;
    if (linkCandidates.length > 0) {
      const cityName = event.city.replace(/_/g, ' ');
      body = injectHyperlinks(body, linkCandidates, { name: cityName, city: cityName });
    }

    // Determine category label and priority
    let categoryLabel: string;
    let priority: 'Hero' | 'Standard';

    switch (state) {
      case 'Live':
        categoryLabel = todaysFocus
          ? `Design Week: ${todaysFocus.name}`
          : 'Design Week: Live';
        priority = 'Hero';
        break;
      case 'Preview':
        categoryLabel = 'Design Week: Preview';
        priority = 'Standard';
        break;
      case 'Wrap':
        categoryLabel = 'Design Week: Wrap';
        priority = 'Standard';
        break;
      default:
        categoryLabel = 'Design Week';
        priority = 'Standard';
    }

    return {
      eventId: event.id,
      eventName: event.name,
      city: event.city,
      state,
      headline: parsed.headline || headlineHint,
      body,
      previewText: parsed.previewText || `Design Week: ${event.name}.`,
      targetNeighborhoods: event.targetFeeds,
      dayOfEvent,
      dailyFocus: todaysFocus?.name,
      categoryLabel,
      priority,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Design story generation error for ${event.name}:`, error);
    return null;
  }
}

/**
 * Process all active design events and generate stories
 */
export async function processDesignWeek(
  currentDate: Date = new Date()
): Promise<DesignWeekResult> {
  const result: DesignWeekResult = {
    activeEvents: 0,
    storiesGenerated: 0,
    byCity: {
      Milan: 0,
      London: 0,
      Miami: 0,
      Copenhagen: 0,
      Stockholm: 0,
      New_York: 0,
    },
    byState: {
      Preview: 0,
      Live: 0,
      Wrap: 0,
      Dormant: 0,
    },
    errors: [],
    stories: [],
  };

  // Get all active events
  const activeEvents = getActiveDesignEvents(currentDate);
  result.activeEvents = activeEvents.length;

  for (const { event, state, dayOfEvent, todaysFocus } of activeEvents) {
    try {
      console.log(`Generating ${state} story for ${event.name}`);

      const story = await generateDesignStory(event, state, dayOfEvent, todaysFocus);

      if (story) {
        result.stories.push(story);
        result.storiesGenerated++;
        result.byCity[event.city]++;
        result.byState[state]++;
      } else {
        result.errors.push(`${event.id}: Story generation returned null`);
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      result.errors.push(
        `${event.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

// ============================================================================
// SAMPLE DATA FOR TESTING
// ============================================================================

/**
 * Create sample active design event for testing
 */
export function createSampleDesignEvent(
  state: EventState = 'Live'
): Array<{
  event: DesignEvent;
  state: EventState;
  dates: { start: Date; end: Date; previewStart: Date };
  dayOfEvent?: number;
  todaysFocus?: DailyFocus;
}> {
  const now = new Date();

  // Use Salone del Mobile as sample
  const sampleEvent = DESIGN_EVENTS.find((e) => e.id === 'salone-del-mobile')!;

  let start: Date;
  let end: Date;
  let previewStart: Date;
  let dayOfEvent: number | undefined;
  let todaysFocus: DailyFocus | undefined;

  switch (state) {
    case 'Preview':
      start = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      end = new Date(start.getTime() + (sampleEvent.durationDays - 1) * 24 * 60 * 60 * 1000);
      previewStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;

    case 'Live':
      start = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      end = new Date(start.getTime() + (sampleEvent.durationDays - 1) * 24 * 60 * 60 * 1000);
      previewStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
      dayOfEvent = 3;
      todaysFocus = sampleEvent.dailyFocuses[2]; // Day 3: Alcova
      break;

    case 'Wrap':
      end = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
      start = new Date(end.getTime() - (sampleEvent.durationDays - 1) * 24 * 60 * 60 * 1000);
      previewStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;

    default:
      return [];
  }

  return [
    {
      event: sampleEvent,
      state,
      dates: { start, end, previewStart },
      dayOfEvent,
      todaysFocus,
    },
  ];
}

/**
 * Get event by ID
 */
export function getEventById(id: string): DesignEvent | undefined {
  return DESIGN_EVENTS.find((e) => e.id === id);
}

/**
 * Get all events for a city
 */
export function getEventsForCity(city: DesignCity): DesignEvent[] {
  return DESIGN_EVENTS.filter((e) => e.city === city);
}
