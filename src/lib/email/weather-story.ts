/**
 * WeatherStoryService
 *
 * Transforms Open-Meteo forecast data into editorial weather stories
 * for the Daily Brief email.
 *
 * Priority hierarchy:
 *   1. Safety & Extremes (blizzard, extreme heat)
 *   2. Travel & Lunch Check (weekdays only, hourly rain probability)
 *   3. Weekend Lookahead (Thursday/Friday emails only)
 *   4. General Anomaly (forecast vs climate normals)
 *
 * Returns the highest-priority story that triggers, or null.
 * When null, the template falls back to the existing WeatherWidget.
 */

import { WeatherStory } from './types';
import { getClimateNormal } from './climate-normals';
import {
  formatForecastDay,
  isThursdayOrFriday,
  isTomorrowWeekday,
  getLocalDayOfWeek,
} from './date-utils';

const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';

// Countries that use Fahrenheit
const FAHRENHEIT_COUNTRIES = new Set([
  'USA', 'US', 'United States',
  'Liberia',
  'Myanmar', 'Burma',
]);

/** Returns true if the country uses Fahrenheit */
function shouldUseFahrenheit(country: string): boolean {
  return FAHRENHEIT_COUNTRIES.has(country);
}

/** Format a temperature with the appropriate unit */
function formatTemp(tempC: number, useF: boolean): string {
  if (useF) {
    return `${Math.round(tempC * 9 / 5 + 32)}°F`;
  }
  return `${Math.round(tempC)}°C`;
}

// ─── Raw Open-Meteo response shape ───

interface ForecastData {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    snowfall_sum: number[];
  };
  hourly: {
    time: string[];
    precipitation_probability: number[];
  };
  current?: {
    temperature_2m: number;
  };
}

// ─── Fetch ───

async function fetchForecastWeather(
  lat: number,
  lng: number,
  timezone: string
): Promise<ForecastData | null> {
  try {
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum',
      hourly: 'precipitation_probability',
      current: 'temperature_2m',
      timezone,
      forecast_days: '3',
    });

    const response = await fetch(`${OPEN_METEO_API}?${params}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// ─── Utility ───

function celsiusToFahrenheit(c: number): number {
  return Math.round(c * 9 / 5 + 32);
}

/** Average precipitation probability across a range of hours */
function averageForRange(
  hourlyData: Record<number, number>,
  startHour: number,
  endHour: number
): number {
  let sum = 0;
  let count = 0;
  for (let h = startHour; h <= endHour; h++) {
    if (hourlyData[h] !== undefined) {
      sum += hourlyData[h];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

// ─── Priority 1: Safety & Extremes ───

function checkSafetyExtremes(
  forecast: ForecastData,
  timezone: string,
  now: Date,
  useF: boolean
): WeatherStory | null {
  const { daily } = forecast;
  const currentTemp = Math.round(forecast.current?.temperature_2m ?? 0);

  // Check tomorrow first (index 1), then today (index 0)
  for (const dayIndex of [1, 0]) {
    if (dayIndex >= daily.time.length) continue;

    const snowfall = daily.snowfall_sum[dayIndex] ?? 0;
    const maxTemp = daily.temperature_2m_max[dayIndex] ?? 0;
    const targetDate = new Date(daily.time[dayIndex] + 'T12:00:00');
    const dayLabel = formatForecastDay(targetDate, now, timezone);

    // Blizzard: >10cm snow
    if (snowfall > 10) {
      const snowDisplay = useF ? `${Math.round(snowfall / 2.54)}"` : `${Math.round(snowfall)}cm`;
      return {
        priority: 1,
        headline: `Heavy Snow ${dayLabel}: ${snowDisplay} forecast. Check transit updates.`,
        body: '',
        icon: 'snow',
        temperatureC: currentTemp,
        temperatureF: celsiusToFahrenheit(currentTemp),
        forecastDay: dayLabel,
        useFahrenheit: useF,
      };
    }

    // Extreme heat: >35°C
    if (maxTemp > 35) {
      return {
        priority: 1,
        headline: `Heat Advisory ${dayLabel}: ${formatTemp(maxTemp, useF)}. Stay hydrated.`,
        body: '',
        icon: 'thermometer-up',
        temperatureC: currentTemp,
        temperatureF: celsiusToFahrenheit(currentTemp),
        forecastDay: dayLabel,
        useFahrenheit: useF,
      };
    }
  }

  return null;
}

