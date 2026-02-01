/**
 * Fetch neighborhood boundaries using OpenStreetMap Overpass API
 * Overpass can return actual polygon geometries that Nominatim doesn't provide
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// Read existing boundaries
const existingBoundaries = JSON.parse(
  fs.readFileSync(join(__dirname, '..', 'src', 'lib', 'neighborhood-boundaries.ts'), 'utf-8')
    .replace(/^[\s\S]*?= /, '')
    .replace(/;[\s\S]*$/, '')
);

async function fetchOverpassBoundary(name, city, country) {
  // Overpass query to find neighbourhood with polygon geometry
  const query = `
    [out:json][timeout:25];
    (
      // Try to find as a relation (administrative boundary)
      relation["name"="${name}"]["place"="neighbourhood"];
      relation["name"="${name}"]["boundary"="administrative"];
      relation["name"="${name}"]["admin_level"];
      // Try as a way (closed polygon)
      way["name"="${name}"]["place"="neighbourhood"];
      // Also try with city context
      relation["name"="${name}"]["is_in"~"${city}",i];
    );
    out geom;
  `;

  try {
    const response = await fetch(OVERPASS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Flaneur/1.0 (neighborhood news platform)',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      console.log(`  API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.elements || data.elements.length === 0) {
      return null;
    }

    // Find the first element with geometry
    for (const element of data.elements) {
      if (element.type === 'relation' && element.members) {
        // Extract outer way coordinates from relation
        const outerWays = element.members.filter(m => m.role === 'outer' && m.geometry);
        if (outerWays.length > 0) {
          let coordinates = [];
          for (const way of outerWays) {
            coordinates = coordinates.concat(
              way.geometry.map(p => [p.lat, p.lon])
            );
          }
          // Simplify
          if (coordinates.length > 20) {
            const step = Math.ceil(coordinates.length / 15);
            coordinates = coordinates.filter((_, i) => i % step === 0);
          }
          return coordinates;
        }
      } else if (element.type === 'way' && element.geometry) {
        let coordinates = element.geometry.map(p => [p.lat, p.lon]);
        if (coordinates.length > 20) {
          const step = Math.ceil(coordinates.length / 15);
          coordinates = coordinates.filter((_, i) => i % step === 0);
        }
        return coordinates;
      }
    }

    return null;
  } catch (error) {
    console.log(`  Error: ${error.message}`);
    return null;
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
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

  // Find neighborhoods missing from existing boundaries
  const missing = neighborhoods.filter(n => !existingBoundaries[n.id]);
  console.log(`Found ${missing.length} neighborhoods without boundaries\n`);

  const newBoundaries = { ...existingBoundaries };
  let added = 0;

  for (const hood of missing) {
    process.stdout.write(`${hood.name}, ${hood.city}... `);

    const polygon = await fetchOverpassBoundary(hood.name, hood.city, hood.country);

    if (polygon && polygon.length >= 4) {
      newBoundaries[hood.id] = {
        id: hood.id,
        name: hood.name,
        city: hood.city,
        center: [hood.latitude, hood.longitude],
        zoom: 14,
        polygon: polygon,
        adjacentNeighborhoods: [],
      };
      console.log(`✓ (${polygon.length} points)`);
      added++;
    } else {
      console.log('✗');
    }

    // Rate limit - Overpass allows ~2 requests per second
    await new Promise(resolve => setTimeout(resolve, 600));
  }

  // Write updated boundaries
  const output = `// Neighborhood boundaries from OpenStreetMap
// Generated: ${new Date().toISOString()}
// Source: Nominatim API + Overpass API

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

export const NEIGHBORHOOD_BOUNDARIES: Record<string, NeighborhoodBoundary> = ${JSON.stringify(newBoundaries, null, 2)};
`;

  const outputPath = join(__dirname, '..', 'src', 'lib', 'neighborhood-boundaries.ts');
  fs.writeFileSync(outputPath, output);

  console.log(`\n✓ Added ${added} new boundaries`);
  console.log(`✓ Total: ${Object.keys(newBoundaries).length} boundaries`);
}

main().catch(console.error);
