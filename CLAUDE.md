# Flâneur Web - Project Status

> **How to use:** When starting a new Claude session, say "read CLAUDE.md and pick up where we left off"
>
> **See also:** `../flaneur/CLAUDE.md` for the full project overview and mobile app details.
>
> **User Location:** Stockholm, Sweden (CET/CEST timezone) - use this for time-related references.

## Current Status
**Last Updated:** 2026-02-05

### Recent Changes (2026-02-05)

**Heritage Watch (Preservation Alerts):**
- New service monitoring NYC DOB Job Application Filings for preservation issues
- Three triggers:
  - Trigger A: Demolition (`job_type = 'DM'`) - "Teardown Alert" with eulogy tone
  - Trigger B: Landmark alterations (`landmark = 'Y'` + facade keywords) - "Facade Watch" with curator tone
  - Trigger C: Tree removal (keywords in description) - "Green Loss" with concerned neighbor tone
- 20+ landmark keywords: facade, restoration, cornice, brownstone, terra cotta, etc.
- 9+ tree keywords: tree removal, tree protection, specimen tree, etc.
- LPC approval requirement mentioned for landmark properties
- Files: `src/lib/nyc-heritage.ts`, `src/app/api/cron/sync-heritage-filings/route.ts`
- Cron: Daily at 8 AM UTC

**Alfresco Watch ("Al Fresco Alert"):**
- New service fetching NYC Open Restaurants Applications from NYC Open Data
- Generates "Al Fresco Alert" stories for new outdoor dining setups
- Geofenced to 11 NYC neighborhoods via zip codes
- Filters for approved sidewalk/roadway seating in last 7 days
- Prioritizes: Sidewalk > Both > Roadway (cafe culture over shed culture)
- `isChain()` helper excludes 40+ chain patterns (Dunkin, Starbucks, Shake Shack, etc.)
- Alcohol-serving venues prioritized
- Seasonal context in prompts (Spring/Summer vs Winter tone)
- Files: `src/lib/nyc-alfresco.ts`, `src/app/api/cron/sync-alfresco-permits/route.ts`
- Cron: Daily at 9 AM UTC

**Filming Location Watch ("Set Life"):**
- New service fetching NYC Film Permits from NYC Open Data
- Generates "Set Life" stories alerting residents about nearby film shoots
- Geofenced to 11 NYC neighborhoods via zip codes
- Filters for premium productions: Television, Feature Film, Commercial (excludes Student, Still Photography)
- Prioritizes known productions (Law & Order, Succession, And Just Like That, etc.)
- Extracts street-level impact from `parking_held` field
- Impact levels: High (major footprint), Medium, Low
- Gemini generates insider-tone alerts with traffic/parking warnings
- Files: `src/lib/nyc-filming.ts`, `src/app/api/cron/sync-filming-permits/route.ts`
- Cron: Every 6 hours (fetches next 48 hours of permits)

**Global Data Engine (International Markets):**
- New City Adapter pattern for standardized civic data fetching across 5 international markets
- Supported cities: London (UK), Sydney (AU), Chicago (US), Los Angeles (US), Washington DC (US)
- Each adapter implements: `getPermits()`, `getLiquor()`, `getSafety()` with city-specific API integrations
- City-specific vocabulary injection for AI content (currency symbols, local terminology)
- Config: `src/config/global-locations.ts` with zones, postal codes, editorial tones
- Adapters: `src/lib/adapters/` (london, sydney, chicago, los-angeles, washington-dc)
- Content generator: `src/lib/global-content-generator.ts` with Gemini + cultural context
- Database tables: `global_permits`, `global_licenses`, `global_safety_stats`
- Four new cron jobs for international data sync and weekly digest generation

**API Sources by City:**
| City | Permits | Liquor | Safety |
|------|---------|--------|--------|
| London | Westminster Planning | UK Licensing | UK Police API |
| Sydney | NSW Planning Portal | NSW Liquor | BOCSAR |
| Chicago | Chicago Data Portal (Socrata) | Business Licenses | Crimes Dataset |
| Los Angeles | LA Open Data (Socrata) | CA ABC | LAPD Data |
| Washington DC | DC Open Data (ArcGIS) | ABRA | MPD Data |

