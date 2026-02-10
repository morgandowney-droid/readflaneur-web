# Flaneur Web - Change History

> Full changelog moved here from CLAUDE.md to reduce context overhead.
> Only read this file when you need to understand how a specific feature was built.

## 2026-02-10

**Combo Subtitle + Maps/History in MultiFeed:**
- Combo neighborhoods now show "Covering X, Y, and Z" subtitle in MultiFeed header when their pill is active
- Added small grey dotted-underline "Maps" and "History" links below neighborhood name in MultiFeed (only when a specific pill is active, not "All Stories")
- Links use same URLs as single-neighborhood MAP/HISTORY buttons (Google Maps + Wikipedia)

**Server-Side Weather (Instant Render):**
- New `src/lib/weather.ts` helper fetches from Open-Meteo API server-side with 10-min `revalidate` cache
- `NeighborhoodLiveStatus` accepts `initialWeather` prop - initializes weather state from server data, skips client-side fetch
- Both `[city]/[neighborhood]/page.tsx` and `feed/page.tsx` fetch weather server-side and pass through props
- Eliminates visible weather pop-in on initial page load (time + temp render together)

**Primary Neighborhood Indicator:**
- Added primary neighborhood concept: first item in localStorage array is primary
- `useNeighborhoodPreferences` hook exposes `primaryId` and `setPrimary(id)` for reordering
- ContextSwitcher: amber dot + "PRIMARY" label on first neighborhood, "Set primary" on hover for others
- MultiFeed pill bar: "PRIMARY" badge on first pill when multiple neighborhoods selected
- HomeSignupEnhanced: "Primary" badge on first chip, star button on others to set primary
- NeighborhoodSelectorModal: "Primary" badge on first selected item, "Set primary" on hover

**Neighborhood Modal Improvements:**
- "Clear all" now requires two-tap confirmation ("Are you sure?" Yes/No) to prevent accidental clears
- Modal re-syncs selections from localStorage on reopen (fixes stale selections after homepage changes)
- Accent-insensitive search via NFD normalization - "ostermalm" matches "Östermalm"
- "Nearest" renamed to "Sort by nearest to me" and moved below search input

**Feed Header Fixes:**
- Long neighborhood names no longer overlap GUIDE/MAP/HISTORY - grid uses `minmax(0,1fr)` columns
- ContextSwitcher trigger truncates at `max-w-[120px] md:max-w-[200px]` with `min-w-0`
- Masthead top padding reduced from `pt-20 md:pt-24` to `pt-8` to match `mb-8` bottom spacing

**MagicLinkReminder Dark Mode Rewrite:**
- Rewritten text: "Get fresh neighborhood daily briefs every morning"
- Centered layout with dark-mode input (`bg-neutral-900 border-white/20`)
- Visible "Subscribe" button (`bg-white text-neutral-900`), Enter key support

**NativeAd Email Fix:**
- Image `<Img>` wrapped in conditional `{ad.imageUrl && (...)}` to prevent alt text rendering as blue link when no image URL exists (common for house ads)

**Context Switcher - Unified Feed Architecture:**
- Replaced "← All Neighborhoods" back button with `ContextSwitcher` dropdown in Control Deck
- New `ContextSwitcher` component: trigger shows `{LABEL} ▾`, popover lists "All Neighborhoods", user's subscribed neighborhoods (name + city), and "Customize List..." action
- New `useNeighborhoodPreferences` hook: reads localStorage IDs, fetches name/city from Supabase, cross-tab sync via `storage` event
- `NeighborhoodHeader` now supports `mode: 'single' | 'all'` - "all" mode shows "My Neighborhoods" heading with count subtitle, hides city label and LiveStatus, empties GUIDE/MAP/HISTORY center slot
- `MultiFeed` now uses shared `NeighborhoodHeader` (mode="all") instead of standalone header/ViewToggle, accepts `dailyBrief` prop
- `feed/page.tsx` fetches primary neighborhood brief for multi-feed and passes as `dailyBrief` to `MultiFeed`
- Added `getCitySlugFromId()` and `getNeighborhoodSlugFromId()` to `neighborhood-utils.ts`, removed duplicate helpers from MultiFeed, ComboNeighborhoodCards, feed/page.tsx

