/**
 * Unsplash API Client
 *
 * Searches for real neighborhood photos on Unsplash. Hotlinks CDN URLs
 * per Unsplash terms (no downloading/re-hosting). Triggers download
 * endpoint for attribution tracking.
 *
 * Strategy: ONE search per neighborhood ("Nolita New York"), take the
 * top 10 results, assign different photos to each category by index.
 * This ensures every photo is actually of the neighborhood.
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
      console.error(`[unsplash] Rate limited: ${res.status}`);
      return [];
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
 * Search and collect photos for all 8 image categories for a neighborhood.
 *
 * Uses just 1-2 API calls per neighborhood instead of 8:
 * 1. Search "{neighborhood} {city}" — get 10 results
 * 2. If <8 results, also search "{city} neighborhood street" — get 10 more
 * 3. Assign unique photos to each category by index
 *
 * This ensures every photo is actually of the neighborhood, not random
 * artistic shots from abstract keyword queries.
 */
export async function searchAllCategories(
  neighborhoodName: string,
  city: string,
): Promise<UnsplashPhotosMap> {
  const { IMAGE_CATEGORIES } = await import('./image-library');
  const accessKey = getAccessKey();

  // Tier 1: neighborhood-specific search
  let results = await searchUnsplash(
    accessKey,
    `${neighborhoodName} ${city}`,
    10,
  );

  // Tier 2: broader city search if not enough results
  if (results.length < IMAGE_CATEGORIES.length) {
    const broadResults = await searchUnsplash(
      accessKey,
      `${city} street neighborhood`,
      10,
    );

    // Deduplicate by photo ID
    const existingIds = new Set(results.map(r => r.id));
    for (const r of broadResults) {
      if (!existingIds.has(r.id)) {
        results.push(r);
        existingIds.add(r.id);
      }
    }

    // 200ms spacing between API calls
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  if (results.length === 0) return {};

  // Assign unique photos to each category
  const photos: UnsplashPhotosMap = {};
  for (let i = 0; i < IMAGE_CATEGORIES.length; i++) {
    if (i >= results.length) break; // Not enough unique photos

    const category = IMAGE_CATEGORIES[i];
    const photo = toPhoto(results[i]);
    photos[category] = photo;

    // Trigger download tracking (fire-and-forget)
    triggerDownload(photo.download_location);
  }

  return photos;
}
