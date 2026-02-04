/**
 * Fetch neighborhood boundaries using Wikidata → OpenStreetMap approach (v2)
 *
 * Uses direct Wikidata QIDs where known, and better search for others
 */

import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// Known Wikidata QIDs for our neighborhoods (researched manually)
// Format: id -> { qid, name, city }
const KNOWN_QIDS = {
  // New York
  'nyc-west-village': { qid: 'Q837941', name: 'West Village' },
  'nyc-greenwich-village': { qid: 'Q277256', name: 'Greenwich Village' },
  'nyc-chelsea': { qid: 'Q1069460', name: 'Chelsea, Manhattan' },
  'nyc-upper-east-side': { qid: 'Q455587', name: 'Upper East Side' },
  'nyc-williamsburg': { qid: 'Q978402', name: 'Williamsburg, Brooklyn' },
  'nyc-tribeca': { qid: 'Q766014', name: 'Tribeca' },
  'nyc-soho': { qid: 'Q829367', name: 'SoHo, Manhattan' },

  // London
  'london-notting-hill': { qid: 'Q215354', name: 'Notting Hill' },
  'london-kensington': { qid: 'Q1026148', name: 'Kensington' },
  'london-chelsea': { qid: 'Q1026154', name: 'Chelsea, London' },
  'london-mayfair': { qid: 'Q726795', name: 'Mayfair' },
  'london-hampstead': { qid: 'Q793125', name: 'Hampstead' },
  'london-shoreditch': { qid: 'Q1017670', name: 'Shoreditch' },
  'london-marylebone': { qid: 'Q1895767', name: 'Marylebone' },

  // Paris
  'paris-montmartre': { qid: 'Q184353', name: 'Montmartre' },
  'paris-le-marais': { qid: 'Q210898', name: 'Le Marais' },
  'paris-saint-germain': { qid: 'Q220451', name: 'Saint-Germain-des-Prés' },
  'paris-16th': { qid: 'Q194420', name: '16th arrondissement of Paris' },
  'paris-7th': { qid: 'Q259463', name: '7th arrondissement of Paris' },

  // San Francisco
  'sf-pacific-heights': { qid: 'Q1546101', name: 'Pacific Heights' },
  'sf-marina': { qid: 'Q3424825', name: 'Marina District' },
  'sf-noe-valley': { qid: 'Q3069803', name: 'Noe Valley' },
  'sf-hayes-valley': { qid: 'Q5685584', name: 'Hayes Valley' },
  'sf-the-mission': { qid: 'Q1027379', name: 'Mission District' },
  'sf-russian-hill': { qid: 'Q1637991', name: 'Russian Hill' },

  // Berlin
  'berlin-mitte': { qid: 'Q2013767', name: 'Mitte' },
  'berlin-prenzlauer-berg': { qid: 'Q699960', name: 'Prenzlauer Berg' },
  'berlin-kreuzberg': { qid: 'Q162761', name: 'Kreuzberg' },
  'berlin-charlottenburg': { qid: 'Q698784', name: 'Charlottenburg' },
  'berlin-grunewald': { qid: 'Q701182', name: 'Grunewald' },
  'berlin-dahlem': { qid: 'Q700376', name: 'Dahlem' },
  'berlin-zehlendorf': { qid: 'Q693130', name: 'Zehlendorf' },

  // Amsterdam
  'amsterdam-jordaan': { qid: 'Q670614', name: 'Jordaan' },
  'amsterdam-de-pijp': { qid: 'Q2514667', name: 'De Pijp' },
  'amsterdam-oud-zuid': { qid: 'Q2623798', name: 'Oud-Zuid' },

  // Tokyo
  'tokyo-shibuya': { qid: 'Q193638', name: 'Shibuya' },
  'tokyo-roppongi': { qid: 'Q622329', name: 'Roppongi' },
  'tokyo-ginza': { qid: 'Q639028', name: 'Ginza' },
  'tokyo-aoyama': { qid: 'Q4779821', name: 'Aoyama' },
  'tokyo-daikanyama': { qid: 'Q2635342', name: 'Daikanyama' },

  // Sydney
  'sydney-paddington': { qid: 'Q1140767', name: 'Paddington, New South Wales' },
  'sydney-woollahra': { qid: 'Q1073162', name: 'Woollahra' },
  'sydney-double-bay': { qid: 'Q5301171', name: 'Double Bay' },
  'sydney-mosman': { qid: 'Q1112368', name: 'Mosman' },
  'sydney-vaucluse': { qid: 'Q7916468', name: 'Vaucluse' },

  // Stockholm
  'stockholm-ostermalm': { qid: 'Q543058', name: 'Östermalm' },

  // Chicago
  'chicago-lincoln-park': { qid: 'Q3238631', name: 'Lincoln Park' },
  'chicago-river-north': { qid: 'Q3432652', name: 'River North' },
  'chicago-gold-coast': { qid: 'Q2549820', name: 'Gold Coast, Chicago' },
  'chicago-wicker-park': { qid: 'Q2775913', name: 'Wicker Park' },

  // Los Angeles
  'la-beverly-hills': { qid: 'Q47265', name: 'Beverly Hills' },
  'la-santa-monica': { qid: 'Q49171', name: 'Santa Monica' },
  'la-west-hollywood': { qid: 'Q60155', name: 'West Hollywood' },
  'la-venice': { qid: 'Q834774', name: 'Venice, Los Angeles' },
  'la-silver-lake': { qid: 'Q2541886', name: 'Silver Lake' },

  // Melbourne
  'melbourne-fitzroy': { qid: 'Q5455401', name: 'Fitzroy' },
  'melbourne-st-kilda': { qid: 'Q1145286', name: 'St Kilda' },
  'melbourne-south-yarra': { qid: 'Q7568147', name: 'South Yarra' },

  // Miami
  'miami-south-beach': { qid: 'Q938026', name: 'South Beach' },
  'miami-coral-gables': { qid: 'Q754388', name: 'Coral Gables' },
  'miami-coconut-grove': { qid: 'Q1107380', name: 'Coconut Grove' },
  'miami-brickell': { qid: 'Q4965368', name: 'Brickell' },

  // Milan
  'milan-brera': { qid: 'Q1644398', name: 'Brera' },
  'milan-navigli': { qid: 'Q3336500', name: 'Navigli' },
  'milan-porta-nuova': { qid: 'Q63134', name: 'Porta Nuova' },

  // Barcelona
  'barcelona-eixample': { qid: 'Q388276', name: 'Eixample' },
  'barcelona-gracia': { qid: 'Q797802', name: 'Gràcia' },
  'barcelona-barceloneta': { qid: 'Q2396918', name: 'La Barceloneta' },
  'barcelona-el-born': { qid: 'Q2713499', name: 'El Born' },

  // Copenhagen
  'copenhagen-nyhavn': { qid: 'Q756851', name: 'Nyhavn' },
  'copenhagen-norrebro': { qid: 'Q1124498', name: 'Nørrebro' },
  'copenhagen-vesterbro': { qid: 'Q379959', name: 'Vesterbro' },

  // Dubai
  'dubai-downtown': { qid: 'Q1261871', name: 'Downtown Dubai' },
  'dubai-difc': { qid: 'Q1153740', name: 'Dubai International Financial Centre' },
  'dubai-jumeirah': { qid: 'Q3190035', name: 'Jumeirah' },

  // Hong Kong
  'hk-central': { qid: 'Q494423', name: 'Central, Hong Kong' },
  'hk-the-peak': { qid: 'Q17541', name: 'Victoria Peak' },
  'hk-soho': { qid: 'Q2294370', name: 'SoHo, Hong Kong' },

  // Lisbon
  'lisbon-alfama': { qid: 'Q387104', name: 'Alfama' },
  'lisbon-chiado': { qid: 'Q937383', name: 'Chiado' },
  'lisbon-principe-real': { qid: 'Q10349631', name: 'Príncipe Real' },

  // Singapore
  'singapore-orchard': { qid: 'Q1144936', name: 'Orchard Road' },
  'singapore-tiong-bahru': { qid: 'Q7809282', name: 'Tiong Bahru' },
  'singapore-marina-bay': { qid: 'Q171390', name: 'Marina Bay' },

  // Tel Aviv
  'telaviv-neve-tzedek': { qid: 'Q2457977', name: 'Neve Tzedek' },
  'telaviv-rothschild': { qid: 'Q2163008', name: 'Rothschild Boulevard' },

  // Toronto
  'toronto-yorkville': { qid: 'Q8055614', name: 'Yorkville, Toronto' },
  'toronto-distillery': { qid: 'Q3029096', name: 'Distillery District' },
  'toronto-queen-west': { qid: 'Q7109890', name: 'Queen Street West' },

  // Washington DC
  'dc-georgetown': { qid: 'Q758442', name: 'Georgetown' },
  'dc-dupont-circle': { qid: 'Q3041227', name: 'Dupont Circle' },
  'dc-adams-morgan': { qid: 'Q4681001', name: 'Adams Morgan' },
  'dc-capitol-hill': { qid: 'Q1034804', name: 'Capitol Hill' },
  'dc-kalorama': { qid: 'Q6352476', name: 'Kalorama' },
  'dc-cleveland-park': { qid: 'Q5131888', name: 'Cleveland Park' },
};