### Previous Changes (2026-02-04)

**NYC Open Data Integration:**
- New data fetching system for NYC permits, liquor licenses, and crime stats
- Geofenced to 11 NYC coverage areas via zip codes and police precincts
- Config file: `src/config/nyc-locations.ts` with neighborhood → zip/precinct mappings
- Fetchers: `src/lib/nyc-permits.ts`, `src/lib/nyc-liquor.ts`, `src/lib/nyc-crime.ts`
- Content generator: `src/lib/nyc-content-generator.ts` with Gemini + neighborhood tone injection
- NYC data auto-injected into daily briefs for NYC neighborhoods
- Weekly digest articles generated from aggregated civic data
- Database tables: `nyc_permits`, `nyc_liquor_licenses`, `nyc_crime_stats`
- Four new cron jobs for data sync and digest generation

**Combo Neighborhoods System:**
- 15 combo neighborhoods that aggregate multiple areas into single feeds
- Combo neighborhoods: SoHo (SoHo, NoHo, NoLita, Hudson Square), Tribeca (Tribeca, FiDi), Brooklyn West (Dumbo, Cobble Hill, Park Slope), The Hamptons (The Hamptons, Montauk), Östermalm & City (Östermalm, Norrmalm, Gamla Stan, Djurgården)
- Surroundings regions for NYC and Stockholm suburbs
- Database: `is_combo` flag on neighborhoods, `combo_neighborhoods` join table
- Utility: `src/lib/combo-utils.ts` for querying combo components
- Search in neighborhood selector searches component names too

**New Neighborhoods Added:**
- Stockholm: Vasastan, Södermalm, Kungsholmen
- New York: Upper West Side, Hudson Yards, Meatpacking District

**UI/UX Improvements:**
- Unified neighborhood modal - homepage and header buttons use same instant-loading modal
- Pre-fetch strategy loads neighborhood data on mount for instant modal opening
- Combo neighborhoods show tooltip with component names on hover
- Renamed "Enclaves" to "Surroundings" throughout UI
- 3-phase design audit: feed cards, AI badges, ad frequency, search empty state

**Key Files for Combos:**
- `src/lib/combo-utils.ts` - `getNeighborhoodIdsForQuery()`, `getComboInfo()`
- `src/components/neighborhoods/NeighborhoodSelectorModal.tsx` - Combo tooltip, pre-fetch
- Database tables: `neighborhoods.is_combo`, `combo_neighborhoods`

### Previous Changes (2026-02-03)

**Vacation Neighborhoods (8 New Destinations):**
- Added 8 vacation neighborhoods grouped into 3 regions:
  - **US Vacation** (○): Nantucket, Martha's Vineyard, The Hamptons, Aspen
  - **Caribbean Vacation** (□): St. Barts
  - **European Vacation** (△): Saint-Tropez, Marbella, Sylt
