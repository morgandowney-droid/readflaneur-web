// ─── Ad Collections Configuration ───
// Luxury advertising packages with Passionfroot booking deep-links.
// Tier mapping aligns with PricingService wealth-density model.

export interface AdCollection {
  key: 'tier1' | 'tier2' | 'tier3' | 'sunday';
  name: string;
  tagline: string;
  price: number;
  unit: string;
  bookingUrl: string;
  description: string;
  exampleNeighborhoods: string[];
}

export const AD_COLLECTIONS: AdCollection[] = [
  {
    key: 'tier1',
    name: 'The Super-Prime Collection',
    tagline: 'Own the morning in the world\'s most concentrated wealth hubs.',
    price: 500,
    unit: '/day',
    bookingUrl: 'https://www.passionfroot.me/flaneur/packages/4eeb66b3-67f5-4096-a9fe-c2f27492d920/book',
    description: 'Exclusive placement in neighborhoods where net worth per square mile exceeds $1B. Your brand appears alongside coverage of landmark transactions, heritage preservation, and cultural institutions that define global luxury.',
    exampleNeighborhoods: ['Tribeca', 'Mayfair', 'Aspen (Peak)', 'Palm Beach', 'Nassim Hill'],
  },
  {
    key: 'tier2',
    name: 'The Metropolitan Collection',
    tagline: 'Reach the creative class in established cultural centers.',
    price: 200,
    unit: '/day',
    bookingUrl: 'https://www.passionfroot.me/flaneur/packages/ec925e7d-a539-4b43-aa75-3de4a6fbc085/book',
    description: 'Premium positioning in the world\'s most influential cultural neighborhoods. Your brand connects with tastemakers, gallery owners, and the professionals who shape urban living.',
    exampleNeighborhoods: ['Williamsburg', 'Shoreditch', 'Le Marais', 'Beverly Hills'],
  },
  {
    key: 'tier3',
    name: 'The Discovery Collection',
    tagline: 'Target emerging hubs and smart satellite cities.',
    price: 100,
    unit: '/day',
    bookingUrl: 'https://www.passionfroot.me/flaneur/packages/27c87140-5d5d-48f9-8048-b7ee0e05ce18/book',
    description: 'Strategic reach into neighborhoods on the rise. Early positioning in markets with accelerating wealth density and cultural momentum, from Cape Town\'s Atlantic Seaboard to Dublin\'s Dalkey coast.',
    exampleNeighborhoods: ['Cape Town', 'Vancouver', 'Dublin (Dalkey)'],
  },
  {
    key: 'sunday',
    name: 'The Sunday Edition',
    tagline: 'Own the most-read moment of the week.',
    price: 750,
    unit: '/week',
    bookingUrl: 'https://www.passionfroot.me/flaneur',
    description: 'Presenting Sponsor of the Sunday Edition — our curated weekly email with the highest open rates. Your brand appears as native content between The Rearview and The Horizon, reaching engaged readers during their Sunday morning ritual.',
    exampleNeighborhoods: ['All neighborhoods'],
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