// ─── Priority 2: Travel & Lunch Check (weekdays only) ───

function checkCommuteAlerts(
  forecast: ForecastData,
  timezone: string,
  now: Date,
  useF: boolean
): WeatherStory | null {
  if (!isTomorrowWeekday(now, timezone)) return null;
  if (forecast.daily.time.length < 2) return null;

  const tomorrowStr = forecast.daily.time[1]; // YYYY-MM-DD
  const hourlyTimes = forecast.hourly.time;
  const hourlyProbs = forecast.hourly.precipitation_probability;

  // Build hour → probability map for tomorrow
  const tomorrowHours: Record<number, number> = {};
  for (let i = 0; i < hourlyTimes.length; i++) {
    if (hourlyTimes[i].startsWith(tomorrowStr)) {
      const hour = parseInt(hourlyTimes[i].substring(11, 13), 10);
      tomorrowHours[hour] = hourlyProbs[i];
    }
  }

  const targetDate = new Date(tomorrowStr + 'T12:00:00');
  const dayLabel = formatForecastDay(targetDate, now, timezone);
  const currentTemp = Math.round(forecast.current?.temperature_2m ?? 0);

  // Morning travel: 8–10am, >60%
  const morningAvg = averageForRange(tomorrowHours, 8, 10);
  if (morningAvg > 60) {
    return {
      priority: 2,
      headline: `Rain ${dayLabel} 8-10 AM (${Math.round(morningAvg)}%). Bring an umbrella.`,
      body: '',
      icon: 'rain',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: dayLabel,
      useFahrenheit: useF,
    };
  }

  // Lunch: 12–2pm, >50%
  const lunchAvg = averageForRange(tomorrowHours, 12, 14);
  if (lunchAvg > 50) {
    return {
      priority: 2,
      headline: `Rain ${dayLabel} over lunch (${Math.round(lunchAvg)}%). Order in.`,
      body: '',
      icon: 'rain',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: dayLabel,
      useFahrenheit: useF,
    };
  }

  // Evening travel: 5–7pm, >60%
  const eveningAvg = averageForRange(tomorrowHours, 17, 19);
  if (eveningAvg > 60) {
    return {
      priority: 2,
      headline: `Rain ${dayLabel} 5-7 PM (${Math.round(eveningAvg)}%). Plan accordingly.`,
      body: '',
      icon: 'rain',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: dayLabel,
      useFahrenheit: useF,
    };
  }

  return null;
}

// ─── Priority 3: Weekend Lookahead (Thu/Fri only) ───

