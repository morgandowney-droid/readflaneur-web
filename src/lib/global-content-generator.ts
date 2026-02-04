/**
 * Global Content Generator
 *
 * Generates neighborhood-specific stories from international civic data using Gemini.
 * Injects city-specific vocabulary, cultural context, and editorial tone.
 */

import { GoogleGenAI } from '@google/genai';
import {
  GLOBAL_CITY_CONFIG,
  CITY_VOCABULARIES,
  getZoneByNeighborhoodId,
} from '@/config/global-locations';
import { StoryData, SafetyStats, CityVocabulary } from '@/lib/adapters/types';

// Gemini configuration
const GEMINI_MODEL = 'gemini-3-pro-preview';

export interface GlobalStoryInput {
  neighborhoodId: string;
  city: string;
  dataType: 'permit' | 'liquor' | 'safety' | 'mixed';
  permits?: StoryData[];
  licenses?: StoryData[];
  safetyStats?: SafetyStats;
}

export interface GeneratedGlobalStory {
  headline: string;
  body: string;
  previewText: string;
  dataType: string;
  neighborhoodId: string;
  city: string;
  currency: string;
  sourcesCount: number;
}

export interface GlobalWeeklyDigest {
  neighborhoodId: string;
  city: string;
  headline: string;
  body: string;
  previewText: string;
  permitCount: number;
  licenseCount: number;
  safetyIncidents: number;
  generatedAt: string;
}

/**
 * Build city-specific context prompt
 */
function buildCityContext(city: string, vocabulary: CityVocabulary): string {
  return `CITY CONTEXT - ${city.toUpperCase()}:
- Currency: ${vocabulary.currencySymbol} (${vocabulary.currencyName})
- Planning/Permit terminology: ${vocabulary.permitTerms.slice(0, 5).join(', ')}
- Licensing terminology: ${vocabulary.liquorTerms.slice(0, 4).join(', ')}
- Real estate vocabulary: ${vocabulary.realEstateTerms.slice(0, 5).join(', ')}
- Local phrases: ${vocabulary.localPhrases.join(', ')}

Use this vocabulary naturally when writing about ${city}. Never use American terms for UK/Australian contexts.`;
}

/**
 * Format permits for prompt
 */
function formatPermitsForPrompt(permits: StoryData[], currency: string): string {
  if (permits.length === 0) return 'No notable permit activity this period.';

  const formatted = permits.slice(0, 8).map((p) => {
    const valueStr = p.value
      ? ` (${currency}${p.value.toLocaleString()})`
      : '';
    return `- ${p.address}${valueStr}: ${p.title}`;
  });

  return formatted.join('\n');
}

/**
 * Format licenses for prompt
 */
function formatLicensesForPrompt(licenses: StoryData[]): string {
  if (licenses.length === 0) return 'No notable license activity this period.';

  const formatted = licenses.slice(0, 8).map((l) => {
    return `- ${l.title} at ${l.address}: ${l.category || 'New license'}`;
  });

  return formatted.join('\n');
}

/**
 * Format safety stats for prompt
 */
function formatSafetyForPrompt(stats: SafetyStats): string {
  const topCategories = Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, count]) => `  - ${cat}: ${count}`)
    .join('\n');

  const trendNote = stats.trend
    ? ` (${stats.trend} ${stats.trendPercentage}% from previous period)`
    : '';

  return `Period: ${stats.periodStart} to ${stats.periodEnd}
Total incidents: ${stats.totalIncidents}${trendNote}
Top categories:
${topCategories}`;
}

/**
 * Generate a story from global civic data
 */
