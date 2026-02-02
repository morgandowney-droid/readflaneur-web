# Flâneur Web - Project Status

> **How to use:** When starting a new Claude session, say "read CLAUDE.md and pick up where we left off"
>
> **See also:** `../flaneur/CLAUDE.md` for the full project overview and mobile app details.
>
> **User Location:** Stockholm, Sweden (CET/CEST timezone) - use this for time-related references.

## Current Status
**Last Updated:** 2026-02-02

### Recent Changes (2026-02-02)

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
- **Neighborhoods:** 91 total (7 seeded, 84 seeding)

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
GEMINI_API_KEY=                  # Primary image generation (on flaneur API)
```

## Automated Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| sync-guides | Daily 3 AM UTC | Update Google Places data |
| sync-news | Every 6 hours | Fetch RSS, create articles with AI images |
| generate-guide-digests | Monday 10 AM UTC | Weekly "What's New" articles |
| sync-tonight | Daily 2 PM UTC | Fetch & curate events |
| sync-spotted | Every 30 min | Monitor social media |
| process-property-watch | Daily 7 AM UTC | Process user submissions |
| generate-digests | Weekly Mon 8 AM UTC | Property watch summaries |

## Database Tables

### Neighborhood System
- `neighborhoods` - All 91 neighborhoods with coordinates, region, country
- `guide_listings` - Places from Google Places API
- `guide_categories` - Restaurant, Coffee, Bars, etc.
- `rss_sources` - RSS feed URLs by city (manageable via admin)

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
- **Playwright MCP** - Browser automation, screenshots, UI testing
- **Supermemory** - Persistent context across sessions
- **Frontend Design** - Polished UI code generation

**Useful Commands:**
```bash
# UI screenshot
npx playwright screenshot --wait-for-timeout=5000 [url] [output.png]

# Deploy to production
git add . && git commit -m "message" && git push origin master
npx vercel --prod

# Check MCP status
/mcp
```

## Related Project

Backend API and mobile app in `../flaneur/` - see `../flaneur/CLAUDE.md`
