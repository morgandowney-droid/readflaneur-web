/**
 * Art Fair Season Configuration
 *
 * Static calendar of major global art fairs with fixed dates.
 * Unlike scraping-based services, fair dates are known months in advance.
 *
 * The "Big 5" global art fairs that warrant special coverage:
 * - Frieze London (October)
 * - Art Basel Miami Beach (December)
 * - Frieze Los Angeles (February)
 * - Art Basel Hong Kong (March)
 * - Art Basel Paris (October)
 */

/**
 * Art Fair definition
 */
export interface ArtFair {
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  month: number; // 1-12
  approxWeek: number; // 1-4 (which week of the month)
  durationDays: number; // Typical fair duration
  targetFeeds: string[]; // Neighborhood IDs to blast
  vibe: string; // Context for AI generation
  venue: string; // Physical location
  website: string;
  tier: 'flagship' | 'major' | 'satellite';
}

/**
 * Fair coverage state
 */
export type FairState = 'Preview' | 'Live' | 'Wrap' | 'Dormant';

/**
 * The Big 5 Global Art Fairs
 */
export const ART_FAIRS: ArtFair[] = [
  // ─────────────────────────────────────────────────────────────
  // FRIEZE LONDON - October
  // ─────────────────────────────────────────────────────────────
  {
    id: 'frieze-london',
    name: 'Frieze London',
    shortName: 'Frieze',
    city: 'London',
    country: 'UK',
    month: 10, // October
    approxWeek: 2, // 2nd week
    durationDays: 5,
    targetFeeds: [
      'london-mayfair',
      'london-marylebone',
      'london-chelsea',
      'london-notting-hill',
      'london-kensington',
      'london-hampstead',
    ],
    vibe: `Regent's Park tents, heavy rain, celebrity spotting, VIP preview passes. The British art establishment mingles with international collectors. Gallery dinners at Sketch and The Wolseley. Cork Street buzzes with satellite shows.`,
    venue: "Regent's Park",
    website: 'https://www.frieze.com/fairs/frieze-london',
    tier: 'flagship',
  },

  // ─────────────────────────────────────────────────────────────
  // ART BASEL MIAMI BEACH - December
  // ─────────────────────────────────────────────────────────────
  {
    id: 'art-basel-miami',
    name: 'Art Basel Miami Beach',
    shortName: 'Basel Miami',
    city: 'Miami',
    country: 'USA',
    month: 12, // December
    approxWeek: 1, // 1st week (always first week of December)
    durationDays: 4,
    targetFeeds: [
      // Miami feeds
      'miami-south-beach',
      'miami-brickell',
      'miami-coconut-grove',
      'miami-coral-gables',
      'miami-design-district',
      'miami-wynwood',
      // NYC feeds (everyone flies down)
      'tribeca',
      'soho',
      'west-village',
      'chelsea',
      'upper-east-side',
      // LA feeds
      'la-beverly-hills',
      'la-west-hollywood',
    ],
    vibe: `Traffic jams on the causeway, Convention Center chaos, afterparties at The W and Faena. Design District pop-ups. Rubell Collection pilgrimages. Mega-yacht parties at Island Gardens. The annual NYC-to-Miami migration.`,
    venue: 'Miami Beach Convention Center',
    website: 'https://www.artbasel.com/miami-beach',
    tier: 'flagship',
  },

  // ─────────────────────────────────────────────────────────────
  // FRIEZE LOS ANGELES - February
  // ─────────────────────────────────────────────────────────────
  {
    id: 'frieze-los-angeles',
    name: 'Frieze Los Angeles',
    shortName: 'Frieze LA',
    city: 'Los Angeles',
    country: 'USA',
    month: 2, // February
    approxWeek: 3, // 3rd week
    durationDays: 4,
    targetFeeds: [
      'la-santa-monica',
      'la-beverly-hills',
      'la-west-hollywood',
      'la-brentwood',
      'la-bel-air',
      'la-venice',
    ],
    vibe: `Santa Monica Airport Hangar vibes. Hollywood agents vs. collectors. Celebrity sightings at the VIP lounge. Gallery brunches in West Hollywood. The intersection of entertainment and high culture.`,
    venue: 'Santa Monica Airport',
    website: 'https://www.frieze.com/fairs/frieze-los-angeles',
    tier: 'flagship',
  },

  // ─────────────────────────────────────────────────────────────
  // ART BASEL HONG KONG - March
  // ─────────────────────────────────────────────────────────────
  {
    id: 'art-basel-hong-kong',
    name: 'Art Basel Hong Kong',
    shortName: 'Basel HK',
    city: 'Hong Kong',
    country: 'China',
    month: 3, // March
    approxWeek: 4, // 4th week (typically late March)
    durationDays: 4,
    targetFeeds: [
      'hong-kong-central',
      'hong-kong-soho',
      'hong-kong-the-peak',
    ],
    vibe: `Convention Centre massive scale. Asian blue-chip market in full force. Mainland Chinese collectors. Private museum dinners. The gateway to the Asian art market. M+ museum as the new cultural anchor.`,
    venue: 'Hong Kong Convention and Exhibition Centre',
    website: 'https://www.artbasel.com/hong-kong',
    tier: 'flagship',
  },

  // ─────────────────────────────────────────────────────────────
  // ART BASEL PARIS - October
  // ─────────────────────────────────────────────────────────────
  {
    id: 'art-basel-paris',
    name: 'Art Basel Paris',
    shortName: 'Basel Paris',
    city: 'Paris',
    country: 'France',
    month: 10, // October
    approxWeek: 3, // 3rd week
    durationDays: 4,
    targetFeeds: [
      'paris-7th-arr',
      'paris-le-marais',
      'paris-saint-germain',
      'paris-16th-arr',
    ],
    vibe: `Grand Palais splendor. Chic, intellectual, the new center of the art world. FIAC's successor with Basel's prestige. Rive Gauche gallery walks. Dinners at Lipp and Café de Flore.`,
    venue: 'Grand Palais',
    website: 'https://www.artbasel.com/paris',
    tier: 'flagship',
  },
];

