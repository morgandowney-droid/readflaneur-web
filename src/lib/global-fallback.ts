/**
 * Global Fallback Service
 *
 * Ensures no neighborhood is ever empty by providing a universal safety net
 * for neighborhoods without custom adapters or data sources.
 *
 * Architecture:
 * 1. Check if neighborhood has custom adapter coverage
 * 2. If not, run fallback logic:
 *    - Fallback A: "Development Watch" via web search
 *    - Fallback B: "Lifestyle Watch" for dining/retail/culture
 *    - Fallback C: "Weather & Conditions" as last resort
 *
 * This service runs as a catch-all after all custom services have processed.
 */

import { GoogleGenAI } from '@google/genai';
import {
  GLOBAL_CITY_CONFIG,
  getAllInternationalNeighborhoodIds,
} from '@/config/global-locations';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { AI_MODELS } from '@/config/ai-models';
import { insiderPersona } from '@/lib/ai-persona';

// Open-Meteo API for weather fallback
const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';

/**
 * Neighborhoods with custom service coverage
 * These have dedicated services and don't need fallback
 */
const CUSTOM_COVERED_NEIGHBORHOODS = new Set([
  // NYC neighborhoods (NYC-specific services)
  'west-village',
  'tribeca',
  'soho',
  'upper-east-side',
  'upper-west-side',
  'brooklyn-heights',
  'dumbo',
  'williamsburg',
  'park-slope',
  'cobble-hill',
  'hudson-yards',
  'meatpacking',

  // London (London adapter)
  'mayfair',
  'chelsea',
  'kensington',
  'notting-hill',
  'belgravia',

  // Sydney (Sydney adapter)
  'double-bay',
  'woollahra',
  'mosman',
  'paddington-sydney',

  // Chicago (Chicago adapter)
  'gold-coast',
  'lincoln-park',
  'river-north',
  'streeterville',

  // Los Angeles (LA adapter)
  'beverly-hills',
  'bel-air',
  'pacific-palisades',
  'brentwood',
  'santa-monica',

  // Washington DC (DC adapter)
  'georgetown',
  'dupont-circle',
  'kalorama',
  'capitol-hill',

  // Dublin (Dublin adapter)
  'dublin-ballsbridge',
  'dublin-ranelagh',
  'dublin-dalkey',

  // New Zealand (NZ adapter + OIO service)
  'auckland-herne-bay',
  'auckland-remuera',
  'auckland-waiheke',
  'queenstown-dalefield',
  'queenstown-kelvin-heights',

  // Vancouver (Vancouver adapter + View Cone service)
  'vancouver-west-vancouver',
  'vancouver-point-grey',

  // Cape Town (Cape Town adapter + Conditions service)
  'capetown-atlantic-seaboard',
  'capetown-constantia',

  // Singapore (Singapore adapter + Market Watch service)
  'singapore-nassim',
  'singapore-sentosa',

  // Palm Beach (Palm Beach adapter + ARCOM service)
  'palm-beach-island',

  // Greenwich (Greenwich adapter)
  'greenwich-backcountry',
]);

/**
 * Fallback story types
 */
export type FallbackStoryType =
  | 'development'
  | 'lifestyle'
  | 'weather'
  | 'generic';

/**
 * Neighborhood info for fallback generation
 */
export interface NeighborhoodInfo {
  id: string;
  name: string;
  city: string;
  country: string;
  tone: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Fallback story result
 */
export interface FallbackStory {
  neighborhoodId: string;
  storyType: FallbackStoryType;
  headline: string;
  body: string;
  previewText: string;
  categoryLabel: string;
  generatedAt: string;
  source: 'fallback';
}

/**
 * Fallback processing result
 */
export interface FallbackResult {
  neighborhoodId: string;
  hasCoverage: boolean;
  fallbackUsed: boolean;
  story: FallbackStory | null;
  error: string | null;
}

/**
 * Check if a neighborhood has custom adapter/service coverage
 */
export function isCoveredByCustomAdapter(neighborhoodId: string): boolean {
  return CUSTOM_COVERED_NEIGHBORHOODS.has(neighborhoodId);
}

/**
 * Get all neighborhoods that need fallback coverage
 */
export function getNeighborhoodsNeedingFallback(): string[] {
  const allIds = getAllInternationalNeighborhoodIds();
  return allIds.filter((id) => !isCoveredByCustomAdapter(id));
}

/**
 * Get neighborhood info from config
 */
export function getNeighborhoodInfo(neighborhoodId: string): NeighborhoodInfo | null {
  for (const [city, config] of Object.entries(GLOBAL_CITY_CONFIG)) {
    const zone = config.zones.find((z) => z.neighborhoodId === neighborhoodId);
    if (zone) {
      return {
        id: neighborhoodId,
        name: zone.name,
        city,
        country: config.country,
        tone: zone.tone,
      };
    }
  }
  return null;
}

/**
 * Fallback A: Development Watch
 * Searches for real estate and development news
 */
export async function generateDevelopmentWatchStory(
  neighborhood: NeighborhoodInfo
): Promise<FallbackStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  const searchQuery = `"${neighborhood.name}" AND ("real estate" OR "development" OR "zoning" OR "opening" OR "new restaurant" OR "new store")`;

