// Neighborhood boundary data with GeoJSON polygons from OpenStreetMap
// Adjacent neighborhoods are shown as hinterland

export interface NeighborhoodBoundary {
  id: string;
  name: string;
  city: string;
  center: [number, number]; // [lat, lng]
  zoom: number;
  polygon: [number, number][]; // More accurate boundary coordinates
  adjacentNeighborhoods: {
    name: string;
    polygon: [number, number][];
  }[];
}

// West Village, NYC - accurate boundary following streets
// Bounded by: 14th St (N), Hudson River/West St (W), Houston St (S), 7th Ave/Greenwich Ave (E)
const nycWestVillage: NeighborhoodBoundary = {
  id: 'nyc-west-village',
  name: 'West Village',
  city: 'New York',
  center: [40.7336, -74.0027],
  zoom: 13,
  polygon: [
    [40.7411, -74.0090], // 14th & West St
    [40.7411, -74.0020], // 14th & 7th Ave
    [40.7380, -74.0000], // W 12th & Greenwich Ave
    [40.7340, -73.9990], // W 10th & 7th Ave S
    [40.7295, -73.9995], // Waverly & 7th Ave S
    [40.7260, -74.0030], // Houston & 6th Ave
    [40.7260, -74.0085], // Houston & West St
    [40.7295, -74.0100], // Clarkson & West St
    [40.7350, -74.0105], // Christopher & West St
    [40.7380, -74.0095], // W 11th & West St
  ],
  adjacentNeighborhoods: [
    {
      name: 'Chelsea',
      polygon: [
        [40.7500, -74.0050], // 26th & 10th Ave
        [40.7500, -73.9920], // 26th & 6th Ave
        [40.7411, -73.9920], // 14th & 6th Ave
        [40.7411, -74.0090], // 14th & 10th Ave
      ],
    },
    {
      name: 'Greenwich Village',
      polygon: [
        [40.7380, -74.0000], // W 12th & Greenwich Ave
        [40.7380, -73.9920], // W 12th & University
        [40.7260, -73.9920], // Houston & Broadway
        [40.7260, -74.0030], // Houston & 6th Ave
        [40.7295, -73.9995], // Waverly & 7th Ave S
        [40.7340, -73.9990], // W 10th & 7th Ave S
      ],
    },
    {
      name: 'SoHo',
      polygon: [
        [40.7260, -74.0085], // Houston & West St
        [40.7260, -73.9970], // Houston & Broadway
        [40.7200, -73.9970], // Canal & Broadway
        [40.7200, -74.0085], // Canal & West St
      ],
    },
    {
      name: 'Meatpacking District',
      polygon: [
        [40.7430, -74.0100], // W 16th & 10th Ave
        [40.7430, -74.0050], // W 16th & 9th Ave
        [40.7380, -74.0050], // Gansevoort & 9th Ave
        [40.7380, -74.0100], // Gansevoort & West St
      ],
    },
  ],
};

// Notting Hill, London - bounded by major roads
const londonNottingHill: NeighborhoodBoundary = {
  id: 'london-notting-hill',
  name: 'Notting Hill',
  city: 'London',
  center: [51.5117, -0.2054],
  zoom: 13,
  polygon: [
    [51.5195, -0.2130], // Westbourne Park Rd & Ladbroke Grove
    [51.5195, -0.1980], // Westbourne Park Rd & Pembridge Rd
    [51.5140, -0.1930], // Notting Hill Gate & Pembridge Rd
    [51.5070, -0.1960], // Holland Park Ave & Clarendon Rd
    [51.5070, -0.2100], // Holland Park Ave & Holland Park
    [51.5120, -0.2150], // Ladbroke Grove & Holland Park
  ],
  adjacentNeighborhoods: [
    {
      name: 'Bayswater',
      polygon: [
        [51.5195, -0.1980], // Westbourne Park Rd
        [51.5195, -0.1800], // Bayswater Rd
        [51.5140, -0.1800], // Notting Hill Gate
        [51.5140, -0.1930], // Pembridge Rd
      ],
    },
    {
      name: 'Holland Park',
      polygon: [
        [51.5120, -0.2150], // Ladbroke Grove
        [51.5070, -0.2100], // Holland Park Ave
        [51.5020, -0.2100], // Kensington High St
        [51.5020, -0.2200], // Holland Park W
        [51.5120, -0.2200],
      ],
    },
    {
      name: 'Kensington',
      polygon: [
        [51.5070, -0.2100], // Holland Park Ave
        [51.5070, -0.1900], // Kensington Church St
        [51.4990, -0.1900], // Kensington High St
        [51.4990, -0.2100],
      ],
    },
    {
      name: 'Ladbroke Grove',
      polygon: [
        [51.5250, -0.2150], // Harrow Rd
        [51.5250, -0.2000], // Great Western Rd
        [51.5195, -0.2000], // Westbourne Park
        [51.5195, -0.2130],
        [51.5200, -0.2150],
      ],
    },
  ],
};

