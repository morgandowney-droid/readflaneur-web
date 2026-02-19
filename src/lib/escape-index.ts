/**
 * Escape Index Service
 *
 * Injects "Vacation Conditions" (Snow, Surf, Weather) into the feeds of "Feeder Cities"
 * to trigger travel decisions.
 *
 * Architecture: "The Feeder Map"
 * - We don't show snow reports in Aspen. We show them in *New York* (where the skiers are).
 * - Origin cities (feeders) receive condition alerts for their typical escape destinations.
 *
 * Data Sources:
 * - Snow: OnTheSnow API / Open-Meteo (>6 inches = Powder Day)
 * - Surf: Surfline-style data / Open-Meteo Marine (>4ft + >10s period)
 * - Sun/UV: OpenWeatherMap / Open-Meteo (Clear + high UV index)
 *
 * Story Generation: Gemini with "Urgent Leisure" tone - "Pack your bags."
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_MODELS } from '@/config/ai-models';
import {
  LinkCandidate,
  injectHyperlinks,
  validateLinkCandidates,
} from './hyperlink-injector';
import { insiderPersona } from '@/lib/ai-persona';

// =============================================================================
// TYPES
// =============================================================================

export type ConditionType = 'snow' | 'surf' | 'sun';

export type FeederCity =
  | 'New_York'
  | 'London'
  | 'Paris'
  | 'Los_Angeles'
  | 'San_Francisco'
  | 'Chicago'
  | 'Sydney'
  | 'Hong_Kong'
  | 'Tokyo'
  | 'Miami';

export type EscapeDestination =
  // Snow destinations
  | 'Aspen'
  | 'Deer_Valley'
  | 'Vail'
  | 'Park_City'
  | 'Jackson_Hole'
  | 'Telluride'
  | 'Whistler'
  | 'Courchevel'
  | 'St_Moritz'
  | 'Zermatt'
  | 'Niseko'
  | 'Verbier'
  | 'Tahoe'
  // Surf destinations
  | 'The_Hamptons'
  | 'Malibu'
  | 'Byron_Bay'
  | 'Noosa'
  | 'Biarritz'
  | 'Cornwall'
  | 'Portugal'
  | 'Costa_Rica'
  | 'Hawaii'
  // Sun destinations
  | 'St_Barts'
  | 'Cabo'
  | 'Ibiza'
  | 'Mykonos'
  | 'Amalfi'
  | 'Turks_and_Caicos'
  | 'Palm_Beach'
  | 'Queenstown'
  | 'Tulum'
  | 'Bali'
  | 'Phuket'
  | 'Maldives'
  | 'Okinawa'
  | 'Guam'
  | 'Fiji'
  | 'Tokyo';

export interface FeederConfig {
  targets: EscapeDestination[];
  neighborhoodIds: string[]; // Flâneur neighborhood IDs that receive alerts
}

export interface DestinationConfig {
  name: string;
  conditionType: ConditionType;
  latitude: number;
  longitude: number;
  timezone: string;
  seasonStart: number; // Month (1-12)
  seasonEnd: number; // Month (1-12)
  elevation?: number; // For snow resorts (meters)
}

export interface SnowCondition {
  type: 'snow';
  destination: EscapeDestination;
  snowfall24h: number; // inches
  snowfallCm: number; // cm
  baseDepth: number; // inches
  newSnow: boolean;
  isPowderDay: boolean;
  temperature: number; // Fahrenheit
  conditions: string; // e.g., "Heavy Snow", "Light Snow"
  timestamp: string;
}

export interface SurfCondition {
  type: 'surf';
  destination: EscapeDestination;
  swellHeight: number; // feet
  swellPeriod: number; // seconds
  swellDirection: string; // e.g., "SW"
  windSpeed: number; // mph
  windDirection: string;
  isFiring: boolean;
  waterTemp: number; // Fahrenheit
  timestamp: string;
}

export interface SunCondition {
  type: 'sun';
  destination: EscapeDestination;
  temperature: number; // Fahrenheit
  temperatureCelsius: number;
  uvIndex: number;
  humidity: number;
  conditions: string; // e.g., "Clear", "Partly Cloudy"
  isPerfectWeekend: boolean;
  forecastDays: number; // Days of good weather ahead
  timestamp: string;
}

export type EscapeCondition = SnowCondition | SurfCondition | SunCondition;

export interface EscapeStory {
  originCity: FeederCity;
  destination: EscapeDestination;
  conditionType: ConditionType;
  condition: EscapeCondition;
  headline: string;
  body: string;
  previewText: string;
  targetNeighborhoods: string[];
  categoryLabel: string;
  urgencyLevel: 'high' | 'medium' | 'low';
  generatedAt: string;
}

export interface EscapeProcessResult {
  conditionsChecked: number;
  alertsTriggered: number;
  storiesGenerated: number;
  byConditionType: Record<ConditionType, number>;
  byOriginCity: Record<string, number>;
  stories: EscapeStory[];
  errors: string[];
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * The Feeder Map: Origin cities and their typical escape destinations
 */
