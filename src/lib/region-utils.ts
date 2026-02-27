/**
 * Shared geographic region utilities.
 * Extracted from NeighborhoodSelectorModal for reuse in bento grid and modal.
 */

/** Geographic region order used in the neighborhood selector modal */
export const GEO_REGION_ORDER: { key: string; label: string }[] = [
  { key: 'north-america', label: 'North America' },
  { key: 'south-america', label: 'South America' },
  { key: 'europe', label: 'Europe' },
  { key: 'middle-east', label: 'Middle East' },
  { key: 'asia-pacific', label: 'Asia & Pacific' },
  { key: 'africa', label: 'Africa' },
  { key: 'other', label: 'Other' },
];

export const GEO_REGION_INDEX: Record<string, number> = Object.fromEntries(
  GEO_REGION_ORDER.map((r, i) => [r.key, i])
);

/** Map any region (including vacation/enclave) to its geographic parent */
export function getGeoRegion(region?: string): string {
  if (!region) return 'other';
  if (region === 'us-vacation' || region === 'caribbean-vacation') return 'north-america';
  if (region === 'europe-vacation') return 'europe';
  if (region === 'test') return 'other';
  if (region.includes('enclaves')) {
    if (region.startsWith('nyc')) return 'north-america';
    if (region.startsWith('stockholm')) return 'europe';
    return 'other';
  }
  return region;
}

/** Bento grid regions - 3 macro regions for discovery sections */
export const BENTO_REGIONS = [
  { key: 'asia-pacific', label: 'Asia & Pacific' },
  { key: 'europe', label: 'Europe' },
  { key: 'americas', label: 'The Americas' },
] as const;

export type BentoRegion = typeof BENTO_REGIONS[number]['key'];

/** Map a DB region to one of the 3 bento display regions */
export function getBentoRegion(region?: string): BentoRegion | null {
  const geo = getGeoRegion(region);
  if (geo === 'north-america' || geo === 'south-america') return 'americas';
  if (geo === 'europe' || geo === 'middle-east') return 'europe';
  if (geo === 'asia-pacific') return 'asia-pacific';
  return null;
}
