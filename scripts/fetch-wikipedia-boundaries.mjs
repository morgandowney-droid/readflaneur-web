/**
 * Fetch neighborhood boundaries from Wikipedia article text
 *
 * Strategy:
 * 1. Fetch Wikipedia article for each neighborhood
 * 2. Extract boundary descriptions from the text
 * 3. Use geocoding to convert street names to coordinates
 * 4. Build polygon from the boundary streets
 */

import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Wikipedia article titles for each neighborhood
const NEIGHBORHOODS = {
  // New York
  'nyc-tribeca': { article: 'Tribeca', city: 'New York' },
  'nyc-west-village': { article: 'West_Village', city: 'New York' },
  'nyc-soho': { article: 'SoHo,_Manhattan', city: 'New York' },
  'nyc-noho': { article: 'NoHo,_Manhattan', city: 'New York' },
  'nyc-nolita': { article: 'Nolita', city: 'New York' },
  'nyc-lower-east-side': { article: 'Lower_East_Side', city: 'New York' },
  'nyc-east-village': { article: 'East_Village,_Manhattan', city: 'New York' },
  'nyc-greenwich-village': { article: 'Greenwich_Village', city: 'New York' },
  'nyc-chelsea': { article: 'Chelsea,_Manhattan', city: 'New York' },
  'nyc-flatiron': { article: 'Flatiron_District', city: 'New York' },
  'nyc-gramercy': { article: 'Gramercy_Park', city: 'New York' },
  'nyc-upper-east-side': { article: 'Upper_East_Side', city: 'New York' },
  'nyc-upper-west-side': { article: 'Upper_West_Side', city: 'New York' },
  'nyc-williamsburg': { article: 'Williamsburg,_Brooklyn', city: 'New York' },
  // San Francisco
  'sf-mission': { article: 'Mission_District,_San_Francisco', city: 'San Francisco' },
  'sf-castro': { article: 'The_Castro,_San_Francisco', city: 'San Francisco' },
  'sf-marina': { article: 'Marina_District,_San_Francisco', city: 'San Francisco' },
  'sf-hayes-valley': { article: 'Hayes_Valley,_San_Francisco', city: 'San Francisco' },
  'sf-nob-hill': { article: 'Nob_Hill,_San_Francisco', city: 'San Francisco' },
  'sf-north-beach': { article: 'North_Beach,_San_Francisco', city: 'San Francisco' },
  'sf-pacific-heights': { article: 'Pacific_Heights,_San_Francisco', city: 'San Francisco' },
  // London
  'london-shoreditch': { article: 'Shoreditch', city: 'London' },
  'london-soho': { article: 'Soho', city: 'London' },
  'london-notting-hill': { article: 'Notting_Hill', city: 'London' },
  'london-chelsea': { article: 'Chelsea,_London', city: 'London' },
  'london-marylebone': { article: 'Marylebone', city: 'London' },
  'london-islington': { article: 'Islington', city: 'London' },
  'london-brixton': { article: 'Brixton', city: 'London' },
  // Paris
  'paris-marais': { article: 'Le_Marais', city: 'Paris' },
  'paris-saint-germain': { article: 'Saint-Germain-des-Prés', city: 'Paris' },
  'paris-montmartre': { article: 'Montmartre', city: 'Paris' },
  'paris-belleville': { article: 'Belleville,_Paris', city: 'Paris' },
  // Add more as needed...
};

