/**
 * Image Library Generator
 *
 * Searches Unsplash for real neighborhood photos across 8 categories.
 * Stores CDN URLs in image_library_status.unsplash_photos JSONB.
 *
 * ~200ms per category, ~2s per neighborhood (vs ~30s with Imagen 4).
 *
 * Usage:
 * ```ts
 * const result = await generateNeighborhoodLibrary(supabase, neighborhood);
 * ```
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { IMAGE_CATEGORIES } from './image-library';
import { searchAllCategories, type UnsplashPhotosMap } from './unsplash';

// ============================================================================
// TYPES
// ============================================================================

interface NeighborhoodInfo {
  id: string;
  name: string;
  city: string;
  country: string | null;
}

interface GenerationResult {
  neighborhood_id: string;
  photos_found: number;
  errors: string[];
}

// ============================================================================
// FULL PIPELINE
// ============================================================================

/**
 * Search Unsplash for 8 category images for a single neighborhood
 * and store the results in the unsplash_photos JSONB column.
 *
 * Cost: $0 (Unsplash API is free)
 * Time: ~2s per neighborhood
 */
export async function generateNeighborhoodLibrary(
  supabase: SupabaseClient,
  neighborhood: NeighborhoodInfo,
): Promise<GenerationResult> {
  const result: GenerationResult = {
    neighborhood_id: neighborhood.id,
    photos_found: 0,
    errors: [],
  };

  let photos: UnsplashPhotosMap;
  try {
    photos = await searchAllCategories(neighborhood.name, neighborhood.city);
    result.photos_found = Object.keys(photos).length;
  } catch (err) {
    result.errors.push(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  if (result.photos_found === 0) {
    result.errors.push('No Unsplash photos found for any category');
    return result;
  }

  // Update status tracking table
  const now = new Date();
  const season = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  await supabase
    .from('image_library_status')
    .upsert({
      neighborhood_id: neighborhood.id,
      unsplash_photos: photos,
      images_generated: IMAGE_CATEGORIES.length, // Mark as complete for backward compat
      last_generated_at: now.toISOString(),
      generation_season: season,
      prompts_json: null, // No longer needed
      errors: result.errors.length > 0 ? result.errors : null,
      updated_at: now.toISOString(),
    })
    .then(null, (err: Error) => {
      console.error(`Failed to update library status for ${neighborhood.id}:`, err.message);
    });

  return result;
}
