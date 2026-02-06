/**
 * WeatherStoryService
 *
 * Transforms Open-Meteo forecast data into editorial weather stories
 * for the Daily Brief email.
 *
 * Priority hierarchy:
 *   1. Safety & Extremes (blizzard, extreme heat)
 *   2. Commute & Lunch Check (weekdays only, hourly rain probability)
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
  now: Date
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
      return {
        priority: 1,
        headline: `Alert: Heavy Snow Expected ${dayLabel}.`,
        body: `${Math.round(snowfall)}cm of snow forecast. Consider adjusting plans and checking transit updates.`,
        icon: 'snow',
        temperatureC: currentTemp,
        temperatureF: celsiusToFahrenheit(currentTemp),
        forecastDay: dayLabel,
      };
    }

    // Extreme heat: >35°C
    if (maxTemp > 35) {
      return {
        priority: 1,
        headline: `Heat Advisory: ${Math.round(maxTemp)}°C Expected ${dayLabel}.`,
        body: `Temperatures reaching ${Math.round(maxTemp)}°C. Stay hydrated and avoid prolonged outdoor exposure midday.`,
        icon: 'thermometer-up',
        temperatureC: currentTemp,
        temperatureF: celsiusToFahrenheit(currentTemp),
        forecastDay: dayLabel,
      };
    }
  }

  return null;
}

// ─── Priority 2: Commute & Lunch Check (weekdays only) ───

function checkCommuteAlerts(
  forecast: ForecastData,
  timezone: string,
  now: Date
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

  // Morning commute: 8–10am, >60%
  const morningAvg = averageForRange(tomorrowHours, 8, 10);
  if (morningAvg > 60) {
    return {
      priority: 2,
      headline: `Morning Commute Alert: Rain Likely ${dayLabel}.`,
      body: `${Math.round(morningAvg)}% chance of rain between 8–10 AM. Bring an umbrella.`,
      icon: 'rain',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: dayLabel,
    };
  }

  // Lunch: 12–2pm, >50%
  const lunchAvg = averageForRange(tomorrowHours, 12, 14);
  if (lunchAvg > 50) {
    return {
      priority: 2,
      headline: `Lunch Forecast: Order In ${dayLabel}.`,
      body: `${Math.round(lunchAvg)}% chance of rain over the lunch hour. Save yourself the umbrella battle.`,
      icon: 'rain',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: dayLabel,
    };
  }

  // Evening commute: 5–7pm, >60%
  const eveningAvg = averageForRange(tomorrowHours, 17, 19);
  if (eveningAvg > 60) {
    return {
      priority: 2,
      headline: `Evening Commute Alert: Rain Expected ${dayLabel}.`,
      body: `${Math.round(eveningAvg)}% precipitation chance between 5–7 PM. Plan accordingly.`,
      icon: 'rain',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: dayLabel,
    };
  }

  return null;
}

// ─── Priority 3: Weekend Lookahead (Thu/Fri only) ───

function checkWeekendLookahead(
  forecast: ForecastData,
  timezone: string,
  now: Date,
  cityName: string
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
    let body = `Rain expected ${satLabel} with ${Math.round(satPrecip)}mm of precipitation.`;
    if (sunIndex > 0 && sunIndex < daily.time.length) {
      const sunPrecip = daily.precipitation_sum[sunIndex] ?? 0;
      if (sunPrecip > 5) {
        const sunDate = new Date(daily.time[sunIndex] + 'T12:00:00');
        const sunLabel = formatForecastDay(sunDate, now, timezone);
        body = `Wet weekend ahead: rain both days, ${Math.round(satPrecip)}mm ${satLabel} and ${Math.round(sunPrecip)}mm ${sunLabel}.`;
      }
    }
    return {
      priority: 3,
      headline: 'Weekend Alert: Plan Indoor Activities.',
      body,
      icon: 'rain',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: satLabel,
    };
  }

  // Good weekend: warmer than normal + dry
  if (normal !== null && satMax > normal + 2 && satPrecip < 1) {
    return {
      priority: 3,
      headline: 'Weekend Outlook: Perfect Conditions.',
      body: `${satLabel} looking ideal: ${Math.round(satMax)}°C and dry. Warmer than usual for this time of year.`,
      icon: 'sun',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: satLabel,
    };
  }

  return null;
}

// ─── Priority 4: General Anomaly ───

function checkAnomaly(
  forecast: ForecastData,
  timezone: string,
  now: Date,
  cityName: string
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

  if (delta > 5) {
    return {
      priority: 4,
      headline: `Unseasonably Warm: ${Math.round(tomorrowMax)}°C ${dayLabel}.`,
      body: `${Math.round(delta)}°C above the seasonal average. Enjoy it while it lasts.`,
      icon: 'thermometer-up',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: dayLabel,
    };
  }

  if (delta < -5) {
    return {
      priority: 4,
      headline: `Sharp Drop: ${Math.round(tomorrowMax)}°C ${dayLabel}.`,
      body: `${Math.round(Math.abs(delta))}°C below the seasonal average. Dress accordingly.`,
      icon: 'thermometer-down',
      temperatureC: currentTemp,
      temperatureF: celsiusToFahrenheit(currentTemp),
      forecastDay: dayLabel,
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
  cityName: string
): Promise<WeatherStory | null> {
  const forecast = await fetchForecastWeather(lat, lng, timezone);
  if (!forecast) return null;

  const now = new Date();

  // Priority 1: Safety & Extremes
  const safety = checkSafetyExtremes(forecast, timezone, now);
  if (safety) return safety;

  // Priority 2: Commute & Lunch (weekdays only)
  const commute = checkCommuteAlerts(forecast, timezone, now);
  if (commute) return commute;

  // Priority 3: Weekend Lookahead (Thu/Fri only)
  const weekend = checkWeekendLookahead(forecast, timezone, now, cityName);
  if (weekend) return weekend;

  // Priority 4: General Anomaly
  const anomaly = checkAnomaly(forecast, timezone, now, cityName);
  if (anomaly) return anomaly;

  return null;
}
