/**
 * Art Fair Service
 *
 * Special Event engine that triggers high-priority coverage during
 * global Art Fair weeks (Frieze, Art Basel, Biennale).
 *
 * Features:
 * - Static calendar-based (not scraping)
 * - Two primary states: Preview (7 days before) and Live (during)
 * - Hero priority flagging for live coverage
 * - Localized vibe/tone for each fair
 * - Target feed syndication
 *
 * The Big 5: Frieze London, Art Basel Miami, Frieze LA,
 * Art Basel Hong Kong, Art Basel Paris
 */

import { GoogleGenAI } from '@google/genai';
import {
  ArtFair,
  FairState,
  getActiveFairs,
  getFairDatesForYear,
  ALL_FAIRS,
} from '@/config/art-fairs';

// Gemini model for story generation
const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Generated fair story
 */
export interface FairStory {
  fairId: string;
  fairName: string;
  state: FairState;
  headline: string;
  body: string;
  previewText: string;
  city: string;
  priority: 'Hero' | 'Standard';
  targetFeeds: string[];
  fairDates: {
    start: string;
    end: string;
  };
  generatedAt: string;
}

/**
 * Fair coverage result
 */
export interface FairCoverageResult {
  activeFairs: number;
  storiesGenerated: number;
  articlesCreated: number;
  articlesSkipped: number;
  neighborhoodsSyndicated: number;
  byState: Record<FairState, number>;
  errors: string[];
}

/**
 * Generate a fair story using Gemini
 */
export async function generateFairStory(
  fair: ArtFair,
  state: FairState,
  dates: { start: Date; end: Date }
): Promise<FairStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Format dates
  const startStr = dates.start.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const endStr = dates.end.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Build state-specific guidance
  let stateGuidance: string;
  let headlineHint: string;

  switch (state) {
    case 'Preview':
      stateGuidance = `This is the PREVIEW state - the fair opens next week.
Focus on:
- Who is going / Who has been spotted booking flights
- VIP preview passes and private viewing opportunities
- The dinner circuit - which gallery dinners matter
- What to expect from the major galleries
- The anticipation and buzz building in the art world`;
      headlineHint = `"VIP Preview: ${fair.name} descends on ${fair.city} next week"`;
      break;

    case 'Live':
      stateGuidance = `This is LIVE coverage - the fair is happening RIGHT NOW.
Focus on:
- Sold out booths and record-breaking sales
- The scene on the floor - energy, crowds, atmosphere
- Celebrity and collector sightings
- What's generating buzz this year
- The must-see booths and installations
Mark this as HERO priority - it should pin to the top of feeds.`;
      headlineHint = `"The Fair is Open: Where the smart money is going at ${fair.name}"`;
      break;

    case 'Wrap':
      stateGuidance = `This is the WRAP state - the fair just ended.
Focus on:
- Final sales tallies and highlights
- What sold and what didn't
- The overall mood and market sentiment
- Standout moments from the week
- What it means for the art market`;
      headlineHint = `"${fair.name} Wrap: The highs, the sales, the takeaways"`;
      break;

    default:
      return null;
  }

  // City-specific context
  const cityContext: Record<string, string> = {
    London: `Reference Bond Street, Cork Street, or Mayfair. British collectors value discretion. The weather will be mentioned. Sketch, The Wolseley, and Claridge's are where deals happen.`,
    Miami: `Reference Collins Avenue, the Design District, or Wynwood. The energy is flashy and international. Mention the causeway traffic, the beach parties, and the mega-yacht scene.`,
    'Los Angeles': `Reference Santa Monica, Beverly Hills, or West Hollywood. Hollywood meets the art world. Agents and actors collect. The vibe is laid-back luxury.`,
    'Hong Kong': `Reference Central or the Convention Centre. Asian blue-chip market. Mainland Chinese collectors. Scale is massive. Business-first mentality.`,
    Paris: `Reference the Grand Palais, Saint-Germain, or Le Marais. Intellectual and chic. European sophistication. Dinners at Café de Flore or Lipp. Art history matters here.`,
  };

  const systemPrompt = `You are the Editor-in-Chief of Flâneur, covering ${fair.name} in ${fair.city}.

This is THE event of the year for these residents. This is the key thing that matters this week.

Context:
${fair.vibe}

${cityContext[fair.city] || ''}

${stateGuidance}

Writing Style:
- Sophisticated but accessible
- Insider tone - you know everyone, you've been before
- Specific names and places add credibility
- No emojis
- Create FOMO for those not attending`;

  const prompt = `Fair: ${fair.name}
Location: ${fair.city}, ${fair.country}
Venue: ${fair.venue}
Dates: ${startStr} - ${endStr}
Coverage State: ${state}

Headline Hint: ${headlineHint}

Task: Write a "Special Edition" 40-word blurb for Flâneur residents.

Return JSON:
{
  "headline": "Attention-grabbing headline under 70 chars",
  "body": "40-word blurb capturing the moment and creating urgency",
  "previewText": "One sentence teaser for the feed"
}`;

  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: {
        temperature: 0.8, // Slightly higher for more creative fair coverage
      },
    });

    const rawText = response.text || '';

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response for fair story');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Determine priority
    const priority: 'Hero' | 'Standard' = state === 'Live' ? 'Hero' : 'Standard';

    return {
      fairId: fair.id,
      fairName: fair.name,
      state,
      headline: parsed.headline || headlineHint,
      body: parsed.body || `${fair.name} is the talk of ${fair.city}.`,
      previewText: parsed.previewText || `Special coverage: ${fair.name}.`,
      city: fair.city,
      priority,
      targetFeeds: fair.targetFeeds,
      fairDates: {
        start: dates.start.toISOString().split('T')[0],
        end: dates.end.toISOString().split('T')[0],
      },
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Fair story generation error for ${fair.name}:`, error);
    return null;
  }
}

/**
 * Check all fairs and generate stories for active ones
 */
export async function processActiveFairs(
  currentDate: Date = new Date()
): Promise<{
  activeFairs: Array<{ fair: ArtFair; state: FairState }>;
  stories: FairStory[];
  errors: string[];
}> {
  const errors: string[] = [];
  const stories: FairStory[] = [];

  // Get all active fairs
  const activeFairData = getActiveFairs(currentDate);

  console.log(`Found ${activeFairData.length} active fairs`);

  // Generate stories for each active fair
  for (const { fair, state, dates } of activeFairData) {
    // Skip Wrap state for satellites (only cover Preview and Live)
    if (fair.tier === 'satellite' && state === 'Wrap') {
      continue;
    }

    try {
      console.log(`Generating ${state} story for ${fair.name}`);

      const story = await generateFairStory(fair, state, {
        start: dates.start,
        end: dates.end,
      });

      if (story) {
        stories.push(story);
      } else {
        errors.push(`${fair.id}: Story generation returned null`);
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      errors.push(
        `${fair.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    activeFairs: activeFairData.map(({ fair, state }) => ({ fair, state })),
    stories,
    errors,
  };
}

