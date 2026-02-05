/**
 * Fashion Week Calendar Configuration
 *
 * Defines the four major global fashion weeks and their coverage parameters.
 * This calendar drives the "Fashion Mode" override during active weeks.
 *
 * Big Four Fashion Weeks:
 * - NYFW (New York Fashion Week)
 * - LFW (London Fashion Week)
 * - MFW (Milan Fashion Week)
 * - PFW (Paris Fashion Week)
 *
 * Each runs twice yearly: February (Fall/Winter) and September (Spring/Summer)
 */

export type FashionWeekCity = 'New_York' | 'London' | 'Milan' | 'Paris';

export interface FashionWeekConfig {
  city: FashionWeekCity;
  name: string;
  shortName: string;
  months: number[]; // 1-12 (Feb=2, Sept=9)
  // Typical week within month (1=first week, 2=second, etc.)
  typicalWeek: number;
  // Duration in days
  durationDays: number;
  targetFeeds: string[];
  vibe: string;
  // Official schedule source
  scheduleSource: {
    name: string;
    url: string;
    calendarUrl?: string;
  };
  // Key venues and their neighborhoods
  venues: {
    name: string;
    address: string;
    neighborhoodId: string;
  }[];
  // Street style hotspots
  hotspots: {
    location: string;
    neighborhoodId: string;
    description: string;
  }[];
}

