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
