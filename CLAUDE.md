# Flaneur Web

> **User Location:** Stockholm, Sweden (CET/CEST timezone)
> **Full changelog:** `docs/CHANGELOG.md` (read only when needed)
> **Mobile app:** `../flaneur/CLAUDE.md`

## What's Live

- **Website:** https://readflaneur.com
- **Backend API:** https://flaneur-azure.vercel.app
- **GitHub:** https://github.com/morgandowney-droid/readflaneur-web
- **Sentry:** https://sentry.io/organizations/flaneur-vk/issues/
- **270 neighborhoods** across 91 cities, 42 countries

## Last Updated: 2026-02-12

Recent work: Community neighborhoods (user-created neighborhoods with AI validation + full brief pipeline), "Create Your Own Neighborhood" house ad, community neighborhoods TypeScript fixes (openModal signature, GlobalRegion exhaustiveness), global 5-email-per-day limit, always-resend on primary neighborhood change, Vercel preview build fix (lazy-init Supabase admin in 6 routes), Hamptons component renames (removed redundant suffix), brief content sanitization fixes (nested-paren URLs, URL-encoded artifacts), neighborhood selector tidy (renames, region consolidation, new neighborhoods), single-line feed headlines, enrichment language/framing fixes, brighter brief section headings, "Suggest a Neighborhood" house ad + contact form + admin page, dynamic house ads ("Check Out a New Neighborhood" with discovery brief links), Add to Collection CTA on article pages, bare /feed redirect, Grok search result sanitization, Sunday Edition holidays expanded (19 → 50 across 20 countries), tracked referral system, primary neighborhood sync, Gemini model switch (2.5-pro), feed article dedup, engagement-triggered email capture, smart auto-redirect.

### Email Capture (Engagement-Triggered)
- **Trigger:** `flaneur-article-reads` localStorage counter incremented in `ArticleViewTracker`. Threshold: 3 reads.
- **Placement 1 - Feed inline:** `EmailCaptureCard` injected after 5th article via `injectEmailPrompt()` in `ad-engine.ts`. "Get {neighborhood} stories in your inbox" + email input. Dismiss stores `flaneur-email-prompt-dismissed`.
- **Placement 2 - Article page:** `PostReadEmailCapture` after `ArticleReactions`. Compact inline: "Enjoying {neighborhood} stories? Get them daily."
- **Placement 3 - Return visit:** `ReturnVisitPrompt` in global layout. `flaneur-session-count` incremented once per session (sessionStorage guard). Shows slide-up toast on 2nd+ session with 3+ reads. Auto-dismisses after 10s unless interacted.
- **All prompts:** Hidden when `flaneur-newsletter-subscribed` = `'true'` or `flaneur-email-prompt-dismissed` = `'true'`. Posts to `/api/newsletter/subscribe` with neighborhoodIds from localStorage.
- **New localStorage keys:** `flaneur-article-reads` (number), `flaneur-email-prompt-dismissed` ('true'), `flaneur-session-count` (number)

### Smart Redirect (New Visitor Flow)
- **Returning users:** Inline `<script>` in `layout.tsx` reads localStorage and redirects to `/feed` before React hydration (no homepage flash)
- **New users:** `SmartRedirect` component on homepage calls `/api/location/detect-and-match` → IP geolocation → 4 nearest neighborhoods → saves to localStorage → redirects to `/feed?welcome={city}`
- **API:** `src/app/api/location/detect-and-match/route.ts` — uses `detectLocationFromIP()` + Haversine sort against all active non-combo neighborhoods
- **WelcomeBanner:** `src/components/feed/WelcomeBanner.tsx` — "Viewing stories near {city}. Customize" with dismiss X. Strips `welcome` param on dismiss. Stores dismissal in localStorage.
- **Discover page:** `/discover` — full homepage experience without auto-redirect, for direct browsing
- **Session guard:** `sessionStorage` flag prevents detection loops on failure
- **5s timeout:** AbortController on fetch, silent fail shows normal homepage

### Auth (Pre-Launch)
- **OAuth hidden:** Google & Apple login buttons hidden on `/login` and `/signup` pages. Code is fully implemented and ready to re-enable (just uncomment the OAuth button sections).
- **Current auth:** Email/password only via Supabase Auth
- **OAuth callback routes:** Both `/auth/callback` and `/api/auth/callback` are intact and working