**Global Font-Size Bump (Feed Components):**
- DailyBriefWidget body: `text-sm text-neutral-500` -> `text-lg text-neutral-400`, read more `text-sm font-medium`
- CompactArticleCard headline: `text-base` -> `text-lg md:text-xl`, preview `text-xs` -> `text-[1.05rem] leading-7`
- CompactArticleCard actions: `text-xs` -> `text-sm font-medium uppercase tracking-wide text-neutral-500`
- ArticleCard (gallery): headline `text-xl` -> `text-xl md:text-2xl`, preview `text-[1.05rem] leading-7`
- ArticleCard Read More: `text-xs` -> `text-sm font-bold tracking-wider text-amber-500`

**Horizontal Scrollable Pill Bar (Multi-Feed):**
- Replaced expandable grid with horizontal scroll + rounded pills (`rounded-full`)
- Sticky below nav (`sticky top-[60px]`) with `bg-[#050505]/95 backdrop-blur-md`
- "All Stories" default pill + per-neighborhood filter pills with client-side filtering
- Active: `bg-white text-black`, Inactive: `border-neutral-800 text-neutral-400`
- Manage button (sliders icon) opens NeighborhoodSelectorModal
- Right-edge mask gradient, hidden scrollbar (`no-scrollbar` utility)
- Removed "Your Stories" header and expand/collapse logic

**Editorial Article Body Typography:**
- Added Merriweather font (Google Fonts, screen-optimized serif) via `--font-body-serif` CSS variable
- Article body upsized: mobile `text-[1.2rem]` (~19px), desktop `text-[1.35rem]` (~22px)
- `leading-loose` (2x line height) for dark mode legibility
- `text-neutral-200` (off-white) instead of pure white to reduce eye strain
- `mb-8` paragraph spacing for breathing room
- Links switched from `text-blue-600` to amber accent (`text-amber-600/80`) with subtle underline
- Bold text: `font-bold text-neutral-100`
- Section headers: `text-xl` with `mt-10 mb-6` in Merriweather

**Final Layout Polish:**
- Hero spacing tightened: `pt-32/pt-40` -> `pt-20/pt-24`, title `mb-3`, live status `mb-8`
- Control Deck switched from flexbox to CSS Grid `grid-cols-[1fr_auto_1fr]` for true mathematical centering
- Back button responsive: arrow-only on mobile, "← ALL NEIGHBORHOODS" on desktop
- NeighborhoodLiveStatus color matched to Daily Brief label: `text-amber-600/80`
- Removed unused `formatCityDisplay` helper

**Neighborhood Page Layout Refinement:**
- Back button moved from floating above H1 into Control Deck toolbar (far left), renamed "← ALL NEIGHBORHOODS"
- NeighborhoodLiveStatus toned down: `text-xs font-medium tracking-[0.2em]` (matches Daily Brief label)
- Luxury spacing: masthead `pt-32 md:pt-40`, H1 `mb-4`, live status `mb-12` before control deck
- Removed `mt-8` from control deck (spacing now handled by masthead bottom margin)

**Back Button & Load More Fix:**
- Back button renamed from "← NEW YORK" (city slug) to "← All Neighborhoods"
- LoadMoreButton now accepts `queryIds` prop for combo neighborhoods
- Previously server-side count used all combo+component IDs but client LoadMore only queried single ID
- Caused phantom "Load More" button that hung on "Loading..." with no results
- Ads fetch and injection in LoadMore also updated to use full queryIds array

**DailyBriefWidget Relocation:**
- Moved DailyBriefWidget from above NeighborhoodFeed to between NeighborhoodHeader (control deck) and FeedList
- "Context before Content" principle: Masthead → Control Deck → Daily Brief → Story Feed
- Brief passed as `dailyBrief` ReactNode prop through NeighborhoodFeed component
- Spacing: `mt-8 mb-12` wrapper around brief slot
- Brief sits outside grid/list toggle logic - always full width at top
- Combo brief attribution preserved ("From {comboName} daily brief")

**NeighborhoodLiveStatus Component:**
- New `NeighborhoodLiveStatus` component in masthead showing local time + current weather
- Typography: `font-mono text-sm tracking-widest text-amber-500/90` (terminal chic)
- Format: `16:30 | 12°C Overcast` (24h + Celsius) or `4:30 PM | 54°F Clear` (12h + Fahrenheit for US)
- Pipe `|` separator instead of em dash (avoids confusion with negative temperatures)
- Clickable: entire line links to Google search for `{neighborhood} {city} weather` (new tab)
- Animated colon: custom `animate-pulse-slow` keyframe (2s ease-in-out, opacity 1→0.4→1)
- Weather fetched client-side from Open-Meteo free API (no auth), AbortController cleanup, silent fail
- Time updates every 10s via `Intl.DateTimeFormat` with neighborhood timezone
- Props: `timezone`, `country`, `latitude`, `longitude`, `neighborhoodName`, `city`
- SSR safe: returns null until client hydration

