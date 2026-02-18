/**
 * Neighborhood Image Library
 *
 * Pre-generated library of 8 evergreen images per neighborhood,
 * rotated by article type. Eliminates per-article Gemini Image calls.
 *
 * Storage: Supabase Storage `images/library/{neighborhood_id}/{category}.png`
 *
 * Usage:
 * ```ts
 * const imageUrl = selectLibraryImage('stockholm-ostermalm', 'brief_summary');
 * ```
 */

import { SupabaseClient } from '@supabase/supabase-js';

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
  errors: string[] | null;
}

// ============================================================================
// STORAGE PATHS
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
 * Select the appropriate library image URL for an article.
 * Returns null if the neighborhood doesn't have a generated image library.
 *
 * @param neighborhoodId - The neighborhood's slug ID
 * @param articleType - The article_type value from the articles table
 * @param categoryLabel - Optional category_label for disambiguation (e.g., 'The Sunday Edition')
 * @param libraryReadyIds - Set of neighborhood IDs that have generated image libraries. If provided, returns '' for neighborhoods not in the set (retry-missing-images will fill them).
 * @returns Full public URL to the library image, or '' if no library exists
 */
export function selectLibraryImage(
  neighborhoodId: string,
  articleType: string,
  categoryLabel?: string,
  libraryReadyIds?: Set<string>,
): string {
  // If we know which neighborhoods have libraries, skip those that don't
  if (libraryReadyIds && !libraryReadyIds.has(neighborhoodId)) {
    return '';
  }

  const variant = (getDayOfYear() % 3) + 1;

  let category: ImageCategory;

  if (articleType === 'brief_summary') {
    category = `daily-brief-${variant}` as ImageCategory;
  } else if (articleType === 'look_ahead') {
    category = `look-ahead-${variant}` as ImageCategory;
  } else if (
    categoryLabel === 'The Sunday Edition' ||
    articleType === 'weekly_recap'
  ) {
    category = 'sunday-edition';
  } else {
    // RSS stories, Grok stories, guide digests, community news, etc.
    category = 'rss-story';
  }

  return getLibraryUrl(neighborhoodId, category);
}

// ============================================================================
// LIBRARY READINESS
// ============================================================================

/**
 * Fetch the set of neighborhood IDs that have complete image libraries.
 * Call once at cron startup, pass the result to selectLibraryImage().
 */
export async function getLibraryReadyIds(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('image_library_status')
    .select('neighborhood_id')
    .gte('images_generated', IMAGE_CATEGORIES.length);

  return new Set((data || []).map(r => r.neighborhood_id));
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
    last_generated_at: string | null;
  }>;
}> {
  // Get all active neighborhoods
  const { data: neighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, name, city')
    .eq('is_active', true)
    .order('name');

  if (!neighborhoods) {
    return { total: 0, complete: 0, partial: 0, missing: 0, neighborhoods: [] };
  }

  // Get library status for all neighborhoods
  const { data: statuses } = await supabase
    .from('image_library_status')
    .select('neighborhood_id, images_generated, last_generated_at');

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
    last_generated_at: string | null;
  }> = [];

  for (const n of neighborhoods) {
    const status = statusMap.get(n.id);
    const count = status?.images_generated || 0;
    const lastGen = status?.last_generated_at || null;

    if (count >= IMAGE_CATEGORIES.length) {
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
    .select('images_generated')
    .eq('neighborhood_id', neighborhoodId)
    .single();

  return (data?.images_generated || 0) >= IMAGE_CATEGORIES.length;
}
