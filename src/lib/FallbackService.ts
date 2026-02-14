import { SupabaseClient } from '@supabase/supabase-js';
import { TIER_1_IDS } from '@/config/ad-tiers';
import { getTierForNeighborhood } from '@/lib/PricingService';

export interface HouseAd {
  id: string;
  type: string;
  headline: string;
  body: string | null;
  image_url: string | null;
  click_url: string;
  weight: number;
}

export interface BonusAd {
  id: string;
  image_url: string;
  headline: string;
  click_url: string;
  sponsor_label: string;
  is_bonus: true;
}

export interface FallbackResult {
  source: 'bonus' | 'house_ad' | 'default';
  houseAd?: HouseAd;
  bonusAd?: BonusAd;
}

/**
 * Resolve a fallback ad when no paid campaign targets the current neighborhood.
 *
 * Priority:
 *   1. Bonus — Active Tier 1 campaign from another neighborhood (cross-sell)
 *   2. House Ad — Weighted random from house_ads table
 *   3. Default — Existing newsletter/house-ad logic in FallbackAd component
 */
export async function getFallback(
  supabase: SupabaseClient,
  neighborhoodId: string,
  options?: { isAuthenticated?: boolean }
): Promise<FallbackResult> {
  // ─── Priority 1: Bonus Ad (cross-sell from Tier 1 neighborhoods) ───
  try {
    const { tier } = getTierForNeighborhood(neighborhoodId, new Date());

    // Only show bonus ads from Tier 1 campaigns on non-Tier-1 neighborhoods
    if (tier !== 1) {
      const otherTier1Ids = TIER_1_IDS.filter(id => id !== neighborhoodId);

      if (otherTier1Ids.length > 0) {
        const { data: bonusCandidates } = await supabase
          .from('ads')
          .select('id, image_url, headline, click_url, sponsor_label')
          .eq('status', 'active')
          .eq('placement', 'story_open')
          .in('neighborhood_id', otherTier1Ids);

        if (bonusCandidates && bonusCandidates.length > 0) {
          const picked = bonusCandidates[Math.floor(Math.random() * bonusCandidates.length)];
          return {
            source: 'bonus',
            bonusAd: {
              id: picked.id,
              image_url: picked.image_url,
              headline: picked.headline,
              click_url: picked.click_url,
              sponsor_label: picked.sponsor_label,
              is_bonus: true,
            },
          };
        }
      }
    }
  } catch {
    // Tier lookup failure is non-fatal — fall through to house ads
  }

  // ─── Priority 2: House Ad (weighted random) ───
  try {
    let query = supabase
      .from('house_ads')
      .select('*')
      .eq('active', true);

    // Newsletter signup ad only shown to non-authenticated visitors
    if (options?.isAuthenticated) {
      query = query.neq('type', 'newsletter');
    }

    const { data: houseAds } = await query;

    if (houseAds && houseAds.length > 0) {
      const picked = weightedRandom(houseAds);
      let body = picked.body as string | null;

      // Resolve {{neighborhood_count}} placeholder with live count
      if (body && body.includes('{{neighborhood_count}}')) {
        const { count } = await supabase
          .from('neighborhoods')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('is_combo', false);
        body = body.replace(/\{\{neighborhood_count\}\}/g, String(count || 270));
      }

      return {
        source: 'house_ad',
        houseAd: {
          id: picked.id,
          type: picked.type,
          headline: picked.headline,
          body,
          image_url: picked.image_url,
          click_url: picked.click_url,
          weight: picked.weight,
        },
      };
    }
  } catch {
    // House ads query failure is non-fatal
  }

  // ─── Priority 3: Default ───
  return { source: 'default' };
}

/** Weighted random selection: items with higher weight are more likely to be picked. */
function weightedRandom<T extends { weight: number }>(items: T[]): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;

  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item;
  }

  return items[items.length - 1];
}