export const ESCAPE_ROUTES: Record<FeederCity, FeederConfig> = {
  New_York: {
    targets: [
      'Aspen',
      'Deer_Valley',
      'Vail',
      'The_Hamptons',
      'St_Barts',
      'Turks_and_Caicos',
      'Palm_Beach',
    ],
    neighborhoodIds: [
      'nyc-upper-east-side',
      'nyc-upper-west-side',
      'nyc-tribeca',
      'nyc-west-village',
      'nyc-soho',
      'nyc-greenwich-village',
      'nyc-chelsea',
      'nyc-hudson-yards',
    ],
  },
  London: {
    targets: ['Courchevel', 'Verbier', 'St_Moritz', 'Ibiza', 'Cornwall', 'Mykonos', 'Amalfi'],
    neighborhoodIds: [
      'london-mayfair',
      'london-chelsea',
      'london-kensington',
      'london-notting-hill',
      'london-hampstead',
    ],
  },
  Paris: {
    targets: ['Courchevel', 'Verbier', 'Zermatt', 'St_Barts', 'Ibiza', 'Biarritz', 'Mykonos'],
    neighborhoodIds: [
      'paris-7th-arrondissement',
      'paris-16th-arrondissement',
      'paris-le-marais',
      'paris-saint-germain',
    ],
  },
  Los_Angeles: {
    targets: ['Aspen', 'Deer_Valley', 'Park_City', 'Cabo', 'Hawaii', 'Malibu', 'Tulum'],
    neighborhoodIds: [
      'la-beverly-hills',
      'la-bel-air',
      'la-malibu',
      'la-pacific-palisades',
      'la-brentwood',
      'la-santa-monica',
    ],
  },
  San_Francisco: {
    targets: ['Tahoe', 'Park_City', 'Hawaii', 'Cabo', 'Costa_Rica', 'Tulum'],
    neighborhoodIds: ['sf-pacific-heights', 'sf-marina', 'sf-noe-valley', 'sf-russian-hill'],
  },
  Chicago: {
    targets: ['Aspen', 'Vail', 'Jackson_Hole', 'Turks_and_Caicos', 'Cabo', 'Palm_Beach'],
    neighborhoodIds: ['chicago-gold-coast', 'chicago-lincoln-park', 'chicago-river-north'],
  },
  Sydney: {
    targets: ['Byron_Bay', 'Noosa', 'Niseko', 'Queenstown', 'Bali', 'Fiji'],
    neighborhoodIds: [
      'sydney-double-bay',
      'sydney-mosman',
      'sydney-vaucluse',
      'sydney-paddington',
    ],
  },
  Hong_Kong: {
    targets: ['Niseko', 'Bali', 'Phuket', 'Maldives', 'Tokyo'],
    neighborhoodIds: ['hk-central', 'hk-the-peak', 'hk-soho'],
  },
  Tokyo: {
    targets: ['Niseko', 'Hawaii', 'Okinawa', 'Bali', 'Guam'],
    neighborhoodIds: ['tokyo-roppongi', 'tokyo-shibuya', 'tokyo-ginza', 'tokyo-azabu'],
  },
  Miami: {
    targets: ['Aspen', 'Vail', 'St_Barts', 'Turks_and_Caicos', 'The_Hamptons', 'Tulum'],
    neighborhoodIds: [
      'miami-south-beach',
      'miami-brickell',
      'miami-design-district',
      'miami-coral-gables',
    ],
  },
};

/**
 * Destination configurations with coordinates and seasonality
 */