// Get OSM relation ID from Wikidata
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

// Get coordinates from Wikidata as fallback
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

// Fetch boundary from OSM using relation ID
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
      return null;
    }

    const data = await response.json();

    if (!data.elements || data.elements.length === 0) {
      return null;
    }

    const relation = data.elements[0];

    if (relation.members) {
      const outerWays = relation.members.filter(m => m.role === 'outer' && m.geometry);

      if (outerWays.length > 0) {
        let coordinates = [];

        for (const way of outerWays) {
          const wayCoords = way.geometry.map(p => [p.lat, p.lon]);
          coordinates = coordinates.concat(wayCoords);
        }

        // Simplify to ~25 points
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
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Fetching neighborhood boundaries via Wikidata → OSM (v2)\n');
  console.log(`Processing ${Object.keys(KNOWN_QIDS).length} neighborhoods with known QIDs\n`);

  // Read existing boundaries
  const content = fs.readFileSync(join(__dirname, '..', 'src', 'lib', 'neighborhood-boundaries.ts'), 'utf-8');
  const match = content.match(/= ({[\s\S]+});/);
  const boundaries = JSON.parse(match[1]);

  const results = {
    fullBoundary: [],
    coordsOnly: [],
    noOSMRelation: [],
    failed: []
  };

  for (const [id, info] of Object.entries(KNOWN_QIDS)) {
    process.stdout.write(`${info.name}... `);

    // Step 1: Get OSM relation ID
    const osmRelationId = await getOSMRelationID(info.qid);

    if (osmRelationId) {
      // Step 2: Fetch boundary from OSM
      const boundary = await fetchOSMBoundary(osmRelationId);

      if (boundary && boundary.polygon.length >= 4) {
        if (boundaries[id]) {
          boundaries[id].center = boundary.center;
          boundaries[id].polygon = boundary.polygon;
          console.log(`✓ ${boundary.polygon.length} points (${info.qid} → ${osmRelationId})`);
          results.fullBoundary.push(id);
        }
      } else {
        // Try to get at least coordinates
        const coords = await getWikidataCoordinates(info.qid);
        if (coords && boundaries[id]) {
          boundaries[id].center = coords;
          console.log(`~ coords only (${info.qid} → ${osmRelationId})`);
          results.coordsOnly.push(id);
        } else {
          console.log(`✗ no boundary data (${info.qid} → ${osmRelationId})`);
          results.failed.push(id);
        }
      }
    } else {
      // No OSM relation - try to get coordinates at least
      const coords = await getWikidataCoordinates(info.qid);
      if (coords && boundaries[id]) {
        boundaries[id].center = coords;
        console.log(`~ coords only, no OSM (${info.qid})`);
        results.coordsOnly.push(id);
      } else {
        console.log(`✗ no OSM relation (${info.qid})`);
        results.noOSMRelation.push(id);
      }
    }

    // Rate limiting - be nice to the APIs
    await sleep(800);
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
  console.log(`✓ Full boundary: ${results.fullBoundary.length}`);
  console.log(`~ Coords only: ${results.coordsOnly.length}`);
  console.log(`✗ No OSM relation: ${results.noOSMRelation.length}`);
  console.log(`✗ Failed: ${results.failed.length}`);
  console.log('========================================\n');

  if (results.fullBoundary.length > 0) {
    console.log('Got full boundaries for:', results.fullBoundary.join(', '));
  }
  if (results.noOSMRelation.length > 0) {
    console.log('\nMissing OSM relations (need manual boundaries):', results.noOSMRelation.join(', '));
  }
}

main().catch(console.error);
