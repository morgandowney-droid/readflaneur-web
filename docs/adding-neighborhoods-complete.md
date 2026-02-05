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

### 7.5 Film Permits ("Set Life")

NYC neighborhoods automatically receive "Set Life" alerts for upcoming film/TV shoots. The `sync-filming-permits` cron fetches from NYC Open Data Film Permits API and filters by the same zip codes in `FLANEUR_NYC_CONFIG`.

No additional configuration needed - if a neighborhood has zips configured, it will receive film permit alerts.

**Data Source:** `https://data.cityofnewyork.us/resource/tg4x-b46p.json`

**Filters:**
- Premium categories only: Television, Feature Film, Commercial
- Excludes: Student, Still Photography
- Next 48 hours of shoots
- Known productions prioritized (Law & Order, Succession, etc.)

### 7.6 Outdoor Dining ("Al Fresco Alert")

NYC neighborhoods automatically receive "Al Fresco Alert" stories for new outdoor dining approvals. The `sync-alfresco-permits` cron fetches from NYC Open Data Open Restaurants Applications API.

**Data Source:** `https://data.cityofnewyork.us/resource/pitm-atqc.json`

**Filters:**
- Last 7 days of approved applications
- Sidewalk OR roadway seating approved
- Chain restaurants excluded (40+ patterns: Dunkin, Starbucks, Shake Shack, etc.)
- Prioritizes: Sidewalk > Both > Roadway
- Alcohol-serving venues prioritized

### 7.7 Heritage Watch (Preservation Alerts)

NYC neighborhoods receive heritage alerts for demolitions, landmark alterations, and tree removal. The `sync-heritage-filings` cron fetches from NYC DOB Job Application Filings.

**Data Source:** `https://data.cityofnewyork.us/resource/w9ak-ipjd.json`

**Three Triggers:**

| Trigger | Condition | Category | Tone |
|---------|-----------|----------|------|
| Demolition | `job_type = 'DM'` | Teardown Alert | Eulogy |
| Landmark | `landmark = 'Y'` + keywords | Facade Watch | Curator |
| Tree | Tree keywords in description | Green Loss | Concerned |

**Landmark Keywords:** facade, restoration, cornice, stoop, brownstone, limestone, terra cotta, windows, historic, ornamental, masonry, parapet, ironwork

**Tree Keywords:** tree removal, tree protection, tree work, specimen tree, mature tree

### 7.8 Auction Watch (Northeast Luxury Corridor)

Auction Watch scrapes the "Big Three" auction house calendars (Sotheby's, Christie's, Phillips) and syndicates stories to the entire Northeast Luxury Corridor. This is a regional syndication feature, not neighborhood-specific.

**Data Sources:**
- Sotheby's Calendar: `https://www.sothebys.com/en/calendar`
- Christie's Calendar: `https://www.christies.com/calendar`
- Phillips Calendar: `https://www.phillips.com/auctions/past-and-upcoming`

**Blue Chip Filtering:**

Only prestigious, newsworthy auctions are included via whitelist/blacklist keywords:

| Whitelist (Include) | Blacklist (Exclude) |
|---------------------|---------------------|
| Impressionist, Modern, Contemporary | Prints, Wine, Watches |
| Post-War, Fine Art, Masterworks | Luxury, Jewelry, Fashion |
| Evening Sale, Marquee, Flagship | Automobiles, Online Only |
| Blue Chip, Museum Quality | Charity, Benefit, Collector |
| Old Masters, American Art | Ceramics, Decorative, Furniture |
| 20th Century, Surrealism, Abstract | Photographs, Rugs, Silver |

**Tier Classification:**

| Tier | Criteria | Category Label |
|------|----------|----------------|
| Mega | Headline sales, Evening Sales, record-breaking lots | "Auction: Marquee Sale" |
| Standard | Regular Blue Chip auctions | "Auction Watch" |

**Northeast Luxury Corridor Coverage:**

The auction syndication targets 25+ neighborhoods across the region:

| Region | Neighborhoods |
|--------|---------------|
| NYC Core | Tribeca, SoHo, West Village, Greenwich Village, Chelsea, Meatpacking, UES, UWS, FiDi, Hudson Yards, Williamsburg, Brooklyn West |
| NYC Surroundings | Westchester, Old Westbury, The Hamptons |
| Connecticut | Greenwich, New Canaan, Darien, Westport |
| New Jersey | Bergen Gold, Montclair, Summit, The Hills |
| Massachusetts | Martha's Vineyard, Nantucket |

**Cron Schedule:** Weekly on Sundays at 11 PM UTC (6 PM EST)

**File:** `src/lib/nyc-auctions.ts`, `src/app/api/cron/sync-auction-calendar/route.ts`

### 7.9 Global Auction Watch (International Art Hubs)

Global Auction Watch extends the auction service to international art market cities using a "Hub & Spoke" model. Each hub city scrapes local auctions and syndicates stories to nearby spoke neighborhoods.

**Hub Configuration:**

```typescript
const ART_HUBS = {
  London: {
    houses: ['Sothebys_LDN', 'Christies_LDN', 'Phillips_LDN'],
    currency: 'GBP',
    targetFeeds: ['Mayfair', 'Chelsea', 'Kensington', 'Notting Hill', 'Hampstead'],
    tone: 'Traditional & Sharp',
    landmarks: ['Bond Street', 'King Street'],
  },
  Paris: {
    houses: ['Sothebys_PAR', 'Christies_PAR'],
    currency: 'EUR',
    targetFeeds: ['7th Arr', '16th Arr', 'Le Marais', 'Saint-Germain'],
    tone: 'Chic & Intellectual',
    landmarks: ['Drouot', 'Avenue Matignon'],
  },
  Hong_Kong: {
    houses: ['Sothebys_HK', 'Christies_HK', 'Phillips_HK'],
    currency: 'HKD',
    targetFeeds: ['Central', 'SoHo HK', 'The Peak'],
    tone: 'Fast-Paced & Investment Heavy',
  },
  Los_Angeles: {
    houses: ['Sothebys_LA', 'Christies_LA'],
    currency: 'USD',
    targetFeeds: ['Beverly Hills', 'West Hollywood', 'Santa Monica'],
    tone: 'Hollywood Glamour & Contemporary Edge',
  },
  Geneva: {
    houses: ['Sothebys_GVA', 'Christies_GVA'],
    currency: 'CHF',
    targetFeeds: ['European Vacation', 'Global Watch'],
    tone: 'Stealth Wealth',
  },
};
```

**Regional Blue Chip Keywords:**

Each hub has region-specific keywords that enhance the base Blue Chip filter:

| Hub | Regional Keywords |
|-----|-------------------|
| London | Old Master, British Art, Impressionist, English Furniture |
| Paris | Design, Surrealist, Art d'Asie, Mobilier, Art Nouveau |
| Hong Kong | 20th Century, Contemporary Asian, Watches, Chinese Works of Art |
| Los Angeles | California Art, Contemporary, Photography, Pop Art |
| Geneva | Luxury, Watches, Jewels, Gemstones, Patek Philippe |

**Localized Tone for AI Generation:**

Each hub has distinct editorial tone:

- **London**: Traditional & Sharp. Reference Bond Street or King Street. Emphasize heritage and provenance.
- **Paris**: Chic & Intellectual. Reference Drouot or Matignon. Emphasize artistic significance.
- **Hong Kong**: Fast-Paced & Investment Heavy. Emphasize market momentum and record prices.
- **Los Angeles**: Hollywood Glamour. Emphasize celebrity provenance and contemporary relevance.
- **Geneva**: Stealth Wealth. Focus on rarity and investment-grade luxury (Patek, rare diamonds).

