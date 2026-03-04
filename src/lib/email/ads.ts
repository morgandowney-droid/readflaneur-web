/**
 * Ad selection for Daily Brief emails
 * Selects header, native, and interstitial ads from the ads table
 * Date-aware: only shows ads booked for today
 * Paid ads and house ads rotate deterministically per recipient per day
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { EmailAd } from './types';
import { findDiscoveryBrief } from '@/lib/discover-neighborhood';

interface EmailAdsResult {
  headerAd: EmailAd | null;
  nativeAd: EmailAd | null;
  interstitialAds: EmailAd[];
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
 * interstitialAds: Placed between satellite sections (every 3rd)
 *
 * Paid ads rotate deterministically per recipient per day via djb2Hash.
 * House ads fall back with weighted rotation when no paid ads are booked.
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
    .order('id'); // Stable ordering for deterministic rotation

  if (!paidAds || paidAds.length === 0) {
    // Fallback: house ads for native + interstitial slots
    const houseAds = await getHouseAds(supabase, appUrl, 4, {
      subscribedIds: allNeighborhoodIds,
      primaryNeighborhoodId,
      recipientId,
    });
    return {
      headerAd: null,
      nativeAd: houseAds[0] || null,
      interstitialAds: houseAds.slice(1),
    };
  }

  const toEmailAd = (ad: typeof paidAds[0]): EmailAd => ({
    id: ad.id,
    imageUrl: ad.image_url,
    headline: ad.headline,
    clickUrl: ad.click_url,
    sponsorLabel: ad.sponsor_label || 'Sponsored',
    impressionUrl: `${appUrl}/api/ads/${ad.id}/impression?source=email`,
  });

  // Deterministic rotation: hash(date + recipientId) rotates the start index
  // so different recipients see different ads each day
  const seed = djb2Hash(`${today}:${recipientId || 'anon'}`);
  const startIdx = seed % paidAds.length;
  const rotated: typeof paidAds = [];
  for (let i = 0; i < paidAds.length; i++) {
    rotated.push(paidAds[(startIdx + i) % paidAds.length]);
  }

  const headerAd = toEmailAd(rotated[0]);
  const nativeAd = rotated.length > 1 ? toEmailAd(rotated[1]) : null;
  const interstitialAds = rotated.slice(2).map(toEmailAd);

  return { headerAd, nativeAd, interstitialAds };
}

/**
 * Fetch multiple unique house ads with deterministic rotation per recipient per day.
 * Uses weight column for weighted selection and djb2 hash with slot offset
 * so each slot gets a different ad while remaining deterministic.
 */
async function getHouseAds(
  supabase: SupabaseClient,
  appUrl: string,
  count: number,
  options?: { subscribedIds?: string[]; primaryNeighborhoodId?: string | null; recipientId?: string }
): Promise<EmailAd[]> {
  const { data: houseAds } = await supabase
    .from('house_ads')
    .select('id, image_url, headline, body, click_url, type, weight')
    .eq('active', true)
    .neq('type', 'newsletter') // Email recipients are already subscribed
    .neq('type', 'family_corner') // Family Corner promoted via in-email section, not house ad
    .order('id') // Stable ordering for deterministic rotation
    .limit(20);

  if (!houseAds || houseAds.length === 0) {
    return [];
  }

  // Build weighted pool: each ad appears (weight) times
  const weightedPool: typeof houseAds = [];
  for (const ha of houseAds) {
    const w = Math.max(1, ha.weight || 1);
    for (let i = 0; i < w; i++) {
      weightedPool.push(ha);
    }
  }

  const today = new Date().toISOString().split('T')[0];
  const results: EmailAd[] = [];
  const usedAdIds = new Set<number>();
  let neighborhoodCount: number | null = null;

  for (let slot = 0; slot < count && usedAdIds.size < houseAds.length; slot++) {
    // Each slot uses a different hash seed for variety
    const seed = djb2Hash(`${today}:${options?.recipientId || 'anon'}:${slot}`);

    // Find a unique ad from pool (skip already-used ads)
    let ad = weightedPool[seed % weightedPool.length];
    let attempts = 0;
    while (usedAdIds.has(ad.id) && attempts < weightedPool.length) {
      ad = weightedPool[(seed + attempts + 1) % weightedPool.length];
      attempts++;
    }
    if (usedAdIds.has(ad.id)) break; // Exhausted unique ads
    usedAdIds.add(ad.id);

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

    // Resolve {{neighborhood_count}} placeholder with live count (cached across slots)
    if (body && body.includes('{{neighborhood_count}}')) {
      if (neighborhoodCount === null) {
        const { count: c } = await supabase
          .from('neighborhoods')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('is_combo', false);
        neighborhoodCount = c || 270;
      }
      body = body.replace(/\{\{neighborhood_count\}\}/g, String(neighborhoodCount));
    }

    results.push({
      id: `house-${ad.id}`,
      imageUrl: ad.image_url || '',
      headline: ad.headline || '',
      body,
      clickUrl,
      sponsorLabel: 'Flaneur',
      impressionUrl: '',
      ctaText: undefined,
    });
  }

  return results;
}
