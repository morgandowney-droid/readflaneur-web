/**
 * Fetch neighborhood boundaries using Wikidata → OpenStreetMap approach
 *
 * 1. Search Wikidata for each neighborhood's QID
 * 2. Get the OSM relation ID from Wikidata (property P402)
 * 3. Fetch the exact boundary from OSM using that relation ID
 */

import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// Our neighborhoods with their city context for better search
const NEIGHBORHOODS = [
  // New York
  { id: 'nyc-west-village', name: 'West Village', city: 'Manhattan', country: 'United States' },
  { id: 'nyc-greenwich-village', name: 'Greenwich Village', city: 'Manhattan', country: 'United States' },
  { id: 'nyc-chelsea', name: 'Chelsea', city: 'Manhattan', country: 'United States' },
  { id: 'nyc-upper-east-side', name: 'Upper East Side', city: 'Manhattan', country: 'United States' },
  { id: 'nyc-williamsburg', name: 'Williamsburg', city: 'Brooklyn', country: 'United States' },
  { id: 'nyc-tribeca', name: 'Tribeca', city: 'Manhattan', country: 'United States' },
  { id: 'nyc-soho', name: 'SoHo', city: 'Manhattan', country: 'United States' },

  // London
  { id: 'london-notting-hill', name: 'Notting Hill', city: 'London', country: 'United Kingdom' },
  { id: 'london-kensington', name: 'Kensington', city: 'London', country: 'United Kingdom' },
  { id: 'london-chelsea', name: 'Chelsea', city: 'London', country: 'United Kingdom' },
  { id: 'london-mayfair', name: 'Mayfair', city: 'London', country: 'United Kingdom' },
  { id: 'london-hampstead', name: 'Hampstead', city: 'London', country: 'United Kingdom' },
  { id: 'london-shoreditch', name: 'Shoreditch', city: 'London', country: 'United Kingdom' },
  { id: 'london-marylebone', name: 'Marylebone', city: 'London', country: 'United Kingdom' },

  // Paris
  { id: 'paris-montmartre', name: 'Montmartre', city: 'Paris', country: 'France' },
  { id: 'paris-le-marais', name: 'Le Marais', city: 'Paris', country: 'France' },
  { id: 'paris-saint-germain', name: 'Saint-Germain-des-Prés', city: 'Paris', country: 'France' },
  { id: 'paris-16th', name: '16th arrondissement of Paris', city: 'Paris', country: 'France' },
  { id: 'paris-7th', name: '7th arrondissement of Paris', city: 'Paris', country: 'France' },

  // San Francisco
  { id: 'sf-pacific-heights', name: 'Pacific Heights', city: 'San Francisco', country: 'United States' },
  { id: 'sf-marina', name: 'Marina District', city: 'San Francisco', country: 'United States' },
  { id: 'sf-noe-valley', name: 'Noe Valley', city: 'San Francisco', country: 'United States' },
  { id: 'sf-hayes-valley', name: 'Hayes Valley', city: 'San Francisco', country: 'United States' },
  { id: 'sf-the-mission', name: 'Mission District', city: 'San Francisco', country: 'United States' },
  { id: 'sf-russian-hill', name: 'Russian Hill', city: 'San Francisco', country: 'United States' },

  // Berlin
  { id: 'berlin-mitte', name: 'Mitte', city: 'Berlin', country: 'Germany' },
  { id: 'berlin-prenzlauer-berg', name: 'Prenzlauer Berg', city: 'Berlin', country: 'Germany' },
  { id: 'berlin-kreuzberg', name: 'Kreuzberg', city: 'Berlin', country: 'Germany' },
  { id: 'berlin-charlottenburg', name: 'Charlottenburg', city: 'Berlin', country: 'Germany' },
  { id: 'berlin-grunewald', name: 'Grunewald', city: 'Berlin', country: 'Germany' },
  { id: 'berlin-dahlem', name: 'Dahlem', city: 'Berlin', country: 'Germany' },
  { id: 'berlin-zehlendorf', name: 'Zehlendorf', city: 'Berlin', country: 'Germany' },

  // Amsterdam
  { id: 'amsterdam-jordaan', name: 'Jordaan', city: 'Amsterdam', country: 'Netherlands' },
  { id: 'amsterdam-de-pijp', name: 'De Pijp', city: 'Amsterdam', country: 'Netherlands' },
  { id: 'amsterdam-oud-zuid', name: 'Oud-Zuid', city: 'Amsterdam', country: 'Netherlands' },

  // Tokyo
  { id: 'tokyo-shibuya', name: 'Shibuya', city: 'Tokyo', country: 'Japan' },
  { id: 'tokyo-roppongi', name: 'Roppongi', city: 'Tokyo', country: 'Japan' },
  { id: 'tokyo-ginza', name: 'Ginza', city: 'Tokyo', country: 'Japan' },
  { id: 'tokyo-aoyama', name: 'Aoyama', city: 'Tokyo', country: 'Japan' },
  { id: 'tokyo-daikanyama', name: 'Daikanyama', city: 'Tokyo', country: 'Japan' },

  // Sydney
  { id: 'sydney-paddington', name: 'Paddington', city: 'Sydney', country: 'Australia' },
  { id: 'sydney-woollahra', name: 'Woollahra', city: 'Sydney', country: 'Australia' },
  { id: 'sydney-double-bay', name: 'Double Bay', city: 'Sydney', country: 'Australia' },
  { id: 'sydney-mosman', name: 'Mosman', city: 'Sydney', country: 'Australia' },
  { id: 'sydney-vaucluse', name: 'Vaucluse', city: 'Sydney', country: 'Australia' },

  // More cities...
  { id: 'stockholm-ostermalm', name: 'Östermalm', city: 'Stockholm', country: 'Sweden' },
  { id: 'chicago-lincoln-park', name: 'Lincoln Park', city: 'Chicago', country: 'United States' },
  { id: 'chicago-river-north', name: 'River North', city: 'Chicago', country: 'United States' },
  { id: 'chicago-gold-coast', name: 'Gold Coast', city: 'Chicago', country: 'United States' },
  { id: 'chicago-wicker-park', name: 'Wicker Park', city: 'Chicago', country: 'United States' },
  { id: 'la-beverly-hills', name: 'Beverly Hills', city: 'Los Angeles', country: 'United States' },
  { id: 'la-santa-monica', name: 'Santa Monica', city: 'California', country: 'United States' },
  { id: 'la-west-hollywood', name: 'West Hollywood', city: 'California', country: 'United States' },
  { id: 'la-venice', name: 'Venice', city: 'Los Angeles', country: 'United States' },
  { id: 'la-silver-lake', name: 'Silver Lake', city: 'Los Angeles', country: 'United States' },
  { id: 'melbourne-fitzroy', name: 'Fitzroy', city: 'Melbourne', country: 'Australia' },
  { id: 'melbourne-st-kilda', name: 'St Kilda', city: 'Melbourne', country: 'Australia' },
  { id: 'melbourne-south-yarra', name: 'South Yarra', city: 'Melbourne', country: 'Australia' },
  { id: 'miami-south-beach', name: 'South Beach', city: 'Miami Beach', country: 'United States' },
  { id: 'miami-coral-gables', name: 'Coral Gables', city: 'Florida', country: 'United States' },
  { id: 'miami-coconut-grove', name: 'Coconut Grove', city: 'Miami', country: 'United States' },
  { id: 'miami-brickell', name: 'Brickell', city: 'Miami', country: 'United States' },
  { id: 'milan-brera', name: 'Brera', city: 'Milan', country: 'Italy' },
  { id: 'milan-navigli', name: 'Navigli', city: 'Milan', country: 'Italy' },
  { id: 'milan-porta-nuova', name: 'Porta Nuova', city: 'Milan', country: 'Italy' },
  { id: 'barcelona-eixample', name: 'Eixample', city: 'Barcelona', country: 'Spain' },
  { id: 'barcelona-gracia', name: 'Gràcia', city: 'Barcelona', country: 'Spain' },
  { id: 'barcelona-barceloneta', name: 'Barceloneta', city: 'Barcelona', country: 'Spain' },
  { id: 'barcelona-el-born', name: 'El Born', city: 'Barcelona', country: 'Spain' },
  { id: 'copenhagen-nyhavn', name: 'Nyhavn', city: 'Copenhagen', country: 'Denmark' },
  { id: 'copenhagen-norrebro', name: 'Nørrebro', city: 'Copenhagen', country: 'Denmark' },
  { id: 'copenhagen-vesterbro', name: 'Vesterbro', city: 'Copenhagen', country: 'Denmark' },
  { id: 'dubai-downtown', name: 'Downtown Dubai', city: 'Dubai', country: 'United Arab Emirates' },
  { id: 'dubai-difc', name: 'Dubai International Financial Centre', city: 'Dubai', country: 'United Arab Emirates' },
  { id: 'dubai-jumeirah', name: 'Jumeirah', city: 'Dubai', country: 'United Arab Emirates' },
  { id: 'hk-central', name: 'Central', city: 'Hong Kong', country: 'China' },
  { id: 'hk-the-peak', name: 'Victoria Peak', city: 'Hong Kong', country: 'China' },
  { id: 'hk-soho', name: 'SoHo', city: 'Hong Kong', country: 'China' },
  { id: 'lisbon-alfama', name: 'Alfama', city: 'Lisbon', country: 'Portugal' },
  { id: 'lisbon-chiado', name: 'Chiado', city: 'Lisbon', country: 'Portugal' },
  { id: 'lisbon-principe-real', name: 'Príncipe Real', city: 'Lisbon', country: 'Portugal' },
  { id: 'singapore-orchard', name: 'Orchard Road', city: 'Singapore', country: 'Singapore' },
  { id: 'singapore-tiong-bahru', name: 'Tiong Bahru', city: 'Singapore', country: 'Singapore' },
  { id: 'singapore-marina-bay', name: 'Marina Bay', city: 'Singapore', country: 'Singapore' },
  { id: 'telaviv-neve-tzedek', name: 'Neve Tzedek', city: 'Tel Aviv', country: 'Israel' },
  { id: 'telaviv-rothschild', name: 'Rothschild Boulevard', city: 'Tel Aviv', country: 'Israel' },
  { id: 'toronto-yorkville', name: 'Yorkville', city: 'Toronto', country: 'Canada' },
  { id: 'toronto-distillery', name: 'Distillery District', city: 'Toronto', country: 'Canada' },
  { id: 'toronto-queen-west', name: 'Queen Street West', city: 'Toronto', country: 'Canada' },
  { id: 'dc-georgetown', name: 'Georgetown', city: 'Washington, D.C.', country: 'United States' },
  { id: 'dc-dupont-circle', name: 'Dupont Circle', city: 'Washington, D.C.', country: 'United States' },
  { id: 'dc-adams-morgan', name: 'Adams Morgan', city: 'Washington, D.C.', country: 'United States' },
  { id: 'dc-capitol-hill', name: 'Capitol Hill', city: 'Washington, D.C.', country: 'United States' },
  { id: 'dc-kalorama', name: 'Kalorama', city: 'Washington, D.C.', country: 'United States' },
  { id: 'dc-cleveland-park', name: 'Cleveland Park', city: 'Washington, D.C.', country: 'United States' },
];

