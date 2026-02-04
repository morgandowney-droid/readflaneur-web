/**
 * NYC Locations Configuration
 *
 * Master geofence configuration mapping Flâneur neighborhoods to:
 * - Zip codes (for DOB Permits & Liquor Licenses)
 * - Police precincts (for Safety Stats)
 * - Editorial tone (for AI content generation)
 *
 * Coverage: 11 NYC neighborhoods
 */

export interface NYCNeighborhoodConfig {
  zips: string[];
  precincts: string[];
  tone: string;
  /** For combo neighborhoods - component neighborhood keys */
  components?: string[];
}

/**
 * NYC Flâneur neighborhood configuration
 *
 * Regular neighborhoods map directly to their geofence data.
 * Combo neighborhoods aggregate data from their component neighborhoods.
 */
export const FLANEUR_NYC_CONFIG: Record<string, NYCNeighborhoodConfig> = {
  // ===== REGULAR NEIGHBORHOODS =====

  Chelsea: {
    zips: ['10001', '10011'],
    precincts: ['10th Precinct'],
    tone: 'Art World & High Line Architecture',
  },

  'Greenwich Village': {
    zips: ['10003', '10012', '10014'],
    precincts: ['6th Precinct'],
    tone: 'Gold Coast NYU & Historic Preservation',
  },

  'West Village': {
    zips: ['10014'],
    precincts: ['6th Precinct'],
    tone: 'Celebrity sightings, brownstone charm, and bohemian heritage',
  },

  'Hudson Yards': {
    zips: ['10001', '10018'],
    precincts: ['Midtown South Precinct'],
    tone: 'Height, amenities, and proximity to the High Line',
  },

  'Meatpacking District': {
    zips: ['10014'],
    precincts: ['6th Precinct'],
    tone: 'Nightlife transformation, fashion retail, and cobblestone aesthetics',
  },

  FiDi: {
    zips: ['10004', '10005', '10006', '10007', '10038'],
    precincts: ['1st Precinct'],
    tone: 'The "New Downtown" residential shift',
  },

  'Upper East Side': {
    zips: ['10021', '10028', '10065', '10075', '10128'],
    precincts: ['19th Precinct'],
    tone: 'Preservation, old money traditions, and museum proximity',
  },

  'Upper West Side': {
    zips: ['10023', '10024', '10025'],
    precincts: ['20th Precinct', '24th Precinct'],
    tone: 'Intellectual culture, pre-war grandeur, and Central Park access',
  },

  Williamsburg: {
    zips: ['11211', '11249'],
    precincts: ['90th Precinct', '94th Precinct'],
    tone: 'Creative industries, waterfront development, and loft conversions',
  },

  // Component neighborhoods for combos
  Dumbo: {
    zips: ['11201'],
    precincts: ['84th Precinct'],
    tone: 'Tech startups, waterfront views, and converted warehouses',
  },

  'Cobble Hill': {
    zips: ['11201', '11231'],
    precincts: ['76th Precinct'],
    tone: 'Brownstone elegance and neighborhood restaurants',
  },

  'Park Slope': {
    zips: ['11215', '11217'],
    precincts: ['78th Precinct'],
    tone: 'Family-friendly brownstones and Prospect Park proximity',
  },

  Tribeca: {
    zips: ['10007', '10013'],
    precincts: ['1st Precinct'],
    tone: 'Celebrity privacy, cast-iron buildings, and waterfront dining',
  },

  SoHo: {
    zips: ['10012', '10013'],
    precincts: ['5th Precinct'],
    tone: 'Cast-iron architecture, luxury retail, and gallery culture',
  },

  NoHo: {
    zips: ['10003', '10012'],
    precincts: ['9th Precinct'],
    tone: 'Historic lofts and creative industries',
  },

  Nolita: {
    zips: ['10012', '10013'],
    precincts: ['5th Precinct'],
    tone: 'Boutique shopping and neighborhood cafes',
  },

  // ===== COMBO NEIGHBORHOODS =====

  'Brooklyn West': {
    components: ['Dumbo', 'Cobble Hill', 'Park Slope'],
    zips: ['11201', '11231', '11215', '11217'],
    precincts: ['84th Precinct', '76th Precinct', '78th Precinct'],
    tone: 'Brownstone Families, Strollers & Eco-Luxury',
  },

  'Tribeca Combo': {
    components: ['Tribeca'],
    zips: ['10007', '10013'],
    precincts: ['1st Precinct'],
    tone: 'Privacy, discretion, and proximity to the water',
  },

  'SoHo Combo': {
    components: ['SoHo', 'NoHo', 'Nolita'],
    zips: ['10012', '10013', '10003'],
    precincts: ['5th Precinct', '9th Precinct'],
    tone: 'Cast-iron architecture, retail evolution, and gallery culture',
  },
};

/**
 * Mapping from Flâneur neighborhood IDs (URL slugs) to config keys
 */
export const NEIGHBORHOOD_ID_TO_CONFIG: Record<string, string> = {
  chelsea: 'Chelsea',
  'greenwich-village': 'Greenwich Village',
  'west-village': 'West Village',
  'hudson-yards': 'Hudson Yards',
  meatpacking: 'Meatpacking District',
  fidi: 'FiDi',
  'upper-east-side': 'Upper East Side',
  'upper-west-side': 'Upper West Side',
  williamsburg: 'Williamsburg',
  'brooklyn-west': 'Brooklyn West',
  tribeca: 'Tribeca Combo',
  soho: 'SoHo Combo',
  dumbo: 'Dumbo',
  'cobble-hill': 'Cobble Hill',
  'park-slope': 'Park Slope',
  noho: 'NoHo',
  nolita: 'Nolita',
};