**Cron Schedule:** Weekly on Sundays at 10 PM UTC (before NYC sync at 11 PM)

**Files:** `src/lib/global-auctions.ts`, `src/app/api/cron/sync-global-auction-calendar/route.ts`

### 7.10 Art Fair Coverage (Special Events)

Art Fair Service provides high-priority coverage during major global art fair weeks. Unlike scraping-based services, this uses a static calendar since fair dates are fixed months in advance.

**The Big 5 Fairs:**

```typescript
const ART_FAIRS = [
  {
    id: 'frieze-london',
    name: 'Frieze London',
    month: 10, // October
    approxWeek: 2,
    targetFeeds: ['london-mayfair', 'london-chelsea', 'london-kensington'],
    vibe: "Regent's Park tents, heavy rain, celebrity spotting, VIP preview passes."
  },
  {
    id: 'art-basel-miami',
    name: 'Art Basel Miami Beach',
    month: 12, // December
    approxWeek: 1,
    targetFeeds: ['miami-south-beach', 'miami-design-district', ...NYC_CORE],
    vibe: "Convention Center chaos, afterparties at The W, mega-yacht scene."
  },
  // + Frieze LA (Feb), Art Basel HK (March), Art Basel Paris (Oct)
];
```

**Coverage States:**

| State | Trigger | Priority | Focus |
|-------|---------|----------|-------|
| Preview | 7 days before | Standard | VIP passes, dinner circuit, who's going |
| Live | During fair week | **Hero** (pinned) | Sold-out booths, sales, energy, scene |
| Wrap | 3 days after | Standard | Final tallies, highlights, market sentiment |

**State Detection Logic:**

```typescript
function getFairState(fair: ArtFair, currentDate: Date): FairState {
  const { start, end, previewStart } = getFairDatesForYear(fair, year);

  if (currentDate >= start && currentDate <= end) return 'Live';
  if (currentDate >= previewStart && currentDate < start) return 'Preview';
  if (currentDate > end && currentDate <= wrapEnd) return 'Wrap';
  return 'Dormant';
}
```

**Hero Priority:**

Live coverage is marked with `is_pinned: true` in the database, causing it to float to the top of neighborhood feeds. This overrides standard local news during fair weeks.

**Cron Schedule:** Daily at 7 AM UTC

**Files:** `src/config/art-fairs.ts`, `src/lib/art-fairs.ts`, `src/app/api/cron/sync-art-fairs/route.ts`

### 7.11 Retail Watch (Luxury Store Openings)

Retail Watch monitors signage and advertisement permits to detect upcoming luxury retail openings. Unlike construction permits (which are about structure), signage permits reveal IDENTITY - who is moving in.

**The Strategy: "The Brand Reveal"**

Signage permits typically precede store openings by 3-4 months. We filter for:
1. Permits in our target zip codes (commercial corridors)
2. Luxury brand keywords in the job description or owner name

**The Luxury List (80+ brands):**

```typescript
const LUXURY_BRANDS = [
  // Fashion - Ultra Tier
  { name: 'Hermès', pattern: /herm[eè]s/i, tier: 'Ultra' },
  { name: 'Chanel', pattern: /chanel/i, tier: 'Ultra' },
  { name: 'Louis Vuitton', pattern: /louis\s*vuitton|vuitton/i, tier: 'Ultra' },
  // ... 70+ more brands across categories

  // Fashion - Aspirational Tier
  { name: 'Kith', pattern: /\bkith\b/i, tier: 'Aspirational' },
  { name: 'Aimé Leon Dore', pattern: /aim[eé]\s*leon\s*dore/i, tier: 'Aspirational' },
];
```

**Brand Categories:**

| Category | Ultra Examples | Aspirational Examples |
|----------|---------------|----------------------|
| Fashion | Hermès, Chanel, Prada, The Row | Kith, ALD, Fear of God |
| Watches & Jewelry | Patek, Cartier, Van Cleef | Omega, IWC |
| Beauty & Fragrance | Creed, Kurkdjian | Aesop, Le Labo, Byredo |
| Fitness & Wellness | - | Equinox, SoulCycle, Barry's |
| Private Clubs | Zero Bond, Casa Cipriani | Soho House, The Ned |
| Hospitality | Aman, Cipriani, Carbone | Nobu, Edition |
| Home & Design | Ligne Roset, B&B Italia | RH |

**Data Sources:**

| City | Source | Filter |
|------|--------|--------|
| NYC | DOB NOW / BIS | `job_type = 'SG'` (Sign) |
| London | Planning Portal | `application_type = 'Advertisement Consent'` |

**Story Generation:**

The Gemini prompt includes:
- Brand tier (Ultra vs Aspirational) for tone calibration
- Category-specific angles (fashion impact vs investment value)
- Estimated opening date (3-4 months from permit)
- Street context for "luxury corridor" narrative

**Cron Schedule:** Daily at 10 AM UTC

**Files:** `src/lib/retail-watch.ts`, `src/app/api/cron/sync-retail-watch/route.ts`

### 7.12 Nuisance Watch (311 Complaint Hotspots)

Nuisance Watch aggregates 311/Council complaints to detect quality of life hotspots. Raw 311 data is too noisy - we only report CLUSTERS and SPIKES.

**The Strategy: "The Cluster Detector"**

```typescript
const NUISANCE_THRESHOLD = 5;  // Min complaints to trigger story
const SPIKE_MULTIPLIER = 2;    // 2x baseline = spike

// Only generate story if:
// cluster.count >= NUISANCE_THRESHOLD
```

**Complaint Categories:**

| Category | NYC 311 Types | Severity | Signal |
|----------|---------------|----------|--------|
| Noise - Commercial | Noise - Commercial, Helicopter, Vehicle | High | Nightlife friction |
| Noise - Residential | Noise - Residential, Street/Sidewalk | Medium | Neighbor friction |
| Rodent | Rodent, Rat Sighting, Mouse Sighting | High | Sanitation decline |
| Homeless Encampment | Homeless Encampment, Assistance | High | Safety concern |
| Trash | Dirty Conditions, Missed Collection | Medium | Sanitation service |
| Sidewalk Condition | Sidewalk, Damaged Tree | Low | Infrastructure |
| Graffiti | Graffiti, Illegal Posting | Low | Vandalism |

**Privacy Rules:**

```typescript
// Commercial venues: Full address (name and shame)
if (categoryConfig.isCommercial) {
  displayLocation = permit.address;  // "123 Bleecker Street"
}

// Residential: Round to "100 Block" for privacy
else {
  const block = Math.floor(houseNumber / 100) * 100;
  displayLocation = `${block} Block of ${street}`;  // "100 Block of Perry St"
}
```

**Trend Detection:**

| Trend | Condition | Priority |
|-------|-----------|----------|
| Spike | count >= baseline * 2 | Community Alert |
| Elevated | count > baseline | Nuisance Watch |
| Normal | count <= baseline | Block Watch |

**Story Generation:**

- High severity spikes get priority coverage
- Category-specific headlines (Noise Watch, Sanitation Alert, Community Alert)
- Context includes complaint count and percent change
- Factual but engaged tone - "Neighbors are active this week"

**Cron Schedule:** Daily at 12 PM UTC

**Files:** `src/lib/nuisance-watch.ts`, `src/app/api/cron/sync-nuisance-watch/route.ts`

### 7.13 Specialty Auctions (Regional & Vacation Markets)

