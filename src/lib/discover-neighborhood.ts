/**
 * Find a nearby unsubscribed neighborhood's latest brief article.
 * Used by "Check Out a New Neighborhood" house ad (email + web).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getDistance } from '@/lib/geo-utils';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

export interface DiscoveryResult {
  url: string;
  neighborhoodName: string;
}

export interface DiscoveryOptions {
  mode?: 'nearby' | 'random';
  excludeCity?: string;
}

/**
 * Find the nearest unsubscribed neighborhood that has a recent brief article.
 * Returns a URL to the brief and the neighborhood name, or null if nothing found.
 *
 * mode='nearby' (default): sort by distance from reference neighborhood
 * mode='random': random shuffle, optionally excluding a specific city for diversity
 */
export async function findDiscoveryBrief(
  supabase: SupabaseClient,
  subscribedIds: string[],
  referenceNeighborhoodId: string | null,
  options?: DiscoveryOptions
): Promise<DiscoveryResult | null> {
  const mode = options?.mode || 'nearby';
  const excludeCity = options?.excludeCity;

  // Fetch all active, non-combo neighborhoods with coordinates
  const { data: neighborhoods } = await supabase
    .from('neighborhoods')
    .select('id, name, city, latitude, longitude')
    .eq('is_active', true)
    .eq('is_combo', false);

  if (!neighborhoods || neighborhoods.length === 0) return null;

  // Filter out subscribed neighborhoods
  const subscribedSet = new Set(subscribedIds);
  let candidates = neighborhoods.filter(n => !subscribedSet.has(n.id));

  // For random mode, exclude the specified city for diversity
  if (mode === 'random' && excludeCity) {
    const filtered = candidates.filter(
      n => n.city?.toLowerCase() !== excludeCity.toLowerCase()
    );
    // Only apply city filter if it leaves candidates
    if (filtered.length > 0) candidates = filtered;
  }

  if (candidates.length === 0) return null;

  let sorted = candidates;

  if (mode === 'random') {
    // Fisher-Yates shuffle for unbiased randomization
    sorted = [...candidates];
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
  } else if (referenceNeighborhoodId) {
    // Sort by distance from reference
    const ref = neighborhoods.find(n => n.id === referenceNeighborhoodId);
    if (ref?.latitude != null && ref?.longitude != null) {
      sorted = candidates
        .filter(n => n.latitude != null && n.longitude != null)
        .map(n => ({
          ...n,
          dist: getDistance(ref.latitude!, ref.longitude!, n.latitude!, n.longitude!),
        }))
        .sort((a, b) => a.dist - b.dist);
    }
  } else {
    // No reference and not random - shuffle as fallback
    sorted = candidates.sort(() => Math.random() - 0.5);
  }

  // Try the top 10 candidates to find one with a brief article
  const topCandidates = sorted.slice(0, 10);

  for (const candidate of topCandidates) {
    const { data: article } = await supabase
      .from('articles')
      .select('slug')
      .eq('neighborhood_id', candidate.id)
      .eq('status', 'published')
      .ilike('category_label', '%Daily Brief%')
      .order('published_at', { ascending: false })
      .limit(1)
      .single();

    if (article?.slug) {
      const citySlug = getCitySlugFromId(candidate.id);
      const neighborhoodSlug = getNeighborhoodSlugFromId(candidate.id);
      return {
        url: `/${citySlug}/${neighborhoodSlug}/${article.slug}`,
        neighborhoodName: candidate.name,
      };
    }
  }

  return null;
}