- Vacation neighborhoods grouped under region headers (not individual city cards)
- Dark green (#00563F) styling for vacation regions
- Muted geometric icons (○, □, △) instead of colorful emojis
- The Hamptons searches include Montauk, East Hampton, Southampton, Sag Harbor

**RSS Feeds for Vacation Neighborhoods (11 new feeds):**
- Aspen: Aspen Daily News, Aspen Times
- Martha's Vineyard: Vineyard Gazette, MV Times
- Nantucket: Inquirer and Mirror, Nantucket Current
- The Hamptons: Dan's Papers
- St. Barts: St Barth Weekly
- Saint-Tropez: Riviera Radio
- Marbella: Sur in English, Euro Weekly News

**Key Files Changed:**
- `src/lib/neighborhood-utils.ts` - Added `getSearchLocation()` for expanded search terms
- `src/lib/grok.ts` - Uses getSearchLocation for vacation neighborhood searches
- `src/components/home/HomeSignupEnhanced.tsx` - Groups vacation neighborhoods by region
- `src/components/neighborhoods/EnhancedNeighborhoodSelector.tsx` - Vacation region icons
- `src/types/index.ts` - Extended GlobalRegion type with vacation regions

### Previous Changes (2026-02-02 late night)

**Neighborhood Briefs - Major UI/UX Improvements:**
- Header: "WHAT'S HAPPENING TODAY LIVE" (removed satellite dish emoji)
- **Smart Entity Detection:** Proper nouns auto-link to Google Search
- **Address Detection:** Street addresses link to Google Maps (US + European formats)
- **Word Replacements:** classy→tasteful, foodie→gastronome (elegant tone)
- **Brief Archive:** Previous briefs accessible via "Previous briefs" toggle
- **Commentary Detection:** Last paragraph (if short/question) doesn't get hyperlinks

**Entity Detection Logic (`NeighborhoodBrief.tsx`):**
- Single words at sentence start: NOT linked by default (grammar capitalization)
- Exception: CamelCase, all-caps, non-ASCII, or possessive words ARE linked
- NEVER_LINK_WORDS: months, days, nationalities, cuisines, currencies
- COMMON_CONTRACTIONS: it's, that's, there's, etc.
- CURRENCY_CODES: AED, USD, EUR, etc.

**Briefs Cron Job Updates:**
- Batch size: 20 neighborhoods per run (was 10)
- Expiration: 48 hours (was 6 hours)
- Archive: All briefs kept for history (no deletion)
- Status: 48/95 neighborhoods have briefs (~12 hours until all complete)

**Apple Sign-In:**
- Frontend code: READY (buttons in login.tsx and signup.tsx)
- Backend: Needs Supabase configuration
- See Apple Developer Console setup in session notes

**Vercel Deployment Note:**
- Commits deploy as "Preview" not "Production"
- Must manually "Promote to Production" in Vercel dashboard
- Or change Production Branch from `main` to `master` in Settings → Git

**Vercel MCP Setup:**
```bash
claude mcp add --transport http vercel https://mcp.vercel.com
```
Then restart Claude Code and run `/mcp` to authenticate.

### Earlier Changes (2026-02-02 night)

**Grok Integration for Real-Time Local News:**
- New lib: `src/lib/grok.ts` - Grok API with X Search for real-time posts
- Model: `grok-4.1-fast` ($0.20/1M input, $0.50/1M output)
- X Search tool: $5 per 1,000 calls
- Two features implemented:
  1. **Neighborhood Briefs** - "What's Happening Today" at top of feed
  2. **Grok News Fallback** - Generate stories when RSS is dry

**Database Table: `neighborhood_briefs`**
- Caches Grok-generated summaries per neighborhood
- Fields: headline, content, sources, model, search_query, expires_at
- Auto-expires after 48 hours (configurable)

**Cron Job: `sync-neighborhood-briefs`**
- Schedule: Every 4 hours (`0 */4 * * *`)
- Batch size: 20 neighborhoods per run
- Cost: ~$0.30 per run (~$45/month for 6 runs/day)
- Queries Grok X Search for each active neighborhood

**Enhanced `sync-news` Cron:**
- Added Grok fallback when RSS yields < 5 articles per neighborhood
- Generates up to 10 additional Grok stories per neighborhood
- Tracks `grok_articles_created` and `grok_neighborhoods_filled` in results

**UI Component: `NeighborhoodBrief`**
- Displays at top of neighborhood feed
- Shows headline, content, timestamp
- Expandable for longer briefs
- Styled with amber gradient theme
- Tappable entities for search

**Environment Variable Required:**
- `GROK_API_KEY` or `XAI_API_KEY` - Get from https://x.ai/api

### Earlier Changes (2026-02-02 evening)

**Gemini Image Generation Fixed:**
- Model: `gemini-2.5-flash-image` (correct production model)
- Previous deprecated models (`gemini-2.0-flash-exp`, `gemini-2.5-flash-preview-04-17`) no longer work
- Endpoint: `/api/internal/generate-image`
- Admin UI: `/admin/regenerate-images` - working and tested

**Supabase MCP Configured:**
- File: `.mcp.json` in project root
- Project ref: `ujpdhueytlfqkwzvqetd`
- Restart Claude Code to activate (browser auth required)

**Admin Dashboard:**
- New index page at `/admin/page.tsx` with links to all admin sections
- Fixed neighborhoods loading on regenerate-images page (uses `/api/neighborhoods` endpoint)

### Earlier Changes (2026-02-02)

**UI Consolidation on Neighborhood Pages:**
- Removed Tonight, Spotted, Property buttons (no content yet)
- Removed Tip button from header (still available at /contact)
- Renamed "Guide" button to "Places"
- Map button now links to Google Maps externally
- Consolidated layout: neighborhood name left, nav buttons (Places, Map, Wiki) right
- File: `src/components/feed/NeighborhoodHeader.tsx`

**Places Page Performance Fix:**
- Converted from client-side to server-side data fetching
- Initial data preloaded on server for instant page loads
- New loading skeleton component
- Files:
  - `src/app/[city]/[neighborhood]/guides/page.tsx` (server component)
  - `src/app/[city]/[neighborhood]/guides/GuidesClient.tsx` (client component)
  - `src/app/[city]/[neighborhood]/guides/loading.tsx` (skeleton)

**Local Image Generation API:**
- New endpoint: `/api/internal/generate-image`
- Uses Google Gemini directly when `GEMINI_API_KEY` is set
- Fallback when flaneur-azure is unavailable
- Fixed Gemini API: `responseModalities: ['Image']` (capital I)
- sync-news cron automatically uses local API if GEMINI_API_KEY is configured

**Neighborhood Boundary Fixes:**
- Fixed 8 neighborhoods with incorrect coordinates
- File: `src/lib/neighborhood-boundaries.ts`

### Previous Changes (2026-02-01)

**Playwright MCP for UI/UX Testing:**
- Configured Playwright MCP server for browser automation
- Enables interactive page testing, screenshots, visual verification
- Setup: `claude mcp add --transport stdio playwright -- npx -y @microsoft/playwright-mcp`

**Guide Cards with Rank Numbers (Deployed):**
- Each place card shows rank (1, 2, 3...) based on sort order
- Number overlaid on photo for cards with images
- Number inline with name for cards without images
- Live at https://readflaneur.com/stockholm/ostermalm/guides

**Neighborhood Expansion System:**
- Expanded from 5 to 91 neighborhoods globally
- 84 neighborhoods being batch-seeded with Google Places data
- Neighborhoods now have: country, region, latitude, longitude, radius, seeded_at
- Shared utility `src/lib/neighborhood-utils.ts` for city prefix mapping

**Batch Seeding Script:**
```bash
# Seed all neighborhoods at once
npx tsx scripts/seed-all-neighborhoods.ts

# Seed specific neighborhoods
npx tsx scripts/seed-neighborhoods.ts nyc-tribeca la-beverly-hills
```

**Image Generation (Unified with Flaneur API):**
- Cron jobs call flaneur backend API for image generation
- Uses Google Gemini 2.5 Flash Image (primary) with DALL-E fallback
- Images uploaded to Supabase storage automatically
- API: `https://flaneur-azure.vercel.app/api/regenerate-images`

**News Coverage Admin (`/admin/news-coverage`):**
- Monitor article coverage by neighborhood
- View/add/edit/delete RSS feed sources
- Color-coded status: green (good), yellow (low), red (none)
- Database table: `rss_sources` (50+ feeds pre-populated)

**New Files:**
- `scripts/seed-all-neighborhoods.ts` - Batch seeder
- `src/lib/neighborhood-utils.ts` - City prefix mapping
- `src/app/admin/news-coverage/page.tsx` - Coverage monitor
- `src/app/api/admin/rss-sources/route.ts` - RSS CRUD API
- `supabase/migrations/020_rss_sources_table.sql` - RSS sources table

### Previous Changes (2026-01-31)

**Google OAuth Now Live:**
- Google login working at https://readflaneur.com/login
- OAuth configured in Supabase + Google Cloud Console

**Vercel Pro Activated:**
- Upgraded from Hobby to Pro ($20/mo)
- 30-minute cron intervals now supported

### What's Live
- **Website:** https://readflaneur.com
- **Backend API:** https://flaneur-azure.vercel.app
- **GitHub:** https://github.com/morgandowney-droid/readflaneur-web
- **Neighborhoods:** 120 active (including 15 combo neighborhoods across 33 cities)

## Project Structure

```
readflaneur-web/
├── src/
│   ├── app/
│   │   ├── [city]/[neighborhood]/
│   │   │   ├── page.tsx              # Main feed
│   │   │   ├── [slug]/page.tsx       # Article detail
│   │   │   ├── guides/page.tsx       # Neighborhood guides (ranked)
│   │   │   ├── tonight/page.tsx      # Tonight picks
│   │   │   ├── spotted/page.tsx      # Spotted sightings
│   │   │   ├── property-watch/page.tsx
│   │   │   └── map/page.tsx
│   │   ├── admin/
│   │   │   ├── articles/
│   │   │   ├── news-coverage/        # RSS & coverage monitor
│   │   │   ├── regenerate-images/
│   │   │   ├── guides/add-place/     # Manual place entry
│   │   │   └── ...
│   │   └── api/
│   │       ├── cron/
│   │       │   ├── sync-guides/      # Daily Google Places sync
│   │       │   ├── sync-news/        # Every 6 hrs RSS aggregation
│   │       │   ├── generate-guide-digests/ # Weekly neighborhood digests
│   │       │   └── ...
│   │       └── admin/
│   │           └── rss-sources/      # RSS feed CRUD
│   └── lib/
│       ├── neighborhood-utils.ts     # City prefix mapping
│       ├── google-places.ts          # Places API
│       └── rss-sources.ts            # RSS fetching (DB + fallback)
├── scripts/
│   ├── seed-neighborhoods.ts         # Single neighborhood seeder
│   └── seed-all-neighborhoods.ts     # Batch seeder
└── supabase/migrations/
    └── 020_rss_sources_table.sql     # RSS sources table
```

## Environment Variables

### Required
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=               # AI content curation
GOOGLE_PLACES_API_KEY=           # Guides, photos
CRON_SECRET=
FLANEUR_API_URL=https://flaneur-azure.vercel.app  # Image generation
```

### Optional
```
OPENAI_API_KEY=                  # Fallback image generation
GEMINI_API_KEY=                  # Image generation (model: gemini-2.5-flash-image)
GROK_API_KEY=                    # Grok X Search for real-time local news
```

## Automated Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| sync-guides | Daily 3 AM UTC | Update Google Places data |
| sync-news | Every 6 hours | Fetch RSS, create articles with AI images, Grok fallback |
| sync-neighborhood-briefs | Hourly | Generate "What's Happening" briefs via Grok X Search |
| generate-guide-digests | Monday 10 AM UTC | Weekly "What's New" articles |
| sync-tonight | Daily 2 PM UTC | Fetch & curate events |
| sync-spotted | Every 30 min | Monitor social media |
| process-property-watch | Daily 7 AM UTC | Process user submissions |
| generate-digests | Weekly Mon 8 AM UTC | Property watch summaries |
| sync-filming-permits | Every 6 hours (:30) | Fetch NYC film permits, generate Set Life stories |
| sync-alfresco-permits | Daily 9 AM UTC | Fetch NYC outdoor dining permits, generate Al Fresco alerts |
| sync-heritage-filings | Daily 8 AM UTC | Fetch NYC DOB filings, generate heritage alerts (demolition, landmark, tree) |
| sync-nyc-permits | Daily 6 AM UTC | Fetch NYC DOB permit filings |
| sync-nyc-liquor | Monday 7 AM UTC | Fetch NY State liquor licenses |
| sync-nyc-crime | Saturday 8 AM UTC | Aggregate NYPD crime stats by neighborhood |
| generate-nyc-weekly-digest | Saturday 10 AM UTC | Generate weekly civic data articles for NYC |
| sync-global-permits | Daily 7 AM UTC | Fetch permits from London, Sydney, Chicago, LA, DC |
| sync-global-liquor | Tuesday 7 AM UTC | Fetch liquor licenses from international cities |
| sync-global-crime | Saturday 9 AM UTC | Aggregate crime stats from international cities |
| generate-global-weekly-digest | Saturday 11 AM UTC | Generate weekly civic data articles for international neighborhoods |
| sync-auction-calendar | Sunday 11 PM UTC | Scrape Blue Chip auction calendars, syndicate to Northeast Luxury Corridor |
| sync-global-auction-calendar | Sunday 10 PM UTC | Hub & Spoke auction syndication for London, Paris, HK, LA, Geneva |
| sync-art-fairs | Daily 7 AM UTC | Calendar-based coverage for Big 5 fairs (Preview/Live/Wrap states) |
| sync-retail-watch | Daily 10 AM UTC | Detect luxury retail openings via signage permits (80+ brands) |
| sync-nuisance-watch | Daily 12 PM UTC | 311 complaint clustering with spike detection |
| sync-specialty-auctions | Sunday 9 PM UTC | Tier 2 National Champions + Tier 3 Vacation Mappings |

## Database Tables

### Neighborhood System
- `neighborhoods` - All 120 neighborhoods with coordinates, region, country
  - Vacation neighborhoods have `region` set to: `us-vacation`, `caribbean-vacation`, `europe-vacation`
- `neighborhood_briefs` - Daily "What's Happening" summaries from Grok X Search
- `guide_listings` - Places from Google Places API
- `guide_categories` - Restaurant, Coffee, Bars, etc.
- `rss_sources` - RSS feed URLs by city (manageable via admin)

### NYC Open Data (geofenced to 11 NYC coverage areas)
- `nyc_permits` - DOB permit filings cached from NYC Open Data
- `nyc_liquor_licenses` - SLA liquor licenses from NY State Open Data
- `nyc_crime_stats` - Aggregated NYPD crime statistics by neighborhood

### Global Civic Data (5 international markets)
- `global_permits` - Building/planning permits from London, Sydney, Chicago, LA, DC
- `global_licenses` - Liquor/premises licenses from international cities
- `global_safety_stats` - Crime/safety statistics from international cities

### Content
- `articles` - News articles with AI-generated images
- `article_sections` - Article-to-section mapping

## Admin Pages

| Page | URL | Purpose |
|------|-----|---------|
| News Coverage | `/admin/news-coverage` | Monitor coverage, manage RSS feeds |
| Regenerate Images | `/admin/regenerate-images` | Regenerate article images |
| Add Place | `/admin/guides/add-place` | Manually add guide listings |
| Articles | `/admin/articles` | Manage articles |
| Sections | `/admin/sections` | Manage content sections |

## Deployment

```bash
cd C:\Users\morga\Desktop\readflaneur-web
git add . && git commit -m "message" && git push origin master
npx vercel --prod
```

## Claude Code Setup

**MCP Servers Configured:**
- **Supabase MCP** - Direct database access (configured in `.mcp.json`)
- **Vercel MCP** - Deployment management, logs, promotions
- **Playwright MCP** - Browser automation, screenshots, UI testing
- **Supermemory** - Persistent context across sessions
- **Frontend Design** - Polished UI code generation

**Add Vercel MCP:**
```bash
claude mcp add --transport http vercel https://mcp.vercel.com
# Restart Claude Code, then run /mcp to authenticate
```

**Useful Commands:**
```bash
# UI screenshot
npx playwright screenshot --wait-for-timeout=5000 [url] [output.png]

# Deploy to production
git add . && git commit -m "message" && git push origin master
# Then promote Preview to Production in Vercel dashboard

# Check MCP status
/mcp
```

## Related Project

Backend API and mobile app in `../flaneur/` - see `../flaneur/CLAUDE.md`
