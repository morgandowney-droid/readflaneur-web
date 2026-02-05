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

### Global Auction Watch (International Art Hubs)

Hub & Spoke model syndicates auction news from major art market cities to local spoke neighborhoods.

| Hub | Spoke Neighborhoods | Regional Keywords |
|-----|---------------------|-------------------|
| London | Mayfair, Chelsea, Kensington, Notting Hill, Hampstead | Old Master, British Art, Impressionist |
| Paris | 7th Arr, 16th Arr, Le Marais, Saint-Germain | Design, Surrealist, Art d'Asie |
| Hong Kong | Central, SoHo HK, The Peak | 20th Century, Contemporary, Watches, Chinese Works |
| Los Angeles | Beverly Hills, West Hollywood, Santa Monica | California Art, Contemporary, Pop Art |
| Geneva | European Vacation, Zurich | Luxury, Watches, Jewels, Gemstones |

Schedule: Weekly on Sundays at 10 PM UTC (before NYC sync).

### Art Fair Coverage (Special Events)

Static calendar-based coverage for the "Big 5" global art fairs. Overrides standard local news during fair weeks.

| Fair | Month | Target Feeds |
|------|-------|--------------|
| Frieze London | October | Mayfair, Chelsea, Kensington, Notting Hill |
| Art Basel Miami | December | South Beach, Brickell, Design District + NYC Core |
| Frieze LA | February | Santa Monica, Beverly Hills, West Hollywood |
| Art Basel HK | March | Central, SoHo HK, The Peak |
| Art Basel Paris | October | 7th Arr, Le Marais, Saint-Germain |

**Coverage States:**
- **Preview** (7 days before): VIP passes, dinner circuit, anticipation
- **Live** (during fair): Hero priority, pinned to top of feeds
- **Wrap** (3 days after): Sales tallies, highlights

Schedule: Daily at 7 AM UTC (checks calendar for active fairs).

### Retail Watch (Luxury Store Openings)

Monitors signage/advertisement permits to detect upcoming luxury retail openings. Signage permits reveal WHO is moving in, typically 3-4 months before opening.

**Luxury Brand Categories:**
- **Fashion**: Hermès, Chanel, Gucci, Prada, Vuitton, Kith, Aimé Leon Dore...
- **Watches & Jewelry**: Rolex, Patek, Cartier, Van Cleef, Tiffany...
- **Beauty & Fragrance**: Aesop, Le Labo, Diptyque, Byredo...
- **Fitness & Wellness**: Equinox, SoulCycle, Barry's...
- **Private Clubs**: Soho House, Zero Bond, Casa Cipriani...
- **Hospitality**: Nobu, Carbone, Aman, Four Seasons...
- **Home & Design**: RH, Ligne Roset, B&B Italia...

**Tier Classification:**
- **Ultra**: Heritage luxury (Hermès, Patek, Van Cleef)
- **Aspirational**: Modern luxury (Kith, Aesop, Equinox)

Schedule: Daily at 10 AM UTC.

### Nuisance Watch (311 Complaint Hotspots)

Aggregates 311/Council complaints to detect quality of life hotspots. Only reports CLUSTERS, not individual complaints.

**Threshold:** 5+ complaints in 7 days at one location

**Categories Tracked:**
- **High Severity**: Noise (Commercial), Rodent, Homeless Encampment
- **Medium Severity**: Noise (Residential), Pest, Trash, Illegal Dumping
- **Low Severity**: Sidewalk Condition, Graffiti

**Privacy Rules:**
- Commercial venues: Full address (name and shame)
- Residential: Rounded to "100 Block" (e.g., "100 Block of Perry St")

**Trend Detection:**
- **Spike**: 2x baseline = high priority story
- **Elevated**: Above threshold but expected

Schedule: Daily at 12 PM UTC.

### Specialty Auctions (Regional & Vacation Markets)

Dual-engine service completing global art coverage:

**Tier 2 - National Champions (Direct Scraping):**

| Region | Houses | Cities |
|--------|--------|--------|
| Nordic | Bukowskis, Bruun Rasmussen | Stockholm, Copenhagen |
| DACH | Dorotheum, Grisebach, Ketterer, Koller | Vienna, Berlin, Munich, Zurich |
| Southern Europe | Finarte, Cambi, Balclis, Veritas | Milan, Rome, Barcelona, Lisbon |
| APAC | SBI Art, Smith & Singer, Leonard Joel | Tokyo, Sydney, Melbourne |
| North America | Heffel, Hindman, Bonhams SF, Skinner | Toronto, Chicago, San Francisco, Boston |

**Tier 3 - Vacation Mappings (Hub Filtering):**

