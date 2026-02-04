/**
 * Utility functions for neighborhood ID mapping
 */

// Map URL city slugs to neighborhood ID prefixes
export const CITY_PREFIX_MAP: Record<string, string> = {
  // North America
  'new-york': 'nyc',
  'san-francisco': 'sf',
  'los-angeles': 'la',
  'washington-dc': 'dc',
  'chicago': 'chicago',
  'miami': 'miami',
  'toronto': 'toronto',
  // Europe
  'london': 'london',
  'paris': 'paris',
  'berlin': 'berlin',
  'amsterdam': 'amsterdam',
  'barcelona': 'barcelona',
  'milan': 'milan',
  'lisbon': 'lisbon',
  'copenhagen': 'copenhagen',
  'stockholm': 'stockholm',
  // Asia-Pacific
  'tokyo': 'tokyo',
  'hong-kong': 'hk',
  'singapore': 'singapore',
  'sydney': 'sydney',
  'melbourne': 'melbourne',
  // Middle East
  'dubai': 'dubai',
  'tel-aviv': 'telaviv',
  // US Vacation Destinations
  'the-hamptons': 'us',
  'nantucket': 'us',
  'marthas-vineyard': 'us',
  'aspen': 'us',
  // Caribbean Vacation
  'st-barts': 'caribbean',
  // European Vacation Destinations
  'saint-tropez': 'europe',
  'marbella': 'europe',
  'sylt': 'europe',
  // Enclaves (wealthy suburbs)
  'new-york-enclaves': 'nyc',
  'stockholm-enclaves': 'stockholm',
};

/**
 * Build neighborhood ID from URL params
 * @param city - URL city slug (e.g., 'new-york', 'los-angeles')
 * @param neighborhood - URL neighborhood slug (e.g., 'west-village', 'beverly-hills')
 * @returns Neighborhood ID (e.g., 'nyc-west-village', 'la-beverly-hills')
 */
export function buildNeighborhoodId(city: string, neighborhood: string): string {
  const prefix = CITY_PREFIX_MAP[city] || city;
  return `${prefix}-${neighborhood}`;
}

/**
 * Format neighborhood name from URL slug
 * @param slug - URL slug (e.g., 'west-village')
 * @returns Formatted name (e.g., 'West Village')
 */
