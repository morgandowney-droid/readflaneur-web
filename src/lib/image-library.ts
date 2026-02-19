/**
 * Neighborhood Image Library
 *
 * Serves real Unsplash photos for articles, rotated by article type.
 * Falls back to old Supabase Storage URLs for neighborhoods that haven't
 * been refreshed yet.
 *
 * Usage:
 * ```ts
 * const imageUrl = await selectLibraryImage(supabase, 'stockholm-ostermalm', 'brief_summary');
 * // or synchronous (uses cache, returns '' on cache miss):
 * const imageUrl = selectLibraryImageSync('stockholm-ostermalm', 'brief_summary');
 * ```
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { UnsplashPhoto, UnsplashPhotosMap } from './unsplash';

// ============================================================================
// TYPES
// ============================================================================

export const IMAGE_CATEGORIES = [
  'daily-brief-1',
  'daily-brief-2',
  'daily-brief-3',
  'look-ahead-1',
  'look-ahead-2',
  'look-ahead-3',
  'sunday-edition',
  'rss-story',
] as const;

export type ImageCategory = typeof IMAGE_CATEGORIES[number];

export interface LibraryStatus {
  neighborhood_id: string;
  images_generated: number;
  last_generated_at: string | null;
  generation_season: string | null;
  prompts_json: Record<string, string> | null;
  unsplash_photos: UnsplashPhotosMap | null;
  errors: string[] | null;
}

// ============================================================================
// UNSPLASH PHOTO CACHE
// ============================================================================

interface CacheEntry {
  photos: UnsplashPhotosMap;
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const unsplashCache = new Map<string, CacheEntry>();

/**
 * Get Unsplash photos for a neighborhood from cache or DB.
 */
async function getUnsplashPhotos(
  supabase: SupabaseClient,
  neighborhoodId: string,
): Promise<UnsplashPhotosMap | null> {
  const cached = unsplashCache.get(neighborhoodId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.photos;
  }

  const { data } = await supabase
    .from('image_library_status')
    .select('unsplash_photos')
    .eq('neighborhood_id', neighborhoodId)
    .single();

  if (data?.unsplash_photos) {
    unsplashCache.set(neighborhoodId, {
      photos: data.unsplash_photos as UnsplashPhotosMap,
      timestamp: Date.now(),
    });
    return data.unsplash_photos as UnsplashPhotosMap;
  }

  return null;
}

/**
 * Bulk-load Unsplash photos for all ready neighborhoods into cache.
 * Call once at cron startup for efficiency.
 */
export async function preloadUnsplashCache(
  supabase: SupabaseClient,
): Promise<void> {
  const { data } = await supabase
    .from('image_library_status')
    .select('neighborhood_id, unsplash_photos')
    .not('unsplash_photos', 'is', null);

  if (data) {
    const now = Date.now();
    for (const row of data) {
      unsplashCache.set(row.neighborhood_id, {
        photos: row.unsplash_photos as UnsplashPhotosMap,
        timestamp: now,
      });
    }
  }
}

// ============================================================================
// STORAGE PATHS (legacy Supabase Storage fallback)
// ============================================================================

const LIBRARY_BASE = 'library';

export function getLibraryPath(neighborhoodId: string, category: ImageCategory): string {
  return `${LIBRARY_BASE}/${neighborhoodId}/${category}.png`;
}

export function getLibraryUrl(neighborhoodId: string, category: ImageCategory): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const path = getLibraryPath(neighborhoodId, category);
  return `${supabaseUrl}/storage/v1/object/public/images/${path}`;
}

// ============================================================================
// IMAGE SELECTION
// ============================================================================

/**
 * Get the day of year (1-366) for rotation purposes.
 */
