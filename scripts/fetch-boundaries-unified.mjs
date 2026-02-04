/**
 * Unified Neighborhood Boundary Fetcher
 *
 * Priority:
 * 1. Try to get OSM boundary via Wikidata (same source as Wikipedia maps)
 * 2. Fall back to LLM text extraction if no OSM relation exists
 *
 * This ensures we use the same accurate maps shown on Wikipedia pages.
 */

import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') });

const anthropic = new Anthropic();

// Neighborhood definitions with Wikidata QIDs
const NEIGHBORHOODS = {
  // New York - have Wikidata QIDs
  'nyc-tribeca': { qid: 'Q766014', article: 'Tribeca', city: 'New York, NY', name: 'Tribeca' },
  'nyc-west-village': { qid: 'Q837941', article: 'West_Village', city: 'New York, NY', name: 'West Village' },
  'nyc-soho': { qid: 'Q836418', article: 'SoHo,_Manhattan', city: 'New York, NY', name: 'SoHo' },
  'nyc-chelsea': { qid: 'Q837857', article: 'Chelsea,_Manhattan', city: 'New York, NY', name: 'Chelsea' },
  'nyc-greenwich-village': { qid: 'Q277862', article: 'Greenwich_Village', city: 'New York, NY', name: 'Greenwich Village' },
  'nyc-east-village': { qid: 'Q756542', article: 'East_Village,_Manhattan', city: 'New York, NY', name: 'East Village' },
  'nyc-lower-east-side': { qid: 'Q837858', article: 'Lower_East_Side', city: 'New York, NY', name: 'Lower East Side' },
  'nyc-upper-east-side': { qid: 'Q830937', article: 'Upper_East_Side', city: 'New York, NY', name: 'Upper East Side' },
  'nyc-upper-west-side': { qid: 'Q827446', article: 'Upper_West_Side', city: 'New York, NY', name: 'Upper West Side' },
  'nyc-williamsburg': { qid: 'Q1429678', article: 'Williamsburg,_Brooklyn', city: 'New York, NY', name: 'Williamsburg' },
  // San Francisco
  'sf-mission': { qid: 'Q2224629', article: 'Mission_District,_San_Francisco', city: 'San Francisco, CA', name: 'Mission District' },
  'sf-castro': { qid: 'Q1343609', article: 'The_Castro,_San_Francisco', city: 'San Francisco, CA', name: 'The Castro' },
  'sf-hayes-valley': { qid: 'Q3355954', article: 'Hayes_Valley,_San_Francisco', city: 'San Francisco, CA', name: 'Hayes Valley' },
  'sf-marina': { qid: 'Q6762893', article: 'Marina_District,_San_Francisco', city: 'San Francisco, CA', name: 'Marina District' },
  // London
  'london-shoreditch': { qid: 'Q1774859', article: 'Shoreditch', city: 'London, UK', name: 'Shoreditch' },
  'london-soho': { qid: 'Q466524', article: 'Soho', city: 'London, UK', name: 'Soho' },
  'london-chelsea': { qid: 'Q202439', article: 'Chelsea,_London', city: 'London, UK', name: 'Chelsea' },
  'london-notting-hill': { qid: 'Q1130498', article: 'Notting_Hill', city: 'London, UK', name: 'Notting Hill' },
  // Paris
  'paris-marais': { qid: 'Q238699', article: 'Le_Marais', city: 'Paris, France', name: 'Le Marais' },
  'paris-montmartre': { qid: 'Q169293', article: 'Montmartre', city: 'Paris, France', name: 'Montmartre' },
  'paris-saint-germain': { qid: 'Q637786', article: 'Saint-Germain-des-Prés', city: 'Paris, France', name: 'Saint-Germain-des-Prés' },
  // Berlin
  'berlin-mitte': { qid: 'Q699', article: 'Mitte_(locality)', city: 'Berlin, Germany', name: 'Mitte' },
  'berlin-kreuzberg': { qid: 'Q700', article: 'Kreuzberg', city: 'Berlin, Germany', name: 'Kreuzberg' },
  'berlin-prenzlauer-berg': { qid: 'Q701', article: 'Prenzlauer_Berg', city: 'Berlin, Germany', name: 'Prenzlauer Berg' },
  // Tokyo
  'tokyo-shibuya': { qid: 'Q204298', article: 'Shibuya', city: 'Tokyo, Japan', name: 'Shibuya' },
  'tokyo-shinjuku': { qid: 'Q204183', article: 'Shinjuku', city: 'Tokyo, Japan', name: 'Shinjuku' },
};

// ============================================
// METHOD 1: OSM via Wikidata (Primary - Same as Wikipedia maps)
// ============================================

