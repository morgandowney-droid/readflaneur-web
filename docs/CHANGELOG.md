# Flaneur Web - Change History

> Full changelog moved here from CLAUDE.md to reduce context overhead.
> Only read this file when you need to understand how a specific feature was built.

## 2026-02-08

**Flaneur 200 — Global Neighborhood Expansion:**
- Seeded 200 neighborhoods across 73 cities and 42 countries (the "Flaneur 200")
- Tier classification: 82 superprime (Tier 1), 90 metropolitan (Tier 2), 28 discovery (Tier 3)
- New regions: South America (Brazil, Argentina, Chile, Colombia), expanded Middle East & Africa
- New cities: Seoul, Shanghai, Beijing, Bangkok, Jakarta, Riyadh, Cairo, Johannesburg, São Paulo, Rio, Buenos Aires, Santiago, Medellín, and many more
- Ad-tiers.ts fully aligned with superprime/metropolitan/discovery → Tier 1/2/3
- New seasonal market: Riviera Season (May–Sep): Cap Ferrat, Antibes, Cannes, Monaco, Portofino, Capri
- Expanded Ski & Snow: added St. Moritz, Gstaad, Courchevel, Niseko
- Expanded Summer Socials: Hamptons (3 neighborhoods), Mykonos, Ibiza
- Seed script: `scripts/seed-flaneur-200.ts` (idempotent upsert, run via `npx tsx`)

**Advertise Page — Strategy Selector & Centralized Stats:**
- New `AdvertiserPersonas` component: 3 strategy cards (Local Pillar, National Trust, Global Icon) above pricing table
- Centralized `src/config/site-stats.ts` — single source of truth for neighborhood/city/country counts
- Advertise page, layout meta, and all marketing copy now reference `SITE_STATS` instead of hardcoded numbers

**Advertise Page Polish & Multi-Neighborhood Booking:**
- Multi-neighborhood selection: pills UI, merged availability calendar, one Stripe checkout with N line items
- Combo component search: typing "FiDi" surfaces Tribeca with "(incl. FiDi)" label
- Font sizes bumped to 17px iOS baseline (text-base body, text-sm descriptions)
- Hero text: "Reach The World's Most Important People"
- Price labels: "$X/day per individual neighborhood" on all cards
- Price alignment: `md:min-h-[180px]` wrapper ensures $500/$200/$100 align horizontally
- Rounded corners (`rounded-lg`) on all buttons, inputs, dropdowns, calendar containers
- Tier 2 tagline shortened: "Reach established cultural centers."
- Checkout API accepts `neighborhoodIds[]` array, creates N ad rows + N Stripe line items
- Webhook handles multi-ad `ad_ids` metadata, sends per-neighborhood upload links
- Success page and booking-info API return array of bookings with individual upload buttons
- DB: migration `20260208152500_multi_neighborhood_booking.sql` — dropped unique on `stripe_session_id`, added index

**Self-Hosted Ad Booking Engine:**
- Replaced Passionfroot integration with native Stripe Checkout booking flow
- Flat per-day pricing: Tier 1 $500/$750, Tier 2 $200/$300, Tier 3 $100/$150 (daily/Sunday)
- Global takeover: $10,000/day, $15,000/Sunday (contact-only)
- Booking calendar: `react-day-picker` with neighborhood search, placement toggle, booked/blocked dates
- Checkout API: 48h–90d booking window, Sunday-only validation for Sunday Edition
- Stripe webhook: `pending_payment` → `pending_assets` on payment, sends confirmation + admin emails
- Asset upload page: `/advertise/upload/[adId]` (UUID-secured, no auth) — brand name, headline, body, image, click URL
- Success page: `/advertise/success` with booking summary and upload link
- Date-aware ad delivery: email ads, Sunday ad resolver, and feed ads all filter by `start_date <= today`
- Double-booking prevention: unique composite index on `(neighborhood_id, placement_type, start_date)` where status not rejected/pending_payment
- DB: migration `20260208144538_self_hosted_booking.sql` — `stripe_session_id`, `customer_email`, `is_global_takeover` columns, updated status constraint, `ad-assets` storage bucket
- Deleted `src/lib/passionfroot-email-parser.ts`, simplified Resend inbound webhook
- New files: `AdBookingCalendar.tsx`, `BookingForm.tsx`, availability/checkout/upload/booking-info API routes
- Stripe checkout uses raw `fetch` to `api.stripe.com` (SDK connection issues in serverless)