Specialty Auctions is a dual-engine service that completes global art market coverage by targeting:
1. **Tier 2 - National Champions**: Direct scraping of 20+ regional auction houses
2. **Tier 3 - Vacation Mappings**: Keyword filtering of Tier 1 events for vacation feeds

**Tier 2: National Champions (Direct Scraping)**

Regional auction houses with significant local market presence:

| Region | Houses | Cities |
|--------|--------|--------|
| Nordic | Bukowskis, Bruun Rasmussen | Stockholm, Copenhagen |
| DACH | Dorotheum, Grisebach, Ketterer, Koller | Vienna, Berlin, Munich, Zurich |
| Southern Europe | Finarte, Cambi, Balclis, Veritas | Milan, Rome, Barcelona, Lisbon |
| APAC | SBI Art, Smith & Singer, Leonard Joel | Tokyo, Sydney, Melbourne |
| North America | Heffel, Hindman, Bonhams SF, Skinner | Toronto, Chicago, San Francisco, Boston |

**Tier 3: Vacation Mappings (Hub Filtering)**

Maps Tier 1 global events to vacation feeds using keyword matching:

| Vacation | Source Hubs | Keywords | Tone |
|----------|-------------|----------|------|
| St. Barts | NYC, Paris | Resort, Jewels, Hermès, Handbags | Villa Lifestyle |
| Aspen | NYC, LA | Western Art, Photography, Design | Mountain Chic |
| The Hamptons | NYC | Contemporary, Prints, Editions | Beach House Art |
| Sylt | London | Photography, Modern | German Coastal Elite |
| Marbella | London | Contemporary, Luxury | Riviera Glamour |
| Martha's Vineyard | NYC | American, Maritime, Prints | New England Heritage |
| Nantucket | NYC | Americana, Maritime, Folk Art | Island Tradition |
| Cap Ferrat | Paris, Geneva | Jewels, Impressionist | Côte d'Azur Prestige |
| Lake Como | Milan | Design, Modern Italian | Lakeside Elegance |
| Mustique | NYC, London | Contemporary, Jewels | Island Exclusivity |

**Tier Classification:**

| Tier | Target | Category Label |
|------|--------|----------------|
| Mega | Major regional sales (Dorotheum evening, Bukowskis signature) | "Auction: Local Gavel" |
| Standard | Regular regional auctions | "Auction Watch" |
| Vacation | Filtered Tier 1 events | "Market Watch" |

**Story Generation:**

Each engine generates distinct content:

- **National Champions**: Local market focus with regional vocabulary
  - Currency-aware (SEK, DKK, EUR, AUD, CAD, etc.)
  - Regional tone injection (Scandi-Luxury, Habsburg Elegance, etc.)
  - Local landmark references

- **Vacation Mappings**: Lifestyle angle for vacation readers
  - "What's worth noting for collectors visiting [destination]"
  - Filtered by interests typical of each vacation market
  - Lighter tone than investment-focused hub content

**Cron Schedule:** Weekly on Sundays at 9 PM UTC (before global auction sync)

**Files:** `src/lib/specialty-auctions.ts`, `src/app/api/cron/sync-specialty-auctions/route.ts`

### 7.14 Gala Watch (High-Society Charity Events)

Gala Watch aggregates high-society charity events and distributes them to wealthy residential neighborhoods using the "Hub Broadcast" model.

**Architecture: Hub Broadcast Model**

Galas happen in City Centers (hubs), not suburbs. We scrape city hubs and broadcast events to associated wealthy neighborhoods (spokes).

**Hub Configuration:**

```typescript
const GALA_HUBS = {
  New_York: {
    sources: ['NY_Social_Diary', 'Eventbrite_NYC'],
    targetFeeds: ['UES', 'UWS', 'Tribeca', 'West Village', 'SoHo', 'Hamptons'],
    venues: ['The Met', 'Lincoln Center', 'Cipriani', 'The Plaza', 'NYPL'],
    currency: 'USD'
  },
  London: {
    sources: ['Tatler_Bystander', 'Eventbrite_LDN'],
    targetFeeds: ['Mayfair', 'Chelsea', 'Kensington', 'Notting Hill'],
    venues: ['V&A', 'The Dorchester', "Claridge's", 'Royal Albert Hall'],
    currency: 'GBP'
  },
  Paris: {
    sources: ['Paris_Diary', 'Eventbrite_PAR'],
    targetFeeds: ['7th Arr', '16th Arr', 'Le Marais'],
    venues: ['Palais Garnier', 'Grand Palais', 'Ritz Paris'],
    currency: 'EUR'
  },
  // + Los_Angeles, Sydney, Miami, Hong_Kong, Milan, Toronto
};
```

**Data Source A: High Ticket Filter (Eventbrite/Luma)**

The scalable engine for global coverage:

