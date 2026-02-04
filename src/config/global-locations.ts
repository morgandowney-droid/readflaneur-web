/**
 * Global Locations Configuration
 *
 * Geofence configuration for international markets.
 * Each city has coverage zones mapped to Flâneur neighborhoods.
 */

import { CityConfig, CityVocabulary } from '@/lib/adapters/types';

/**
 * City vocabularies for AI content generation
 */
export const CITY_VOCABULARIES: Record<string, CityVocabulary> = {
  London: {
    permitTerms: [
      'Planning Permission',
      'Planning Application',
      'Grade II Listed',
      'Grade I Listed',
      'Conservation Area',
      'Basement excavation',
      'Subterranean development',
      'Change of use',
      'Listed Building Consent',
    ],
    liquorTerms: [
      'Premises Licence',
      'Licensing Sub-Committee',
      'Late night refreshment',
      'Alcohol on/off sales',
      'Members club',
    ],
    realEstateTerms: [
      'Freehold',
      'Leasehold',
      'Mansion flat',
      'Mews house',
      'Garden square',
      'Period property',
      'Double fronted',
      'Lateral flat',
    ],
    localPhrases: [
      'prime central London',
      'the Royal Borough',
      'village feel',
      'garden square',
    ],
    currencySymbol: '£',
    currencyName: 'pounds',
  },

  Sydney: {
    permitTerms: [
      'Development Application',
      'DA Approved',
      'DA Lodged',
      'Complying Development',
      'State Significant Development',
      'Heritage listed',
      'Waterfront setback',
    ],
    liquorTerms: [
      'Liquor Licence',
      'On-premises licence',
      'Small bar licence',
      'Restaurant licence',
      'Club licence',
    ],
    realEstateTerms: [
      'Harbour frontage',
      'Water views',
      'Dress circle',
      'Prestige',
      'Trophy home',
      'Sandstone',
      'Federation',
    ],
    localPhrases: [
      'Eastern Suburbs',
      'Lower North Shore',
      'harbour views',
      'dress circle position',
    ],
    currencySymbol: '$',
    currencyName: 'AUD',
  },

  Chicago: {
    permitTerms: [
      'Building Permit',
      'Zoning Variance',
      'Landmark Designation',
      'Historic Preservation',
      'PD Amendment',
    ],
    liquorTerms: [
      'Liquor License',
      'Consumption on Premises',
      'Tavern License',
      'Package Goods',
      'Late Hour',
    ],
    realEstateTerms: [
      'Brownstone',
      'Greystone',
      'Vintage',
      'Pre-war',
      'Lakefront',
      'Gold Coast',
    ],
    localPhrases: [
      'the Mag Mile',
      'Lake Shore Drive',
      'the Loop',
      'Old Town',
    ],
    currencySymbol: '$',
    currencyName: 'dollars',
  },

  'Los Angeles': {
    permitTerms: [
      'Building Permit',
      'Coastal Development Permit',
      'Historic-Cultural Monument',
      'Hillside Ordinance',
      'Baseline Mansionization',
    ],
    liquorTerms: [
      'ABC License',
      'Type 47',
      'Type 48',
      'Entertainment Permit',
      'Conditional Use Permit',
    ],
    realEstateTerms: [
      'Compound',
      'Estate',
      'Canyon',
      'Beachfront',
      'Bird Streets',
      'Flats',
      'Hills',
    ],
    localPhrases: [
      'the Westside',
      'the Palisades',
      'PCH',
      'the Bird Streets',
      'Billionaire\'s Row',
    ],
    currencySymbol: '$',
    currencyName: 'dollars',
  },

  'Washington DC': {
    permitTerms: [
      'Building Permit',
      'Historic Preservation',
      'HPRB Approval',
      'Zoning Commission',
      'PUD Application',
    ],
    liquorTerms: [
      'ABC License',
      'Retailer\'s License',
      'Tavern License',
      'Restaurant License',
      'Settlement Agreement',
    ],
    realEstateTerms: [
      'Row house',
      'Townhome',
      'Embassy Row',
      'Federal style',
      'Georgetown Colonial',
    ],
    localPhrases: [
      'the Hill',
      'Dupont Circle',
      'Embassy Row',
      'Kalorama',
      'the District',
    ],
    currencySymbol: '$',
    currencyName: 'dollars',
  },
};

/**
 * Global city configurations
 */
