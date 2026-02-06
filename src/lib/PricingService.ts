import {
  TIER_1_IDS,
  TIER_2_IDS,
  SEASONAL_MARKETS,
  TIER_RATES,
} from '@/config/ad-tiers';

export interface PriceQuote {
  tier: 1 | 2 | 3;
  baseCpm: number;
  baseEmailRate: number;
  multiplier: number;
  reason: 'standard' | 'surge' | 'fire_sale';
  finalCpm: number;
  finalEmailRate: number;
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

/** Calculate surge/fire-sale multiplier based on date */
export function calculateRate(
  startDate: Date
): { multiplier: number; reason: 'standard' | 'surge' | 'fire_sale' } {
  const m = startDate.getMonth() + 1;
  const d = startDate.getDate();

  // Holiday surge: Nov 15 – Dec 25
  if (
    (m === 11 && d >= 15) ||
    (m === 12 && d <= 25)
  ) {
    return { multiplier: 1.5, reason: 'surge' };
  }

  return { multiplier: 1.0, reason: 'standard' };
}

/** Full quote: tier resolution + rate calculation */
export function getQuote(
  neighborhoodId: string | null,
  targetDate: Date
): PriceQuote {
  const { tier, seasonalLabel } = getTierForNeighborhood(neighborhoodId, targetDate);
  const rates = TIER_RATES[tier];
  const { multiplier, reason } = calculateRate(targetDate);

  return {
    tier,
    baseCpm: rates.cpm,
    baseEmailRate: rates.emailRate,
    multiplier,
    reason,
    finalCpm: Math.round(rates.cpm * multiplier * 100) / 100,
    finalEmailRate: Math.round(rates.emailRate * multiplier * 100) / 100,
    seasonalLabel,
  };
}
