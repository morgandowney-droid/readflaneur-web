/**
 * Unsplash API Client
 *
 * Searches for real neighborhood photos on Unsplash. Hotlinks CDN URLs
 * per Unsplash terms (no downloading/re-hosting). Triggers download
 * endpoint for attribution tracking.
 *
 * Strategy: Two parallel searches per neighborhood — "{name} {city}"
 * for relevance and "{name}" alone for iconic shots — then interleave
 * the results so we get both city-accurate and visually striking photos.
 * 30 results per query, 8 assigned to categories. For ambiguous names
 * like "SoHo" the city-qualified search provides disambiguation while
 * the name-only search surfaces the most popular/curated shots.
 *
 * Rate limits: 50/hr (demo), 5000/hr (production)
 */

import type { ImageCategory } from './image-library';

// ============================================================================
// TYPES
// ============================================================================

export interface UnsplashPhoto {
  id: string;
  url: string; // CDN URL with sizing params
  photographer: string;
  photographer_url: string;
  download_location: string; // Must trigger for attribution
}

export type UnsplashPhotosMap = Partial<Record<ImageCategory, UnsplashPhoto>>;

interface UnsplashSearchResult {
  id: string;
  urls: { raw: string };
  user: { name: string; links: { html: string } };
  links: { download_location: string };
}

interface UnsplashSearchResponse {
  total: number;
  results: UnsplashSearchResult[];
}

// ============================================================================
// API CLIENT
// ============================================================================

function getAccessKey(): string {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error('UNSPLASH_ACCESS_KEY not configured');
  return key;
}

async function searchUnsplash(
  accessKey: string,
  query: string,
  perPage: number,
): Promise<UnsplashSearchResult[]> {
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('content_filter', 'high'); // SFW only

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });

  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      throw new Error(`Rate limited: ${res.status}`);
    }
    console.error(`[unsplash] Search failed: ${res.status} ${res.statusText}`);
    return [];
  }

  const data: UnsplashSearchResponse = await res.json();
  return data.results;
}

function toPhoto(result: UnsplashSearchResult): UnsplashPhoto {
  return {
    id: result.id,
    url: `${result.urls.raw}&w=1200&q=80&fm=webp`,
    photographer: result.user.name,
    photographer_url: result.user.links.html,
    download_location: result.links.download_location,
  };
}

/**
 * Trigger Unsplash download endpoint for attribution tracking.
 * Required by Unsplash API terms when displaying a photo.
 * Fire-and-forget — don't block on this.
 */
export async function triggerDownload(downloadLocation: string): Promise<void> {
  const accessKey = getAccessKey();
  try {
    await fetch(`${downloadLocation}?client_id=${accessKey}`);
  } catch {
    // Best-effort — don't fail the main flow
  }
}

/**
 * Merge two arrays with city-qualified priority (3:1 ratio), deduplicating by ID.
 * Takes 3 city-qualified results for every 1 name-only result so that ambiguous
 * names like SoHo, Chelsea, Downtown get the correct city's photos in 6+ of 8 slots.
 */
function interleave(
  a: UnsplashSearchResult[],
  b: UnsplashSearchResult[],
): UnsplashSearchResult[] {
  const merged: UnsplashSearchResult[] = [];
  const seen = new Set<string>();
  let ai = 0;
  let bi = 0;

  while (ai < a.length || bi < b.length) {
    // Take 3 from city-qualified (a)
    for (let k = 0; k < 3 && ai < a.length; ai++) {
      if (!seen.has(a[ai].id)) {
        merged.push(a[ai]);
        seen.add(a[ai].id);
        k++;
      }
    }
    // Take 1 from name-only (b) for iconic variety
    while (bi < b.length) {
      if (!seen.has(b[bi].id)) {
        merged.push(b[bi]);
        seen.add(b[bi].id);
        bi++;
        break;
      }
      bi++;
    }
  }

  return merged;
}

/**
 * Search and collect photos for all 8 image categories for a neighborhood.
 *
 * Two parallel searches, then interleave for best of both worlds:
 * 1. "{neighborhood} {city}" (30 results) — disambiguates "SoHo New York"
 *    vs "SoHo London", ensures city-relevance
 * 2. "{neighborhood}" alone (30 results) — surfaces the most iconic/popular
 *    shots that photographers tag with just the neighborhood name
 *
 * Results are merged with 3:1 city-qualified priority so ambiguous names
 * (SoHo, Chelsea, Downtown) get the correct city's photos in 6+ of 8 slots.
 * Falls back to city-only if still short.
 *
 * Cost: 2 API calls per neighborhood (was 1-4). Well within 5000/hr budget.
 */