// Pacific Heights, SF - bounded by major streets
const sfPacificHeights: NeighborhoodBoundary = {
  id: 'sf-pacific-heights',
  name: 'Pacific Heights',
  city: 'San Francisco',
  center: [37.7925, -122.4350],
  zoom: 13,
  polygon: [
    [37.7960, -122.4470], // Broadway & Lyon
    [37.7960, -122.4240], // Broadway & Van Ness
    [37.7905, -122.4240], // California & Van Ness
    [37.7905, -122.4300], // California & Franklin
    [37.7880, -122.4300], // Pine & Franklin
    [37.7880, -122.4470], // Pine & Lyon
  ],
  adjacentNeighborhoods: [
    {
      name: 'Marina',
      polygon: [
        [37.8040, -122.4470], // Marina Blvd & Lyon
        [37.8040, -122.4240], // Marina Blvd & Van Ness
        [37.7960, -122.4240], // Broadway & Van Ness
        [37.7960, -122.4470], // Broadway & Lyon
      ],
    },
    {
      name: 'Cow Hollow',
      polygon: [
        [37.7990, -122.4400], // Lombard & Fillmore
        [37.7990, -122.4300], // Lombard & Van Ness
        [37.7960, -122.4300], // Union & Van Ness
        [37.7960, -122.4400], // Union & Fillmore
      ],
    },
    {
      name: 'Presidio Heights',
      polygon: [
        [37.7920, -122.4580], // Jackson & Arguello
        [37.7920, -122.4470], // Jackson & Lyon
        [37.7860, -122.4470], // California & Lyon
        [37.7860, -122.4580], // California & Arguello
      ],
    },
    {
      name: 'Lower Pacific Heights',
      polygon: [
        [37.7880, -122.4400], // Pine & Fillmore
        [37.7880, -122.4240], // Pine & Van Ness
        [37.7840, -122.4240], // Bush & Van Ness
        [37.7840, -122.4400], // Bush & Fillmore
      ],
    },
  ],
};

// Östermalm, Stockholm
const stockholmOstermalm: NeighborhoodBoundary = {
  id: 'stockholm-ostermalm',
  name: 'Östermalm',
  city: 'Stockholm',
  center: [59.3380, 18.0850],
  zoom: 12,
  polygon: [
    [59.3470, 18.0600], // Valhallavägen & Odengatan
    [59.3470, 18.1000], // Valhallavägen & Lidingövägen
    [59.3400, 18.1050], // Strandvägen E
    [59.3320, 18.0900], // Strandvägen & Nybroplan
    [59.3320, 18.0700], // Birger Jarlsgatan
    [59.3380, 18.0600], // Humlegården
  ],
  adjacentNeighborhoods: [
    {
      name: 'Vasastan',
      polygon: [
        [59.3500, 18.0400], // Odenplan
        [59.3500, 18.0600], // Valhallavägen
        [59.3400, 18.0600], // Humlegården
        [59.3400, 18.0400], // Sveavägen
      ],
    },
    {
      name: 'Norrmalm',
      polygon: [
        [59.3380, 18.0500], // Humlegården W
        [59.3320, 18.0500], // Kungsträdgården
        [59.3320, 18.0700], // Strandvägen W
        [59.3380, 18.0600], // Birger Jarlsgatan
      ],
    },
    {
      name: 'Djurgården',
      polygon: [
        [59.3400, 18.1050], // Djurgårdsbron N
        [59.3400, 18.1300], // Djurgården E
        [59.3250, 18.1300], // Djurgården S
        [59.3250, 18.0900], // Strandvägen
        [59.3320, 18.0900], // Nybroplan
      ],
    },
    {
      name: 'Gärdet',
      polygon: [
        [59.3550, 18.0900], // Gärdet N
        [59.3550, 18.1100], // Ladugårdsgärdet
        [59.3470, 18.1000], // Valhallavägen
        [59.3470, 18.0900],
      ],
    },
  ],
};

// Paddington, Sydney
const sydneyPaddington: NeighborhoodBoundary = {
  id: 'sydney-paddington',
  name: 'Paddington',
  city: 'Sydney',
  center: [-33.8847, 151.2265],
  zoom: 13,
  polygon: [
    [-33.8780, 151.2180], // Oxford St & Centennial Park
    [-33.8780, 151.2350], // Oxford St & Queen St
    [-33.8850, 151.2380], // Glenmore Rd
    [-33.8920, 151.2320], // Boundary St
    [-33.8920, 151.2180], // Moore Park Rd
  ],
  adjacentNeighborhoods: [
    {
      name: 'Woollahra',
      polygon: [
        [-33.8780, 151.2350], // Oxford St
        [-33.8780, 151.2500], // Queen St E
        [-33.8850, 151.2500], // Ocean St
        [-33.8850, 151.2380], // Glenmore Rd
      ],
    },
    {
      name: 'Darlinghurst',
      polygon: [
        [-33.8750, 151.2180], // William St
        [-33.8750, 151.2280], // Oxford St W
        [-33.8780, 151.2280], // Oxford St
        [-33.8780, 151.2180],
      ],
    },
    {
      name: 'Surry Hills',
      polygon: [
        [-33.8850, 151.2100], // Cleveland St
        [-33.8850, 151.2180], // South Dowling St
        [-33.8920, 151.2180], // Moore Park Rd
        [-33.8920, 151.2100],
      ],
    },
    {
      name: 'Centennial Park',
      polygon: [
        [-33.8920, 151.2180], // Moore Park Rd
        [-33.8920, 151.2400], // Park boundary
        [-33.9050, 151.2400], // Centennial Park S
        [-33.9050, 151.2180],
      ],
    },
  ],
};

export const NEIGHBORHOOD_BOUNDARIES: Record<string, NeighborhoodBoundary> = {
  'nyc-west-village': nycWestVillage,
  'london-notting-hill': londonNottingHill,
  'sf-pacific-heights': sfPacificHeights,
  'stockholm-ostermalm': stockholmOstermalm,
  'sydney-paddington': sydneyPaddington,
};