Maps Tier 1 global events to vacation feeds based on keywords:

| Vacation | Source Hubs | Keywords |
|----------|-------------|----------|
| St. Barts | NYC, Paris | Resort, Jewels, Hermès, Handbags |
| Aspen | NYC, LA | Western Art, Photography, Design |
| Hamptons | NYC | Contemporary, Prints, Editions |
| Sylt | London | Photography, Modern |
| Marbella | London | Contemporary, Luxury |

Schedule: Weekly on Sundays at 9 PM UTC.

### Gala Watch (High-Society Charity Events)

Aggregates high-society charity events and broadcasts them to wealthy residential neighborhoods using the "Hub Broadcast" model.

**Hub Configuration (10 Global Hubs):**

| Hub | Sources | Target Feeds | Key Venues |
|-----|---------|--------------|------------|
| New York | NY Social Diary, Eventbrite | UES, UWS, Tribeca, West Village, SoHo, Hamptons | The Met, Lincoln Center, Cipriani |
| London | Tatler, Eventbrite | Mayfair, Chelsea, Kensington, Notting Hill | V&A, The Dorchester, Claridge's |
| Paris | Paris Diary, Eventbrite | 7th Arr, 16th Arr, Le Marais | Palais Garnier, Grand Palais, Ritz |
| Los Angeles | Eventbrite | Beverly Hills, Bel Air, Malibu | Academy Museum, LACMA, The Getty |
| Sydney | Eventbrite | Double Bay, Mosman, Vaucluse | Sydney Opera House, MCA |
| Miami | Eventbrite | South Beach, Brickell, Design District | PAMM, Faena Forum |
| Hong Kong | Eventbrite | Central, The Peak, SoHo HK | HKCEC, M+ Museum |
| Milan | Eventbrite | Brera, Quadrilatero | La Scala, Fondazione Prada |
| Toronto | Eventbrite | Yorkville, Rosedale, Forest Hill | ROM, AGO |

