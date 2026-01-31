/**
 * Utility functions for neighborhood ID mapping
 */

// Map URL city slugs to neighborhood ID prefixes
export const CITY_PREFIX_MAP: Record<string, string> = {
  // North America
  'new-york': 'nyc',
  'san-francisco': 'sf',
  'los-angeles': 'la',
  'washington-dc': 'dc',
  'chicago': 'chicago',
  'miami': 'miami',
  'toronto': 'toronto',
  // Europe
  'london': 'london',
  'paris': 'paris',
  'berlin': 'berlin',
  'amsterdam': 'amsterdam',
  'barcelona': 'barcelona',
  'milan': 'milan',
  'lisbon': 'lisbon',
  'copenhagen': 'copenhagen',
  'stockholm': 'stockholm',
  // Asia-Pacific
  'tokyo': 'tokyo',
  'hong-kong': 'hk',
  'singapore': 'singapore',
  'sydney': 'sydney',
  'melbourne': 'melbourne',
  // Middle East
  'dubai': 'dubai',
  'tel-aviv': 'telaviv',
};

/**
 * Build neighborhood ID from URL params
 * @param city - URL city slug (e.g., 'new-york', 'los-angeles')
 * @param neighborhood - URL neighborhood slug (e.g., 'west-village', 'beverly-hills')
 * @returns Neighborhood ID (e.g., 'nyc-west-village', 'la-beverly-hills')
 */
export function buildNeighborhoodId(city: string, neighborhood: string): string {
  const prefix = CITY_PREFIX_MAP[city] || city;
  return `${prefix}-${neighborhood}`;
}

/**
 * Format neighborhood name from URL slug
 * @param slug - URL slug (e.g., 'west-village')
 * @returns Formatted name (e.g., 'West Village')
 */
export function formatNeighborhoodName(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format city name from URL slug
 * @param slug - URL slug (e.g., 'new-york')
 * @returns Formatted name (e.g., 'New York')
 */
export function formatCityName(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