export async function searchAllCategories(
  neighborhoodName: string,
  city: string,
  country?: string,
  broaderArea?: string,
): Promise<UnsplashPhotosMap> {
  const { IMAGE_CATEGORIES } = await import('./image-library');
  const accessKey = getAccessKey();
  const needed = IMAGE_CATEGORIES.length;

  // Primary searches: run in parallel for speed
  const [cityQualified, nameOnly] = await Promise.all([
    searchUnsplash(accessKey, `${neighborhoodName} ${city}`, 30),
    searchUnsplash(accessKey, neighborhoodName, 30),
  ]);

  // Interleave: alternates city-qualified (relevant) with name-only (iconic)
  let results = interleave(cityQualified, nameOnly);

  // Fallback: if still short, try broader queries
  if (results.length < needed) {
    const seenIds = new Set(results.map(r => r.id));

    const fallbackQueries = [
      city,
      ...(broaderArea ? [broaderArea] : []),
      ...(country ? [`${city} ${country}`] : []),
    ];

    for (const query of fallbackQueries) {
      if (results.length >= needed) break;
      await new Promise(resolve => setTimeout(resolve, 200));
      const batch = await searchUnsplash(accessKey, query, 30);
      for (const r of batch) {
        if (!seenIds.has(r.id)) {
          results.push(r);
          seenIds.add(r.id);
        }
      }
    }
  }

  if (results.length === 0) return {};

  // Assign unique photos to each category
  const photos: UnsplashPhotosMap = {};
  for (let i = 0; i < IMAGE_CATEGORIES.length; i++) {
    if (i >= results.length) break;

    const category = IMAGE_CATEGORIES[i];
    const photo = toPhoto(results[i]);
    photos[category] = photo;

    // Trigger download tracking (fire-and-forget)
    triggerDownload(photo.download_location);
  }

  return photos;
}

/**
 * Extended search that returns both category-assigned photos AND alternates.
 *
 * Same dual-search + interleave strategy as searchAllCategories, but:
 * 1. Filters out rejected photo IDs before assignment
 * 2. Returns overflow photos (positions 8+) as alternates for future swaps
 * 3. Caps alternates at 40 photos
 *
 * Existing searchAllCategories() is untouched - zero risk to current consumers.
 */
export async function searchAllCategoriesWithAlternates(
  neighborhoodName: string,
  city: string,
  country?: string,
  rejectedIds?: string[],
  broaderArea?: string,
): Promise<{ photos: UnsplashPhotosMap; alternates: UnsplashPhoto[] }> {
  const { IMAGE_CATEGORIES } = await import('./image-library');
  const accessKey = getAccessKey();
  const needed = IMAGE_CATEGORIES.length;
  const rejected = new Set(rejectedIds || []);

  // Primary searches: run in parallel for speed
  const [cityQualified, nameOnly] = await Promise.all([
    searchUnsplash(accessKey, `${neighborhoodName} ${city}`, 30),
    searchUnsplash(accessKey, neighborhoodName, 30),
  ]);

  // Interleave: alternates city-qualified (relevant) with name-only (iconic)
  let results = interleave(cityQualified, nameOnly);

  // Filter out rejected photos
  if (rejected.size > 0) {
    results = results.filter(r => !rejected.has(r.id));
  }

  // Fallback: if still short, try broader queries
  if (results.length < needed) {
    const seenIds = new Set(results.map(r => r.id));

    const fallbackQueries = [
      city,
      ...(broaderArea ? [broaderArea] : []),
      ...(country ? [`${city} ${country}`] : []),
    ];

    for (const query of fallbackQueries) {
      if (results.length >= needed) break;
      await new Promise(resolve => setTimeout(resolve, 200));
      const batch = await searchUnsplash(accessKey, query, 30);
      for (const r of batch) {
        if (!seenIds.has(r.id) && !rejected.has(r.id)) {
          results.push(r);
          seenIds.add(r.id);
        }
      }
    }
  }

  if (results.length === 0) return { photos: {}, alternates: [] };

  // Assign first 8 to categories
  const photos: UnsplashPhotosMap = {};
  for (let i = 0; i < IMAGE_CATEGORIES.length; i++) {
    if (i >= results.length) break;

    const category = IMAGE_CATEGORIES[i];
    const photo = toPhoto(results[i]);
    photos[category] = photo;

    // Trigger download tracking (fire-and-forget)
    triggerDownload(photo.download_location);
  }

  // Collect overflow as alternates (positions 8+, cap at 40)
  const alternates: UnsplashPhoto[] = [];
  for (let i = IMAGE_CATEGORIES.length; i < results.length && alternates.length < 40; i++) {
    alternates.push(toPhoto(results[i]));
  }

  return { photos, alternates };
}