async function getOSMRelationFromWikidata(qid) {
  const sparqlQuery = `
    SELECT ?osmRelation WHERE {
      wd:${qid} wdt:P402 ?osmRelation.
    }
  `;

  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'FlaneurApp/1.0' }
    });
    const data = await response.json();

    if (data.results.bindings.length > 0) {
      return data.results.bindings[0].osmRelation.value;
    }
    return null;
  } catch (error) {
    console.error(`Wikidata error for ${qid}:`, error.message);
    return null;
  }
}

async function fetchOSMBoundary(relationId) {
  const query = `
    [out:json][timeout:25];
    relation(${relationId});
    out geom;
  `;

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit

    const response = await fetch(url, {
      headers: { 'User-Agent': 'FlaneurApp/1.0' }
    });
    const data = await response.json();

    if (data.elements && data.elements.length > 0) {
      const relation = data.elements[0];

      // Extract outer boundary coordinates
      const outerMembers = relation.members?.filter(m => m.role === 'outer') || [];
      const coords = [];

      for (const member of outerMembers) {
        if (member.geometry) {
          for (const point of member.geometry) {
            coords.push([point.lat, point.lon]);
          }
        }
      }

      // Simplify to 8-12 points for display
      if (coords.length > 12) {
        const step = Math.floor(coords.length / 10);
        const simplified = [];
        for (let i = 0; i < coords.length; i += step) {
          simplified.push(coords[i]);
        }
        return simplified.slice(0, 12);
      }

      return coords.length > 0 ? coords : null;
    }
    return null;
  } catch (error) {
    console.error(`OSM error for relation ${relationId}:`, error.message);
    return null;
  }
}

// ============================================
// METHOD 2: LLM Text Extraction (Fallback)
// ============================================

// City bounding boxes for filtering geocode results
const CITY_BOUNDS = {
  'New York, NY': { minLat: 40.70, maxLat: 40.82, minLon: -74.02, maxLon: -73.93 },
  'San Francisco, CA': { minLat: 37.70, maxLat: 37.82, minLon: -122.52, maxLon: -122.35 },
  'London, UK': { minLat: 51.45, maxLat: 51.55, minLon: -0.25, maxLon: 0.05 },
  'Paris, France': { minLat: 48.80, maxLat: 48.92, minLon: 2.20, maxLon: 2.50 },
  'Berlin, Germany': { minLat: 52.45, maxLat: 52.55, minLon: 13.30, maxLon: 13.50 },
  'Tokyo, Japan': { minLat: 35.60, maxLat: 35.75, minLon: 139.65, maxLon: 139.85 },
};

function isWithinBounds(lat, lon, city) {
  const bounds = CITY_BOUNDS[city];
  if (!bounds) return true;
  return lat >= bounds.minLat && lat <= bounds.maxLat &&
         lon >= bounds.minLon && lon <= bounds.maxLon;
}

async function fetchWikipediaArticle(articleTitle) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(articleTitle)}&prop=extracts&exintro=false&explaintext=true&format=json&origin=*`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];

    if (pageId === '-1') return null;
    return pages[pageId].extract;
  } catch (error) {
    return null;
  }
}

async function extractBoundariesWithLLM(articleText, neighborhoodName, city) {
  const prompt = `You are analyzing a Wikipedia article about the ${neighborhoodName} neighborhood in ${city}.

Extract the boundary streets/landmarks that define this neighborhood. Look for phrases like "bounded by", "borders", "extends from...to", directional boundaries.

Return a JSON object with:
- north: the street/landmark forming the northern boundary
- south: the street/landmark forming the southern boundary
- east: the street/landmark forming the eastern boundary
- west: the street/landmark forming the western boundary
- corners: array of 4-6 corner intersection names (e.g., "14th Street and 7th Avenue")

If a boundary is not clearly defined, use null.

Article text (first 4000 chars):
${articleText.substring(0, 4000)}

Respond with ONLY the JSON object, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error(`LLM error: ${error.message}`);
    return null;
  }
}