export function formatNeighborhoodName(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format city name from URL slug
 * @param slug - URL slug (e.g., 'new-york')
 * @returns Formatted name (e.g., 'New York')
 */
export function formatCityName(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Short 3-letter city codes for display
export const CITY_CODES: Record<string, string> = {
  // North America
  'New York': 'NYC',
  'San Francisco': 'SF',
  'Los Angeles': 'LA',
  'Washington DC': 'DC',
  'Chicago': 'CHI',
  'Miami': 'MIA',
  'Toronto': 'TOR',
  // Europe
  'London': 'LDN',
  'Paris': 'PAR',
  'Berlin': 'BER',
  'Amsterdam': 'AMS',
  'Barcelona': 'BCN',
  'Milan': 'MIL',
  'Lisbon': 'LIS',
  'Copenhagen': 'CPH',
  'Stockholm': 'STO',
  // Asia-Pacific
  'Tokyo': 'TYO',
  'Hong Kong': 'HKG',
  'Singapore': 'SIN',
  'Sydney': 'SYD',
  'Melbourne': 'MEL',
  // Middle East
  'Dubai': 'DXB',
  'Tel Aviv': 'TLV',
};

/**
 * Get short city code for display
 * @param cityName - Full city name (e.g., 'New York')
 * @returns Short code (e.g., 'NYC')
 */
export function getCityCode(cityName: string): string {
  return CITY_CODES[cityName] || cityName.slice(0, 3).toUpperCase();
}

// Wikipedia article slugs for neighborhoods
// Maps neighborhood ID to Wikipedia article title (with underscores)
const WIKIPEDIA_ARTICLES: Record<string, string> = {
  // New York
  'nyc-tribeca': 'Tribeca',
  'nyc-tribeca-core': 'Tribeca',
  'nyc-fidi': 'Financial_District,_Manhattan',
  'nyc-west-village': 'West_Village',
  'nyc-soho': 'SoHo,_Manhattan',
  'nyc-noho': 'NoHo,_Manhattan',
  'nyc-nolita': 'Nolita',
  'nyc-lower-east-side': 'Lower_East_Side',
  'nyc-east-village': 'East_Village,_Manhattan',
  'nyc-greenwich-village': 'Greenwich_Village',
  'nyc-chelsea': 'Chelsea,_Manhattan',
  'nyc-meatpacking': 'Meatpacking_District,_Manhattan',
  'nyc-flatiron': 'Flatiron_District',
  'nyc-gramercy': 'Gramercy_Park',
  'nyc-upper-east-side': 'Upper_East_Side',
  'nyc-upper-west-side': 'Upper_West_Side',
  'nyc-hudson-yards': 'Hudson_Yards',
  'nyc-williamsburg': 'Williamsburg,_Brooklyn',
  'nyc-dumbo': 'Dumbo,_Brooklyn',
  'nyc-cobble-hill': 'Cobble_Hill,_Brooklyn',
  'nyc-park-slope': 'Park_Slope',
  'nyc-brooklyn-west': 'Brooklyn', // Combo - links to general Brooklyn article
  // San Francisco
  'sf-mission': 'Mission_District,_San_Francisco',
  'sf-the-mission': 'Mission_District,_San_Francisco',
  'sf-castro': 'The_Castro,_San_Francisco',
  'sf-marina': 'Marina_District,_San_Francisco',
  'sf-hayes-valley': 'Hayes_Valley,_San_Francisco',
  'sf-nob-hill': 'Nob_Hill,_San_Francisco',
  'sf-north-beach': 'North_Beach,_San_Francisco',
  'sf-pacific-heights': 'Pacific_Heights,_San_Francisco',
  'sf-noe-valley': 'Noe_Valley,_San_Francisco',
  'sf-russian-hill': 'Russian_Hill,_San_Francisco',
  // Los Angeles
  'la-silver-lake': 'Silver_Lake,_Los_Angeles',
  'la-venice': 'Venice,_Los_Angeles',
  'la-echo-park': 'Echo_Park,_Los_Angeles',
  'la-los-feliz': 'Los_Feliz,_Los_Angeles',
  'la-highland-park': 'Highland_Park,_Los_Angeles',
  'la-beverly-hills': 'Beverly_Hills,_California',
  'la-santa-monica': 'Santa_Monica,_California',
  'la-west-hollywood': 'West_Hollywood,_California',
  // Chicago
  'chicago-wicker-park': 'Wicker_Park,_Chicago',
  'chicago-logan-square': 'Logan_Square,_Chicago',
  'chicago-lincoln-park': 'Lincoln_Park,_Chicago',
  'chicago-west-loop': 'West_Loop,_Chicago',
  'chicago-bucktown': 'Bucktown,_Chicago',
  'chicago-river-north': 'River_North,_Chicago',
  'chicago-gold-coast': 'Gold_Coast,_Chicago',
  // Miami
  'miami-south-beach': 'South_Beach',
  'miami-wynwood': 'Wynwood',
  'miami-little-havana': 'Little_Havana',
  'miami-design-district': 'Miami_Design_District',
  'miami-coral-gables': 'Coral_Gables,_Florida',
  'miami-coconut-grove': 'Coconut_Grove_(Miami)',
  'miami-brickell': 'Brickell',
  // Washington DC
  'dc-georgetown': 'Georgetown_(Washington,_D.C.)',
  'dc-dupont-circle': 'Dupont_Circle',
  'dc-capitol-hill': 'Capitol_Hill_(Washington,_D.C.)',
  'dc-adams-morgan': 'Adams_Morgan',
  'dc-shaw': 'Shaw_(Washington,_D.C.)',
  'dc-cleveland-park': 'Cleveland_Park',
  'dc-kalorama': 'Kalorama_(Washington,_D.C.)',
  // Toronto
  'toronto-queen-west': 'Queen_Street_West',
  'toronto-kensington': 'Kensington_Market',
  'toronto-yorkville': 'Yorkville,_Toronto',
  'toronto-distillery': 'Distillery_District',
  'toronto-leslieville': 'Leslieville',
  // London
  'london-shoreditch': 'Shoreditch',
  'london-soho': 'Soho',
  'london-notting-hill': 'Notting_Hill',
  'london-chelsea': 'Chelsea,_London',
  'london-marylebone': 'Marylebone',
  'london-islington': 'Islington',
  'london-brixton': 'Brixton',
  'london-kensington': 'Kensington',
  'london-hampstead': 'Hampstead',
  'london-mayfair': 'Mayfair',
  // Paris
  'paris-marais': 'Le_Marais',
  'paris-le-marais': 'Le_Marais',
  'paris-saint-germain': 'Saint-Germain-des-Prés',
  'paris-montmartre': 'Montmartre',
  'paris-belleville': 'Belleville,_Paris',
  'paris-16th': '16th_arrondissement_of_Paris',
  'paris-7th': '7th_arrondissement_of_Paris',
  // Berlin
  'berlin-mitte': 'Mitte_(locality)',
  'berlin-kreuzberg': 'Kreuzberg',
  'berlin-prenzlauer-berg': 'Prenzlauer_Berg',
  'berlin-neukolln': 'Neukölln',
  'berlin-charlottenburg': 'Charlottenburg',
  'berlin-friedrichshain': 'Friedrichshain',
  'berlin-grunewald': 'Grunewald_(locality)',
  'berlin-dahlem': 'Dahlem_(Berlin)',
  'berlin-zehlendorf': 'Zehlendorf_(Berlin)',
  // Amsterdam
  'amsterdam-jordaan': 'Jordaan',
  'amsterdam-de-pijp': 'De_Pijp',
  'amsterdam-oud-west': 'Oud-West',
  'amsterdam-oud-zuid': 'Oud-Zuid',
  'amsterdam-centrum': 'Amsterdam-Centrum',
  'amsterdam-noord': 'Amsterdam-Noord',
  // Barcelona
  'barcelona-gothic-quarter': 'Gothic_Quarter,_Barcelona',
  'barcelona-el-born': 'El_Born',
  'barcelona-gracia': 'Gràcia',
  'barcelona-eixample': 'Eixample',
  'barcelona-barceloneta': 'La_Barceloneta,_Barcelona',
  // Milan
  'milan-brera': 'Brera_(district_of_Milan)',
  'milan-navigli': 'Navigli',
  'milan-isola': 'Isola_(Milan)',
  'milan-porta-romana': 'Porta_Romana_(Milan)',
  'milan-porta-nuova': 'Porta_Nuova_(Milan)',
  // Lisbon
  'lisbon-alfama': 'Alfama',
  'lisbon-bairro-alto': 'Bairro_Alto',
  'lisbon-chiado': 'Chiado',
  'lisbon-baixa': 'Baixa',
  'lisbon-principe-real': 'Príncipe_Real_(Lisbon)',
  // Copenhagen
  'copenhagen-norrebro': 'Nørrebro',
  'copenhagen-vesterbro': 'Vesterbro',
  'copenhagen-osterbro': 'Østerbro',
  'copenhagen-frederiksberg': 'Frederiksberg',
  'copenhagen-nyhavn': 'Nyhavn',
  // Stockholm
  'stockholm-sodermalm': 'Södermalm',
  'stockholm-ostermalm': 'Östermalm',
  'stockholm-ostermalm-core': 'Östermalm',
  'stockholm-norrmalm': 'Norrmalm',
  'stockholm-gamla-stan': 'Gamla_stan',
  'stockholm-djurgarden': 'Djurgården',
  'stockholm-vasastan': 'Vasastan',
  'stockholm-kungsholmen': 'Kungsholmen',
  // Tokyo
  'tokyo-shibuya': 'Shibuya',
  'tokyo-shinjuku': 'Shinjuku',
  'tokyo-harajuku': 'Harajuku',
  'tokyo-daikanyama': 'Daikanyama',
  'tokyo-nakameguro': 'Nakameguro',
  'tokyo-shimokitazawa': 'Shimokitazawa',
  'tokyo-roppongi': 'Roppongi',
  'tokyo-ginza': 'Ginza',
  'tokyo-aoyama': 'Aoyama,_Tokyo',
  // Hong Kong
  'hk-central': 'Central,_Hong_Kong',
  'hk-sheung-wan': 'Sheung_Wan',
  'hk-soho': 'SoHo,_Hong_Kong',
  'hong-kong-soho': 'SoHo,_Hong_Kong',
  'hk-the-peak': 'Victoria_Peak',
  'hk-causeway-bay': 'Causeway_Bay',
  // Singapore
  'singapore-tiong-bahru': 'Tiong_Bahru',
  'singapore-kampong-glam': 'Kampong_Glam',
  'singapore-chinatown': 'Chinatown,_Singapore',
  'singapore-holland-village': 'Holland_Village,_Singapore',
  'singapore-orchard': 'Orchard_Road',
  'singapore-marina-bay': 'Marina_Bay,_Singapore',
  // Sydney
  'sydney-surry-hills': 'Surry_Hills,_New_South_Wales',
  'sydney-paddington': 'Paddington,_New_South_Wales',
  'sydney-newtown': 'Newtown,_New_South_Wales',
  'sydney-bondi': 'Bondi,_New_South_Wales',
  'sydney-darlinghurst': 'Darlinghurst,_New_South_Wales',
  'sydney-vaucluse': 'Vaucluse,_New_South_Wales',
  'sydney-mosman': 'Mosman,_New_South_Wales',
  'sydney-woollahra': 'Woollahra,_New_South_Wales',
  'sydney-double-bay': 'Double_Bay,_New_South_Wales',
  // Melbourne
  'melbourne-fitzroy': 'Fitzroy,_Victoria',
  'melbourne-collingwood': 'Collingwood,_Victoria',
  'melbourne-st-kilda': 'St_Kilda,_Victoria',
  'melbourne-carlton': 'Carlton,_Victoria',
  'melbourne-south-yarra': 'South_Yarra,_Victoria',
  // Dubai
  'dubai-downtown': 'Downtown_Dubai',
  'dubai-jumeirah': 'Jumeirah',
  'dubai-al-quoz': 'Al_Quoz',
  'dubai-deira': 'Deira,_Dubai',
  'dubai-difc': 'Dubai_International_Financial_Centre',
  // Tel Aviv
  'telaviv-neve-tzedek': 'Neve_Tzedek',
  'telaviv-florentin': 'Florentin,_Tel_Aviv',
  'telaviv-rothschild': 'Rothschild_Boulevard',
  'tel-aviv-rothschild': 'Rothschild_Boulevard',
  'telaviv-jaffa': 'Jaffa',
  // New York Enclaves - Westchester
  'nyc-rye': 'Rye,_New_York',
  'nyc-larchmont': 'Larchmont,_New_York',
  'nyc-scarsdale': 'Scarsdale,_New_York',
  'nyc-bronxville': 'Bronxville,_New_York',
  // New York Enclaves - Gold Coast CT
  'nyc-darien': 'Darien,_Connecticut',
  'nyc-greenwich': 'Greenwich,_Connecticut',
  'nyc-westport': 'Westport,_Connecticut',
  // New York Enclaves - Summit & The Hills NJ
  'nyc-summit': 'Summit,_New_Jersey',
  'nyc-short-hills': 'Short_Hills,_New_Jersey',
  'nyc-millburn': 'Millburn,_New_Jersey',
  // New York Enclaves - Montclair & The Ridge NJ
  'nyc-montclair': 'Montclair,_New_Jersey',
  'nyc-glen-ridge': 'Glen_Ridge,_New_Jersey',
  // New York Enclaves - Bergen Gold NJ
  'nyc-alpine': 'Alpine,_New_Jersey',
  'nyc-saddle-river': 'Saddle_River,_New_Jersey',
  'nyc-englewood-cliffs': 'Englewood_Cliffs,_New_Jersey',
  // New York Enclaves - Old Westbury LI NY
  'nyc-old-westbury': 'Old_Westbury,_New_York',
  'nyc-muttontown': 'Muttontown,_New_York',
  'nyc-brookville': 'Brookville,_New_York',
  // Stockholm Enclaves
  'stockholm-djursholm': 'Djursholm',
  'stockholm-stocksund': 'Stocksund',
  'stockholm-lidingo-town': 'Lidingö',
  'stockholm-saltsjobaden': 'Saltsjöbaden',
  'stockholm-solsidan': 'Solsidan,_Nacka',
  'stockholm-appelviken': 'Äppelviken',
  'stockholm-alsten': 'Ålsten',
  'stockholm-smedslatten': 'Smedslätten',
  // US Vacation
  'us-hamptons': 'The_Hamptons',
  'us-hamptons-core': 'The_Hamptons',
  'us-montauk': 'Montauk,_New_York',
  'us-nantucket': 'Nantucket',
  'us-martha-vineyard': 'Martha%27s_Vineyard',
  // Caribbean Vacation
  'caribbean-stbarts': 'Saint_Barthélemy',
  // European Vacation
  'europe-st-tropez': 'Saint-Tropez',
  // New York combo components
  'nyc-soho-core': 'SoHo,_Manhattan',
  'nyc-hudson-square': 'Hudson_Square',
};

// Google Maps location names for enclave neighborhoods
// Maps neighborhood ID to proper location string for Google Maps
const MAP_LOCATIONS: Record<string, string> = {
  // New York Enclaves - Westchester
  'nyc-rye': 'Rye, New York',
  'nyc-larchmont': 'Larchmont, New York',
  'nyc-scarsdale': 'Scarsdale, New York',
  'nyc-bronxville': 'Bronxville, New York',
  // New York Enclaves - Gold Coast CT
  'nyc-darien': 'Darien, Connecticut',
  'nyc-greenwich': 'Greenwich, Connecticut',
  'nyc-westport': 'Westport, Connecticut',
  // New York Enclaves - Summit & The Hills NJ
  'nyc-summit': 'Summit, New Jersey',
  'nyc-short-hills': 'Short Hills, New Jersey',
  'nyc-millburn': 'Millburn, New Jersey',
  // New York Enclaves - Montclair & The Ridge NJ
  'nyc-montclair': 'Montclair, New Jersey',
  'nyc-glen-ridge': 'Glen Ridge, New Jersey',
  // New York Enclaves - Bergen Gold NJ
  'nyc-alpine': 'Alpine, New Jersey',
  'nyc-saddle-river': 'Saddle River, New Jersey',
  'nyc-englewood-cliffs': 'Englewood Cliffs, New Jersey',
  // New York Enclaves - Old Westbury LI NY
  'nyc-old-westbury': 'Old Westbury, New York',
  'nyc-muttontown': 'Muttontown, New York',
  'nyc-brookville': 'Brookville, New York',
  // Stockholm Enclaves
  'stockholm-djursholm': 'Djursholm, Stockholm, Sweden',
  'stockholm-stocksund': 'Stocksund, Stockholm, Sweden',
  'stockholm-lidingo-town': 'Lidingö, Stockholm, Sweden',
  'stockholm-saltsjobaden': 'Saltsjöbaden, Stockholm, Sweden',
  'stockholm-solsidan': 'Solsidan, Nacka, Sweden',
  'stockholm-appelviken': 'Äppelviken, Stockholm, Sweden',
  'stockholm-alsten': 'Ålsten, Stockholm, Sweden',
  'stockholm-smedslatten': 'Smedslätten, Stockholm, Sweden',
};

/**
 * Get Google Maps location string for a neighborhood
 * @param neighborhoodId - Neighborhood ID
 * @param neighborhoodName - Fallback neighborhood name
 * @param city - City name (fallback)
 * @returns Location string for Google Maps
 */
export function getMapLocation(neighborhoodId: string, neighborhoodName: string, city: string): string {
  return MAP_LOCATIONS[neighborhoodId] || `${neighborhoodName}, ${city}`;
}

/**
 * Get Wikipedia URL for a neighborhood
 * @param neighborhoodId - Neighborhood ID (e.g., 'nyc-tribeca')
 * @param neighborhoodName - Fallback neighborhood name
 * @returns Wikipedia article URL
 */
export function getWikipediaUrl(neighborhoodId: string, neighborhoodName: string): string {
  const article = WIKIPEDIA_ARTICLES[neighborhoodId];
  if (article) {
    return `https://en.wikipedia.org/wiki/${article}`;
  }
  // Fallback: use neighborhood name with underscores
  return `https://en.wikipedia.org/wiki/${neighborhoodName.replace(/ /g, '_')}`;
}

/**
 * Mapping of neighborhood names to expanded search terms
 * Used when querying for news, briefs, and recaps
 * The display name stays the same, but searches include additional areas
 */
const NEIGHBORHOOD_SEARCH_EXPANSIONS: Record<string, string[]> = {
  'The Hamptons': ['The Hamptons', 'Montauk', 'East Hampton', 'Southampton', 'Sag Harbor'],
};

/**
 * Get expanded search location string for a neighborhood
 * Some neighborhoods should search for multiple areas (e.g., "The Hamptons" also searches for "Montauk")
 * @param neighborhoodName - Display name of the neighborhood
 * @param city - City name
 * @param country - Country name
 * @returns Location string for search queries
 */
export function getSearchLocation(neighborhoodName: string, city: string, country: string): string {
  const expansions = NEIGHBORHOOD_SEARCH_EXPANSIONS[neighborhoodName];
  if (expansions) {
    // Return expanded search terms joined with "or"
    return `${expansions.join(' or ')}, ${country}`;
  }
  // Default: just the neighborhood name
  return `${neighborhoodName}, ${city}, ${country}`;
}

/**
 * Get expanded search terms for a neighborhood name
 * @param neighborhoodName - Display name of the neighborhood
 * @returns Array of search terms (original name plus any expansions)
 */
export function getSearchTerms(neighborhoodName: string): string[] {
  return NEIGHBORHOOD_SEARCH_EXPANSIONS[neighborhoodName] || [neighborhoodName];
}

