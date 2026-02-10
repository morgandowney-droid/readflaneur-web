/**
 * Server-side weather fetch from Open-Meteo API.
 * Cached for 10 minutes via Next.js fetch cache.
 */
export interface InitialWeather {
  tempC: number;
  weatherCode: number;
}

export async function fetchCurrentWeather(
  lat: number,
  lon: number,
  tz: string
): Promise<InitialWeather | null> {
  try {
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lon.toString(),
      current: 'temperature_2m,weather_code',
      timezone: tz,
    });
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      { next: { revalidate: 600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.current) return null;
    return {
      tempC: Math.round(data.current.temperature_2m),
      weatherCode: data.current.weather_code,
    };
  } catch {
    return null;
  }
}