export const DESTINATIONS: Record<EscapeDestination, DestinationConfig> = {
  // Snow Destinations
  Aspen: {
    name: 'Aspen',
    conditionType: 'snow',
    latitude: 39.1911,
    longitude: -106.8175,
    timezone: 'America/Denver',
    seasonStart: 11,
    seasonEnd: 4,
    elevation: 2438,
  },
  Deer_Valley: {
    name: 'Deer Valley',
    conditionType: 'snow',
    latitude: 40.6374,
    longitude: -111.478,
    timezone: 'America/Denver',
    seasonStart: 12,
    seasonEnd: 4,
    elevation: 2745,
  },
  Vail: {
    name: 'Vail',
    conditionType: 'snow',
    latitude: 39.6403,
    longitude: -106.3742,
    timezone: 'America/Denver',
    seasonStart: 11,
    seasonEnd: 4,
    elevation: 2500,
  },
  Park_City: {
    name: 'Park City',
    conditionType: 'snow',
    latitude: 40.6461,
    longitude: -111.498,
    timezone: 'America/Denver',
    seasonStart: 11,
    seasonEnd: 4,
    elevation: 2103,
  },
  Jackson_Hole: {
    name: 'Jackson Hole',
    conditionType: 'snow',
    latitude: 43.5875,
    longitude: -110.8279,
    timezone: 'America/Denver',
    seasonStart: 12,
    seasonEnd: 4,
    elevation: 1924,
  },
  Telluride: {
    name: 'Telluride',
    conditionType: 'snow',
    latitude: 37.9375,
    longitude: -107.8123,
    timezone: 'America/Denver',
    seasonStart: 11,
    seasonEnd: 4,
    elevation: 2667,
  },
  Whistler: {
    name: 'Whistler',
    conditionType: 'snow',
    latitude: 50.1163,
    longitude: -122.9574,
    timezone: 'America/Vancouver',
    seasonStart: 11,
    seasonEnd: 5,
    elevation: 675,
  },
  Courchevel: {
    name: 'Courchevel',
    conditionType: 'snow',
    latitude: 45.4153,
    longitude: 6.6347,
    timezone: 'Europe/Paris',
    seasonStart: 12,
    seasonEnd: 4,
    elevation: 1850,
  },
  St_Moritz: {
    name: 'St. Moritz',
    conditionType: 'snow',
    latitude: 46.4908,
    longitude: 9.8355,
    timezone: 'Europe/Zurich',
    seasonStart: 11,
    seasonEnd: 4,
    elevation: 1822,
  },
  Zermatt: {
    name: 'Zermatt',
    conditionType: 'snow',
    latitude: 46.0207,
    longitude: 7.7491,
    timezone: 'Europe/Zurich',
    seasonStart: 11,
    seasonEnd: 5,
    elevation: 1620,
  },
  Niseko: {
    name: 'Niseko',
    conditionType: 'snow',
    latitude: 42.8048,
    longitude: 140.6874,
    timezone: 'Asia/Tokyo',
    seasonStart: 12,
    seasonEnd: 4,
    elevation: 1200,
  },
  Verbier: {
    name: 'Verbier',
    conditionType: 'snow',
    latitude: 46.0961,
    longitude: 7.2286,
    timezone: 'Europe/Zurich',
    seasonStart: 11,
    seasonEnd: 4,
    elevation: 1500,
  },
  Tahoe: {
    name: 'Lake Tahoe',
    conditionType: 'snow',
    latitude: 39.0968,
    longitude: -120.0324,
    timezone: 'America/Los_Angeles',
    seasonStart: 11,
    seasonEnd: 4,
    elevation: 1897,
  },

  // Surf Destinations
  The_Hamptons: {
    name: 'The Hamptons',
    conditionType: 'surf',
    latitude: 40.9632,
    longitude: -72.1843,
    timezone: 'America/New_York',
    seasonStart: 5,
    seasonEnd: 10,
  },
  Malibu: {
    name: 'Malibu',
    conditionType: 'surf',
    latitude: 34.0259,
    longitude: -118.7798,
    timezone: 'America/Los_Angeles',
    seasonStart: 1,
    seasonEnd: 12, // Year-round
  },
  Byron_Bay: {
    name: 'Byron Bay',
    conditionType: 'surf',
    latitude: -28.6436,
    longitude: 153.612,
    timezone: 'Australia/Sydney',
    seasonStart: 1,
    seasonEnd: 12,
  },
  Noosa: {
    name: 'Noosa',
    conditionType: 'surf',
    latitude: -26.3927,
    longitude: 153.0743,
    timezone: 'Australia/Brisbane',
    seasonStart: 1,
    seasonEnd: 12,
  },
  Biarritz: {
    name: 'Biarritz',
    conditionType: 'surf',
    latitude: 43.4832,
    longitude: -1.5586,
    timezone: 'Europe/Paris',
    seasonStart: 4,
    seasonEnd: 11,
  },
  Cornwall: {
    name: 'Cornwall',
    conditionType: 'surf',
    latitude: 50.2654,
    longitude: -5.0527,
    timezone: 'Europe/London',
    seasonStart: 4,
    seasonEnd: 10,
  },
  Portugal: {
    name: 'Portugal (Ericeira)',
    conditionType: 'surf',
    latitude: 38.9631,
    longitude: -9.4178,
    timezone: 'Europe/Lisbon',
    seasonStart: 9,
    seasonEnd: 5,
  },
  Costa_Rica: {
    name: 'Costa Rica',
    conditionType: 'surf',
    latitude: 9.6478,
    longitude: -85.4341,
    timezone: 'America/Costa_Rica',
    seasonStart: 1,
    seasonEnd: 12,
  },
  Hawaii: {
    name: 'Hawaii',
    conditionType: 'surf',
    latitude: 21.4389,
    longitude: -158.0001,
    timezone: 'Pacific/Honolulu',
    seasonStart: 1,
    seasonEnd: 12,
  },

  // Sun Destinations
  St_Barts: {
    name: 'St. Barts',
    conditionType: 'sun',
    latitude: 17.8961,
    longitude: -62.8491,
    timezone: 'America/St_Barthelemy',
    seasonStart: 12,
    seasonEnd: 4,
  },
  Cabo: {
    name: 'Cabo San Lucas',
    conditionType: 'sun',
    latitude: 22.8905,
    longitude: -109.9167,
    timezone: 'America/Mazatlan',
    seasonStart: 11,
    seasonEnd: 5,
  },
  Ibiza: {
    name: 'Ibiza',
    conditionType: 'sun',
    latitude: 38.9067,
    longitude: 1.4206,
    timezone: 'Europe/Madrid',
    seasonStart: 5,
    seasonEnd: 10,
  },
  Mykonos: {
    name: 'Mykonos',
    conditionType: 'sun',
    latitude: 37.4467,
    longitude: 25.3289,
    timezone: 'Europe/Athens',
    seasonStart: 5,
    seasonEnd: 10,
  },
  Amalfi: {
    name: 'Amalfi Coast',
    conditionType: 'sun',
    latitude: 40.6333,
    longitude: 14.6027,
    timezone: 'Europe/Rome',
    seasonStart: 5,
    seasonEnd: 10,
  },
  Turks_and_Caicos: {
    name: 'Turks and Caicos',
    conditionType: 'sun',
    latitude: 21.694,
    longitude: -71.7979,
    timezone: 'America/Grand_Turk',
    seasonStart: 12,
    seasonEnd: 5,
  },
  Palm_Beach: {
    name: 'Palm Beach',
    conditionType: 'sun',
    latitude: 26.7056,
    longitude: -80.0364,
    timezone: 'America/New_York',
    seasonStart: 11,
    seasonEnd: 4,
  },
  Queenstown: {
    name: 'Queenstown',
    conditionType: 'sun', // Summer destination for Southern Hemisphere
    latitude: -45.0312,
    longitude: 168.6626,
    timezone: 'Pacific/Auckland',
    seasonStart: 11,
    seasonEnd: 3,
  },
  Tulum: {
    name: 'Tulum',
    conditionType: 'sun',
    latitude: 20.2114,
    longitude: -87.4654,
    timezone: 'America/Cancun',
    seasonStart: 11,
    seasonEnd: 5,
  },
  Bali: {
    name: 'Bali',
    conditionType: 'sun',
    latitude: -8.3405,
    longitude: 115.092,
    timezone: 'Asia/Makassar',
    seasonStart: 4,
    seasonEnd: 10,
  },
  Phuket: {
    name: 'Phuket',
    conditionType: 'sun',
    latitude: 7.8804,
    longitude: 98.3923,
    timezone: 'Asia/Bangkok',
    seasonStart: 11,
    seasonEnd: 4,
  },
  Maldives: {
    name: 'Maldives',
    conditionType: 'sun',
    latitude: 3.2028,
    longitude: 73.2207,
    timezone: 'Indian/Maldives',
    seasonStart: 11,
    seasonEnd: 4,
  },
  Okinawa: {
    name: 'Okinawa',
    conditionType: 'sun',
    latitude: 26.2124,
    longitude: 127.6809,
    timezone: 'Asia/Tokyo',
    seasonStart: 4,
    seasonEnd: 10,
  },
  Guam: {
    name: 'Guam',
    conditionType: 'sun',
    latitude: 13.4443,
    longitude: 144.7937,
    timezone: 'Pacific/Guam',
    seasonStart: 1,
    seasonEnd: 12,
  },
  Fiji: {
    name: 'Fiji',
    conditionType: 'sun',
    latitude: -17.7134,
    longitude: 178.065,
    timezone: 'Pacific/Fiji',
    seasonStart: 5,
    seasonEnd: 11,
  },
  Tokyo: {
    name: 'Tokyo',
    conditionType: 'sun',
    latitude: 35.6762,
    longitude: 139.6503,
    timezone: 'Asia/Tokyo',
    seasonStart: 3,
    seasonEnd: 11,
  },
};