/**
 * Satellite fairs that coincide with flagships
 * These get lighter coverage but are mentioned in context
 */
export const SATELLITE_FAIRS: ArtFair[] = [
  {
    id: 'frieze-masters',
    name: 'Frieze Masters',
    shortName: 'Masters',
    city: 'London',
    country: 'UK',
    month: 10,
    approxWeek: 2,
    durationDays: 5,
    targetFeeds: ['london-mayfair', 'london-chelsea'],
    vibe: `The sophisticated sibling. Old Masters and historical works. A more refined crowd.`,
    venue: "Regent's Park",
    website: 'https://www.frieze.com/fairs/frieze-masters',
    tier: 'satellite',
  },
  {
    id: 'nada-miami',
    name: 'NADA Miami',
    shortName: 'NADA',
    city: 'Miami',
    country: 'USA',
    month: 12,
    approxWeek: 1,
    durationDays: 4,
    targetFeeds: ['miami-wynwood', 'miami-design-district'],
    vibe: `The emerging galleries. Ice Palace Studios. Where the next generation is discovered.`,
    venue: 'Ice Palace Studios',
    website: 'https://www.newartdealers.org/programs/nada-miami',
    tier: 'satellite',
  },
  {
    id: 'untitled-miami',
    name: 'Untitled Miami Beach',
    shortName: 'Untitled',
    city: 'Miami',
    country: 'USA',
    month: 12,
    approxWeek: 1,
    durationDays: 4,
    targetFeeds: ['miami-south-beach'],
    vibe: `On the beach. Literally on the sand. The most Instagram-friendly fair.`,
    venue: 'Ocean Drive Beach',
    website: 'https://untitledartfairs.com/',
    tier: 'satellite',
  },
];

/**
 * All fairs combined
 */
export const ALL_FAIRS = [...ART_FAIRS, ...SATELLITE_FAIRS];

/**
 * Get all target feeds across all flagship fairs
 */
export const ALL_FAIR_TARGET_FEEDS = [
  ...new Set(ART_FAIRS.flatMap((fair) => fair.targetFeeds)),
];

/**
 * Get fairs by month
 */
export function getFairsByMonth(month: number): ArtFair[] {
  return ALL_FAIRS.filter((fair) => fair.month === month);
}

/**
 * Get flagship fairs only
 */
export function getFlagshipFairs(): ArtFair[] {
  return ALL_FAIRS.filter((fair) => fair.tier === 'flagship');
}

/**
 * Get fairs by city
 */
export function getFairsByCity(city: string): ArtFair[] {
  return ALL_FAIRS.filter(
    (fair) => fair.city.toLowerCase() === city.toLowerCase()
  );
}

