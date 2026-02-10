/**
 * Cape Town Conditions Service
 *
 * Monitors two critical Cape Town conditions:
 * 1. "Calm Alert" - Wind conditions (The Cape Doctor is the notorious SE wind)
 * 2. "Grid Watch" - Eskom load shedding stages
 *
 * Feature A (Wind): Trigger if wind < 15km/h (Rare calm - perfect beach day)
 * Feature B (Grid): Trigger on Load Shedding Stage Change
 *
 * Target neighborhoods: capetown-atlantic-seaboard, capetown-constantia
 */

import { GoogleGenAI } from '@google/genai';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { AI_MODELS } from '@/config/ai-models';

// External APIs
const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';
const ESKOM_SE_PUSH_API = 'https://developer.sepush.co.za/business/2.0';

// Cape Town coordinates (Camps Bay)
const CAPE_TOWN_LAT = -33.9505;
const CAPE_TOWN_LON = 18.3776;

// Wind threshold for "Calm Alert" (km/h)
const CALM_WIND_THRESHOLD = 15;

// Cape Town beach locations for wind check
const BEACH_LOCATIONS = [
  { name: 'Clifton', lat: -33.9385, lon: 18.3775 },
  { name: 'Camps Bay', lat: -33.9505, lon: 18.3776 },
  { name: 'Llandudno', lat: -34.0049, lon: 18.3448 },
];

/**
 * Wind conditions data
 */
export interface WindConditions {
  location: string;
  windSpeed: number; // km/h
  windDirection: string;
  windDegrees: number;
  temperature: number; // Celsius
  humidity: number;
  isCalm: boolean;
  isPerfectBeachDay: boolean;
  isWeekend: boolean;
  fetchedAt: string;
}

/**
 * Load shedding data
 */
export interface LoadSheddingStatus {
  stage: number; // 0-8 (0 = no load shedding)
  previousStage: number;
  stageChanged: boolean;
  nextSlots: LoadSheddingSlot[];
  area: string;
  areaId: string;
  fetchedAt: string;
}

/**
 * Load shedding time slot
 */
export interface LoadSheddingSlot {
  start: string;
  end: string;
  stage: number;
}

/**
 * Combined conditions report
 */
export interface ConditionsReport {
  wind: WindConditions | null;
  loadShedding: LoadSheddingStatus | null;
  alerts: ConditionAlert[];
}

/**
 * Condition alert for story generation
 */
export interface ConditionAlert {
  type: 'calm' | 'loadshedding';
  neighborhoodId: string;
  headline: string;
  body: string;
  previewText: string;
  severity: 'info' | 'warning' | 'critical';
  generatedAt: string;
}

/**
 * Convert wind degrees to direction
 */