/**
 * Get all unique target zip codes across all NYC neighborhoods
 */
export function getAllTargetZips(): string[] {
  const zips = new Set<string>();
  for (const config of Object.values(FLANEUR_NYC_CONFIG)) {
    for (const zip of config.zips) {
      zips.add(zip);
    }
  }
  return Array.from(zips).sort();
}

/**
 * Get all unique target precincts across all NYC neighborhoods
 */
export function getAllTargetPrecincts(): string[] {
  const precincts = new Set<string>();
  for (const config of Object.values(FLANEUR_NYC_CONFIG)) {
    for (const precinct of config.precincts) {
      precincts.add(precinct);
    }
  }
  return Array.from(precincts).sort();
}

/**
 * Get configuration for a neighborhood by its URL slug
 */
export function getConfigByNeighborhoodId(
  neighborhoodId: string
): NYCNeighborhoodConfig | null {
  const configKey = NEIGHBORHOOD_ID_TO_CONFIG[neighborhoodId.toLowerCase()];
  if (!configKey) return null;
  return FLANEUR_NYC_CONFIG[configKey] || null;
}

/**
 * Get neighborhood config key from a zip code
 * Returns the most specific match (prefers non-combo neighborhoods)
 *
 * Special handling for shared zip codes:
 * - 10001: Chelsea vs Hudson Yards (disambiguate by street)
 * - 10014: West Village vs Meatpacking vs Greenwich Village
 */
export function getNeighborhoodKeyFromZip(
  zipCode: string,
  address?: string
): string | null {
  // First, find all neighborhoods that include this zip
  const matches: string[] = [];

  for (const [key, config] of Object.entries(FLANEUR_NYC_CONFIG)) {
    // Skip combo neighborhoods for zip matching - use components instead
    if (config.components) continue;

    if (config.zips.includes(zipCode)) {
      matches.push(key);
    }
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Multiple matches - need disambiguation
  if (zipCode === '10001' && address) {
    // Hudson Yards is roughly west of 10th Ave and north of 30th St
    const upperAddress = address.toUpperCase();
    if (
      upperAddress.includes('HUDSON YARDS') ||
      upperAddress.includes('11TH AVE') ||
      upperAddress.includes('12TH AVE')
    ) {
      return 'Hudson Yards';
    }
    // Default to Chelsea for 10001
    return 'Chelsea';
  }

  if (zipCode === '10014' && address) {
    const upperAddress = address.toUpperCase();
    // Meatpacking is roughly 14th to Gansevoort, 9th Ave to Hudson
    if (
      upperAddress.includes('MEATPACKING') ||
      upperAddress.includes('GANSEVOORT') ||
      upperAddress.includes('LITTLE W 12') ||
      upperAddress.includes('WASHINGTON ST')
    ) {
      return 'Meatpacking District';
    }
    // West Village is west of 7th Ave
    if (
      upperAddress.includes('BLEECKER') ||
      upperAddress.includes('CHRISTOPHER') ||
      upperAddress.includes('PERRY') ||
      upperAddress.includes('CHARLES') ||
      upperAddress.includes('W 4') ||
      upperAddress.includes('BANK ST') ||
      upperAddress.includes('BETHUNE')
    ) {
      return 'West Village';
    }
    // Default to Greenwich Village
    return 'Greenwich Village';
  }

  // For other ambiguous zips, return the first match
  return matches[0];
}

/**
 * Get neighborhood config key from a precinct
 */
export function getNeighborhoodKeyFromPrecinct(precinct: string): string | null {
  // Normalize precinct name
  const normalizedPrecinct = precinct.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const [key, config] of Object.entries(FLANEUR_NYC_CONFIG)) {
    // Skip combo neighborhoods
    if (config.components) continue;

    for (const p of config.precincts) {
      const normalizedP = p.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedP.includes(normalizedPrecinct) || normalizedPrecinct.includes(normalizedP)) {
        return key;
      }
    }
  }

  return null;
}

/**
 * Exported constants for convenience
 */
export const ALL_TARGET_ZIPS = getAllTargetZips();
export const ALL_TARGET_PRECINCTS = getAllTargetPrecincts();

/**
 * Neighborhood context instructions for AI content generation
 */
export const NEIGHBORHOOD_CONTEXT: Record<string, string> = {
  'Hudson Yards': 'Focus on height, amenities, and proximity to the High Line.',
  'Brooklyn West':
    "Focus on 'Brownstone Brooklyn' aesthetics, family amenities, and the commute.",
  'Tribeca Combo': 'Focus on privacy, discretion, and proximity to the water.',
  FiDi: "Focus on the 'New Downtown' residential shift.",
  'SoHo Combo':
    'Focus on cast-iron architecture, retail evolution, and gallery culture.',
  'Upper East Side':
    'Focus on preservation, old money traditions, and museum proximity.',
  'Upper West Side':
    'Focus on intellectual culture, pre-war grandeur, and Central Park access.',
  'West Village':
    'Focus on celebrity sightings, brownstone charm, and bohemian heritage.',
  'Meatpacking District':
    'Focus on nightlife transformation, fashion retail, and cobblestone aesthetics.',
  Chelsea: 'Focus on gallery scene, High Line adjacency, and architectural innovation.',
  'Greenwich Village':
    'Focus on historic preservation, NYU influence, and literary heritage.',
  Williamsburg:
    'Focus on creative industries, waterfront development, and loft conversions.',
};