/**
 * Calculate approximate fair dates for a given year
 */
export function getFairDatesForYear(
  fair: ArtFair,
  year: number
): { start: Date; end: Date; previewStart: Date } {
  // Calculate the start date based on month and week
  const firstOfMonth = new Date(year, fair.month - 1, 1);
  const dayOfWeek = firstOfMonth.getDay();

  // Find the first day of the target week
  // Week 1 = days 1-7, Week 2 = days 8-14, etc.
  const weekStartDay = (fair.approxWeek - 1) * 7 + 1;

  // Adjust to start on Wednesday (common fair opening day)
  // Most fairs run Wed-Sun or Thu-Sun
  let startDay = weekStartDay + 2; // +2 for Wednesday

  // Ensure we don't exceed month bounds
  const daysInMonth = new Date(year, fair.month, 0).getDate();
  if (startDay > daysInMonth) {
    startDay = daysInMonth - fair.durationDays;
  }

  const start = new Date(year, fair.month - 1, startDay);
  const end = new Date(start.getTime() + (fair.durationDays - 1) * 24 * 60 * 60 * 1000);
  const previewStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);

  return { start, end, previewStart };
}

/**
 * Determine the current state of a fair
 */
export function getFairState(fair: ArtFair, currentDate: Date = new Date()): FairState {
  const year = currentDate.getFullYear();
  const { start, end, previewStart } = getFairDatesForYear(fair, year);

  // Also check previous year's December fairs if we're in early January
  // and next year's January/February fairs if we're in late December
  const checkDates = [
    getFairDatesForYear(fair, year),
    getFairDatesForYear(fair, year - 1),
    getFairDatesForYear(fair, year + 1),
  ];

  for (const dates of checkDates) {
    const { start: s, end: e, previewStart: p } = dates;

    // Check if we're in the live period
    if (currentDate >= s && currentDate <= e) {
      return 'Live';
    }

    // Check if we're in the preview period (7 days before)
    if (currentDate >= p && currentDate < s) {
      return 'Preview';
    }

    // Check if we're in the wrap period (3 days after)
    const wrapEnd = new Date(e.getTime() + 3 * 24 * 60 * 60 * 1000);
    if (currentDate > e && currentDate <= wrapEnd) {
      return 'Wrap';
    }
  }

  return 'Dormant';
}

/**
 * Get all active fairs (Preview, Live, or Wrap state)
 */
export function getActiveFairs(currentDate: Date = new Date()): Array<{
  fair: ArtFair;
  state: FairState;
  dates: { start: Date; end: Date; previewStart: Date };
}> {
  const activeFairs: Array<{
    fair: ArtFair;
    state: FairState;
    dates: { start: Date; end: Date; previewStart: Date };
  }> = [];

  for (const fair of ALL_FAIRS) {
    const state = getFairState(fair, currentDate);
    if (state !== 'Dormant') {
      const year = currentDate.getFullYear();
      // Try current year first, then adjacent years
      let dates = getFairDatesForYear(fair, year);

      // If the state doesn't match with current year dates, try adjacent years
      if (getFairState(fair, currentDate) !== state) {
        const prevYearDates = getFairDatesForYear(fair, year - 1);
        const nextYearDates = getFairDatesForYear(fair, year + 1);

        // Check which year's dates are actually active
        const now = currentDate.getTime();
        if (now >= prevYearDates.previewStart.getTime() - 7 * 24 * 60 * 60 * 1000 &&
            now <= prevYearDates.end.getTime() + 3 * 24 * 60 * 60 * 1000) {
          dates = prevYearDates;
        } else if (now >= nextYearDates.previewStart.getTime() &&
                   now <= nextYearDates.end.getTime() + 3 * 24 * 60 * 60 * 1000) {
          dates = nextYearDates;
        }
      }

      activeFairs.push({ fair, state, dates });
    }
  }

  // Sort by tier (flagship first) then by state (Live > Preview > Wrap)
  const stateOrder: Record<FairState, number> = {
    Live: 0,
    Preview: 1,
    Wrap: 2,
    Dormant: 3,
  };

  activeFairs.sort((a, b) => {
    if (a.fair.tier !== b.fair.tier) {
      return a.fair.tier === 'flagship' ? -1 : 1;
    }
    return stateOrder[a.state] - stateOrder[b.state];
  });

  return activeFairs;
}