### Tracked Referral System
- **Invite page:** `/invite` - mirrors homepage hero + `HomeSignupEnhanced` + `InviteEmailCapture`. No `SmartRedirect` (visitors must see the page).
- **Referral link:** `/invite?ref=CODE` - hero shows "A friend invited you to" above FLANEUR. Code stored in `sessionStorage` (`flaneur-referral-code`).
- **Referral codes:** 8-char alphanumeric (no ambiguous chars), lazy-generated on first access via `generate_referral_code()` Postgres function. Unique across `profiles.referral_code` and `newsletter_subscribers.referral_code`.
- **API endpoints:**
  - `GET /api/referral/code` - get or generate code (session auth or email+token)
  - `POST /api/referral/track` - record click (fire-and-forget, IP hash dedup within 24h)
  - `POST /api/referral/convert` - record conversion (fire-and-forget, self-referral prevention)
  - `GET /api/referral/stats` - return `{ code, clicks, conversions }` for share widget
- **Conversion flow:** Subscribe on invite page -> `POST /api/newsletter/subscribe` -> `POST /api/referral/convert` (fire-and-forget). Updates existing click row to `converted` status, or creates direct conversion if no click row exists.
- **Share surfaces:**
  - Email footer: "Share Flaneur" link (between "Manage preferences" and "Unsubscribe") in Daily Brief (`Footer.tsx`) and Sunday Edition (inline footer). Only shown when recipient has a referral code.
  - ContextSwitcher: "Invite a Friend" item at bottom of dropdown (via `ShareWidget` compact mode). Only shown if `flaneur-newsletter-subscribed` is set.
  - `ShareWidget` (`src/components/referral/ShareWidget.tsx`): Fetches code from `/api/referral/code`, caches in localStorage (`flaneur-referral-code`). Uses `navigator.share()` on mobile, clipboard copy on desktop.