/**
 * Get a unique slug for a fair story
 */
export function getFairStorySlug(
  fairId: string,
  state: FairState,
  neighborhoodId: string,
  year: number
): string {
  return `fair-${fairId}-${state.toLowerCase()}-${year}-${neighborhoodId}`;
}

/**
 * Distribute a fair story to target feeds
 */
export function distributeFairStory(story: FairStory): Array<{
  neighborhoodId: string;
  slug: string;
}> {
  const year = new Date().getFullYear();
  const distributions: Array<{ neighborhoodId: string; slug: string }> = [];

  for (const neighborhoodId of story.targetFeeds) {
    distributions.push({
      neighborhoodId,
      slug: getFairStorySlug(story.fairId, story.state, neighborhoodId, year),
    });
  }

  return distributions;
}

/**
 * Check if a fair is currently in a coverage state
 */
export function isFairActive(fairId: string, currentDate: Date = new Date()): boolean {
  const fair = ALL_FAIRS.find((f) => f.id === fairId);
  if (!fair) return false;

  const activeFairs = getActiveFairs(currentDate);
  return activeFairs.some((af) => af.fair.id === fairId);
}

/**
 * Get the current state for a specific fair
 */
export function getCurrentFairState(
  fairId: string,
  currentDate: Date = new Date()
): FairState | null {
  const activeFairs = getActiveFairs(currentDate);
  const match = activeFairs.find((af) => af.fair.id === fairId);
  return match ? match.state : null;
}

/**
 * Create sample fair data for testing
 * Simulates an active fair for the current date
 */
export function createSampleActiveFair(
  state: FairState = 'Live'
): Array<{ fair: ArtFair; state: FairState; dates: { start: Date; end: Date; previewStart: Date } }> {
  const now = new Date();

  // Pick a flagship fair and adjust dates to make it active
  const sampleFair: ArtFair = {
    id: 'sample-fair',
    name: 'Sample Art Fair',
    shortName: 'Sample',
    city: 'New York',
    country: 'USA',
    month: now.getMonth() + 1,
    approxWeek: Math.ceil(now.getDate() / 7),
    durationDays: 4,
    targetFeeds: ['tribeca', 'soho', 'chelsea'],
    vibe: 'Test fair for development. Imagine the energy of Art Basel meets the intimacy of Frieze.',
    venue: 'Test Venue',
    website: 'https://example.com',
    tier: 'flagship',
  };

  let start: Date;
  let end: Date;
  let previewStart: Date;

  switch (state) {
    case 'Preview':
      // Fair starts in 5 days
      start = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      end = new Date(start.getTime() + (sampleFair.durationDays - 1) * 24 * 60 * 60 * 1000);
      previewStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;

    case 'Live':
      // Fair started 2 days ago
      start = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      end = new Date(start.getTime() + (sampleFair.durationDays - 1) * 24 * 60 * 60 * 1000);
      previewStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;

    case 'Wrap':
      // Fair ended yesterday
      end = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
      start = new Date(end.getTime() - (sampleFair.durationDays - 1) * 24 * 60 * 60 * 1000);
      previewStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;

    default:
      return [];
  }

  return [
    {
      fair: sampleFair,
      state,
      dates: { start, end, previewStart },
    },
  ];
}

/**
 * Get upcoming fairs for a specific neighborhood
 */
export function getUpcomingFairsForNeighborhood(
  neighborhoodId: string,
  daysAhead: number = 60
): Array<{
  fair: ArtFair;
  dates: { start: Date; end: Date };
  daysUntil: number;
}> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const upcoming: Array<{
    fair: ArtFair;
    dates: { start: Date; end: Date };
    daysUntil: number;
  }> = [];

  for (const fair of ALL_FAIRS) {
    if (!fair.targetFeeds.includes(neighborhoodId)) continue;

    // Check current and next year
    for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
      const dates = getFairDatesForYear(fair, year);

      if (dates.start > now && dates.start <= cutoff) {
        const daysUntil = Math.ceil(
          (dates.start.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );
        upcoming.push({
          fair,
          dates: { start: dates.start, end: dates.end },
          daysUntil,
        });
      }
    }
  }

  // Sort by days until
  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

  return upcoming;
}
