/**
 * Site-wide stats — single source of truth for marketing pages.
 *
 * Update these when the Flaneur network expands.
 * The /about page fetches live from the DB; these are used
 * in static/client contexts (advertise, meta descriptions, etc.).
 */
export const SITE_STATS = {
  neighborhoods: 200,
  cities: 73,
  countries: 42,
} as const;
