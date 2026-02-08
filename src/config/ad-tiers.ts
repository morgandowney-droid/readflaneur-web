// ─── Ad Tier Configuration ───
// Wealth-density pricing model for neighborhood-targeted advertising.
// Seasonal markets dynamically shift between Tier 1 (peak) and Tier 3 (off-peak).

// ─── TIER 1: Global Super-Prime ───
export const TIER_1_IDS: string[] = [
  // NYC Core
  'nyc-tribeca',
  'nyc-upper-east-side',
  'nyc-west-village',
  'nyc-soho',
  // London Prime
  'london-mayfair',
  'london-kensington',
  'london-notting-hill',
  // Singapore Ultra-Wealth
  'singapore-nassim',
  'singapore-sentosa',
  // Greenwich (Hedge Fund Capital)
  'greenwich-backcountry',
];

// ─── TIER 2: The Establishment ───
export const TIER_2_IDS: string[] = [
  // NYC Secondary
  'nyc-williamsburg',
  // London Secondary
  'london-shoreditch',
  'london-hampstead',
  // Paris
  'paris-le-marais',
  'paris-saint-germain',
  // Stockholm
  'stockholm-ostermalm',
  // LA
  'la-beverly-hills',
  'la-bel-air',
];

// ─── Seasonal Markets (dynamic tier by date) ───
export interface SeasonalMarket {
  ids: string[];
  peakStart: { month: number; day: number };
  peakEnd: { month: number; day: number };
  peakTier: 1;
  offPeakTier: 3;
  label: string;
}

export const SEASONAL_MARKETS: SeasonalMarket[] = [
  {
    label: 'Winter Suns',
    ids: ['palm-beach-island', 'caribbean-stbarts', 'capetown-atlantic-seaboard'],
    peakStart: { month: 11, day: 1 },  // Nov 1
    peakEnd: { month: 4, day: 30 },    // Apr 30
    peakTier: 1,
    offPeakTier: 3,
  },
  {
    label: 'Ski & Snow',
    ids: ['us-aspen'], // TODO: add switzerland-st-moritz when neighborhood is created
    peakStart: { month: 12, day: 1 },  // Dec 1
    peakEnd: { month: 3, day: 31 },    // Mar 31
    peakTier: 1,
    offPeakTier: 3,
  },
  {
    label: 'Summer Socials',
    ids: ['us-hamptons', 'us-nantucket'], // TODO: add france-cotedazur when neighborhood is created
    peakStart: { month: 5, day: 15 },  // May 15
    peakEnd: { month: 9, day: 15 },    // Sep 15
    peakTier: 1,
    offPeakTier: 3,
  },
];

// ─── Flat Per-Day Rates by Tier (cents) ───
export const TIER_RATES = {
  1: { dailyBrief: 50000, sundayEdition: 75000 },   // $500 / $750
  2: { dailyBrief: 20000, sundayEdition: 30000 },   // $200 / $300
  3: { dailyBrief: 10000, sundayEdition: 15000 },   // $100 / $150
} as const;

// ─── Global Takeover Rates (cents) ───
export const GLOBAL_TAKEOVER_RATES = {
  dailyBrief: 1000000,     // $10,000
  sundayEdition: 1500000,  // $15,000
} as const;

// Everything not in TIER_1, TIER_2, or SEASONAL defaults to TIER 3
