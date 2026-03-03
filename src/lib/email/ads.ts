/**
 * Ad selection for Daily Brief emails
 * Selects header and native ads from the ads table
 * Date-aware: only shows ads booked for today
 * House ads rotate deterministically per recipient per day
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { EmailAd } from './types';
import { findDiscoveryBrief } from '@/lib/discover-neighborhood';

interface EmailAdsResult {
  headerAd: EmailAd | null;
  nativeAd: EmailAd | null;
}

/**
 * Simple deterministic hash for rotation seeding.
 * Combines date + recipientId so each person gets a different ad each day.
 */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
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
  allNeighborhoodIds: string[],
  recipientId?: string
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
      recipientId,
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
 * Fetch a house ad with deterministic rotation per recipient per day.
 * Uses weight column for weighted selection and djb2 hash of
 * (date + recipientId) so each person sees a different ad each day.
 */
async function getHouseAd(
  supabase: SupabaseClient,
  appUrl: string,
  options?: { subscribedIds?: string[]; primaryNeighborhoodId?: string | null; recipientId?: string }
): Promise<EmailAd | null> {
  const { data: houseAds } = await supabase
    .from('house_ads')
    .select('id, image_url, headline, body, click_url, type, weight')
    .eq('active', true)
    .neq('type', 'newsletter') // Email recipients are already subscribed
    .neq('type', 'family_corner') // Family Corner promoted via in-email section, not house ad
    .order('id') // Stable ordering for deterministic rotation
    .limit(20);

  if (!houseAds || houseAds.length === 0) {
    return null;
  }

  // Build weighted pool: each ad appears (weight) times
  const weightedPool: typeof houseAds = [];
  for (const ha of houseAds) {
    const w = Math.max(1, ha.weight || 1);
    for (let i = 0; i < w; i++) {
      weightedPool.push(ha);
    }
  }

  // Deterministic rotation: hash(date + recipientId) picks the index
  // Different recipients get different ads on the same day;
  // same recipient gets a different ad each day
  const today = new Date().toISOString().split('T')[0];
  const seed = djb2Hash(`${today}:${options?.recipientId || 'anon'}`);
  const ad = weightedPool[seed % weightedPool.length];

  let clickUrl = ad.click_url || appUrl;

  // For "app_download" types, resolve a dynamic discovery brief URL
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
    ctaText: undefined,
  };
}