// =============================================================================
// THRESHOLDS
// =============================================================================

/**
 * Powder Day threshold: >6 inches in 24 hours
 */
export const POWDER_DAY_THRESHOLD_INCHES = 6;

/**
 * Surf "Firing" thresholds
 */
export const SURF_FIRING_THRESHOLDS = {
  minSwellHeight: 4, // feet
  minSwellPeriod: 10, // seconds
  maxWindSpeed: 15, // mph (offshore or light wind preferred)
};

/**
 * Perfect Weekend thresholds
 */
export const SUN_PERFECT_THRESHOLDS = {
  minTemp: 70, // Fahrenheit (21C)
  minUvIndex: 5, // Moderate to high
  maxCloudCover: 30, // percent
  minForecastDays: 2, // At least 2 good days ahead
};

// =============================================================================
// DATA FETCHING: OPEN-METEO (Free, No API Key)
// =============================================================================

/**
 * Fetch snow conditions using Open-Meteo API
 */
export async function fetchSnowConditions(destination: EscapeDestination): Promise<SnowCondition | null> {
  const config = DESTINATIONS[destination];
  if (!config || config.conditionType !== 'snow') return null;

  // Check if in season
  const now = new Date();
  const month = now.getMonth() + 1;
  const inSeason = isInSeason(config.seasonStart, config.seasonEnd, month);
  if (!inSeason) return null;

  try {
    // Open-Meteo forecast API with snowfall
    const params = new URLSearchParams({
      latitude: config.latitude.toString(),
      longitude: config.longitude.toString(),
      daily: 'snowfall_sum,temperature_2m_max,temperature_2m_min,weathercode',
      hourly: 'snowfall,temperature_2m',
      timezone: config.timezone,
      forecast_days: '2',
    });

    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) {
      console.error(`Open-Meteo error for ${destination}:`, response.status);
      return null;
    }

    const data = await response.json();

    // Calculate 24h snowfall from hourly data
    const hourlySnowfall: number[] = data.hourly?.snowfall || [];
    const last24hSnowfall = hourlySnowfall.slice(0, 24).reduce((sum, val) => sum + (val || 0), 0);

    // Convert cm to inches (Open-Meteo returns cm)
    const snowfallInches = last24hSnowfall / 2.54;

    // Get current temperature
    const currentTemp = data.hourly?.temperature_2m?.[0] || 0;
    const tempF = (currentTemp * 9) / 5 + 32;

    // Determine weather description from code
    const weatherCode = data.daily?.weathercode?.[0] || 0;
    const conditions = getWeatherDescription(weatherCode);

    const isPowderDay = snowfallInches >= POWDER_DAY_THRESHOLD_INCHES;

    return {
      type: 'snow',
      destination,
      snowfall24h: Math.round(snowfallInches * 10) / 10,
      snowfallCm: Math.round(last24hSnowfall * 10) / 10,
      baseDepth: 0, // Would need separate data source
      newSnow: snowfallInches > 0,
      isPowderDay,
      temperature: Math.round(tempF),
      conditions,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error fetching snow for ${destination}:`, error);
    return null;
  }
}

/**
 * Fetch surf conditions using Open-Meteo Marine API
 */
export async function fetchSurfConditions(destination: EscapeDestination): Promise<SurfCondition | null> {
  const config = DESTINATIONS[destination];
  if (!config || config.conditionType !== 'surf') return null;

  // Check if in season
  const now = new Date();
  const month = now.getMonth() + 1;
  const inSeason = isInSeason(config.seasonStart, config.seasonEnd, month);
  if (!inSeason) return null;

  try {
    // Open-Meteo Marine API for wave data
    const params = new URLSearchParams({
      latitude: config.latitude.toString(),
      longitude: config.longitude.toString(),
      hourly: 'wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period',
      daily: 'wave_height_max,wave_period_max',
      timezone: config.timezone,
      forecast_days: '3',
    });

    const response = await fetch(`https://marine-api.open-meteo.com/v1/marine?${params}`);
    if (!response.ok) {
      console.error(`Open-Meteo Marine error for ${destination}:`, response.status);
      return null;
    }

    const data = await response.json();

    // Get current conditions (first hour)
    const swellHeight = data.hourly?.swell_wave_height?.[0] || data.hourly?.wave_height?.[0] || 0;
    const swellPeriod = data.hourly?.swell_wave_period?.[0] || data.hourly?.wave_period?.[0] || 0;
    const waveDirection = data.hourly?.wave_direction?.[0] || 0;

    // Convert meters to feet
    const swellHeightFt = swellHeight * 3.28084;

    // Get wind data from regular forecast
    const windParams = new URLSearchParams({
      latitude: config.latitude.toString(),
      longitude: config.longitude.toString(),
      hourly: 'windspeed_10m,winddirection_10m',
      timezone: config.timezone,
    });

    const windResponse = await fetch(`https://api.open-meteo.com/v1/forecast?${windParams}`);
    const windData = windResponse.ok ? await windResponse.json() : null;

    const windSpeed = windData?.hourly?.windspeed_10m?.[0] || 0;
    const windDirection = windData?.hourly?.winddirection_10m?.[0] || 0;

    // Convert km/h to mph
    const windSpeedMph = windSpeed * 0.621371;

    const isFiring =
      swellHeightFt >= SURF_FIRING_THRESHOLDS.minSwellHeight &&
      swellPeriod >= SURF_FIRING_THRESHOLDS.minSwellPeriod &&
      windSpeedMph <= SURF_FIRING_THRESHOLDS.maxWindSpeed;

    return {
      type: 'surf',
      destination,
      swellHeight: Math.round(swellHeightFt * 10) / 10,
      swellPeriod: Math.round(swellPeriod),
      swellDirection: degreesToDirection(waveDirection),
      windSpeed: Math.round(windSpeedMph),
      windDirection: degreesToDirection(windDirection),
      isFiring,
      waterTemp: 70, // Would need separate sea temperature API
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error fetching surf for ${destination}:`, error);
    return null;
  }
}

/**
 * Fetch sun/weather conditions using Open-Meteo API
 */
export async function fetchSunConditions(destination: EscapeDestination): Promise<SunCondition | null> {
  const config = DESTINATIONS[destination];
  if (!config || config.conditionType !== 'sun') return null;

  // Check if in season
  const now = new Date();
  const month = now.getMonth() + 1;
  const inSeason = isInSeason(config.seasonStart, config.seasonEnd, month);
  if (!inSeason) return null;

  try {
    const params = new URLSearchParams({
      latitude: config.latitude.toString(),
      longitude: config.longitude.toString(),
      daily: 'temperature_2m_max,uv_index_max,cloudcover_mean,weathercode',
      hourly: 'temperature_2m,relativehumidity_2m,uv_index',
      timezone: config.timezone,
      forecast_days: '5',
    });

    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) {
      console.error(`Open-Meteo error for ${destination}:`, response.status);
      return null;
    }

    const data = await response.json();

    // Current conditions
    const currentTempC = data.hourly?.temperature_2m?.[0] || 0;
    const currentTempF = (currentTempC * 9) / 5 + 32;
    const uvIndex = data.hourly?.uv_index?.[0] || data.daily?.uv_index_max?.[0] || 0;
    const humidity = data.hourly?.relativehumidity_2m?.[0] || 50;

    // Check forecast for perfect weekend
    const dailyTemps: number[] = data.daily?.temperature_2m_max || [];
    const dailyClouds: number[] = data.daily?.cloudcover_mean || [];
    const dailyWeather: number[] = data.daily?.weathercode || [];

    // Count good days (next 5 days)
    let goodDays = 0;
    for (let i = 0; i < Math.min(5, dailyTemps.length); i++) {
      const tempF = (dailyTemps[i] * 9) / 5 + 32;
      const clouds = dailyClouds[i] || 0;
      const weather = dailyWeather[i] || 0;

      // Good day: warm, low clouds, no rain (codes 0-3)
      if (tempF >= SUN_PERFECT_THRESHOLDS.minTemp && clouds <= SUN_PERFECT_THRESHOLDS.maxCloudCover && weather <= 3) {
        goodDays++;
      }
    }

    const weatherCode = dailyWeather[0] || 0;
    const conditions = getWeatherDescription(weatherCode);

    const isPerfectWeekend =
      currentTempF >= SUN_PERFECT_THRESHOLDS.minTemp &&
      uvIndex >= SUN_PERFECT_THRESHOLDS.minUvIndex &&
      goodDays >= SUN_PERFECT_THRESHOLDS.minForecastDays;

    return {
      type: 'sun',
      destination,
      temperature: Math.round(currentTempF),
      temperatureCelsius: Math.round(currentTempC),
      uvIndex: Math.round(uvIndex),
      humidity: Math.round(humidity),
      conditions,
      isPerfectWeekend,
      forecastDays: goodDays,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error fetching sun for ${destination}:`, error);
    return null;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if current month is within season
 */
function isInSeason(start: number, end: number, current: number): boolean {
  if (start <= end) {
    // Normal range (e.g., May-October)
    return current >= start && current <= end;
  } else {
    // Wraps around year (e.g., November-April)
    return current >= start || current <= end;
  }
}

/**
 * Convert degrees to compass direction
 */
function degreesToDirection(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Convert weather code to description
 */
function getWeatherDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: 'Clear',
    1: 'Mainly Clear',
    2: 'Partly Cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing Rime Fog',
    51: 'Light Drizzle',
    53: 'Moderate Drizzle',
    55: 'Dense Drizzle',
    61: 'Slight Rain',
    63: 'Moderate Rain',
    65: 'Heavy Rain',
    71: 'Light Snow',
    73: 'Moderate Snow',
    75: 'Heavy Snow',
    77: 'Snow Grains',
    80: 'Slight Rain Showers',
    81: 'Moderate Rain Showers',
    82: 'Violent Rain Showers',
    85: 'Light Snow Showers',
    86: 'Heavy Snow Showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with Hail',
    99: 'Thunderstorm with Heavy Hail',
  };
  return descriptions[code] || 'Unknown';
}

// =============================================================================
// GEMINI STORY GENERATION
// =============================================================================

/**
 * Generate an escape story using Gemini
 * Tone: "Urgent Leisure" - "Pack your bags."
 */
export async function generateEscapeStory(
  condition: EscapeCondition,
  originCity: FeederCity
): Promise<EscapeStory | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: AI_MODELS.GEMINI_FLASH });

  const config = ESCAPE_ROUTES[originCity];
  const destConfig = DESTINATIONS[condition.destination];
  const cityName = originCity.replace(/_/g, ' ');
  const destName = destConfig.name;

  // Build condition-specific context
  let conditionContext = '';
  let headlineHint = '';
  let urgencyLevel: 'high' | 'medium' | 'low' = 'medium';

  switch (condition.type) {
    case 'snow': {
      const snow = condition as SnowCondition;
      conditionContext = `${destName} received ${snow.snowfall24h} inches of fresh snow in the last 24 hours. ${snow.isPowderDay ? 'This is a POWDER DAY.' : ''} Current conditions: ${snow.conditions}, ${snow.temperature}°F.`;
      headlineHint = `Powder Alert: ${destName} gets ${snow.snowfall24h}" overnight.`;
      urgencyLevel = snow.isPowderDay ? 'high' : 'medium';
      break;
    }
    case 'surf': {
      const surf = condition as SurfCondition;
      conditionContext = `${destName} is showing ${surf.swellHeight}ft swell at ${surf.swellPeriod} seconds from the ${surf.swellDirection}. Wind: ${surf.windSpeed}mph ${surf.windDirection}. ${surf.isFiring ? 'Conditions are FIRING.' : 'Good conditions.'}`;
      headlineHint = `Swell Watch: ${destName} is firing this weekend.`;
      urgencyLevel = surf.isFiring ? 'high' : 'medium';
      break;
    }
    case 'sun': {
      const sun = condition as SunCondition;
      conditionContext = `${destName} forecast: ${sun.temperature}°F (${sun.temperatureCelsius}°C), ${sun.conditions}, UV Index ${sun.uvIndex}. ${sun.forecastDays} days of perfect weather ahead. ${sun.isPerfectWeekend ? 'PERFECT WEEKEND CONDITIONS.' : ''}`;
      headlineHint = `Escape Plan: Perfect forecast for ${destName} this weekend.`;
      urgencyLevel = sun.isPerfectWeekend ? 'high' : 'low';
      break;
    }
  }

  const prompt = `${insiderPersona(cityName, 'Lifestyle Editor')}
Data: ${JSON.stringify(condition)}
Destination: ${destName}

Context:
- Users in ${cityName} are looking for an excuse to leave this weekend.
- ${conditionContext}
- Tone: 'Urgent Leisure'. Think: "Pack your bags." Not salesy, but knowing.

Task: Write a blurb for the Escape Index.

Format your response as JSON:
{
  "headline": "${headlineHint}",
  "body": "[30-35 word blurb that creates FOMO and urgency. Mention specific conditions (inches of snow, swell height, temperature). End with a short action phrase appropriate to the destination — e.g. 'Pack the car.' for driving-distance spots, 'Book the flight.' for far destinations.]",
  "previewText": "[12-15 word teaser for feed cards]",
  "link_candidates": [
    {"text": "exact text from body"}
  ]
}

Include 1-3 link candidates for key destinations mentioned in the body.

Headline Options by Type:
- Snow: "Powder Alert: [Destination] gets [Amount] overnight."
- Surf: "Swell Watch: [Destination] is firing this weekend."
- Sun: "Escape Plan: Perfect forecast for [Destination] this weekend."

Constraints:
- Must mention specific numbers (inches, feet, degrees)
- Tone is knowing, not breathless
- Create urgency without being salesy
- Reference the weekend or "this week"`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Gemini response for escape story');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Extract and validate link candidates
    const linkCandidates: LinkCandidate[] = validateLinkCandidates(parsed.link_candidates);

    // Get body and inject hyperlinks
    let body = parsed.body || `Perfect conditions in ${destName}. Pack your bags.`;
    if (linkCandidates.length > 0) {
      // Use origin city for context
      body = injectHyperlinks(body, linkCandidates, { name: cityName, city: cityName });
    }

    // Determine category label
    const categoryLabels: Record<ConditionType, string> = {
      snow: 'Powder Alert',
      surf: 'Swell Watch',
      sun: 'Escape Index',
    };

    return {
      originCity,
      destination: condition.destination,
      conditionType: condition.type,
      condition,
      headline: parsed.headline || headlineHint,
      body,
      previewText: parsed.previewText || `${destName} is calling`,
      targetNeighborhoods: config.neighborhoodIds,
      categoryLabel: categoryLabels[condition.type],
      urgencyLevel,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error generating escape story:', error);
    return null;
  }
}

