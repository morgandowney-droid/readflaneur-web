/**
 * Ad selection for Daily Brief emails
 * Selects header and native ads from the ads table
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { EmailAd } from './types';

interface EmailAdsResult {
  headerAd: EmailAd | null;
  nativeAd: EmailAd | null;
}

/**
 * Get ads for email insertion
 * headerAd: Premium placement at top of email
 * nativeAd: Inline placement between stories in primary section
 */
export async function getEmailAds(
  supabase: SupabaseClient,
  primaryNeighborhoodId: string | null,
  allNeighborhoodIds: string[]
): Promise<EmailAdsResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';

  const { data: ads } = await supabase
    .from('ads')
    .select('id, image_url, headline, click_url, sponsor_label, is_global, neighborhood_id')
    .eq('status', 'active')
    .or(`is_global.eq.true,neighborhood_id.in.(${allNeighborhoodIds.join(',')})`)
    .order('created_at', { ascending: false });

  if (!ads || ads.length === 0) {
    return { headerAd: null, nativeAd: null };
  }

  const toEmailAd = (ad: typeof ads[0]): EmailAd => ({
    id: ad.id,
    imageUrl: ad.image_url,
    headline: ad.headline,
    clickUrl: ad.click_url,
    sponsorLabel: ad.sponsor_label || 'Sponsored',
    impressionUrl: `${appUrl}/api/ads/${ad.id}/impression?source=email`,
  });

  // Header ad: first matching ad
  const headerAd = toEmailAd(ads[0]);

  // Native ad: next matching ad, prefer primary neighborhood targeting
  let nativeAdRow = ads.find(
    (a, i) => i > 0 && a.neighborhood_id === primaryNeighborhoodId
  );
  if (!nativeAdRow && ads.length > 1) {
    nativeAdRow = ads[1];
  }

  const nativeAd = nativeAdRow ? toEmailAd(nativeAdRow) : null;

  return { headerAd, nativeAd };
}
