/**
 * Unsplash API Client
 *
 * Searches for real neighborhood photos on Unsplash. Hotlinks CDN URLs
 * per Unsplash terms (no downloading/re-hosting). Triggers download
 * endpoint for attribution tracking.
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
// CATEGORY SEARCH KEYWORDS
// ============================================================================

const CATEGORY_KEYWORDS: Record<ImageCategory, string> = {
  'daily-brief-1': 'street golden hour',
  'daily-brief-2': 'architecture morning',
  'daily-brief-3': 'neighborhood alley',
  'look-ahead-1': 'skyline dawn',
  'look-ahead-2': 'evening street lights',
  'look-ahead-3': 'architectural detail facade',
  'sunday-edition': 'cafe interior window',
  'rss-story': 'iconic landmark street',
};

// ============================================================================
// API CLIENT
// ============================================================================

function getAccessKey(): string {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error('UNSPLASH_ACCESS_KEY not configured');
  return key;
}

/**
 * Search Unsplash for a neighborhood photo matching a category.
 *
 * Two-tier search:
 * 1. "{neighborhood}, {city} {category_keyword}" — specific
 * 2. "{city} {category_keyword}" — broader fallback
 *
 * Returns the top result from the first tier with results,
 * cycling through results by category index for variety.
 */
export async function searchNeighborhoodPhoto(
  neighborhoodName: string,
  city: string,
  category: ImageCategory,
  categoryIndex: number,
): Promise<UnsplashPhoto | null> {
  const accessKey = getAccessKey();
  const keyword = CATEGORY_KEYWORDS[category];

  // Tier 1: specific neighborhood search
  const specificQuery = `${neighborhoodName}, ${city} ${keyword}`;
  let result = await searchUnsplash(accessKey, specificQuery, categoryIndex);

  // Tier 2: broader city search if no specific results
  if (!result) {
    const broadQuery = `${city} ${keyword}`;
    result = await searchUnsplash(accessKey, broadQuery, categoryIndex);
  }

  return result;
}

async function searchUnsplash(
  accessKey: string,
  query: string,
  resultIndex: number,
): Promise<UnsplashPhoto | null> {
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '10');
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('content_filter', 'high'); // SFW only

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${accessKey}` },
  });

  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      console.error(`[unsplash] Rate limited: ${res.status}`);
      return null;
    }
    console.error(`[unsplash] Search failed: ${res.status} ${res.statusText}`);
    return null;
  }

  const data: UnsplashSearchResponse = await res.json();
  if (data.results.length === 0) return null;

  // Cycle through results by category index for variety
  const photo = data.results[resultIndex % data.results.length];

  return {
    id: photo.id,
    url: `${photo.urls.raw}&w=1200&q=80&fm=webp`,
    photographer: photo.user.name,
    photographer_url: photo.user.links.html,
    download_location: photo.links.download_location,
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
 * Search and collect photos for all 8 image categories for a neighborhood.
 * Returns a map of category -> UnsplashPhoto, triggering downloads for each.
 */
export async function searchAllCategories(
  neighborhoodName: string,
  city: string,
): Promise<UnsplashPhotosMap> {
  const { IMAGE_CATEGORIES } = await import('./image-library');
  const photos: UnsplashPhotosMap = {};

  for (let i = 0; i < IMAGE_CATEGORIES.length; i++) {
    const category = IMAGE_CATEGORIES[i];

    const photo = await searchNeighborhoodPhoto(
      neighborhoodName,
      city,
      category,
      i,
    );

    if (photo) {
      photos[category] = photo;
      // Trigger download tracking (fire-and-forget)
      triggerDownload(photo.download_location);
    }

    // 200ms spacing to stay well within rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return photos;
}
