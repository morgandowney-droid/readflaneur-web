# Adding New Neighborhoods to Flâneur

This document explains how to add new neighborhoods with proper map boundaries and hinterlands.

## Overview

Each neighborhood in Flâneur has:
1. **A polygon boundary** - The shape of the neighborhood shown on the map (6-12 coordinate points)
2. **Hinterlands** - Adjacent neighborhoods shown with dashed borders (3-5 neighboring areas)

## Step 1: Add to Database

First, add the neighborhood to Supabase:

```sql
INSERT INTO neighborhoods (id, name, city, country, latitude, longitude, is_active)
VALUES ('city-neighborhood-name', 'Neighborhood Name', 'City', 'Country', 40.7336, -74.0027, true);
```

Use the format `city-neighborhood-name` for the ID (lowercase, hyphens).

**For vacation neighborhoods**, add a `region` field (`us-vacation`, `caribbean-vacation`, or `europe-vacation`) to group them under vacation region headers instead of individual city cards.

## Step 2: Define Boundaries

Add the neighborhood to `src/lib/neighborhood-boundaries.ts` or create a fix script in `scripts/`.

### Boundary Format

```typescript
'city-neighborhood-name': {
  id: 'city-neighborhood-name',
  name: 'Neighborhood Name',
  city: 'City',
  center: [40.7336, -74.0027],  // [latitude, longitude] - center of neighborhood
  zoom: 14,                       // Map zoom level (13-15 typically)
  polygon: [
    // 6-12 points tracing the neighborhood boundary clockwise
    // Each point is [latitude, longitude]
    [40.7411, -74.0090],  // Corner intersection or landmark
    [40.7411, -74.0020],  // Next point along boundary
    [40.7380, -74.0000],
    [40.7340, -73.9990],
    [40.7295, -73.9995],
    [40.7260, -74.0030],
    [40.7260, -74.0085],
    [40.7295, -74.0100],
    [40.7350, -74.0105],
    [40.7380, -74.0095]
  ],
  adjacentNeighborhoods: [
    {
      name: 'Adjacent Neighborhood 1',
      polygon: [
        // 4 points forming a rough rectangle
        [40.7500, -74.0050],
        [40.7500, -73.9920],
        [40.7411, -73.9920],
        [40.7411, -74.0090]
      ]
    },
    {
      name: 'Adjacent Neighborhood 2',
      polygon: [...]
    },
    // Include 3-5 adjacent neighborhoods
  ]
}
```

## Step 3: Finding Coordinates

### Method 1: Google Maps
1. Open Google Maps and navigate to the neighborhood
2. Right-click on a street intersection to get coordinates
3. Trace the boundary clockwise, noting coordinates at each corner
4. Format: Google shows `lat, lng` which matches our `[latitude, longitude]` format

### Method 2: OpenStreetMap
1. Go to openstreetmap.org
2. Search for the neighborhood
3. Use the "Export" feature to get bounding box coordinates
4. Refine by clicking on the map to get exact coordinates

### Key Tips
- **Use street intersections** as polygon points (more stable than arbitrary points)
- **Add comments** noting what each coordinate represents (e.g., "14th & West St")
- **Test visually** by checking the map at `localhost:3000/{city}/{neighborhood}/map`
- **Aim for 6-12 points** - enough detail without being excessive
- **Follow natural boundaries** - major streets, rivers, parks

## Step 4: Defining Hinterlands

Hinterlands (adjacent neighborhoods) provide context and help users orient themselves.