  const systemPrompt = `${insiderPersona(`${neighborhood.name}, ${neighborhood.city}`, 'Editor')}

Context: ${neighborhood.tone}

Writing Style:
- Tone: 'Informed Local'
- Focus on notable changes: new developments, store openings, restaurant launches
- Reference specific streets or landmarks if possible
- Keep it relevant to affluent, discerning readers
- No emojis

IMPORTANT: You are generating this story based on general knowledge of ${neighborhood.name}.
Create a plausible, evergreen story about recent developments or openings that would interest local residents.
If you don't have specific current information, create a "neighborhood pulse" style story about the area's character and recent trends.`;

  const prompt = `Neighborhood: ${neighborhood.name}, ${neighborhood.city}, ${neighborhood.country}
Character: ${neighborhood.tone}
Search Intent: ${searchQuery}

Task: Write a 60-word "Development Watch" story about recent or upcoming changes in ${neighborhood.name}.

Options:
1. If you know of specific recent developments, reference them
2. Otherwise, write about the neighborhood's current character and what trends are emerging
3. Always make it feel local and informed

Return JSON:
{
  "headline": "Development Watch: [specific detail about ${neighborhood.name}] (under 65 chars)",
  "body": "60-word story about developments, openings, or neighborhood trends",
  "previewText": "One sentence teaser",
  "link_candidates": [{"text": "exact phrase from body"}]
}`;

  try {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: {
        temperature: 0.8,
      },
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

    let body = parsed.body || `The latest from ${neighborhood.name}.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, {
        name: neighborhood.name,
        city: neighborhood.city,
      });
    }

    return {
      neighborhoodId: neighborhood.id,
      storyType: 'development',
      headline: parsed.headline || `Development Watch: ${neighborhood.name} Update`,
      body,
      previewText: parsed.previewText || `What's new in ${neighborhood.name}.`,
      categoryLabel: 'Neighborhood Watch',
      generatedAt: new Date().toISOString(),
      source: 'fallback',
    };
  } catch (error) {
    console.error('Development watch generation error:', error);
    return null;
  }
}

/**
 * Fallback B: Lifestyle Watch
 * Focuses on dining, shopping, culture
 */
export async function generateLifestyleWatchStory(
  neighborhood: NeighborhoodInfo
): Promise<FallbackStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  const systemPrompt = `${insiderPersona(`${neighborhood.name}, ${neighborhood.city}`, 'Editor')}

Context: ${neighborhood.tone}

Writing Style:
- Tone: 'Sophisticated Insider'
- Focus on dining, shopping, culture, nightlife
- Reference specific venues or establishments if possible
- Appeal to affluent residents who appreciate the finer things
- No emojis`;

  const prompt = `Neighborhood: ${neighborhood.name}, ${neighborhood.city}, ${neighborhood.country}
Character: ${neighborhood.tone}

Task: Write a 50-word "Lifestyle Watch" story about the dining, shopping, or cultural scene in ${neighborhood.name}.

Focus on:
- Notable restaurants or cafes
- Boutiques or galleries
- Cultural happenings
- The neighborhood's social character

Return JSON:
{
  "headline": "Lifestyle Watch: [dining/shopping/culture in ${neighborhood.name}] (under 60 chars)",
  "body": "50-word story about lifestyle and culture",
  "previewText": "One sentence teaser",
  "link_candidates": [{"text": "exact phrase from body"}]
}`;

  try {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: { temperature: 0.85 },
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

    let body = parsed.body || `Life in ${neighborhood.name}.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, {
        name: neighborhood.name,
        city: neighborhood.city,
      });
    }

    return {
      neighborhoodId: neighborhood.id,
      storyType: 'lifestyle',
      headline: parsed.headline || `Lifestyle Watch: ${neighborhood.name}`,
      body,
      previewText: parsed.previewText || `The scene in ${neighborhood.name}.`,
      categoryLabel: 'Local Life',
      generatedAt: new Date().toISOString(),
      source: 'fallback',
    };
  } catch (error) {
    console.error('Lifestyle watch generation error:', error);
    return null;
  }
}

/**
 * Fallback C: Weather & Conditions
 * Last resort - always available via Open-Meteo
 */
export async function generateWeatherStory(
  neighborhood: NeighborhoodInfo,
  latitude: number,
  longitude: number
): Promise<FallbackStory | null> {
  try {
    // Fetch weather from Open-Meteo
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      current: 'temperature_2m,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min,weather_code',
      timezone: 'auto',
      forecast_days: '3',
    });

    const url = `${OPEN_METEO_API}?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Open-Meteo error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const current = data.current;
    const daily = data.daily;

    const temp = Math.round(current?.temperature_2m || 20);
    const weatherCode = current?.weather_code || 0;
    const weatherDesc = getWeatherDescription(weatherCode);

    const weekendMax = Math.round(daily?.temperature_2m_max?.[2] || temp);
    const weekendCondition = getWeatherDescription(daily?.weather_code?.[2] || 0);

    return {
      neighborhoodId: neighborhood.id,
      storyType: 'weather',
      headline: `${neighborhood.name}: ${temp}°C, ${weatherDesc}`,
      body: `Current conditions in ${neighborhood.name}: ${temp}°C and ${weatherDesc.toLowerCase()}. Weekend forecast shows highs of ${weekendMax}°C with ${weekendCondition.toLowerCase()} conditions. Plan accordingly.`,
      previewText: `${temp}°C in ${neighborhood.name} today.`,
      categoryLabel: 'Conditions',
      generatedAt: new Date().toISOString(),
      source: 'fallback',
    };
  } catch (error) {
    console.error('Weather story generation error:', error);
    return null;
  }
}

