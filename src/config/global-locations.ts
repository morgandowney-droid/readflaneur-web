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

  Dublin: {
    permitTerms: [
      'Planning Application',
      'Planning Permission',
      'Protected Structure',
      'Conservation Area',
      'Change of Use',
      'Extension',
      'Demolition',
      'Retention Permission',
    ],
    liquorTerms: [
      'Intoxicating Liquor Licence',
      'Publican\'s Licence',
      'Restaurant Licence',
      'Off-Licence',
      'Special Exemption Order',
      'Entertainment Licence',
    ],
    realEstateTerms: [
      'Georgian',
      'Victorian',
      'Edwardian',
      'Period property',
      'Mews',
      'Ambassador residence',
      'Embassy',
      'Red brick',
      'Detached',
      'Semi-detached',
    ],
    localPhrases: [
      'the Southside',
      'D4',
      'D6',
      'the village',
      'embassy belt',
      'the coast',
      'DART line',
    ],
    currencySymbol: '€',
    currencyName: 'euros',
  },

  'New Zealand': {
    permitTerms: [
      'Resource Consent',
      'Building Consent',
      'Land Use Consent',
      'Subdivision Consent',
      'Coastal Permit',
      'Earthworks',
      'Heritage',
      'Character Overlay',
    ],
    liquorTerms: [
      'On-Licence',
      'Off-Licence',
      'Club Licence',
      'Special Licence',
      'Liquor Licence',
      'DLC Application',
    ],
    realEstateTerms: [
      'Lifestyle Block',
      'Waterfront',
      'Harbour Views',
      'North-Facing',
      'Character Home',
      'Villa',
      'Bungalow',
      'Homestead',
      'Rural Retreat',
      'Vineyard',
      'Coastal Estate',
    ],
    localPhrases: [
      'the Shore',
      'Eastern Suburbs',
      'Waitemata',
      'Hauraki Gulf',
      'the Basin',
      'Wakatipu',
      'Central Otago',
      'lifestyle property',
    ],
    currencySymbol: '$',
    currencyName: 'NZD',
  },

  Vancouver: {
    permitTerms: [
      'Development Permit',
      'Building Permit',
      'Variance',
      'Relaxation',
      'Heritage Revitalization',
      'View Cone',
      'Height Variance',
      'Conditional Approval',
    ],
    liquorTerms: [
      'Liquor Primary',
      'Food Primary',
      'Manufacturer',
      'Licensee Retail Store',
      'LCLB Application',
    ],
    realEstateTerms: [
      'Waterfront',
      'Ocean Views',
      'Mountain Views',
      'Character Home',
      'Heritage',
      'North Shore',
      'British Properties',
      'Estate',
      'Acreage',
    ],
    localPhrases: [
      'the North Shore',
      'West Van',
      'the Properties',
      'Point Grey',
      'Shaughnessy',
      'water views',
      'Lions Gate',
    ],
    currencySymbol: '$',
    currencyName: 'CAD',
  },

  'Cape Town': {
    permitTerms: [
      'Building Plan',
      'Development Application',
      'Site Development Plan',
      'Heritage Consent',
      'Rezoning Application',
      'Departure Application',
    ],
    liquorTerms: [
      'Liquor Licence',
      'On-Consumption',
      'Off-Consumption',
      'Special Events',
      'WCLAC Application',
    ],
    realEstateTerms: [
      'Beachfront',
      'Ocean Views',
      'Mountain Views',
      'Wine Estate',
      'Secure Estate',
      'Bungalow',
      'Villa',
      'Atlantic Seaboard',
      'Southern Suburbs',
    ],
    localPhrases: [
      'the Atlantic Seaboard',
      'the Cape Doctor',
      'Table Mountain',
      'Clifton beaches',
      'Camps Bay strip',
      'the winelands',
      'load shedding',
    ],
    currencySymbol: 'R',
    currencyName: 'ZAR',
  },

  Singapore: {
    permitTerms: [
      'Planning Permission',
      'Development Charge',
      'Written Permission',
      'Outline Permission',
      'Provisional Permission',
      'GCB Area',
      'Conservation Area',
    ],
    liquorTerms: [
      'Liquor Licence',
      'Public Entertainment',
      'Class 1A',
      'Class 2',
      'SFA Licence',
    ],
    realEstateTerms: [
      'Good Class Bungalow',
      'GCB',
      'Detached House',
      'Semi-Detached',
      'Freehold',
      'Leasehold',
      'District 10',
      'District 9',
      'Sentosa Cove',
      'Waterfront',
    ],
    localPhrases: [
      'District 10',
      'Orchard Road',
      'Nassim',
      'Tanglin',
      'the Cove',
      'Sentosa',
      'GCB area',
      'prime district',
    ],
    currencySymbol: 'S$',
    currencyName: 'SGD',
  },

  'Palm Beach': {
    permitTerms: [
      'Building Permit',
      'ARCOM',
      'Architectural Commission',
      'Demolition Permit',
      'Landscape Plan',
      'Site Plan Review',
      'Variance',
    ],
    liquorTerms: [
      'Alcoholic Beverage License',
      'COP License',
      'Special Events',
      'Restaurant License',
    ],
    realEstateTerms: [
      'Ocean to Lake',
      'Oceanfront',
      'Lakefront',
      'Estate Section',
      'Palm Beach style',
      'Bermuda style',
      'Mediterranean',
    ],
    localPhrases: [
      'the Island',
      'Worth Avenue',
      'Estate Section',
      'South Ocean',
      'North Lake',
      'the Breakers',
      'Mar-a-Lago adjacent',
    ],
    currencySymbol: '$',
    currencyName: 'dollars',
  },

  Greenwich: {
    permitTerms: [
      'Building Permit',
      'Zoning Permit',
      'Special Permit',
      'Site Plan',
      'Wetlands Permit',
      'Coastal Site Plan',
      'Historic District',
    ],
    liquorTerms: [
      'Liquor Permit',
      'Restaurant Liquor',
      'Package Store',
      'Cafe Permit',
    ],
    realEstateTerms: [
      'Backcountry',
      'Estate',
      'Compound',
      'Waterfront',
      'Stone walls',
      'Rolling hills',
      'Horse property',
      'Gentleman\'s farm',
    ],
    localPhrases: [
      'the Backcountry',
      'Mid-Country',
      'Greenwich Avenue',
      'the Sound',
      'Round Hill',
      'Conyers Farm',
      'Belle Haven',
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

  // --- DUBLIN (Eircode/District Based) ---
  Dublin: {
    city: 'Dublin',
    country: 'Ireland',
    adapter: 'DublinAdapter',
    currency: 'EUR',
    zones: [
      {
        name: 'Ballsbridge',
        neighborhoodId: 'dublin-ballsbridge',
        tone: 'Old money, embassy belt, RDS grounds, and Shrewsbury Road billionaires',
        zoneCode: 'D04',
        altCodes: ['Dublin 4'],
        postalCodes: ['D04'],
      },
      {
        name: 'Ranelagh',
        neighborhoodId: 'dublin-ranelagh',
        tone: 'Cosmopolitan village, Dartmouth Square elegance, and creative professionals',
        zoneCode: 'D06',
        altCodes: ['Dublin 6'],
        postalCodes: ['D06'],
      },
      {
        name: 'Dalkey',
        neighborhoodId: 'dublin-dalkey',
        tone: 'Coastal luxury, Vico Road views, celebrity retreats, and literary heritage',
        zoneCode: 'A96',
        altCodes: ['Dalkey', 'Killiney'],
        postalCodes: ['A96'],
      },
    ],
    endpoints: {
      permits: 'https://www.dublincity.ie/residential/planning',
      liquor: 'https://www.courts.ie/intoxicating-liquor',
      safety: 'https://www.garda.ie/en/crime-prevention/',
    },
  },

  // --- NEW ZEALAND (Tier 1 - Survivalist Billionaires: Thiel, Page, Cameron) ---
  // Auckland (The City) + Queenstown (The Retreat/Bunker)
  Auckland: {
    city: 'Auckland',
    country: 'New Zealand',
    adapter: 'NewZealandAdapter',
    currency: 'NZD',
    zones: [
      {
        name: 'Herne Bay',
        neighborhoodId: 'auckland-herne-bay',
        tone: 'Old money waterfront, Marine Parade elegance, yacht club proximity, and discreet wealth',
        zoneCode: 'Waitemata',
        altCodes: ['St Marys Bay'],
        postalCodes: ['1011'],
      },
      {
        name: 'Remuera',
        neighborhoodId: 'auckland-remuera',
        tone: 'Aristocratic northern slopes, Arney Road grandeur, established families, and grammar zone prestige',
        zoneCode: 'Orakei',
        altCodes: ['Northern Slopes'],
        postalCodes: ['1050', '1051'],
      },
      {
        name: 'Waiheke Island',
        neighborhoodId: 'auckland-waiheke',
        tone: 'Vineyard luxury, Oneroa sophistication, celebrity hideaways, and Hauraki Gulf serenity',
        zoneCode: 'Waiheke',
        altCodes: ['Oneroa', 'Palm Beach', 'Church Bay'],
        postalCodes: ['1081'],
      },
    ],
    endpoints: {
      permits: 'https://www.aucklandcouncil.govt.nz/building-and-consents/',
      liquor: 'https://www.aucklandcouncil.govt.nz/licences-regulations/alcohol/',
      safety: 'https://www.police.govt.nz/about-us/statistics-and-publications/',
    },
  },

  Queenstown: {
    city: 'Queenstown',
    country: 'New Zealand',
    adapter: 'NewZealandAdapter',
    currency: 'NZD',
    zones: [
      {
        name: 'Dalefield',
        neighborhoodId: 'queenstown-dalefield',
        tone: 'Billionaire rural retreats, Malaghans Road compounds, Millbrook exclusivity, and survivalist wealth',
        zoneCode: 'Wakatipu',
        altCodes: ['Millbrook', 'Speargrass Flat'],
        postalCodes: ['9371'],
      },
      {
        name: 'Kelvin Heights',
        neighborhoodId: 'queenstown-kelvin-heights',
        tone: 'Lakeside privacy, Peninsula Road estates, Jardines discretion, and alpine luxury',
        zoneCode: 'Wakatipu',
        altCodes: ['Peninsula Road'],
        postalCodes: ['9300'],
      },
    ],
    endpoints: {
      permits: 'https://www.qldc.govt.nz/services/building-and-resource-consents/',
      liquor: 'https://www.qldc.govt.nz/services/food-alcohol-and-bylaw-licences/',
      safety: 'https://www.police.govt.nz/about-us/statistics-and-publications/',
    },
  },

  // --- VANCOUVER (Pacific Money) ---
  Vancouver: {
    city: 'Vancouver',
    country: 'Canada',
    adapter: 'VancouverAdapter',
    currency: 'CAD',
    zones: [
      {
        name: 'West Vancouver',
        neighborhoodId: 'vancouver-west-vancouver',
        tone: 'Hillside luxury, British Properties exclusivity, ocean and mountain views, and Asian wealth',
        zoneCode: 'West Vancouver',
        altCodes: ['British Properties', 'Chartwell', 'Canterbury'],
        postalCodes: ['V7S', 'V7T', 'V7V'],
      },
      {
        name: 'Point Grey',
        neighborhoodId: 'vancouver-point-grey',
        tone: 'Heritage wealth, Belmont Avenue grandeur, UBC proximity, and established families',
        zoneCode: 'Point Grey',
        altCodes: ['Shaughnessy', 'The Crescent'],
        postalCodes: ['V6R', 'V6S', 'V6T'],
      },
    ],
    endpoints: {
      permits: 'https://opendata.vancouver.ca/explore/',
      liquor: 'https://justice.gov.bc.ca/lclb/',
      safety: 'https://geodash.vpd.ca/opendata/',
    },
  },

  // --- CAPE TOWN (The Winter Escape) ---
  'Cape Town': {
    city: 'Cape Town',
    country: 'South Africa',
    adapter: 'CapeTownAdapter',
    currency: 'ZAR',
    zones: [
      {
        name: 'Clifton / Camps Bay',
        neighborhoodId: 'capetown-atlantic-seaboard',
        tone: 'Beachfront luxury, Nettleton Road exclusivity, Victoria Road glamour, and international wealth',
        zoneCode: 'Atlantic Seaboard',
        altCodes: ['Clifton', 'Camps Bay', 'Bantry Bay'],
        postalCodes: ['8005', '8040'],
      },
      {
        name: 'Constantia',
        neighborhoodId: 'capetown-constantia',
        tone: 'Wine estates, old Cape money, Southern Cross Drive elegance, and equestrian lifestyle',
        zoneCode: 'Constantia',
        altCodes: ['Upper Constantia', 'Constantia Upper'],
        postalCodes: ['7806', '7800'],
      },
    ],
    endpoints: {
      permits: 'https://www.capetown.gov.za/City-Connect/',
      liquor: 'https://www.westerncape.gov.za/general-publication/liquor-licences',
      safety: 'https://www.saps.gov.za/services/crimestats.php',
    },
  },

  // --- SINGAPORE (Expat Hub) ---
  Singapore: {
    city: 'Singapore',
    country: 'Singapore',
    adapter: 'SingaporeAdapter',
    currency: 'SGD',
    zones: [
      {
        name: 'Nassim / Tanglin',
        neighborhoodId: 'singapore-nassim',
        tone: 'Good Class Bungalows, Nassim Road prestige, embassy belt, and ultra-prime District 10',
        zoneCode: 'D10',
        altCodes: ['District 10', 'Tanglin', 'Cluny', 'Ridout'],
        postalCodes: ['258', '259'],
      },
      {
        name: 'Sentosa Cove',
        neighborhoodId: 'singapore-sentosa',
        tone: 'Marina luxury, Ocean Drive waterfront, private island living, and international wealth',
        zoneCode: 'Sentosa',
        altCodes: ['Sentosa Cove', 'Treasure Island'],
        postalCodes: ['098'],
      },
    ],
    endpoints: {
      permits: 'https://www.ura.gov.sg/Corporate/',
      liquor: 'https://www.police.gov.sg/e-Services/Apply/Licences-and-Permits',
      safety: 'https://www.police.gov.sg/Statistics/',
      coe: 'https://www.lta.gov.sg/content/ltagov/en/industry_innovations/industry_matters/coe.html',
      ura: 'https://www.ura.gov.sg/realEstateIIWeb/',
    },
  },

  // --- USA SATELLITES ---
  // Palm Beach (Old Money Resort - NYC Winter Escape)
  'Palm Beach': {
    city: 'Palm Beach',
    country: 'USA',
    adapter: 'PalmBeachAdapter',
    currency: 'USD',
    zones: [
      {
        name: 'Palm Beach Island',
        neighborhoodId: 'palm-beach-island',
        tone: 'Old money resort, Worth Avenue elegance, oceanfront estates, and society season',
        zoneCode: 'Palm Beach',
        altCodes: ['Estate Section', 'South Ocean'],
        postalCodes: ['33480'],
      },
    ],
    endpoints: {
      permits: 'https://www.townofpalmbeach.com/161/Building-Division',
      liquor: 'https://www.myfloridalicense.com/dbpr/',
      safety: 'https://www.palmbeachpolice.com/',
      arcom: 'https://www.townofpalmbeach.com/165/Architectural-Commission',
    },
  },

  // Greenwich (Hedge Fund Estates - NYC Bedroom Community)
  Greenwich: {
    city: 'Greenwich',
    country: 'USA',
    adapter: 'GreenwichAdapter',
    currency: 'USD',
    zones: [
      {
        name: 'Greenwich Backcountry',
        neighborhoodId: 'greenwich-backcountry',
        tone: 'Hedge fund estates, Round Hill Road privacy, Conyers Farm exclusivity, and old money discretion',
        zoneCode: 'Backcountry',
        altCodes: ['Round Hill', 'North Street', 'Conyers Farm'],
        postalCodes: ['06831'],
      },
    ],
    endpoints: {
      permits: 'https://www.greenwichct.gov/216/Building-Division',
      liquor: 'https://portal.ct.gov/DCP/License-Services-Division',
      safety: 'https://www.greenwichct.gov/191/Police-Department',
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