export async function generateGlobalStory(
  input: GlobalStoryInput
): Promise<GeneratedGlobalStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const config = GLOBAL_CITY_CONFIG[input.city];
  const vocabulary = CITY_VOCABULARIES[input.city];

  if (!config || !vocabulary) {
    console.error(`No configuration found for city: ${input.city}`);
    return null;
  }

  const zone = config.zones.find((z) => z.neighborhoodId === input.neighborhoodId);
  if (!zone) {
    console.error(`No zone found for neighborhood: ${input.neighborhoodId}`);
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });
  const cityContext = buildCityContext(input.city, vocabulary);

  // Build data section
  let dataSection = '';
  let sourcesCount = 0;

  if (input.permits && input.permits.length > 0) {
    dataSection += `## Planning/Permits\n${formatPermitsForPrompt(input.permits, vocabulary.currencySymbol)}\n\n`;
    sourcesCount += input.permits.length;
  }

  if (input.licenses && input.licenses.length > 0) {
    dataSection += `## Licensing\n${formatLicensesForPrompt(input.licenses)}\n\n`;
    sourcesCount += input.licenses.length;
  }

  if (input.safetyStats) {
    dataSection += `## Safety Statistics\n${formatSafetyForPrompt(input.safetyStats)}\n\n`;
    sourcesCount += 1;
  }

  if (!dataSection) {
    console.log(`No data to generate story for ${input.neighborhoodId}`);
    return null;
  }

  const systemPrompt = `You are the Editor for Flâneur, a luxury hyper-local newsletter.
You are writing for the "${zone.name}" feed in ${input.city}.

Target Audience Vibe: ${zone.tone}

${cityContext}

Writing Guidelines:
- Write in a conversational, insider tone - you know this neighborhood intimately
- Reference specific streets, landmarks, and local names
- Use the city-specific vocabulary provided above
- Never use American terminology for UK/Australian content
- If covering permits, focus on what it means for the neighborhood character
- Keep it punchy and scannable
- Do not editorialize on safety stats - present them factually

IMPORTANT:
- Use ${vocabulary.currencySymbol} for all monetary values
- Use local terminology (e.g., "planning permission" not "building permit" in UK)
- Reference specific addresses and landmarks`;

  const prompt = `Based on the following civic data, write a neighborhood update for ${zone.name}, ${input.city}.

${dataSection}

Write a brief headline and body. The body should be 2-4 paragraphs covering the most interesting findings.

Return your response in this JSON format:
{
  "headline": "Your headline here (under 70 chars)",
  "body": "Your full article body here with paragraph breaks",
  "previewText": "1-2 sentence teaser for the feed"
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

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      headline: parsed.headline || `What's New in ${zone.name}`,
      body: parsed.body || rawText,
      previewText: parsed.previewText || parsed.body?.substring(0, 150) || '',
      dataType: input.dataType,
      neighborhoodId: input.neighborhoodId,
      city: input.city,
      currency: config.currency,
      sourcesCount,
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

/**
 * Generate a weekly digest for an international neighborhood
 */