1. Search keywords: "Gala", "Ball", "Benefit", "Black Tie", "Charity Dinner"
2. **The Status Filter**: Check ticket price
   - IF price > $500 USD (or local equivalent) → IT IS A GALA
   - IF price < $100 → IGNORE (It's a mixer)
3. Location check: Venue must be within hub's search radius

**Currency Normalization:**

```typescript
// Convert local prices to USD equivalent
function normalizeCurrency(price: number, currency: GalaCurrency): number {
  const rates = { USD: 1.0, GBP: 1.27, EUR: 1.08, AUD: 0.65, CAD: 0.74, HKD: 0.13 };
  return Math.round(price * rates[currency]);
}

// Local thresholds equivalent to $500 USD
// GBP: £400, EUR: €450, AUD: A$770, CAD: C$675
```

**Data Source B: Society Pages (Targeted)**

| Source | URL | Focus |
|--------|-----|-------|
| NY Social Diary | newyorksocialdiary.com/calendar/ | Benefit Events |
| Tatler UK | tatler.com/topic/parties | "Save the Date" announcements |

**Gemini Story Generation (FOMO Engine):**

Tone: "Insider & Exclusive" - Even if readers aren't attending, they need to know it's happening.

```
Headline: "Social Calendar: [Event Name] at [Venue]"
Body: "The city's philanthropists descend on [Venue] tonight.
       Expect heavy black cars and high fashion. Tickets started at [Price]."
```

**Event Detection:**

| Detection | Keywords/Triggers |
|-----------|-------------------|
| Gala Keywords | gala, ball, benefit, black tie, charity dinner, fundraiser |
| Exclude Keywords | happy hour, mixer, networking, meetup, workshop |
| Black Tie | "black tie", "formal attire", "evening dress" |
| Benefit | "benefit", "charity", "fundraiser", "foundation" |

**Venue Prestige Matching:**

Each hub has a list of prestigious venues. Events at these venues get priority:

- **NYC**: The Met, Lincoln Center, Cipriani, The Plaza, MoMA, Guggenheim
- **London**: V&A, The Dorchester, Claridge's, Royal Albert Hall, Kensington Palace
- **Paris**: Palais Garnier, Grand Palais, Ritz Paris, Four Seasons George V

**Cron Schedule:** Daily at 6 AM UTC

**Files:** `src/lib/gala-watch.ts`, `src/app/api/cron/sync-gala-watch/route.ts`

### 7.15 Escape Index (Vacation Conditions)

Escape Index injects vacation conditions (Snow, Surf, Weather) into feeder city feeds to trigger travel decisions.

**Architecture: "The Feeder Map"**

We don't show snow reports in Aspen. We show them in *New York* (where the skiers are).

```typescript
const ESCAPE_ROUTES = {
  New_York: {
    targets: ['Aspen', 'Deer_Valley', 'The_Hamptons', 'St_Barts', 'Turks_and_Caicos'],
    neighborhoodIds: ['nyc-upper-east-side', 'nyc-tribeca', 'nyc-west-village', ...]
  },
  London: {
    targets: ['Courchevel', 'Verbier', 'St_Moritz', 'Ibiza', 'Cornwall', 'Mykonos'],
    neighborhoodIds: ['london-mayfair', 'london-chelsea', 'london-kensington', ...]
  },
  // + Paris, Los_Angeles, San_Francisco, Chicago, Sydney, Hong_Kong, Tokyo, Miami
};
```

**Feeder City Coverage:**

| Feeder City | Snow Targets | Surf Targets | Sun Targets |
|-------------|--------------|--------------|-------------|
| New York | Aspen, Deer Valley, Vail | The Hamptons | St. Barts, Turks & Caicos |
| London | Courchevel, Verbier, St. Moritz | Cornwall | Ibiza, Mykonos, Amalfi |
| Paris | Courchevel, Verbier, Zermatt | Biarritz | St. Barts, Ibiza, Mykonos |
| Los Angeles | Aspen, Deer Valley, Park City | Malibu | Cabo, Hawaii, Tulum |
| San Francisco | Tahoe, Park City | - | Hawaii, Cabo, Costa Rica |
| Sydney | Niseko | Byron Bay, Noosa | Queenstown, Bali, Fiji |

**Data Sources (Open-Meteo API - Free, No Key Required):**

| Adapter | API | Metrics |
|---------|-----|---------|
| Snow | Open-Meteo Forecast | snowfall_sum, temperature, weathercode |
| Surf | Open-Meteo Marine | wave_height, wave_period, swell_wave_height |
| Sun | Open-Meteo Forecast | temperature_2m, uv_index, cloudcover |

**Condition Thresholds:**

| Type | Threshold | Alert Name |
|------|-----------|------------|
| Snow | >6 inches in 24h | **Powder Day** |
| Surf | >4ft swell + >10s period + <15mph wind | **Firing** |
| Sun | >70°F + UV 5+ + 2+ good days ahead | **Perfect Weekend** |

**Gemini Story Generation:**

Tone: "Urgent Leisure" - "Pack your bags."

```
// Snow
Headline: "Powder Alert: Aspen gets 12" overnight."
Body: "Fresh snow is piling up in the Rockies. Aspen woke up to a foot of new powder.
       Conditions: Heavy Snow, 22°F. Book now or miss the dump."

// Surf
Headline: "Swell Watch: Byron Bay is firing this weekend."
Body: "A 6ft swell from the SE with 14-second period is hitting the coast.
       Light offshore winds. Conditions are perfect. Wheels up."

// Sun
Headline: "Escape Plan: Perfect forecast for St. Barts this weekend."
Body: "84°F, clear skies, UV 9. Five days of perfect weather ahead.
       The villa is calling. Pack light."
```

**Urgency Levels:**

| Level | Trigger | Action |
|-------|---------|--------|
| High | Powder Day / Firing / Perfect Weekend | Article pinned to top |
| Medium | Good but not exceptional | Standard placement |
| Low | Marginal conditions | Lower priority |

**Seasonality:**

Each destination has a season (e.g., Aspen: Nov-Apr, St. Barts: Dec-Apr). Out-of-season destinations are skipped.

**Cron Schedule:** Every 6 hours at :45 (7:45, 13:45, 19:45, 1:45 UTC)

**Files:** `src/lib/escape-index.ts`, `src/app/api/cron/sync-escape-index/route.ts`

### 7.16 Review Watch (Restaurant Reviews)

Review Watch monitors major food publications for new reviews of restaurants within Flâneur neighborhoods. We are curators - only positive/notable reviews are surfaced.

**Data Sources (RSS Feeds):**

```typescript
const REVIEW_SOURCES = [
  // New York Times
  { source: 'NYT_Pete_Wells', feedUrl: 'https://rss.nytimes.com/.../DiningandWine.xml', city: 'New_York' },

  // The Infatuation (Multiple Cities)
  { source: 'The_Infatuation', feedUrl: 'https://theinfatuation.com/new-york/feeds/reviews.rss', city: 'New_York' },
  { source: 'The_Infatuation', feedUrl: 'https://theinfatuation.com/los-angeles/feeds/reviews.rss', city: 'Los_Angeles' },
  { source: 'The_Infatuation', feedUrl: 'https://theinfatuation.com/london/feeds/reviews.rss', city: 'London' },

  // Eater (City-specific)
  { source: 'Eater', feedUrl: 'https://ny.eater.com/rss/index.xml', city: 'New_York' },
  { source: 'Eater', feedUrl: 'https://la.eater.com/rss/index.xml', city: 'Los_Angeles' },
  { source: 'Eater', feedUrl: 'https://london.eater.com/rss/index.xml', city: 'London' },

  // The Guardian
  { source: 'Guardian', feedUrl: 'https://theguardian.com/.../jayraynerrestaurantreview/rss', city: 'London' },

  // Time Out
  { source: 'Timeout', feedUrl: 'https://timeout.com/london/restaurants/rss', city: 'London' },
  { source: 'Timeout', feedUrl: 'https://timeout.com/newyork/restaurants/rss', city: 'New_York' },
];
```

**Matching Logic:**

1. **Detect New Reviews**: Parse RSS feeds for items from last 24 hours
2. **Extract Restaurant Name**: Pattern matching on titles ("Review: X", "At X,", etc.)
3. **Match to Neighborhood**: Address/content patterns for each Flâneur neighborhood
4. **Sentiment Filter**: Only positive reviews (no closings, no negative)

**Neighborhood Patterns:**

```typescript
const NEIGHBORHOOD_PATTERNS = {
  'nyc-tribeca': [/tribeca/i, /tri-?beca/i],
  'nyc-west-village': [/west village/i, /bleecker/i, /christopher st/i],
  'nyc-soho': [/\bsoho\b/i, /spring st/i, /prince st/i],
  'london-mayfair': [/mayfair/i, /bond st/i, /grosvenor/i],
  'london-chelsea': [/\bchelsea\b/i, /kings? road/i, /sloane/i],
  // ...
};
```

**Tier Classification:**

| Tier | Indicator | Example |
|------|-----------|---------|
| `starred` | Michelin Star mention | "awarded its first Michelin star" |
| `bib_gourmand` | Bib Gourmand mention | "earned Bib Gourmand recognition" |
| `critic_pick` | NYT Critic's Pick | "Critic's Pick" badge |
| `high_score` | Infatuation 8.0+ | "8.5/10" in content |
| `essential` | Eater Heatmap/Essential | "added to the heatmap" |
| `featured` | Default positive | Any positive review |

**Gemini Story Generation:**

Tone: "Validation" - "We knew it was good, now the world knows."

```
// NYT Review
Headline: "Critic's Pick: The Times Reviews Torrisi"
Body: "Torrisi just earned a Critic's Pick from The New York Times. The secret is out.
       Expect reservations to be impossible this weekend."

// Infatuation High Score
Headline: "Top Rated: The Infatuation Reviews Mother Wolf"
Body: "Mother Wolf scored an 8.7 from The Infatuation. The Roman pasta spot is now
       officially on everyone's radar. Good luck getting a table."
```

**Cron Schedule:** Every 4 hours (2 AM, 6 AM, 10 AM, 2 PM, 6 PM, 10 PM UTC)

**Files:** `src/lib/review-watch.ts`, `src/app/api/cron/sync-review-watch/route.ts`

### 7.17 Sample Sale Service (Fashion Events)

Sample Sale Service scrapes fashion event aggregators to alert residents about high-end sample sales and trunk shows. Strategy: "Insider Access" with time-sensitive luxury deal alerts.

**Data Sources:**

```typescript
const SAMPLE_SALE_SOURCES = [
  { source: 'Chicmi', baseUrl: 'https://www.chicmi.com', coverage: ['New_York', 'London', 'Los_Angeles', 'Paris'] },
  { source: '260_Sample_Sale', baseUrl: 'https://www.260samplesale.com', coverage: ['New_York'] },
  { source: 'Arlettie', baseUrl: 'https://www.arlettie.com', coverage: ['Paris', 'London'] },
];
```

**Brand Whitelist (70+ luxury brands):**

```typescript
const LUXURY_BRANDS = [
  // Ultra Tier - Top tier luxury, always newsworthy
  { name: 'Hermès', pattern: /herm[eè]s/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'The Row', pattern: /the\s*row/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Brunello Cucinelli', pattern: /brunello\s*cucinelli/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'CHANEL', pattern: /\bchanel\b/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Dior', pattern: /\bdior\b/i, category: 'Fashion', tier: 'Ultra' },
  { name: 'Louis Vuitton', pattern: /louis\s*vuitton|lv/i, category: 'Fashion', tier: 'Ultra' },

  // Aspirational Tier - Accessible luxury, relevant for style-conscious
  { name: 'Kith', pattern: /\bkith\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'APC', pattern: /\ba\.?p\.?c\.?\b/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Isabel Marant', pattern: /isabel\s*marant/i, category: 'Fashion', tier: 'Aspirational' },
  { name: 'Sandro', pattern: /\bsandro\b/i, category: 'Fashion', tier: 'Aspirational' },
  // ... 60+ more brands
];
```

**City-to-Neighborhood Mapping:**

```typescript
const CITY_NEIGHBORHOODS: Record<SampleSaleCity, string[]> = {
  New_York: ['nyc-soho', 'nyc-upper-east-side', 'nyc-tribeca', 'nyc-west-village', 'nyc-chelsea', 'nyc-meatpacking'],
  London: ['london-mayfair', 'london-chelsea', 'london-notting-hill', 'london-marylebone'],
  Los_Angeles: ['la-beverly-hills', 'la-west-hollywood', 'la-malibu'],
  Paris: ['paris-le-marais', 'paris-saint-germain-des-pres'],
};
```

**Scraper Logic:**

1. **Fetch Event Listings**: Parse source calendar pages for upcoming sales
2. **Brand Matching**: Match event titles/descriptions against LUXURY_BRANDS patterns
3. **Time Filtering**: Only sales starting within 7 days
4. **Location Assignment**: Map city to target Flâneur neighborhoods

**Gemini Story Generation:**

Tone: "Secret Intel" - FOMO-inducing urgency about insider access to luxury deals.

```
// Single Brand Sale
Headline: "Sample Sale Alert: The Row at 260SampleSale This Weekend"
Body: "The Row is doing a rare sample sale this Thursday through Sunday at 260 Fifth Avenue.
       Expect 60-70% off. Lines form early - insiders arrive before doors open at 10am."

// Multi-Brand Event
Headline: "Fashion Insider: Chicmi Sample Sale This Weekend"
Body: "Chicmi's curated sale features Hermès accessories, The Row knitwear, and APC basics.
       The best pieces go early - true insiders hit the preview on Thursday evening."
```

**Cron Schedule:** Daily at 8 AM UTC

**Files:** `src/lib/sample-sale.ts`, `src/app/api/cron/sync-sample-sales/route.ts`

### 7.18 NIMBY Alert Service (Community Board Monitoring)

NIMBY Alert Service scrapes Community Board / Council Meeting agendas to alert residents about controversial upcoming votes. Strategy: "Early Warning System" for civic engagement.

**Data Sources:**

```typescript
const COMMUNITY_BOARDS = [
  // NYC Manhattan
  { id: 'nyc-cb1', name: 'Manhattan CB 1', neighborhoodIds: ['nyc-tribeca', 'nyc-fidi'] },
  { id: 'nyc-cb2', name: 'Manhattan CB 2', neighborhoodIds: ['nyc-soho', 'nyc-west-village', 'nyc-greenwich-village'] },
  { id: 'nyc-cb4', name: 'Manhattan CB 4', neighborhoodIds: ['nyc-chelsea', 'nyc-hudson-yards', 'nyc-meatpacking'] },
  // ... CB 5-8 for other Manhattan neighborhoods

  // NYC Brooklyn
  { id: 'nyc-bk-cb1', name: 'Brooklyn CB 1', neighborhoodIds: ['nyc-williamsburg', 'nyc-greenpoint'] },
  { id: 'nyc-bk-cb2', name: 'Brooklyn CB 2', neighborhoodIds: ['nyc-dumbo', 'nyc-brooklyn-heights', 'nyc-cobble-hill'] },

  // London
  { id: 'london-westminster', name: 'Westminster City Council', neighborhoodIds: ['london-mayfair', 'london-soho'] },
  { id: 'london-kensington', name: 'Kensington & Chelsea Council', neighborhoodIds: ['london-chelsea', 'london-notting-hill'] },

  // Sydney
  { id: 'sydney-woollahra', name: 'Woollahra Municipal Council', neighborhoodIds: ['sydney-paddington', 'sydney-double-bay'] },
];
```

**Controversy Filters:**

```typescript
const CONTROVERSY_PATTERNS = {
  liquor: [
    /liquor\s*licen[sc]e/i,
    /4\s*am|4am/i,
    /nightclub/i,
    /cabaret/i,
    /rooftop\s*bar/i,
  ],
  zoning: [
    /zoning\s*variance/i,
    /upzoning/i,
    /height\s*restriction/i,
    /air\s*rights/i,
    /FAR\s*increase/i,
  ],
  social: [
    /homeless\s*shelter/i,
    /dispensary/i,
    /cannabis/i,
    /hotel\s*conversion/i,
    /supportive\s*housing/i,
  ],
  development: [
    /demolition\s*permit/i,
    /tower|high[\s-]*rise/i,
    /parking\s*variance/i,
  ],
  noise: [
    /noise\s*variance/i,
    /extended\s*hours/i,
    /live\s*music/i,
  ],
};
```

**Processing Pipeline:**

1. **Scrape Agendas**: Fetch meeting calendar pages, extract PDF links
2. **Parse PDFs**: Extract text using `pdf-parse` package
3. **Detect Controversy**: Scan text for trigger keywords via regex patterns
4. **Extract Location**: Find street names near keyword matches for geofencing
5. **Assign Neighborhood**: Map to specific Flâneur neighborhood via board's street patterns
6. **Generate Story**: Use Gemini with civic engagement tone

**Gemini Story Generation:**

Tone: "Early Warning" - informative, neutral, empowering civic participation.

```
// Liquor License
Headline: "Licensing Alert: New 4am Nightclub Proposal on Spring Street"
Body: "A new nightclub concept is seeking a 4am liquor license at 123 Spring Street.
       The SLA Committee meets Tuesday at 6:30pm. Public comment period is open until Monday.
       Community Board 2's full board vote follows on February 20th."

// Zoning Variance
Headline: "Zoning Watch: 45-Story Tower Proposed for Chelsea"
Body: "A developer is seeking a zoning variance to build a 45-story tower at 10th Avenue
       and 23rd Street. Current zoning permits 25 stories. The Land Use Committee meets
       Thursday evening - public testimony is encouraged."
```

**Priority Classification:**

| Priority | Triggers |
|----------|----------|
| High | 4am license, nightclub, demolition, shelter, dispensary, tower |
| Medium | Multiple categories in same item |
| Low | Single standard keyword |

**Cron Schedule:** Weekly on Mondays at 6 AM UTC

**Files:** `src/lib/nimby-alert.ts`, `src/app/api/cron/sync-nimby-alerts/route.ts`

### 7.19 Political Wallet Service (Donation Trends)

Political Wallet Service aggregates political contribution data to show residents "Who the neighborhood is betting on." Strategy: "Follow the Money" without revealing individual donors.

**Data Sources:**

```typescript
// US: FEC API
const FEC_BASE_URL = 'https://api.open.fec.gov/v1';
// Endpoint: /schedules/schedule_a/
// Filters: contributor_zip, min_amount ($1,000), two_year_transaction_period

// UK: Electoral Commission API
const UK_EC_BASE_URL = 'http://search.electoralcommission.org.uk/api/search/Donations';
// Filter: Postcode prefix
```

**Neighborhood Zip Mappings:**

```typescript
const NEIGHBORHOOD_ZIPS = {
  // NYC
  'nyc-upper-east-side': { zips: ['10021', '10028', '10065', '10075'], region: 'US' },
  'nyc-tribeca': { zips: ['10007', '10013', '10282'], region: 'US' },

  // Los Angeles
  'la-beverly-hills': { zips: ['90210', '90211', '90212'], region: 'US' },

  // London
  'london-mayfair': { zips: ['W1J', 'W1K', 'W1S'], region: 'UK' },
  // ... 25+ neighborhoods
};
```

**Power Trend Logic:**

1. **Fetch Donations**: Query APIs for last 7 days
2. **Filter Power Donors**: $1,000+ contributions only
3. **Aggregate by Recipient**: Group by Candidate/PAC/Party
4. **Calculate Trends**: Total volume, donor count, average donation
5. **Trigger Story**: If recipient receives $10k+ from single neighborhood

**Privacy Rules:**

| Rule | Implementation |
|------|----------------|
| No Individual Names | Never store or display contributor names |
| Aggregate Only | Show totals, counts, averages |
| Focus on Recipients | Story is about who received, not who gave |

**Gemini Story Generation:**

Tone: "Insider" - informative about where the smart money is going.

```
Headline: "Donor Watch: Smith for Senate raises $125K in Upper East Side"
Body: "The smart money on the Upper East Side is moving toward Jane Smith's Senate campaign.
       42 power donors have contributed $125,000 this week, with an average gift of $6,944.
       Democrat fundraising in the neighborhood is outpacing Republican 2-to-1."
```

**Thresholds:**

| Threshold | Value | Purpose |
|-----------|-------|---------|
| POWER_DONOR_THRESHOLD | $1,000 | Filter out small grassroots donations |
| STORY_TRIGGER_THRESHOLD | $10,000 | Minimum to generate a story |
| LOOKBACK_DAYS | 7 | Rolling weekly window |

**Cron Schedule:** Weekly on Tuesdays at 7 AM UTC (after Monday FEC updates)

**Files:** `src/lib/political-wallet.ts`, `src/app/api/cron/sync-political-wallet/route.ts`

### 7.20 Fashion Week Service (Special Event Engine)

Fashion Week Service provides high-alert coverage during the Big Four global fashion weeks. Architecture: "Calendar Override" that switches neighborhood feeds into "Fashion Mode" during active weeks.

**Fashion Calendar Configuration:**

```typescript
// src/config/fashion-weeks.ts
const FASHION_CALENDAR = [
  {
    city: 'New_York',
    name: 'NYFW',
    shortName: 'NYFW',
    months: [2, 9], // February & September
    typicalWeek: 2,
    durationDays: 7,
    targetFeeds: ['nyc-soho', 'nyc-tribeca', 'nyc-chelsea', 'nyc-meatpacking'],
    vibe: 'Gridlock, Models, Paparazzi. Spring Studios chaos.',
    venues: [
      { name: 'Spring Studios', address: '50 Varick St', neighborhoodId: 'nyc-tribeca' },
      { name: 'Skylight Clarkson', address: '550 Washington St', neighborhoodId: 'nyc-west-village' },
      // ...
    ],
  },
  // London, Milan, Paris...
];
```

**Calendar Window Detection:**

```typescript
function detectFashionWeekWindow(date: Date): FashionWeekWindow[] {
  // Returns windows with states: 'upcoming' | 'active' | 'ended' | 'off_season'
  // 'upcoming' = within 14 days of start
  // 'active' = currently during fashion week
  // 'ended' = within 3 days after end
}
```

**Show Schedule Scraping:**

| City | Source | URL |
|------|--------|-----|
| New York | CFDA | cfda.com/fashion-calendar |
| London | British Fashion Council | londonfashionweek.co.uk/schedule |
| Milan | Camera Moda | cameramoda.it/en/calendar/ |
| Paris | FHCM | fhcm.paris/en/calendars |

**High-Profile Designer Tracking (50+):**

```typescript
const HIGH_PROFILE_DESIGNERS = [
  // NYFW
  'Marc Jacobs', 'Michael Kors', 'Ralph Lauren', 'Tom Ford',
  // LFW
  'Burberry', 'JW Anderson', 'Victoria Beckham',
  // MFW
  'Prada', 'Gucci', 'Versace', 'Dolce & Gabbana', 'Armani',
  // PFW
  'Chanel', 'Dior', 'Louis Vuitton', 'Saint Laurent', 'Balenciaga',
];
```

**Traffic Alert Triggers:**

| Condition | Alert |
|-----------|-------|
| 3+ shows in neighborhood | "Heavy fashion traffic expected" |
| High-profile show | "Major shows will draw large crowds" |
| Tuileries/Grand Palais/Spring Studios | "Expect gridlock" |

**Gemini Story Generation:**

Tone: "Chaotic Chic" - excitement balanced with practical warnings.

```
Headline: "Runway Watch: NYFW Day 3 takes over Tribeca"
Body: "Spring Studios is ground zero today with Marc Jacobs at 10am and Coach at 2pm.
       Expect heavy gridlock on Varick Street. Street style photographers are out in force."
```

**Story Priority:**

| Priority | Condition |
|----------|-----------|
| Hero | 2+ high-profile designers in neighborhood |
| High | 3+ shows or 1 high-profile designer |
| Normal | Standard show activity |

**Cron Schedule:** Daily at 5 AM UTC (runs year-round, only generates during active weeks)

**Files:** `src/config/fashion-weeks.ts`, `src/lib/fashion-week.ts`, `src/app/api/cron/sync-fashion-week/route.ts`

### 7.21 Archive Hunter Service (Luxury Resale Inventory)

Archive Hunter Service monitors in-store inventory of high-end resale boutiques to alert residents when "Investment Grade" pieces arrive. Strategy: "Digital to Physical" - focus on specific neighborhood stores, not the entire internet.

**Store Locations Configuration:**

```typescript
const STORE_LOCATIONS = [
  // The RealReal
  { id: 'trr-soho', store: 'TheRealReal', name: 'The RealReal SoHo',
    address: '80 Wooster St', neighborhoodId: 'nyc-soho' },
  { id: 'trr-madison', store: 'TheRealReal', name: 'The RealReal Madison Avenue',
    address: '1128 Madison Ave', neighborhoodId: 'nyc-upper-east-side' },
  { id: 'trr-melrose', store: 'TheRealReal', name: 'The RealReal Melrose',
    address: '8500 Melrose Ave', neighborhoodId: 'la-west-hollywood' },

  // What Goes Around Comes Around
  { id: 'wgaca-soho', store: 'WhatGoesAroundComesAround',
    address: '351 West Broadway', neighborhoodId: 'nyc-soho' },
  { id: 'wgaca-beverly', store: 'WhatGoesAroundComesAround',
    address: '320 N Beverly Dr', neighborhoodId: 'la-beverly-hills' },

  // Rebag, Fashionphile, Vestiaire... (15 total locations)
];
```

**Investment Brand Whitelist:**

```typescript
const INVESTMENT_BRANDS = {
  // Grail Tier - Always newsworthy
  'Hermès': { pattern: /herm[eè]s/i, tier: 'Grail' },
  'Chanel': { pattern: /\bchanel\b/i, tier: 'Grail' },
  'Rolex': { pattern: /\brolex\b/i, tier: 'Grail' },
  'Patek Philippe': { pattern: /patek\s*philippe/i, tier: 'Grail' },

  // Investment Tier - High value
  'Louis Vuitton': { pattern: /louis\s*vuitton/i, tier: 'Investment' },
  'Cartier': { pattern: /\bcartier\b/i, tier: 'Investment' },
  'Van Cleef & Arpels': { pattern: /van\s*cleef/i, tier: 'Investment' },

  // Collectible Tier - Vintage value
  'Celine': { pattern: /\bc[eé]line\b/i, tier: 'Collectible' },
  'Prada': { pattern: /\bprada\b/i, tier: 'Collectible' },
  // ... 25+ brands total
};
```

**Grail Items (Always Trigger Alert):**

```typescript
const GRAIL_ITEMS = [
  /birkin/i, /kelly\s*\d+/i, /constance/i,  // Hermès bags
  /daytona/i, /submariner/i, /nautilus/i,   // Watches
  /classic\s*flap/i, /2\.55/i, /boy\s*bag/i, // Chanel
  /alhambra/i, /love\s*bracelet/i,          // Jewelry
];
```

**Filter Logic:**

| Filter | Requirement |
|--------|-------------|
| Location | Must match Flâneur neighborhood store |
| Brand | Must be on whitelist (25+ brands) |
| Price | $3,000+ minimum ("Trophy" items) |
| Category | Handbags, Watches, Jewelry, RTW |

**Gemini Story Generation:**

Tone: "Urgent" - alerting collectors before items sell online.

```
Headline: "Archive Alert: Hermès Birkin 25 lands at The RealReal SoHo"
Body: "Just processed into inventory. A Togo leather Birkin 25 with gold hardware
       in excellent condition. Currently on the floor at 80 Wooster Street. Go now."
```

**Priority Classification:**

| Priority | Condition |
|----------|-----------|
| Urgent | Grail tier brand OR rare item + $10k+ |
| High | Investment grade item |
| Normal | Collectible tier item |

**Cron Schedule:** Twice daily at 9 AM and 5 PM UTC

**Files:** `src/lib/archive-hunter.ts`, `src/app/api/cron/sync-archive-hunter/route.ts`

### 7.22 Museum Watch Service (Blockbuster Exhibitions)

Museum Watch Service monitors Tier 1 global museums for blockbuster exhibitions, alerting residents about Member Previews and Public Openings. Strategy: "The Blockbuster Filter" - only major exhibitions worth clearing your calendar for.

**Target Museums (17 Tier 1 Institutions):**

```typescript
const MUSEUM_TARGETS = {
  New_York: [
    { id: 'met', name: 'The Metropolitan Museum of Art', neighborhoods: ['nyc-upper-east-side'] },
    { id: 'moma', name: 'Museum of Modern Art', neighborhoods: ['nyc-midtown'] },
    { id: 'guggenheim', name: 'Solomon R. Guggenheim Museum', neighborhoods: ['nyc-upper-east-side'] },
    { id: 'whitney', name: 'Whitney Museum of American Art', neighborhoods: ['nyc-meatpacking'] },
  ],
  London: [
    { id: 'tate-modern', name: 'Tate Modern', neighborhoods: ['london-southbank'] },
    { id: 'va', name: 'Victoria and Albert Museum', neighborhoods: ['london-south-kensington'] },
    { id: 'british-museum', name: 'British Museum', neighborhoods: ['london-bloomsbury'] },
    { id: 'national-gallery', name: 'National Gallery', neighborhoods: ['london-west-end'] },
  ],
  Paris: [
    { id: 'louvre', name: 'Musée du Louvre', neighborhoods: ['paris-1st'] },
    { id: 'orsay', name: "Musée d'Orsay", neighborhoods: ['paris-7th'] },
    { id: 'pompidou', name: 'Centre Pompidou', neighborhoods: ['paris-le-marais'] },
    { id: 'louis-vuitton', name: 'Fondation Louis Vuitton', neighborhoods: ['paris-16th'] },
  ],
  Tokyo: [
    { id: 'mori', name: 'Mori Art Museum', neighborhoods: ['tokyo-roppongi'] },
    { id: 'teamlab', name: 'teamLab Borderless', neighborhoods: ['tokyo-odaiba'] },
    { id: 'national-tokyo', name: 'Tokyo National Museum', neighborhoods: ['tokyo-ueno'] },
  ],
  Los_Angeles: [
    { id: 'lacma', name: 'Los Angeles County Museum of Art', neighborhoods: ['la-mid-wilshire'] },
    { id: 'getty', name: 'The Getty Center', neighborhoods: ['la-brentwood'] },
    { id: 'broad', name: 'The Broad', neighborhoods: ['la-downtown'] },
  ],
};
```

**The Blockbuster Filter:**

Only exhibitions meeting these criteria trigger stories:

| Criterion | Threshold | Examples |
|-----------|-----------|----------|
| Artist Keywords | Must match | Picasso, Van Gogh, Monet, Warhol, Basquiat, Kusama, Vermeer, Michelangelo |
| Duration | 2+ months | Indicates major investment |
| Featured | Museum-highlighted | "Major Exhibition" designation |

**Dual Trigger System:**

| Trigger | Timing | Category | Tone |
|---------|--------|----------|------|
| Member Preview | 48h before members-only opening | `CULTURE WATCH` | "Insider" - first access |
| Public Opening | Day of/before public opening | `CULTURE WATCH` | "Critic" - must-see validation |

**Gemini Story Generation:**

```
// Member Preview
Headline: "First Look: Picasso at the Met Opens to Members Thursday"
Body: "Members get first access to 'Picasso: A Retrospective' starting Thursday evening.
       General admission opens Saturday. The show runs through August - don't rush."

// Public Opening
Headline: "Must-See: Kusama's Infinity Rooms Open at The Broad"
Body: "The wait is over. Yayoi Kusama's immersive installation opens to the public today.
       Timed tickets are required - book now or wait months."
```

**Cron Schedule:** Weekly on Mondays at 7 AM UTC

**Files:** `src/lib/museum-watch.ts`, `src/app/api/cron/sync-museum-watch/route.ts`

### 7.23 Overture Alert Service (Opera/Ballet/Symphony Premieres)

Overture Alert Service monitors premiere opera houses, ballet companies, and symphony orchestras for Opening Nights and new productions. Strategy: "The Premiere Filter" - only the performances that matter to the cultural elite.

**Performance Venues (10 Tier 1 Institutions):**

```typescript
const PERFORMANCE_HUBS = {
  New_York: [
    { id: 'met-opera', name: 'Metropolitan Opera', type: 'Opera', neighborhoods: ['nyc-upper-west-side'] },
    { id: 'nyc-ballet', name: 'New York City Ballet', type: 'Ballet', neighborhoods: ['nyc-upper-west-side'] },
  ],
  London: [
    { id: 'royal-opera', name: 'Royal Opera House', type: 'Opera', neighborhoods: ['london-covent-garden'] },
    { id: 'royal-ballet', name: 'Royal Ballet', type: 'Ballet', neighborhoods: ['london-covent-garden'] },
  ],
  Paris: [
    { id: 'opera-garnier', name: 'Opéra Garnier', type: 'Opera', neighborhoods: ['paris-9th'] },
    { id: 'paris-ballet', name: 'Paris Opera Ballet', type: 'Ballet', neighborhoods: ['paris-9th'] },
  ],
  Milan: [
    { id: 'la-scala', name: 'Teatro alla Scala', type: 'Opera', neighborhoods: ['milan-brera'] },
  ],
  Sydney: [
    { id: 'sydney-opera', name: 'Sydney Opera House', type: 'Opera', neighborhoods: ['sydney-circular-quay'] },
  ],
  Vienna: [
    { id: 'vienna-state', name: 'Vienna State Opera', type: 'Opera', neighborhoods: ['vienna-innere-stadt'] },
  ],
  Berlin: [
    { id: 'berlin-staatsoper', name: 'Staatsoper Berlin', type: 'Opera', neighborhoods: ['berlin-mitte'] },
  ],
};
```

**The Premiere Filter:**

| Keyword | Type | Priority |
|---------|------|----------|
| Opening Night | Performance | High |
| New Production | Performance | High |
| Premiere | Performance | High |
| Season Opening | Event | High |
| Gala | Event | Medium |
| World Premiere | Performance | Highest |

**Star Power Whitelists:**

```typescript
// Conductors (10)
const STAR_CONDUCTORS = [
  'Gustavo Dudamel', 'Yannick Nézet-Séguin', 'Antonio Pappano',
  'Riccardo Muti', 'Simon Rattle', 'Andris Nelsons', 'Esa-Pekka Salonen',
  'Kirill Petrenko', 'Franz Welser-Möst', 'Valery Gergiev'
];

// Singers (15)
const STAR_SINGERS = [
  'Anna Netrebko', 'Jonas Kaufmann', 'Plácido Domingo', 'Renée Fleming',
  'Diana Damrau', 'Sonya Yoncheva', 'Lisette Oropesa', 'Pretty Yende',
  'Juan Diego Flórez', 'Javier Camarena', 'Bryn Terfel', 'Gerald Finley',
  'Joyce DiDonato', 'Elīna Garanča', 'Sondra Radvanovsky'
];

// Dancers (8)
const STAR_DANCERS = [
  'Misty Copeland', 'Isabella Boylston', 'Marianela Nuñez', 'Sarah Lamb',
  'Francesca Hayward', 'Tiler Peck', 'Alena Kovaleva', 'Vadim Muntagirov'
];
```

**48-Hour Trigger Window:**

Stories generate 48 hours before the performance to give residents time to secure tickets.

**Gemini Story Generation:**

Tone: "Glittering" - cultural prestige and social calendar.

```
Headline: "Opening Night: La Traviata Returns to the Met with Netrebko"
Body: "The Met's new production of La Traviata opens Saturday with Anna Netrebko
       in the title role. Yannick Nézet-Séguin conducts. Dress code: Black tie optional.
       This is THE ticket of the season."
```

**Cron Schedule:** Daily at 10 AM UTC

**Files:** `src/lib/overture-alert.ts`, `src/app/api/cron/sync-overture-alerts/route.ts`

### 7.24 Design Week Service (Global Design Events)

Design Week Service provides calendar-driven coverage for major global design weeks. Architecture: "The Calendar Override" with daily focus rotation highlighting different neighborhoods and design hubs.

**Global Design Events (6 Major Weeks):**

```typescript
const DESIGN_EVENTS = [
  {
    id: 'salone-del-mobile',
    name: 'Salone del Mobile',
    city: 'Milan',
    month: 4, // April
    duration: 6,
    neighborhoods: ['milan-brera', 'milan-tortona', 'milan-porta-nuova'],
    dailyFocus: [
      { day: 1, focus: 'Brera Design District', neighborhood: 'milan-brera' },
      { day: 2, focus: 'Tortona Design Week', neighborhood: 'milan-tortona' },
      { day: 3, focus: '5Vie Art + Design', neighborhood: 'milan-centro' },
      { day: 4, focus: 'Isola Design Festival', neighborhood: 'milan-isola' },
      { day: 5, focus: 'Fuorisalone Highlights', neighborhood: 'milan-brera' },
      { day: 6, focus: 'Salone Wrap-Up', neighborhood: 'milan-brera' },
    ],
  },
  {
    id: 'london-design-festival',
    name: 'London Design Festival',
    city: 'London',
    month: 9, // September
    duration: 9,
    neighborhoods: ['london-south-kensington', 'london-shoreditch', 'london-kings-cross'],
  },
  {
    id: 'design-miami',
    name: 'Design Miami',
    city: 'Miami',
    month: 12, // December (during Art Basel Miami)
    duration: 5,
    neighborhoods: ['miami-design-district', 'miami-south-beach'],
  },
  {
    id: '3-days-of-design',
    name: '3 Days of Design',
    city: 'Copenhagen',
    month: 6, // June
    duration: 3,
    neighborhoods: ['copenhagen-frederiksberg', 'copenhagen-norrebro'],
  },
  {
    id: 'stockholm-design-week',
    name: 'Stockholm Design Week',
    city: 'Stockholm',
    month: 2, // February
    duration: 5,
    neighborhoods: ['stockholm-ostermalm', 'stockholm-sodermalm'],
  },
  {
    id: 'nycxdesign',
    name: 'NYCxDESIGN',
    city: 'New_York',
    month: 5, // May
    duration: 10,
    neighborhoods: ['nyc-soho', 'nyc-tribeca', 'nyc-chelsea'],
  },
];
```

**Event State Detection:**

| State | Condition | Coverage |
|-------|-----------|----------|
| Preview | 7 days before start | Teaser content, schedules |
| Live | During event dates | **Hero priority** (pinned) |
| Wrap | 3 days after end | Highlights, trends, recap |
| Dormant | Off-season | No coverage |

**Daily Focus Rotation:**

Each event has a daily focus that rotates through different neighborhoods/districts:

```typescript
function getDailyFocus(event: DesignEvent, dayOfEvent: number): DailyFocus {
  return event.dailyFocus?.[dayOfEvent - 1] || null;
}

// Day 1 of Salone: "Brera Design District"
// Day 2 of Salone: "Tortona Design Week"
// etc.
```

**Hero Priority (Live State):**

During "Live" state, articles are created with `is_pinned: true`, floating them to the top of neighborhood feeds. This overrides standard local news during design weeks.

**Gemini Story Generation:**

Tone varies by state:
- **Preview**: Anticipation, schedule highlights, what to see
- **Live**: Energy, must-see installations, where to be today
- **Wrap**: Trends spotted, standout pieces, market sentiment

```
// Live Coverage
Headline: "Salone Day 3: 5Vie Art + Design Takes Center Stage"
Body: "Day three of Salone del Mobile shifts focus to the 5Vie district.
       Don't miss the Alcova showcase in the former military hospital.
       Evening drinks at Botanical Club on Via Tortona."
```

**Cron Schedule:** Daily at 6 AM UTC

**Files:** `src/lib/design-week.ts`, `src/app/api/cron/sync-design-week/route.ts`

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

*Last updated: February 6, 2026*
