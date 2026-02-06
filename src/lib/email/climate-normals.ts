/**
 * Monthly Climate Normals (Average High Temperature in Celsius)
 *
 * Used for Priority 4 anomaly detection: compare forecast high
 * against the historical average to flag unseasonably warm/cold days.
 *
 * Keyed by city name matching SUPPORTED_CITIES in city-mapping.ts.
 * Months indexed 0–11 (Jan–Dec).
 * Source: weatherspark.com / climate-data.org historical averages.
 */

export interface ClimateNormal {
  city: string;
  /** Average high temperature per month [Jan..Dec] in Celsius */
  monthlyHighC: [number, number, number, number, number, number,
                  number, number, number, number, number, number];
}

export const CLIMATE_NORMALS: ClimateNormal[] = [
  // ── North America — East Coast ──
  { city: 'New York',       monthlyHighC: [4, 5, 10, 18, 23, 28, 31, 30, 26, 19, 13, 6] },
  { city: 'Washington DC',  monthlyHighC: [6, 8, 13, 20, 25, 30, 33, 32, 28, 21, 14, 8] },
  { city: 'Miami',          monthlyHighC: [25, 26, 27, 29, 31, 32, 33, 33, 32, 30, 28, 26] },
  { city: 'Palm Beach',     monthlyHighC: [25, 26, 27, 29, 31, 32, 33, 33, 32, 30, 28, 26] },
  { city: 'Greenwich',      monthlyHighC: [3, 5, 10, 17, 22, 27, 30, 29, 25, 18, 12, 6] },

  // ── North America — Central & West ──
  { city: 'Chicago',        monthlyHighC: [-1, 1, 8, 15, 21, 27, 29, 28, 25, 17, 9, 2] },
  { city: 'Aspen',          monthlyHighC: [-2, 0, 5, 10, 17, 23, 27, 26, 21, 14, 5, -1] },
  { city: 'Los Angeles',    monthlyHighC: [20, 20, 21, 22, 23, 25, 28, 29, 28, 26, 22, 20] },
  { city: 'San Francisco',  monthlyHighC: [14, 16, 17, 18, 19, 21, 22, 22, 23, 21, 17, 14] },

  // ── North America — Vacation ──
  { city: 'The Hamptons',       monthlyHighC: [4, 5, 9, 15, 20, 25, 28, 28, 24, 18, 12, 6] },
  { city: 'Nantucket',          monthlyHighC: [3, 4, 7, 12, 17, 22, 26, 26, 22, 16, 11, 6] },
  { city: "Martha's Vineyard",  monthlyHighC: [4, 4, 8, 13, 18, 23, 27, 27, 23, 17, 12, 6] },

  // ── Canada ──
  { city: 'Vancouver',  monthlyHighC: [6, 8, 10, 13, 17, 20, 23, 23, 19, 14, 9, 6] },
  { city: 'Toronto',    monthlyHighC: [-1, 0, 5, 12, 19, 25, 28, 27, 22, 15, 8, 2] },

  // ── UK & Ireland ──
  { city: 'London',  monthlyHighC: [8, 9, 12, 15, 18, 22, 25, 24, 21, 16, 11, 8] },
  { city: 'Dublin',  monthlyHighC: [8, 8, 10, 12, 15, 18, 20, 19, 17, 14, 10, 8] },

  // ── Continental Europe ──
  { city: 'Paris',        monthlyHighC: [7, 8, 13, 16, 20, 24, 26, 26, 22, 16, 11, 7] },
  { city: 'Stockholm',    monthlyHighC: [-1, 0, 4, 10, 16, 21, 23, 22, 17, 10, 5, 1] },
  { city: 'Saint-Tropez', monthlyHighC: [11, 12, 14, 17, 21, 25, 29, 28, 25, 20, 15, 12] },
  { city: 'Marbella',     monthlyHighC: [16, 17, 19, 20, 23, 27, 30, 30, 28, 23, 19, 17] },
  { city: 'Sylt',         monthlyHighC: [3, 3, 6, 10, 15, 18, 20, 20, 18, 13, 8, 5] },

  // ── Caribbean ──
  { city: 'St. Barts',  monthlyHighC: [28, 28, 29, 29, 30, 31, 31, 31, 31, 31, 30, 29] },

  // ── Asia ──
  { city: 'Tokyo',      monthlyHighC: [10, 11, 14, 19, 24, 26, 30, 31, 28, 22, 17, 12] },
  { city: 'Hong Kong',  monthlyHighC: [19, 19, 22, 26, 29, 31, 32, 32, 31, 28, 25, 20] },
  { city: 'Singapore',  monthlyHighC: [30, 31, 32, 32, 32, 32, 31, 31, 31, 31, 31, 30] },

  // ── Oceania (Southern Hemisphere — reversed seasons) ──
  { city: 'Sydney',      monthlyHighC: [27, 27, 25, 23, 20, 17, 17, 18, 20, 22, 24, 26] },
  { city: 'Auckland',    monthlyHighC: [24, 24, 23, 20, 17, 15, 14, 15, 16, 18, 20, 22] },
  { city: 'Queenstown',  monthlyHighC: [22, 22, 19, 15, 11, 8, 7, 9, 12, 15, 18, 20] },

  // ── Africa (Southern Hemisphere) ──
  { city: 'Cape Town',  monthlyHighC: [27, 28, 26, 23, 20, 18, 17, 18, 19, 21, 24, 26] },
];

/**
 * Lookup the average high temperature for a city and month.
 * Returns null if the city is not found (Priority 4 gracefully skips).
 *
 * @param cityName City name matching SUPPORTED_CITIES
 * @param month 0-indexed month (0 = January, 11 = December)
 */
export function getClimateNormal(cityName: string, month: number): number | null {
  const normalized = cityName.toLowerCase().trim();
  const entry = CLIMATE_NORMALS.find(c => c.city.toLowerCase() === normalized);
  if (!entry) return null;
  if (month < 0 || month > 11) return null;
  return entry.monthlyHighC[month];
}
