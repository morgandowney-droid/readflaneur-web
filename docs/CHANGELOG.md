# Flaneur Web - Change History

> Full changelog moved here from CLAUDE.md to reduce context overhead.
> Only read this file when you need to understand how a specific feature was built.

## 2026-02-24

**Expandable Look Ahead Card with Discovery CTAs:**
- Look Ahead card below Daily Brief now expands/collapses like the Daily Brief card does.
- Compact closed state unchanged (user explicitly liked the smaller scale).
- Expanded state shows full article body text with `[[Day, Date]]` section headers, markdown links rendered as `<a>` tags, "Show Less" button, "Read the full Look Ahead article" link.
- Discovery CTAs lazy-loaded on first expand: yesterday's Daily Brief, nearby neighborhood brief, "Take me somewhere new".
- API `/api/briefs/look-ahead` expanded to return `headline`, `bodyText`, `previewText`, `publishedAt` alongside `url`.
- Removed redundant Look Ahead CTA from NeighborhoodBrief expanded view (the card itself now provides this).
- `city` prop added to LookAheadCard for `excludeCity` in random discovery. Passed from all 3 render sites.

**Neighborhood-Aware Article Back Links:**
- `BackToFeedLink` ("All My Neighborhood Stories") and `MoreStoriesButton` now accept `citySlug`/`neighborhoodSlug` props.
- When provided, links go to `/{city}/{neighborhood}` (the article's specific neighborhood feed) instead of bare `/feed`.
- Article page passes route params (`city`, `neighborhood`) to both components.
- Fallback to `/feed` when props are missing (backwards compatible).

**Move Feed Neighborhoods from URL Params to Cookie:**
- Feed page previously received neighborhood IDs via URL query params (`/feed?neighborhoods=id1,id2,...`), creating long ugly URLs and an abuse vector where anyone could construct a custom feed URL.
- Now uses a `SameSite=Strict` cookie (`flaneur-neighborhoods`) synced from localStorage. URLs are clean `/feed`.
- `feed/page.tsx` reads `cookies()` from `next/headers` instead of `searchParams`.
- Layout inline `<script>` syncs localStorage to cookie on every page load (before hydration redirect).
- All 14 navigation points updated: `MultiFeed` (bare /feed fallback + drag reorder use `router.refresh()`), `ContextSwitcher`, `NeighborhoodSelectorModal` (explore/primary/clearAll), `HomepageEnterButton`, `SmartRedirect`, `HomeSignup`, `HomeSignupEnhanced`, `InviteHero`, `useNeighborhoodPreferences` (setPrimary), `Header` (neighborhood links now go to `/{city}/{neighborhood}` pages), `auth/callback` (server-side cookie set).
- New utility: `src/lib/neighborhood-cookie.ts` with `NEIGHBORHOODS_COOKIE` constant and `syncNeighborhoodCookie()` helper.

**Fix Look Ahead Date Display (published_at):**
- Look Ahead articles created the evening before (e.g., Feb 19 at 10 PM) showed "20h ago - Feb 19" while content said "Today, Friday February 20".
- Root cause: `CompactArticleCard` used `created_at` for look_ahead articles instead of `published_at` (set to next morning 7 AM UTC).
- Fixed across CompactArticleCard, ArticleCard (3 spots), and article detail page (2 spots) to use `published_at` for look_ahead articles.

**Disable Social Calendar (Gala Watch) Story Generator:**
- Social Calendar articles looked more like advertisements than news stories.
- Removed `sync-gala-watch` cron schedule from `vercel.json`.
- Archived all existing Social Calendar articles via SQL migration (`category_label = 'Social Calendar'` -> `status = 'archived'`).
- Removed Social Calendar topic from email preferences page.
- Code left in place (`gala-watch.ts`, cron route, registry entry) for potential re-enablement.

## 2026-02-20

**Fix Look Ahead Generation for Combo Neighborhoods:**
- Combo neighborhoods (Tribeca, Hamptons, Ostermalm) never received Look Ahead articles in daily brief emails.
- Root cause: `getActiveNeighborhoodIds()` returned combo IDs (e.g., `nyc-tribeca`) but not their component IDs (`nyc-tribeca-core`, `nyc-fidi`). The generate-look-ahead cron correctly filters out combos (`.eq('is_combo', false)`) but components were never in the eligible set.
- Fix 1: Added step 4 to `getActiveNeighborhoodIds()` in `active-neighborhoods.ts` - expands combo IDs to include component IDs via `combo_neighborhoods` table.
- Fix 2: Removed `.eq('is_active', true)` filter from `generate-look-ahead/route.ts` - combo components have `is_active=false` by design (they're not standalone neighborhoods), but still need articles for combo subscribers.
- Image feedback tooltip text updated to "I like this image" / "I don't like this image".

## 2026-02-18

**Pre-Generated Neighborhood Image Library:**
- 8 evergreen images per neighborhood, eliminating per-article Gemini Image API calls (~$750/mo -> ~$30/mo).
- Dual-brain pipeline: Gemini 2.5 Pro "creative director" generates 8 structured prompts per neighborhood, Imagen 4 generates the actual images.
- Categories: `daily-brief-1/2/3` (rotated by day % 3), `look-ahead-1/2/3` (rotated), `sunday-edition`, `rss-story`.
- `selectLibraryImage()` pure function used at article insert time in 6 crons: generate-brief-articles, generate-look-ahead, sync-news (RSS + Grok), generate-community-news, generate-guide-digests, sync-weekly-brief.
- Admin endpoint `POST /api/admin/generate-image-library` with batch pagination, status GET.
- `image_library_status` DB table tracks generation progress and season per neighborhood.
- `generate-image` endpoint now tries library image first (HEAD check), falls through to Gemini for uncovered neighborhoods.
- `retry-missing-images` cron repurposed: library-first lookup, Gemini fallback.
- Community neighborhood creation generates image library on create (Imagen 4 Fast for speed).
- Automated generation cron `refresh-image-library` (every 4h) processes ~3 neighborhoods per run (~9/day) within Imagen 4's 70 RPD Tier 1 limit. Quota-aware: distinguishes daily exhaustion from per-minute rate limits, only retries on per-minute. Once all complete for current season, runs are instant no-ops.
- Manual upload tool: `scripts/upload-manual-images.mjs` processes images from Gemini mobile app - strips watermark, resizes to 1280x720 16:9, uploads to Supabase storage. Name Sunday image with "sunday" in filename.
- Status dashboard: `scripts/image-library-status.mjs` shows neighborhoods sorted by subscriber count with complete/missing status. Priority folders in `manual-images/` numbered 01-20 for subscriber neighborhoods.
- Prompt rules: mandatory no-text instruction on every image prompt, no aerial/drone perspectives (uncanny valley), close-up architectural detail for look-ahead-3.
- Storage: `images/library/{neighborhood_id}/{category}.png` in Supabase storage.
- Added `IMAGEN` and `IMAGEN_FAST` model IDs to `ai-models.ts`.

## 2026-02-17

**Look Ahead Article Feature:**
- Daily forward-looking articles covering tomorrow + next 7 days for neighborhoods with active subscribers.
- Single-pass cron `generate-look-ahead` (8 PM UTC, publishes for 7 AM local next morning): `generateLookAhead()` Grok search -> `enrichBriefWithGemini()` with `articleType: 'look_ahead'` (Gemini Flash) -> article creation (`article_type: 'look_ahead'`).
- **Delivery-urgency priority:** Neighborhoods sorted by proximity to their 7 AM local delivery time - APAC/East processed first (soonest morning after 8 PM UTC), Americas last.
- **Next-morning framing:** Grok prompt includes explicit publication date context ("this will be published at 7 AM on {tomorrowDate}"). Gemini enricher receives `briefGeneratedAt` set to tomorrow 7 AM so CURRENT TIME context matches reader's perspective. Articles use "Today" / "This Week" framing (not "Tomorrow").
- `published_at` set to tomorrow 7 AM UTC, slug uses tomorrow's date for deterministic dedup.
- New `getActiveNeighborhoodIds()` in `src/lib/active-neighborhoods.ts` merges subscriber IDs from `user_neighborhood_preferences` + `newsletter_subscribers` (+ combo parent IDs).
- New `lookAheadStyle` in `brief-enricher-gemini.ts`: no greeting/sign-off, organized by Today then This Week, only verified events with dates/times/addresses.
- `LookAheadCard` component below daily brief in feed (single-feed and MultiFeed). Self-fetching via `/api/briefs/look-ahead`.
- Look Ahead CTAs in `BriefDiscoveryFooter` and `NeighborhoodBrief` expanded view (between yesterday's brief and nearby discovery).
- Look Ahead link in Daily Brief email (after stories, before satellite sections) and Sunday Edition email (after THE NEXT FEW DAYS section).
- `BriefDiscoveryFooter` rendered on `look_ahead` article pages.
- Translation keys `feed.lookAhead` and `feed.lookAheadCta` in all 9 languages.
- Cost: ~$0.48/day (Flash has 10K RPD, no quota pressure).

**Continuity Context for Gemini Enrichment:**
- Daily Brief enrichment now receives recent coverage history so Gemini can reference prior stories naturally (e.g., "as we noted Tuesday...", "following up on last week's opening...").
- `fetchContinuityContext()` in `enrich-briefs` cron queries last 5 enriched briefs (headline + ~200-char excerpt) and last 3 days of non-brief articles (headline + article_type) per neighborhood.
- `ContinuityItem` interface + `buildContinuityBlock()` helper format items into a labeled `RECENT COVERAGE CONTEXT` block injected into the Gemini prompt.
- Two style instructions added to `dailyBriefStyle`: reference sparingly when relevant, ignore entirely when nothing connects.
- ~300-800 extra tokens per prompt, 2 extra Supabase queries (~100ms) per brief - negligible vs 15-20s Gemini call.
- Backward compatible: `continuityContext` is optional. New neighborhoods with no history enrich normally. Non-fatal on fetch failure.
- Only applies to Phase 1 (daily briefs). Phase 2 (article enrichment via `weekly_recap` style) unchanged.

**Google Search Verification Link:**
- `SourceAttribution` shows "Single-source story - verify on Google" link when article has 0-1 sources. Google Search query = headline + neighborhood name.

**Day-of-Week in Feed Date Metadata:**
- Compact/gallery/brief cards show "Mon Feb 17" instead of "Feb 17". Auto-translated via `Intl.DateTimeFormat` locale.

## 2026-02-15

**Fix Sunday Edition Not Sending:**
- Daily Brief cron now skips on Sundays (`getUTCDay() === 0`). Previously, the Daily Brief and Sunday Edition both used `resolveRecipients()` which dedup-checks `daily_brief_sends`. The Daily Brief ran ~17s before the Sunday Edition, marking recipients as "already sent", causing Sunday Edition to find 0 recipients every week.
- `sync-weekly-brief` batch size increased from 10 to 500 (effectively all neighborhoods). The old batch=10 with a once-per-week schedule was a starvation bug - only 10 out of 270 neighborhoods got Sunday Edition content each week. At 10/week, it took 27 weeks to cycle through all neighborhoods.
- Sunday Edition uses `weekly_brief_sends` for its own dedup (not affected by daily brief sends).

**Fix Login/Auth Split-Brain State:**
- Login page now checks for existing session on mount (3s timeout). Authenticated users are redirected to `/feed` instead of seeing the sign-in form. Shows spinner while checking.
- Account page auto-heals stale sessions: when `getSession()` returns no user, calls `supabase.auth.signOut()` to clear orphaned localStorage tokens. Prevents the "ACCOUNT" nav link + "Sign in to view your account" dead-end.
- Sign-out handler clears both client-side (localStorage) and server-side (cookies) auth state. Previously only cleared server cookies, leaving stale client tokens.
- Server-side sign-in endpoint (`/api/auth/signin`) calls GoTrue REST API directly with service role key, bypassing broken Turnstile CAPTCHA verification.
- Login form has dual-path: client-side `signInWithPassword` with 8s timeout, then server fallback via `/api/auth/signin` with 15s timeout.

**Add Account Link to Desktop Nav:**
- Authenticated users can now reach Account (and Sign Out) from the desktop header nav. Previously only accessible via mobile hamburger menu.

**Translate House Ad Text (Headlines, Body, CTAs):**
- All house ad types now use `t()` translation keys (`houseAd.{type}.headline/body/cta`) with DB fallback for unknown types.
- Type-specific CTA buttons: "Let's Build It" (community), "Let's Place It" (advertise), "Let's Welcome Friends" (invite), "Suggest" (suggest), "Let's Take a Quick Look" (default).
- `{neighborhoodCount}` placeholder in advertise body text handled via `.replace()`.
- CTA button styling fixed from `bg-black text-white` to theme-aware `bg-fg text-canvas`.
- 21 house ad translation keys added across all 9 languages (290 total keys per language).
- Invitation ad tagline changed from "exclusive local feed" to "exclusive local intel".

**Translate Footer Pages (About, Legal, Standards, Contact, Careers):**
- All 5 footer pages now use `t()` translation keys with full translations across 9 languages (en, sv, fr, de, es, pt, it, zh, ja).
- About page: server/client split - server fetches neighborhood counts, `AboutContent` client component renders translated content with `{neighborhoodCount}`, `{cityCount}`, `{vacationCount}` placeholders.
- Standards and Careers pages: server/client split to preserve `metadata` exports. Client components `StandardsContent` and `CareersContent` handle translations.
- Legal and Contact pages: converted to `'use client'` with `useTranslation()` hook.
- Added `scripts/check-translations.mjs` - sync checker that verifies all languages have the same keys as English. Run `node scripts/check-translations.mjs` after editing English strings.
- 269 total translation keys across all 9 languages (up from 122).

**Fix Inviter Detection on /invite:**
- Inviter mode now detects existing users via three signals: `flaneur-newsletter-subscribed` localStorage, `flaneur-neighborhood-preferences` localStorage, OR active auth session (via `getSession()`). Previously only checked newsletter-subscribed flag, causing authenticated users to see the invitee join form.

**Restore Hyperlinks in Daily Briefs and Article Bodies:**
- HTML `<a>` tags are now converted to markdown format instead of being stripped to plain text.
- Markdown links `[text](url)` are rendered as clickable `<a>` elements with dotted underline style.
- Fixes overly aggressive link stripping that removed all hyperlinks from content.
- Updated across `NeighborhoodBrief.tsx`, `ArticleBody.tsx`, and `EnrichedNeighborhoodBrief.tsx`.

**Rename "All Stories" to "All My Neighborhood Stories":**
- Updated `article.allStories` translation key across all 9 languages.
- Affects the `<- All Stories` back link and navigation on article pages.

**Preserve Markdown Links in Gemini Enrichment Pipeline:**
- `brief-enricher-gemini.ts` was stripping `[text](url)` markdown links from Gemini's response before saving to `enriched_content` in DB. Render-time link display had nothing to work with.
- Removed the link-stripping regex. Future enriched briefs will have Gemini's Google Search grounding links preserved.
- Existing briefs already stored without links need re-enrichment to get links.

**Change Share Title to "Check out Flaneur":**
- Updated `navigator.share()` title/text in `InviteHero.tsx` and `ShareWidget.tsx`.
- Fixes Outlook generating "Url from [name]" as the email subject line.

**Reduce Header Icon Spacing:**
- Tightened gap between "Stories" nav link and theme/language icons on desktop header (`ml-1` to `-ml-2`).

**Feed Spacing Fix:**
- Added `ml-2` margin between neighborhood name and "Edit Neighborhoods" button on the daily brief context line.

## 2026-02-14

**Dual-Mode Invite Page + Subscribe CAPTCHA Fix:**
- `/invite` now detects existing users and shows **inviter mode**: "Share Flaneur" heading, personalized invite link in readonly input, "Copy Link" + "Share" buttons (native share on mobile), referral stats (clicks/friends joined) below.
- Invitees with `?ref=CODE` or new visitors still see the existing join form (invitee mode) unchanged.
- Fixed "Failed to send verification email" error on subscribe: replaced `signInWithOtp()` (anon key, requires Turnstile CAPTCHA token) with `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink' })` + send via Resend. Admin key bypasses CAPTCHA and does not affect the caller's browser session (no cookie-based client).
- New "Welcome to Flaneur" magic link email template (dark theme, Playfair Display masthead, Verify Email CTA).
- Fixed `callbackUrl` construction to use `NEXT_PUBLIC_APP_URL` with proper `VERCEL_URL` fallback pattern.

**Streamline Invite Page (Zero-Friction Referral Flow):**
- Removed `HomeSignupEnhanced` neighborhood selector from `/invite` page. Invitees no longer need to manually pick neighborhoods before subscribing.
- `InviteHero` now auto-detects invitee's location via `/api/location/detect-and-match` on form submit, finds 4 nearest neighborhoods, saves to localStorage, then subscribes and redirects to `/feed?welcome={city}` with WelcomeBanner.
- Changed placeholder from "your@email.com" to "Enter your email", button from "Subscribe" to "Join", removed "Choose your neighborhoods below" hint, added "We will find neighborhoods near you automatically."
- Loading states show progress: "Finding neighborhoods near you..." then "Setting up your subscription..."
- Graceful fallback: if location detection fails, subscribes without neighborhoods and SmartRedirect handles detection on /feed.
- Invite page no longer queries all neighborhoods server-side (was only needed for HomeSignupEnhanced).

**Dynamic Neighborhood Count in House Ads:**
- `FallbackService.ts` and `email/ads.ts`: House ad body text now resolves `{{neighborhood_count}}` placeholder with live COUNT query against active, non-combo neighborhoods. Replaces stale hardcoded "128" (actual count ~270).
- Migration: Updated existing `house_ads` rows to use placeholder.

**Fix "Read Yesterday's Daily Brief" Date-Relative Query:**
- `yesterday/route.ts`: Changed from `excludeSlug` to `beforeDate` parameter. Now uses `lt('published_at', beforeDate)` to find the most recent brief published BEFORE the current brief's date. Previously the API endpoint didn't receive any filtering info, so it always returned the most recent brief (which was today's).
- `NeighborhoodBrief.tsx`: Passes `generatedAt` as `beforeDate` when fetching yesterday's brief in the expanded card view.
- `BriefDiscoveryFooter.tsx`: Added `publishedAt` prop, passes it as `beforeDate` to the yesterday API. Article page passes `article.published_at` through.
- Effect: "Read yesterday's Daily Brief" now always shows the day prior to whatever brief the user is currently viewing, not just today's brief.

**"Above is the Daily Brief" Text Change:**
- `translations.ts`: Changed `feed.dailyBriefForPrimary` from "Daily Brief for your primary neighborhood:" to "Above is the Daily Brief for your primary neighborhood:" across all 9 languages (en, sv, fr, de, es, pt, it, zh, ja).

**Fix translate-content Cron Starvation + Broken Logging:**
- `translate-content/route.ts`: Two bugs. (1) `LIMIT 20` query fetched the same 20 newest articles/briefs every run. Once those had translations for a language, the cron skipped them but never paged to older items - 800+ articles and 700+ briefs never got translated. Same starvation pattern as `generate-brief-articles`. Fix: 4-step approach (get ALL IDs from last 48h, find existing translations in chunks of 100, compute diff, fetch full data only for untranslated items, 15 per language per run). (2) `cron_executions` insert used wrong column names (`status`/`duration_ms`/`items_processed`/`details` instead of `success`/`errors`/`response_data`), causing 0 logged runs in the monitoring table despite the cron actually executing on Vercel. Fixed to match schema used by all other crons.
- Root cause of user-reported "translations not working": UI chrome (headings, buttons, labels) translated instantly via client-side `t()` dictionaries, but article/brief content stayed in English because the cron wasn't generating translations for most content.

**DB Cleanup - Corrupted Specialized Articles:**
- Deleted 7 corrupted articles (Escape Index, Powder Alert, News Brief, GCB Alert, Design Watch, 2x Block Watch) from Feb 11-14. Bodies had been overwritten by `enrich-briefs` Phase 2 with Gemini refusal responses ("I am unable to...") because the brief-enrichment prompt didn't match specialized content.
- Retroactively set `enriched_at` on 107 articles (mostly `brief_summary` from Feb 11-12) that were still in the 4-day Phase 2 window without protection. Final count: 0 unprotected articles remaining.
- Also deleted 45 corrupted nuisance watch articles in earlier cleanup (bodies replaced with daily brief content).

**Systemic enriched_at Fix (All Article-Creating Crons):**
- All 27 crons that create articles (sync-filming-permits, sync-fashion-week, sync-sample-sales, sync-alfresco-permits, sync-heritage-filings, generate-brief-articles, sync-news, neighborhoods/create, and 19 more) now set `enriched_at` and `enrichment_model` at insert time. Previously only `sync-nuisance-watch` had this fix. Without `enriched_at`, `enrich-briefs` Phase 2 would pick up any published article from the last 4 days and overwrite its body with daily brief content from `enrichBriefWithGemini()`. This affected all specialized article types (filming permits, fashion week, auction calendars, etc.), not just nuisance watch.
- Crons with multiple article inserts (sync-alfresco-permits, sync-filming-permits, sync-heritage-filings, sync-news) all had each insert block fixed.
- `enrichment_model` set to match actual content source: `'claude-sonnet-4-5'` for RSS articles, `'grok-4.1-fast'` for Grok articles, `'gemini-2.5-flash'` for all others.

**Nuisance Watch Article Body Overwrite Fix:**
- `sync-nuisance-watch/route.ts`: Now sets `enriched_at` and `enrichment_model` at article creation time. Previously, nuisance articles had no `enriched_at`, so `enrich-briefs` Phase 2 would pick them up and send the 40-word noise complaint body to `enrichBriefWithGemini()`, which generated a full daily brief for the neighborhood - completely replacing the original headline-matched content. This caused "Block Watch: Noise complaints on York Street" articles to contain Valentine's Day event content instead.

**Mobile Feed Vertical Space Fix:**
- `MagicLinkReminder.tsx`: Hidden on mobile (`hidden md:block`) to reduce above-fold chrome. Desktop unchanged. Mobile email capture handled by engagement-triggered `EmailCaptureCard` after 5th article instead.
- `MultiFeed.tsx`: Tightened daily brief bottom margin on mobile (`mb-2 md:mb-6`). First article now visible on first screen without scrolling.

**Headline Truncation - Dangling Word Strip:**
- `utils.ts`: `truncateHeadline()` now iteratively strips trailing prepositions (`for`, `in`, `at`, `on`, `to`, `of`, `by`, `with`, `from`, `into`, `as`), articles (`the`, `a`, `an`), and conjunctions (`and`, `or`, `but`). Handles cascading cases (e.g., "Events for the" becomes "Events"). Previously only stripped `, and`/`, or` and `St.`.

**Translation Completeness Sweep:**
- `translations.ts`: Added `feed.reachedEnd` and `feed.dailyBriefForPrimary` keys in all 9 languages.
- `MultiFeed.tsx`: Translated PRIMARY badge (desktop pills), "Daily Brief for your primary neighborhood" text, "Edit Neighborhoods" link via `t()`.
- `MultiLoadMoreButton.tsx` / `LoadMoreButton.tsx`: Translated "Load More Stories", "Loading...", "You've reached the end" via `t()`.
- `CompactArticleCard.tsx`: Translates "Daily Brief" category label on feed cards when language is active.
- `TranslatedArticleNav.tsx`: Added `TranslatedDailyBriefLabel` for article page brief label.
- `[slug]/page.tsx`: Brief article headlines now wrapped in `TranslatedHeadline`, "Daily Brief" label uses translated component.
- `translate-content/route.ts`: Language rotation - rotates start language each cron run (half-hour offset) so zh/ja get fair coverage instead of always being last. Fixes starvation where sv had 157 translations but ja only 70.

**Daily Brief Discovery System:**
- `discover-neighborhood.ts`: Added `DiscoveryOptions` interface with `mode` (`'nearby'` | `'random'`) and `excludeCity`. Random mode uses Fisher-Yates shuffle and filters out the specified city for diversity. Existing callers (house ad) unaffected (options param is optional).
- `discover-neighborhood/route.ts`: Passes `mode` and `excludeCity` query params through to `findDiscoveryBrief()`.
- `NeighborhoodBrief.tsx`: When expanded, shows three discovery CTAs below source attribution: "Read yesterday's [Name] Daily Brief", "Read today's nearby [Name] Daily Brief", and "Take me somewhere new". Lazy-fetched on first expand via three parallel API calls, cached in component state.
- `BriefDiscoveryFooter.tsx`: New unified "Keep reading" component on daily brief article pages, placed right after source attribution. Includes: yesterday's brief link, add to neighborhoods (if not subscribed), nearby brief, "take me somewhere new", and inline email capture ("Get them emailed 7am daily"). Current neighborhood excluded from discovery candidates to prevent self-referencing.
- `/api/briefs/yesterday/route.ts`: New endpoint returning previous day's brief article URL for a neighborhood.

**Article Page Polish:**
- `ArticleReactions.tsx`: Removed fire emoji. Bookmark and heart now compact inline (no borders, smaller icons, no section divider).
- `PostReadEmailCapture.tsx`: Updated text to "Get them emailed 7am daily".
- `FallbackAd.tsx`: House ad headlines single-line truncated on mobile (`whitespace-nowrap overflow-hidden text-ellipsis`).
- `ArticleBody.tsx`: Added Grok raw search result stripping (`{'title': ..., 'url': ..., 'snippet': ...}`), URL-encoded artifact removal, and em dash replacement.
- `FeedList.tsx`: Added subtle `border-b border-border/30` separator between gallery view stories.

## 2026-02-13

**Daily Brief Primary Neighborhood Context:**
- `MultiFeed.tsx`: In "All Stories" view, shows "Daily Brief for your primary neighborhood: [name]" with an "Edit Neighborhoods" link under the brief card, so users know which neighborhood the brief refers to.

**Shift Brief Generation Window to Midnight-7 AM:**
- `sync-neighborhood-briefs/route.ts`: Morning window changed from 3-9 AM to midnight-7 AM local time. Gives the full pipeline (generation -> enrichment -> article creation) up to 7 hours before the 7 AM email send, preventing stale briefs in emails.
- `brief-enricher-gemini.ts`: Context time string always shows 7:00 AM (regex-replaced) so Gemini frames content as morning delivery regardless of actual generation time. Fixed `dateStr` to use neighborhood timezone instead of server timezone.

**Strip All Hyperlinks from Article Body and Brief Content:**
- `ArticleBody.tsx`: Removed LINK placeholder system. Now strips all `<a>` HTML tags and markdown `[text](url)` links at render time, keeping just the text. Fixes existing articles with pre-baked markdown links from before `injectHyperlinks()` was disabled.
- `NeighborhoodBrief.tsx`: Added markdown link stripping (`[text](url)` -> `text`) to `cleanContent()` function.

**Mobile Gallery Single-Line Headlines + Wider Spacing:**
- `ArticleCard.tsx`: Mobile gallery headlines now single-line (`whitespace-nowrap overflow-hidden`), truncated at last full word via `truncateHeadline()`, no ellipsis.
- `FeedList.tsx`: Mobile gallery spacing increased from `space-y-10` to `space-y-14` (3.5rem, ~2 headline heights between stories).

**Editorial Photo Image Style + Neighborhood Default Fallbacks:**
- `generate-image/route.ts`: Image generation prompt changed from watercolor/gouache illustrations to ultra-photorealistic editorial fashion photography of iconic neighborhood locations (golden hour, cinematic, magazine texture).
- New `mode: 'neighborhood_default'` generates one editorial photo per neighborhood, cached at `images/neighborhoods/{id}.png` in Supabase storage.
- `feed/page.tsx`: Articles without images check neighborhood default in storage first, then fall back to most recent article image.
- `MultiFeed.tsx`: Same two-tier fallback for client-side pill-filtered views.

**Gallery Mobile Layout Overhaul:**
- `ArticleCard.tsx`: Mobile gallery cards now show headline first, metadata below (not above), then a 4-line preview blurb.
- Neighborhood name truncated at 15 chars (last full word). Category "[Neighborhood] Daily Brief" simplified to "Daily Brief".
- `FeedList.tsx`: Mobile gallery spacing increased from `space-y-6` to `space-y-10` for clear story separation.

**Fallback Images for Empty Articles:**
- `feed/page.tsx` (server): Articles without images now fall back to the most recent published image from the same neighborhood. Batch query per neighborhood.
- `MultiFeed.tsx` (client): Same fallback logic for pill-filtered article fetches.

**Tighten Headline Generation Prompts (50 chars):**
- `sync-news/route.ts`: Claude RSS headline limit reduced from 80 to 50 chars, added "punchy and specific" guidance.
- `grok.ts` `generateNeighborhoodBrief()`: Changed from "Catchy 5-10 word headline" to "max 50 characters, be specific - name the venue, event, or street."
- `grok.ts` `generateGrokNewsStories()`: Changed from "under 80 chars" to "max 50 chars, name the venue/event/street, never generic."
- Takes effect for new articles from next cron runs onward. Existing headlines unchanged.

**Fix Mobile Dropdown Light Mode Contrast:**
- `MultiFeed.tsx`: Mobile neighborhood dropdown trigger showed "All Stories" as `text-white`, invisible on light theme. Changed to `text-fg`.

**Block AI Scrapers via robots.txt:**
- Added 6 more AI crawler user-agents (Meta-ExternalAgent, Meta-ExternalFetcher, Timpibot, img2dataset, Scrapy, Webzio-Extended) to `src/app/robots.ts`. Now blocks 21 AI training bots total.
- Fixed sitemap URL from `flaneur.me` to `readflaneur.com`.

**Wire Translations into Remaining Components:**
- `EmailCaptureCard.tsx`: Wired `useTranslation()` for headline, description, placeholder, button, error messages.
- `MagicLinkReminder.tsx`: Wired `useTranslation()` for prompt text, placeholder, button.
- `MultiFeed.tsx`: Replaced hardcoded `'My Neighborhoods'` with `t('feed.myNeighborhoods')`.
- `ArticleCard.tsx`: Added headline translation fetch via `/api/translations/article` for gallery view cards. Falls back to English when translation not available.
- Added `email.*` translation keys (10 keys) across all 9 languages in `translations.ts`.

**Remove Auto-Linking from Articles and Briefs:**
- Disabled render-time `renderWithSearchableEntities()` in both `ArticleBody.tsx` and `NeighborhoodBrief.tsx`. This function auto-linked every capitalized proper noun to Google Search, making articles cluttered with hyperlinks.
- Disabled pipeline-time `injectHyperlinks()` in `brief-enricher-gemini.ts`. Gemini's curated link candidates were stored as markdown in the DB - now new enrichments won't inject links.
- Removed ~400 lines of dead auto-linking code (entity detection, address detection, blocked domains, enriched source matching, word blocklists) from `NeighborhoodBrief.tsx`.
- Existing articles with pre-injected links still render those links (markdown link processing still works in ArticleBody). New articles will be link-free.
- `hyperlink-injector.ts` preserved (still used by specialty generators: fashion-week, gala-watch, auctions, etc.)

**Mobile Headline Truncation (40 chars):**
- Updated `truncateHeadline()` default from 45 to 40 chars.
- Added regex to strip trailing "St." abbreviation at sentence edge.

**Mobile Headline Truncation:**
- New `truncateHeadline(text, maxLen=45)` utility in `utils.ts` - truncates at last full word within 45 chars, strips trailing ", and" / ", or" conjunctions. No ellipsis or partial words.
- `CompactArticleCard`: split `headlineEl` into `headlineDesktop` (full, whitespace-nowrap) and `headlineMobile` (truncated via `truncateHeadline()`).
- `ArticleCard`: mobile `md:hidden` headline uses `truncateHeadline()`, removed `line-clamp-2` in favor of clean word-boundary truncation.

**Strip DAILY BRIEF Prefix + Mobile Brief Headline Wrap:**
- Feed cards (`ArticleCard`, `CompactArticleCard`) now use `cleanArticleHeadline()` to strip "Neighborhood DAILY BRIEF:" prefix from headlines. Neighborhood name already shown in metadata row above.
- Daily brief widget headline (`NeighborhoodBrief.tsx`) now wraps on mobile (`md:whitespace-nowrap md:overflow-hidden` instead of unconditional `whitespace-nowrap`).

**Add Portuguese, Italian, Simplified Chinese:**
- Added 3 new languages (pt, it, zh) to `SUPPORTED_LANGUAGES`, `translations.ts` (~90 UI keys each), `translation-service.ts`, and `PHASE1_LANGUAGES` in translate-content cron. Total: 9 languages.

**Stripe Webhook Fix:**
- `STRIPE_WEBHOOK_SECRET` env var had trailing `\n`, causing `constructEvent()` signature verification to fail (35 failures since Feb 10). Added `.trim()` defensive fix in code and cleaned env var in Vercel.

**Language Toggle Globe Icon + Mobile Fix:**
- Replaced Union Jack SVG with wireframe globe icon (`GlobeIcon` component - circle + ellipse meridian + latitude lines)
- Fixed mobile translate button doing nothing when browser language is English: `detectLanguage()` returned `'en'`, `setLanguage('en')` was a no-op. Now opens the language picker dropdown when detection returns English.
- Added `data-testid` attributes (`language-toggle`, `language-badge`, `language-picker`) for Playwright testing
- Playwright test: `e2e/language-toggle-mobile.spec.ts` - 5 tests covering globe visibility, picker open on English browser, language selection + badge, toggle back to English, outside-click close

**Mobile Feed Card Layouts:**
- Gallery view (ArticleCard): metadata + headline now render above image on mobile (`md:hidden` block with `line-clamp-2` for 2-line headline cap). Desktop retains gradient overlay on image.
- Compact view (CompactArticleCard): metadata + headline render full-width above image on mobile. Image + blurb sit side-by-side below. Desktop keeps original row layout.
- Gallery view spacing: increased from `space-y-4` to `space-y-6` on mobile, `md:space-y-4` on desktop.

**Language Translation System (Batch Pre-Translation):**
- New DB tables: `article_translations` and `brief_translations` with unique constraints on (article_id/brief_id, language_code), lookup indexes, RLS (public read, service_role write)
- `useLanguage()` hook + `LanguageProvider` React context: manages language state, browser detection via `navigator.languages`, localStorage `flaneur-language`, `document.documentElement.lang` updates
- `LanguageToggle` component: greyscale Union Jack SVG icon. OFF state: click auto-detects device language. ON state: flag + amber language code badge ("SV", "FR"). Click flag = English, click badge = picker dropdown. Placed in Header desktop nav and mobile hamburger.
- `translations.ts`: ~90 UI string keys per language for 6 languages (en, sv, fr, de, es, ja). `t(key, language)` lookup with English fallback.
- `useTranslation()` convenience hook wraps `useLanguageContext()` + `t()`
- `translation-service.ts`: Gemini Flash translation wrapper with exponential retry (2s, 5s, 15s backoff on 429). Preserves local language words, proper nouns, bold/header markers.
- `translate-content` cron (*/30, maxDuration=300): Phase 1 translates articles from last 48h, Phase 2 translates enriched briefs. Concurrency 3, upsert with onConflict. Logs to `cron_executions`.
- API endpoints: `GET /api/translations/article` and `GET /api/translations/brief` with 1h cache headers
- `TranslatedArticleBody` + `TranslatedHeadline`: client components for article pages, fetch translations and fall back to English
- `TranslatedArticleNav`: `BackToFeedLink` + `MoreStoriesButton` client wrappers for translated nav strings in server-rendered article page
- `CompactArticleCard`: fetches translated headline + preview text when language != English
- `NeighborhoodBrief`: fetches translated brief content when language != English
- UI chrome strings wired via `t()` into: Header (nav links), Footer (all links + copyright), MultiFeed (All Stories, PRIMARY, dropdown items, empty states), FeedList (empty state), BackToTopButton, NeighborhoodHeader (GUIDE/MAP/HISTORY, Covering, curated feed), ContextSwitcher (All Neighborhoods, Primary, Set primary, Customize List), WelcomeBanner (Viewing stories near, Customize), NeighborhoodBrief (DAILY BRIEF, Show less, Read more, Synthesized, Sources, archive strings), search page (all labels)
- Flash prevention: inline script in layout.tsx sets `document.documentElement.lang` from stored preference before first paint
- NOT translated: email templates (stay English per CLAUDE.md rule), admin pages, neighborhood/city names, ad content

**Search Page UX Polish:**
- Added X close button (top-right, uses `router.back()`) so users can dismiss search on mobile
- Rounded corners (`rounded-lg`) on search input, submit button, result cards, and empty state
- Tighter mobile padding (`py-8` vs `py-12`), neighborhood labels uppercase-tracked
- Result excerpts hidden on mobile (`hidden md:block`) for compact cards
- Fixed `text-neutral-600` search icon placeholder to `text-fg-subtle`

**Feed Empty State CTA:**
- Replaced plain "Select neighborhoods to see local stories" text with centered "Choose Neighborhoods" button
- Button opens the neighborhood selector modal, fixing the dead-end state when arriving at bare `/feed` with no neighborhoods (e.g., search -> article -> "All Stories" back link)

**Theme Accent & Contrast Fixes:**
- Added `--theme-accent` CSS variable: `#fbbf24` (amber-400) in dark mode, `#b45309` (amber-700) in light mode. Registered as `text-accent` / `text-accent-muted` via `@theme inline`.
- Replaced all `text-amber-400` selected/interactive states with `text-accent` in NeighborhoodSelectorModal, MultiFeed, ContextSwitcher, and Header hamburger. Fixes near-invisible selected text in light mode (amber-400 on white = 1.7:1 contrast ratio).
- Fixed hamburger neighborhood chips: changed `bg-canvas` to `bg-elevated rounded` so chips are visible in light mode (`#fafaf9` on `#ffffff` was invisible).
- Fixed hamburger scroll-close: added 50px delta threshold to prevent false triggers from layout shifts or incidental touch events.

**Full Light/Dark Theme System:**
- CSS variable foundation: 11 semantic tokens (canvas, surface, elevated, fg, fg-muted, fg-subtle, border, border-strong, hover, overlay, header-bg) defined in `:root` (dark) and `[data-theme="light"]`
- Updated `@theme inline` to expose all tokens as Tailwind color utilities (`text-fg`, `bg-canvas`, `border-border`, etc.)
- Flash prevention: inline `<script>` in `layout.tsx` reads `flaneur-theme` from localStorage and sets `data-theme` attribute before first paint
- `useTheme()` hook (`src/hooks/useTheme.ts`): manages theme state, localStorage persistence, `data-theme` attribute
- `ThemeToggle` component (`src/components/layout/ThemeToggle.tsx`): sun/moon icon, placed in desktop nav and mobile hamburger area
- Light palette uses stone shades (warm undertone): canvas `#fafaf9`, surface `#ffffff`, fg `#1c1917`
- Bulk replaced ~400+ hardcoded color classes across 110+ TSX files (text-neutral-100..500, bg-neutral-800/900, border-white/*, hover:bg-white/5, hover:text-white)
- Button classes (`.btn-primary`, `.btn-secondary`, `.btn-ghost`) use semantic tokens
- Header uses `.header-bg` CSS class with `--theme-header-bg` variable for glassmorphism
- Homepage hero, discover hero, invite hero wrapped in `data-theme="dark"` to stay permanently dark
- Gradient fades on pill bar use `from-canvas` (tracks theme automatically)
- NeighborhoodSelectorModal glassmorphism, inputs, buttons, city headers all use semantic tokens
- Legal page: replaced `prose-invert` with semantic text color overrides
- Email templates (`src/lib/email/`) and home components (`src/components/home/`) excluded from sweep
- New localStorage key: `flaneur-theme` (`'dark'` | `'light'`, absence = dark default)

**Fix: generate-brief-articles Cron Processing All Neighborhoods:**
- Root cause: `batch=10` fetched same 10 newest briefs every run. Once those had articles, subsequent runs found nothing - 260+ neighborhoods never got daily brief articles.
- Fix: 4-step approach - get recent enriched brief IDs (36h window), find which already have articles, fetch full data only for those that need articles, process with 270s time budget
- Increased `maxDuration` from 120s to 300s, removed configurable batch size (now processes all)
- Slug generation now uses `brief.generated_at` date (not runtime date) for consistency
- Slug collisions (re-generated brief, same headline/date) now silently skip instead of failing
- Covers all 270+ neighborhoods in a single cron run at :30 every hour

**Mobile Dropdown Enhancements:**
- ViewToggle (list/gallery) moved from dropdown row to just above feed content on mobile - cleaner dropdown row with only neighborhood selector + manage button
- "Explore other neighborhoods" link at bottom of mobile dropdown, opens neighborhood selector modal
- Empty search state: "No pre-existing {query} neighborhoods found. Create one or Clear search" - "Create one" links to Community Created tab
- Renamed "Community" to "Community Created" across selector: tab button, section heading, neighborhood badges

**Mobile Neighborhood Dropdown:**
- Replaced horizontal pill scroll with dropdown selector on mobile (<768px) - shows full neighborhood list in one tap instead of sideways scrolling
- Dropdown trigger: shows "All Stories" or active neighborhood name + city, chevron rotates on open
- Dropdown list: "All Stories" with grid icon, neighborhoods with colored dots (amber=primary), PRIMARY badge, amber checkmark for active selection
- `max-h-[60vh]` scrollable list handles 19+ neighborhoods comfortably
- Click-outside-to-close via mousedown listener on document
- Desktop pill bar completely unchanged (drag-to-reorder, scroll arrows, fade indicators)
- Both breakpoints share `activeFilter` state - switching viewport stays in sync
- Manage button + ViewToggle extracted into shared `controlButtons` const (no duplication)

**Signup Page Polish:**
- Removed "I am a..." role picker (reader/journalist/advertiser) - all signups default to `reader`, reducing friction
- Added `rounded-lg` to all inputs, buttons, and error box matching login page style
- Increased spacing (`space-y-5`, `mb-10`) to match login page

**Enrichment-Gated Brief Publishing:**
- Email assembler (`fetchBriefAsStory`) now returns null if brief has no `enriched_content` - emails never link to sparse/unenriched brief articles
- Brief article cron (`generate-brief-articles`) removed raw content fallback - only creates articles from Gemini-enriched briefs
- Backfilled 7 today's brief articles that had unenriched content (e.g., Östermalm 953 -> 2,802 chars)

**Custom SMTP for Auth Emails:**
- Supabase auth emails (confirmation, password reset) now sent via Resend SMTP (`smtp.resend.com`) for better inbox deliverability
- Sender: `noreply@readflaneur.com` with SPF/DKIM/DMARC from existing Resend domain setup

**Cloudflare Turnstile CAPTCHA:**
- Turnstile widget keys configured in Cloudflare dashboard, Vercel env vars, and Supabase Attack Protection
- Managed mode (Cloudflare decides when to show challenge)

## 2026-02-12

**Mobile UX Overhaul (21 Issues, 5 Groups):**
- Based on real iPhone 14 Pro user testing. 13 files modified across navigation, feed layout, selector, auth, and ad experience.
- **Navigation:** Logo links to /feed, "Stories" link in header for all users, "Edit Neighborhoods" with amber accent, default entry point changed from /login to /signup, homepage hero wraps in Link to /feed (both `/` and `/discover`)
- **Feed layout:** Back-to-top FAB repositioned to bottom-right on mobile (top-center desktop), masthead padding reduced on mobile (`pt-2 md:pt-6`), compact card metadata no-wrap with category label dedup, daily brief gets amber left border accent, brief renders after header (not before neighborhood name)
- **Scroll behavior:** Pills non-sticky on mobile (`md:sticky`), gradient fade indicators on scrollable pills, Guide/Map/History collapsed behind overflow menu on mobile
- **Neighborhood selector:** No auto-focus on mobile (prevents keyboard covering screen), geolocation-based default sort on open, "Set as Primary" always visible on touch devices, "Go to Stories" escape link in header
- **Auth fixes:** `emailRedirectTo` added to signup (fixes localhost:3000 verification redirect), "Check spam" hint on confirmation screen
- **Ad grace period:** New `useNewUserGracePeriod` hook (5-day localStorage grace period), FeedList filters ads and email prompts for new users
- Files: Header.tsx, page.tsx, signup/page.tsx, MultiFeed.tsx, NeighborhoodHeader.tsx, BackToTopButton.tsx, NeighborhoodBrief.tsx, CompactArticleCard.tsx, feed/page.tsx, NeighborhoodSelectorModal.tsx, ContextSwitcher.tsx, FeedList.tsx, useNewUserGracePeriod.ts (new)

**Community Neighborhoods (User-Created):**
- Authenticated users can create up to 2 neighborhoods via the "Community" tab in the neighborhood selector modal
- Gemini Flash validates input (verifies real neighborhood, normalizes name/city/country/region/timezone/coordinates)
- Duplicate detection: exact slug match + 500m Haversine proximity against all active neighborhoods
- Full content pipeline runs synchronously (240s budget): Grok brief -> Gemini enrichment -> article -> image generation
- Graceful degradation: neighborhood activates before pipeline - if any step fails, crons fill gaps on next cycle
- `POST /api/neighborhoods/create` (maxDuration=300), `GET /api/neighborhoods/my-community-count`
- DB: `is_community`, `created_by`, `community_status` columns on `neighborhoods` table
- All community neighborhoods use `region: 'community'`, ID format `city-name` slug
- Admin page at `/admin/community-neighborhoods` with remove/restore actions
- Neighborhoods API filters out removed community neighborhoods

**"Create Your Own Neighborhood" House Ad:**
- New `community_neighborhood` type in `house_ads` table
- Rotates in feed and article ad slots: "Any neighborhood in the world - one click and we handle the rest"
- "Get Started" button opens neighborhood selector modal directly to Community tab via `openModal('community')`
- Hidden via `flaneur-has-community-neighborhood` localStorage once user has created one
- Success message: "You will receive a daily brief for {name} at 7am local time starting tomorrow"

**Neighborhood Selector Modal - Community Tab:**
- Tab toggle ("All Neighborhoods" | "Community") below title, above search
- Community tab: create form (text input + button with validating/generating/success states), 0/2 counter, community neighborhood list grouped by city
- "Community" badge (`text-[10px] text-neutral-600`) next to community neighborhoods in All tab
- `openModal()` accepts optional tab parameter for direct-to-tab navigation
- Not authenticated: "Sign in to create your own neighborhood" with login link

**Community Neighborhoods TypeScript Fixes:**
- `openModal` signature changed to `(tab?: ModalTab) => void` which is incompatible with `onClick: MouseEventHandler`. Wrapped in arrow functions in NeighborhoodHeader, HomeSignupEnhanced, HeroStats.
- Added `'community'` to `GlobalRegion` union but missed updating all `Record<GlobalRegion, ...>` objects. Fixed in EnhancedNeighborhoodSelector (REGION_DATA, byRegion, result) and NeighborhoodSelector (REGION_LABELS).
- Migration version collision: `20260213` was already taken by `neighborhood_suggestions`. Renamed to `20260217`/`20260218` after repairing Supabase schema_migrations history.

**Global 5-Email-Per-Day Limit:**
- New shared utility `src/lib/email/daily-email-limit.ts` counts daily_brief_sends + weekly_brief_sends per recipient per UTC day
- Enforced in all 4 send paths: daily brief sender, instant resend, Sunday Edition cron, on-demand Sunday Edition request
- Transactional emails (password reset, ad confirmations) are exempt
- On-demand Sunday Edition shows user-friendly "Limit Reached" HTML page when capped

**Always-Resend on Primary Neighborhood Change:**
- `sync-primary-neighborhood` now triggers instant resend on any primary change, even within the same city
- Previously only resent when the city changed (e.g., Stockholm to New York)
- Now also resends when switching e.g., Ostermalm to Sodermalm (both Stockholm)

**Vercel Preview Build Fix (Lazy-Init Supabase Admin):**
- Module-level `createClient()` calls in 6 API routes crashed Vercel preview builds where env vars aren't available during page data collection
- Converted to `getSupabaseAdmin()` lazy getter functions in: `admin/suggestions`, `referral/code`, `referral/convert`, `referral/track`, `referral/stats`, `suggestions/neighborhood`
- Preview and production builds now both succeed cleanly

**Hamptons Neighborhood Renames:**
- Removed "(Hamptons)" suffix from component neighborhoods: Southampton (Hamptons) -> Southampton, Bridgehampton (Hamptons) -> Bridgehampton, Amagansett (Hamptons) -> Amagansett, Sagaponack (Hamptons) -> Sagaponack
- City column ("The Hamptons") already provides the grouping context, so suffix was redundant in pills and selector

**Brief Content Sanitization Fixes:**
- Fixed markdown link stripping regex in `brief-enricher-gemini.ts` to handle nested parentheses in URLs (e.g., Wikipedia links)
- Added regex in `NeighborhoodBrief.tsx` `cleanContent()` to strip URL-encoded artifacts (`%20The%20Hamptons)`) left by broken markdown link parsing

**Neighborhood Selector Tidy (Two Rounds):**
- **Alps consolidation:** Gstaad -> Gstaad Swiss Alps, St. Moritz -> St. Moritz Swiss Alps, Courchevel 1850 -> Courchevel 1850 French Alps, new Zermatt Swiss Alps. All under city "Alps". Swiss Alps city group eliminated.
- **New York Surroundings:** Scarsdale -> Scarsdale NY, Greenwich Backcountry moved here (new city group)
- **Costa del Sol:** Marbella city renamed, Marbella -> Marbella Municipality, Golden Mile moved here
- **French Riviera:** Saint-Tropez moved from European Vacation
- **Hamptons expansion:** Added Southampton, Bridgehampton, Amagansett (all with "(Hamptons)" suffix). Renamed Hamptons (Sagaponack) -> Sagaponack (Hamptons). The Hamptons -> The Hamptons Overview. Consolidated from us-vacation to north-america region.
- **Dedup:** Duplicate Aspen under US Vacation deactivated (Colorado one stays)
- **"Suggest a Neighborhood"** moved from bottom of modal to top bar next to "Change my Timezone" with `|` separator. Toggle-to-expand inline form (matching timezone UX). Empty search state links to the top bar form. Old bottom section removed.
- Active neighborhoods: 200 -> 270 across 91 cities

**Single-Line Feed Headlines:**
- All feed headlines (daily brief card, compact list view, gallery card) now render on one line with `whitespace-nowrap overflow-hidden` (no wrapping, no ellipsis)
- Text ends cleanly at the container edge when too long to fit
- Affected: `NeighborhoodBrief.tsx` (h3), `CompactArticleCard.tsx` (h2, was `line-clamp-2`), `ArticleCard.tsx` (h2 in both hover states, was `line-clamp-3`)

**Enriched Brief Language & Framing Fixes:**
- Vasastan enriched brief was written entirely in Swedish because Gemini followed the Swedish search instruction too literally
- Lidingö enriched brief used "Another week on the island" despite being a daily update
- Fixed in `brief-enricher-gemini.ts`: added "ALWAYS write in English" with allowance for local language terms, and "This is a DAILY update" with explicit prohibition of weekly framing
- Applied to both `daily_brief` and `weekly_recap` style prompts

**Brighter Section Headings in Daily Brief Cards:**
- Section headings (e.g., "Tech Brains and Rock and Roll") in `NeighborhoodBrief.tsx` changed from inherited `text-neutral-400` to explicit `text-neutral-200` for better visual hierarchy

**Enriched Brief Greeting Fix:**
- Gemini enrichment prompt said "Good morning, neighbors or similar" - Gemini interpreted "or similar" as license to use "Good evening" for briefs enriched at certain UTC hours
- Fixed in `brief-enricher-gemini.ts`: explicitly requires "Good morning" (never evening/afternoon) since briefs are always delivered in the morning
- Affected: Ireland, County Limerick, and potentially other UTC+0/+1 neighborhoods enriched in late UTC hours

**Suggest a Neighborhood - House Ad, Contact Form, Admin Page:**
- New `neighborhood_suggestions` table with RLS (service_role only), status workflow: new → reviewed → added/dismissed
- New `suggest_neighborhood` house ad type in `house_ads` - renders inline form instead of navigating away
- `NeighborhoodSuggestionForm` shared component with `compact` (house ad) and `full` (contact page) variants
- `HouseAdDisplay` in `FallbackAd.tsx` handles `suggest_neighborhood` type - "Suggest" button toggles inline form (both card and story_open variants)
- `/contact` page: added "Suggest a Neighborhood" section between Tips and Advertising
- `POST /api/suggestions/neighborhood` - validates 3-200 chars, SHA-256 IP hash rate limit (5/hr), Vercel IP city/country detection, inserts to DB
- `notifyNeighborhoodSuggestion()` in `email.ts` sends to `contact@readflaneur.com` with suggestion details + admin link
- `/admin/suggestions` page - stats row, filter tabs, table with status badges, inline admin notes editing, status action buttons (Review/Added/Dismiss/Reopen)
- `GET/PATCH /api/admin/suggestions` - admin role auth via session, service role DB access
- Admin dashboard card added to `/admin`
- `NeighborhoodSelectorModal.tsx` "Suggest a Destination" rewired from direct Supabase insert (silently failed due to RLS) to `POST /api/suggestions/neighborhood`. Added optional email field. Both placements updated (bottom of city list + empty search state). Submitting state disables inputs.

**Dynamic House Ads - "Check Out a New Neighborhood":**
- `house_ads` record (type `app_download`) updated: headline "Check Out a New Neighborhood", body "See what's happening today in a nearby neighborhood.", static fallback `/discover`
- New shared utility `src/lib/discover-neighborhood.ts` - `findDiscoveryBrief()` finds nearest unsubscribed neighborhood with a published Daily Brief, using Haversine distance sorting from `geo-utils.ts`
- Email integration: `getHouseAd()` in `ads.ts` now accepts `subscribedIds`/`primaryNeighborhoodId`, resolves dynamic URL for `app_download` type. Called from `getEmailAds()` with recipient's neighborhood IDs.
- Web integration: `HouseAdDisplay` in `FallbackAd.tsx` uses `useEffect` to read localStorage prefs, fetch `/api/discover-neighborhood`, and update click URL from `/discover` to resolved brief URL
- New API endpoint `GET /api/discover-neighborhood?subscribedIds=...&referenceId=...` - public, no auth, returns `{ url, neighborhoodName }` or `{ url: "/discover" }` fallback

**Add to Collection CTA on Article Pages:**
- New `AddToCollectionCTA` component (inline in `FallbackAd.tsx`) - shows "Add {neighborhood} to Your Collection" on article bottom ad slot when the neighborhood is not in user's localStorage preferences
- Article page passes `articleNeighborhoodId` and `articleNeighborhoodName` to bottom `FallbackAd` only (top slot unchanged)
- On click: adds neighborhood ID to `flaneur-neighborhood-preferences` localStorage array, fires `POST /api/neighborhoods/add` (fire-and-forget), shows success message
- New API endpoint `POST /api/neighborhoods/add` - uses `getSession()` auth. Authenticated users: inserts into `user_neighborhood_preferences` with next sort_order. Anonymous: returns success (localStorage-only).
- Checks localStorage in `useEffect` (hydration-safe). Returns null if already subscribed, letting normal fallback render.
- New migration: `20260212_update_app_download_house_ad.sql`

**Sunday Edition Holiday Expansion (19 → 50):**
- Added 31 new holidays covering all 20 active countries: East Asian (Lunar New Year, Mid-Autumn, Dragon Boat for Singapore/HK), Japanese (Golden Week, Obon, Coming of Age Day, Marine Day, Respect for Aged), Islamic (Eid al-Fitr, Eid al-Adha for UAE/Singapore), Jewish (Passover, Rosh Hashanah, Yom Kippur, Hanukkah for Israel/USA), Indian (Diwali for Singapore/UK, Vesak), European national days (King's Day, German Unity, Republic Day, Portugal Day, Lucia, Walpurgis Night, Sankt Hans, Epiphany, Constitution Day), UAE National Day, South Africa (Freedom Day, Heritage Day), Americas (Mardi Gras, Canadian Thanksgiving, Dia de los Muertos)
- Lunar/Islamic/Hebrew/Hindu holidays use lookup tables (2025-2030) since dates can't be calculated with simple formulas
- Local holidays listed before global ones so `detectUpcomingHoliday()` prioritizes them (e.g., Lunar New Year over Valentine's Day for Singapore)
- Added `fromLookup()` helper and `mardiGras()` (Easter - 47 days) calculation

**Bare /feed Redirect Fix:**
- Article page "← All Stories" and "More Stories" links go to bare `/feed` (no `?neighborhoods=` params)
- Server component can't read localStorage → `MultiFeed` received empty neighborhoods → no pills/header
- Fix: `MultiFeed` useEffect detects empty neighborhoods array, reads `flaneur-neighborhood-preferences` from localStorage, does `router.replace()` with IDs + `window.scrollTo(0, 0)`
- Covers all paths to bare `/feed`: back links, bookmarks, direct URL entry

**Grok Search Result Sanitization:**
- Nassim Hill daily brief contained raw `{'title': '...', 'url': '...', 'snippet': ...}` tool output leaked from Grok, making the brief card huge
- Added regex strip at pipeline level (`grok.ts`) and display level (`NeighborhoodBrief.cleanContent()`)
- Pattern handles both complete objects (with `}`) and truncated ones (no closing brace)

## 2026-02-11

**Pipeline Reliability Fixes:**
- Article deduplication: `generateSlug()` made deterministic (removed `Date.now()`), added source URL fallback check, Grok headline similarity dedup, deterministic Grok slugs
- Gemini quota: `enrich-briefs` reduced from `*/5` to `*/15`, batch 50→15, concurrency 5→2, exponential backoff on 429, early termination on quota hit. Daily calls ~21,600→~2,880.
- APAC brief generation: replaced UTC midnight boundary with per-neighborhood local date check (`hasBriefForLocalToday`), widened morning window 4-8am→3-9am
- Primary neighborhood sync: new `POST /api/location/sync-primary-neighborhood` endpoint called fire-and-forget from `useNeighborhoodPreferences.setPrimary()`, updates `profiles.primary_city`/`primary_timezone`, triggers instant resend
- Fashion week headlines: prompt now requires "Day N" with day-specific angle (opening/midweek/final stretch), no more identical daily headlines
- RSS feed tracking: `sync-news` now updates `rss_sources.last_fetched_at` after each city fetch

**Engagement-Triggered Email Capture:**
- Article read counter: `ArticleViewTracker` increments `flaneur-article-reads` in localStorage on each article view (skips if already subscribed)
- Feed inline prompt: `EmailCaptureCard` injected after 5th article via `injectEmailPrompt()` in `ad-engine.ts`. Shows "Get {neighborhood} stories in your inbox" with email input + subscribe button. Dismissible via X (stores `flaneur-email-prompt-dismissed`).
- Article page prompt: `PostReadEmailCapture` after `ArticleReactions` - compact one-liner "Enjoying {neighborhood} stories? Get them daily." with inline email input
- Return visit toast: `ReturnVisitPrompt` in global `layout.tsx` - slide-up toast on 2nd+ session with 3+ reads. Auto-dismisses after 10s unless user focuses input. Session counting via `flaneur-session-count` with sessionStorage dedup guard.
- All prompts gated by: 3+ reads, not subscribed (`flaneur-newsletter-subscribed`), not dismissed. Posts to existing `/api/newsletter/subscribe`.
- `FeedItemType` extended with `'email-prompt'`, `FeedList` renders `EmailCaptureCard` for that type
- `MultiFeed` client-side filtered articles also get email prompt injected
- New localStorage keys: `flaneur-article-reads`, `flaneur-email-prompt-dismissed`, `flaneur-session-count`

**Smart Auto-Redirect for New Visitors:**
- Inline `<script>` in `layout.tsx` redirects returning users (with localStorage preferences) to `/feed` before React hydration - no homepage flash
- `SmartRedirect` component for new users: calls `/api/location/detect-and-match`, saves 4 nearest neighborhoods to localStorage, redirects to `/feed?welcome={city}`
- New API route `GET /api/location/detect-and-match`: IP geolocation via ipinfo.io → latitude/longitude → Haversine sort against all active non-combo neighborhoods → returns nearest 4
- `WelcomeBanner` component on feed: "Viewing stories near {city}. Customize" with dismiss X, strips `welcome` param, stores dismissal in localStorage
- `/discover` page: full homepage without auto-redirect for direct browsing
- `DetectedLocation` interface extended with `latitude`/`longitude` fields from ipinfo.io `loc` field
- Session guard (`sessionStorage` flag) prevents detection retry loops on failure; 5s AbortController timeout

**Admin Dark Mode:**
- All 12 admin pages converted from light-mode colors (blue-50, yellow-100, green-100, etc.) to Obsidian-compatible dark variants (blue-500/10, yellow-500/15, green-500/15, etc.)

**UX Polish:**
- `NeighborhoodBrief` whole card clickable to expand/collapse (stopPropagation on inner buttons)
- `getMapLocation()` now strips "Enclaves" suffix and diacritical marks for better Google Maps resolution
- `sync-news` cron logs to `cron_executions` even when ANTHROPIC_API_KEY is missing (was silently failing)

## 2026-02-10

**Feed Pill Bar + Modal Polish:**
- Drag-to-reorder pills: replaced HTML5 DnD (unreliable) with pointer events (`pointerdown`/`move`/`up`). 8px threshold, `setPointerCapture` on `currentTarget` (not `target`), refs for drag/over indices to avoid stale closures.
- Pill order now matches URL parameter order: `feed/page.tsx` sorts `neighborhoodsWithCombo` by `neighborhoodIds` index (Supabase `.in()` returns DB order).
- Modal "Set as Primary" now navigates feed page with reordered URL so pills update immediately.
- Modal header: `6 selected | Change my Primary Neighborhood | Change my Timezone` with pipe separators.
- Timezone selector moved from bottom settings section to header, toggled by "Change my Timezone" link.
- Search input narrowed to `max-w-[15rem]` (75% of previous `max-w-xs`).
- City label in NeighborhoodHeader all-mode bumped from `text-[11px]` to `text-xs` for visibility.

**Cron Monitoring + Enrichment Fixes:**
- Added `cron_executions` logging to `sync-news` (had zero logging - wrapped in try/finally with correct schema)
- Added `cron_executions` logging to `generate-brief-articles` (had zero logging - same pattern)
- Fixed `send-daily-brief` logging: was using wrong column names (`status` string instead of `success` boolean, plus non-existent columns `duration_ms`, `items_processed`, `error_message`). Every insert silently failed. Fixed to match working schema.
- Fixed `generate-brief-articles` base URL: was using `VERCEL_URL` directly instead of `NEXT_PUBLIC_APP_URL` first
- Broadened `enrich-briefs` Phase 2 from `ai_model = 'claude-sonnet-4-5'` to all published articles. Only 4 articles matched the old filter; 1,198 unenriched articles were stranded with older model strings.
- Paused Google Places API crons (`sync-guides`, `generate-opening-closing-news`) - $80/day savings vs $10/day for Gemini

**Feed UX Fixes + Login Polish (7 Changes):**
- Primary neighborhood navigation fix: modal `handleExplore()` now uses localStorage order (primary-first) instead of Set insertion order; ContextSwitcher `handleSetPrimary` now navigates with reordered IDs
- Drag-to-reorder neighborhood pills: HTML5 drag-and-drop on MultiFeed pill bar. On drop, reorders localStorage and navigates. Visual: dragged pill `opacity-50`, drop target amber left border, `cursor-grab`/`cursor-grabbing`
- Settings merged into neighborhood modal: city dropdown + detect button + save button in compact row above footer. Settings links removed from Header (desktop + mobile, both auth states). `/settings` page still accessible via direct URL
- Login page polish: `rounded-lg` on inputs, button, error div. Title margin `mb-10`, form spacing `space-y-5`
- Login success message: replaced green banner with subtle centered "Welcome back. Redirecting..." in `text-neutral-400`
- Pill bar vertical stability: pills render BEFORE masthead in MultiFeed, so `sticky top-[60px]` pills don't jump when masthead height changes between "My Neighborhoods" and specific neighborhood details
- Daily brief eyebrow: changed from "TUE DAILY BRIEF" to "TUE FEB 10 | DAILY BRIEF" format

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