export const GLOBAL_CITY_CONFIG: Record<string, CityConfig> = {
  // --- LONDON (Borough Based) ---
  London: {
    city: 'London',
    country: 'UK',
    adapter: 'LondonAdapter',
    currency: 'GBP',
    zones: [
      {
        name: 'Mayfair',
        neighborhoodId: 'mayfair',
        tone: 'Aristocratic wealth, hedge funds, blue-chip galleries, and private members clubs',
        zoneCode: 'Westminster',
        postalCodes: ['W1J', 'W1K', 'W1S'],
      },
      {
        name: 'Chelsea',
        neighborhoodId: 'chelsea',
        tone: 'Old money, family offices, King\'s Road fashion, and garden squares',
        zoneCode: 'Kensington and Chelsea',
        postalCodes: ['SW3', 'SW10'],
      },
      {
        name: 'Kensington',
        neighborhoodId: 'kensington',
        tone: 'Embassy belt, museum quarter, mansion flats, and international wealth',
        zoneCode: 'Kensington and Chelsea',
        postalCodes: ['W8', 'W14'],
      },
      {
        name: 'Notting Hill',
        neighborhoodId: 'notting-hill',
        tone: 'Celebrity enclaves, media elite, bohemian heritage, and pastel townhouses',
        zoneCode: 'Kensington and Chelsea',
        altCodes: ['Westminster'],
        postalCodes: ['W11', 'W2'],
      },
      {
        name: 'Belgravia',
        neighborhoodId: 'belgravia',
        tone: 'Ultra-prime, embassy grandeur, stucco terraces, and garden squares',
        zoneCode: 'Westminster',
        postalCodes: ['SW1X', 'SW1W'],
      },
    ],
    endpoints: {
      permits: 'https://planning.westminster.gov.uk/api/',
      safety: 'https://data.police.uk/api/',
    },
  },

  // --- SYDNEY (LGA Based) ---
  Sydney: {
    city: 'Sydney',
    country: 'Australia',
    adapter: 'SydneyAdapter',
    currency: 'AUD',
    zones: [
      {
        name: 'Double Bay',
        neighborhoodId: 'double-bay',
        tone: 'Old money harbor views, European cafes, and trophy homes',
        zoneCode: 'Woollahra',
        postalCodes: ['2028'],
      },
      {
        name: 'Woollahra',
        neighborhoodId: 'woollahra',
        tone: 'Antique dealers, gallery scene, and heritage mansions',
        zoneCode: 'Woollahra',
        postalCodes: ['2025'],
      },
      {
        name: 'Mosman',
        neighborhoodId: 'mosman',
        tone: 'Privacy, waterfront estates, and harbor beaches',
        zoneCode: 'Mosman',
        postalCodes: ['2088'],
      },
      {
        name: 'Paddington',
        neighborhoodId: 'paddington-sydney',
        tone: 'Victorian terraces, boutique shopping, and creative industries',
        zoneCode: 'Woollahra',
        altCodes: ['City of Sydney'],
        postalCodes: ['2021'],
      },
    ],
    endpoints: {
      permits: 'https://api.apps1.nsw.gov.au/eplanning/data/v0/',
      liquor: 'https://www.liquorandgaming.nsw.gov.au/',
      safety: 'https://www.bocsar.nsw.gov.au/',
    },
  },

  // --- CHICAGO (Community Area Based) ---
  Chicago: {
    city: 'Chicago',
    country: 'USA',
    adapter: 'ChicagoAdapter',
    currency: 'USD',
    zones: [
      {
        name: 'Gold Coast',
        neighborhoodId: 'gold-coast',
        tone: 'Historic wealth, lakefront grandeur, and vintage luxury',
        zoneCode: '08',
        postalCodes: ['60610', '60611'],
      },
      {
        name: 'Lincoln Park',
        neighborhoodId: 'lincoln-park',
        tone: 'Affluent families, green space, and brownstone elegance',
        zoneCode: '07',
        postalCodes: ['60614', '60625'],
      },
      {
        name: 'River North',
        neighborhoodId: 'river-north',
        tone: 'Gallery district, nightlife, and loft conversions',
        zoneCode: '08',
        altCodes: ['32'],
        postalCodes: ['60654', '60610'],
      },
      {
        name: 'Streeterville',
        neighborhoodId: 'streeterville',
        tone: 'Lakefront high-rises, Mag Mile adjacent, and luxury condos',
        zoneCode: '08',
        postalCodes: ['60611'],
      },
    ],
    endpoints: {
      permits: 'https://data.cityofchicago.org/resource/ydr8-5enu.json',
      liquor: 'https://data.cityofchicago.org/resource/r5kz-chrr.json',
      safety: 'https://data.cityofchicago.org/resource/ijzp-q8t2.json',
    },
  },

  // --- LOS ANGELES (Neighborhood Council Based) ---
  'Los Angeles': {
    city: 'Los Angeles',
    country: 'USA',
    adapter: 'LosAngelesAdapter',
    currency: 'USD',
    zones: [
      {
        name: 'Beverly Hills',
        neighborhoodId: 'beverly-hills',
        tone: 'Entertainment industry wealth, trophy estates, and Rodeo Drive luxury',
        zoneCode: 'Beverly Hills',
        postalCodes: ['90210', '90211', '90212'],
      },
      {
        name: 'Bel Air',
        neighborhoodId: 'bel-air',
        tone: 'Ultra-private compounds, gated estates, and billionaire row',
        zoneCode: 'Bel Air-Beverly Crest',
        postalCodes: ['90077'],
      },
      {
        name: 'Pacific Palisades',
        neighborhoodId: 'pacific-palisades',
        tone: 'Beach proximity, canyon living, and entertainment families',
        zoneCode: 'Pacific Palisades',
        postalCodes: ['90272'],
      },
      {
        name: 'Brentwood',
        neighborhoodId: 'brentwood',
        tone: 'Quiet wealth, celebrity privacy, and village charm',
        zoneCode: 'Brentwood',
        postalCodes: ['90049'],
      },
      {
        name: 'Santa Monica',
        neighborhoodId: 'santa-monica',
        tone: 'Beach lifestyle, tech wealth, and coastal sophistication',
        zoneCode: 'Santa Monica',
        postalCodes: ['90401', '90402', '90403'],
      },
    ],
    endpoints: {
      permits: 'https://data.lacity.org/resource/yv23-pmwf.json',
      liquor: 'https://data.lacity.org/resource/6zgq-ncum.json',
      safety: 'https://data.lacity.org/resource/2nrs-mtv8.json',
    },
  },

  // --- WASHINGTON DC (Ward/ANC Based) ---
  'Washington DC': {
    city: 'Washington DC',
    country: 'USA',
    adapter: 'WashingtonDCAdapter',
    currency: 'USD',
    zones: [
      {
        name: 'Georgetown',
        neighborhoodId: 'georgetown',
        tone: 'Historic preservation, cobblestone charm, and political establishment',
        zoneCode: 'ANC 2E',
        postalCodes: ['20007'],
      },
      {
        name: 'Dupont Circle',
        neighborhoodId: 'dupont-circle',
        tone: 'Embassy row adjacent, row house elegance, and urban sophistication',
        zoneCode: 'ANC 2B',
        postalCodes: ['20036', '20009'],
      },
      {
        name: 'Kalorama',
        neighborhoodId: 'kalorama',
        tone: 'Embassy mansions, presidential neighbors, and old Washington',
        zoneCode: 'ANC 1C',
        altCodes: ['ANC 3C'],
        postalCodes: ['20008', '20009'],
      },
      {
        name: 'Capitol Hill',
        neighborhoodId: 'capitol-hill',
        tone: 'Political power, historic rowhouses, and Eastern Market charm',
        zoneCode: 'ANC 6B',
        altCodes: ['ANC 6A', 'ANC 6C'],
        postalCodes: ['20003', '20002'],
      },
    ],
    endpoints: {
      permits: 'https://opendata.dc.gov/api/',
      liquor: 'https://abra.dc.gov/',
      safety: 'https://opendata.dc.gov/api/',
    },
  },
};

