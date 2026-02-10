# Flaneur Web

> **User Location:** Stockholm, Sweden (CET/CEST timezone)
> **Full changelog:** `docs/CHANGELOG.md` (read only when needed)
> **Mobile app:** `../flaneur/CLAUDE.md`

## What's Live

- **Website:** https://readflaneur.com
- **Backend API:** https://flaneur-azure.vercel.app
- **GitHub:** https://github.com/morgandowney-droid/readflaneur-web
- **Sentry:** https://sentry.io/organizations/flaneur-vk/issues/
- **200 neighborhoods** across 73 cities, 42 countries (the "Flaneur 200")

## Last Updated: 2026-02-10

Recent work: NeighborhoodLiveStatus - terminal-chic local time + weather display in masthead (Open-Meteo, animated colon, 12h/24h by country).

## Key Patterns

### Cron Jobs
- All in `src/app/api/cron/[job-name]/route.ts`
- Auth: `x-vercel-cron` header or `CRON_SECRET`
- **MUST** log to `cron_executions` table
- Use `maxDuration = 300` for long-running jobs
- Use time budgets to ensure logging completes in `try/finally`

### Image Generation
- Endpoint: `/api/internal/generate-image`
- Model: `gemini-2.5-flash-image`
- Style: Watercolor/gouache illustrations, NOT photographs
- Cached images: `src/lib/cron-images.ts` (22 categories)

### Email System
- **Scheduler:** `src/lib/email/scheduler.ts` — 7 AM local time per recipient
- **Assembler:** `src/lib/email/assembler.ts` — articles + weather, dateline in category labels
- **Sender:** `src/lib/email/sender.ts` — React Email via Resend
- **Sunday Edition:** `src/lib/weekly-brief-service.ts` — Gemini + Grok. Sections: The Letter, The Next Few Days, That Time of Year, Data Point, Your Other Editions
- **Weather:** Pure logic in `src/lib/email/weather-story.ts` (no LLM)
- **Hero block:** `{neighborhood} · {city}` (12px tracked caps) + temperature (48px Playfair Display) + weather description - merged as one centered visual thought, no label
- **Temperature:** Single-unit: °F for USA, °C for everyone else. Sunday Edition data point same logic.
- **US neighborhoods:** °F only. Determined by `neighborhoods.country`
- **Instant resend:** `src/lib/email/instant-resend.ts` (3/day limit)
- **Layout:** Primary stories use compact `StoryList variant="primary"` (19px/16px), no hero image. Native ad between stories 1 and 2.
- **Section headers:** Always `{neighborhood} · {city}` - no smart geography hiding. City in muted `#b0b0b0`.
- **Section dividers:** `SectionDivider` component - centered wide-tracked uppercase `{name} · {city}` + 32px gold accent rule (`rgba(120, 53, 15, 0.4)`)
- **Truncation:** `truncateAtWord()` helper (120 chars) + CSS `-webkit-line-clamp: 2` for preview text
- **Typography:** Playfair Display via Google Fonts `@import` (Apple Mail renders; Gmail falls back to Georgia serif). All headlines, masthead, temperature use serif.
- **Masthead:** "FLANEUR" is a clickable link to `readflaneur.com` in both Daily Brief (`Header.tsx`) and Sunday Edition templates. Styled to match surrounding text (no underline).
- **Ad fallback:** `src/lib/email/ads.ts` - paid ads first, then random house ad from `house_ads` table. NativeAd supports body text, centered layout.
- **Deduplication:** assembler.ts tracks seen article URLs in a Set - same story never appears in both primary and satellite sections
- **On-demand secondary editions:** `src/app/api/email/sunday-edition-request/route.ts` - two-step confirmation (prevents email client prefetch). Template shows "Your Other Editions" links for secondary neighborhoods. Dedup index: `(recipient_id, neighborhood_id, week_date)`. Rate limit: 5 on-demand sends per week. On-demand emails do NOT include secondary neighborhood buttons (no recursion).

### Ad System
- **Pricing:** `src/config/ad-tiers.ts`, `src/lib/PricingService.ts` — flat per-day rates (Tier 1: $500/$750, Tier 2: $200/$300, Tier 3: $100/$150)

