import {
  TIER_1_IDS,
  TIER_2_IDS,
  SEASONAL_MARKETS,
  TIER_RATES,
  GLOBAL_TAKEOVER_RATES,
} from '@/config/ad-tiers';

export interface BookingPrice {
  priceCents: number;
  tier: 1 | 2 | 3;
  isGlobal: boolean;
  seasonalLabel?: string;
}

/** Check if a date falls within a peak season range (handles cross-year like Nov–Apr) */
function isInPeakSeason(
  date: Date,
  start: { month: number; day: number },
  end: { month: number; day: number }
): boolean {
  const m = date.getMonth() + 1; // 1-based
  const d = date.getDate();

  if (start.month <= end.month) {
    // Same-year range (e.g., May 15 – Sep 15)
    return (
      (m > start.month || (m === start.month && d >= start.day)) &&
      (m < end.month || (m === end.month && d <= end.day))
    );
  } else {
    // Cross-year range (e.g., Nov 1 – Apr 30)
    return (
      (m > start.month || (m === start.month && d >= start.day)) ||
      (m < end.month || (m === end.month && d <= end.day))
    );
  }
}

/** Resolve the effective tier for a neighborhood on a given date */
export function getTierForNeighborhood(
  neighborhoodId: string | null,
  targetDate: Date
): { tier: 1 | 2 | 3; seasonalLabel?: string } {
  // Global campaigns (no specific neighborhood) get Tier 1
  if (neighborhoodId === null) {
    return { tier: 1 };
  }

  // Check seasonal markets first — dynamic tier based on date
  for (const market of SEASONAL_MARKETS) {
    if (market.ids.includes(neighborhoodId)) {
      const inPeak = isInPeakSeason(targetDate, market.peakStart, market.peakEnd);
      return {
        tier: inPeak ? market.peakTier : market.offPeakTier,
        seasonalLabel: inPeak ? market.label : undefined,
      };
    }
  }

  // Static tier assignments
  if (TIER_1_IDS.includes(neighborhoodId)) {
    return { tier: 1 };
  }
  if (TIER_2_IDS.includes(neighborhoodId)) {
    return { tier: 2 };
  }

  // Default: Tier 3
  return { tier: 3 };
}

/**
 * Get the booking price for a neighborhood + placement type + date.
 * Price is always computed server-side — the client displays it but Stripe charges this amount.
 */
export function getBookingPrice(
  neighborhoodId: string | null,
  placementType: 'daily_brief' | 'sunday_edition',
  date: Date
): BookingPrice {
  // Global takeover
  if (neighborhoodId === null) {
    const globalPrice = placementType === 'sunday_edition'
      ? GLOBAL_TAKEOVER_RATES.sundayEdition
      : GLOBAL_TAKEOVER_RATES.dailyBrief;
    return {
      priceCents: globalPrice,
      tier: 1,
      isGlobal: true,
    };
  }

  const { tier, seasonalLabel } = getTierForNeighborhood(neighborhoodId, date);
  const rates = TIER_RATES[tier];
  const priceCents = placementType === 'sunday_edition' ? rates.sundayEdition : rates.dailyBrief;

  return {
    priceCents,
    tier,
    isGlobal: false,
    seasonalLabel,
  };
}
