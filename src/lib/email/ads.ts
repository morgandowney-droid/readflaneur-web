/**
 * Ad selection for Daily Brief emails
 * Selects header and native ads from the ads table
 * Date-aware: only shows ads booked for today
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
 *
 * With exclusivity, one ad per neighborhood per day fills both slots.
 */
export async function getEmailAds(
  supabase: SupabaseClient,
  primaryNeighborhoodId: string | null,
  allNeighborhoodIds: string[]
): Promise<EmailAdsResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';
  const today = new Date().toISOString().split('T')[0];

  // First check for a paid ad booked for today targeting these neighborhoods
  const { data: paidAds } = await supabase
    .from('ads')
    .select('id, image_url, headline, click_url, sponsor_label, is_global, neighborhood_id')
    .eq('status', 'active')
    .lte('start_date', today)
    .gte('end_date', today)
    .or(`is_global.eq.true,is_global_takeover.eq.true,neighborhood_id.in.(${allNeighborhoodIds.join(',')})`)
    .order('is_global_takeover', { ascending: true }) // Prefer neighborhood-targeted over global
    .order('created_at', { ascending: false });

  if (!paidAds || paidAds.length === 0) {
    return { headerAd: null, nativeAd: null };
  }

  const toEmailAd = (ad: typeof paidAds[0]): EmailAd => ({
    id: ad.id,
    imageUrl: ad.image_url,
    headline: ad.headline,
    clickUrl: ad.click_url,
    sponsorLabel: ad.sponsor_label || 'Sponsored',
    impressionUrl: `${appUrl}/api/ads/${ad.id}/impression?source=email`,
  });

  // With exclusivity, the first matching ad fills both header and native
  const headerAd = toEmailAd(paidAds[0]);

  // Use second ad for native if available, otherwise reuse header ad
  const nativeAd = paidAds.length > 1 ? toEmailAd(paidAds[1]) : null;

  return { headerAd, nativeAd };
}