export async function generateGlobalWeeklyDigest(
  neighborhoodId: string,
  permits: StoryData[],
  licenses: StoryData[],
  safetyStats?: SafetyStats
): Promise<GlobalWeeklyDigest | null> {
  const zoneInfo = getZoneByNeighborhoodId(neighborhoodId);
  if (!zoneInfo) {
    console.error(`Unknown neighborhood ID: ${neighborhoodId}`);
    return null;
  }

  const { city, zone } = zoneInfo;
  const config = GLOBAL_CITY_CONFIG[city];
  const vocabulary = CITY_VOCABULARIES[city];

  if (!config || !vocabulary) {
    console.error(`No configuration found for city: ${city}`);
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });
  const cityContext = buildCityContext(city, vocabulary);

  // Build comprehensive data section
  let dataSection = `# Weekly Data Summary for ${zone.name}, ${city}\n\n`;

  if (permits.length > 0) {
    dataSection += `## Planning & Development (${permits.length} applications)\n`;
    dataSection += formatPermitsForPrompt(permits, vocabulary.currencySymbol);
    dataSection += '\n\n';
  }

  if (licenses.length > 0) {
    dataSection += `## Licensing Activity (${licenses.length} applications)\n`;
    dataSection += formatLicensesForPrompt(licenses);
    dataSection += '\n\n';
  }

  if (safetyStats) {
    dataSection += `## Safety Snapshot\n`;
    dataSection += formatSafetyForPrompt(safetyStats);
    dataSection += '\n\n';
  }

  const systemPrompt = `You are the Editor for Flâneur writing a weekly civic digest for ${zone.name}, ${city}.

Editorial Tone: ${zone.tone}

${cityContext}

Writing Style:
- Authoritative local journalism
- Use city-specific terminology throughout
- Specific addresses and landmarks, never generic descriptions
- Cover the most interesting developments first
- Use section headers like "[[Development Watch]]", "[[New on the Block]]", "[[Safety Snapshot]]"
- Be factual about safety stats - no editorializing

This is a weekly recap - substantive but readable in 3-4 minutes.`;

  const prompt = `Write a comprehensive weekly digest for ${zone.name}, ${city} based on this week's public data.

${dataSection}

Structure your article with:
1. A compelling headline (under 70 chars)
2. A brief intro (1-2 sentences)
3. Sections for notable planning/permits, licensing news, and safety stats
4. Use [[Section Header]] format for headers
5. Use ${vocabulary.currencySymbol} for all monetary values

Return JSON:
{
  "headline": "Your headline",
  "body": "Full article with [[Section Headers]] and paragraphs",
  "previewText": "1-2 sentence teaser"
}`;

  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: {
        temperature: 0.6,
      },
    });

    const rawText = response.text || '';

    // Extract JSON
    const jsonMatch = rawText.match(/\{[\s\S]*"headline"[\s\S]*"body"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from weekly digest response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      neighborhoodId,
      city,
      headline: parsed.headline || `This Week in ${zone.name}`,
      body: parsed.body || rawText,
      previewText: parsed.previewText || '',
      permitCount: permits.length,
      licenseCount: licenses.length,
      safetyIncidents: safetyStats?.totalIncidents || 0,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Weekly digest generation error:', error);
    throw error;
  }
}

/**
 * Generate a brief context snippet for daily briefs
 * Used to inject civic data mentions into the main brief generation
 */
export async function generateGlobalBriefContext(
  neighborhoodId: string,
  permits: StoryData[],
  licenses: StoryData[]
): Promise<string | null> {
  const zoneInfo = getZoneByNeighborhoodId(neighborhoodId);
  if (!zoneInfo) return null;

  const { city } = zoneInfo;
  const vocabulary = CITY_VOCABULARIES[city];
  if (!vocabulary) return null;

  // Filter to most interesting items
  const notablePermits = permits
    .filter((p) => p.value && p.value >= 500000)
    .slice(0, 2);

  const notableLicenses = licenses.slice(0, 2);

  if (notablePermits.length === 0 && notableLicenses.length === 0) {
    return null;
  }

  // Build a simple context snippet without calling AI
  const snippets: string[] = [];

  if (notablePermits.length > 0) {
    const permitMentions = notablePermits
      .map((p) => {
        const value = p.value
          ? ` (${vocabulary.currencySymbol}${(p.value / 1000000).toFixed(1)}M)`
          : '';
        return `${vocabulary.permitTerms[0].toLowerCase()} filed at ${p.address}${value}`;
      })
      .slice(0, 2);

    snippets.push(
      `Public records show ${permitMentions.join(' and ')}`
    );
  }

  if (notableLicenses.length > 0) {
    const licenseMentions = notableLicenses
      .map((l) => `${l.title} at ${l.address}`)
      .slice(0, 2);

    snippets.push(
      `New ${vocabulary.liquorTerms[0].toLowerCase()} applications for ${licenseMentions.join(' and ')}`
    );
  }

  return snippets.join('. ') + '.';
}
