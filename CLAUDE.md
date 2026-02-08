# Flaneur Web

> **User Location:** Stockholm, Sweden (CET/CEST timezone)
> **Full changelog:** `docs/CHANGELOG.md` (read only when needed)
> **Mobile app:** `../flaneur/CLAUDE.md`

## What's Live

- **Website:** https://readflaneur.com
- **Backend API:** https://flaneur-azure.vercel.app
- **GitHub:** https://github.com/morgandowney-droid/readflaneur-web
- **Sentry:** https://sentry.io/organizations/flaneur-vk/issues/
- **128 neighborhoods** across 38 cities (15 combo neighborhoods)

## Last Updated: 2026-02-08

Recent work: Multi-neighborhood ad booking (select N neighborhoods, one Stripe checkout), advertise page polish (17px fonts, rounded corners, price alignment), combo component search.

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
- **Sunday Edition:** `src/lib/weekly-brief-service.ts` — Gemini + Grok
- **Weather:** Pure logic in `src/lib/email/weather-story.ts` (no LLM)
- **US neighborhoods:** °F primary. Determined by `neighborhoods.country`
- **Instant resend:** `src/lib/email/instant-resend.ts` (3/day limit)
- **Layout:** Primary stories use compact `StoryList variant="primary"` (19px/16px), no hero image

### Ad System
- **Pricing:** `src/config/ad-tiers.ts`, `src/lib/PricingService.ts` — flat per-day rates (Tier 1: $500/$750, Tier 2: $200/$300, Tier 3: $100/$150)
- **Booking:** `/advertise` page with `react-day-picker` calendar → Stripe Checkout → asset upload → AI review
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
- **Multi-neighborhood:** Calendar shows merged availability, pills UI for selection, combo component search (e.g. "FiDi" finds Tribeca)
- **Double-booking prevention:** unique composite index on `(neighborhood_id, placement_type, start_date)`
- **Stripe session:** `stripe_session_id` shared across N ads from same checkout (not unique)
- **Global takeover:** $10,000/day or $15,000/Sunday, contact-only (`ads@readflaneur.com`)
- **Storage:** `ad-assets` Supabase bucket for uploaded ad images

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

### Gemini Prompts
JSON examples override prose instructions. If prompt says "Don't use AQI" but example shows `"AQI 42"`, Gemini follows the example.

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
    ├── grok.ts                    # Grok X Search integration
    ├── brief-enricher-gemini.ts   # Gemini enrichment pipeline
    ├── weekly-brief-service.ts    # Sunday Edition generation
    └── ad-quality-service.ts      # AI ad review pipeline
```

## Environment Variables

**Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `CRON_SECRET`
**Optional:** `GEMINI_API_KEY`, `GROK_API_KEY`, `OPENAI_API_KEY`, `RESEND_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `SENTRY_AUTH_TOKEN`

## Key Database Tables

- `neighborhoods` — 128 neighborhoods with coordinates, region, country, `is_combo`
- `combo_neighborhoods` — join table for combo components
- `articles` — news articles with AI images (`enriched_at`, `enrichment_model`)
- `neighborhood_briefs` — Grok-generated daily summaries
- `weekly_briefs` — Sunday Edition content (rearview, horizon, holiday, data_point)
- `ads` — ad campaigns with booking fields (stripe_session_id, customer_email, is_global_takeover) and quality control (proof_token, approval_status, ai_quality_score)
- `house_ads` — fallback ads (types: waitlist, app_download, advertise, newsletter, sunday_edition)
- `article_reactions` — emoji reactions (bookmark/heart/fire), anonymous + authenticated
- `cron_executions` / `cron_issues` — monitoring & self-healing
- `daily_brief_sends` / `weekly_brief_sends` — email dedup
- `profiles` — user prefs (primary_city, primary_timezone, paused_topics)
- `newsletter_subscribers` — timezone, paused_topics
- `rss_sources` — RSS feed URLs by city

## Deployment

```bash
git push origin master    # Deploy (then promote in Vercel dashboard)
npx supabase db push --include-all --yes  # Run migrations
```

## MCP Servers

Supabase, Vercel, Playwright, Supermemory, Frontend Design, Resend, Stripe, Sentry
