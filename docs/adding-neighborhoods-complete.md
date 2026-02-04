# Complete Guide: Adding New Neighborhoods to Flâneur

This document provides a comprehensive, step-by-step process for adding new neighborhoods to the Flâneur platform. Follow each section in order to ensure all components are properly configured.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Database Setup](#step-1-database-setup)
4. [Step 2: Map Boundaries](#step-2-map-boundaries)
5. [Step 3: Wikipedia Integration](#step-3-wikipedia-integration)
6. [Step 4: Content Generation](#step-4-content-generation)
7. [Step 5: RSS Feeds Configuration](#step-5-rss-feeds-configuration)
8. [Step 6: Testing & Validation](#step-6-testing--validation)
9. [Step 7: NYC Open Data Configuration](#step-7-nyc-open-data-configuration-nyc-only)
10. [Step 8: Global/International Neighborhoods](#step-8-globalinternational-neighborhoods)
11. [Appendix: Scripts Reference](#appendix-scripts-reference)

---

## Overview

Each Flâneur neighborhood consists of:

| Component | Location | Purpose |
|-----------|----------|---------|
| Database record | `neighborhoods` table in Supabase | Core neighborhood data |
| Map boundary | `src/lib/neighborhood-boundaries.ts` | Polygon for map display |
| Wikipedia link | `src/lib/neighborhood-utils.ts` | External reference link |
| Neighborhood guide | Generated content | Local insights and recommendations |
| News stories | `articles` table | Ongoing neighborhood coverage |

---

## Prerequisites

- Access to Supabase dashboard
- Node.js installed locally
- Repository cloned and dependencies installed (`npm install`)
- Anthropic API key (for boundary extraction script)

---

## Step 1: Database Setup

### 1.1 Add Neighborhood to Supabase

```sql
INSERT INTO neighborhoods (
  id,
  name,
  city,
  country,
  latitude,
  longitude,
  is_active,
  is_coming_soon
) VALUES (
  'city-neighborhood-name',    -- lowercase, hyphenated (e.g., 'nyc-tribeca')
  'Neighborhood Name',          -- Display name (e.g., 'Tribeca')
  'City',                       -- City name (e.g., 'New York')
  'Country',                    -- Country name (e.g., 'United States')
  40.7163,                      -- Center latitude
  -74.0086,                     -- Center longitude
  true,                         -- Set to false for testing
  false                         -- Set to true if not ready
);
```

### 1.2 ID Naming Convention

| City | Prefix | Example |
|------|--------|---------|
| New York | `nyc-` | `nyc-tribeca` |
| San Francisco | `sf-` | `sf-mission` |
| Los Angeles | `la-` | `la-silver-lake` |
| London | `london-` | `london-shoreditch` |
| Paris | `paris-` | `paris-marais` |
| Tokyo | `tokyo-` | `tokyo-shibuya` |
| Hong Kong | `hk-` | `hk-central` |

**Vacation Neighborhoods** (special case - use location name as prefix):
| Location | Prefix | Example |
|----------|--------|---------|
| Nantucket | `nantucket-` | `nantucket-nantucket` |
| Martha's Vineyard | `marthas-vineyard-` | `marthas-vineyard-marthas-vineyard` |
| The Hamptons | `the-hamptons-` | `the-hamptons-the-hamptons` |
| Aspen | `aspen-` | `aspen-aspen` |
| St. Barts | `st-barts-` | `st-barts-st-barts` |
| Saint-Tropez | `saint-tropez-` | `saint-tropez-saint-tropez` |
| Marbella | `marbella-` | `marbella-marbella` |
| Sylt | `sylt-` | `sylt-sylt` |

See `CITY_PREFIX_MAP` in `src/lib/neighborhood-utils.ts` for the complete list.

### 1.3 Vacation Neighborhoods (Special Case)

Vacation neighborhoods are grouped into regions instead of cities:

| Region | Value | Neighborhoods |
|--------|-------|---------------|
| US Vacation | `us-vacation` | Nantucket, Martha's Vineyard, The Hamptons, Aspen |
| Caribbean Vacation | `caribbean-vacation` | St. Barts |
| European Vacation | `europe-vacation` | Saint-Tropez, Marbella, Sylt |

For vacation neighborhoods, add the `region` field:

```sql
INSERT INTO neighborhoods (
  id, name, city, country, region, latitude, longitude, is_active
) VALUES (
  'nantucket-nantucket',
  'Nantucket',
  'Nantucket',      -- City same as name for vacation spots
  'USA',
  'us-vacation',    -- Region for grouping
  41.2835,
  -70.0995,
  true
);
```

---

## Step 2: Map Boundaries

### 2.1 Method A: Automated Wikipedia Extraction (Recommended)

Use the LLM-powered script to extract boundaries from Wikipedia:

```bash
# Edit the NEIGHBORHOODS object in the script to add your neighborhood
node scripts/extract-boundaries-with-llm.mjs
```

The script will:
1. Fetch the Wikipedia article
2. Use Claude to extract boundary streets
3. Geocode the intersections
4. Output polygon coordinates

### 2.2 Method B: Manual Definition

Add to `src/lib/neighborhood-boundaries.ts`:

```typescript
'city-neighborhood-name': {
  id: 'city-neighborhood-name',
  name: 'Neighborhood Name',
  city: 'City',
  center: [40.7163, -74.0086],  // [latitude, longitude]
  zoom: 14,                      // Map zoom level (13-16)
  polygon: [
    // 6-12 points tracing boundary clockwise
    // Each point: [latitude, longitude]
    [40.7230, -74.0125],  // NW corner
    [40.7230, -74.0005],  // NE corner
    [40.7110, -74.0005],  // SE corner
    [40.7110, -74.0125],  // SW corner
  ],
  adjacentNeighborhoods: [
    {
      name: 'Adjacent Area 1',
      polygon: [[40.73, -74.01], [40.73, -74.00], [40.72, -74.00], [40.72, -74.01]]
    },
    // Add 3-5 adjacent neighborhoods
  ]
}
```

### 2.3 Finding Coordinates

1. **Google Maps**: Right-click → "What's here?" to get lat/lng
2. **Wikipedia**: Many articles include boundary descriptions
3. **OpenStreetMap**: Use Nominatim for geocoding streets

### 2.4 Boundary Best Practices

- Use street intersections as polygon points (stable references)
- Follow natural boundaries: major streets, rivers, parks
- Include 6-12 points for the main polygon
- Add 3-5 adjacent neighborhoods as simple rectangles

---

## Step 3: Wikipedia Integration

### 3.1 Add Wikipedia Article Mapping

In `src/lib/neighborhood-utils.ts`, add to `WIKIPEDIA_ARTICLES`:

```typescript
const WIKIPEDIA_ARTICLES: Record<string, string> = {
  // ...existing entries...
  'city-neighborhood-name': 'Wikipedia_Article_Title',
};
```

### 3.2 Finding the Correct Article Title

1. Go to the neighborhood's Wikipedia page
2. Copy the part after `/wiki/` in the URL
3. Replace spaces with underscores

**Examples:**
- `https://en.wikipedia.org/wiki/Tribeca` → `'Tribeca'`
- `https://en.wikipedia.org/wiki/Chelsea,_Manhattan` → `'Chelsea,_Manhattan'`
- `https://en.wikipedia.org/wiki/Le_Marais` → `'Le_Marais'`

### 3.3 Test the Link

After adding, verify the link works:
```
https://en.wikipedia.org/wiki/{article_title}
```

---

## Step 4: Content Generation

### 4.1 Neighborhood Guide

Guides are generated and stored in the database. To create one:

1. Navigate to `/admin/guides` (admin access required)
2. Click "Generate Guide" for the neighborhood
3. Review and edit the generated content

**Guide sections include:**
- Overview / Character
- Best For / Who Lives Here
- Key Streets & Landmarks
- Food & Drink Recommendations
- Shopping & Services
- Getting Around
- Insider Tips

### 4.2 Initial Articles

Create seed articles for the neighborhood:

1. "What's New in [Neighborhood]" - Recent openings, changes
2. "Best Restaurants in [Neighborhood]" - Curated dining guide
3. "Weekend in [Neighborhood]" - Itinerary-style guide

### 4.3 Tonight & Events

Set up event tracking:
- Configure event sources for the area
- Add venue mappings if needed

---

## Step 5: RSS Feeds Configuration

### 5.1 Add RSS Sources

Add RSS feeds for the neighborhood in Supabase:

```sql
INSERT INTO rss_sources (city, name, feed_url, is_active)
VALUES ('City Name', 'Source Name', 'https://example.com/feed/', true);
```

The `city` field should match the neighborhood's `city` value in the `neighborhoods` table.

### 5.2 Example Feeds by Type

| Type | Example Feed URL |
|------|------------------|
| Local newspaper | `https://localnews.com/feed/` |
| City magazine | `https://citymagazine.com/rss.xml` |
| Neighborhood blog | `https://neighborhoodblog.com/feed/` |
| Regional news | `https://regionalnews.com/local/feed/` |

### 5.3 Vacation Neighborhood Feeds

Vacation neighborhoods have specialized local sources:

| Location | Sources |
|----------|---------|
| Martha's Vineyard | Vineyard Gazette, MV Times |
| Nantucket | Inquirer and Mirror, Nantucket Current |
| Aspen | Aspen Daily News, Aspen Times |
| The Hamptons | Dan's Papers |
| St. Barts | St Barth Weekly |
| Saint-Tropez | Riviera Radio |
| Marbella | Sur in English, Euro Weekly News |

---

## Step 6: Testing & Validation

### 6.1 Checklist

Run through this checklist before going live:

- [ ] **Database**: Neighborhood appears in `/neighborhoods` list
- [ ] **Map**: Boundary displays correctly at `/{city}/{neighborhood}/map`
- [ ] **Hinterlands**: Adjacent neighborhoods show with dashed borders
- [ ] **Wikipedia**: Link works and goes to correct article
- [ ] **Guide**: Content loads at `/{city}/{neighborhood}/guides`
- [ ] **Feed**: Stories appear at `/{city}/{neighborhood}`
- [ ] **Tonight**: Events load at `/{city}/{neighborhood}/tonight`
- [ ] **Mobile**: All views work on mobile devices

### 6.2 Common Issues

**Map shows wrong location:**
- Check latitude/longitude aren't swapped
- Verify coordinates are in the correct city

**Wikipedia link broken:**
- Check for special characters in article title
- Verify article exists on English Wikipedia

**Neighborhood not appearing:**
- Check `is_active = true` in database
- Verify ID matches in all files

---

## Appendix: Scripts Reference

### Boundary Scripts

| Script | Purpose |
|--------|---------|
| `scripts/extract-boundaries-with-llm.mjs` | Extract boundaries from Wikipedia using Claude |
| `scripts/fetch-wikipedia-boundaries.mjs` | Simple regex-based boundary extraction |
| `scripts/fetch-wikidata-boundaries-v2.mjs` | Fetch boundaries via Wikidata → OSM |

### Running Scripts

```bash
# Extract boundaries using LLM
node scripts/extract-boundaries-with-llm.mjs

# Check Wikipedia boundary results
cat scripts/llm-boundaries-results.json
```

### Coordinate Reference by City

| City | Latitude Range | Longitude Range |
|------|----------------|-----------------|
| New York | 40.70 - 40.82 | -74.02 - -73.93 |
| San Francisco | 37.70 - 37.82 | -122.52 - -122.35 |
| London | 51.45 - 51.55 | -0.25 - 0.05 |
| Paris | 48.80 - 48.92 | 2.20 - 2.50 |
| Tokyo | 35.60 - 35.75 | 139.65 - 139.85 |
| Los Angeles | 33.90 - 34.15 | -118.50 - -118.15 |

---

## Quick Start: Adding a Neighborhood in 5 Minutes

For experienced users, here's the minimal path:

```bash
# 1. Add to database (Supabase SQL editor)
INSERT INTO neighborhoods (id, name, city, country, latitude, longitude, is_active)
VALUES ('city-name', 'Name', 'City', 'Country', LAT, LON, true);

# 2. Add Wikipedia mapping (src/lib/neighborhood-utils.ts)
'city-name': 'Wikipedia_Article',

# 3. Add boundary (src/lib/neighborhood-boundaries.ts)
'city-name': { id, name, city, center, zoom, polygon, adjacentNeighborhoods }

# 4. Restart dev server
npm run dev

# 5. Verify at localhost:3000/{city}/{name}/map
```

---

---

## Combo Neighborhoods

Combo neighborhoods aggregate multiple areas into a single feed (e.g., "SoHo" = SoHo + NoHo + NoLita + Hudson Square).

### Database Structure

```sql
-- neighborhoods table has is_combo flag
ALTER TABLE neighborhoods ADD COLUMN is_combo BOOLEAN DEFAULT false;

-- Join table links combos to components
CREATE TABLE combo_neighborhoods (
  id UUID PRIMARY KEY,
  combo_id TEXT REFERENCES neighborhoods(id),
  component_id TEXT REFERENCES neighborhoods(id),
  display_order INTEGER DEFAULT 0,
  UNIQUE(combo_id, component_id)
);
```

### Creating a Combo

```sql
-- 1. Create component neighborhoods (is_active = false)
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_combo)
VALUES ('nyc-noho', 'NoHo', 'New York', 'America/New_York', 'USA', 'north-america', 40.7265, -73.9927, 400, false, false);

-- 2. Update parent to be combo
UPDATE neighborhoods SET is_combo = true WHERE id = 'nyc-soho';

-- 3. Link components
INSERT INTO combo_neighborhoods (combo_id, component_id, display_order)
VALUES ('nyc-soho', 'nyc-noho', 2);
```

### Querying Combos

Use utilities in `src/lib/combo-utils.ts`:

```typescript
import { getNeighborhoodIdsForQuery, getComboInfo } from '@/lib/combo-utils';

// Get component IDs for queries (returns ['nyc-soho-core', 'nyc-noho', 'nyc-nolita'] for nyc-soho)
const ids = await getNeighborhoodIdsForQuery(supabase, 'nyc-soho');

// Get combo metadata for UI
const info = await getComboInfo(supabase, 'nyc-soho');
// { isCombo: true, componentNames: ['SoHo', 'NoHo', 'NoLita', 'Hudson Square'] }
```

### Current Combos (as of Feb 2026)

| Combo | Components |
|-------|------------|
| SoHo | SoHo, NoHo, NoLita, Hudson Square |
| Tribeca | Tribeca, FiDi |
| Brooklyn West | Dumbo, Cobble Hill, Park Slope |
| The Hamptons | The Hamptons, Montauk |
| Östermalm & City | Östermalm, Norrmalm, Gamla Stan, Djurgården |

---

## Step 7: NYC Open Data Configuration (NYC Only)

NYC neighborhoods have additional civic data integration for permits, liquor licenses, and crime stats.

### 7.1 Add to NYC Locations Config

Edit `src/config/nyc-locations.ts`:

```typescript
export const FLANEUR_NYC_CONFIG: Record<string, NYCNeighborhoodConfig> = {
  // Add your neighborhood
  'Your Neighborhood': {
    zips: ['10001', '10011'],           // Zip codes (DOB permits, liquor licenses)
    precincts: ['10th Precinct'],       // Police precincts (crime stats)
    tone: 'Editorial tone for AI',      // Guides AI content generation
  },
};

// Map URL slug to config key
export const NEIGHBORHOOD_ID_TO_CONFIG: Record<string, string> = {
  'your-neighborhood': 'Your Neighborhood',
};
```

### 7.2 Shared Zip Code Handling

Some zip codes are shared between neighborhoods (e.g., 10001 = Chelsea + Hudson Yards). The system disambiguates using street addresses. Add special handling in `getNeighborhoodKeyFromZip()` if needed:

```typescript
if (zipCode === '10001' && address) {
  if (address.includes('HUDSON YARDS')) return 'Hudson Yards';
  return 'Chelsea';  // Default
}
```

### 7.3 Combo Neighborhoods

For combo neighborhoods, aggregate zip codes and precincts from all components:

```typescript
'Brooklyn West': {
  components: ['Dumbo', 'Cobble Hill', 'Park Slope'],
  zips: ['11201', '11231', '11215', '11217'],  // All component zips
  precincts: ['84th Precinct', '76th Precinct', '78th Precinct'],
  tone: 'Brownstone Families, Strollers & Eco-Luxury',
},
```

### 7.4 Current NYC Coverage

| Neighborhood | Zips | Precincts |
|--------------|------|-----------|
| Chelsea | 10001, 10011 | 10th |
| Greenwich Village | 10003, 10012, 10014 | 6th |
| West Village | 10014 | 6th |
| Hudson Yards | 10001, 10018 | Midtown South |
| Meatpacking | 10014 | 6th |
| FiDi | 10004-10007, 10038 | 1st |
| Upper East Side | 10021, 10028, 10065, 10075, 10128 | 19th |
| Upper West Side | 10023-10025 | 20th, 24th |
| Williamsburg | 11211, 11249 | 90th, 94th |
| Brooklyn West | 11201, 11231, 11215, 11217 | 84th, 76th, 78th |

---

---

## Step 8: Global/International Neighborhoods

For international neighborhoods (London, Sydney, Chicago, LA, DC), configure the City Adapter system for civic data integration.

### 8.1 Add to Global Locations Config

Edit `src/config/global-locations.ts`:

```typescript
export const GLOBAL_CITY_CONFIG: Record<string, CityConfig> = {
  London: {
    city: 'London',
    country: 'UK',
    adapter: 'LondonAdapter',
    currency: 'GBP',
    zones: [
      {
        name: 'Your Neighborhood',
        neighborhoodId: 'your-neighborhood',  // URL slug
        tone: 'Editorial tone for AI content',
        zoneCode: 'Borough Name',             // Local authority
        postalCodes: ['SW1', 'SW3'],          // UK postcode prefixes
      },
    ],
  },
};
```

### 8.2 Zone Configuration Fields

| Field | Purpose | Example |
|-------|---------|---------|
| `name` | Display name | `'Mayfair'` |
| `neighborhoodId` | URL slug | `'mayfair'` |
| `tone` | AI editorial context | `'Old money, hedge funds'` |
| `zoneCode` | Local authority/borough | `'Westminster'` |
| `altCodes` | Alternative zone codes | `['City of Westminster']` |
| `postalCodes` | Postal/zip codes | `['W1J', 'W1K']` |

### 8.3 City Vocabulary

Add localized terminology for AI content:

```typescript
export const CITY_VOCABULARIES: Record<string, CityVocabulary> = {
  London: {
    permitTerms: ['Planning Permission', 'Listed Building Consent'],
    liquorTerms: ['Premises Licence', 'Personal Licence'],
    realEstateTerms: ['Freehold', 'Leasehold', 'Mews House'],
    localPhrases: ['in the borough', 'on the high street'],
    currencySymbol: '£',
    currencyName: 'British Pounds',
  },
};
```

### 8.4 Creating a New City Adapter

For cities not yet supported, create a new adapter in `src/lib/adapters/`:

```typescript
export class NewCityAdapter extends BaseCityAdapter {
  readonly city = 'New City';
  readonly country = 'Country';
  readonly currency = 'USD';
  readonly vocabulary: CityVocabulary;

  async getPermits(since?: Date): Promise<StoryData[]> {
    // Fetch from city's Open Data API
  }

  async getLiquor(since?: Date): Promise<StoryData[]> {
    // Fetch liquor licenses
  }

  async getSafety(period?: 'week' | 'month'): Promise<SafetyStats[]> {
    // Fetch crime/safety statistics
  }
}
```

Then register in `src/lib/adapters/index.ts`:

```typescript
const ADAPTER_REGISTRY: Record<string, new () => ICityAdapter> = {
  NewCityAdapter,
  // ...existing adapters
};

const CITY_TO_ADAPTER: Record<string, string> = {
  'New City': 'NewCityAdapter',
};
```

### 8.5 Current International Coverage

| City | Adapter | Data Sources |
|------|---------|--------------|
| London | `LondonAdapter` | UK Police API, Westminster Planning |
| Sydney | `SydneyAdapter` | NSW Planning Portal, BOCSAR |
| Chicago | `ChicagoAdapter` | Chicago Data Portal (Socrata) |
| Los Angeles | `LosAngelesAdapter` | LA Open Data (Socrata) |
| Washington DC | `WashingtonDCAdapter` | DC Open Data (ArcGIS) |

---

*Last updated: February 5, 2026*
