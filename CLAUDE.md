# Flâneur Web - Project Status

> **How to use:** When starting a new Claude session, say "read CLAUDE.md and pick up where we left off"
>
> **See also:** `../flaneur/CLAUDE.md` for the full project overview and mobile app details.
>
> **User Location:** Stockholm, Sweden (CET/CEST timezone) - use this for time-related references.

## Current Status
**Last Updated:** 2026-02-06

### Recent Changes (2026-02-06)

**Ad Pricing Service (Wealth Density Model):**
- Dynamic neighborhood-aware pricing with 3 tiers: Super-Prime ($45 CPM), Establishment ($25 CPM), Default ($15 CPM)
- Seasonal market rules: resort neighborhoods shift between Tier 1 (peak season) and Tier 3 (off-peak)
  - Winter Suns (Nov–Apr): Palm Beach, St. Barts, Cape Town Atlantic Seaboard
  - Ski & Snow (Dec–Mar): Aspen
  - Summer Socials (May–Sep): Hamptons, Nantucket
- Holiday surge multiplier (1.5x) for Nov 15 – Dec 25 across all tiers
- Pure functions — no DB calls, static config in code
- Files: `src/config/ad-tiers.ts` (tier definitions, seasonal rules, base rates), `src/lib/PricingService.ts` (getTierForNeighborhood, calculateRate, getQuote)

**Sentry Error Monitoring:**
- Installed `@sentry/nextjs` with tracing, session replay, and logs
- Source maps uploaded to Sentry on every Vercel build via `SENTRY_AUTH_TOKEN`
- Browser requests tunneled through `/monitoring` to avoid ad blockers
- Automatic Vercel Cron Monitor instrumentation
- Config files: `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts`, `src/instrumentation.ts`
- Sentry org: `flaneur-vk`, project: `flaneur-web`
- Dashboard: https://sentry.io/organizations/flaneur-vk/issues/

**Email & Domain Setup:**
- ImprovMX wildcard forwarding: `*@readflaneur.com` → `morgan.downey@gmail.com`
- 7 email addresses in use: contact@, ads@, tips@, editors@, ethics@, legal@, noreply@, hello@
- Resend MCP configured for sending emails from Claude Code
- Stripe MCP configured for payment management
- Sentry MCP configured for error debugging

**Email Topic Preferences & Suggestions:**
- Users can pause specific content categories from their Daily Brief email
- 20 topics grouped into 6 themes: Dining & Lifestyle, Arts & Culture, Shopping & Fashion, Auctions, Travel, Civic & Community
- Topic suggestions feature lets users request new content types
- Paused topics are filtered out during email assembly (Daily Brief always included)
- Database: `profiles.paused_topics`, `newsletter_subscribers.paused_topics` (TEXT[]), `topic_suggestions` table
- API: `/api/email/preferences` — GET returns `paused_topics`, POST handles `update_topics` and `suggest_topic` actions
- UI: `/email/preferences` page — topic toggles with save button, suggestion text input
- Migration: `supabase/migrations/031_topic_preferences.sql`
- Files modified: `src/lib/email/types.ts`, `src/lib/email/scheduler.ts`, `src/lib/email/assembler.ts`, `src/app/api/email/preferences/route.ts`, `src/app/email/preferences/page.tsx`, `src/app/api/cron/send-daily-brief/route.ts`

**Primary Location & Timezone Feature:**
- Detect user location on first visit via IP geolocation (ipinfo.io)
- Toast prompt asks users to set detected city as their primary location
- Settings page (`/settings`) for manual location management
- Timezone priority for newsletters: primary > browser > neighborhood > default
- 31 supported cities with IANA timezone mappings
- Database: `profiles.primary_city`, `profiles.primary_timezone`, `profiles.location_prompt_dismissed_at`
- Newsletter subscribers now capture browser timezone
- 30-day dismiss cooldown for location prompt
- Files:
  - `src/lib/location/` - Detection library (city-mapping, detect, timezone)
  - `src/app/api/location/detect/route.ts` - IP geolocation endpoint
  - `src/app/api/location/set-primary/route.ts` - Save/clear/dismiss endpoints
  - `src/components/location/LocationPrompt.tsx` - Toast-style prompt component
  - `src/app/settings/page.tsx` - User settings page
