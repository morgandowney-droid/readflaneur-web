/**
 * Ad selection for Daily Brief emails
 * Selects header and native ads from the ads table
 * Date-aware: only shows ads booked for today
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { EmailAd } from './types';
import { findDiscoveryBrief } from '@/lib/discover-neighborhood';

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
    // Fallback: show a house ad in the native slot
    const houseAd = await getHouseAd(supabase, appUrl, {
      subscribedIds: allNeighborhoodIds,
      primaryNeighborhoodId,
    });
    return { headerAd: null, nativeAd: houseAd };
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

/**
 * Fetch a random house ad from the database as a fallback
 * when no paid ads are booked for today.
 */
async function getHouseAd(
  supabase: SupabaseClient,
  appUrl: string,
  options?: { subscribedIds?: string[]; primaryNeighborhoodId?: string | null }
): Promise<EmailAd | null> {
  const { data: houseAds } = await supabase
    .from('house_ads')
    .select('id, image_url, headline, body, click_url, type')
    .eq('active', true)
    .neq('type', 'newsletter') // Email recipients are already subscribed
    .limit(10);

  if (!houseAds || houseAds.length === 0) {
    return null;
  }

  // Pick a random house ad
  const ad = houseAds[Math.floor(Math.random() * houseAds.length)];

  let clickUrl = ad.click_url || appUrl;

  // For "app_download" type, resolve a dynamic discovery brief URL
  if (ad.type === 'app_download' && options?.subscribedIds) {
    try {
      const result = await findDiscoveryBrief(
        supabase,
        options.subscribedIds,
        options.primaryNeighborhoodId ?? null
      );
      if (result) {
        clickUrl = `${appUrl}${result.url}`;
      }
    } catch {
      // Keep static fallback URL
    }
  }

  let body: string | undefined = ad.body || undefined;

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
    id: `house-${ad.id}`,
    imageUrl: ad.image_url || '',
    headline: ad.headline || '',
    body,
    clickUrl,
    sponsorLabel: 'Flaneur',
    impressionUrl: '',
  };
}
