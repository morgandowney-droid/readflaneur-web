/**
 * Fetch neighborhood boundaries from OpenStreetMap Nominatim API
 *
 * Run with: node scripts/fetch-boundaries.mjs
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load from .env.local
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NOMINATIM_API = 'https://nominatim.openstreetmap.org/search';

async function fetchBoundary(neighborhood) {
  const query = `${neighborhood.name}, ${neighborhood.city}, ${neighborhood.country || ''}`;

  try {
    const url = new URL(NOMINATIM_API);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('polygon_geojson', '1');
    url.searchParams.set('limit', '1');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Flaneur/1.0 (neighborhood news platform)',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${neighborhood.name}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      console.log(`No results for ${neighborhood.name}, ${neighborhood.city}`);
      return null;
    }

    const result = data[0];

    if (!result.geojson) {
      console.log(`No polygon for ${neighborhood.name}, ${neighborhood.city}`);
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
      console.log(`Unsupported geometry type for ${neighborhood.name}: ${geojson.type}`);
      return null;
    }

    // Simplify polygon if too many points
    if (coordinates.length > 20) {
      const step = Math.ceil(coordinates.length / 15);
      coordinates = coordinates.filter((_, i) => i % step === 0);
    }

    return coordinates;
  } catch (error) {
    console.error(`Error fetching ${neighborhood.name}:`, error.message);
    return null;
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials.');
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: neighborhoods, error } = await supabase
    .from('neighborhoods')
    .select('id, name, city, country, latitude, longitude')
    .order('city');

  if (error || !neighborhoods) {
    console.error('Failed to fetch neighborhoods:', error);
    process.exit(1);
  }

  console.log(`Fetching boundaries for ${neighborhoods.length} neighborhoods...`);
  console.log('(This will take ~2 minutes due to API rate limits)\n');

  const boundaries = {};

  for (let i = 0; i < neighborhoods.length; i++) {
    const hood = neighborhoods[i];
    process.stdout.write(`[${i + 1}/${neighborhoods.length}] ${hood.name}, ${hood.city}... `);

    const polygon = await fetchBoundary(hood);

    if (polygon && polygon.length >= 4) {
      boundaries[hood.id] = {
        id: hood.id,
        name: hood.name,
        city: hood.city,
        center: [hood.latitude, hood.longitude],
        zoom: 14,
        polygon: polygon,
        adjacentNeighborhoods: [],
      };
      console.log(`✓ (${polygon.length} points)`);
    } else {
      console.log('✗');
    }

    // Rate limit: Nominatim requires 1 request per second
    await new Promise(resolve => setTimeout(resolve, 1100));
  }

  // Generate TypeScript file
  const output = `// Auto-generated neighborhood boundaries from OpenStreetMap
// Generated: ${new Date().toISOString()}
// Source: Nominatim API (OpenStreetMap)

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

  const outputPath = join(__dirname, '..', 'src', 'lib', 'neighborhood-boundaries.ts');
  fs.writeFileSync(outputPath, output);

  console.log(`\n✓ Generated ${Object.keys(boundaries).length} boundaries`);
  console.log(`✓ Output: src/lib/neighborhood-boundaries.ts`);
}

main().catch(console.error);