- Migration: `supabase/migrations/029_user_primary_location.sql`

### Previous Changes (2026-02-05 Night)

**Daily Briefs Fix:**
- Fixed brief generation to check for TODAY's briefs instead of unexpired briefs
- Each neighborhood now gets a fresh brief every morning regardless of prior day's brief status
- Increased default batch size from 20 to 50 to handle all neighborhoods in timezone window
- File: `src/app/api/cron/sync-neighborhood-briefs/route.ts`

**Cron Job Monitoring & Auto-Fix System:**
- New self-healing system that monitors cron job execution and auto-fixes recoverable issues
- Database tables: `cron_executions` (tracks all cron runs), `cron_issues` (tracks issues needing attention)
- Library: `src/lib/cron-monitor/` with types, issue detector, auto-fixer, image validator
- Cron endpoint: `/api/cron/monitor-and-fix` (runs every 30 minutes)
- Admin dashboard: `/admin/cron-monitor` with overview, issues list, execution history
- Auto-detects:
  - Missing article images (image_url is null or empty)
  - Placeholder SVG images (*.svg files)
  - Failed cron job executions
- Auto-fixes:
  - Regenerates missing/placeholder images via `/api/internal/generate-image`
  - Max 3 retries with exponential backoff (0, 15min, 1hr)
  - Rate limits to 5 image regenerations per run with 3-second delays
- Manual actions via admin dashboard:
  - Force retry any issue
  - Mark issues as resolved
  - Run monitor immediately
- Files: `src/lib/cron-monitor/`, `src/app/api/cron/monitor-and-fix/route.ts`, `src/app/admin/cron-monitor/page.tsx`
- Migration: `supabase/migrations/027_cron_monitoring_system.sql`

### Recent Changes (2026-02-05 Evening)