// Step 1: Search Wikidata for the neighborhood's QID
async function searchWikidataQID(name, city, country) {
  const searchQuery = `${name} ${city}`;
  const url = `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(searchQuery)}&language=en&format=json&type=item&limit=10`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Flaneur/1.0 (neighborhood news platform)' }
    });
    const data = await response.json();

    if (data.search && data.search.length > 0) {
      // Return the first result's QID
      // In a more robust implementation, we'd verify it's actually a neighborhood
      return data.search[0].id;
    }
    return null;
  } catch (error) {
    console.log(`  Wikidata search error: ${error.message}`);
    return null;
  }
}

// Step 2: Get the OSM relation ID from Wikidata using SPARQL
async function getOSMRelationID(qid) {
  const query = `
    SELECT ?osmRelation WHERE {
      wd:${qid} wdt:P402 ?osmRelation.
    }
  `;

  try {
    const response = await fetch(WIKIDATA_SPARQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/sparql-results+json',
        'User-Agent': 'Flaneur/1.0 (neighborhood news platform)'
      },
      body: `query=${encodeURIComponent(query)}`
    });

    const data = await response.json();

    if (data.results?.bindings?.length > 0) {
      return data.results.bindings[0].osmRelation.value;
    }
    return null;
  } catch (error) {
    console.log(`  SPARQL error: ${error.message}`);
    return null;
  }
}

