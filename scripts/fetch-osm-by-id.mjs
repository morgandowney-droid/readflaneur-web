/**
 * Fetch OSM boundaries by relation ID
 *
 * These are the exact same boundaries shown on Wikipedia maps
 */

import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// OSM relation IDs for neighborhoods
// Found by searching OSM or from Wikipedia map sources
const OSM_RELATIONS = {
  // New York
  'nyc-tribeca': { osmId: 8398119, name: 'Tribeca', city: 'New York' },
  'nyc-soho': { osmId: 8398074, name: 'SoHo', city: 'New York' },
  'nyc-noho': { osmId: 8398117, name: 'NoHo', city: 'New York' },
  'nyc-nolita': { osmId: 8398137, name: 'Nolita', city: 'New York' },
  'nyc-little-italy': { osmId: 8398136, name: 'Little Italy', city: 'New York' },
  'nyc-chinatown': { osmId: 8398129, name: 'Chinatown', city: 'New York' },
  'nyc-lower-east-side': { osmId: 8398135, name: 'Lower East Side', city: 'New York' },
  'nyc-east-village': { osmId: 8398116, name: 'East Village', city: 'New York' },
  'nyc-west-village': { osmId: 8398094, name: 'West Village', city: 'New York' },
  'nyc-greenwich-village': { osmId: 8398125, name: 'Greenwich Village', city: 'New York' },
  'nyc-chelsea': { osmId: 369518, name: 'Chelsea', city: 'New York' },
  'nyc-flatiron': { osmId: 8398103, name: 'Flatiron District', city: 'New York' },
  'nyc-gramercy': { osmId: 8398126, name: 'Gramercy Park', city: 'New York' },
  'nyc-murray-hill': { osmId: 8398122, name: 'Murray Hill', city: 'New York' },
  'nyc-kips-bay': { osmId: 8398089, name: 'Kips Bay', city: 'New York' },
  'nyc-midtown': { osmId: 8398123, name: 'Midtown', city: 'New York' },
  'nyc-hells-kitchen': { osmId: 8398105, name: "Hell's Kitchen", city: 'New York' },
  'nyc-upper-east-side': { osmId: 8398097, name: 'Upper East Side', city: 'New York' },
  'nyc-upper-west-side': { osmId: 8398098, name: 'Upper West Side', city: 'New York' },
  'nyc-harlem': { osmId: 8398109, name: 'Harlem', city: 'New York' },
  'nyc-williamsburg': { osmId: 369476, name: 'Williamsburg', city: 'New York' },
  'nyc-dumbo': { osmId: 2517020, name: 'DUMBO', city: 'New York' },
  'nyc-brooklyn-heights': { osmId: 369464, name: 'Brooklyn Heights', city: 'New York' },
  // London
  'london-soho': { osmId: 17710512, name: 'Soho', city: 'London' },
  'london-chelsea': { osmId: 51781, name: 'Chelsea', city: 'London' },
  'london-shoreditch': { osmId: 5765085, name: 'Shoreditch', city: 'London' },
  'london-notting-hill': { osmId: 5765152, name: 'Notting Hill', city: 'London' },
  'london-marylebone': { osmId: 5765148, name: 'Marylebone', city: 'London' },
  'london-mayfair': { osmId: 5765050, name: 'Mayfair', city: 'London' },
  'london-brixton': { osmId: 2497230, name: 'Brixton', city: 'London' },
  'london-islington': { osmId: 51786, name: 'Islington', city: 'London' },
  // Paris
  'paris-marais': { osmId: 15537328, name: 'Le Marais', city: 'Paris' },
  'paris-montmartre': { osmId: 87477, name: 'Montmartre', city: 'Paris' },
  'paris-saint-germain': { osmId: 105217, name: 'Saint-Germain-des-Prés', city: 'Paris' },
  // Berlin
  'berlin-mitte': { osmId: 16347, name: 'Mitte', city: 'Berlin' },
  'berlin-kreuzberg': { osmId: 55765, name: 'Kreuzberg', city: 'Berlin' },
  'berlin-prenzlauer-berg': { osmId: 407713, name: 'Prenzlauer Berg', city: 'Berlin' },
  'berlin-friedrichshain': { osmId: 55768, name: 'Friedrichshain', city: 'Berlin' },
  'berlin-charlottenburg': { osmId: 55771, name: 'Charlottenburg', city: 'Berlin' },
  'berlin-neukolln': { osmId: 55772, name: 'Neukölln', city: 'Berlin' },
  // San Francisco
  'sf-mission': { osmId: 3906098, name: 'Mission District', city: 'San Francisco' },
  'sf-castro': { osmId: 3906116, name: 'The Castro', city: 'San Francisco' },
  'sf-hayes-valley': { osmId: 11262986, name: 'Hayes Valley', city: 'San Francisco' },
  'sf-noe-valley': { osmId: 3906103, name: 'Noe Valley', city: 'San Francisco' },
  'sf-pacific-heights': { osmId: 3906111, name: 'Pacific Heights', city: 'San Francisco' },
  'sf-russian-hill': { osmId: 3906114, name: 'Russian Hill', city: 'San Francisco' },
  'sf-north-beach': { osmId: 3906112, name: 'North Beach', city: 'San Francisco' },
  'sf-marina': { osmId: 3906095, name: 'Marina District', city: 'San Francisco' },
  // Amsterdam
  'amsterdam-jordaan': { osmId: 2758706, name: 'Jordaan', city: 'Amsterdam' },
  'amsterdam-de-pijp': { osmId: 2758689, name: 'De Pijp', city: 'Amsterdam' },
  // Tokyo
  'tokyo-shibuya': { osmId: 1973218, name: 'Shibuya', city: 'Tokyo' },
  'tokyo-shinjuku': { osmId: 1973211, name: 'Shinjuku', city: 'Tokyo' },
  'tokyo-harajuku': { osmId: 6661655, name: 'Harajuku', city: 'Tokyo' },
};