**High Ticket Filter:**
- Ticket price > $500 USD (or local equivalent) → IT IS A GALA
- Ticket price < $100 → IGNORE (It's a mixer)
- Currency normalization: £400, €450, A$770, C$675

**Society Page Scrapers:**
- NY Social Diary (calendar section) - Benefit Events
- Tatler UK (parties topic) - Save the Date announcements

**Gemini Story Tone:** "Insider & Exclusive" FOMO engine
- "The city's philanthropists descend on [Venue] tonight."
- "Expect heavy black cars and high fashion."

Schedule: Daily at 6 AM UTC.

### Escape Index (Vacation Conditions)

Injects vacation conditions (Snow, Surf, Weather) into feeder city feeds to trigger travel decisions.

**Architecture: "The Feeder Map"**

We don't show snow reports in Aspen. We show them in *New York* (where the skiers are).

| Feeder City | Target Destinations |
|-------------|---------------------|
| New York | Aspen, Deer Valley, Vail, The Hamptons, St. Barts, Turks & Caicos |
| London | Courchevel, Verbier, St. Moritz, Ibiza, Cornwall, Mykonos |
| Paris | Courchevel, Verbier, Zermatt, St. Barts, Ibiza, Biarritz |
| Los Angeles | Aspen, Deer Valley, Park City, Cabo, Hawaii, Malibu |
| San Francisco | Tahoe, Park City, Hawaii, Cabo, Costa Rica |
| Sydney | Byron Bay, Noosa, Niseko, Queenstown, Bali |
| Hong Kong | Niseko, Bali, Phuket, Maldives |
| + Chicago, Miami, Tokyo | ... |

**Data Sources (Open-Meteo API - Free):**

| Adapter | Metric | Threshold |
|---------|--------|-----------|
| Snow | 24h Snowfall | >6 inches = Powder Day |
| Surf | Swell Height + Period | >4ft + >10s = Firing |
| Sun | Temp + UV + Forecast | >70°F + UV 5+ + 2 days = Perfect Weekend |

**Gemini Story Tone:** "Urgent Leisure" - "Pack your bags."

**Headline Templates:**
- Snow: "Powder Alert: [Destination] gets [Amount] overnight."
- Surf: "Swell Watch: [Destination] is firing this weekend."
- Sun: "Escape Plan: Perfect forecast for [Destination] this weekend."

Schedule: Every 6 hours at :45 (7:45, 13:45, 19:45, 1:45 UTC).

### Review Watch (Restaurant Reviews)

Monitors major food publications for new reviews of restaurants in Flâneur neighborhoods. We are curators - only positive/notable reviews are surfaced.

**Data Sources (RSS Feeds):**

| Source | Coverage | Positive Indicators |
|--------|----------|---------------------|
| NYT Pete Wells | NYC | Critic's Pick badge |
| The Infatuation | Global | Score > 8.0 |
| Eater | City-specific | Heatmap, Essential list |
| The Guardian | London | Featured review |
| Time Out | NYC, London | Must-visit, Best |
| Bon Appétit | National | Worth the trip |

**Matching Logic:**
1. Parse RSS feeds for new reviews (last 24 hours)
2. Extract restaurant name from title
3. Match content to Flâneur neighborhood via address patterns
4. Filter for positive reviews only (no closings, no negative)

**Tier Classification:**

| Tier | Indicator | Priority |
|------|-----------|----------|
| Michelin Star | "Michelin star" mention | 1 |
| Bib Gourmand | "Bib Gourmand" mention | 2 |
| Critic's Pick | NYT "Critic's Pick" | 3 |
| High Score | Infatuation 8.0+ | 4 |
| Essential | Eater Heatmap/Essential | 5 |

**Gemini Story Tone:** "Validation" - "We knew it was good, now the world knows."

**Headlines:**
- `Critic's Pick: The Times Reviews [Restaurant]`
- `Top Rated: The Infatuation Reviews [Restaurant]`
- `Essential: [Restaurant] Makes the List`

Schedule: Every 4 hours (2 AM, 6 AM, 10 AM, 2 PM, 6 PM, 10 PM UTC).

### Sample Sale Service (Fashion Events)

Scrapes fashion event aggregators to alert residents about high-end sample sales and trunk shows. Uses a "Secret Intel" strategy - time-sensitive insider information about luxury deals.

**Data Sources:**

| Source | Coverage | Focus |
|--------|----------|-------|
| Chicmi | Global (NYC/London/LA/Paris) | Multi-brand events |
| 260 Sample Sale | NYC | Single-brand luxury |
| Arlettie | Paris/London | "Invite Only" sales |

**Brand Whitelist (70+ brands):**

Organized by tier:
- **Ultra Tier:** Hermès, The Row, Brunello Cucinelli, Loro Piana, CHANEL, Dior, Louis Vuitton
- **Aspirational Tier:** Kith, APC, Isabel Marant, Sandro, Maje, Jacquemus

Categories: Fashion, Handbags, Jewelry, Shoes, Home, Active

**City-to-Neighborhood Mapping:**

| City | Flâneur Neighborhoods |
|------|----------------------|
| New York | SoHo, Upper East Side, Tribeca, West Village, Chelsea, Meatpacking |
| London | Mayfair, Chelsea, Notting Hill, Marylebone |
| Los Angeles | Beverly Hills, West Hollywood, Malibu |
| Paris | Le Marais, Saint-Germain-des-Prés |

**Gemini Story Tone:** "Secret Intel" - FOMO-inducing urgency about insider access.

**Headline Templates:**
- Single brand: "Sample Sale Alert: [Brand] at [Venue] This [Dates]"
- Multi-brand: "Fashion Insider: [Source] Sample Sale This [Dates]"

Schedule: Daily at 8 AM UTC.

### NIMBY Alert Service (Community Board Monitoring)

Scrapes Community Board / Council Meeting agendas to alert residents about controversial upcoming votes. Strategy: "Early Warning System" - empowering civic engagement.

**Data Sources:**

| Adapter | Source | Target |
|---------|--------|--------|
| NYC | Community Board websites | Full Board / Licensing Committee agendas (PDF) |
| London | Borough Council calendars | Licensing Sub-Committee, Planning Applications |
| Sydney | Council Business Papers | Council Meeting agendas |

**Controversy Filters (Regex):**

| Category | Keywords |
|----------|----------|
| Liquor | liquor license, 4am, nightclub, cabaret, rooftop bar |
| Zoning | zoning variance, upzoning, height restriction, air rights, FAR increase |
| Social | shelter, dispensary, cannabis, clinic, hotel conversion, supportive housing |
| Development | demolition, new construction, tower, high-rise, parking variance |
| Noise | noise variance, extended hours, live music, outdoor amplification |

**Geofence Logic:**
- Extract street name from text near keyword match
- Match to specific Flâneur neighborhood via board's street patterns
- Default to first neighborhood in board's coverage if no match

**Gemini Story Tone:** "Early Warning" - informative, civic-engagement focused, non-sensational.

**Headlines:**
- `Licensing Alert: New 4am Nightclub Proposal on Spring Street`
- `Zoning Watch: 45-Story Tower Proposed for Chelsea`

Schedule: Weekly on Mondays at 6 AM UTC.

### Political Wallet Service (Donation Trends)

Aggregates political contribution data to show residents "Who the neighborhood is betting on." Strategy: "Follow the Money" - showing donation trends without revealing individual donors.

**Data Sources:**

| Adapter | Source | Filter |
|---------|--------|--------|
| US | FEC API (`/schedules/schedule_a/`) | Zip code, $1k+ donations, current cycle |
| UK | Electoral Commission API | Postcode prefix |

**Power Trend Logic:**
1. Fetch donations from last 7 days
2. Filter to $1,000+ ("Power Donors")
3. Group by recipient (Candidate/PAC/Party)
4. Calculate total volume per neighborhood
5. Generate story if recipient receives $10k+ from single neighborhood

**Privacy Rules:**
- NEVER reveal individual donor names
- Aggregate trends only (total volume, donor count, average)
- Focus on recipients, not contributors

**Gemini Story Tone:** "Insider" - "The smart money in [Neighborhood] is moving toward [Candidate]."

**Headlines:**
- `Donor Watch: [Candidate] raises $125K in Upper East Side`
- `Follow the Money: Beverly Hills backs [PAC]`

Schedule: Weekly on Tuesdays at 7 AM UTC.

### Fashion Week Service (Special Event Engine)

Triggers high-alert coverage during Global Fashion Weeks (NYFW, LFW, MFW, PFW). Architecture: "Calendar Override" mode that switches neighborhood feeds during active weeks.

**Fashion Calendar:**

| City | Name | Months | Target Feeds |
|------|------|--------|--------------|
| New York | NYFW | Feb, Sept | SoHo, Tribeca, Chelsea, Meatpacking |
| London | LFW | Feb, Sept | Soho, Mayfair, Shoreditch |
| Milan | MFW | Feb, Sept | Brera, Quadrilatero, Porta Nuova |
| Paris | PFW | Jan, Feb, June, Sept | Le Marais, Saint-Germain, 1st/8th Arr |

**Show Schedule Scraping:**
- Daily during active weeks
- Sources: CFDA, British Fashion Council, Camera Moda, FHCM
- Extract venue addresses, map to neighborhoods
- Trigger "Traffic Alert" if 3+ shows in one neighborhood

**High-Profile Designers (50+):**
- NYFW: Marc Jacobs, Michael Kors, Ralph Lauren, Tom Ford
- LFW: Burberry, JW Anderson, Victoria Beckham
- MFW: Prada, Gucci, Versace, Dolce & Gabbana, Armani
- PFW: Chanel, Dior, Louis Vuitton, Saint Laurent, Balenciaga

**Gemini Story Tone:** "Chaotic Chic" - excitement balanced with practical traffic warnings.

**Headlines:**
- `Runway Watch: NYFW takes over Spring Studios`
- `Fashion Week Alert: Expect gridlock near Tuileries`

Schedule: Daily at 5 AM UTC (only generates during active fashion weeks).

### Archive Hunter Service (Luxury Resale)

Monitors in-store inventory of high-end resale boutiques to alert residents when "Investment Grade" pieces arrive. Strategy: "Digital to Physical" - focus on specific neighborhood stores.

**Target Resellers:**

| Store | Locations |
|-------|-----------|
| The RealReal | SoHo, Madison Ave, Melrose, Westbourne Grove, SF |
| What Goes Around Comes Around | SoHo, Beverly Hills |
| Rebag | SoHo, Madison, Miami, West Hollywood |
| Fashionphile | Hudson Yards, Beverly Hills |

**Brand Whitelist (Tiered):**

| Tier | Brands | Threshold |
|------|--------|-----------|
| Grail | Hermès, Chanel, Rolex, Patek Philippe, Audemars Piguet | $3k+ |
| Investment | Louis Vuitton, Cartier, Van Cleef, Goyard, The Row | $5k+ |
| Collectible | Celine, Prada, Gucci, Fendi, Bulgari | $10k+ |

**Filter Logic:**
1. Location: Must match Flâneur neighborhood store
2. Brand: Whitelist only (25+ brands)
3. Price: $3,000+ ("Trophy" items)

**Grail Items (Always Alert):**
- Birkin, Kelly, Constance (Hermès)
- Submariner, Daytona (Rolex)
- Classic Flap, Boy Bag (Chanel)
- Alhambra, Love Bracelet (VCA/Cartier)

**Gemini Story Tone:** "Urgent" - alerting collectors before items sell online.

**Headlines:**
- `Archive Alert: Hermès Birkin 25 lands at The RealReal SoHo`
- `Archive Alert: Rolex Submariner at Fashionphile Hudson Yards`

Schedule: Twice daily at 9 AM and 5 PM UTC.

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
