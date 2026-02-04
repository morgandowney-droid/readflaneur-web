/**
 * Fetch neighborhood boundaries directly from OpenStreetMap
 *
 * Search OSM for neighborhood relations by name within city bounding boxes
 * This is the same source Wikipedia uses for its maps
 */

import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// City bounding boxes for constrained searches
const CITIES = {
  'New York': { south: 40.70, north: 40.82, west: -74.02, east: -73.93 },
  'San Francisco': { south: 37.70, north: 37.82, west: -122.52, east: -122.35 },
  'London': { south: 51.45, north: 51.58, west: -0.25, east: 0.05 },
  'Paris': { south: 48.80, north: 48.92, west: 2.20, east: 2.50 },
  'Berlin': { south: 52.45, north: 52.58, west: 13.25, east: 13.55 },
  'Tokyo': { south: 35.60, north: 35.80, west: 139.60, east: 139.90 },
  'Amsterdam': { south: 52.33, north: 52.42, west: 4.82, east: 4.98 },
};

// Neighborhoods to fetch
const NEIGHBORHOODS = [
  // New York
  { id: 'nyc-tribeca', name: 'Tribeca', altNames: ['TriBeCa'], city: 'New York' },
  { id: 'nyc-west-village', name: 'West Village', city: 'New York' },
  { id: 'nyc-soho', name: 'SoHo', altNames: ['Soho'], city: 'New York' },
  { id: 'nyc-chelsea', name: 'Chelsea', city: 'New York' },
  { id: 'nyc-greenwich-village', name: 'Greenwich Village', city: 'New York' },
  { id: 'nyc-east-village', name: 'East Village', city: 'New York' },
  { id: 'nyc-williamsburg', name: 'Williamsburg', city: 'New York' },
  { id: 'nyc-upper-east-side', name: 'Upper East Side', city: 'New York' },
  // San Francisco
  { id: 'sf-mission', name: 'Mission District', altNames: ['The Mission', 'Mission'], city: 'San Francisco' },
  { id: 'sf-castro', name: 'The Castro', altNames: ['Castro'], city: 'San Francisco' },
  { id: 'sf-hayes-valley', name: 'Hayes Valley', city: 'San Francisco' },
  // London
  { id: 'london-shoreditch', name: 'Shoreditch', city: 'London' },
  { id: 'london-soho', name: 'Soho', city: 'London' },
  { id: 'london-chelsea', name: 'Chelsea', city: 'London' },
  { id: 'london-notting-hill', name: 'Notting Hill', city: 'London' },
  // Paris
  { id: 'paris-marais', name: 'Le Marais', altNames: ['Marais'], city: 'Paris' },
  { id: 'paris-montmartre', name: 'Montmartre', city: 'Paris' },
  // Berlin
  { id: 'berlin-mitte', name: 'Mitte', city: 'Berlin' },
  { id: 'berlin-kreuzberg', name: 'Kreuzberg', city: 'Berlin' },
  { id: 'berlin-prenzlauer-berg', name: 'Prenzlauer Berg', city: 'Berlin' },
];

async function searchOSMNeighborhood(name, city, altNames = []) {
  const bounds = CITIES[city];
  if (!bounds) {
    console.log(`  ⚠ No bounding box for ${city}`);
    return null;
  }

  const names = [name, ...(altNames || [])];

  for (const searchName of names) {
    // Search for relations with this name in the bounding box
    const query = `
      [out:json][timeout:30];
      (
        relation["name"="${searchName}"]["boundary"="administrative"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
        relation["name"="${searchName}"]["place"="neighbourhood"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
        relation["name"="${searchName}"]["place"="suburb"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
        relation["name"="${searchName}"]["landuse"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
        way["name"="${searchName}"]["place"="neighbourhood"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
      );
      out geom;
    `;

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
      await new Promise(resolve => setTimeout(resolve, 1500)); // Rate limit

      console.log(`  Searching OSM for "${searchName}" in ${city}...`);
      const response = await fetch(url, {
        headers: { 'User-Agent': 'FlaneurApp/1.0' }
      });

      if (!response.ok) {
        console.log(`  ⚠ OSM API error: ${response.status}`);
        continue;
      }

      const data = await response.json();

      if (data.elements && data.elements.length > 0) {
        // Find the best match (prefer relations over ways)
        const relations = data.elements.filter(e => e.type === 'relation');
        const element = relations.length > 0 ? relations[0] : data.elements[0];

        console.log(`  ✓ Found ${element.type} "${element.tags?.name}" (id: ${element.id})`);

        // Extract polygon coordinates
        const coords = extractPolygon(element);
        if (coords && coords.length >= 3) {
          return {
            osmId: element.id,
            osmType: element.type,
            name: element.tags?.name,
            polygon: coords
          };
        }
      }
    } catch (error) {
      console.log(`  ⚠ Error: ${error.message}`);
    }
  }

  return null;
}

function extractPolygon(element) {
  const coords = [];

  if (element.type === 'way' && element.geometry) {
    // Simple way - use geometry directly
    for (const point of element.geometry) {
      coords.push([point.lat, point.lon]);
    }
  } else if (element.type === 'relation' && element.members) {
    // Relation - extract outer boundary
    const outerMembers = element.members.filter(m => m.role === 'outer' || m.role === '');

    for (const member of outerMembers) {
      if (member.geometry) {
        for (const point of member.geometry) {
          coords.push([point.lat, point.lon]);
        }
      }
    }
  }

  // Simplify if too many points (keep ~10-15 points)
  if (coords.length > 20) {
    const step = Math.floor(coords.length / 12);
    const simplified = [];
    for (let i = 0; i < coords.length; i += step) {
      simplified.push(coords[i]);
    }
    return simplified;
  }

  return coords;
}

async function main() {
  console.log('Fetching neighborhood boundaries directly from OpenStreetMap...\n');

  const results = {
    found: [],
    notFound: []
  };

  for (const hood of NEIGHBORHOODS) {
    console.log(`\n=== ${hood.name} (${hood.city}) ===`);

    const result = await searchOSMNeighborhood(hood.name, hood.city, hood.altNames);

    if (result) {
      console.log(`  ✓ Got polygon with ${result.polygon.length} points`);
      results.found.push({
        ...hood,
        ...result
      });
    } else {
      console.log(`  ❌ Not found in OSM`);
      results.notFound.push(hood);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`Found in OSM: ${results.found.length}`);
  console.log(`Not found: ${results.notFound.length}`);

  if (results.found.length > 0) {
    console.log('\nNeighborhoods with OSM boundaries:');
    results.found.forEach(r => console.log(`  ✓ ${r.name} (${r.polygon.length} points)`));
  }

  if (results.notFound.length > 0) {
    console.log('\nNeighborhoods NOT in OSM:');
    results.notFound.forEach(r => console.log(`  ❌ ${r.name}`));
  }

  // Save results
  const outputPath = join(__dirname, 'osm-direct-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to ${outputPath}`);
}

main().catch(console.error);