**Cron Jobs Bug Fixes:**
- Fixed `is_pinned` column bug in 3 cron jobs (column doesn't exist in articles table):
  - `sync-escape-index` - Was failing on all article inserts
  - `sync-art-fairs` - Would fail during active fairs
  - `sync-design-week` - Would fail during active events
- Files changed: All three route.ts files in `src/app/api/cron/`

**Combo Neighborhoods Fixes:**
- Force-generated briefs for 10 combo neighborhoods that were missing daily briefs
- Manually triggered Gemini enrichment for 15 combo briefs (all now enriched)
- Issue: Enrichment cron has 2-hour window; older briefs need `?test=<brief-id>` to bypass

**Cron Jobs Verified Working:**
| Cron | Status | Notes |
|------|--------|-------|
| sync-anglosphere-features | ✅ | Generated 6 articles (Singapore + Palm Beach) |
| sync-global-fallback | ✅ | No fallback needed (all neighborhoods covered) |
| sync-review-watch | ✅ | Generated 2 Dining Watch articles |
| sync-nuisance-watch | ✅ | Generated 10 Block Watch articles |
| sync-filming-permits | ✅ | No film permits in coverage areas |
| sync-retail-watch | ✅ | No luxury brand signage permits |
| sync-gala-watch | ✅ | No gala events this period |
| sync-museum-watch | ✅ | No blockbuster exhibitions opening |
| sync-sample-sales | ✅ | No luxury sample sales detected |
| sync-archive-hunter | ✅ | No investment-grade vintage items |
| sync-overture-alerts | ✅ | No opera/ballet premieres in 48h |
| sync-art-fairs | ✅ | No active art fairs (off-season) |
| sync-escape-index | ✅ (fixed) | Found surf alerts, was failing before fix |

### Recent Changes (2026-02-05)

**Global Rollout (8 New Neighborhoods across 5 Cities):**
- Added 5 new cities with city-specific special features:

**Vancouver, Canada (2 neighborhoods):**
- **West Vancouver** - British Properties grandeur, waterfront mansions, Dundarave village
- **Point Grey** - UBC endowment lands, Marine Drive estates, old money discretion
- New adapter: `src/lib/adapters/vancouver-adapter.ts`
- **"View Watch"**: Height variance permit monitoring for protected view cones (North Shore mountains, English Bay)
- Auction house: Waddington's (Canadian art, Lawren Harris, Emily Carr)

**Cape Town, South Africa (2 neighborhoods):**
- **Atlantic Seaboard** - Clifton, Camps Bay, Sea Point promenade
- **Constantia** - Vineyard estates, old Cape Dutch money, wine country elegance
- New adapter: `src/lib/adapters/capetown-adapter.ts`
- **"Beach Alert"**: Wind condition monitoring (perfect beach days when wind <15km/h on weekends)
- **"Grid Watch"**: Load shedding schedule monitoring (Eskom power cuts)
- Auction houses: Strauss & Co (Irma Stern, Pierneef, Cape Dutch furniture), Aspire Art (contemporary African)

**Singapore (2 neighborhoods):**
- **Nassim** - Embassy row, Good Class Bungalows, diplomatic elegance, Botanic Gardens
- **Sentosa** - Billionaire island, Cove estates, casino adjacency
- New adapter: `src/lib/adapters/singapore-adapter.ts`
- **"Motor Watch"**: COE (Certificate of Entitlement) results monitoring for premium car licenses
- **"GCB Alert"**: Good Class Bungalow transactions over $20M SGD
- Auction house: Larasati (Southeast Asian art, Indonesian masters)

**Palm Beach, Florida (1 neighborhood):**
- **Palm Beach Island** - Old money resort, Worth Avenue, oceanfront estates
- New adapter: `src/lib/adapters/palm-beach-adapter.ts`
- **"Design Watch"**: ARCOM (Architectural Commission) agenda monitoring for aesthetic battles
- Auction house: Palm Beach Modern Auctions (20th century design, Florida estates)

**Greenwich, Connecticut (1 neighborhood):**
- **Backcountry** - Hedge fund estates, Round Hill Road, Conyers Farm, equestrian properties
- New adapter: `src/lib/adapters/greenwich-adapter.ts`
- Premium street detection: Round Hill Road, North Street, Conyers Farm, Stanwich Road

**Files changed:** `global-locations.ts`, `vancouver-adapter.ts` (new), `capetown-adapter.ts` (new), `singapore-adapter.ts` (new), `palm-beach-adapter.ts` (new), `greenwich-adapter.ts` (new), `adapters/index.ts`, `specialty-auctions.ts`

**New Zealand Integration (5 New Neighborhoods - "Bunker Watch"):**
- Added New Zealand as Tier 1 market for ultra-wealthy survivalists (Thiel, Page, Cameron)
- **Auckland (The City)** - 3 neighborhoods:
  - **Herne Bay** - Old money waterfront, Marine Parade elegance, yacht club proximity
  - **Remuera** - Aristocratic northern slopes, Arney Road grandeur, grammar zone prestige
  - **Waiheke Island** - Vineyard luxury, Oneroa sophistication, celebrity hideaways
- **Queenstown (The Retreat/Bunker)** - 2 neighborhoods:
  - **Dalefield/Millbrook** - Billionaire rural retreats, survivalist compounds
  - **Kelvin Heights** - Lakeside privacy, Peninsula Road estates, alpine luxury
- New adapter: `src/lib/adapters/nz-adapter.ts`
  - Resource/Building consents from Auckland Council and QLDC
  - Liquor licenses from District Licensing Committees
  - Crime stats from NZ Police
  - OIO (Overseas Investment Office) decision monitoring
- **OIO Service "Bunker Watch"**: `src/lib/oio-service.ts`
  - Monitors LINZ Decision Summaries for foreign land acquisitions
  - Filter: $10M+ NZD sensitive land in Auckland/Queenstown/Wanaka
  - Detects obscured ownership (Trusts/LLCs hiding billionaire names)
  - Gemini story generation with "Bunker Alert" tone
- Auction houses in `src/lib/specialty-auctions.ts`:
  - **Webb's** - Colin McCahon, Goldie, Vintage Cars (Herne Bay, Remuera)
  - **Art+Object** - Contemporary NZ Art, Ralph Hotere (all Auckland neighborhoods)
  - New `oceania` region type
- NZ vocabulary: Resource Consent, Lifestyle Block, Harbour Views, Homestead, etc.
- Files changed: `global-locations.ts`, `nz-adapter.ts` (new), `oio-service.ts` (new), `adapters/index.ts`, `specialty-auctions.ts`

**Dublin Integration (3 New Neighborhoods):**
- Added Dublin, Ireland to the Flâneur ecosystem with 3 premium neighborhoods:
  - **Ballsbridge (D4)** - Old money embassy belt, RDS grounds, Shrewsbury Road billionaires
  - **Ranelagh (D6)** - Cosmopolitan village, Dartmouth Square elegance, creative professionals
  - **Dalkey** - Coastal luxury, Vico Road views, celebrity retreats, literary heritage
- New adapter: `src/lib/adapters/dublin-adapter.ts`
  - Planning permits from Dublin City Council + Dún Laoghaire-Rathdown
  - Liquor licences from Courts Service (Intoxicating Liquor Licences)
  - Crime stats from Garda Síochána / CSO
  - Premium street detection (Shrewsbury, Ailesbury, Vico Road, etc.)
  - Protected structure/heritage keyword filtering
  - Dublin postcode mapping (D04, D06, A96)
- Dublin vocabulary added to `src/config/global-locations.ts`:
  - Permit terms: Planning Application, Protected Structure, Conservation Area, etc.
  - Liquor terms: Intoxicating Liquor Licence, Publican's Licence, Special Exemption Order
  - Real estate terms: Georgian, Victorian, Period property, Mews, Embassy, Red brick
  - Local phrases: the Southside, D4, D6, the village, embassy belt, DART line
  - Currency: EUR (€)
- Auction houses added to `src/lib/specialty-auctions.ts`:
  - **Adam's** - Classic Irish Art, Jack B. Yeats, Period Furniture (all 3 neighborhoods)
  - **Whyte's** - History, Irish Republic Memorabilia, Fine Art (Ballsbridge only)
  - New `uk-ireland` region type for auction house targeting
- Files changed: `global-locations.ts`, `dublin-adapter.ts` (new), `adapters/index.ts`, `specialty-auctions.ts`

**RSS Article Metadata Compliance:**
- RSS-sourced articles now have proper metadata:
  - `author_type: 'ai'`
  - `ai_model: 'claude-sonnet-4'`
  - `category_label: 'News Brief'`
- File: `src/app/api/cron/sync-news/route.ts`
- Backfill endpoint: `/api/admin/backfill-rss-metadata` (GET=preview, POST=apply)
- 147 existing RSS articles backfilled with correct metadata

**AI Image Standards Compliance:**
- Image generation now follows `/standards` requirements
- Changed from "photorealistic editorial photograph" to "stylized artistic illustration"
- Uses watercolor/gouache painting style, NOT photographs
- Added rule against photorealistic human faces
- File: `src/app/api/internal/generate-image/route.ts`

**Admin News Feed - Source Filter:**
- New "Source" filter dropdown on `/admin/news-feed` page
- Options: RSS Feeds (News Brief), Grok AI, Gemini AI
- New "Source" column showing color-coded badges (Blue=RSS, Purple=Grok, Green=Gemini)
- Files: `src/app/admin/news-feed/page.tsx`, `src/app/api/admin/news-feed/route.ts`

**Simplified Hyperlink System:**
- Removed `entity_type` from link candidates - Gemini now just returns `{text: "exact phrase"}`
- Simplified `buildGoogleSearchUrl()` to use `{text} {neighborhood.name} {neighborhood.city}` for all links
- Updated all 23 Gemini story generators to use the new simplified format
- File: `src/lib/hyperlink-injector.ts` - Core hyperlink injection utility

**Gemini Story Registry:**
- New central registry of all 24 Gemini-enriched story generators
- File: `src/lib/gemini-story-registry.ts`
- Exports `GEMINI_STORY_GENERATORS` array with id, name, file, categoryLabel, description
- Helper functions: `getGeneratorById()`, `getGeneratorsByCategory()`, `getGeneratorCount()`
- Used by admin news-feed page for Story Type filter

**Admin News Feed QC - Story Type Filter:**
- New "Story Type" filter dropdown on `/admin/news-feed` page
- Shows all 24 Gemini story generators by name (Daily Brief, Set Life, Al Fresco Alert, etc.)
- Filters articles by category_label matching the selected story type
- Fixed pre-existing TypeScript null-check errors in the page

**Cached Cron Image System:**
- New system for reusing AI-generated images across recurring cron stories
- Saves Gemini token costs by caching category-specific images in Supabase
- 22 image categories: route-alert, residency-radar, fashion-week, archive-hunter, sample-sale, nimby-alert, political-wallet, review-watch, gala-watch, retail-watch, escape-index, nuisance-watch, art-fair, auction, heritage-watch, alfresco-watch, filming-permit, civic-data, real-estate, museum-watch, overture-alert, design-week
- Library: `src/lib/cron-images.ts` with `getCronImage(category, supabase)`
- Admin API: `/api/admin/pregenerate-cron-images` (GET=list, POST=generate)
- All cron jobs now use cached images for consistent visuals and cost savings
- First request generates image, subsequent requests reuse cached URL

**Museum Watch Service ("The Blockbuster Filter"):**
- New service monitoring Tier 1 global museums for blockbuster exhibitions
- 17 museums across 5 hub cities: NYC (Met, MoMA, Guggenheim, Whitney), London (Tate Modern, V&A, British Museum, National Gallery), Paris (Louvre, Musée d'Orsay, Pompidou, Fondation Louis Vuitton), Tokyo (Mori, teamLab, National Museum), LA (LACMA, Getty, Broad)
- Blockbuster filter: Must have keywords (Picasso, Van Gogh, Monet, etc.) OR 2+ month duration
- Dual trigger: Member Preview (48h window) with "Insider" tone, Public Opening with "Critic" tone
- Hub-to-spoke syndication targets relevant neighborhoods per museum
- Files: `src/lib/museum-watch.ts`, `src/app/api/cron/sync-museum-watch/route.ts`
- Cron: Weekly on Mondays at 7 AM UTC

**Overture Alert Service ("The Premiere Filter"):**
- New service monitoring Opera, Ballet, and Symphony for Opening Nights and Premieres
- 10 Tier 1 venues: Met Opera, Royal Opera House, La Scala, Opéra Garnier, Sydney Opera House, Berlin Staatsoper, Vienna State Opera, San Francisco Opera, Chicago Lyric, Paris National Opera Ballet
- Premiere filter: Opening Night, New Production, Premiere, Gala keywords
- Star Power whitelists: 10 conductors (Dudamel, Nézet-Séguin), 15 singers (Netrebko, Kaufmann), 8 dancers (Copeland, Cojocaru)
- 48-hour trigger window before performances
- "Glittering" editorial tone with cultural prestige focus
- Files: `src/lib/overture-alert.ts`, `src/app/api/cron/sync-overture-alerts/route.ts`
- Cron: Daily at 10 AM UTC

**Design Week Service ("The Calendar Override"):**
- Special Event engine for Global Design Weeks
- 6 major events: Salone del Mobile (Milan), London Design Festival, Design Miami, 3 Days of Design (Copenhagen), Stockholm Design Week, NYCxDESIGN
- Event states: Preview (teaser), Live (daily coverage), Wrap (recap), Dormant (off-season)
- Daily Focus rotation highlighting different neighborhoods/hubs during events
- Hero priority for Live coverage (articles pinned to top)
- Hub-to-spoke syndication targets design district neighborhoods
- Files: `src/lib/design-week.ts`, `src/app/api/cron/sync-design-week/route.ts`
- Cron: Daily at 6 AM UTC (only generates during active/preview periods)

**Route Alert Service ("The Hub Map"):**
- New service monitoring airline schedules for new "Direct Premium Routes"
- 8 hub markets: NYC (JFK/EWR), London (LHR/LGW), LA (LAX), Sydney (SYD), Paris (CDG), Miami, SF, Chicago
- 22+ legacy/premium carriers: Delta, United, BA, Air France, Emirates, Qantas, Singapore Airlines, etc.
- 45+ leisure destinations across 4 types:
  - Leisure Capital: Nice, Naples, Mykonos, Maldives, Aspen, Phuket, St. Barths
  - Financial Hub: Geneva, Zurich, Singapore, Hong Kong, Dubai
  - Cultural Center: Tokyo, Rome, Edinburgh, Tel Aviv
- Premium Leisure Filter: Only legacy carriers + premium destinations (excludes Spirit to Cleveland)
- News sources: Points Guy, Routes Online, Simple Flying, One Mile at a Time, View from the Wing
- Gemini story generation with "Flight Check" / "Utility" tone
- Files: `src/lib/route-alert.ts`, `src/app/api/cron/sync-route-alerts/route.ts`
- Cron: Weekly on Thursdays at 7 AM UTC

**Residency Radar Service ("Brand Migration"):**
- New service tracking seasonal pop-ups of luxury brands in vacation hotspots
- Strategy: City brands migrate with the seasons - Winter: Alps, St. Barts; Summer: Med, Hamptons
- 15 seasonal hotspots: St. Moritz, Aspen, Courchevel, Gstaad, Verbier (Winter); Mykonos, St. Tropez, Hamptons, Capri, Ibiza, Marbella, Amalfi, Sardinia (Summer); St. Barts (Winter Caribbean)
- 30+ migrating luxury brands across 4 categories:
  - Hospitality: Nobu, Carbone, Cipriani, Casa Tua, Zuma, Bagatelle, Nammos, Scorpios
  - Fashion: Dior, Louis Vuitton, Chanel, Gucci, Jacquemus, Loro Piana, The Row, Bottega Veneta
  - Jewelry: Cartier, Bulgari, Van Cleef & Arpels, Rolex
  - Lifestyle: Aman, Six Senses, Soho House
- News sources: Eater, Robb Report, WWD, Wallpaper*, Departures, Bloomberg Pursuits
- Feeder city targeting: NYC residents see Hamptons pop-ups, London sees St. Tropez
- Residency types: Restaurant, Beach_Club, Pop_Up_Shop, Spa, Hotel_Takeover
- Gemini story generation with "Scene Watch" editorial tone
- Files: `src/lib/residency-radar.ts`, `src/app/api/cron/sync-residency-radar/route.ts`
- Cron: Weekly on Wednesdays at 8 AM UTC

**Archive Hunter Service ("Digital to Physical"):**
- New service monitoring luxury resale boutique inventory for "Investment Grade" pieces
- Store locations: TheRealReal, WGACA, Rebag, Fashionphile (15 locations)
- Brand whitelist: 25+ brands with tier classification (Grail/Investment/Collectible)
- Trophy item filter: $3,000+ threshold, $10k+ for grail tier
- Grail items: Birkin, Kelly, Submariner, Daytona, Classic Flap, Alhambra, etc.
- Gemini story generation with "Urgent" tone for collectors
- Files: `src/lib/archive-hunter.ts`, `src/app/api/cron/sync-archive-hunter/route.ts`
- Cron: Twice daily at 9 AM and 5 PM UTC

**Fashion Week Service ("Calendar Override"):**
- Special Event engine for Big Four fashion weeks (NYFW, LFW, MFW, PFW)
- Calendar window detection for Feb/Sept (and Jan/June for Paris Mens)
- Show schedule scrapers for official sources (CFDA, BFC, Camera Moda, FHCM)
- 50+ high-profile designer tracking (Marc Jacobs, Chanel, Prada, etc.)
- Venue-to-neighborhood mapping with traffic alert triggers
- Gemini story generation with "Chaotic Chic" tone
- Files: `src/config/fashion-weeks.ts`, `src/lib/fashion-week.ts`, `src/app/api/cron/sync-fashion-week/route.ts`
- Cron: Daily at 5 AM UTC (only generates during active weeks)

**Political Wallet Service ("Follow the Money"):**
- New service aggregating political contribution data to show neighborhood donation trends
- Data sources: US FEC API, UK Electoral Commission API
- Power Donor filter: $1,000+ minimum, $10k threshold triggers story
- Neighborhood zip mappings for 25+ US/UK neighborhoods
- Privacy-focused: aggregate trends only, never individual names
- Gemini story generation with "Insider" tone
- Files: `src/lib/political-wallet.ts`, `src/app/api/cron/sync-political-wallet/route.ts`
- Cron: Weekly on Tuesdays at 7 AM UTC

**NIMBY Alert Service ("Early Warning System"):**
- New service scraping Community Board / Council Meeting agendas for controversial votes
- Data sources: NYC Community Boards (CB 1-8 Manhattan, CB 1-6 Brooklyn), London Borough Councils, Sydney Councils
- Controversy filters: Liquor (4am, nightclub), Zoning (variance, upzoning), Social (shelter, dispensary), Development, Noise
- PDF parsing via `pdf-parse` package to extract agenda text
- Street name extraction for geofencing within board coverage areas
- Gemini story generation with civic engagement tone
- Files: `src/lib/nimby-alert.ts`, `src/app/api/cron/sync-nimby-alerts/route.ts`
- Cron: Weekly on Mondays at 6 AM UTC

**Sample Sale Service ("Insider Access"):**
- New service scraping fashion aggregators for luxury sample sales
- Data sources: Chicmi (Global), 260 Sample Sale (NYC), Arlettie (Paris/London)
- Brand whitelist: 70+ luxury brands with regex patterns (Hermès, The Row, Kith, etc.)
- Brand tier classification: Ultra (top tier) vs Aspirational (accessible luxury)
- City-to-neighborhood mapping for NYC, London, LA, Paris
- Gemini story generation with "Secret Intel" tone
- Files: `src/lib/sample-sale.ts`, `src/app/api/cron/sync-sample-sales/route.ts`
- Cron: Daily at 8 AM UTC

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
- New City Adapter pattern for standardized civic data fetching across 13 international markets
- Supported cities: London (UK), Sydney (AU), Chicago (US), Los Angeles (US), Washington DC (US), Dublin (IE), Auckland (NZ), Queenstown (NZ), Vancouver (CA), Cape Town (ZA), Singapore (SG), Palm Beach (US), Greenwich (US)
- Each adapter implements: `getPermits()`, `getLiquor()`, `getSafety()` with city-specific API integrations
- City-specific vocabulary injection for AI content (currency symbols, local terminology)
- Config: `src/config/global-locations.ts` with zones, postal codes, editorial tones
- Adapters: `src/lib/adapters/` (london, sydney, chicago, los-angeles, washington-dc, dublin, nz, vancouver, capetown, singapore, palm-beach, greenwich)
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
| Dublin | Dublin City Council + DLR | Courts Service | Garda Síochána / CSO |
| Auckland | Auckland Council | DLC | NZ Police |
| Queenstown | QLDC | DLC | NZ Police |
| Vancouver | City of Vancouver DevApps | BCLCLB | VPD Open Data |
| Cape Town | City of Cape Town ePlan | WCLB | SAPS |
| Singapore | URA IRAS | SLA | SPF |
| Palm Beach | Town Building Division | FL DBPR | PBPD |
| Greenwich | Town Building Division | CT DCP | GPD |

**Special Features by City:**
| City | Feature | Source | File |
|------|---------|--------|------|
| New Zealand | OIO Bunker Watch | LINZ OIO Decisions ($10M+ NZD foreign land) | `oio-service.ts` |
| Vancouver | View Watch | Height variance permits (protected view cones) | `vancouver-views.ts` |
| Cape Town | Calm Alert | Wind conditions (<15km/h = perfect day) | `capetown-conditions.ts` |
| Cape Town | Grid Watch | Eskom load shedding schedules | `capetown-conditions.ts` |
| Singapore | Motor Watch | LTA COE bidding results (Cat B drop >$5k) | `singapore-market.ts` |
| Singapore | GCB Alert | URA Good Class Bungalow sales ($20M+ SGD) | `singapore-market.ts` |
| Palm Beach | Design Watch | ARCOM agenda (architectural review battles) | `palm-beach-arcom.ts` |

**Global Fallback Service:**
- File: `src/lib/global-fallback.ts`
- Ensures no neighborhood is ever empty
- Fallback A: Development Watch (real estate, openings, zoning)
- Fallback B: Lifestyle Watch (dining, shopping, culture)
- Fallback C: Weather conditions (last resort via Open-Meteo)
- Cron: Daily at 11 AM UTC (`sync-global-fallback`)

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
- **Neighborhoods:** 128 active (including 15 combo neighborhoods across 38 cities)

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
│   │   ├── settings/
│   │   │   └── page.tsx              # User settings (location preferences)
│   │   └── api/
│   │       ├── cron/
│   │       │   ├── sync-guides/      # Daily Google Places sync
│   │       │   ├── sync-news/        # Every 6 hrs RSS aggregation
│   │       │   ├── generate-guide-digests/ # Weekly neighborhood digests
│   │       │   └── ...
│   │       └── admin/
│   │           └── rss-sources/      # RSS feed CRUD
│   ├── config/
│   │   └── ad-tiers.ts               # Tier definitions, seasonal rules, base rates
│   └── lib/
│       ├── neighborhood-utils.ts     # City prefix mapping
│       ├── google-places.ts          # Places API
│       ├── rss-sources.ts            # RSS fetching (DB + fallback)
│       ├── PricingService.ts          # Ad pricing: tier resolution, surge, quotes
│       └── location/                 # Location detection & timezone utilities
│           ├── city-mapping.ts       # 31 supported cities with timezones
│           ├── detect.ts             # IP geolocation via ipinfo.io
│           └── timezone.ts           # Timezone resolution priority
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
| sync-gala-watch | Daily 6 AM UTC | High-society charity events via Hub Broadcast model |
| sync-escape-index | Every 6 hours (:45) | Vacation conditions (Snow/Surf/Sun) via Feeder Map |
| sync-review-watch | Every 4 hours | Restaurant reviews from major publications (NYT, Infatuation, Eater) |
| sync-sample-sales | Daily 8 AM UTC | Luxury sample sale alerts from fashion aggregators (Chicmi, 260, Arlettie) |
| sync-nimby-alerts | Monday 6 AM UTC | Community board agenda monitoring for controversial votes (liquor, zoning, social) |
| sync-political-wallet | Tuesday 7 AM UTC | Political donation trends from FEC/UK Electoral Commission ($1k+ donors) |
| sync-fashion-week | Daily 5 AM UTC | Big Four fashion week coverage (NYFW, LFW, MFW, PFW) with traffic alerts |
| sync-archive-hunter | 9 AM, 5 PM UTC | Luxury resale inventory alerts (TheRealReal, WGACA, Rebag, Fashionphile) |
| sync-residency-radar | Wednesday 8 AM UTC | Seasonal luxury brand pop-ups in vacation hotspots (Nobu, Carbone, Dior, etc.) |
| sync-route-alerts | Thursday 7 AM UTC | Premium airline route announcements (JFK-Nice, LHR-Phuket, etc.) |
| sync-museum-watch | Monday 7 AM UTC | Tier 1 museum blockbuster exhibition alerts (Met, MoMA, Tate, Louvre, etc.) |
| sync-overture-alerts | Daily 10 AM UTC | Opera/Ballet/Symphony Opening Nights and Premieres (Met Opera, ROH, La Scala, etc.) |
| sync-design-week | Daily 6 AM UTC | Global Design Week coverage (Salone del Mobile, LDF, Design Miami, etc.) |
| sync-anglosphere-features | Daily 8 AM UTC | Anglosphere city features (Vancouver View Watch, Cape Town Conditions, Singapore Market, Palm Beach ARCOM) |
| sync-global-fallback | Daily 11 AM UTC | Fallback content for neighborhoods without custom adapters |
| monitor-and-fix | Every 30 min | Self-healing: detect missing images, auto-regenerate, track cron failures |

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

### Email Preferences
- `topic_suggestions` - User-submitted topic suggestions from preferences page
- `profiles.paused_topics` / `newsletter_subscribers.paused_topics` - TEXT[] of category_labels to exclude

### Cron Monitoring
- `cron_executions` - Tracks all cron job runs with timing, success status, errors
- `cron_issues` - Tracks issues detected by monitor (missing images, failures) with retry status

## Admin Pages

| Page | URL | Purpose |
|------|-----|---------|
| Cron Monitor | `/admin/cron-monitor` | Self-healing cron system, issue tracking, auto-fix |
| News Coverage | `/admin/news-coverage` | Monitor coverage, manage RSS feeds |
| Regenerate Images | `/admin/regenerate-images` | Regenerate article images |
| Add Place | `/admin/guides/add-place` | Manually add guide listings |
| Articles | `/admin/articles` | Manage articles |
| Sections | `/admin/sections` | Manage content sections |

## User Pages

| Page | URL | Purpose |
|------|-----|---------|
| Settings | `/settings` | Primary location, timezone preferences |

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