/**
 * Convert WMO weather code to description
 */
function getWeatherDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: 'Clear skies',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    80: 'Slight showers',
    81: 'Moderate showers',
    82: 'Violent showers',
    95: 'Thunderstorm',
  };
  return descriptions[code] || 'Variable conditions';
}

/**
 * Process fallback for a single neighborhood
 */
export async function processFallbackForNeighborhood(
  neighborhoodId: string
): Promise<FallbackResult> {
  // Check if already covered
  if (isCoveredByCustomAdapter(neighborhoodId)) {
    return {
      neighborhoodId,
      hasCoverage: true,
      fallbackUsed: false,
      story: null,
      error: null,
    };
  }

  // Get neighborhood info
  const info = getNeighborhoodInfo(neighborhoodId);
  if (!info) {
    return {
      neighborhoodId,
      hasCoverage: false,
      fallbackUsed: false,
      story: null,
      error: `Neighborhood not found: ${neighborhoodId}`,
    };
  }

  try {
    // Try Fallback A: Development Watch
    let story = await generateDevelopmentWatchStory(info);
    if (story) {
      return {
        neighborhoodId,
        hasCoverage: false,
        fallbackUsed: true,
        story,
        error: null,
      };
    }

    // Try Fallback B: Lifestyle Watch
    story = await generateLifestyleWatchStory(info);
    if (story) {
      return {
        neighborhoodId,
        hasCoverage: false,
        fallbackUsed: true,
        story,
        error: null,
      };
    }

    // Fallback C: Weather (if we have coordinates)
    if (info.latitude && info.longitude) {
      story = await generateWeatherStory(info, info.latitude, info.longitude);
      if (story) {
        return {
          neighborhoodId,
          hasCoverage: false,
          fallbackUsed: true,
          story,
          error: null,
        };
      }
    }

    return {
      neighborhoodId,
      hasCoverage: false,
      fallbackUsed: false,
      story: null,
      error: 'All fallback methods failed',
    };
  } catch (error) {
    return {
      neighborhoodId,
      hasCoverage: false,
      fallbackUsed: false,
      story: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Process fallback for all uncovered neighborhoods
 */
export async function processAllFallbacks(): Promise<{
  total: number;
  covered: number;
  fallbackGenerated: number;
  failed: number;
  results: FallbackResult[];
}> {
  const uncoveredIds = getNeighborhoodsNeedingFallback();
  const results: FallbackResult[] = [];
  let covered = 0;
  let fallbackGenerated = 0;
  let failed = 0;

  console.log(`Processing fallback for ${uncoveredIds.length} neighborhoods...`);

  for (const id of uncoveredIds) {
    const result = await processFallbackForNeighborhood(id);
    results.push(result);

    if (result.hasCoverage) {
      covered++;
    } else if (result.fallbackUsed && result.story) {
      fallbackGenerated++;
    } else {
      failed++;
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return {
    total: uncoveredIds.length,
    covered,
    fallbackGenerated,
    failed,
    results,
  };
}

/**
 * Get fallback coverage stats
 */
export function getFallbackCoverageStats(): {
  totalNeighborhoods: number;
  customCovered: number;
  needsFallback: number;
  customCoveredList: string[];
  needsFallbackList: string[];
} {
  const allIds = getAllInternationalNeighborhoodIds();
  const customCoveredList = allIds.filter((id) => isCoveredByCustomAdapter(id));
  const needsFallbackList = allIds.filter((id) => !isCoveredByCustomAdapter(id));

  return {
    totalNeighborhoods: allIds.length,
    customCovered: customCoveredList.length,
    needsFallback: needsFallbackList.length,
    customCoveredList,
    needsFallbackList,
  };
}