async function geocodeIntersection(intersection, city) {
  const cityContext = city.includes('New York') ? 'Manhattan, New York City, NY' : city;
  const query = `${intersection}, ${cityContext}`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;

  try {
    await new Promise(resolve => setTimeout(resolve, 1100));

    const response = await fetch(url, {
      headers: { 'User-Agent': 'FlaneurApp/1.0' }
    });
    const data = await response.json();

    for (const result of data) {
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      if (isWithinBounds(lat, lon, city)) {
        return { lat, lon };
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function geocodeStreet(street, city) {
  const cityContext = city.includes('New York') ? 'Manhattan, New York City, NY' : city;
  const query = `${street}, ${cityContext}`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;

  try {
    await new Promise(resolve => setTimeout(resolve, 1100));

    const response = await fetch(url, {
      headers: { 'User-Agent': 'FlaneurApp/1.0' }
    });
    const data = await response.json();

    for (const result of data) {
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      if (isWithinBounds(lat, lon, city)) {
        return { lat, lon };
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function getBoundaryFromLLM(info) {
  const articleText = await fetchWikipediaArticle(info.article);
  if (!articleText) return null;

  const boundaries = await extractBoundariesWithLLM(articleText, info.name, info.city);
  if (!boundaries) return null;

  let coords = [];

  // Try corners first
  if (boundaries.corners && boundaries.corners.length > 0) {
    for (const corner of boundaries.corners.slice(0, 6)) {
      const geo = await geocodeIntersection(corner, info.city);
      if (geo) {
        coords.push([geo.lat, geo.lon]);
      }
    }
  }

  // Fall back to cardinal boundaries
  if (coords.length < 3) {
    const streetCoords = {};

    if (boundaries.north) {
      const geo = await geocodeStreet(boundaries.north.split(' or ')[0], info.city);
      if (geo) streetCoords.north = geo;
    }
    if (boundaries.south) {
      const geo = await geocodeStreet(boundaries.south.split(' or ')[0], info.city);
      if (geo) streetCoords.south = geo;
    }
    if (boundaries.east) {
      const geo = await geocodeStreet(boundaries.east.split(' or ')[0].split(',')[0], info.city);
      if (geo) streetCoords.east = geo;
    }
    if (boundaries.west) {
      const geo = await geocodeStreet(boundaries.west.split(' or ')[0].split(',')[0], info.city);
      if (geo) streetCoords.west = geo;
    }

    if (Object.keys(streetCoords).length >= 3) {
      const north = streetCoords.north?.lat || streetCoords.east?.lat || streetCoords.west?.lat;
      const south = streetCoords.south?.lat || streetCoords.east?.lat || streetCoords.west?.lat;
      const east = streetCoords.east?.lon || streetCoords.north?.lon || streetCoords.south?.lon;
      const west = streetCoords.west?.lon || streetCoords.north?.lon || streetCoords.south?.lon;

      if (north && south && east && west) {
        coords = [
          [north, west],
          [north, east],
          [south, east],
          [south, west],
        ];
      }
    }
  }

  return coords.length >= 3 ? coords : null;
}

// ============================================
// MAIN: Unified Fetch
// ============================================

async function main() {
  console.log('Fetching neighborhood boundaries (OSM first, LLM fallback)...\n');

  const results = {
    osm: [],      // Got boundary from OSM (Wikipedia map source)
    llm: [],      // Got boundary from LLM extraction
    failed: []    // Could not get boundary
  };

  // Process all neighborhoods
  const testIds = Object.keys(NEIGHBORHOODS);

  for (const id of testIds) {
    const info = NEIGHBORHOODS[id];
    console.log(`\n=== ${info.name} (${info.city}) ===`);

    // METHOD 1: Try OSM via Wikidata first
    if (info.qid) {
      console.log(`  Checking Wikidata ${info.qid} for OSM relation...`);
      const osmRelation = await getOSMRelationFromWikidata(info.qid);

      if (osmRelation) {
        console.log(`  ✓ Found OSM relation: ${osmRelation}`);
        const polygon = await fetchOSMBoundary(osmRelation);

        if (polygon && polygon.length >= 3) {
          console.log(`  ✓ Got OSM boundary (${polygon.length} points) - SAME AS WIKIPEDIA MAP`);
          results.osm.push({
            id,
            ...info,
            source: 'osm',
            osmRelation,
            polygon
          });
          continue;
        } else {
          console.log(`  ⚠ OSM relation exists but no valid polygon`);
        }
      } else {
        console.log(`  ⚠ No OSM relation in Wikidata`);
      }
    }

    // METHOD 2: Fall back to LLM extraction
    console.log(`  Falling back to LLM text extraction...`);
    const llmPolygon = await getBoundaryFromLLM(info);

    if (llmPolygon) {
      console.log(`  ✓ Got LLM boundary (${llmPolygon.length} points)`);
      results.llm.push({
        id,
        ...info,
        source: 'llm',
        polygon: llmPolygon
      });
    } else {
      console.log(`  ❌ Could not get boundary`);
      results.failed.push({ id, ...info });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`OSM boundaries (Wikipedia map source): ${results.osm.length}`);
  console.log(`LLM boundaries (text extraction): ${results.llm.length}`);
  console.log(`Failed: ${results.failed.length}`);

  if (results.osm.length > 0) {
    console.log('\nNeighborhoods with OSM/Wikipedia maps:');
    results.osm.forEach(r => console.log(`  - ${r.name}`));
  }

  if (results.llm.length > 0) {
    console.log('\nNeighborhoods using LLM extraction:');
    results.llm.forEach(r => console.log(`  - ${r.name}`));
  }

  // Save results
  const outputPath = join(__dirname, 'unified-boundaries-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to ${outputPath}`);
}

main().catch(console.error);