function degreesToDirection(degrees: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

/**
 * Check if today is a weekend
 */
function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

/**
 * Fetch wind conditions from Open-Meteo
 */
export async function fetchWindConditions(): Promise<WindConditions | null> {
  try {
    const params = new URLSearchParams({
      latitude: CAPE_TOWN_LAT.toString(),
      longitude: CAPE_TOWN_LON.toString(),
      current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m',
      timezone: 'Africa/Johannesburg',
    });

    const url = `${OPEN_METEO_API}?${params}`;
    console.log('Fetching Cape Town wind conditions...');

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Open-Meteo API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const current = data.current;

    if (!current) {
      console.error('No current weather data');
      return null;
    }

    const windSpeed = current.wind_speed_10m || 0;
    const windDegrees = current.wind_direction_10m || 0;
    const temperature = current.temperature_2m || 0;
    const humidity = current.relative_humidity_2m || 0;

    const isCalm = windSpeed < CALM_WIND_THRESHOLD;
    const weekend = isWeekend();
    const isPerfectBeachDay = isCalm && weekend && temperature >= 22;

    return {
      location: 'Camps Bay',
      windSpeed,
      windDirection: degreesToDirection(windDegrees),
      windDegrees,
      temperature,
      humidity,
      isCalm,
      isPerfectBeachDay,
      isWeekend: weekend,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Wind conditions fetch error:', error);
    return null;
  }
}

/**
 * Fetch load shedding status from EskomSePush API
 * Note: Requires ESKOMSEPUSH_API_KEY environment variable
 */
export async function fetchLoadSheddingStatus(): Promise<LoadSheddingStatus | null> {
  const apiKey = process.env.ESKOMSEPUSH_API_KEY;

  if (!apiKey) {
    console.log('ESKOMSEPUSH_API_KEY not configured, using mock data');
    // Return mock data for development
    return {
      stage: 0,
      previousStage: 0,
      stageChanged: false,
      nextSlots: [],
      area: 'Cape Town',
      areaId: 'capetown',
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    // Get current status
    const statusUrl = `${ESKOM_SE_PUSH_API}/status`;
    const response = await fetch(statusUrl, {
      headers: { token: apiKey },
    });

    if (!response.ok) {
      console.error(`EskomSePush API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Extract Cape Town specific data
    const cptStatus = data.status?.capetown;
    const stage = cptStatus?.stage || 0;

    return {
      stage,
      previousStage: 0, // Would need to track this in database
      stageChanged: false,
      nextSlots: [],
      area: 'Cape Town',
      areaId: 'capetown',
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Load shedding fetch error:', error);
    return null;
  }
}

/**
 * Generate a Calm Alert story using Gemini
 */
export async function generateCalmAlertStory(
  conditions: WindConditions
): Promise<ConditionAlert | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  const perfectDay = conditions.isPerfectBeachDay
    ? 'This is a PERFECT beach day - calm winds on a weekend!'
    : conditions.isCalm
      ? 'The notorious Cape Doctor has taken a rare break.'
      : '';

  const systemPrompt = `You are the Flâneur Editor writing a "Calm Alert" for wealthy Cape Town residents on the Atlantic Seaboard.

Writing Style:
- Tone: 'Excited Local' - Calm days are precious in Cape Town
- The Cape Doctor (strong SE wind) usually blows from October to March
- Reference Clifton, Camps Bay, or Llandudno beaches
- Mention specific activities: sundowners, beach picnics, boat trips
- No emojis`;

  const prompt = `Current Conditions:
- Wind Speed: ${conditions.windSpeed.toFixed(1)} km/h (Calm threshold: <15km/h)
- Wind Direction: ${conditions.windDirection}
- Temperature: ${conditions.temperature}°C
- Is Weekend: ${conditions.isWeekend ? 'Yes' : 'No'}
- ${perfectDay}

Task: Write a 40-word Calm Alert celebrating the rare windless conditions.

Return JSON:
{
  "headline": "Calm Alert: The Cape Doctor is out. (under 60 chars)",
  "body": "40-word description of why today is special and what to do",
  "previewText": "One sentence teaser",
  "link_candidates": [{"text": "exact phrase from body"}]
}`;

  try {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: { temperature: 0.8 },
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

    let body = parsed.body || `Wind at ${conditions.windSpeed} km/h. Perfect beach weather.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, {
        name: 'Atlantic Seaboard',
        city: 'Cape Town',
      });
    }

    return {
      type: 'calm',
      neighborhoodId: 'capetown-atlantic-seaboard',
      headline: parsed.headline || 'Calm Alert: The Cape Doctor is out.',
      body,
      previewText: parsed.previewText || 'Rare calm conditions on the Atlantic Seaboard.',
      severity: conditions.isPerfectBeachDay ? 'info' : 'info',
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Calm alert generation error:', error);
    return null;
  }
}

/**
 * Generate a Grid Watch story using Gemini
 */
export async function generateGridWatchStory(
  status: LoadSheddingStatus
): Promise<ConditionAlert | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  // Only generate if stage > 0
  if (status.stage === 0) {
    return null;
  }

  const genAI = new GoogleGenAI({ apiKey });

  const severity =
    status.stage >= 6 ? 'critical' : status.stage >= 4 ? 'warning' : 'info';

  const systemPrompt = `You are the Flâneur Editor writing a "Grid Watch" alert for Cape Town residents about load shedding.

Writing Style:
- Tone: ${severity === 'critical' ? 'Urgent' : 'Matter-of-fact'}
- Load shedding is a fact of life in South Africa
- Stages: 1-2 (minor), 3-4 (moderate), 5-6 (severe), 7-8 (critical)
- Mention impact: generators, dinner reservations, events
- No emojis`;

  const prompt = `Load Shedding Status:
- Current Stage: ${status.stage}
- Area: ${status.area}
${status.nextSlots.length > 0 ? `- Next Slot: ${status.nextSlots[0].start} - ${status.nextSlots[0].end}` : ''}

Task: Write a 35-word Grid Watch alert about the current load shedding stage.

Return JSON:
{
  "headline": "Grid Watch: Stage ${status.stage} Load Shedding imminent.",
  "body": "35-word alert with practical info for residents",
  "previewText": "One sentence teaser",
  "link_candidates": [{"text": "exact phrase from body"}]
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
      console.error('Failed to extract JSON from Gemini response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const linkCandidates: LinkCandidate[] = validateLinkCandidates(
      parsed.link_candidates
    );

    let body = parsed.body || `Stage ${status.stage} load shedding is in effect.`;
    if (linkCandidates.length > 0) {
      body = injectHyperlinks(body, linkCandidates, {
        name: 'Cape Town',
        city: 'Cape Town',
      });
    }

    return {
      type: 'loadshedding',
      neighborhoodId: 'capetown-atlantic-seaboard',
      headline: parsed.headline || `Grid Watch: Stage ${status.stage} Load Shedding imminent.`,
      body,
      previewText: parsed.previewText || `Stage ${status.stage} load shedding in effect.`,
      severity,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Grid watch generation error:', error);
    return null;
  }
}

/**
 * Get full conditions report for Cape Town
 */
export async function getCapeTownConditions(): Promise<ConditionsReport> {
  const alerts: ConditionAlert[] = [];

  // Fetch wind conditions
  const wind = await fetchWindConditions();

  // Generate Calm Alert if conditions are calm
  if (wind && wind.isCalm) {
    const calmAlert = await generateCalmAlertStory(wind);
    if (calmAlert) {
      alerts.push(calmAlert);
      // Also add to Constantia
      alerts.push({
        ...calmAlert,
        neighborhoodId: 'capetown-constantia',
      });
    }
  }

  // Fetch load shedding status
  const loadShedding = await fetchLoadSheddingStatus();

  // Generate Grid Watch if load shedding active
  if (loadShedding && loadShedding.stage > 0) {
    const gridAlert = await generateGridWatchStory(loadShedding);
    if (gridAlert) {
      alerts.push(gridAlert);
      // Also add to Constantia
      alerts.push({
        ...gridAlert,
        neighborhoodId: 'capetown-constantia',
      });
    }
  }

  return {
    wind,
    loadShedding,
    alerts,
  };
}

/**
 * Check if conditions warrant an alert
 */
export function shouldGenerateAlert(conditions: ConditionsReport): boolean {
  if (!conditions.wind && !conditions.loadShedding) return false;

  // Calm wind alert
  if (conditions.wind?.isCalm) return true;

  // Load shedding alert
  if (conditions.loadShedding && conditions.loadShedding.stage > 0) return true;

  return false;
}