**UI Polish & Cleanup:**
- Removed email subscribe form from DailyBriefWidget (newsletter signup handled elsewhere)
- Removed Previous Days / BriefArchive dropdown from neighborhood feed header control deck
- Narrowed neighborhood modal search field (`max-w-xs`), moved Nearest button under City Index title
- Book Now buttons on advertise page now scroll to neighborhood search and auto-focus the input
- Fixed +N MORE button on multi-feed page (was `bg-neutral-50` - illegible on dark canvas)
- Fixed neighborhood pills and "Show less" button dark mode on multi-feed
- Simplified contact page: removed tip submission form, replaced with direct email link
- Cleaned up unused imports (`useSearchParams`, `useEffect`, `useState`, `TipSubmitModal`)

**Dark Mode Fix - Footer Pages:**
- Fixed 4 footer pages (about, careers, contact, legal) missed in initial Obsidian Theme sweep
- About: `text-neutral-700` → `text-neutral-400`, buttons `border-black` → `border-white/20`, email links styled
- Careers: quote card `bg-neutral-50` → `bg-surface`, bullet dots `bg-black` → `bg-white`, Apply Now inverted
- Contact: body text and links fixed for dark backgrounds
- Legal: tabs `border-black` → `border-amber-500`, added `prose-invert` for content readability

## 2026-02-09