// Fetch Wikipedia article extract
async function fetchWikipediaArticle(articleTitle) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(articleTitle)}&prop=extracts&exintro=false&explaintext=true&format=json&origin=*`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];

    if (pageId === '-1') {
      return null;
    }

    return pages[pageId].extract;
  } catch (error) {
    console.error(`Error fetching ${articleTitle}:`, error.message);
    return null;
  }
}

// Extract boundary information from article text
function extractBoundaryInfo(text, neighborhoodName) {
  if (!text) return null;

  // Common patterns for boundary descriptions
  const patterns = [
    // "bounded by X to the north, Y to the south..."
    /bounded\s+(?:by\s+)?(.+?)(?:\.|;|\n\n)/i,
    // "borders are X, Y, Z..."
    /borders?\s+(?:are|include)\s+(.+?)(?:\.|;|\n\n)/i,
    // "runs from X to Y..."
    /runs?\s+from\s+(.+?)(?:\.|;|\n\n)/i,
    // "extends from X to Y..."
    /extends?\s+from\s+(.+?)(?:\.|;|\n\n)/i,
    // "between X and Y..."
    /between\s+(.+?)\s+and\s+(.+?)(?:\.|;|\n\n)/i,
    // "from X on the north to Y on the south"
    /from\s+(.+?)\s+on\s+the\s+(?:north|south|east|west)/i,
  ];

  const boundaries = {
    north: null,
    south: null,
    east: null,
    west: null,
    streets: [],
    rawText: null
  };

  // Look for directional boundaries
  const northMatch = text.match(/(?:to\s+the\s+)?north(?:ern)?\s+(?:by\s+)?(?:is\s+)?([A-Z][a-zA-Z\s]+(?:Street|Avenue|Boulevard|Road|Way|Place|Drive|Lane|Broadway|Park|River|Creek))/i);
  const southMatch = text.match(/(?:to\s+the\s+)?south(?:ern)?\s+(?:by\s+)?(?:is\s+)?([A-Z][a-zA-Z\s]+(?:Street|Avenue|Boulevard|Road|Way|Place|Drive|Lane|Broadway|Park|River|Creek))/i);
  const eastMatch = text.match(/(?:to\s+the\s+)?east(?:ern)?\s+(?:by\s+)?(?:is\s+)?([A-Z][a-zA-Z\s]+(?:Street|Avenue|Boulevard|Road|Way|Place|Drive|Lane|Broadway|Park|River|Creek))/i);
  const westMatch = text.match(/(?:to\s+the\s+)?west(?:ern)?\s+(?:by\s+)?(?:is\s+)?([A-Z][a-zA-Z\s]+(?:Street|Avenue|Boulevard|Road|Way|Place|Drive|Lane|Broadway|Park|River|Creek))/i);

  if (northMatch) boundaries.north = northMatch[1].trim();
  if (southMatch) boundaries.south = southMatch[1].trim();
  if (eastMatch) boundaries.east = eastMatch[1].trim();
  if (westMatch) boundaries.west = westMatch[1].trim();

  // Also look for the "bounded by" pattern which often lists all streets
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      boundaries.rawText = match[0];
      // Extract street names from the matched text
      const streetPattern = /([A-Z][a-zA-Z\s]+(?:Street|Avenue|Boulevard|Road|Way|Place|Drive|Lane|Broadway|Park|River|Creek|Highway))/g;
      let streetMatch;
      while ((streetMatch = streetPattern.exec(match[0])) !== null) {
        boundaries.streets.push(streetMatch[1].trim());
      }
      break;
    }
  }

  return boundaries;
}

// Geocode a street intersection using Nominatim (free, but rate-limited)
async function geocodeStreet(street, city) {
  const query = `${street}, ${city}`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

  try {
    // Rate limiting - Nominatim requires max 1 request per second
    await new Promise(resolve => setTimeout(resolve, 1100));

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FlaneurApp/1.0 (neighborhood-boundaries)'
      }
    });
    const data = await response.json();

    if (data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name
      };
    }
    return null;
  } catch (error) {
    console.error(`Error geocoding ${query}:`, error.message);
    return null;
  }
}

// Main function
async function main() {
  console.log('Fetching Wikipedia articles for neighborhood boundaries...\n');

  const results = {};

  // Process a subset for testing
  const testNeighborhoods = [
    'nyc-tribeca',
    'nyc-west-village',
    'nyc-soho',
    'london-soho',
    'sf-mission'
  ];

  for (const id of testNeighborhoods) {
    const info = NEIGHBORHOODS[id];
    if (!info) continue;

    console.log(`\n=== ${id} (${info.article}) ===`);

    // Fetch article
    const articleText = await fetchWikipediaArticle(info.article);
    if (!articleText) {
      console.log('  ❌ Could not fetch article');
      continue;
    }

    // Extract first 2000 chars for boundary info (usually in intro/geography section)
    const excerpt = articleText.substring(0, 3000);

    // Extract boundary info
    const boundaries = extractBoundaryInfo(excerpt, info.article);

    if (boundaries) {
      console.log('  Boundaries found:');
      if (boundaries.north) console.log(`    North: ${boundaries.north}`);
      if (boundaries.south) console.log(`    South: ${boundaries.south}`);
      if (boundaries.east) console.log(`    East: ${boundaries.east}`);
      if (boundaries.west) console.log(`    West: ${boundaries.west}`);
      if (boundaries.streets.length > 0) {
        console.log(`    Streets: ${boundaries.streets.join(', ')}`);
      }
      if (boundaries.rawText) {
        console.log(`    Raw: "${boundaries.rawText.substring(0, 200)}..."`);
      }

      results[id] = {
        ...info,
        boundaries,
        excerpt: excerpt.substring(0, 500)
      };

      // Geocode the boundary streets
      if (boundaries.north || boundaries.south || boundaries.east || boundaries.west) {
        console.log('  Geocoding boundaries...');
        const coords = {};

        if (boundaries.north) {
          const geo = await geocodeStreet(boundaries.north, info.city);
          if (geo) coords.north = geo;
        }
        if (boundaries.south) {
          const geo = await geocodeStreet(boundaries.south, info.city);
          if (geo) coords.south = geo;
        }
        if (boundaries.east) {
          const geo = await geocodeStreet(boundaries.east, info.city);
          if (geo) coords.east = geo;
        }
        if (boundaries.west) {
          const geo = await geocodeStreet(boundaries.west, info.city);
          if (geo) coords.west = geo;
        }

        results[id].geocoded = coords;
        console.log('  Geocoded:', JSON.stringify(coords, null, 2));
      }
    } else {
      console.log('  ❌ No boundary information found in article');
      // Still save the excerpt for manual review
      results[id] = {
        ...info,
        boundaries: null,
        excerpt: excerpt.substring(0, 500)
      };
    }
  }

  // Save results
  const outputPath = join(__dirname, 'wikipedia-boundaries-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to ${outputPath}`);
}

main().catch(console.error);
