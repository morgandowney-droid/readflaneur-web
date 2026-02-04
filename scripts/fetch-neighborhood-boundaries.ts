/**
 * Fetch neighborhood boundaries from OpenStreetMap Nominatim API
 *
 * Run with: npx ts-node scripts/fetch-neighborhood-boundaries.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const NOMINATIM_API = 'https://nominatim.openstreetmap.org/search';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface BoundaryResult {
  id: string;
  name: string;
  city: string;
  center: [number, number];
  zoom: number;
  polygon: [number, number][];
  adjacentNeighborhoods: { name: string; polygon: [number, number][] }[];
}

async function fetchBoundary(neighborhood: Neighborhood): Promise<[number, number][] | null> {
  const query = `${neighborhood.name}, ${neighborhood.city}, ${neighborhood.country}`;

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

    const data = await response.json() as Array<{
      geojson?: {
        type: string;
        coordinates: number[][][] | number[][][][];
      };
    }>;

    if (!data || data.length === 0) {
      console.log(`No results for ${neighborhood.name}, ${neighborhood.city}`);
      return null;
    }

    const result = data[0];

    if (!result.geojson) {
      console.log(`No polygon for ${neighborhood.name}, ${neighborhood.city}`);
      return null;
    }

    // Extract coordinates from GeoJSON
    const geojson = result.geojson!;
    let coordinates: [number, number][] = [];

    if (geojson.type === 'Polygon') {
      // Take the outer ring, swap lng/lat to lat/lng
      const coords = geojson.coordinates as number[][][];
      coordinates = coords[0].map((coord) => [coord[1], coord[0]] as [number, number]);
    } else if (geojson.type === 'MultiPolygon') {
      // Take the largest polygon
      const multiCoords = geojson.coordinates as number[][][][];
      let largest = multiCoords[0][0];
      for (const poly of multiCoords) {
        if (poly[0].length > largest.length) {
          largest = poly[0];
        }
      }
      coordinates = largest.map((coord) => [coord[1], coord[0]] as [number, number]);
    } else {
      console.log(`Unsupported geometry type for ${neighborhood.name}: ${geojson.type}`);
      return null;
    }

    // Simplify polygon if too many points (keep every Nth point)
    if (coordinates.length > 20) {
      const step = Math.ceil(coordinates.length / 15);
      coordinates = coordinates.filter((_, i) => i % step === 0);
    }

    return coordinates;
  } catch (error) {
    console.error(`Error fetching ${neighborhood.name}:`, error);
    return null;
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch all neighborhoods
  const { data: neighborhoods, error } = await supabase
    .from('neighborhoods')
    .select('id, name, city, country, latitude, longitude')
    .order('city');

  if (error || !neighborhoods) {
    console.error('Failed to fetch neighborhoods:', error);
    process.exit(1);
  }

  console.log(`Fetching boundaries for ${neighborhoods.length} neighborhoods...`);

  const boundaries: Record<string, BoundaryResult> = {};

  for (const hood of neighborhoods) {
    console.log(`Fetching: ${hood.name}, ${hood.city}...`);

    const polygon = await fetchBoundary(hood);

    if (polygon && polygon.length >= 4) {
      boundaries[hood.id] = {
        id: hood.id,
        name: hood.name,
        city: hood.city,
        center: [hood.latitude, hood.longitude],
        zoom: 14,
        polygon: polygon,
        adjacentNeighborhoods: [], // Would need separate queries for each adjacent area
      };
      console.log(`  ✓ Got ${polygon.length} points`);
    } else {
      console.log(`  ✗ No boundary found`);
    }

    // Rate limit: Nominatim requires 1 request per second
    await new Promise(resolve => setTimeout(resolve, 1100));
  }

  // Generate TypeScript file
  const output = `// Auto-generated neighborhood boundaries from OpenStreetMap
// Generated: ${new Date().toISOString()}

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

  const outputPath = path.join(__dirname, '..', 'src', 'lib', 'neighborhood-boundaries-generated.ts');
  fs.writeFileSync(outputPath, output);

  console.log(`\nGenerated ${Object.keys(boundaries).length} boundaries`);
  console.log(`Output: ${outputPath}`);
}

main().catch(console.error);
