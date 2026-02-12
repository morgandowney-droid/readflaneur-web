import { SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedSundayAd {
  source: 'paid' | 'global' | 'house_ad' | 'default';
  sponsorLabel: string;
  imageUrl: string | null;
  headline: string;
  body: string | null;
  clickUrl: string;
  adId?: string;
}

const DEFAULT_AD: ResolvedSundayAd = {
  source: 'default',
  sponsorLabel: 'Flaneur',
  imageUrl: null,
  headline: 'Become The Sunday Edition\'s Presenting Sponsor',
  body: 'Your brand, native in the most exclusive Sunday morning read.',
  clickUrl: 'https://readflaneur.com/advertise',
  adId: undefined,
};

/**
 * Resolve the best Sunday Edition ad for a given neighborhood.
 * Date-aware: only matches ads booked for today.
 *
 * Cascade:
 * 1. Neighborhood-targeted paid ad (placement_type = 'sunday_edition', status = 'active', start_date = today)
 * 2. Global paid ad (is_global = true, start_date = today)
 * 3. Sunday house ad (from house_ads table)
 * 4. Hardcoded default
 */
export async function resolveSundayAd(
  supabase: SupabaseClient,
  neighborhoodId: string
): Promise<ResolvedSundayAd> {
  const today = new Date().toISOString().split('T')[0];

  // 1. Neighborhood-targeted paid ad for today
  const { data: targetedAd } = await supabase
    .from('ads')
    .select('id, sponsor_label, image_url, headline, body, click_url')
    .eq('placement_type', 'sunday_edition')
    .eq('status', 'active')
    .eq('neighborhood_id', neighborhoodId)
    .eq('start_date', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (targetedAd) {
    return {
      source: 'paid',
      sponsorLabel: targetedAd.sponsor_label,
      imageUrl: targetedAd.image_url || null,
      headline: targetedAd.headline,
      body: targetedAd.body || null,
      clickUrl: targetedAd.click_url,
      adId: targetedAd.id,
    };
  }

  // 2. Global paid ad for today
  const { data: globalAd } = await supabase
    .from('ads')
    .select('id, sponsor_label, image_url, headline, body, click_url')
    .eq('placement_type', 'sunday_edition')
    .eq('status', 'active')
    .eq('is_global', true)
    .eq('start_date', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (globalAd) {
    return {
      source: 'global',
      sponsorLabel: globalAd.sponsor_label,
      imageUrl: globalAd.image_url || null,
      headline: globalAd.headline,
      body: globalAd.body || null,
      clickUrl: globalAd.click_url,
      adId: globalAd.id,
    };
  }

  // 3. Sunday house ad
  const { data: houseAd } = await supabase
    .from('house_ads')
    .select('headline, body, click_url')
    .eq('type', 'sunday_edition')
    .order('weight', { ascending: false })
    .limit(1)
    .single();

  if (houseAd) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';
    const clickUrl = houseAd.click_url.startsWith('/')
      ? `${appUrl}${houseAd.click_url}`
      : houseAd.click_url;

    return {
      source: 'house_ad',
      sponsorLabel: 'Flaneur',
      imageUrl: null,
      headline: houseAd.headline,
      body: houseAd.body || null,
      clickUrl,
    };
  }

  // 4. Default fallback
  return DEFAULT_AD;
}