- **Booking:** `/advertise` page with `react-day-picker` calendar → Stripe Checkout → asset upload → AI review
- **Placement toggle:** `CollectionsWithPlacement.tsx` — Daily Brief / Sunday Edition toggle between Collections header and pricing cards, highlights active pricing
- **Availability:** `GET /api/ads/availability` — booked/blocked dates + pricing per neighborhood/month
- **Checkout:** `POST /api/ads/checkout` — accepts `neighborhoodIds[]` array, creates N ads + N Stripe line items, 48h–90d window
- **Upload:** `/advertise/upload/[adId]` — sponsor label, headline, body, image, click URL (one per neighborhood)
- **Success:** `/advertise/success` — post-payment confirmation with per-neighborhood upload links
- **Quality:** `src/lib/ad-quality-service.ts` — Gemini image analysis + copy polisher
- **Proof page:** `/proofs/[token]` — no auth, token-based
- **Approval flow:** `pending_payment` → `pending_assets` → `in_review` → `active` (via admin approval)
- **AI quality:** `pending_ai` → `pending_approval` → `approved` / `changes_requested`
- **Sunday ad resolver:** `src/lib/email/sunday-ad-resolver.ts` — date-aware cascade with house ad fallback
- **Date-aware delivery:** `src/lib/email/ads.ts` and `src/lib/ad-engine.ts` filter by `start_date <= today <= end_date`
- **Multi-neighborhood:** Calendar shows merged availability, pills UI for selection (with combo component names), combo component search (e.g. "FiDi" finds Tribeca)
- **Double-booking prevention:** unique composite index on `(neighborhood_id, placement_type, start_date)`
- **Stripe session:** `stripe_session_id` shared across N ads from same checkout (not unique)
- **Global takeover:** $10,000/day or $15,000/Sunday, contact-only (`ads@readflaneur.com`)
- **Storage:** `ad-assets` Supabase bucket for uploaded ad images

### Enhanced Neighborhood Search
- **Shared search:** `src/lib/search-aliases.ts` — country/region/state aliases + `resolveSearchQuery()` with priority scoring
- **Geo utils:** `src/lib/geo-utils.ts` — Haversine distance, `sortByDistance()`, `formatDistance()`
- **Advertise page:** `AdBookingCalendar.tsx` — searches by name/city/component/country/region/state, "Near me" geolocation, grouped city headers for broad queries, "Select all in city"
- **Header modal:** `NeighborhoodSelectorModal.tsx` — "Editorial City Index" dark glassmorphism UI (`bg-neutral-900/90 backdrop-blur-md`), CSS columns masonry layout, text-based items (not pills), amber accent system for selected/vacation/enclave, toggle select/deselect per city, "Clear all" in footer, slide-up + backdrop-fade animations
- **Alias suppression:** when query matches a country/region/state alias, loose substring matches are suppressed (prevents "US" matching "Justicia")

### Combo Neighborhoods
- `src/lib/combo-utils.ts` — `getNeighborhoodIdsForQuery()`, `getComboInfo()`, `getComboForComponent()`
- Articles stored under combo ID, not component IDs
- Query must include BOTH combo ID and component IDs
- Component neighborhoods fall back to parent combo's daily brief on feed page

### Reactions System
- **Table:** `article_reactions` (bookmark, heart, fire) — replaces comments
- **API:** `src/app/api/reactions/route.ts` — GET counts, POST toggle
- **Saved:** `src/app/api/reactions/saved/route.ts` + `/saved` page
- **Component:** `src/components/article/ArticleReactions.tsx` — optimistic UI, anonymous via localStorage
- Anonymous ID stored in `flaneur-anonymous-id` localStorage key

### Sentry Monitoring
- **Project:** `flaneur-web` (org: `flaneur-vk`, project ID: `4510840235884544`)
- **SDK:** `@sentry/nextjs` v10 — client via `src/instrumentation-client.ts`, server/edge via `sentry.{server,edge}.config.ts`
- **Tunnel:** `/monitoring` route (bypasses ad blockers)
- **Trace rate:** 20% on all configs, session replays off, error replays 100%
- **API token:** `SENTRY_AUTH_TOKEN` in `.env.local` (read scope for issue queries)

## Critical Gotchas

### VERCEL_URL vs NEXT_PUBLIC_APP_URL
`VERCEL_URL` points to preview deployments, NOT production. Always use:
```typescript
const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\n$/, '').replace(/\/$/, '')
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
```

