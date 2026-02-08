// ─── Ad Tier Configuration ───
// Wealth-density pricing model for neighborhood-targeted advertising.
// Aligned with the Flaneur 200: superprime → Tier 1, metropolitan → Tier 2, discovery → Tier 3.
// Seasonal markets dynamically shift between Tier 1 (peak) and Tier 3 (off-peak).

// ─── TIER 1: Global Super-Prime ───
export const TIER_1_IDS: string[] = [
  // NYC Core
  'nyc-tribeca',
  'nyc-upper-east-side',
  'nyc-soho',
  'nyc-west-village',
  'nyc-dumbo',
  'nyc-brooklyn-heights',
  'nyc-greenwich-village',
  'nyc-chelsea',
  // The Hamptons
  'hamptons-sagaponack',
  'hamptons-east-hampton',
  // Connecticut
  'ct-greenwich',
  'greenwich-backcountry',
  // Boston
  'boston-beacon-hill',
  // Washington DC
  'dc-georgetown',
  // Florida
  'palm-beach-island',
  // Miami
  'miami-brickell',
  // Toronto
  'toronto-yorkville',
  // Los Angeles
  'la-beverly-hills',
  'la-bel-air',
  'la-malibu',
  // SF Bay Area
  'sf-pacific-heights',
  'ca-palo-alto',
  'ca-atherton',
  // Santa Barbara
  'santabarbara-montecito',
  // Vancouver
  'vancouver-west-vancouver',
  // Colorado & Wyoming
  'co-aspen',
  'wy-jackson-hole',
  // Mexico City
  'cdmx-lomas',
  // London Prime
  'london-mayfair',
  'london-kensington',
  'london-chelsea',
  'london-notting-hill',
  'london-belgravia',
  'london-knightsbridge',
  'london-holland-park',
  // Paris
  'paris-1st',
  'paris-8th',
  'paris-16th',
  'paris-saint-germain',
  // French Riviera & Alps
  'nice-cap-ferrat',
  'riviera-antibes',
  'riviera-cannes',
  'monaco-monaco',
  'alps-courchevel',
  // Amsterdam
  'amsterdam-grachtengordel',
  // Switzerland
  'zurich-zurichberg',
  'geneva-cologny',
  'swissalps-st-moritz',
  'swissalps-gstaad',
  // Milan
  'milan-brera',
  'milan-quadrilatero',
  // Italian Destinations
  'lombardy-lake-como',
  'liguria-portofino',
  'campania-capri',
  // Spain
  'madrid-salamanca',
  'barcelona-pedralbes',
  'ibiza-town',
  'marbella-golden-mile',
  // Portugal
  'alentejo-comporta',
  // Greece
  'athens-vouliagmeni',
  'mykonos-town',
  // Tokyo
  'tokyo-minato',
  'tokyo-ginza',
  'tokyo-aoyama',
  // Hong Kong
  'hk-the-peak',
  'hk-mid-levels',
  'hk-repulse-bay',
  // Singapore
  'singapore-nassim',
  'singapore-tanglin',
  'singapore-sentosa',
  // Seoul
  'seoul-gangnam',
  'seoul-hannam-dong',
  // Shanghai
  'shanghai-xintiandi',
  // Sydney
  'sydney-point-piper',
  'sydney-vaucluse',
  // Melbourne
  'melbourne-toorak',
  // Dubai
  'dubai-downtown',
  'dubai-palm-jumeirah',
  'dubai-al-barari',
  // Cape Town
  'capetown-camps-bay',
  'capetown-clifton',
  // Brazil
  'saopaulo-jardim-europa',
  'rio-leblon',
];