// =============================================================================
// MAIN PROCESSING PIPELINE
// =============================================================================

/**
 * Process all escape conditions across all feeder cities
 */
export async function processEscapeIndex(): Promise<EscapeProcessResult> {
  const result: EscapeProcessResult = {
    conditionsChecked: 0,
    alertsTriggered: 0,
    storiesGenerated: 0,
    byConditionType: { snow: 0, surf: 0, sun: 0 },
    byOriginCity: {},
    stories: [],
    errors: [],
  };

  // Track which destinations we've already checked
  const checkedDestinations = new Set<EscapeDestination>();
  const conditionCache = new Map<EscapeDestination, EscapeCondition | null>();

  // Process each feeder city
  for (const [cityName, config] of Object.entries(ESCAPE_ROUTES)) {
    const city = cityName as FeederCity;

    for (const destination of config.targets) {
      result.conditionsChecked++;

      try {
        // Check cache first
        let condition = conditionCache.get(destination);

        if (!checkedDestinations.has(destination)) {
          checkedDestinations.add(destination);

          const destConfig = DESTINATIONS[destination];
          if (!destConfig) continue;

          // Fetch condition based on type
          switch (destConfig.conditionType) {
            case 'snow':
              condition = await fetchSnowConditions(destination);
              break;
            case 'surf':
              condition = await fetchSurfConditions(destination);
              break;
            case 'sun':
              condition = await fetchSunConditions(destination);
              break;
          }

          conditionCache.set(destination, condition);

          // Rate limit API calls
          await new Promise((resolve) => setTimeout(resolve, 300));
        } else {
          condition = conditionCache.get(destination);
        }

        if (!condition) continue;

        // Check if conditions meet thresholds
        let shouldAlert = false;
        switch (condition.type) {
          case 'snow':
            shouldAlert = (condition as SnowCondition).isPowderDay || (condition as SnowCondition).snowfall24h >= 4;
            break;
          case 'surf':
            shouldAlert = (condition as SurfCondition).isFiring || (condition as SurfCondition).swellHeight >= 3;
            break;
          case 'sun':
            shouldAlert = (condition as SunCondition).isPerfectWeekend;
            break;
        }

        if (shouldAlert) {
          result.alertsTriggered++;
          result.byConditionType[condition.type]++;

          // Generate story for this city
          const story = await generateEscapeStory(condition, city);
          if (story) {
            result.stories.push(story);
            result.storiesGenerated++;
            result.byOriginCity[city] = (result.byOriginCity[city] || 0) + 1;
          }

          // Rate limit Gemini calls
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        result.errors.push(`${city}/${destination}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return result;
}

// =============================================================================
// SAMPLE DATA FOR TESTING
// =============================================================================

/**
 * Create sample escape conditions for testing
 */
export function createSampleEscapeConditions(): EscapeCondition[] {
  return [
    {
      type: 'snow',
      destination: 'Aspen',
      snowfall24h: 12,
      snowfallCm: 30.5,
      baseDepth: 48,
      newSnow: true,
      isPowderDay: true,
      temperature: 22,
      conditions: 'Heavy Snow',
      timestamp: new Date().toISOString(),
    },
    {
      type: 'surf',
      destination: 'Byron_Bay',
      swellHeight: 6.2,
      swellPeriod: 14,
      swellDirection: 'SE',
      windSpeed: 8,
      windDirection: 'W',
      isFiring: true,
      waterTemp: 72,
      timestamp: new Date().toISOString(),
    },
    {
      type: 'sun',
      destination: 'St_Barts',
      temperature: 84,
      temperatureCelsius: 29,
      uvIndex: 9,
      humidity: 65,
      conditions: 'Clear',
      isPerfectWeekend: true,
      forecastDays: 5,
      timestamp: new Date().toISOString(),
    },
  ];
}
