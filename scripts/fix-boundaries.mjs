/**
 * Fix neighborhood boundaries that have wrong coordinates
 * (Overpass API returned similarly-named places from wrong cities)
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

// Correct boundaries for problematic neighborhoods
const fixes = {
  'nyc-west-village': {
    center: [40.7336, -74.0027],
    polygon: [
      [40.7411, -74.0090], [40.7411, -74.0020], [40.7380, -74.0000],
      [40.7260, -74.0030], [40.7260, -74.0085], [40.7350, -74.0105]
    ]
  },
  'nyc-williamsburg': {
    center: [40.7081, -73.9571],
    polygon: [
      [40.7200, -73.9650], [40.7200, -73.9400], [40.7000, -73.9400],
      [40.7000, -73.9650]
    ]
  },
  'nyc-chelsea': {
    center: [40.7465, -74.0014],
    polygon: [
      [40.7550, -74.0100], [40.7550, -73.9900], [40.7400, -73.9900],
      [40.7400, -74.0100]
    ]
  },
  'chicago-gold-coast': {
    center: [41.9050, -87.6280],
    polygon: [
      [41.9120, -87.6350], [41.9120, -87.6200], [41.8980, -87.6200],
      [41.8980, -87.6350]
    ]
  },
  'london-kensington': {
    center: [51.4990, -0.1939],
    polygon: [
      [51.5050, -0.2050], [51.5050, -0.1800], [51.4930, -0.1800],
      [51.4930, -0.2050]
    ]
  },
  'london-notting-hill': {
    center: [51.5117, -0.2054],
    polygon: [
      [51.5195, -0.2130], [51.5195, -0.1980], [51.5070, -0.1960],
      [51.5070, -0.2100]
    ]
  },
  'london-hampstead': {
    center: [51.5557, -0.1780],
    polygon: [
      [51.5650, -0.1900], [51.5650, -0.1650], [51.5450, -0.1650],
      [51.5450, -0.1900]
    ]
  },
  'london-mayfair': {
    center: [51.5099, -0.1478],
    polygon: [
      [51.5150, -0.1550], [51.5150, -0.1400], [51.5050, -0.1400],
      [51.5050, -0.1550]
    ]
  },
  'london-chelsea': {
    center: [51.4875, -0.1687],
    polygon: [
      [51.4950, -0.1800], [51.4950, -0.1550], [51.4800, -0.1550],
      [51.4800, -0.1800]
    ]
  },
  'sf-marina-district': {
    center: [37.8030, -122.4370],
    polygon: [
      [37.8080, -122.4500], [37.8080, -122.4250], [37.7980, -122.4250],
      [37.7980, -122.4500]
    ]
  },
  'sf-pacific-heights': {
    center: [37.7925, -122.4350],
    polygon: [
      [37.7960, -122.4470], [37.7960, -122.4240], [37.7880, -122.4240],
      [37.7880, -122.4470]
    ]
  }
};

for (const [id, fix] of Object.entries(fixes)) {
  if (boundaries[id]) {
    boundaries[id].center = fix.center;
    boundaries[id].polygon = fix.polygon;
    console.log('Fixed:', boundaries[id].name + ',', boundaries[id].city);
  }
}

// Write back
const output = `// Neighborhood boundaries from OpenStreetMap + Manual definitions
// Generated: ${new Date().toISOString()}
// Fixed coordinates for mismatched Overpass results

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
console.log('\n✓ All fixes applied');