**Daily Brief UX Improvements (9 items):**
- Article page: structured header for brief articles (day label, cleaned headline without "Neighborhood DAILY BRIEF:" prefix), flex-wrap left-aligned metadata for non-briefs
- Brief card: day-of-week label ("Sun Daily Brief" instead of "Today's Brief"), "Updated daily at 7 AM" indicator
- Email: satellite-style compact layout for primary stories (`StoryList variant="primary"`, 19px headline / 16px preview), replaces hero image layout
- Email: dateline appended to all category labels (e.g., "DAILY BRIEF - Mon Feb 12")
- Reactions: emoji reactions (bookmark/heart/fire) replacing comments on article pages, with `/saved` page
- Nearby neighborhoods: "Explore nearby" pill links on article pages (same city, up to 5)
- Combo brief fallback: component neighborhoods (e.g., FiDi) show parent combo's (Tribeca) daily brief with attribution
- New helpers: `cleanArticleHeadline()`, `getDayAbbr()` in utils.ts, `getComboForComponent()` in combo-utils.ts
- DB: migration 042 (`article_reactions` table with RLS)

**Sentry Monitoring Fix:**
- SDK v10 client init is `src/instrumentation-client.ts`, NOT root `sentry.client.config.ts` (v8 pattern)
- Deleted unused `sentry.client.config.ts`, fixed actual client config in `instrumentation-client.ts`
- Reduced `tracesSampleRate` from 100% to 20% on all configs (server, edge, client)
- Session replays reduced from 10% to 0% (error replays remain at 100%)
- Project confirmed as `flaneur-web` (org: `flaneur-vk`)
- Added `SENTRY_AUTH_TOKEN` to `.env.local` for API issue queries

**Font Size Readability Upgrade (17px iOS Baseline):**
- All body/reading text bumped to 17px to match iOS Mail compose standard (was 13-14px)
- Headlines, metadata, and labels proportionally increased (+1-2px each)
- 15 files changed: 10 email templates + 5 website components
- Email templates: HeroStory, StoryList, SatelliteSection, NativeAd, WeatherStoryCard, WeatherWidget, Header, Footer, DailyBriefTemplate, SundayEditionTemplate
- Website: ArticleCard, ArticleBody, NeighborhoodBrief, EnrichedNeighborhoodBrief, CompactArticleCard

**Ad Quality Control & Customer Approval System:**
- AI-powered ad quality pipeline using Gemini: image analysis (brand safety + aesthetic scoring 0-100) and copy polisher (Economist/Monocle editorial voice)
- Customer-facing proof page at `/proofs/[token]` — no auth required, token = auth
- State machine: `pending_ai` → `pending_approval` → `approved` (or `changes_requested`)
- Webhook → AI runs automatically → proof email sent to customer → customer approves/requests changes → live
- Admin force-approve bypasses customer proof flow
- Copy polisher saves original to `original_copy`, rewrite to `ai_suggested_rewrite`
- DB: migration 041. Files: `src/lib/ad-quality-service.ts`, `src/app/api/ads/quality/route.ts`, `src/app/api/proofs/[token]/route.ts`, `src/app/proofs/[token]/page.tsx`

**Sunday Edition - Presenting Sponsor Ad Slot:**
- "Presenting Sponsor" placement between Rearview and Horizon sections
- Ad resolver cascade: neighborhood-targeted paid → global paid → Sunday house ad → hardcoded default
- Never empty — house ad fallback. DB: migration 040
- Files: `src/lib/email/sunday-ad-resolver.ts`, `SundayEditionTemplate.tsx`, `send-sunday-edition/route.ts`

**Sunday Edition - Various Fixes:**
- Data Point label: "The Temperature" (not "The Air We Breathe"), never AQI
- Rearview: exactly 4 short paragraphs (2-3 sentences each)
- Chronological event sorting via `parseEventDayForSort()`
- Readability: removed italics, darkened colors
- Persona reverted to Daily Brief Gemini voice
- Story headlines hyperlink to Google search
- Combo neighborhood article fix in `src/lib/combo-utils.ts`

**Sunday Edition - "THAT TIME OF YEAR" Holiday Section:**
- Conditional section detects upcoming holidays (within 7 days) per country
- 20 holidays, Easter via Butcher's algorithm, nth weekday helpers
- DB: `weekly_briefs.holiday_section` JSONB (migration 039)

**Sunday Edition Cron Fix:**
- `sync-weekly-brief` used `.eq('active', true)` — column is `is_active`. Supabase returned 0 rows silently (no error). Fixed to `.eq('is_active', true)`
- Manually re-triggered Sunday Edition generation for all 140 neighborhoods after fix

**Other:**
- Advertise page copy fixes (Dublin format, "Submit Assets" step)
- Email preferences combo neighborhood display
- Global rounded corners in CSS
- Copyright symbol in all email footers

## 2026-02-07

**Fahrenheit for US Neighborhoods:**
- US neighborhoods show °F primary in weather stories/widgets
- Determined by `neighborhoods.country` field

**RSS Article Enrichment Pipeline Fix:**
- Removed 48h time window that permanently skipped old articles
- Added time budgeting: 280s total, 120s Phase 1 cap
- File: `src/app/api/cron/enrich-briefs/route.ts`

