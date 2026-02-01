/**
 * Add manually defined boundaries for neighborhoods missing from OSM
 * Based on known street boundaries
 */

import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read existing boundaries
const content = fs.readFileSync(join(__dirname, '..', 'src', 'lib', 'neighborhood-boundaries.ts'), 'utf-8');
const match = content.match(/= ({[\s\S]+});/);
const boundaries = JSON.parse(match[1]);

// Manually defined boundaries for neighborhoods missing from OSM
const manualBoundaries = {
  // Tribeca, NYC - Canal St (N), West St (W), Vesey St (S), Broadway (E)
  "nyc-tribeca": {
    id: "nyc-tribeca",
    name: "Tribeca",
    city: "New York",
    center: [40.7163, -74.0086],
    zoom: 14,
    polygon: [
      [40.7222, -74.0100], [40.7222, -74.0025], [40.7152, -74.0025],
      [40.7115, -74.0020], [40.7115, -74.0130], [40.7152, -74.0135],
      [40.7180, -74.0120]
    ],
    adjacentNeighborhoods: []
  },

  // SoHo, NYC - Houston St (N), West Broadway (W), Canal St (S), Lafayette (E)
  "nyc-soho": {
    id: "nyc-soho",
    name: "SoHo",
    city: "New York",
    center: [40.7233, -74.0000],
    zoom: 14,
    polygon: [
      [40.7270, -74.0050], [40.7270, -73.9960], [40.7220, -73.9960],
      [40.7220, -74.0050]
    ],
    adjacentNeighborhoods: []
  },

  // Greenwich Village, NYC - 14th St (N), 7th Ave (W), Houston St (S), Broadway (E)
  "nyc-greenwich-village": {
    id: "nyc-greenwich-village",
    name: "Greenwich Village",
    city: "New York",
    center: [40.7335, -73.9975],
    zoom: 14,
    polygon: [
      [40.7380, -74.0020], [40.7380, -73.9920], [40.7260, -73.9920],
      [40.7260, -74.0020]
    ],
    adjacentNeighborhoods: []
  },

  // The Mission, SF - Cesar Chavez (S), Potrero (E), 14th St (N), Guerrero (W)
  "sf-the-mission": {
    id: "sf-the-mission",
    name: "The Mission",
    city: "San Francisco",
    center: [37.7599, -122.4148],
    zoom: 14,
    polygon: [
      [37.7700, -122.4250], [37.7700, -122.4050], [37.7480, -122.4050],
      [37.7480, -122.4250]
    ],
    adjacentNeighborhoods: []
  },

  // Russian Hill, SF - Francisco St (N), Polk St (E), Broadway (S), Larkin/Hyde (W)
  "sf-russian-hill": {
    id: "sf-russian-hill",
    name: "Russian Hill",
    city: "San Francisco",
    center: [37.8011, -122.4194],
    zoom: 14,
    polygon: [
      [37.8060, -122.4250], [37.8060, -122.4120], [37.7960, -122.4120],
      [37.7960, -122.4250]
    ],
    adjacentNeighborhoods: []
  },

  // Shoreditch, London - Old Street (N), Bethnal Green Rd (E), Liverpool St (S), City Rd (W)
  "london-shoreditch": {
    id: "london-shoreditch",
    name: "Shoreditch",
    city: "London",
    center: [51.5263, -0.0795],
    zoom: 14,
    polygon: [
      [51.5320, -0.0880], [51.5320, -0.0700], [51.5200, -0.0700],
      [51.5200, -0.0880]
    ],
    adjacentNeighborhoods: []
  },

  // Marylebone, London - Marylebone Rd (N), Edgware Rd (W), Oxford St (S), Portland Pl (E)
  "london-marylebone": {
    id: "london-marylebone",
    name: "Marylebone",
    city: "London",
    center: [51.5203, -0.1537],
    zoom: 14,
    polygon: [
      [51.5270, -0.1650], [51.5270, -0.1420], [51.5140, -0.1420],
      [51.5140, -0.1650]
    ],
    adjacentNeighborhoods: []
  },

  // Wicker Park, Chicago
  "chicago-wicker-park": {
    id: "chicago-wicker-park",
    name: "Wicker Park",
    city: "Chicago",
    center: [41.9088, -87.6796],
    zoom: 14,
    polygon: [
      [41.9150, -87.6900], [41.9150, -87.6700], [41.9020, -87.6700],
      [41.9020, -87.6900]
    ],
    adjacentNeighborhoods: []
  },

  // Brickell, Miami
  "miami-brickell": {
    id: "miami-brickell",
    name: "Brickell",
    city: "Miami",
    center: [25.7617, -80.1918],
    zoom: 14,
    polygon: [
      [25.7700, -80.2000], [25.7700, -80.1850], [25.7530, -80.1850],
      [25.7530, -80.2000]
    ],
    adjacentNeighborhoods: []
  },

  // Queen West, Toronto
  "toronto-queen-west": {
    id: "toronto-queen-west",
    name: "Queen West",
    city: "Toronto",
    center: [43.6477, -79.4116],
    zoom: 14,
    polygon: [
      [43.6520, -79.4300], [43.6520, -79.3950], [43.6430, -79.3950],
      [43.6430, -79.4300]
    ],
    adjacentNeighborhoods: []
  },

  // Nørrebro, Copenhagen
  "copenhagen-norrebro": {
    id: "copenhagen-norrebro",
    name: "Nørrebro",
    city: "Copenhagen",
    center: [55.6962, 12.5494],
    zoom: 14,
    polygon: [
      [55.7050, 12.5350], [55.7050, 12.5650], [55.6880, 12.5650],
      [55.6880, 12.5350]
    ],
    adjacentNeighborhoods: []
  },

  // Vesterbro, Copenhagen
  "copenhagen-vesterbro": {
    id: "copenhagen-vesterbro",
    name: "Vesterbro",
    city: "Copenhagen",
    center: [55.6692, 12.5460],
    zoom: 14,
    polygon: [
      [55.6750, 12.5300], [55.6750, 12.5650], [55.6630, 12.5650],
      [55.6630, 12.5300]
    ],
    adjacentNeighborhoods: []
  },

  // El Born, Barcelona
  "barcelona-el-born": {
    id: "barcelona-el-born",
    name: "El Born",
    city: "Barcelona",
    center: [41.3851, 2.1824],
    zoom: 14,
    polygon: [
      [41.3890, 2.1750], [41.3890, 2.1900], [41.3810, 2.1900],
      [41.3810, 2.1750]
    ],
    adjacentNeighborhoods: []
  },

  // Alfama, Lisbon
  "lisbon-alfama": {
    id: "lisbon-alfama",
    name: "Alfama",
    city: "Lisbon",
    center: [38.7118, -9.1305],
    zoom: 14,
    polygon: [
      [38.7160, -9.1380], [38.7160, -9.1230], [38.7080, -9.1230],
      [38.7080, -9.1380]
    ],
    adjacentNeighborhoods: []
  },

  // Chiado, Lisbon
  "lisbon-chiado": {
    id: "lisbon-chiado",
    name: "Chiado",
    city: "Lisbon",
    center: [38.7104, -9.1416],
    zoom: 14,
    polygon: [
      [38.7150, -9.1480], [38.7150, -9.1350], [38.7060, -9.1350],
      [38.7060, -9.1480]
    ],
    adjacentNeighborhoods: []
  },

  // Príncipe Real, Lisbon
  "lisbon-principe-real": {
    id: "lisbon-principe-real",
    name: "Príncipe Real",
    city: "Lisbon",
    center: [38.7169, -9.1480],
    zoom: 14,
    polygon: [
      [38.7210, -9.1550], [38.7210, -9.1400], [38.7130, -9.1400],
      [38.7130, -9.1550]
    ],
    adjacentNeighborhoods: []
  },

  // Porta Nuova, Milan
  "milan-porta-nuova": {
    id: "milan-porta-nuova",
    name: "Porta Nuova",
    city: "Milan",
    center: [45.4847, 9.1910],
    zoom: 14,
    polygon: [
      [45.4900, 9.1850], [45.4900, 9.1980], [45.4790, 9.1980],
      [45.4790, 9.1850]
    ],
    adjacentNeighborhoods: []
  },

  // SoHo, Hong Kong
  "hong-kong-soho": {
    id: "hong-kong-soho",
    name: "SoHo",
    city: "Hong Kong",
    center: [22.2820, 114.1510],
    zoom: 14,
    polygon: [
      [22.2860, 114.1470], [22.2860, 114.1560], [22.2780, 114.1560],
      [22.2780, 114.1470]
    ],
    adjacentNeighborhoods: []
  },

  // Daikanyama, Tokyo
  "tokyo-daikanyama": {
    id: "tokyo-daikanyama",
    name: "Daikanyama",
    city: "Tokyo",
    center: [35.6489, 139.7033],
    zoom: 14,
    polygon: [
      [35.6530, 139.6980], [35.6530, 139.7090], [35.6450, 139.7090],
      [35.6450, 139.6980]
    ],
    adjacentNeighborhoods: []
  },

  // Rothschild Boulevard, Tel Aviv
  "tel-aviv-rothschild": {
    id: "tel-aviv-rothschild",
    name: "Rothschild Boulevard",
    city: "Tel Aviv",
    center: [32.0636, 34.7726],
    zoom: 14,
    polygon: [
      [32.0700, 34.7680], [32.0700, 34.7780], [32.0570, 34.7780],
      [32.0570, 34.7680]
    ],
    adjacentNeighborhoods: []
  }
};

// Merge manual boundaries into existing
for (const [id, boundary] of Object.entries(manualBoundaries)) {
  if (!boundaries[id]) {
    boundaries[id] = boundary;
    console.log(`Added: ${boundary.name}, ${boundary.city}`);
  }
}

// Write updated file
const output = `// Neighborhood boundaries from OpenStreetMap + Manual definitions
// Generated: ${new Date().toISOString()}
// Source: Nominatim API + Overpass API + Manual

export interface NeighborhoodBoundary {
  id: string;
  name: string;
  city: string;
  center: [number, number];
  zoom: number;
  polygon: [number, number][];
  adjacentNeighborhoods: {
    name: string;
    polygon: [number, number][];
  }[];
}

export const NEIGHBORHOOD_BOUNDARIES: Record<string, NeighborhoodBoundary> = ${JSON.stringify(boundaries, null, 2)};
`;

fs.writeFileSync(join(__dirname, '..', 'src', 'lib', 'neighborhood-boundaries.ts'), output);

console.log(`\n✓ Total boundaries: ${Object.keys(boundaries).length}`);