async function fetchOSMBoundary(osmId) {
  const query = `[out:json][timeout:30];relation(${osmId});out geom;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    await new Promise(resolve => setTimeout(resolve, 1200)); // Rate limit

    const response = await fetch(url, {
      headers: { 'User-Agent': 'FlaneurApp/1.0' }
    });

    if (!response.ok) {
      console.log(`  ⚠ API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.elements && data.elements.length > 0) {
      const relation = data.elements[0];

      // Extract all outer boundary coordinates
      const coords = [];
      const outerMembers = relation.members?.filter(m => m.role === 'outer') || [];

      for (const member of outerMembers) {
        if (member.geometry) {
          for (const point of member.geometry) {
            coords.push([point.lat, point.lon]);
          }
        }
      }

      // Simplify to 10-15 points for display (keeps shape but reduces file size)
      if (coords.length > 20) {
        const step = Math.floor(coords.length / 12);
        const simplified = [];
        for (let i = 0; i < coords.length; i += step) {
          simplified.push(coords[i]);
        }
        return { coords: simplified, rawCount: coords.length };
      }

      return { coords, rawCount: coords.length };
    }
    return null;
  } catch (error) {
    console.log(`  ⚠ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Fetching accurate OSM boundaries by relation ID...\n');
  console.log('These are the SAME boundaries shown on Wikipedia maps.\n');

  const results = {
    success: [],
    failed: []
  };

  const ids = Object.keys(OSM_RELATIONS);

  for (const id of ids) {
    const info = OSM_RELATIONS[id];
    console.log(`Fetching ${info.name} (${info.city}) - OSM relation ${info.osmId}...`);

    const result = await fetchOSMBoundary(info.osmId);

    if (result && result.coords.length >= 3) {
      console.log(`  ✓ Got ${result.coords.length} points (from ${result.rawCount} raw points)`);
      results.success.push({
        id,
        ...info,
        polygon: result.coords
      });
    } else {
      console.log(`  ❌ Failed to get boundary`);
      results.failed.push({ id, ...info });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`✓ Success: ${results.success.length}`);
  console.log(`✗ Failed: ${results.failed.length}`);

  // Save results
  const outputPath = join(__dirname, 'osm-boundaries-by-id.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to ${outputPath}`);
}

main().catch(console.error);
