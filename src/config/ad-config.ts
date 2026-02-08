// ─── Ad Collections Configuration ───
// Luxury advertising packages with native booking flow.
// Tier mapping aligns with PricingService wealth-density model.

export interface AdCollection {
  key: 'tier1' | 'tier2' | 'tier3';
  name: string;
  tagline: string;
  dailyPrice: number;     // $ per day (Daily Brief)
  sundayPrice: number;    // $ per Sunday Edition
  description: string;
  exampleNeighborhoods: string[];
}

export const AD_COLLECTIONS: AdCollection[] = [
  {
    key: 'tier1',
    name: 'The Super-Prime Collection',
    tagline: 'Own the morning in the world\'s most concentrated wealth hubs.',
    dailyPrice: 500,
    sundayPrice: 750,
    description: 'Exclusive placement in neighborhoods where net worth per square mile exceeds $1B. Your brand appears alongside coverage of landmark transactions, heritage preservation, and cultural institutions that define global luxury.',
    exampleNeighborhoods: ['Tribeca', 'Mayfair', 'Aspen (Peak)', 'Palm Beach', 'Nassim Hill'],
  },
  {
    key: 'tier2',
    name: 'The Metropolitan Collection',
    tagline: 'Reach the creative class in established cultural centers.',
    dailyPrice: 200,
    sundayPrice: 300,
    description: 'Premium positioning in the world\'s most influential cultural neighborhoods. Your brand connects with tastemakers, gallery owners, and the professionals who shape urban living.',
    exampleNeighborhoods: ['Williamsburg', 'Shoreditch', 'Le Marais', 'Beverly Hills'],
  },
  {
    key: 'tier3',
    name: 'The Discovery Collection',
    tagline: 'Target emerging hubs and smart satellite cities.',
    dailyPrice: 100,
    sundayPrice: 150,
    description: 'Strategic reach into neighborhoods on the rise. Early positioning in markets with accelerating wealth density and cultural momentum, from Cape Town\'s Atlantic Seaboard to Dublin\'s Dalkey coast.',
    exampleNeighborhoods: ['Cape Town', 'Vancouver', 'Dublin (Dalkey)'],
  },
];

export function getCollectionByTier(tier: 1 | 2 | 3): AdCollection {
  const map: Record<number, AdCollection> = {
    1: AD_COLLECTIONS[0],
    2: AD_COLLECTIONS[1],
    3: AD_COLLECTIONS[2],
  };
  return map[tier];
}