function getDayOfYear(date?: Date): number {
  const d = date || new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Determine which image category to use for an article type.
 */
function resolveCategory(articleType: string, categoryLabel?: string): ImageCategory {
  const variant = (getDayOfYear() % 3) + 1;

  if (articleType === 'brief_summary') {
    return `daily-brief-${variant}` as ImageCategory;
  } else if (articleType === 'look_ahead') {
    return `look-ahead-${variant}` as ImageCategory;
  } else if (
    categoryLabel === 'The Sunday Edition' ||
    articleType === 'weekly_recap'
  ) {
    return 'sunday-edition';
  } else {
    return 'rss-story';
  }
}

/**
 * Select the appropriate library image URL for an article.
 * Checks Unsplash cache first, falls back to old Supabase Storage URL.
 *
 * @param neighborhoodId - The neighborhood's slug ID
 * @param articleType - The article_type value from the articles table
 * @param categoryLabel - Optional category_label for disambiguation
 * @param libraryReadyIds - Set of neighborhood IDs with libraries. Returns '' for unready.
 * @returns Full URL to the image, or '' if no library exists
 */
export function selectLibraryImage(
  neighborhoodId: string,
  articleType: string,
  categoryLabel?: string,
  libraryReadyIds?: Set<string>,
): string {
  if (libraryReadyIds && !libraryReadyIds.has(neighborhoodId)) {
    return '';
  }

  const category = resolveCategory(articleType, categoryLabel);

  // Check Unsplash cache first
  const cached = unsplashCache.get(neighborhoodId);
  if (cached) {
    const photo: UnsplashPhoto | undefined = cached.photos[category];
    if (photo?.url) {
      return photo.url;
    }
    // Exact category not available - use any available Unsplash photo
    const available = Object.values(cached.photos).find(p => p?.url);
    if (available?.url) {
      return available.url;
    }
  }

  // Fallback to old Supabase Storage URL
  return getLibraryUrl(neighborhoodId, category);
}

// ============================================================================
// LIBRARY READINESS
// ============================================================================

/**
 * Fetch the set of neighborhood IDs that have image libraries.
 * Includes both Unsplash-powered and legacy Supabase Storage libraries.
 * Also preloads the Unsplash cache for efficiency.
 */
export async function getLibraryReadyIds(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('image_library_status')
    .select('neighborhood_id, unsplash_photos, images_generated');

  const readyIds = new Set<string>();
  if (data) {
    const now = Date.now();
    for (const row of data) {
      // Ready if has Unsplash photos OR has old generated images
      if (row.unsplash_photos || row.images_generated >= IMAGE_CATEGORIES.length) {
        readyIds.add(row.neighborhood_id);
      }
      // Preload Unsplash cache while we're at it
      if (row.unsplash_photos) {
        unsplashCache.set(row.neighborhood_id, {
          photos: row.unsplash_photos as UnsplashPhotosMap,
          timestamp: now,
        });
      }
    }
  }

  return readyIds;
}

// ============================================================================
// STATUS CHECKING
// ============================================================================

/**
 * Check which neighborhoods have complete/partial/missing image libraries.
 */
export async function checkLibraryStatus(
  supabase: SupabaseClient,
): Promise<{
  total: number;
  complete: number;
  partial: number;
  missing: number;
  neighborhoods: Array<{
    id: string;
    name: string;
    city: string;
    images_generated: number;
    has_unsplash: boolean;
    last_generated_at: string | null;
  }>;
}> {
  const { data: neighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, name, city')
    .eq('is_active', true)
    .order('name');

  if (!neighborhoods) {
    return { total: 0, complete: 0, partial: 0, missing: 0, neighborhoods: [] };
  }

  const { data: statuses } = await supabase
    .from('image_library_status')
    .select('neighborhood_id, images_generated, last_generated_at, unsplash_photos');

  const statusMap = new Map(
    (statuses || []).map(s => [s.neighborhood_id, s])
  );

  let complete = 0;
  let partial = 0;
  let missing = 0;
  const result: Array<{
    id: string;
    name: string;
    city: string;
    images_generated: number;
    has_unsplash: boolean;
    last_generated_at: string | null;
  }> = [];

  for (const n of neighborhoods) {
    const status = statusMap.get(n.id);
    const count = status?.images_generated || 0;
    const hasUnsplash = !!status?.unsplash_photos;
    const lastGen = status?.last_generated_at || null;

    if (hasUnsplash || count >= IMAGE_CATEGORIES.length) {
      complete++;
    } else if (count > 0) {
      partial++;
    } else {
      missing++;
    }

    result.push({
      id: n.id,
      name: n.name,
      city: n.city,
      images_generated: count,
      has_unsplash: hasUnsplash,
      last_generated_at: lastGen,
    });
  }

  return {
    total: neighborhoods.length,
    complete,
    partial,
    missing,
    neighborhoods: result,
  };
}

/**
 * Check if a specific neighborhood has a complete image library.
 */
export async function hasCompleteLibrary(
  supabase: SupabaseClient,
  neighborhoodId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('image_library_status')
    .select('images_generated, unsplash_photos')
    .eq('neighborhood_id', neighborhoodId)
    .single();

  return !!(data?.unsplash_photos) || (data?.images_generated || 0) >= IMAGE_CATEGORIES.length;
}
