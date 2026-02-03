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
9. [Appendix: Scripts Reference](#appendix-scripts-reference)

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

*Last updated: February 3, 2026*