function checkWeekendLookahead(
  forecast: ForecastData,
  timezone: string,
  now: Date,
  cityName: string,
  useF: boolean
): WeatherStory | null {
  if (!isThursdayOrFriday(now, timezone)) return null;

  const { daily } = forecast;
  const currentTemp = Math.round(forecast.current?.temperature_2m ?? 0);
  const dow = getLocalDayOfWeek(now, timezone);

  // With 3-day forecast:
  //   Thursday → [Thu, Fri, Sat] — Saturday is index 2
  //   Friday   → [Fri, Sat, Sun] — Saturday is index 1, Sunday is index 2
  const satIndex = dow === 4 ? 2 : 1;
  const sunIndex = dow === 5 ? 2 : -1;

  if (satIndex >= daily.time.length) return null;

  const satMax = daily.temperature_2m_max[satIndex] ?? 0;
  const satPrecip = daily.precipitation_sum[satIndex] ?? 0;
  const satDate = new Date(daily.time[satIndex] + 'T12:00:00');
  const satLabel = formatForecastDay(satDate, now, timezone);

  const month = new Date(daily.time[0]).getMonth();
  const normal = getClimateNormal(cityName, month);

  // Bad weekend: >5mm precipitation
  if (satPrecip > 5) {
    let headlineText = `Rain ${satLabel}. Plan indoor activities.`;
    if (sunIndex > 0 && sunIndex < daily.time.length) {
      const sunPrecip = daily.precipitation_sum[sunIndex] ?? 0;
      if (sunPrecip > 5) {
        headlineText = `Wet weekend ahead. Rain both days.`;
      }
    }
    return {
      priority: 3,
      headline: headlineText,
      body: '',
      icon: 'rain',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: satLabel,
      useFahrenheit: useF,
    };
  }

  // Good weekend: warmer than normal + dry
  if (normal !== null && satMax > normal + 2 && satPrecip < 1) {
    return {
      priority: 3,
      headline: `${satLabel}: ${formatTemp(satMax, useF)} and dry. Warmer than usual.`,
      body: '',
      icon: 'sun',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: satLabel,
      useFahrenheit: useF,
    };
  }

  return null;
}

// ─── Priority 4: General Anomaly ───

function checkAnomaly(
  forecast: ForecastData,
  timezone: string,
  now: Date,
  cityName: string,
  useF: boolean
): WeatherStory | null {
  const { daily } = forecast;
  if (daily.time.length < 2) return null;

  const tomorrowMax = daily.temperature_2m_max[1] ?? 0;
  const month = new Date(daily.time[1]).getMonth();
  const normal = getClimateNormal(cityName, month);

  if (normal === null) return null;

  const delta = tomorrowMax - normal;
  const targetDate = new Date(daily.time[1] + 'T12:00:00');
  const dayLabel = formatForecastDay(targetDate, now, timezone);
  const currentTemp = Math.round(forecast.current?.temperature_2m ?? 0);

  // Format the delta for display
  const deltaDisplay = useF
    ? `${Math.round(Math.abs(delta) * 9 / 5)}°F`
    : `${Math.round(Math.abs(delta))}°C`;

  if (delta > 5) {
    return {
      priority: 4,
      headline: `Unseasonably Warm ${dayLabel}: ${formatTemp(tomorrowMax, useF)}, ${deltaDisplay} above average.`,
      body: '',
      icon: 'thermometer-up',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: dayLabel,
      useFahrenheit: useF,
    };
  }

  if (delta < -5) {
    return {
      priority: 4,
      headline: `Sharp Drop ${dayLabel}: ${formatTemp(tomorrowMax, useF)}, ${deltaDisplay} below average.`,
      body: '',
      icon: 'thermometer-down',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: dayLabel,
      useFahrenheit: useF,
    };
  }

  return null;
}

// ─── Main Entry Point ───

/**
 * Generate an editorial weather story for a neighborhood.
 * Returns the highest-priority story that triggers, or null.
 *
 * When null, the email template falls back to the existing WeatherWidget.
 */
export async function generateWeatherStory(
  lat: number,
  lng: number,
  timezone: string,
  cityName: string,
  country: string = 'USA'
): Promise<WeatherStory | null> {
  const forecast = await fetchForecastWeather(lat, lng, timezone);
  if (!forecast) return null;

  const now = new Date();
  const useF = shouldUseFahrenheit(country);

  // Priority 1: Safety & Extremes
  const safety = checkSafetyExtremes(forecast, timezone, now, useF);
  if (safety) return safety;

  // Priority 2: Travel & Lunch (weekdays only)
  const commute = checkCommuteAlerts(forecast, timezone, now, useF);
  if (commute) return commute;

  // Priority 3: Weekend Lookahead (Thu/Fri only)
  const weekend = checkWeekendLookahead(forecast, timezone, now, cityName, useF);
  if (weekend) return weekend;

  // Priority 4: General Anomaly
  const anomaly = checkAnomaly(forecast, timezone, now, cityName, useF);
  if (anomaly) return anomaly;

  return null;
}