**Obsidian Theme - Permanent Dark Mode (61 files):**
- Entire site pivoted to permanent dark mode, inspired by Bloomberg Terminal / Linear.app
- CSS vars: `--background: #050505` (canvas), `--foreground: #e5e5e5`, `--color-surface: #121212`
- `html` bg `#050505` prevents white flash on page load
- Selection color changed to amber `#d97706` on white
- Button system: `.btn-primary` inverted to `bg-white text-neutral-900` with amber hover, `.btn-secondary` transparent with white border, `.btn-ghost` neutral-400 hover white
- Header: `bg-black/80 backdrop-blur-xl border-white/5`, active nav borders `border-amber-500`
- Footer: `bg-canvas`, `border-white/[0.08]`, neutral-400 links hover white
- All cards/surfaces: `bg-surface` (#121212), borders `border-white/[0.08]`
- Text hierarchy: Headlines `text-neutral-100`, body `text-neutral-400`, meta `text-neutral-500`
- Hover states: `hover:text-white`, `hover:bg-white/5` throughout
- Form inputs across all pages: `bg-neutral-900 border-white/20 text-white`, focus `border-amber-500`
- Article prose: added `prose-invert` to ArticleBody and standards page
- Feed components: NeighborhoodBrief `bg-surface`, dark skeleton shimmer (`bg-neutral-800`), subscribe input `border-neutral-700 focus:border-amber-500`
- Ad components: gallery `bg-amber-950/30 border-amber-500/30`, compact `bg-surface`
- 17 admin pages: uniform dark treatment with `bg-surface`, `bg-neutral-800` table headers
- All page backgrounds: `bg-canvas` replacing `bg-white`/`bg-neutral-50`
- Email templates intentionally untouched (must stay light for mail client compatibility)
- NeighborhoodSelectorModal already dark (glassmorphism) - unchanged
- Advertise page already `bg-neutral-950` - unchanged
- WCAG AAA contrast: body text #a3a3a3 on #050505 = 8.7:1 ratio

**NeighborhoodHeader Redesign - Masthead + Control Deck:**
- Replaced scattered left-aligned header (back button, city/name, combo cards, view toggle in separate rows) with centered Masthead + bordered Control Deck toolbar
- Masthead: centered city label (small caps `tracking-[0.3em]`), serif neighborhood name (`font-display text-4xl md:text-5xl`), italic combo sub-line ("Covering Tribeca and FiDi")
- Back arrow: absolute top-left `← NEW YORK` (city slug uppercased), links to multi-feed or home
- Control Deck: `border-y border-neutral-200 py-4` toolbar with BriefArchive toggle (left), GUIDE/MAP/HISTORY links (center), ViewToggle icons (right)
- Combo neighborhoods: GUIDE/MAP/HISTORY become dropdown menus listing each component neighborhood, with click-outside-to-close
- ViewToggle: stripped pill background (`bg-neutral-100 rounded-lg p-1` + `bg-white shadow-sm`), now minimal `w-8 h-8` icons with `text-neutral-900`/`text-neutral-300`
- BriefArchive moved from standalone position between brief and header into Control Deck left zone via ReactNode prop threading (page.tsx → NeighborhoodFeed → NeighborhoodHeader)
- BriefArchive toggle restyled from amber to `text-neutral-400 hover:text-neutral-900`
- ComboNeighborhoodCards removed from feed header (kept for GuidesClient.tsx)

**DailyBriefWidget Architectural Redesign:**
- Replaced amber gradient box (`from-amber-50 to-orange-50`) with minimal `bg-neutral-50` container, no border/rounded corners, generous `p-8 md:p-10` padding
- Eyebrow: monospace `MON DAILY BRIEF` with pulsing amber dot (`animate-pulse`), removed AI-Synthesized badge and time/update text
- Headline: upgraded to `font-display text-2xl md:text-3xl` (Cormorant Garamond serif)
- Content: `text-sm text-neutral-500 max-w-prose` with subtle Read more link
- Source attribution: neutral palette (`text-neutral-400`, `decoration-neutral-300`)
- Subscribe form: full-width underlined input (`border-b border-neutral-300`) with absolute-positioned text-only SUBSCRIBE button, serif italic placeholder
- Success states: serif italic messages ("You're on the list. See you tomorrow." / "Check your email to confirm.")
- Skeleton updated to match neutral-50 container with neutral-200 shimmer bars

**Daily Brief Email - "Quiet Luxury" Visual Overhaul:**
- Replaced system sans-serif fonts with Playfair Display (Google Fonts `@import`) + Georgia/Times New Roman serif fallback for all headlines, masthead, temperature display, and section titles
- Masthead: 28px Playfair Display with `0.25em` letter-spacing (was 32px system sans-serif)
- Date line: smaller (12px), lighter (#b0b0b0), wider tracking
- Hero weather block: neighborhood name (12px tracked caps) + temperature (48px Playfair Display) + weather description merged as one centered visual thought. No "THE TEMPERATURE" label - the number speaks for itself.
- Single-unit temperature: °F for USA, °C for everyone else (no more dual "72°F / 22°C" format)
- Removed WeatherWidget entirely (redundant with temperature data point); WeatherStoryCard now editorial only (headline + body, no temp line)
- Weather story card: stripped blue border + grey background, now clean border-bottom only; alert variant keeps red left border without background
- Section headers: always display `{neighborhood} · {city}` format (e.g., "TRIBECA · NEW YORK", "GREENWICH BACKCOUNTRY · CONNECTICUT"). City name rendered in muted `#b0b0b0`. No smart geography hiding - consistency over cleverness.
- `SectionDivider` component: centered wide-tracked uppercase label + short 32px gold accent rule (`rgba(120, 53, 15, 0.4)`) below, used by satellite sections. Primary section uses inline hero block with same `{name} · {city}` format.
- Native ad placement: moved from between stories 2-3 to between stories 1-2 for earlier visibility
- House ad fallback: when no paid ads are booked, `ads.ts` pulls a random house ad from `house_ads` table for the native slot. NativeAd component now supports body text, fully centered layout (eyebrow, headline, body, sponsor).
- Word-boundary truncation: `truncateAtWord()` helper prevents mid-word cuts in preview text (120 char limit) + CSS `-webkit-line-clamp: 2` for visual truncation in Apple Mail
- Story headlines: Playfair Display serif across StoryList, SatelliteSection, NativeAd, HeroStory, WeatherStoryCard
- Metadata: 10px with 0.15em letter-spacing, lightened to #b0b0b0
- Preview text: #555555 with lineHeight 1.6 (was #666, 1.4)
- Story spacing: 8px row gap (was 4px), 20px divider margin (was 12px)
- Article deduplication: same article URL no longer appears in both primary and satellite sections (URL Set tracking in assembler.ts)

**Email Temperature Fixes:**
- Sunday Edition data point: °C for non-US countries, °F only for USA (based on `neighborhoods.country`)
- Fixed Gemini prompt for `environment` data point to explicitly specify unit and make JSON example consistent (prevents Gemini from using wrong unit)
- Daily Brief: added "The Temperature" data point section (centered 36px bold value + weather description) between neighborhood title and weather story
- Uses existing `useFahrenheit` flag from weather data - no extra API call

**Article Source Attribution & Quality:**
- RSS articles now save original source to `article_sources` table immediately on creation (sync-news cron)
- `SourceAttribution` component: falls back to parsing `editor_notes` ("Source: Name - URL") for existing articles without `article_sources` entries
- Sync-news prompt: Claude now replaces first-person entity language ("we/us/our") with actual entity name (e.g., "We are seeking" -> "Bukowskis is seeking")
- Added "Never use em dashes" to sync-news system prompt

**Citation Artifact Cleanup:**
- Gemini enrichment (`brief-enricher-gemini.ts`): strips `.( ` citation artifacts, numbered citations `.(1)`, empty parens, orphaned `(`
- Grok brief generation (`grok.ts`): same cleanup applied to response text
- Fixes ".(" and odd parentheses appearing at end of paragraphs in enriched articles

**Bug Fix: ArticleReactions Unhandled Rejection:**
- `fetchReactions()` had no try/catch around `fetch()` call
- On iOS (WebKit), network drops or ad blockers throw `TypeError: Load failed` as unhandled rejection
- Wrapped in try/catch - reactions are non-critical UI, errors silently ignored

## 2026-02-08

**Advertise Page — Interactive Navigation & Polish:**
- "Example Neighborhoods" text and names in collection cards now clickable - scrolls to booking calendar and focuses search input
- Strategy card "Recommended" text now clickable - scrolls to Collections section and auto-selects the corresponding placement toggle (Daily Brief or Sunday Edition) via custom DOM event `placement-select`
- Strategy cards: "The Goal" and "Recommended" sections now align horizontally across all three cards (`md:min-h-[60px]` on Who section, `mt-auto` on Recommended)
- Fixed Sunday pricing labels: changed "/day per individual neighborhood" to "/Sunday per individual neighborhood" on all three collection cards
- Removed em dashes from Global Takeover copy (general rule: never use em dashes in user-facing text)
- Homepage "252 neighborhoods, 92 cities" stat line now clickable and centered - opens the NeighborhoodSelectorModal (via new `HeroStats.tsx` client component)
- Copy updates: Metropolitan description removed "gallery owners", Discovery tagline changed to "Target accelerating hubs in smart global cities", Discovery description streamlined

**RSS Sources — Global Expansion (100% City Coverage):**
- Expanded from 23 cities to 92 cities (100% of active neighborhoods now have RSS feeds)
- Total feeds: 192 (was ~65), covering all regions including previously uncovered South America
- Two migrations: `20260208200000_seed_rss_sources_global.sql` (58 cities, 116 feeds) and `20260208201000_seed_rss_sources_remaining.sql` (6 legacy cities, 12 feeds)
- Hardcoded `RSS_FEEDS` fallback array expanded with 35 key feeds for major cities
- Key sources: Eater (US cities), CultureMap (Texas), The Local (European countries), Coconuts (SE Asia), national English papers (Korea Herald, Bangkok Post, Buenos Aires Times, etc.)
- File: `src/lib/rss-sources.ts` (DB primary via `rss_sources` table, hardcoded fallback)

**Enhanced Neighborhood Search:**
- New shared search module: `src/lib/search-aliases.ts` — country aliases (USA/UK/UAE etc.), region aliases (Europe/APAC/LATAM), US state + international province aliases
- `resolveSearchQuery()` with priority scoring: name exact (1) > starts-with (2) > contains (3) > city (4-5) > component (6) > state (7) > country (8) > region (9)
- Alias suppression: when query matches a country/region/state alias, loose substring matches are suppressed (prevents "US" matching "Justicia" or "Bogenhausen")
- New `src/lib/geo-utils.ts`: extracted Haversine distance from NeighborhoodSelectorModal, added `sortByDistance()` and `formatDistance()`
- AdBookingCalendar: "Near me" geolocation button, grouped city headers for broad queries (with "Select all"), combo component names below selected pills
- NeighborhoodSelectorModal: replaced hardcoded `CITY_COORDINATES` (~20 cities) with dynamic computation from neighborhood lat/lng (all 92+ cities), added country/region/state filtering
- Added `'south-america'` to `GlobalRegion` type (was missing despite seed script using it)

**Advertise Page — Placement Toggle & Copy Refresh:**
- New `CollectionsWithPlacement.tsx` client component: Daily Brief / Sunday Edition toggle between Collections header and pricing cards
- Pricing highlight: selected placement turns bright white, non-selected dims to neutral-600; default state unchanged
- Removed duplicate placement toggle from booking calendar section
- Hero headline: "Reach Some of the World's Most Discerning Audiences."
- Hero subheading: "Your brand, woven into the daily rituals of the West Village, Mayfair, Östermalm, and beyond..."

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
- Hero text: "Reach Some of the World's Most Discerning Audiences." (updated from original "Reach The World's Most Important People")
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
