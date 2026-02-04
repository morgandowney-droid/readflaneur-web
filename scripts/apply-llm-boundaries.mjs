/**
 * Apply LLM-extracted boundaries to neighborhood-boundaries.ts
 */

import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the LLM results
const resultsPath = join(__dirname, 'unified-boundaries-results.json');
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

// Read the current boundaries file
const boundariesPath = join(__dirname, '..', 'src', 'lib', 'neighborhood-boundaries.ts');
const content = fs.readFileSync(boundariesPath, 'utf-8');

// Parse the boundaries object
const match = content.match(/NEIGHBORHOOD_BOUNDARIES.*?= ({[\s\S]+});/);
if (!match) {
  console.error('Could not parse boundaries file');
  process.exit(1);
}

const boundaries = JSON.parse(match[1]);

// Apply LLM boundaries
let updated = 0;
for (const result of results.llm) {
  const id = result.id;

  if (boundaries[id]) {
    // Update polygon with LLM-extracted coordinates
    const oldPolygon = boundaries[id].polygon;
    boundaries[id].polygon = result.polygon;

    // Update center to be the centroid of the new polygon
    const lats = result.polygon.map(p => p[0]);
    const lons = result.polygon.map(p => p[1]);
    const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;
    boundaries[id].center = [centerLat, centerLon];

    console.log(`✓ Updated ${result.name}:`);
    console.log(`  Old polygon: ${oldPolygon.length} points`);
    console.log(`  New polygon: ${result.polygon.length} points`);
    console.log(`  New center: [${centerLat.toFixed(4)}, ${centerLon.toFixed(4)}]`);
    updated++;
  } else {
    console.log(`⚠ Neighborhood ${id} not found in boundaries file`);
  }
}

// Write back
const output = `// Neighborhood boundaries with accurate polygons and hinterlands
// Generated: ${new Date().toISOString()}
// Source: LLM extraction from Wikipedia + manual definitions

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
console.log(`\n✓ Updated ${updated} neighborhoods in ${boundariesPath}`);
