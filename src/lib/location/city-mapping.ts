/**
 * City to Timezone Mapping
 *
 * Maps our supported 38 cities to their IANA timezones.
 * Used for location detection and timezone priority.
 */

export interface CityTimezoneInfo {
  city: string;
  country: string;
  timezone: string;
  /** Alternative city names that might be detected */
  aliases?: string[];
}

/**
 * All supported cities with their timezone information
 */
export const SUPPORTED_CITIES: CityTimezoneInfo[] = [
  // USA - East Coast
  { city: 'New York', country: 'USA', timezone: 'America/New_York', aliases: ['NYC', 'Manhattan', 'Brooklyn'] },
  { city: 'Washington DC', country: 'USA', timezone: 'America/New_York', aliases: ['Washington', 'DC'] },
  { city: 'Miami', country: 'USA', timezone: 'America/New_York' },
  { city: 'Palm Beach', country: 'USA', timezone: 'America/New_York', aliases: ['West Palm Beach'] },
  { city: 'Greenwich', country: 'USA', timezone: 'America/New_York' },

  // USA - Central
  { city: 'Chicago', country: 'USA', timezone: 'America/Chicago' },
  { city: 'Aspen', country: 'USA', timezone: 'America/Denver' },

  // USA - West Coast
  { city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles', aliases: ['LA', 'Beverly Hills', 'Santa Monica'] },
  { city: 'San Francisco', country: 'USA', timezone: 'America/Los_Angeles', aliases: ['SF'] },

  // USA - Vacation
  { city: 'The Hamptons', country: 'USA', timezone: 'America/New_York', aliases: ['Hamptons', 'East Hampton', 'Southampton'] },
  { city: 'Nantucket', country: 'USA', timezone: 'America/New_York' },
  { city: "Martha's Vineyard", country: 'USA', timezone: 'America/New_York', aliases: ['Marthas Vineyard'] },

  // UK & Ireland
  { city: 'London', country: 'UK', timezone: 'Europe/London' },
  { city: 'Dublin', country: 'Ireland', timezone: 'Europe/Dublin' },

  // Europe
  { city: 'Paris', country: 'France', timezone: 'Europe/Paris' },
  { city: 'Stockholm', country: 'Sweden', timezone: 'Europe/Stockholm' },
  { city: 'Saint-Tropez', country: 'France', timezone: 'Europe/Paris', aliases: ['St Tropez', 'St-Tropez'] },
  { city: 'Marbella', country: 'Spain', timezone: 'Europe/Madrid' },
  { city: 'Sylt', country: 'Germany', timezone: 'Europe/Berlin' },

  // Caribbean
  { city: 'St. Barts', country: 'France', timezone: 'America/St_Barthelemy', aliases: ['Saint Barthelemy', 'St Barts', 'Saint Barths'] },

  // Australia
  { city: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney' },

  // Asia
  { city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo' },
  { city: 'Hong Kong', country: 'China', timezone: 'Asia/Hong_Kong' },
  { city: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore' },

  // New Zealand
  { city: 'Auckland', country: 'New Zealand', timezone: 'Pacific/Auckland' },
  { city: 'Queenstown', country: 'New Zealand', timezone: 'Pacific/Auckland' },

  // Canada
  { city: 'Vancouver', country: 'Canada', timezone: 'America/Vancouver' },
  { city: 'Toronto', country: 'Canada', timezone: 'America/Toronto' },

  // South Africa
  { city: 'Cape Town', country: 'South Africa', timezone: 'Africa/Johannesburg' },
];

/**
 * Map from IANA timezone to possible cities
 * Used when we only have timezone info (browser detection fallback)
 */
export const TIMEZONE_TO_CITIES: Record<string, string[]> = {
  'America/New_York': ['New York', 'Miami', 'Washington DC', 'Palm Beach', 'Greenwich', 'The Hamptons', 'Nantucket', "Martha's Vineyard"],
  'America/Chicago': ['Chicago'],
  'America/Denver': ['Aspen'],
  'America/Los_Angeles': ['Los Angeles', 'San Francisco'],
  'America/Vancouver': ['Vancouver'],
  'America/Toronto': ['Toronto'],
  'Europe/London': ['London'],
  'Europe/Dublin': ['Dublin'],
  'Europe/Paris': ['Paris', 'Saint-Tropez'],
  'Europe/Stockholm': ['Stockholm'],
  'Europe/Madrid': ['Marbella'],
  'Europe/Berlin': ['Sylt'],
  'Australia/Sydney': ['Sydney'],
  'Asia/Tokyo': ['Tokyo'],
  'Asia/Hong_Kong': ['Hong Kong'],
  'Asia/Singapore': ['Singapore'],
  'Pacific/Auckland': ['Auckland', 'Queenstown'],
  'Africa/Johannesburg': ['Cape Town'],
  'America/St_Barthelemy': ['St. Barts'],
};

/**
 * Find a supported city by name (case-insensitive, includes aliases)
 */
export function findSupportedCity(cityName: string): CityTimezoneInfo | null {
  const normalizedInput = cityName.toLowerCase().trim();

  for (const city of SUPPORTED_CITIES) {
    // Check main city name
    if (city.city.toLowerCase() === normalizedInput) {
      return city;
    }

    // Check aliases
    if (city.aliases) {
      for (const alias of city.aliases) {
        if (alias.toLowerCase() === normalizedInput) {
          return city;
        }
      }
    }
  }

  return null;
}

/**
 * Get cities for a given timezone
 */
export function getCitiesForTimezone(timezone: string): string[] {
  return TIMEZONE_TO_CITIES[timezone] || [];
}

/**
 * Get timezone for a city
 */
export function getTimezoneForCity(city: string): string | null {
  const found = findSupportedCity(city);
  return found?.timezone || null;
}

/**
 * Get all city names (for dropdown/autocomplete)
 */
export function getAllCityNames(): string[] {
  return SUPPORTED_CITIES.map(c => c.city).sort();
}

/**
 * Get cities grouped by region for UI display
 */
export function getCitiesGroupedByRegion(): Record<string, CityTimezoneInfo[]> {
  return {
    'North America': SUPPORTED_CITIES.filter(c =>
      ['USA', 'Canada'].includes(c.country) && !['The Hamptons', 'Nantucket', "Martha's Vineyard", 'Aspen'].includes(c.city)
    ),
    'Europe': SUPPORTED_CITIES.filter(c =>
      ['UK', 'Ireland', 'France', 'Sweden', 'Spain', 'Germany'].includes(c.country) && c.city !== 'Saint-Tropez'
    ),
    'Asia Pacific': SUPPORTED_CITIES.filter(c =>
      ['Australia', 'Japan', 'China', 'Singapore', 'New Zealand'].includes(c.country)
    ),
    'Vacation': SUPPORTED_CITIES.filter(c =>
      ['The Hamptons', 'Nantucket', "Martha's Vineyard", 'Aspen', 'Saint-Tropez', 'Marbella', 'Sylt', 'St. Barts'].includes(c.city)
    ),
    'Other': SUPPORTED_CITIES.filter(c =>
      ['South Africa'].includes(c.country)
    ),
  };
}
