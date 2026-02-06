/**
 * Location Detection & Timezone Utilities
 *
 * Main exports for location detection, city mapping, and timezone resolution.
 */

// City mapping utilities
export {
  type CityTimezoneInfo,
  SUPPORTED_CITIES,
  TIMEZONE_TO_CITIES,
  findSupportedCity,
  getCitiesForTimezone,
  getTimezoneForCity,
  getAllCityNames,
  getCitiesGroupedByRegion,
} from './city-mapping';

// Location detection
export {
  type DetectedLocation,
  detectLocationFromIP,
  detectLocationFromTimezone,
  getBrowserTimezone,
} from './detect';

// Timezone resolution
export {
  type TimezoneResult,
  type StoredLocation,
  getStoredLocation,
  saveStoredLocation,
  dismissLocationPrompt,
  wasPromptDismissedRecently,
  clearStoredLocation,
  getEffectiveTimezone,
  formatInTimezone,
} from './timezone';