/**
 * Get all cities with adapters
 */
export function getAdapterCities(): string[] {
  return Object.keys(GLOBAL_CITY_CONFIG);
}

/**
 * Get configuration for a city
 */
export function getCityConfig(city: string): CityConfig | null {
  return GLOBAL_CITY_CONFIG[city] || null;
}

/**
 * Get vocabulary for a city
 */
export function getCityVocabulary(city: string): CityVocabulary | null {
  return CITY_VOCABULARIES[city] || null;
}

/**
 * Get all neighborhood IDs for a city
 */
export function getCityNeighborhoodIds(city: string): string[] {
  const config = GLOBAL_CITY_CONFIG[city];
  if (!config) return [];
  return config.zones.map((z) => z.neighborhoodId);
}

/**
 * Get zone by neighborhood ID across all cities
 */
export function getZoneByNeighborhoodId(neighborhoodId: string): {
  city: string;
  zone: CityConfig['zones'][0];
} | null {
  for (const [city, config] of Object.entries(GLOBAL_CITY_CONFIG)) {
    const zone = config.zones.find((z) => z.neighborhoodId === neighborhoodId);
    if (zone) {
      return { city, zone };
    }
  }
  return null;
}

/**
 * Get all international neighborhood IDs (for database queries)
 */
export function getAllInternationalNeighborhoodIds(): string[] {
  const ids: string[] = [];
  for (const config of Object.values(GLOBAL_CITY_CONFIG)) {
    ids.push(...config.zones.map((z) => z.neighborhoodId));
  }
  return ids;
}
