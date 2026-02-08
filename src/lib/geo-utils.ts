/**
 * Geographic utility functions — Haversine distance and sorting.
 * Extracted from NeighborhoodSelectorModal for shared use.
 */

/** Calculate distance between two lat/lng points in kilometers (Haversine formula) */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Sort items by distance from a user location. Items must have latitude/longitude. */
export function sortByDistance<T extends { latitude?: number; longitude?: number }>(
  items: T[],
  userLat: number,
  userLng: number
): (T & { distance: number })[] {
  return items
    .map((item) => ({
      ...item,
      distance:
        item.latitude != null && item.longitude != null
          ? getDistance(userLat, userLng, item.latitude, item.longitude)
          : Infinity,
    }))
    .sort((a, b) => a.distance - b.distance);
}

/** Format distance for display: "3 km" or "1,200 km" */
export function formatDistance(km: number): string {
  if (km === Infinity) return '';
  if (km < 1) return '<1 km';
  return `${Math.round(km).toLocaleString('en-US')} km`;
}