// Step 3: Fetch the boundary from OSM using the relation ID
async function fetchOSMBoundary(relationId) {
  const query = `
    [out:json][timeout:30];
    relation(${relationId});
    out geom;
  `;

  try {
    const response = await fetch(OVERPASS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Flaneur/1.0 (neighborhood news platform)'
      },
      body: `data=${encodeURIComponent(query)}`
    });

    if (!response.ok) {
      console.log(`  Overpass API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.elements || data.elements.length === 0) {
      return null;
    }

    const relation = data.elements[0];

    // Extract polygon coordinates from the relation
    if (relation.members) {
      const outerWays = relation.members.filter(m => m.role === 'outer' && m.geometry);

      if (outerWays.length > 0) {
        let coordinates = [];

        // Combine all outer way geometries
        for (const way of outerWays) {
          const wayCoords = way.geometry.map(p => [p.lat, p.lon]);
          coordinates = coordinates.concat(wayCoords);
        }

        // Simplify if too many points (keep ~20-30 points for performance)
        if (coordinates.length > 30) {
          const step = Math.ceil(coordinates.length / 25);
          coordinates = coordinates.filter((_, i) => i % step === 0);
        }

        // Calculate center
        const lats = coordinates.map(c => c[0]);
        const lons = coordinates.map(c => c[1]);
        const center = [
          (Math.min(...lats) + Math.max(...lats)) / 2,
          (Math.min(...lons) + Math.max(...lons)) / 2
        ];

        return { center, polygon: coordinates };
      }
    }

    return null;
  } catch (error) {
    console.log(`  Overpass error: ${error.message}`);
    return null;
  }
}

// Also get coordinates from Wikidata as fallback
async function getWikidataCoordinates(qid) {
  const query = `
    SELECT ?coord WHERE {
      wd:${qid} wdt:P625 ?coord.
    }
  `;

  try {
    const response = await fetch(WIKIDATA_SPARQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/sparql-results+json',
        'User-Agent': 'Flaneur/1.0 (neighborhood news platform)'
      },
      body: `query=${encodeURIComponent(query)}`
    });

    const data = await response.json();

    if (data.results?.bindings?.length > 0) {
      const coord = data.results.bindings[0].coord.value;
      // Parse "Point(lon lat)" format
      const match = coord.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
      if (match) {
        return [parseFloat(match[2]), parseFloat(match[1])]; // [lat, lon]
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log('Fetching neighborhood boundaries via Wikidata → OSM\n');

  // Read existing boundaries
  const content = fs.readFileSync(join(__dirname, '..', 'src', 'lib', 'neighborhood-boundaries.ts'), 'utf-8');
  const match = content.match(/= ({[\s\S]+});/);
  const boundaries = JSON.parse(match[1]);

  const results = {
    success: [],
    noQID: [],
    noOSMRelation: [],
    noBoundary: []
  };

  for (const hood of NEIGHBORHOODS) {
    process.stdout.write(`${hood.name}, ${hood.city}... `);

    // Step 1: Find Wikidata QID
    const qid = await searchWikidataQID(hood.name, hood.city, hood.country);
    if (!qid) {
      console.log('✗ No Wikidata QID');
      results.noQID.push(hood.id);
      await sleep(500);
      continue;
    }

    // Step 2: Get OSM relation ID
    const osmRelationId = await getOSMRelationID(qid);
    if (!osmRelationId) {
      // Try to at least get coordinates
      const coords = await getWikidataCoordinates(qid);
      if (coords && boundaries[hood.id]) {
        boundaries[hood.id].center = coords;
        console.log(`~ Got coords only (${qid})`);
      } else {
        console.log(`✗ No OSM relation (${qid})`);
      }
      results.noOSMRelation.push({ id: hood.id, qid });
      await sleep(500);
      continue;
    }

    // Step 3: Fetch boundary from OSM
    const boundary = await fetchOSMBoundary(osmRelationId);
    if (!boundary) {
      console.log(`✗ No boundary data (${qid} → ${osmRelationId})`);
      results.noBoundary.push({ id: hood.id, qid, osmRelationId });
      await sleep(500);
      continue;
    }

    // Update the boundary
    if (boundaries[hood.id]) {
      boundaries[hood.id].center = boundary.center;
      boundaries[hood.id].polygon = boundary.polygon;
      console.log(`✓ ${boundary.polygon.length} points (${qid} → ${osmRelationId})`);
      results.success.push(hood.id);
    }

    // Rate limiting
    await sleep(600);
  }

  // Write updated boundaries
  const output = `// Neighborhood boundaries from Wikidata + OpenStreetMap
// Generated: ${new Date().toISOString()}
// Source: Wikidata QID → OSM Relation ID → Overpass API

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

  console.log('\n========================================');
  console.log(`✓ Success: ${results.success.length}`);
  console.log(`✗ No Wikidata QID: ${results.noQID.length}`);
  console.log(`✗ No OSM Relation: ${results.noOSMRelation.length}`);
  console.log(`✗ No Boundary Data: ${results.noBoundary.length}`);
  console.log('========================================\n');

  if (results.noQID.length > 0) {
    console.log('Missing Wikidata QIDs:', results.noQID.join(', '));
  }
  if (results.noOSMRelation.length > 0) {
    console.log('Missing OSM Relations:', results.noOSMRelation.map(r => r.id).join(', '));
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