### Supabase Auth: getUser() vs getSession()
- `getUser()` = network call, can hang. `getSession()` = cookies, instant.
- **Always use `getSession()`** in middleware/pages/components
- Add timeout wrappers (3-5s `Promise.race`) for auth/DB calls in UI

### Supabase PromiseLike
No `.catch()` on query builder. Use `.then(null, errorHandler)` or `Promise.resolve(query).catch(...)`.

### Supabase Foreign Key Joins
`neighborhood:neighborhoods(id, name, city)` returns a single **object**, not an array. Don't use `[0]` on the result.

### Gemini Prompts
JSON examples override prose instructions. If prompt says "Don't use AQI" but example shows `"AQI 42"`, Gemini follows the example.

### No Em Dashes
Never use em dashes (—) in user-facing text. Use hyphens (-) instead. Em dashes look AI-generated.

### Obsidian Theme (Dark Mode)
- **Permanent dark mode** - no light mode toggle, always dark
- **CSS vars:** `--background: #050505`, `--foreground: #e5e5e5`, `--color-canvas: #050505`, `--color-surface: #121212`
- **html bg:** `#050505` (prevents white flash on load)
- **Selection:** amber `#d97706` on white
- **Buttons:** `.btn-primary` = `bg-white text-neutral-900` hover amber-600, `.btn-secondary` = `bg-transparent text-white border-white/20`, `.btn-ghost` = `text-neutral-400` hover white
- **Header:** `bg-black/80 backdrop-blur-xl border-white/5`, active borders `border-amber-500`
- **Cards/surfaces:** `bg-surface` (#121212), borders `border-white/[0.08]`
- **Text hierarchy:** Headlines `text-neutral-100`, body `text-neutral-400`, meta `text-neutral-500`
- **Hover states:** `hover:text-white`, `hover:bg-white/5`
- **Form inputs:** `bg-neutral-900 border-white/20 text-white`, focus `border-amber-500`
- **Article prose:** `prose-invert` on all prose containers
- **Admin pages:** uniform `bg-surface`, table headers `bg-neutral-800`
- **DO NOT touch:** email templates (must stay light for mail clients)

### Homepage Hero ("Cinematic Dark Mode")
- **Background:** `bg-black` base + `radial-gradient(ellipse at top, rgba(30,30,30,1), rgba(0,0,0,1) 70%)` overlay for tonal depth (CSS-only, no image asset)
- **FLANEUR:** `text-6xl md:text-7xl lg:text-8xl` Cormorant Garamond serif, `tracking-[0.3em]`
- **Tagline:** `tracking-[0.5em] uppercase`, `text-sm md:text-base`, neutral-400
- **Animations:** Staggered `heroFadeIn` keyframes in `globals.css` - 1.5s ease-out with 0.3s delays between elements (logo, tagline, stats, rule)
- **Padding:** `py-28 md:py-36 lg:py-48` for cinematic breathing room

### NeighborhoodHeader (Feed Page)
- **Masthead:** Centered `text-center py-10` with back arrow absolute top-left (`← NEW YORK`), city label (`text-[11px] tracking-[0.3em] uppercase text-neutral-400`), serif neighborhood name (`font-display text-4xl md:text-5xl text-neutral-100`), italic combo sub-line, and `NeighborhoodLiveStatus` (local time + weather)
- **NeighborhoodLiveStatus:** `font-mono text-sm tracking-widest text-amber-500/90` centered below H1. Format: `[Time] -- [Temp Description]`. US = 12h + °F, rest = 24h + °C. Animated colon (`animate-pulse-slow` 2s). Weather from Open-Meteo (client-side, silent fail). Props threaded: page.tsx → NeighborhoodFeed → NeighborhoodHeader.
- **Control Deck:** `border-y border-white/10 py-4` toolbar with two zones: GUIDE/MAP/HISTORY links (center), ViewToggle icons (right). Left zone is empty spacer.
- **Combo dropdowns:** Dropdown panel: `bg-surface border border-white/[0.08] shadow-sm rounded py-2 min-w-[160px]`, items `hover:text-white hover:bg-white/5`
- **ViewToggle:** Minimal `w-8 h-8` icons, no pill background. Active: `text-white`, inactive: `text-neutral-300`
- **BriefArchive:** Removed from control deck (prop still accepted but no longer passed)
- **Back arrow:** Links to multi-feed if user has neighborhoods selected, otherwise home. Text: city slug uppercased.
- **ComboNeighborhoodCards:** Still exists for GuidesClient.tsx but removed from feed header

### Font Sizes (17px iOS Baseline)
- Body: 17px, Headlines: 20-22px, Metadata: 10-12px, Masthead: 30px
- Website: `text-base`/`text-lg` body, `prose prose-lg` for articles

## Project Structure

```
src/
├── app/
│   ├── [city]/[neighborhood]/     # Feed, articles, guides
│   ├── admin/                     # Cron monitor, ads, news-coverage, images
│   ├── saved/                     # Saved/bookmarked stories page
│   ├── settings/                  # User location preferences
│   ├── email/preferences/         # Email topic management
│   ├── advertise/                 # Booking calendar, success, upload pages
│   ├── proofs/[token]/            # Customer ad proof page
│   └── api/
│       ├── cron/                  # 30+ automated cron jobs
│       ├── admin/                 # Admin APIs
│       ├── ads/                   # Availability, checkout, upload, booking-info
│       ├── reactions/             # Emoji reactions API + saved articles
│       ├── email/                 # Unsubscribe, preferences, sunday-edition-request
│       ├── internal/              # Image generation, resend
│       └── webhooks/              # Resend inbound
├── config/
│   ├── ad-tiers.ts                # Flat per-day rates, tiers & seasonal rules
│   ├── ad-config.ts               # Ad collections (3 tiers)
│   ├── global-locations.ts        # City configs, vocabulary, zones
│   └── nyc-locations.ts           # NYC zip/precinct mappings
└── lib/
    ├── adapters/                  # 13 city adapters (permits, liquor, safety)
    ├── cron-monitor/              # Self-healing system
    ├── email/                     # Scheduler, assembler, sender, templates
    ├── location/                  # IP detection, timezone resolution
    ├── combo-utils.ts             # Combo neighborhood queries
    ├── rss-sources.ts             # RSS feed aggregation (DB + hardcoded fallback)
    ├── search-aliases.ts          # Country/region/state search aliases
    ├── geo-utils.ts               # Haversine distance + sorting
    ├── grok.ts                    # Grok X Search integration
    ├── brief-enricher-gemini.ts   # Gemini enrichment pipeline
    ├── weekly-brief-service.ts    # Sunday Edition generation
    └── ad-quality-service.ts      # AI ad review pipeline
```

## Environment Variables

**Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `CRON_SECRET`
**Optional:** `GEMINI_API_KEY`, `GROK_API_KEY`, `OPENAI_API_KEY`, `RESEND_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `SENTRY_AUTH_TOKEN`

## Key Database Tables

- `neighborhoods` — 200 neighborhoods (Flaneur 200) with coordinates, region, country, `is_combo`
- `combo_neighborhoods` — join table for combo components
- `articles` — news articles with AI images (`enriched_at`, `enrichment_model`)
- `neighborhood_briefs` — Grok-generated daily summaries
- `weekly_briefs` — Sunday Edition content (rearview, horizon, holiday, data_point)
- `ads` — ad campaigns with booking fields (stripe_session_id, customer_email, is_global_takeover) and quality control (proof_token, approval_status, ai_quality_score)
- `house_ads` — fallback ads (types: waitlist, app_download, advertise, newsletter, sunday_edition)
- `article_reactions` — emoji reactions (bookmark/heart/fire), anonymous + authenticated
- `cron_executions` / `cron_issues` — monitoring & self-healing
- `daily_brief_sends` / `weekly_brief_sends` — email dedup (weekly: unique on `recipient_id, neighborhood_id, week_date`)
- `profiles` — user prefs (primary_city, primary_timezone, paused_topics)
- `newsletter_subscribers` — timezone, paused_topics
- `rss_sources` — RSS feed URLs by city (192 feeds across 92 cities, 100% coverage)

## Deployment

```bash
git push origin master    # Deploy (then promote in Vercel dashboard)
npx supabase db push --include-all --yes  # Run migrations
```

## MCP Servers

Supabase, Vercel, Playwright, Supermemory, Frontend Design, Resend, Stripe, Sentry
