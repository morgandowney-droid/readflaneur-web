/**
 * Weather data fetching for Daily Brief emails
 * Uses Open-Meteo free API (no key required)
 */

import { WeatherData } from './types';

const OPEN_METEO_API = 'https://api.open-meteo.com/v1/forecast';

// Countries that use Fahrenheit
const FAHRENHEIT_COUNTRIES = new Set([
  'USA', 'US', 'United States',
  'Liberia',
  'Myanmar', 'Burma',
]);

/**
 * Fetch current weather for a location
 */
export async function fetchWeather(
  lat: number,
  lng: number,
  timezone: string,
  country: string = 'USA'
): Promise<WeatherData | null> {
  try {
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      current: 'temperature_2m,weather_code',
      timezone,
    });

    const response = await fetch(`${OPEN_METEO_API}?${params}`);

    if (!response.ok) {
      console.error(`Open-Meteo error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const current = data.current;

    if (!current) return null;

    const tempC = Math.round(current.temperature_2m || 0);
    const weatherCode = current.weather_code || 0;

    // Format local time for "as of" display
    let asOfTime = '';
    try {
      asOfTime = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone,
      }).format(new Date());
    } catch {
      asOfTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    return {
      temperatureC: tempC,
      temperatureF: Math.round(tempC * 9 / 5 + 32),
      description: getWeatherDescription(weatherCode),
      weatherCode,
      asOfTime,
      useFahrenheit: FAHRENHEIT_COUNTRIES.has(country),
    };
  } catch (error) {
    console.error('Weather fetch error:', error);
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