- **Scheduler integration:** `src/lib/email/scheduler.ts` fetches `referral_code` from both `profiles` and `newsletter_subscribers`, lazy-generates if null. Passed via `EmailRecipient.referralCode` to templates.
- **Database:** `referrals` table (referral_code, referrer_type/id, referred_email/type/id, status clicked/converted, ip_hash, timestamps). RLS: service_role only. Unique index on `(referral_code, referred_email) WHERE status = 'converted'`.
- **localStorage keys:** `flaneur-referral-code` (user's own code, cached by ShareWidget)
- **sessionStorage keys:** `flaneur-referral-code` (incoming referral code from `?ref=` param, consumed on conversion)

### Suggest a Neighborhood
- **House ad:** `house_ads` where `type = 'suggest_neighborhood'`, headline "Suggest a Neighborhood", click_url `#suggest` (handled inline, not navigated)
- **Shared form:** `src/components/NeighborhoodSuggestionForm.tsx` - client component with `compact` (house ad inline) and `full` (contact page) variants. Suggestion text + optional email + submit.
- **FallbackAd integration:** `HouseAdDisplay` handles `suggest_neighborhood` type - renders "Suggest" button that toggles inline form (not a link). Both card and story_open variants.
- **Contact page:** `/contact` includes "Suggest a Neighborhood" section with full-variant form
- **API endpoint:** `POST /api/suggestions/neighborhood` - validates (3-200 chars), SHA-256 IP hash, rate limit 5/hour per IP, detects city/country from Vercel headers, inserts to `neighborhood_suggestions` table
- **Email notification:** `notifyNeighborhoodSuggestion()` in `email.ts` sends to `contact@readflaneur.com`
- **Neighborhood selector modal:** `NeighborhoodSelectorModal.tsx` "Suggest a Destination" wired to API endpoint (was direct Supabase insert that silently failed due to RLS). Optional email field added. Both placements: bottom of city list + empty search state.
- **Admin page:** `/admin/suggestions` - stats row, filter tabs (all/new/reviewed/added/dismissed), table with inline notes editing and status actions
- **Admin API:** `GET/PATCH /api/admin/suggestions` - admin role auth, service role DB access

### Community Neighborhoods (User-Created)
- **Limit:** 2 per authenticated user
- **Create endpoint:** `POST /api/neighborhoods/create` (maxDuration=300) - auth, limit check, Gemini Flash AI validation (verifies real neighborhood, normalizes name/city/country/region/timezone/coordinates), duplicate detection (exact ID + 500m Haversine proximity), insert, pipeline, instant resend
- **Pipeline:** Runs synchronously after insert with 240s time budget. Each step is try/catch (graceful degradation - crons fill gaps):
  1. Grok brief generation (`generateNeighborhoodBrief()`)
  2. Gemini enrichment (`enrichBriefWithGemini()`)
  3. Article creation (same schema as `generate-brief-articles` cron)
  4. Image generation (via `/api/internal/generate-image`)
- **Count endpoint:** `GET /api/neighborhoods/my-community-count` - returns `{ count }` for limit UI
- **DB columns:** `neighborhoods.is_community` (boolean), `neighborhoods.created_by` (UUID), `neighborhoods.community_status` ('active'|'removed')
- **Region:** All community neighborhoods use `region: 'community'`
- **ID format:** `generateCommunityId(city, name)` - deterministic slug (e.g., `paris-montmartre`)
- **Shared utilities:** `src/lib/community-pipeline.ts` - `generateCommunityId()`, `generateBriefArticleSlug()`, `generatePreviewText()`
- **Neighborhood selector:** "All Neighborhoods" | "Community" tab toggle. Community tab has create form (text input + button with validating/generating status states), count display, community neighborhood list grouped by city. "Community" badge on community neighborhoods in All tab.
- **Modal tab param:** `openModal('community')` opens directly to Community tab (used by house ad)
- **House ad:** `community_neighborhood` type in `house_ads` - "Create Your Own Neighborhood" with "Get Started" button. Opens modal to Community tab. Hidden via `flaneur-has-community-neighborhood` localStorage once user has created one.
- **Success message:** "You will receive a daily brief for {name} at 7am local time starting tomorrow."
- **Admin:** `/admin/community-neighborhoods` page + `GET/PATCH /api/admin/community-neighborhoods` - list all, remove/restore (toggles `community_status` + `is_active`)
- **Neighborhoods API:** Filters out `community_status = 'removed'` neighborhoods
- **localStorage keys:** `flaneur-has-community-neighborhood` ('true' after first creation)

### Dynamic House Ads ("Check Out a New Neighborhood")
- **DB record:** `house_ads` where `type = 'app_download'` updated: headline "Check Out a New Neighborhood", body "See what's happening today in a nearby neighborhood.", click_url `/discover` (static fallback)
- **Shared utility:** `src/lib/discover-neighborhood.ts` - `findDiscoveryBrief(supabase, subscribedIds, referenceNeighborhoodId)` returns `{ url, neighborhoodName }` or null
- **Logic:** Fetches active non-combo neighborhoods, filters out subscribed, sorts by Haversine distance from reference neighborhood, finds first with a published Daily Brief article
- **Email integration:** `src/lib/email/ads.ts` - `getHouseAd()` accepts `subscribedIds`/`primaryNeighborhoodId`, resolves dynamic URL for `app_download` type via `findDiscoveryBrief()`
- **Web integration:** `HouseAdDisplay` in `FallbackAd.tsx` - `useEffect` reads localStorage prefs, fetches `/api/discover-neighborhood?subscribedIds=...&referenceId=...`, updates click URL from `/discover` to resolved brief URL
- **API endpoint:** `GET /api/discover-neighborhood` - public, no auth, calls `findDiscoveryBrief()`, returns `{ url, neighborhoodName }` or `{ url: "/discover" }` fallback

### Add to Collection CTA (Article Pages)
- **Component:** `AddToCollectionCTA` (private, inline in `FallbackAd.tsx`) - shows "Add {neighborhoodName} to Your Collection" on article bottom ad slot when the neighborhood is not in user's collection
- **Props:** `articleNeighborhoodId` and `articleNeighborhoodName` passed from article page to bottom `FallbackAd` only
- **Logic:** `useEffect` checks `flaneur-neighborhood-preferences` localStorage. If neighborhood already present, returns null (normal fallback renders). On click: adds to localStorage array, fires `POST /api/neighborhoods/add` (fire-and-forget DB sync), shows success state.
- **API endpoint:** `POST /api/neighborhoods/add` - accepts `{ neighborhoodId }`, uses `getSession()` auth. Authenticated: inserts into `user_neighborhood_preferences` (with next sort_order). Anonymous: returns success (localStorage-only).
- **Placement:** Bottom ad slot only on article pages (`position="bottom"`). Top slot remains normal house ad/fallback.

## Key Patterns

### Primary Neighborhood Sync
- **Endpoint:** `POST /api/location/sync-primary-neighborhood` - syncs primary neighborhood change to DB for email scheduler
- **Called from:** `useNeighborhoodPreferences.setPrimary()` (fire-and-forget, covers ContextSwitcher, modal, drag-reorder)
- **Logic:** Uses `getSession()` (not `getUser()`), looks up neighborhood city, updates `profiles.primary_city`/`primary_timezone`, triggers instant resend on any primary change (same city or different)
- **Anonymous users:** Silent no-op (returns success)

### Cron Jobs
- All in `src/app/api/cron/[job-name]/route.ts`
- Auth: `x-vercel-cron` header or `CRON_SECRET`
- **MUST** log to `cron_executions` table
- Use `maxDuration = 300` for long-running jobs
- Use time budgets to ensure logging completes in `try/finally`

### Article Deduplication (sync-news)
- **RSS articles:** Deterministic `generateSlug()` (djb2 hash, no timestamp) + source URL check in `editor_notes`
- **Grok articles:** Headline similarity check (first 40 chars, same neighborhood, last 24h) + deterministic slug
- **Fashion week:** Slug includes day number; prompt requires "Day N" in headline with day-specific angle

### Gemini Enrichment (enrich-briefs)
- **Schedule:** `*/15`, batch size 30, concurrency 4, Phase 1 budget 200s
- **Backoff:** Exponential retry on 429/RESOURCE_EXHAUSTED (2s, 5s, 15s delays)
- **Early termination:** Drains queue if any batch call hits quota
- **Two phases:** Phase 1 = briefs (200s budget), Phase 2 = articles (remaining ~80s)
- **Greeting:** Prompt explicitly requires "Good morning" (never evening/afternoon) since briefs are delivered in the morning regardless of enrichment time
- **Language:** Prompt requires English output with local language terms sprinkled in naturally (Swedish greetings, French venue names, etc.). Prevents Gemini from writing entirely in the local language when searching local-language sources.
- **Daily framing:** Prompt explicitly states "This is a DAILY update" and prohibits weekly/monthly framing ("another week", "this week's roundup")

### Brief Generation Timezone Handling (sync-neighborhood-briefs)
- **Morning window:** 3-9 AM local time (24 chances at `*/15`, survives 5h cron gaps)
- **Dedup:** `hasBriefForLocalToday()` uses `toLocaleDateString('en-CA', { timeZone })` per neighborhood
- **NOT UTC midnight:** Fetches last 36h of briefs, checks each against its local "today"
- **Content sanitization:** Both `grok.ts` and `NeighborhoodBrief.cleanContent()` strip raw Grok search result objects (`{'title': ..., 'url': ...}`) that occasionally leak into brief text

### Image Generation
- Endpoint: `/api/internal/generate-image`
- Model: `gemini-3-pro-image-preview` (via `AI_MODELS.GEMINI_IMAGE`)
- Style: Watercolor/gouache illustrations, NOT photographs
- Cached images: `src/lib/cron-images.ts` (22 categories)

### Email System
- **Scheduler:** `src/lib/email/scheduler.ts` — 7 AM local time per recipient
- **Assembler:** `src/lib/email/assembler.ts` — articles + weather, dateline in category labels
- **Sender:** `src/lib/email/sender.ts` — React Email via Resend
- **Sunday Edition:** `src/lib/weekly-brief-service.ts` — Gemini + Grok. Sections: The Letter, The Next Few Days, That Time of Year, Data Point, Your Other Editions
- **Holiday system:** 50 holidays across 20 countries. Local holidays listed before global so `detectUpcomingHoliday()` prioritizes them (e.g., Lunar New Year over Valentine's Day for Singapore). Fixed-date and nth-weekday holidays use calculation; lunar/Islamic/Hebrew/Hindu holidays use lookup tables (2025-2030). Regions: East Asian (CNY, Mid-Autumn, Dragon Boat), Japanese (Golden Week, Obon, Coming of Age), Islamic (Eid al-Fitr, Eid al-Adha), Jewish (Passover, Rosh Hashanah, Yom Kippur, Hanukkah), Indian (Diwali, Vesak), European national days, South African, UAE National Day, plus existing Western holidays.
- **Weather:** Pure logic in `src/lib/email/weather-story.ts` (no LLM)
- **Hero block:** `{neighborhood} · {city}` (12px tracked caps) + temperature (48px Playfair Display) + weather description - merged as one centered visual thought, no label
- **Temperature:** Single-unit: °F for USA, °C for everyone else. Sunday Edition data point same logic.
- **US neighborhoods:** °F only. Determined by `neighborhoods.country`
- **Instant resend:** `src/lib/email/instant-resend.ts` (3/day resend limit)
- **Global daily email limit:** `src/lib/email/daily-email-limit.ts` - max 5 content emails per recipient per day (UTC), checked across `daily_brief_sends` + `weekly_brief_sends`. Wired into daily brief sender, instant resend, Sunday Edition cron, and on-demand Sunday Edition request. Transactional emails (password reset, ad confirmations) are exempt.
- **Layout:** Primary stories use compact `StoryList variant="primary"` (19px/16px), no hero image. Native ad between stories 1 and 2.
- **Section headers:** Always `{neighborhood} · {city}` - no smart geography hiding. City in muted `#b0b0b0`.
- **Section dividers:** `SectionDivider` component - centered wide-tracked uppercase `{name} · {city}` + 32px gold accent rule (`rgba(120, 53, 15, 0.4)`)
- **Truncation:** `truncateAtWord()` helper (120 chars) + CSS `-webkit-line-clamp: 2` for preview text
- **Typography:** Playfair Display via Google Fonts `@import` (Apple Mail renders; Gmail falls back to Georgia serif). All headlines, masthead, temperature use serif.
- **Masthead:** "FLANEUR" is a clickable link to `readflaneur.com` in both Daily Brief (`Header.tsx`) and Sunday Edition templates. Styled to match surrounding text (no underline).
- **Ad fallback:** `src/lib/email/ads.ts` - paid ads first, then random house ad from `house_ads` table. `app_download` type resolves dynamic discovery brief URL via `findDiscoveryBrief()`. NativeAd supports body text, centered layout. Image wrapped in `{ad.imageUrl && (...)}` to prevent alt text rendering as blue link when no image exists.
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
- **Header modal:** `NeighborhoodSelectorModal.tsx` — "City Search" dark glassmorphism UI (`bg-neutral-900/90 backdrop-blur-md`), CSS columns masonry layout, text-based items (not pills), amber accent system for selected/vacation/enclave, toggle select/deselect per city, "Change Primary" link in header (scrolls to + highlights primary), "Clear all" with two-tap confirmation in footer, slide-up + backdrop-fade animations. Mobile: `inset-x-0 top-2 bottom-0` (full-bleed bottom) with `pb-[max(1rem,env(safe-area-inset-bottom))]` on footer for iOS safe area. Settings section (city dropdown + detect + save) above footer. `handleExplore()` uses localStorage order (primary-first).
- **Settings in modal:** City/timezone settings merged into neighborhood modal (compact row above footer). Settings links removed from Header nav (desktop + mobile). `/settings` page still accessible via direct URL.
- **Accent-insensitive search:** NFD normalization strips diacritical marks — "ostermalm" matches "Östermalm"
- **Alias suppression:** when query matches a country/region/state alias, loose substring matches are suppressed (prevents "US" matching "Justicia")
- **Sort by nearest:** "Sort by nearest to me" button below search input, geolocation-based sorting
- **Sort by region:** "Sort by region" button next to nearest — groups cities into geographic sections (North America, South America, Europe, Middle East, Asia & Pacific) with headers. Toggles to "Sort alphabetically" when active. Vacation/enclave regions mapped to geographic parent.
- **Timezone tooltip:** "Change my Timezone" button shows hover tooltip explaining it controls 7am email delivery time

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
- **API token:** `SENTRY_AUTH_TOKEN` in `.env.local` (read-only scope — can query issues but cannot resolve them; needs `event:write` for mutations)

### AI Model Management
- **Central config:** `src/config/ai-models.ts` - all model IDs in one place
- **Automated checker:** `src/app/api/cron/check-ai-models/route.ts` - monthly cron (1st at 9 AM UTC)
  - Phase 1: Gemini `models.list` API - checks our models exist + finds newer versions
  - Phase 2: Grok web search (3 queries, one per provider) for releases/deprecations
  - Creates `model_update_available` issues in `cron_issues` for admin review
  - Cost: ~$0.015/month
- **Provider docs:** [Anthropic](https://docs.anthropic.com/en/docs/about-claude/models), [Gemini](https://ai.google.dev/gemini-api/docs/models), [xAI/Grok](https://docs.x.ai/developers/models)
- **Current models:** Claude Sonnet 4.5, Gemini 2.5 Flash, Gemini 2.5 Pro (enrichment/weekly briefs), Gemini 3 Pro Image (image gen), Grok 4.1 Fast
- **Import pattern:** `import { AI_MODELS } from '@/config/ai-models'` then use `AI_MODELS.GEMINI_FLASH` etc.
- **Cron metadata:** DB `ai_model` fields use short names (`'gemini-2.5-flash'`, `'claude-sonnet-4-5'`) not full version IDs

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

### overflow-x: hidden Breaks Sticky Positioning
CSS spec: setting `overflow-x: hidden` forces `overflow-y: auto` (can't mix `hidden` with `visible`). This creates a scrolling context that captures `position: sticky` elements, breaking their viewport-relative behavior. **Use `overflow-x: clip` instead** — clips without creating a scrolling context. Applied in `globals.css` on `<main>`.

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
- **Mode prop:** `mode: 'single' | 'all'` (default `'single'`). Controls masthead content and control deck layout.
- **Masthead (single):** Centered `text-center pt-8`. City label, serif neighborhood name, italic combo sub-line, `NeighborhoodLiveStatus` with `mb-8`.
- **Masthead (all):** Centered `text-center pt-6`. "My Neighborhoods" heading (clickable - opens NeighborhoodSelectorModal) + "{N} locations" subtitle when no pill active. When a pill is active: city + combo components on one line (dot separator), Maps/History links, LiveStatus. Subtitle conditionally rendered (not fixed-height invisible).
- **Maps/History links (all mode):** Small grey dotted-underline links (`text-xs text-neutral-500 decoration-dotted`) under neighborhood name. Only shown when a specific pill is active. Same URLs as single-mode MAP/HISTORY.
- **NeighborhoodLiveStatus:** `font-mono text-xs font-medium tracking-[0.2em] text-amber-600/80`. Clickable - Google weather. Accepts `initialWeather` prop for server-side pre-fetch (skips client fetch when provided).
- **Control Deck:** CSS Grid `grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]` for overflow-safe centering. Left: `<ContextSwitcher>` (truncates long names), Center: GUIDE/MAP/HISTORY with `shrink-0` (single) or empty (all), Right: ViewToggle.
- **ContextSwitcher:** `src/components/feed/ContextSwitcher.tsx` - dropdown trigger (`{LABEL} ▾`, truncated `max-w-[80px] md:max-w-[200px]`) + popover (`bg-[#121212] border-white/10 w-64 z-30`). Sections: "All Neighborhoods" (layers icon), neighborhood list (dot + name + city + primary badge + "Set primary" on hover), "Customize List..." (opens modal), "Invite a Friend" (via ShareWidget, shown only to subscribers). Click-outside + Escape close.
- **useNeighborhoodPreferences:** `src/hooks/useNeighborhoodPreferences.ts` - reads localStorage IDs, fetches name/city from Supabase, cross-tab sync via `storage` event. Exposes `primaryId` and `setPrimary(id)` to reorder localStorage array.
- **Primary neighborhood:** First item in localStorage array. Indicated across ContextSwitcher (amber dot + "PRIMARY" label), MultiFeed pill bar, HomeSignupEnhanced chips, and NeighborhoodSelectorModal. Users can change primary via "Set primary" actions.
- **Combo dropdowns:** `bg-surface border-white/[0.08]`, items `hover:text-white hover:bg-white/5`
- **ViewToggle:** Minimal `w-8 h-8` icons, no pill background. Active: `text-white`, inactive: `text-neutral-300`
- **DailyBriefWidget:** Renders between Control Deck and FeedList (passed as `dailyBrief` ReactNode prop to `NeighborhoodFeed` or `MultiFeed`). Spacing: `mt-8 mb-12`. Section headings in brief cards use `text-neutral-200` (brighter than body `text-neutral-400`). Brief headline is single-line (`whitespace-nowrap overflow-hidden`).
- **MultiFeed integration:** `MultiFeed` now uses `<NeighborhoodHeader mode="all">` instead of standalone header. Accepts `dailyBrief` and `initialWeather` props. Passes `comboComponentNames` for combo subtitle. Pill filter switches the daily brief dynamically - fetches brief from `neighborhood_briefs` table client-side per neighborhood, with skeleton loading state.
- **MultiFeed render order:** Pills render BEFORE masthead for vertical stability. Sticky `top-[60px]` pills no longer jump when masthead height changes between "My Neighborhoods" and specific neighborhood details.
- **Drag-to-reorder pills:** Neighborhood pills are `draggable` with HTML5 drag-and-drop. On drop: reorders localStorage, navigates with new URL order. First pill = primary. Visual: dragged pill `opacity-50`, drop target amber left border, `cursor-grab`/`cursor-grabbing`.
- **ContextSwitcher setPrimary navigation:** `handleSetPrimary` now navigates with reordered IDs after calling `setPrimary()`, so MultiFeed reflects new primary immediately.
- **Shared slug utils:** `getCitySlugFromId()` and `getNeighborhoodSlugFromId()` in `neighborhood-utils.ts` replace duplicate helpers in MultiFeed, ComboNeighborhoodCards, feed/page.
- **ComboNeighborhoodCards:** Still exists for GuidesClient.tsx but removed from feed header

### Article Page Navigation
- **Back link:** `← ALL STORIES` at top, links to `/feed`
- **Bottom CTA:** `MORE STORIES` button, also links to `/feed`
- **Bare /feed redirect:** Both links go to bare `/feed` (no query params). `MultiFeed` detects empty `neighborhoods` prop, reads localStorage, and does `router.replace()` with neighborhoods + `scrollTo(0,0)`. Covers any path to bare `/feed` (back links, bookmarks, direct URL).
- **No neighborhood-specific links:** Article pages are entry points from shared links too - `/feed` loads the user's own neighborhood set regardless of which neighborhood the article belongs to

### Article Body Typography ("Effortless Legibility")
- **Font:** Merriweather (Google Fonts, screen-optimized serif) via `--font-body-serif` CSS variable, fallback Georgia/Times New Roman
- **Size:** Mobile `text-[1.2rem]` (~19px), Desktop `text-[1.35rem]` (~22px) - WSJ/New Yorker scale
- **Line height:** `leading-loose` (2x) - white on black needs more space to avoid bloom
- **Color:** `text-neutral-200` (off-white, never pure #FFFFFF on dark)
- **Paragraph spacing:** `mb-8` between paragraphs
- **Links:** Academic "invisible link" style - `text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4`, hover: `decoration-solid decoration-neutral-300/60`. Applied globally: ArticleBody, NeighborhoodBrief, EnrichedNeighborhoodBrief, SourceAttribution. No amber/blue link colors anywhere.
- **Bold:** `font-bold text-neutral-100`
- **Section headers:** `text-xl font-semibold text-neutral-100 mt-10 mb-6` in Merriweather

### Font Sizes (General)
- Feed body: 17px, Feed headlines: 20-22px (single-line, `whitespace-nowrap overflow-hidden`, no ellipsis), Metadata: 10-12px, Masthead: 30px
- Article body: 19-22px Merriweather serif

## Project Structure

```
src/
├── app/
│   ├── [city]/[neighborhood]/     # Feed, articles, guides
│   ├── discover/                   # Homepage without auto-redirect
│   ├── invite/                    # Referral invite landing page
│   ├── admin/                     # Cron monitor, ads, news-coverage, images
│   ├── saved/                     # Saved/bookmarked stories page
│   ├── settings/                  # User location preferences
│   ├── email/preferences/         # Email topic management
│   ├── advertise/                 # Booking calendar, success, upload pages
│   ├── proofs/[token]/            # Customer ad proof page
│   └── api/
│       ├── cron/                  # 30+ automated cron jobs
│       ├── admin/                 # Admin APIs (cleanup-duplicates, suggestions, community-neighborhoods)
│       ├── ads/                   # Availability, checkout, upload, booking-info
│       ├── reactions/             # Emoji reactions API + saved articles
│       ├── email/                 # Unsubscribe, preferences, sunday-edition-request
│       ├── location/              # IP detect-and-match (nearest neighborhoods)
│       ├── referral/              # Referral code, track, convert, stats
│       ├── neighborhoods/         # Add, create, count community neighborhoods
│       ├── suggestions/           # Neighborhood suggestion submissions
│       ├── discover-neighborhood/ # Resolve nearby unsubscribed brief URL
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
    ├── community-pipeline.ts       # Community neighborhood creation utilities
    ├── discover-neighborhood.ts    # Find nearby unsubscribed neighborhood briefs
    ├── combo-utils.ts             # Combo neighborhood queries
    ├── rss-sources.ts             # RSS feed aggregation (DB + hardcoded fallback)
    ├── search-aliases.ts          # Country/region/state search aliases
    ├── geo-utils.ts               # Haversine distance + sorting
    ├── grok.ts                    # Grok X Search integration
    ├── brief-enricher-gemini.ts   # Gemini enrichment pipeline
    ├── weekly-brief-service.ts    # Sunday Edition generation
    ├── ad-quality-service.ts      # AI ad review pipeline
    └── weather.ts                 # Server-side Open-Meteo weather fetch (10-min cache)
```

## Environment Variables

**Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `CRON_SECRET`
**Optional:** `GEMINI_API_KEY`, `GROK_API_KEY`, `OPENAI_API_KEY`, `RESEND_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `SENTRY_AUTH_TOKEN`

## Key Database Tables

- `neighborhoods` — 270+ active neighborhoods with coordinates, region, country, `is_combo`, `is_community`, `created_by`, `community_status`
- `combo_neighborhoods` — join table for combo components
- `articles` — news articles with AI images (`enriched_at`, `enrichment_model`)
- `neighborhood_briefs` — Grok-generated daily summaries
- `weekly_briefs` — Sunday Edition content (rearview, horizon, holiday, data_point)
- `ads` — ad campaigns with booking fields (stripe_session_id, customer_email, is_global_takeover) and quality control (proof_token, approval_status, ai_quality_score)
- `house_ads` — fallback ads (types: waitlist, app_download, advertise, newsletter, sunday_edition, suggest_neighborhood, community_neighborhood)
- `neighborhood_suggestions` — reader-submitted neighborhood requests (suggestion, email, city/country, status: new/reviewed/added/dismissed)
- `article_reactions` — emoji reactions (bookmark/heart/fire), anonymous + authenticated
- `cron_executions` / `cron_issues` — monitoring & self-healing
- `daily_brief_sends` / `weekly_brief_sends` — email dedup (weekly: unique on `recipient_id, neighborhood_id, week_date`)
- `referrals` — click/conversion tracking (referral_code, referrer_type/id, referred_email, status, ip_hash)
- `profiles` — user prefs (primary_city, primary_timezone, paused_topics, referral_code)
- `newsletter_subscribers` — timezone, paused_topics, referral_code
- `rss_sources` — RSS feed URLs by city (192 feeds across 92 cities, 100% coverage)

## Deployment

```bash
git push origin master    # Deploy (then promote in Vercel dashboard)
npx supabase db push --include-all --yes  # Run migrations
```

## MCP Servers

Supabase, Vercel, Playwright, Supermemory, Frontend Design, Resend, Stripe, Sentry
