/**
 * Fetch NYC neighborhood boundaries with more specific queries
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NOMINATIM_API = 'https://nominatim.openstreetmap.org/search';

// NYC neighborhoods with specific search queries
const NYC_NEIGHBORHOODS = [
  { id: 'nyc-tribeca', name: 'Tribeca', query: 'Tribeca, Manhattan, New York City' },
  { id: 'nyc-soho', name: 'SoHo', query: 'SoHo, Manhattan, New York City' },
  { id: 'nyc-williamsburg', name: 'Williamsburg', query: 'Williamsburg, Brooklyn, New York City' },
  { id: 'nyc-greenwich-village', name: 'Greenwich Village', query: 'Greenwich Village, Manhattan, New York City' },
  { id: 'nyc-upper-east-side', name: 'Upper East Side', query: 'Upper East Side, Manhattan, New York City' },
  { id: 'nyc-chelsea', name: 'Chelsea', query: 'Chelsea, Manhattan, New York City' },
];

async function fetchBoundary(neighborhood) {
  try {
    const url = new URL(NOMINATIM_API);
    url.searchParams.set('q', neighborhood.query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('polygon_geojson', '1');
    url.searchParams.set('limit', '1');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Flaneur/1.0 (neighborhood news platform; contact@readflaneur.com)',
      },
    });

    if (!response.ok) {
      console.error(`Failed: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      console.log(`No results`);
      return null;
    }

    const result = data[0];
    console.log(`  Found: ${result.display_name}`);
    console.log(`  Type: ${result.geojson?.type || 'no geojson'}`);

    if (!result.geojson) {
      return null;
    }

    const geojson = result.geojson;
    let coordinates = [];

    if (geojson.type === 'Polygon') {
      coordinates = geojson.coordinates[0].map((coord) => [coord[1], coord[0]]);
    } else if (geojson.type === 'MultiPolygon') {
      let largest = geojson.coordinates[0][0];
      for (const poly of geojson.coordinates) {
        if (poly[0].length > largest.length) {
          largest = poly[0];
        }
      }
      coordinates = largest.map((coord) => [coord[1], coord[0]]);
    } else {
      return null;
    }

    // Simplify if needed
    if (coordinates.length > 20) {
      const step = Math.ceil(coordinates.length / 15);
      coordinates = coordinates.filter((_, i) => i % step === 0);
    }

    return {
      polygon: coordinates,
      center: [parseFloat(result.lat), parseFloat(result.lon)],
    };
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Fetching NYC neighborhood boundaries...\n');

  const results = {};

  for (const hood of NYC_NEIGHBORHOODS) {
    console.log(`${hood.name}...`);
    const boundary = await fetchBoundary(hood);

    if (boundary && boundary.polygon.length >= 4) {
      results[hood.id] = {
        id: hood.id,
        name: hood.name,
        city: 'New York',
        center: boundary.center,
        zoom: 14,
        polygon: boundary.polygon,
        adjacentNeighborhoods: [],
      };
      console.log(`  ✓ Got ${boundary.polygon.length} points\n`);
    } else {
      console.log(`  ✗ No polygon data\n`);
    }

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 1100));
  }

  console.log('\nResults:');
  console.log(JSON.stringify(results, null, 2));

  // If we got results, show how to add them
  if (Object.keys(results).length > 0) {
    console.log('\n\nAdd these to src/lib/neighborhood-boundaries.ts');
  }
}

main().catch(console.error);
