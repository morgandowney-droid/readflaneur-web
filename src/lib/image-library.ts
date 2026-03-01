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
import { triggerDownload } from './unsplash';

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
  alternates: UnsplashPhoto[];
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
    .select('unsplash_photos, unsplash_alternates')
    .eq('neighborhood_id', neighborhoodId)
    .single();

  if (data?.unsplash_photos) {
    unsplashCache.set(neighborhoodId, {
      photos: data.unsplash_photos as UnsplashPhotosMap,
      alternates: (data.unsplash_alternates || []) as UnsplashPhoto[],
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
    .select('neighborhood_id, unsplash_photos, unsplash_alternates')
    .not('unsplash_photos', 'is', null);

  if (data) {
    const now = Date.now();
    for (const row of data) {
      unsplashCache.set(row.neighborhood_id, {
        photos: row.unsplash_photos as UnsplashPhotosMap,
        alternates: (row.unsplash_alternates || []) as UnsplashPhoto[],
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
 * For RSS/news articles, rotates across all 8 categories using articleIndex
 * so consecutive articles for the same neighborhood get different photos.
 */
function resolveCategory(articleType: string, categoryLabel?: string, articleIndex?: number): ImageCategory {
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
    // Rotate RSS/news articles across all 8 categories for visual variety
    const idx = articleIndex ?? 0;
    return IMAGE_CATEGORIES[idx % IMAGE_CATEGORIES.length];
  }
}

/**
 * Select the appropriate library image URL for an article.
 * ALL article types rotate across the full pool (8 category photos + alternates)
 * using day-of-year so each day gets a different image. Falls back to category-based
 * selection only when alternates aren't available.
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
  articleIndex?: number,
): string {
  if (libraryReadyIds && !libraryReadyIds.has(neighborhoodId)) {
    return '';
  }

  const category = resolveCategory(articleType, categoryLabel, articleIndex);

  // Check Unsplash cache first
  const cached = unsplashCache.get(neighborhoodId);
  if (cached) {
    // Build the full pool of all available photos (8 categories + alternates)
    const allPhotos = Object.values(cached.photos).filter((p): p is UnsplashPhoto => !!p?.url);
    const fullPool = [...allPhotos, ...cached.alternates.filter(a => a?.url)];

    if (fullPool.length > 1) {
      // Determine rotation index based on article type:
      // - RSS/standard with articleIndex: use articleIndex for per-article variety
      // - Brief/Look Ahead/Sunday: use day-of-year so each day gets a different photo
      const rotationIndex = articleIndex != null
        ? articleIndex
        : getDayOfYear();
      return fullPool[rotationIndex % fullPool.length].url;
    }

    // Fallback: use category-based selection when pool is too small
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

  // All 273 neighborhoods have Unsplash photos now.
  // If cache miss, return '' and let retry-missing-images fill it later.
  // Never return legacy Supabase Storage URLs (those files don't exist).
  return '';
}

/**
 * Async version of selectLibraryImage that queries DB directly.
 * Use this when the Unsplash cache hasn't been preloaded (e.g., assembler fallback).
 * Returns Unsplash URL from DB, or '' if no photo exists.
 */
export async function selectLibraryImageAsync(
  supabase: SupabaseClient,
  neighborhoodId: string,
  articleType: string,
  categoryLabel?: string,
  articleIndex?: number,
): Promise<string> {
  // Try cache first
  const cached = selectLibraryImage(neighborhoodId, articleType, categoryLabel, undefined, articleIndex);
  if (cached && cached.includes('unsplash.com')) {
    return cached;
  }

  // Query DB directly
  const category = resolveCategory(articleType, categoryLabel, articleIndex);
  const { data } = await supabase
    .from('image_library_status')
    .select('unsplash_photos, unsplash_alternates')
    .eq('neighborhood_id', neighborhoodId)
    .single();

  if (data?.unsplash_photos) {
    const photos = data.unsplash_photos as UnsplashPhotosMap;
    const alternates = (data.unsplash_alternates || []) as UnsplashPhoto[];

    // All article types rotate across full pool (8 categories + alternates)
    const allPhotos = Object.values(photos).filter((p): p is UnsplashPhoto => !!p?.url);
    const fullPool = [...allPhotos, ...alternates.filter(a => a?.url)];
    if (fullPool.length > 1) {
      const rotationIndex = articleIndex != null ? articleIndex : getDayOfYear();
      return fullPool[rotationIndex % fullPool.length].url;
    }

    const photo = photos[category];
    if (photo?.url) return photo.url;
    // Fallback to any available photo
    const available = Object.values(photos).find(p => p?.url);
    if (available?.url) return available.url;
  }

  return '';
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
    .select('neighborhood_id, unsplash_photos, unsplash_alternates, images_generated');

  const readyIds = new Set<string>();
  if (data) {
    const now = Date.now();
    for (const row of data) {
      // Ready if has Unsplash photos OR has old generated images
      if (row.unsplash_photos || row.images_generated >= IMAGE_CATEGORIES.length) {
        readyIds.add(row.neighborhood_id);
      }
      // Preload Unsplash cache with BOTH photos and alternates
      if (row.unsplash_photos) {
        unsplashCache.set(row.neighborhood_id, {
          photos: row.unsplash_photos as UnsplashPhotosMap,
          alternates: (row.unsplash_alternates || []) as UnsplashPhoto[],
          timestamp: now,
        });
      }
    }
  }

  return readyIds;
}

// ============================================================================
// NEGATIVE IMAGE SWAP
// ============================================================================

export interface SwapResult {
  oldUrl: string;
  newUrl: string;
  articlesUpdated: number;
  newPhotographer: string;
}

/**
 * Swap a negatively-scored image out of a neighborhood's library.
 *
 * 1. Finds which category holds the bad URL
 * 2. Picks the first available alternate
 * 3. Updates library JSONB (swap in replacement, remove from alternates, blacklist old ID)
 * 4. Bulk-updates all articles using the bad URL
 * 5. Invalidates cache and triggers Unsplash download attribution
 *
 * Returns null if no swap is possible (no alternates, image not in library).
 */
export async function swapNegativeImage(
  supabase: SupabaseClient,
  neighborhoodId: string,
  badImageUrl: string,
): Promise<SwapResult | null> {
  // Load library row
  const { data: row } = await supabase
    .from('image_library_status')
    .select('unsplash_photos, unsplash_alternates, rejected_image_ids')
    .eq('neighborhood_id', neighborhoodId)
    .single();

  if (!row?.unsplash_photos) return null;

  const photos = row.unsplash_photos as UnsplashPhotosMap;
  const alternates = (row.unsplash_alternates || []) as UnsplashPhoto[];
  const rejectedIds = (row.rejected_image_ids || []) as string[];

  // Find which category holds the bad image
  let badCategory: ImageCategory | null = null;
  let badPhotoId: string | null = null;
  for (const cat of IMAGE_CATEGORIES) {
    const photo = photos[cat];
    if (photo?.url === badImageUrl) {
      badCategory = cat;
      badPhotoId = photo.id;
      break;
    }
  }

  if (!badCategory || !badPhotoId) return null; // Image not in this library
  if (alternates.length === 0) return null; // No replacements available

  // Pick first alternate
  const replacement = alternates[0];
  const remainingAlternates = alternates.slice(1);

  // Update library JSONB
  const updatedPhotos = { ...photos, [badCategory]: replacement };
  const updatedRejected = [...rejectedIds, badPhotoId];

  const { error: updateError } = await supabase
    .from('image_library_status')
    .update({
      unsplash_photos: updatedPhotos,
      unsplash_alternates: remainingAlternates,
      rejected_image_ids: updatedRejected,
      updated_at: new Date().toISOString(),
    })
    .eq('neighborhood_id', neighborhoodId);

  if (updateError) {
    console.error(`[swap] Failed to update library for ${neighborhoodId}:`, updateError.message);
    return null;
  }

  // Count articles that will be updated
  const { data: affectedArticles } = await supabase
    .from('articles')
    .select('id')
    .eq('image_url', badImageUrl);

  const articlesCount = affectedArticles?.length ?? 0;

  // Bulk-update all articles using the bad URL
  if (articlesCount > 0) {
    await supabase
      .from('articles')
      .update({ image_url: replacement.url })
      .eq('image_url', badImageUrl);
  }

  // Invalidate module-level cache
  unsplashCache.set(neighborhoodId, {
    photos: updatedPhotos,
    alternates: remainingAlternates,
    timestamp: Date.now(),
  });

  // Trigger Unsplash download attribution for the new photo
  triggerDownload(replacement.download_location);

  return {
    oldUrl: badImageUrl,
    newUrl: replacement.url,
    articlesUpdated: articlesCount,
    newPhotographer: replacement.photographer,
  };
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
