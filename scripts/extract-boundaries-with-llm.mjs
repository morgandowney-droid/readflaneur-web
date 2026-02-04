/**
 * Extract neighborhood boundaries from Wikipedia using LLM
 *
 * This script:
 * 1. Fetches Wikipedia articles for each neighborhood
 * 2. Uses Claude API to extract boundary streets from the text
 * 3. Geocodes the street intersections
 * 4. Generates polygon coordinates
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

// Initialize Anthropic client
const anthropic = new Anthropic();

// Wikipedia article mappings
const NEIGHBORHOODS = {
  'nyc-tribeca': { article: 'Tribeca', city: 'New York, NY', name: 'Tribeca' },
  'nyc-west-village': { article: 'West_Village', city: 'New York, NY', name: 'West Village' },
  'nyc-soho': { article: 'SoHo,_Manhattan', city: 'New York, NY', name: 'SoHo' },
  'nyc-chelsea': { article: 'Chelsea,_Manhattan', city: 'New York, NY', name: 'Chelsea' },
  'nyc-greenwich-village': { article: 'Greenwich_Village', city: 'New York, NY', name: 'Greenwich Village' },
  'nyc-east-village': { article: 'East_Village,_Manhattan', city: 'New York, NY', name: 'East Village' },
  'nyc-lower-east-side': { article: 'Lower_East_Side', city: 'New York, NY', name: 'Lower East Side' },
  'nyc-upper-east-side': { article: 'Upper_East_Side', city: 'New York, NY', name: 'Upper East Side' },
  'nyc-upper-west-side': { article: 'Upper_West_Side', city: 'New York, NY', name: 'Upper West Side' },
  'nyc-williamsburg': { article: 'Williamsburg,_Brooklyn', city: 'New York, NY', name: 'Williamsburg' },
  'sf-mission': { article: 'Mission_District,_San_Francisco', city: 'San Francisco, CA', name: 'Mission District' },
  'sf-castro': { article: 'The_Castro,_San_Francisco', city: 'San Francisco, CA', name: 'The Castro' },
  'sf-hayes-valley': { article: 'Hayes_Valley,_San_Francisco', city: 'San Francisco, CA', name: 'Hayes Valley' },
  'sf-marina': { article: 'Marina_District,_San_Francisco', city: 'San Francisco, CA', name: 'Marina District' },
  'london-shoreditch': { article: 'Shoreditch', city: 'London, UK', name: 'Shoreditch' },
  'london-soho': { article: 'Soho', city: 'London, UK', name: 'Soho' },
  'london-chelsea': { article: 'Chelsea,_London', city: 'London, UK', name: 'Chelsea' },
  'london-notting-hill': { article: 'Notting_Hill', city: 'London, UK', name: 'Notting Hill' },
  'paris-marais': { article: 'Le_Marais', city: 'Paris, France', name: 'Le Marais' },
  'paris-montmartre': { article: 'Montmartre', city: 'Paris, France', name: 'Montmartre' },
};

// Fetch Wikipedia article
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
    console.error(`Error fetching ${articleTitle}:`, error.message);
    return null;
  }
}

// Use Claude to extract boundary information
async function extractBoundariesWithLLM(articleText, neighborhoodName, city) {
  const prompt = `You are analyzing a Wikipedia article about the ${neighborhoodName} neighborhood in ${city}.

Extract the boundary streets/landmarks that define this neighborhood. Look for phrases like "bounded by", "borders", "extends from...to", directional boundaries (north, south, east, west).

Return a JSON object with:
- north: the street/landmark forming the northern boundary
- south: the street/landmark forming the southern boundary
- east: the street/landmark forming the eastern boundary
- west: the street/landmark forming the western boundary
- corners: array of 4-8 corner intersection names (e.g., "14th Street and 7th Avenue")

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
    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error(`LLM error for ${neighborhoodName}:`, error.message);
    return null;
  }
}

// City bounding boxes for filtering geocode results
const CITY_BOUNDS = {
  'New York, NY': { minLat: 40.70, maxLat: 40.82, minLon: -74.02, maxLon: -73.93 },
  'San Francisco, CA': { minLat: 37.70, maxLat: 37.82, minLon: -122.52, maxLon: -122.35 },
  'London, UK': { minLat: 51.45, maxLat: 51.55, minLon: -0.25, maxLon: 0.05 },
  'Paris, France': { minLat: 48.80, maxLat: 48.92, minLon: 2.20, maxLon: 2.50 },
};

// Check if coordinates are within city bounds
function isWithinBounds(lat, lon, city) {
  const bounds = CITY_BOUNDS[city];
  if (!bounds) return true; // No bounds defined, accept anything
  return lat >= bounds.minLat && lat <= bounds.maxLat &&
         lon >= bounds.minLon && lon <= bounds.maxLon;
}

// Geocode an intersection using Nominatim
async function geocodeIntersection(intersection, city) {
  // Try multiple query formats - be more specific for NYC
  const cityContext = city.includes('New York') ? 'Manhattan, New York City, NY' : city;
  const queries = [
    `${intersection}, ${cityContext}`,
    `${intersection.replace(' and ', ' & ')}, ${cityContext}`,
  ];

  for (const query of queries) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;

    try {
      await new Promise(resolve => setTimeout(resolve, 1100)); // Rate limit

      const response = await fetch(url, {
        headers: { 'User-Agent': 'FlaneurApp/1.0' }
      });
      const data = await response.json();

      // Find first result within city bounds
      for (const result of data) {
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        if (isWithinBounds(lat, lon, city)) {
          return { lat, lon };
        }
      }
    } catch (error) {
      // Try next query format
    }
  }
  return null;
}

// Geocode a boundary street to get its approximate center
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

    // Find first result within city bounds
    for (const result of data) {
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      if (isWithinBounds(lat, lon, city)) {
        return { lat, lon, boundingbox: result.boundingbox };
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Main function
async function main() {
  console.log('Extracting neighborhood boundaries from Wikipedia using LLM...\n');

  const results = {};

  // Process a subset for testing
  const testIds = ['nyc-tribeca', 'nyc-west-village', 'nyc-chelsea'];

  for (const id of testIds) {
    const info = NEIGHBORHOODS[id];
    if (!info) continue;

    console.log(`\n=== ${info.name} (${info.city}) ===`);

    // Fetch article
    const articleText = await fetchWikipediaArticle(info.article);
    if (!articleText) {
      console.log('  ❌ Could not fetch article');
      continue;
    }
    console.log(`  ✓ Fetched article (${articleText.length} chars)`);

    // Extract boundaries with LLM
    console.log('  Extracting boundaries with Claude...');
    const boundaries = await extractBoundariesWithLLM(articleText, info.name, info.city);

    if (boundaries) {
      console.log('  Boundaries:', JSON.stringify(boundaries, null, 2));

      // First try geocoding corners
      let coords = [];
      if (boundaries.corners && boundaries.corners.length > 0) {
        console.log('  Geocoding corners...');
        for (const corner of boundaries.corners.slice(0, 6)) {
          const geo = await geocodeIntersection(corner, info.city);
          if (geo) {
            coords.push([geo.lat, geo.lon]);
            console.log(`    ✓ ${corner}: [${geo.lat}, ${geo.lon}]`);
          } else {
            console.log(`    ❌ ${corner}: not found`);
          }
        }
      }

      // If corners didn't work, try building from cardinal boundaries
      if (coords.length < 3 && (boundaries.north || boundaries.south || boundaries.east || boundaries.west)) {
        console.log('  Geocoding boundary streets...');
        const streetCoords = {};

        if (boundaries.north) {
          const geo = await geocodeStreet(boundaries.north.split(' or ')[0], info.city);
          if (geo) {
            streetCoords.north = geo;
            console.log(`    ✓ North (${boundaries.north}): ${geo.lat}`);
          }
        }
        if (boundaries.south) {
          const geo = await geocodeStreet(boundaries.south.split(' or ')[0], info.city);
          if (geo) {
            streetCoords.south = geo;
            console.log(`    ✓ South (${boundaries.south}): ${geo.lat}`);
          }
        }
        if (boundaries.east) {
          const geo = await geocodeStreet(boundaries.east.split(' or ')[0].split(',')[0], info.city);
          if (geo) {
            streetCoords.east = geo;
            console.log(`    ✓ East (${boundaries.east}): ${geo.lon}`);
          }
        }
        if (boundaries.west) {
          const geo = await geocodeStreet(boundaries.west.split(' or ')[0].split(',')[0], info.city);
          if (geo) {
            streetCoords.west = geo;
            console.log(`    ✓ West (${boundaries.west}): ${geo.lon}`);
          }
        }

        // Build polygon from cardinal coordinates
        if (Object.keys(streetCoords).length >= 3) {
          const north = streetCoords.north?.lat || streetCoords.east?.lat || streetCoords.west?.lat;
          const south = streetCoords.south?.lat || streetCoords.east?.lat || streetCoords.west?.lat;
          const east = streetCoords.east?.lon || streetCoords.north?.lon || streetCoords.south?.lon;
          const west = streetCoords.west?.lon || streetCoords.north?.lon || streetCoords.south?.lon;

          if (north && south && east && west) {
            coords = [
              [north, west],   // NW
              [north, east],   // NE
              [south, east],   // SE
              [south, west],   // SW
            ];
            console.log('  ✓ Built polygon from cardinal boundaries');
          }
        }
      }

      if (coords.length >= 3) {
        results[id] = {
          ...info,
          boundaries,
          polygon: coords
        };
        console.log('  ✓ Polygon:', JSON.stringify(coords));
      }
    } else {
      console.log('  ❌ Could not extract boundaries');
    }
  }

  // Save results
  const outputPath = join(__dirname, 'llm-boundaries-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to ${outputPath}`);
}

main().catch(console.error);
