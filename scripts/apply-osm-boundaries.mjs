/**
 * Apply verified OSM boundaries to neighborhood-boundaries.ts
 */

import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// City bounding boxes for validation
const CITY_BOUNDS = {
  'New York': { minLat: 40.68, maxLat: 40.88, minLon: -74.05, maxLon: -73.85 },
  'London': { minLat: 51.40, maxLat: 51.60, minLon: -0.25, maxLon: 0.10 },
  'Paris': { minLat: 48.80, maxLat: 48.92, minLon: 2.20, maxLon: 2.50 },
  'Berlin': { minLat: 52.40, maxLat: 52.60, minLon: 13.20, maxLon: 13.60 },
  'San Francisco': { minLat: 37.70, maxLat: 37.85, minLon: -122.55, maxLon: -122.35 },
  'Amsterdam': { minLat: 52.30, maxLat: 52.45, minLon: 4.75, maxLon: 5.00 },
  'Tokyo': { minLat: 35.55, maxLat: 35.80, minLon: 139.55, maxLon: 139.95 },
};

// Check if polygon is within city bounds
function isValidPolygon(polygon, city) {
  const bounds = CITY_BOUNDS[city];
  if (!bounds) return true; // No validation if no bounds defined

  const lats = polygon.map(p => p[0]);
  const lons = polygon.map(p => p[1]);
  const avgLat = lats.reduce((a, b) => a + b) / lats.length;
  const avgLon = lons.reduce((a, b) => a + b) / lons.length;

  return avgLat >= bounds.minLat && avgLat <= bounds.maxLat &&
         avgLon >= bounds.minLon && avgLon <= bounds.maxLon;
}

// Read OSM results
const osmResultsPath = join(__dirname, 'osm-boundaries-by-id.json');
const osmResults = JSON.parse(fs.readFileSync(osmResultsPath, 'utf-8'));

// Read current boundaries
const boundariesPath = join(__dirname, '..', 'src', 'lib', 'neighborhood-boundaries.ts');
const content = fs.readFileSync(boundariesPath, 'utf-8');

const match = content.match(/NEIGHBORHOOD_BOUNDARIES.*?= ({[\s\S]+});/);
if (!match) {
  console.error('Could not parse boundaries file');
  process.exit(1);
}

const boundaries = JSON.parse(match[1]);

// Apply validated boundaries
let applied = 0;
let skipped = 0;

console.log('Applying OSM boundaries (Wikipedia map source)...\n');

for (const result of osmResults.success) {
  const id = result.id;

  // Validate coordinates are in correct city
  if (!isValidPolygon(result.polygon, result.city)) {
    console.log(`❌ SKIPPED ${result.name} - coordinates outside ${result.city} bounds (wrong OSM relation?)`);
    skipped++;
    continue;
  }

  if (boundaries[id]) {
    // Update polygon with OSM coordinates
    boundaries[id].polygon = result.polygon;

    // Update center to be centroid of new polygon
    const lats = result.polygon.map(p => p[0]);
    const lons = result.polygon.map(p => p[1]);
    const centerLat = lats.reduce((a, b) => a + b) / lats.length;
    const centerLon = lons.reduce((a, b) => a + b) / lons.length;
    boundaries[id].center = [centerLat, centerLon];

    console.log(`✓ Updated ${result.name} (${result.polygon.length} points, OSM relation ${result.osmId})`);
    applied++;
  } else {
    console.log(`⚠ ${result.name} not found in boundaries file (id: ${id})`);
  }
}

// Write back
const output = `// Neighborhood boundaries from OpenStreetMap (same source as Wikipedia maps)
// Generated: ${new Date().toISOString()}
// Source: OSM relations via Overpass API

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

fs.writeFileSync(boundariesPath, output);

console.log(`\n${'='.repeat(50)}`);
console.log(`✓ Applied: ${applied} neighborhoods`);
console.log(`✗ Skipped: ${skipped} neighborhoods (wrong coordinates)`);
console.log(`File saved: ${boundariesPath}`);