export const FASHION_CALENDAR: FashionWeekConfig[] = [
  {
    city: 'New_York',
    name: 'New York Fashion Week',
    shortName: 'NYFW',
    months: [2, 9], // February & September
    typicalWeek: 2, // Second week of month
    durationDays: 7,
    targetFeeds: ['nyc-soho', 'nyc-tribeca', 'nyc-chelsea', 'nyc-meatpacking', 'nyc-west-village'],
    vibe: 'Gridlock, Models, Paparazzi. Spring Studios chaos.',
    scheduleSource: {
      name: 'NYFW Official',
      url: 'https://nyfw.com',
      calendarUrl: 'https://cfda.com/fashion-calendar',
    },
    venues: [
      { name: 'Spring Studios', address: '50 Varick St', neighborhoodId: 'nyc-tribeca' },
      { name: 'Skylight Clarkson', address: '550 Washington St', neighborhoodId: 'nyc-west-village' },
      { name: 'Pier 59 Studios', address: '23rd St & West Side Hwy', neighborhoodId: 'nyc-chelsea' },
      { name: 'Industria', address: '775 Washington St', neighborhoodId: 'nyc-meatpacking' },
      { name: 'The Shed', address: '545 W 30th St', neighborhoodId: 'nyc-hudson-yards' },
      { name: 'Gotham Hall', address: '1356 Broadway', neighborhoodId: 'nyc-flatiron' },
    ],
    hotspots: [
      { location: 'Spring Studios Entrance', neighborhoodId: 'nyc-tribeca', description: 'Street style central' },
      { location: 'Mercer Street', neighborhoodId: 'nyc-soho', description: 'Model off-duty sightings' },
      { location: 'Gansevoort Plaza', neighborhoodId: 'nyc-meatpacking', description: 'Pre-show crowds' },
    ],
  },
  {
    city: 'London',
    name: 'London Fashion Week',
    shortName: 'LFW',
    months: [2, 9],
    typicalWeek: 2,
    durationDays: 5,
    targetFeeds: ['london-soho', 'london-mayfair', 'london-chelsea', 'london-shoreditch'],
    vibe: 'Edgy, Avant-Garde, Traffic on The Strand. 180 Strand energy.',
    scheduleSource: {
      name: 'British Fashion Council',
      url: 'https://www.britishfashioncouncil.co.uk',
      calendarUrl: 'https://londonfashionweek.co.uk/schedule',
    },
    venues: [
      { name: '180 The Strand', address: '180 Strand', neighborhoodId: 'london-soho' },
      { name: 'BFC Show Space', address: '180 Strand', neighborhoodId: 'london-soho' },
      { name: 'The Store X', address: '180 Strand', neighborhoodId: 'london-soho' },
      { name: 'Freemasons Hall', address: '60 Great Queen St', neighborhoodId: 'london-soho' },
      { name: 'Royal Academy', address: 'Burlington House, Piccadilly', neighborhoodId: 'london-mayfair' },
      { name: 'Truman Brewery', address: '91 Brick Ln', neighborhoodId: 'london-shoreditch' },
    ],
    hotspots: [
      { location: '180 Strand Entrance', neighborhoodId: 'london-soho', description: 'Main hub, street style photographers' },
      { location: 'Dover Street', neighborhoodId: 'london-mayfair', description: 'Luxury brand showrooms' },
      { location: 'Brick Lane', neighborhoodId: 'london-shoreditch', description: 'Emerging designer showcases' },
    ],
  },
  {
    city: 'Milan',
    name: 'Milan Fashion Week',
    shortName: 'MFW',
    months: [2, 9],
    typicalWeek: 3, // Third week (after London)
    durationDays: 6,
    targetFeeds: ['milan-brera', 'milan-quadrilatero', 'milan-porta-nuova'],
    vibe: 'The Industry, Black Cars, Italian Glamour. Via Montenapoleone gridlock.',
    scheduleSource: {
      name: 'Camera Nazionale della Moda Italiana',
      url: 'https://www.cameramoda.it',
      calendarUrl: 'https://www.cameramoda.it/en/calendar/',
    },
    venues: [
      { name: 'Palazzo Serbelloni', address: 'Corso Venezia 16', neighborhoodId: 'milan-quadrilatero' },
      { name: 'Fondazione Prada', address: 'Largo Isarco 2', neighborhoodId: 'milan-porta-nuova' },
      { name: 'Armani/Teatro', address: 'Via Bergognone 59', neighborhoodId: 'milan-porta-nuova' },
      { name: 'Palazzo Reale', address: 'Piazza del Duomo 12', neighborhoodId: 'milan-brera' },
      { name: 'Superstudio Più', address: 'Via Tortona 27', neighborhoodId: 'milan-porta-nuova' },
    ],
    hotspots: [
      { location: 'Via Montenapoleone', neighborhoodId: 'milan-quadrilatero', description: 'Fashion elite sightings' },
      { location: 'Piazza del Duomo', neighborhoodId: 'milan-brera', description: 'Street style photographers' },
      { location: 'Via Tortona', neighborhoodId: 'milan-porta-nuova', description: 'Showroom district' },
    ],
  },
  {
    city: 'Paris',
    name: 'Paris Fashion Week',
    shortName: 'PFW',
    months: [1, 2, 6, 9], // Jan (Mens), Feb (Womens), June (Mens), Sept (Womens)
    typicalWeek: 4, // Last week (Grand Finale)
    durationDays: 9,
    targetFeeds: ['paris-le-marais', 'paris-saint-germain-des-pres', 'paris-1st-arrondissement', 'paris-8th-arrondissement'],
    vibe: 'The Grand Finale, impossible traffic at Concorde. Tuileries chaos.',
    scheduleSource: {
      name: 'Fédération de la Haute Couture et de la Mode',
      url: 'https://fhcm.paris',
      calendarUrl: 'https://fhcm.paris/en/calendars',
    },
    venues: [
      { name: 'Palais de Tokyo', address: '13 Avenue du Président Wilson', neighborhoodId: 'paris-8th-arrondissement' },
      { name: 'Grand Palais', address: '3 Avenue du Général Eisenhower', neighborhoodId: 'paris-8th-arrondissement' },
      { name: 'Jardin des Tuileries', address: 'Place de la Concorde', neighborhoodId: 'paris-1st-arrondissement' },
      { name: 'Musée Rodin', address: '77 Rue de Varenne', neighborhoodId: 'paris-saint-germain-des-pres' },
      { name: 'Carreau du Temple', address: '4 Rue Eugène Spuller', neighborhoodId: 'paris-le-marais' },
      { name: 'Palais Royal', address: '8 Rue de Montpensier', neighborhoodId: 'paris-1st-arrondissement' },
    ],
    hotspots: [
      { location: 'Tuileries Gardens', neighborhoodId: 'paris-1st-arrondissement', description: 'Main show venue, impossible traffic' },
      { location: 'Place Vendôme', neighborhoodId: 'paris-1st-arrondissement', description: 'Luxury house headquarters' },
      { location: 'Rue Saint-Honoré', neighborhoodId: 'paris-1st-arrondissement', description: 'Street style central' },
      { location: 'Café de Flore', neighborhoodId: 'paris-saint-germain-des-pres', description: 'Industry power lunches' },
    ],
  },
];

/**
 * Haute Couture calendar (January & July)
 * Separate from ready-to-wear but shares Paris infrastructure
 */
export const HAUTE_COUTURE_WINDOWS = {
  spring: { month: 1, week: 4 }, // Late January
  fall: { month: 7, week: 1 }, // Early July
};

/**
 * Get all neighborhoods that need Fashion Week coverage
 */
export function getAllFashionWeekNeighborhoods(): string[] {
  const neighborhoods = new Set<string>();
  for (const config of FASHION_CALENDAR) {
    config.targetFeeds.forEach((n) => neighborhoods.add(n));
    config.venues.forEach((v) => neighborhoods.add(v.neighborhoodId));
    config.hotspots.forEach((h) => neighborhoods.add(h.neighborhoodId));
  }
  return Array.from(neighborhoods);
}

/**
 * Get fashion week config for a specific city
 */
export function getFashionWeekConfig(city: FashionWeekCity): FashionWeekConfig | undefined {
  return FASHION_CALENDAR.find((c) => c.city === city);
}