// ─── TIER 2: The Establishment ───
export const TIER_2_IDS: string[] = [
  // NYC
  'nyc-williamsburg',
  'nyc-nolita',
  // Hamptons
  'hamptons-montauk',
  // NY Suburbs
  'nyc-scarsdale',
  // Boston
  'boston-back-bay',
  'boston-seaport',
  // Washington DC
  'dc-kalorama',
  // Miami
  'miami-coconut-grove',
  'miami-design-district',
  'miami-south-beach',
  'miami-coral-gables',
  // Atlanta & Philadelphia
  'atlanta-buckhead',
  'philly-rittenhouse',
  // Toronto & Montreal
  'toronto-rosedale',
  'montreal-westmount',
  // Los Angeles
  'la-venice',
  'la-west-hollywood',
  'la-santa-monica',
  // San Francisco
  'sf-marina',
  // Vancouver
  'vancouver-kitsilano',
  // Chicago
  'chicago-gold-coast',
  'chicago-lincoln-park',
  // Texas
  'dallas-highland-park',
  'houston-river-oaks',
  // Colorado & Denver
  'co-vail',
  'denver-cherry-creek',
  // Seattle
  'seattle-south-lake-union',
  // Mexico City
  'cdmx-polanco',
  // London
  'london-marylebone',
  'london-hampstead',
  'london-shoreditch',
  'london-primrose-hill',
  'london-st-johns-wood',
  'london-soho',
  // Dublin
  'dublin-ballsbridge',
  // Paris
  'paris-le-marais',
  // Berlin
  'berlin-mitte',
  'berlin-charlottenburg',
  'berlin-prenzlauer-berg',
  'berlin-grunewald',
  // Munich & Hamburg
  'munich-bogenhausen',
  'munich-schwabing',
  'hamburg-harvestehude',
  // Stockholm
  'stockholm-ostermalm',
  'stockholm-djurgarden',
  'stockholm-vasastan',
  // Oslo
  'oslo-frogner',
  // Copenhagen
  'copenhagen-frederiksberg',
  // Amsterdam
  'amsterdam-oud-zuid',
  'amsterdam-de-pijp',
  // Brussels
  'brussels-ixelles',
  // Switzerland
  'zurich-seefeld',
  'geneva-eaux-vives',
  // Milan
  'milan-porta-nuova',
  // Rome
  'rome-parioli',
  'rome-centro-storico',
  // Madrid
  'madrid-chamberi',
  'madrid-justicia',
  // Barcelona
  'barcelona-eixample',
  // Spain
  'andalusia-sotogrande',
  // Lisbon
  'lisbon-principe-real',
  'lisbon-chiado',
  'lisbon-cascais',
  // Greece
  'athens-kolonaki',
  // Tokyo
  'tokyo-daikanyama',
  'tokyo-roppongi',
  // Singapore
  'singapore-orchard',
  // Shanghai & Beijing
  'shanghai-jingan',
  'shanghai-french-concession',
  'beijing-sanlitun',
  // Bangkok
  'bangkok-thong-lo',
  'bangkok-sathorn',
  // Jakarta
  'jakarta-menteng',
  // Sydney
  'sydney-double-bay',
  'sydney-bondi-beach',
  // Melbourne
  'melbourne-south-yarra',
  // Auckland
  'auckland-remuera',
  // Dubai
  'dubai-difc',
  'dubai-marina',
  // Middle East & Africa
  'riyadh-al-olaya',
  'telaviv-neve-tzedek',
  'telaviv-rothschild',
  'capetown-waterfront',
  'joburg-sandton',
  'cairo-zamalek',
  // South America
  'saopaulo-itaim-bibi',
  'rio-ipanema',
  'buenosaires-recoleta',
  'buenosaires-puerto-madero',
  'santiago-vitacura',
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
    ids: ['palm-beach-island', 'capetown-camps-bay', 'capetown-clifton'],
    peakStart: { month: 11, day: 1 },  // Nov 1
    peakEnd: { month: 4, day: 30 },    // Apr 30
    peakTier: 1,
    offPeakTier: 3,
  },
  {
    label: 'Ski & Snow',
    ids: ['co-aspen', 'swissalps-st-moritz', 'swissalps-gstaad', 'alps-courchevel', 'hokkaido-niseko'],
    peakStart: { month: 12, day: 1 },  // Dec 1
    peakEnd: { month: 3, day: 31 },    // Mar 31
    peakTier: 1,
    offPeakTier: 3,
  },
  {
    label: 'Summer Socials',
    ids: ['hamptons-sagaponack', 'hamptons-east-hampton', 'hamptons-montauk', 'mykonos-town', 'ibiza-town'],
    peakStart: { month: 5, day: 15 },  // May 15
    peakEnd: { month: 9, day: 15 },    // Sep 15
    peakTier: 1,
    offPeakTier: 3,
  },
  {
    label: 'Riviera Season',
    ids: ['nice-cap-ferrat', 'riviera-antibes', 'riviera-cannes', 'monaco-monaco', 'liguria-portofino', 'campania-capri'],
    peakStart: { month: 5, day: 1 },   // May 1
    peakEnd: { month: 9, day: 30 },    // Sep 30
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