### Guidelines
1. Include **3-5 adjacent neighborhoods**
2. Use **simple 4-point rectangles** for adjacent areas (they don't need detail)
3. Position them to **share an edge** with the main neighborhood
4. Name them with **official neighborhood names**

### Example Adjacent Neighborhood
```typescript
{
  name: 'Chelsea',
  polygon: [
    [40.7500, -74.0050],  // NW corner
    [40.7500, -73.9920],  // NE corner
    [40.7411, -73.9920],  // SE corner (shared with main neighborhood)
    [40.7411, -74.0090]   // SW corner (shared with main neighborhood)
  ]
}
```

## Step 5: Running the Update

After defining boundaries, run:

```bash
# If you created a fix script
node scripts/fix-my-neighborhood.mjs

# Restart dev server to see changes
npm run dev
```

## Validation Checklist

Before committing:
- [ ] Polygon has 6-12 points
- [ ] Coordinates are in `[latitude, longitude]` format
- [ ] Center point is actually inside the polygon
- [ ] 3-5 adjacent neighborhoods defined
- [ ] Adjacent polygons share edges with main polygon
- [ ] Map displays correctly at `/{city}/{neighborhood}/map`
- [ ] Hinterlands appear with dashed borders

## Common Coordinate Ranges by City

| City | Latitude Range | Longitude Range |
|------|---------------|-----------------|
| New York | 40.70 - 40.80 | -74.02 - -73.93 |
| London | 51.48 - 51.57 | -0.21 - -0.05 |
| Paris | 48.83 - 48.90 | 2.27 - 2.41 |
| Tokyo | 35.64 - 35.70 | 139.69 - 139.77 |
| San Francisco | 37.74 - 37.81 | -122.45 - -122.39 |
| Sydney | -33.90 - -33.82 | 151.21 - 151.29 |
| Nantucket | 41.27 - 41.30 | -70.13 - -70.05 |
| The Hamptons | 40.85 - 41.05 | -72.45 - -71.85 |
| Aspen | 39.18 - 39.20 | -106.84 - -106.80 |

## Troubleshooting

**Map shows wrong location:**
- Check that latitude and longitude aren't swapped
- Verify coordinates are for the correct city

**Polygon doesn't close:**
- Leaflet automatically closes the polygon
- No need to repeat the first point

**Hinterlands overlap main area:**
- Adjust hinterland polygon points to share edges but not overlap

**Neighborhood not appearing:**
- Check the ID matches in both database and boundaries file
- Verify `is_active = true` in database

---

## Combo Neighborhoods

Combo neighborhoods aggregate multiple areas into a single feed. For example, "SoHo" combines SoHo, NoHo, NoLita, and Hudson Square.

### Creating a Combo Neighborhood

1. **Create component neighborhoods** (set `is_active = false` so they don't appear in selector):
```sql
INSERT INTO neighborhoods (id, name, city, timezone, country, region, latitude, longitude, radius, is_active, is_combo)
VALUES
  ('nyc-noho', 'NoHo', 'New York', 'America/New_York', 'USA', 'north-america', 40.7265, -73.9927, 400, false, false),
  ('nyc-nolita', 'NoLita', 'New York', 'America/New_York', 'USA', 'north-america', 40.7220, -73.9955, 400, false, false);
```

2. **Update existing neighborhood to be a combo**:
```sql
UPDATE neighborhoods SET is_combo = true WHERE id = 'nyc-soho';
```

3. **Link components in join table**:
```sql
INSERT INTO combo_neighborhoods (combo_id, component_id, display_order)
VALUES
  ('nyc-soho', 'nyc-soho-core', 1),
  ('nyc-soho', 'nyc-noho', 2),
  ('nyc-soho', 'nyc-nolita', 3);
```

### How Combos Work

- **Feed queries**: Use `getNeighborhoodIdsForQuery()` from `src/lib/combo-utils.ts` to expand combo ID to component IDs
- **Selector**: Combo neighborhoods show tooltip with component names on hover
- **Search**: Searching component names (e.g., "NoHo") finds the parent combo ("SoHo")

---

## NYC Open Data Configuration

NYC neighborhoods have additional configuration for civic data integration (permits, liquor licenses, crime stats).

### Adding NYC Neighborhoods to Open Data

Edit `src/config/nyc-locations.ts`:

```typescript
export const FLANEUR_NYC_CONFIG: Record<string, NYCNeighborhoodConfig> = {
  'Your Neighborhood': {
    zips: ['10001', '10011'],           // Zip codes for permits & liquor licenses
    precincts: ['10th Precinct'],       // Police precincts for crime stats
    tone: 'Editorial tone description', // For AI content generation
  },
  // For combo neighborhoods:
  'Brooklyn West': {
    components: ['Dumbo', 'Cobble Hill', 'Park Slope'],
    zips: ['11201', '11231', '11215', '11217'],
    precincts: ['84th Precinct', '76th Precinct', '78th Precinct'],
    tone: 'Brownstone Families, Strollers & Eco-Luxury',
  },
};
```

### URL Slug Mapping

Add to `NEIGHBORHOOD_ID_TO_CONFIG`:

```typescript
export const NEIGHBORHOOD_ID_TO_CONFIG: Record<string, string> = {
  'your-neighborhood': 'Your Neighborhood',  // URL slug → config key
};
```

### Current NYC Coverage

11 neighborhoods with civic data integration:
- Chelsea, Greenwich Village, West Village, Hudson Yards, Meatpacking District
- FiDi, Upper East Side, Upper West Side, Williamsburg
- Brooklyn West (combo), SoHo Combo, Tribeca Combo

### Film Permits ("Set Life")

NYC neighborhoods also receive "Set Life" alerts for film/TV shoots. Film permits are automatically fetched from NYC Open Data and filtered by zip code. No additional configuration needed - uses the same `zips` array from `FLANEUR_NYC_CONFIG`.

### Outdoor Dining ("Al Fresco Alert")

NYC neighborhoods receive "Al Fresco Alert" stories for new outdoor dining approvals. Open Restaurants applications are fetched from NYC Open Data, filtered by zip code, and chain restaurants are automatically excluded. Uses the same `zips` array from `FLANEUR_NYC_CONFIG`.

### Heritage Watch (Preservation Alerts)

NYC neighborhoods receive heritage alerts for demolitions, landmark alterations, and tree removal. DOB Job Application Filings are fetched and filtered by three triggers:
- **Demolition**: `job_type = 'DM'`
- **Landmark**: `landmark = 'Y'` + facade/restoration keywords
- **Tree**: Tree removal keywords in job description

Uses the same `zips` array from `FLANEUR_NYC_CONFIG`.

### Auction Watch (Northeast Luxury Corridor)

Blue Chip auction calendar scraping from Sotheby's, Christie's, and Phillips. Stories are syndicated to the entire Northeast Luxury Corridor (25+ neighborhoods):
- **NYC Core**: Tribeca, SoHo, West Village, Greenwich Village, Chelsea, Meatpacking, UES, UWS, FiDi, Hudson Yards, Williamsburg, Brooklyn West
- **NYC Surroundings**: Westchester, Old Westbury, The Hamptons
- **Connecticut**: Greenwich, New Canaan, Darien, Westport
- **New Jersey**: Bergen Gold, Montclair, Summit, The Hills
- **Massachusetts**: Martha's Vineyard, Nantucket

Schedule: Weekly on Sundays at 11 PM UTC.

---

## Global Locations Configuration (International)

International neighborhoods (London, Sydney, Chicago, LA, DC) have their own civic data integration using the City Adapter pattern.

### Adding International Neighborhoods

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
        name: 'Mayfair',
        neighborhoodId: 'mayfair',
        tone: 'Old money, hedge funds, Savile Row tailoring',
        zoneCode: 'Westminster',
        postalCodes: ['W1J', 'W1K', 'W1S'],
      },
      // Add more zones...
    ],
  },
  // Other cities: Sydney, Chicago, 'Los Angeles', 'Washington DC'
};
```

### City Vocabulary

Each city has localized vocabulary for AI content generation:

```typescript
export const CITY_VOCABULARIES: Record<string, CityVocabulary> = {
  London: {
    permitTerms: ['Planning Permission', 'Listed Building Consent', 'Change of Use'],
    liquorTerms: ['Premises Licence', 'Personal Licence', 'TEN'],
    realEstateTerms: ['Freehold', 'Leasehold', 'Mews House', 'Mansion Block'],
    localPhrases: ['in the borough', 'on the high street'],
    currencySymbol: '£',
    currencyName: 'British Pounds',
  },
};
```

### Current International Coverage

| City | Zones | Data Sources |
|------|-------|--------------|
| London | Mayfair, Chelsea, Notting Hill, Kensington, Hampstead | UK Police API, Westminster Planning |
| Sydney | Double Bay, Mosman, Paddington, Woollahra, Balmoral | NSW Planning Portal, BOCSAR |
| Chicago | Gold Coast, Lincoln Park, River North, Streeterville | Chicago Data Portal (Socrata) |
| Los Angeles | Bel Air, Beverly Hills, Pacific Palisades, Brentwood, Santa Monica | LA Open Data |
| Washington DC | Georgetown, Dupont Circle, Kalorama, Capitol Hill | DC Open Data (ArcGIS) |