**Instant Email Resend on Settings Change:**
- Settings change triggers immediate re-send of daily brief (3/day limit)
- Files: `src/lib/email/instant-resend.ts`, `src/app/api/internal/resend-daily-brief/route.ts`

**Email Monitoring & Self-Healing:**
- `missed_email` issue type with 6-check diagnostic cascade
- Auto-fixes root causes then resends
- File: `src/lib/cron-monitor/email-monitor.ts`

**Thin Content Detector:**
- Flags neighborhoods with 0 articles in last 24h, auto-fixes via Grok brief
- Skips exempt regions (test, vacation)

**Critical Bug Fix: VERCEL_URL vs NEXT_PUBLIC_APP_URL:**
- `VERCEL_URL` pointed to preview deployment, breaking all auto-fix calls
- Fix: Use `NEXT_PUBLIC_APP_URL` first

**Auth Hang Fixes:**
- `getUser()` → `getSession()` in middleware, settings, neighborhood selector
- Added timeout wrappers (3-5s Promise.race)

**Other:**
- RSS article source attribution via Gemini enrichment
- Urban context in Gemini prompts (no driving/parking for dense cities)
- Admin news feed dropdown fix, schema mismatch fix
- Resend email open/click tracking enabled
- Test Lab region (4 experimental neighborhoods)
- Brief window widened 6-7am → 5-7am
- RSS article Gemini enrichment pipeline
- Escape Index condition-specific images

**WeatherStoryService:**
- Pure logic weather stories (no LLM cost)
- 4-tier priority: Safety > Commute > Weekend > Temperature Anomaly
- Files: `src/lib/email/weather-story.ts`, climate-normals, date-utils

## 2026-02-06

**Commercial Stack:**
- `/advertise` page with 4 Collection tiers via Passionfroot
- Ad pricing: 3 tiers ($45/$25/$15 CPM), seasonal shifts, holiday surge
- Passionfroot webhook + Resend inbound email parser for ad creation
- Ad approval workflow with admin page (`/admin/ads`)
- FallbackService: Bonus ads > House ads > Default

**Sentry Error Monitoring:**
- `@sentry/nextjs` with tracing, session replay, source maps
- Org: `flaneur-vk`, project: `flaneur-web`

**Email Topic Preferences:**
- 20 topics in 6 themes, pause/unpause from email preferences page
- Topic suggestions feature

**Primary Location & Timezone:**
- IP geolocation detection, settings page, timezone priority chain
- 31 supported cities with IANA timezone mappings

## 2026-02-05

**Cron Monitor & Self-Healing:**
- `cron_executions` + `cron_issues` tables
- Auto-detects: missing images, placeholder SVGs, job failures
- Auto-fixes: image regeneration with retry backoff
- Admin dashboard: `/admin/cron-monitor`

**Global Rollout (13 new neighborhoods across 8 cities):**
- Vancouver (2), Cape Town (2), Singapore (2), Palm Beach (1), Greenwich (1)
- New Zealand (5 neighborhoods, "Bunker Watch" OIO monitoring)
- Dublin (3 neighborhoods)
- Each city has custom adapter in `src/lib/adapters/`

**Content Services (all in `src/lib/` with crons in `src/app/api/cron/`):**
- Museum Watch, Overture Alert, Design Week, Route Alert, Residency Radar
- Archive Hunter, Fashion Week, Political Wallet, NIMBY Alert, Sample Sale
- Heritage Watch, Alfresco Watch, Filming Location Watch
- Global Data Engine (13 international city adapters)
- Cached Cron Image System (22 image categories)
- Gemini Story Registry (24 generators)

## 2026-02-04

**NYC Open Data Integration:**
- Permits, liquor licenses, crime stats geofenced to 11 NYC areas
- Config: `src/config/nyc-locations.ts`

**Combo Neighborhoods:**
- 15 combo neighborhoods aggregating multiple areas
- `src/lib/combo-utils.ts` for queries

## 2026-02-03

**Vacation Neighborhoods (8 destinations):**
- US Vacation, Caribbean Vacation, European Vacation regions
- 11 new RSS feeds for vacation neighborhoods

## 2026-02-02

**Grok Integration:**
- Neighborhood briefs via Grok X Search (`src/lib/grok.ts`)
- Smart entity detection, address linking, word replacements
- Brief archive, commentary detection

**Gemini Image Generation:**
- Model: `gemini-2.5-flash-image` via `/api/internal/generate-image`

**UI Consolidation:**
- Removed unused buttons, Places page server-side rendering
- Neighborhood expansion to 91+ neighborhoods

## 2026-02-01 and earlier

- Google OAuth live
- Vercel Pro ($20/mo)
- Guide cards with rank numbers
- Batch neighborhood seeding scripts
- Playwright MCP for UI testing
