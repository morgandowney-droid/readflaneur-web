# Flaneur Web

> **User Location:** Stockholm, Sweden (CET/CEST timezone)
> **Full changelog:** `docs/CHANGELOG.md` (read only when needed)
> **Mobile app:** `../flaneur/CLAUDE.md`

## What's Live

- **Website:** https://readflaneur.com (also https://flaneur.news - 301 redirects to readflaneur.com)
- **Backend API:** https://flaneur-azure.vercel.app
- **GitHub:** https://github.com/morgandowney-droid/readflaneur-web
- **Sentry:** https://sentry.io/organizations/flaneur-vk/issues/
- **270 neighborhoods** across 91 cities, 42 countries

## Last Updated: 2026-10-06

> **Keep this file under 150k characters.** A new session gets one short "Recent work" entry here (what changed, files, the rule learned); the full write-up goes in `docs/CHANGELOG.md`. When there are more than three full entries, move the oldest to `docs/history/recent-work.md` and leave a one-line index entry below.


Recent work (2026-10-05, evening): **The archive's writing and voice are not good enough to show; a trial is waiting on Morgan's choice.** Morgan read and listened to four archive editions (Upper West Side, Warwick, Trim, Meerbusch) and judged the Piper audio "not very appealing" and the writing "not very good", so the low-cost editions are not shown to anyone (Will Lewis included) until they improve. `writeBrief()` now takes `WriteOptions` (`style: 'plain' | 'local'`, `model`, `providers`, `items`, `timeoutMs`; `plain` stays the nightly default, so nothing published changed). Trial on identical sources (page https://claude.ai/artifact/BaabsbiGFVzLMiz8pQKYde): A today's DeepSeek V4 Flash plain (~$0.0008 a brief); B same model with production's local voice (slightly fuller, still dry, one area produced nothing); D Gemini 2.5 Flash via OpenRouter with the local voice (~$0.004, most fluent but pads with unsupported filler, would need a filler check); DeepSeek V4 Pro dropped (its one cheap provider is degraded, others $1-2 per M, failed two of four areas at ~$0.025). Voices: Kokoro (`kokoro-onnx`, model in `~/kokoro` on the server, English only, no Irish or German voice) at 0.40 of real time against Piper's 0.11, so the whole archive would need a larger server (~EUR 60 a month); German candidate Piper Thorsten high (0.34). **The bigger cause is thin input**: many stories come from one search snippet while production reads whole articles. Next step after Morgan's pick: fuller sources (read the article behind each hit, skip areas with one thin source), then switch writer and voice.


Recent work (2026-10-05): **The archive tier's first full nights, and why half the empty areas were empty.** *Coverage* (5 Oct briefs, about $4.40 all in): Germany 2,466 of 3,873, UK 1,640 of 2,835, Ireland 101 of 166, Australia 356 of 1,177, NZ 68 of 267, NYC 45 of 197, DC 13 of 39; audio for every brief. *Empty areas*: Germany split about evenly, 994 empty both nights and 978 empty one night only; a hand check of 36 areas empty every night found half had news that week, **lost to how statistical names were searched and matched**: "Upper West Side-Manhattan Valley" and "Pennant Hills - Cheltenham" went to Google whole and the hits, which say "Upper West Side", failed the names-the-area check; "Kingston (ACT) and nearby" made "nearby" a place name; only the first place was searched. `searchNames()` now splits hyphenated lists outside Germany (connector words such as on, upon, y keep Carrick-on-Shannon and Pen-y-groes whole; German hyphenated names are one place), drops brackets, "and nearby" and statistical suffixes; `newsSearch()` tries the second place when the first has nothing recent. Re-run on the 36: 17 now have a brief. *New sources* (`src/lib/archive/sources.ts`): `councilNews()` (one 40-result search per council per run, shared by its areas); `redditTips()` (one Google search per council, `site:reddit.com`, local subreddits only: the council's, an area's own such as r/jacksonheights, or an alias such as r/chch; Google's title and snippet only, never Reddit's pages; leads only, and code drops a story whose only sources are Reddit); police and fire services found once per area (`discoverOfficial()`, Presseportal station feeds in Germany, a shared site search for services with no feed). Hits from another country's site are dropped (`isForeignSite()`: Christchurch, Dorset never reaches Christchurch, NZ; UK and Ireland one market), and so are property portals (`isListingSite()`; Baringa's brief was four listings). The quality page counts production stories the archive missed by the platform production sourced them from (first reading: web 58, Facebook 4, X 1). Fixes: overlapping audio runs deleted each other's files (per-process file names); the scorecard counted NYC and DC together. **Reddit commercial Data API access was requested 5 Oct** (Yous News, Inc., hello@yous.news, under $500 a month, about 1,200 calls a day); no reply is promised; follow up on the thread around 26 Oct. Tests: `npx tsx scripts/test-archive-names.mts`. **Rule: before adding sources for empty areas, check whether the sources already had the news and our own code threw it away; here half did.**


Recent work (2026-10-04): **The archive tier: a private, low-cost edition for every ~25,000-person area, on our own server.** Strategy (sent to Will Lewis 3 Oct): build OECD-wide first, sell to AI assistants (licensed feed and dated archive, crediting the local publisher) and to publishers (polish and pay for exclusive display). *Server:* Hetzner `archive-1` (Nuremberg, 2.28.231.169, SSH key `~/.ssh/yous_archive`, jobs run as user `archive`, keys in `~/.env`), systemd timers per map (`systemctl list-timers 'archive-*'`, logs in `~/logs/`). *Maps* (`data/areas/*.json`, builders in `scripts/areas/`): Germany 3,958 (Destatis Gemeinden, Wikidata Stadtteile), UK 2,835 (census MSOAs grouped town first, Scottish and NI wards; checked against the British Library newspaper title list with recency weighting, `validate_papers.py`), Ireland 166 LEAs, Australia 1,177 (ABS SA2 in SA3, state time zones), NZ 267 (SA2 in territorial authorities), NYC 197 residential NTAs, DC 39 clusters. *Pipeline* (`src/lib/archive/`, runner `scripts/archive/run.mjs`): Serper Google News search, the area's council site (found once, robots and TDM honoured), Bluesky and Mastodon; DeepSeek V4 Flash via OpenRouter with providers named and a price ceiling (OpenRouter's own price sort picked a provider charging 23x for output); every story tied to a source number by code; crime, death and namesake rules; stories whose only date is over a week old dropped; British/Australian/American register via `locale-register`. GDELT was tried and missed small towns. *Audio:* Piper on the server, uploaded to the private EU R2 bucket `yous-archive` (`scripts/archive/make_audio.py`); voices picked by ear (Germany Thorsten; Ireland VCTK p295; NI p238; Scotland alba; England, Wales, AU, NZ Jenny; US Ryan medium); Azure is to take over on a listener's first play once editions are served. *Quality* (`src/lib/archive/quality.ts`, `scripts/archive/quality.mjs`, page `/archive-quality?key=` = first 24 hex of sha256(`${CRON_SECRET}:archive-quality`)): nightly scorecard per map (coverage, production's fact matcher on a sample, namesake share, cost) and a side-by-side for 18 places production also covers (stories matched across languages by names and numbers, blind Llama 3.3 judge). First full German night: 3,873 areas, 60% with a brief on a Sunday, 94% of sampled stories confirmed on their source, about $0.002 per area per day all in. Tables `archive_area_sources`, `archive_editions`, `archive_events`, `archive_quality`. Nothing public reads any of it. **Rule: the cheap tier stays private until its scorecard clears agreed thresholds; a sold area moves to the full production engine.**

**Older sessions** are in `docs/history/recent-work.md` verbatim (and in more detail in `docs/CHANGELOG.md`). One line each, with the rule it taught:
- 2026-10-03: shadow trial of the open-weight route (Serper + DeepSeek, `?stage=openroute`), assistant-feed licence clauses. Needs `SERPER_API_KEY`.
- 2026-10-02 (later): `fetchPage` honours robots.txt and TDM opt-outs (`crawl-policy.ts`); German pilots Neuss, Oberkassel. **Rule: filter the inputs before a model writes, not its output after.**
- 2026-10-02: AI spend cut by a third (missing-brief monitor re-bought briefs; Grok only where it adds stories). **Rule: a self-healing fixer checks the thing is still missing before spending money.**
- 2026-09-30 (evening): AP/LMA towns (Clerkenwell, Gordes, Shreveport), English audio, showroom crime rule. **Rule: a catchment name that exists anywhere else needs its qualifier.**
- 2026-09-30: `widenSupportsToLines()` ties read pages to stories. **Rule: check how much of the text a tool actually credits before requiring a name in the passage.**
- 2026-09-29: publisher picks audio voice A to E (`voice-options.ts`, `/editor/<group>/voices`). **Rule: show customers labels, never vendors; a sample never substitutes another voice.**
- 2026-09-28: first live GEDI morning; audio fallback reads the edition text verbatim; `listingEventsStandAlone`. **Rule: a dry run that counts what each filter removes finds the cause faster than a prompt change.**
- 2026-09-27: GEDI email live; Italian audio guard knows translations; local-language event search; Norwegian added. **Rule: a guard checking a translated script must know the translations it will see.**
- 2026-09-25 (late): GEDI morning email, Italian display, Llama social judge, evergreen-filler rule, repeated-day paragraphs. **Rule: check a customer page in a real browser, in their language; a prompt rule the model ignores gets a narrow deterministic check.**
- 2026-09-25 (night): Italian daily audio edition (`edition-audio.ts`, Azure voices, never call them a dialect).
- 2026-09-25 (evening): editor desk `/editor/[group]` and `editorial_decisions`. **Rule: an approval gate fails closed.**
- 2026-09-24 (evening): tiered sourcing standard (shadow), every source archived at publish (`source-archive.ts`). **Rule: measure a sourcing rule on real stories before switching it on.**
- 2026-09-24 (later): shadow model trial (`model-trial.ts`). **Rule: judge a model migration on our own inputs and checks, side by side.**
- 2026-09-24: the writer invented URLs because the JSON example asked for one; `source-repair.ts`. **Rule: never ask a model for a URL; a source URL is one a tool returned.**
- 2026-09-23 (later): grounding and Grok citations were dropped by our parsers; `source-check.ts`. **Rule: before concluding a model does not cite, check whether our parser dropped the citations.**
- 2026-09-23: per-publisher edition rules (`edition-rules.ts`, GEDI group). **Rule: a promise to a publisher about what will not publish is a deterministic check at every insert path.**
- 2026-09-21: Australian English (`australianStyleBlock`), `model-refusal.ts`, APAC Look Ahead schedule, `search-catchment.ts`, AAP pilots (keep until 29 Oct 2026), Zaragoza, Vorarlberg, desk story flags. **Rules: check which direction a substitution runs and whether the prompt asks for the error; every path writing to `articles` needs a refusal check; gate on local hour, not UTC windows; when centralising a function, grep for every private copy.**
- 2026-09-18/19: pilots published weekly (`shouldGenerateToday` now delegates to `isPriorityNeighborhood`), teaser lines, invented dialect, placeholder sources, missing `[data-theme="dark"]`, `ShowroomBar`, catchment population rule. **Rule: when two functions answer the same question, one must call the other.**
- 2026-09-14: US namesake events in UK/IE editions (`place-boundary.ts`, `isVenueAbroad()`), British register (`locale-register.ts`). **Rules: naming a country describes, only a per-item rejection test excludes; a prompt rule needs a deterministic check; review every deletion a backfill makes.**
- 2026-09-11: pilot allowlist + prewarmed translations; `stripLeakedTeasers()`. **Rules: a pilot is an allowlist entry plus a language, never a code fork; any JSON field can also leak into the prose.**
- 2026-09-10: search 500s under RLS. **Rule: text search on an RLS table runs with the service role and filters published itself.**
- 2026-09-09: placeholder sources and grounding redirect URLs (`source-links.ts`). **Rule: never store a placeholder name or a grounding redirect URL as a source.**
- 2026-09-03: mock feature stories published for 137 days. **Rule: mock fallbacks need an explicit env flag; never publish a story whose only source is a placeholder.**
- 2026-09-01: audio bulletin Ireland-only pool rule.
- 2026-06-14: Sunday missed-email resend loop. **Rule: per-person email guards key on email.**
- 2026-06-07: cold neighbourhoods are intentionally lean (not a bug); lazy translation; `checkTranslationFallback`.
- Earlier (May 2026): canonical/SEO fixes, sitemap, sync-news on Gemini Flash, AI cost instrumentation, generation cadence gate, signup funnel, partner/broker work.

**Feature reference** (moved out of this file; read the one a task touches):
- `docs/features/reader-experience.md` - email capture, PWA, homepage front door, onboarding, **auth**, **language translation**, enrichment-gated brief publishing, **Look Ahead articles**, mobile UX, referrals, suggest-a-neighbourhood, community neighbourhoods, dynamic house ads, add-to-collection CTA.
- `docs/features/email-and-ads.md` - **email system** (scheduler, assembler, sender, Sunday Edition, weather, templates, ad rotation) and **ad system** (pricing, booking, Stripe, approval).
- `docs/features/syndication-and-partners.md` - Irish briefs syndication API, story rewrite API, audio bulletin, agent partner (white-label) system, broker outreach and drip.

## Key Patterns

### Feed Neighborhood Cookie
- **Cookie:** `flaneur-neighborhoods` - comma-separated neighborhood IDs, `SameSite=Strict`, `path=/`, 1-year `max-age`
- **Source of truth:** DB `user_neighborhood_preferences` for logged-in users (synced to localStorage on mount + tab focus via `useNeighborhoodPreferences`). `flaneur-neighborhood-preferences` localStorage for anonymous users. Cookie is a sync copy for server-side reading.
- **Server reading:** `feed/page.tsx` reads `cookies().get('flaneur-neighborhoods')` from `next/headers` to pre-fetch articles, briefs, weather, ads server-side.
- **Sync points:** Cookie is synced from localStorage at every navigation to `/feed` - inline `<script>` in `layout.tsx` (pre-hydration), plus explicit `document.cookie` set before `router.push('/feed')` or `router.refresh()` in all client components that modify neighborhoods.
- **Utility:** `src/lib/neighborhood-cookie.ts` - `NEIGHBORHOODS_COOKIE` constant, `syncNeighborhoodCookie()` client function
- **Why cookie not URL:** Prevents long URLs with 25+ neighborhoods, prevents abuse (anyone could construct a custom feed URL), `SameSite=Strict` keeps data browser-local
- **Clearing:** `NeighborhoodSelectorModal.clearAll()` sets cookie to empty (`max-age=0`)

### Primary Neighborhood Sync
- **Endpoint:** `POST /api/location/sync-primary-neighborhood` - syncs primary neighborhood change to DB for email scheduler
- **Called from:** `useNeighborhoodPreferences.setPrimary()` (fire-and-forget, covers ContextSwitcher, modal, drag-reorder)
- **Logic:** Uses `getSession()` (not `getUser()`), looks up neighborhood city, updates `profiles.primary_city`/`primary_neighborhood_id`, only sets `primary_timezone` when null (first-time setup). Timezone is a user preference (physical location), not derived from neighborhood - a reader in Stockholm following NYC neighborhoods should get email at 7 AM Stockholm time. Triggers instant resend on any primary change (same city or different).
- **DB columns:** `profiles.primary_city` (text), `profiles.primary_timezone` (text), `profiles.primary_neighborhood_id` (FK to neighborhoods.id)
- **Email scheduler:** Uses `primary_neighborhood_id` directly if set, falls back to first neighborhood matching `primary_city` for backwards compatibility
- **Anonymous users:** Silent no-op (returns success)

### Cron Jobs
- All in `src/app/api/cron/[job-name]/route.ts`
- Auth: `x-vercel-cron` header or `CRON_SECRET`
- **MUST** log to `cron_executions` table
- Use `maxDuration = 300` for long-running jobs
- Use time budgets to ensure logging completes in `try/finally`

### Daily Content Health Monitor
- **Cron:** `check-daily-health` (`0 10 * * *`, maxDuration=60)
- **9 checks:** Brief coverage, content quality (enrichment + paragraph count), hyperlinks in enriched content, HTML artifacts in article bodies, translation coverage, email delivery, story images, editorial sources (brief_summary/look_ahead/weekly_recap articles shouldn't have source rows), URL-encoded text (`%20`/`%2C`/etc. in article bodies)
- **Output:** Creates `cron_issues` for auto-fixable problems (picked up by `monitor-and-fix` on next 30-min cycle), emails admin summary report with pass/warn/fail per check
- **Issue types:** `missing_sunday_edition` (manual), `unenriched_brief` (auto-fix via re-enrichment), `thin_brief` (manual), `missing_hyperlinks` (auto-fix via re-enrichment), `html_artifact` (manual), `editorial_sources` (auto-fix: delete inappropriate source rows), `url_encoded_text` (auto-fix: decodeURIComponent on body)
- **Auto-fixer (`monitor-and-fix`):** Runs every 30 min. `getRetryableIssues()` fetches up to 50 open issues from the last 7 days, newest first. Route dispatches all fixable types through `attemptFix()` with per-type rate limits: images (5/run), thin content (10/run), emails (10/run), enrichment i.e. unenriched_brief + missing_hyperlinks (5/run, 2s delay), DB-only fixes like missing_sources/url_encoded_text (no limit). Non-auto-fixable types (job_failure, html_artifact, thin_brief) are skipped. Enrichment fixes look up the actual brief UUID from `neighborhood_briefs` table before calling `enrich-briefs` endpoint (was previously passing `neighborhood_id` which is not a UUID, causing all enrichment fixes to fail).
- **Files:** `src/lib/cron-monitor/health-checks.ts` (check functions), `src/lib/cron-monitor/auto-fixer.ts` (auto-fix handlers), `src/lib/cron-monitor/health-report-email.ts` (email template), `src/app/api/cron/check-daily-health/route.ts` (cron endpoint), `src/app/api/cron/monitor-and-fix/route.ts` (auto-fix cron), `src/lib/cron-monitor/issue-detector.ts` (issue detection + retryable query), `src/lib/cron-monitor/types.ts` (FIX_CONFIG constants)

### Daily Writing Quality Review
- **Cron:** `review-writing-quality` (`0 11 * * *`, maxDuration=120)
- **Sampling:** 3 random active-subscriber neighborhoods for daily briefs + 3 different ones for look-ahead articles, 7 most recent items per neighborhood (enriched_content from neighborhood_briefs, body_text from articles where article_type=look_ahead)
- **Analysis:** Shared editorial prompt sent to Gemini Pro 2.5 and Claude Sonnet in parallel via `Promise.allSettled()`. Benchmarks against FT HTSI, Morning Brew, Monocle, Puck, Airmail, Vanity Fair. Sections: Grok search query recommendations, writing persona/style recommendations, engagement/shareability, biggest single improvement.
- **Output:** HTML email to `ADMIN_EMAIL` (fallback `contact@readflaneur.com`) with both analyses. Full analyses stored in `cron_executions.response_data` for historical reference.
- **Cost:** ~$0.27/day (~$8.10/month). Recommendations-only - no automatic prompt/persona changes.
- **File:** `src/app/api/cron/review-writing-quality/route.ts`

### Article Deduplication (sync-news)
- **RSS articles:** Deterministic `generateSlug()` (djb2 hash, no timestamp) + source URL check in `editor_notes`
- **Grok articles:** Headline similarity check (first 40 chars, same neighborhood, last 24h) + deterministic slug
- **Fashion week:** Slug includes day number; prompt requires "Day N" in headline with day-specific angle

### Gemini Search - Dual-Source Fact-Gathering
- **File:** `src/lib/gemini-search.ts` - parallel second fact-gatherer alongside Grok using Gemini Flash with Google Search grounding
- **Architecture:** `Promise.allSettled([grokCall, geminiCall])` - zero latency increase (Gemini Flash ~5-10s finishes before Grok ~25-30s)
- **Model:** `gemini-2.5-flash` with `tools: [{ googleSearch: {} }]`, temperature 0.5. Stays within 10K RPD budget.
- **Retry:** Exponential backoff (2s/5s/15s) on 429/RESOURCE_EXHAUSTED, reused from `brief-enricher-gemini.ts`
- **Daily briefs (`searchNeighborhoodFacts()`):** Targets what Grok misses - official event calendars, local newspaper articles, city government announcements, restaurant/retail openings, real estate listings. `recentTopics` param injects last 5 brief headlines to break repetition cycles. Returns raw bullet-point facts.
- **Look Ahead (`searchUpcomingEvents()`):** Targets gallery exhibitions, museum schedules, restaurant openings, concert/theater listings, farmers markets, pop-ups, community board meetings. Returns `StructuredEvent[]` (same type from `look-ahead-events.ts`) + prose text. Multiple search angles per neighborhood.
- **Merging (`mergeContent()`):** If both sources succeed, Gemini facts appended with `\n\nALSO NOTED:\n` label so enrichment step understands supplemental material. If only one succeeds, uses whichever is available.
- **Event dedup (`mergeStructuredEvents()`):** Deduplicates by name similarity (substring match + word overlap > 0.7), keeps entry with more fields, sorts chronologically.
- **Integration points:** `sync-neighborhood-briefs` (daily briefs), `generate-look-ahead` (Look Ahead articles), `weekly-brief-service.ts` (Sunday Edition Horizon events - always-dual, max 5 events up from 3)
- **Anti-repetition:** Gemini prompt explicitly avoids recently covered topics. Targets institutional sources (gallery calendars, official event listings) that Grok's X-heavy search surface misses.
- **Cost:** ~$0.70/day (~$21/month) for ~350 additional Gemini Flash calls
- **Enrichment prompt rules:** ONE STORY PER SECTION (each story gets own header/paragraph), STORY ORDER (recency-first for daily briefs, consequential-first for Sunday Edition, noteworthy-first for Look Ahead)

### Gemini Enrichment (enrich-briefs)
- **Model strategy:** Pro for briefs, Flash for articles. Phase 1 (daily briefs) always uses `gemini-2.5-pro` for highest quality. Phase 2 (RSS articles) always uses `gemini-2.5-flash`. Model split logged in `response_data` (`model_pro_used`/`model_flash_used`).
- **Schedule:** `*/15`, batch size 30, concurrency 4, Phase 1 budget 200s
- **Backoff:** Exponential retry on 429/RESOURCE_EXHAUSTED (2s, 5s, 15s delays)
- **Early termination:** Drains queue if any batch call hits quota
- **Two phases:** Phase 1 = briefs (200s budget, Pro), Phase 2 = RSS articles only (remaining ~80s, Flash). Phase 2 skips `brief_summary` and `look_ahead` articles — they're already enriched by their own pipelines and must not be re-enriched with the wrong style.
- **Greeting:** CRITICAL formatting rule requires "Good morning, {neighborhood}" as the very first line of every daily brief. Reinforced in both style section and formatting rules to ensure Pro compliance.
- **Language:** Prompt requires English output with local language terms sprinkled in naturally (Swedish greetings, French venue names, etc.). Prevents Gemini from writing entirely in the local language when searching local-language sources.
- **Daily framing:** Prompt explicitly states "This is a DAILY update" and prohibits weekly/monthly framing ("another week", "this week's roundup")
- **Link preservation:** Gemini's Google Search grounding naturally includes markdown links in prose. These are preserved in `enriched_content` (not stripped). Render-time components convert them to clickable `<a>` tags. **Fallback link extraction:** When Gemini omits `link_candidates` from its JSON response (~30% of the time), `extractFallbackLinkCandidates()` extracts entity names from `[[section headers]]` in the enriched prose - these reliably contain business/venue/event names worth hyperlinking. Filters out generic headers (greetings, day/date references, common phrases).
- **Continuity context:** `fetchContinuityContext()` in cron fetches last 5 enriched briefs (headline + 200-char sentence-truncated excerpt) and last 3 days of non-brief articles (headline + article_type). Injected as `RECENT COVERAGE CONTEXT` block in prompt. Enables natural back-references ("as we noted Tuesday..."). ~300-800 extra tokens per prompt. Optional param (`continuityContext`), backward compatible. Only applies to daily briefs (not weekly recaps). Non-fatal on fetch failure.
- **Subject teaser:** Gemini generates a 1-4 word "information gap" teaser in the enrichment JSON response (`subject_teaser` field). Stored in `neighborhood_briefs.subject_teaser`. Validated: 1-5 words, max 40 chars. Zero extra API calls. **Dual use:** (1) Email subject lines via sender.ts - lowercase format `{teaser}, {neighborhood}` (e.g., "heated school meeting, upper west side"); (2) Article headlines via `generate-brief-articles` and assembler.ts fallback - Title Case via `toHeadlineCase()` (e.g., "Heated School Meeting"). Falls back to Grok-generated headline when null. No circular dependency: email reads from `neighborhood_briefs.subject_teaser` directly, article headline stored separately in `articles.headline`.

### Brief Generation Timezone Handling (sync-neighborhood-briefs)
- **Morning window:** Midnight-7 AM local time (28 chances at `*/15`, survives 6h cron gaps). Starts at midnight to give 7h for full pipeline before 7 AM email.
- **Concurrency:** 5 parallel Grok calls per run (~45 briefs per run vs ~9-10 sequential). Each Grok brief takes ~25-30s.
- **Dedup (3 layers):** (1) `UNIQUE(neighborhood_id, brief_date)` DB constraint - absolute guarantee, (2) pre-Grok real-time `brief_date` check before expensive API call, (3) batch filter queries `brief_date` column for yesterday/today/tomorrow (~810 rows, under 1000-row cap). `brief_date DATE NOT NULL` column stores the local date at generation time. All 3 INSERT sites (sync-neighborhood-briefs, neighborhoods/create, auto-fixer) include `brief_date` and handle `23505` unique_violation gracefully.
- **Anti-repetition (separate concern):** Recent headlines fetched via separate 7-day query with `.limit(1000)` for Grok's `recentTopics` param. Not used for dedup.
- **Content sanitization:** Both `grok.ts` and `NeighborhoodBrief.cleanContent()` strip raw Grok search result objects (`{'title': ..., 'url': ...}`) that occasionally leak into brief text
- **Grok citation stripping:** All Grok headline parsing must strip citation markers (`[[1]](url)`, `[1]`, `(1)`) via a 4-pattern regex chain (remove `[[n]](url)`, remove `[n]`, remove `(n)`, collapse double spaces). Applied in `generateNeighborhoodBrief()`, `generateGrokNewsStories()`, and `generateLookAhead()`. Without this, URLs leak into headlines and slugs.

### Image Library (Unsplash Stock Photos)
- **Core:** `src/lib/image-library.ts` - types, `selectLibraryImage()`, `getLibraryReadyIds()`, `checkLibraryStatus()`, module-level LRU cache (1hr TTL) for Unsplash photos
- **Unsplash client:** `src/lib/unsplash.ts` - API client with interleaved dual-query search in `searchAllCategories()`: two parallel searches `"{name} {city} architecture lifestyle"` (30 results, editorial shots) + `"{name} {city} street photography"` (30 results, candid shots), both including city name to prevent generic name pollution (e.g., "West Village" returning African villages). Interleaved via 3:1 merge and deduped by photo ID so editorial shots dominate while candid adds variety. Falls back to city-only `"{city}"`, then `"{broaderArea}"` (province/region from `neighborhoods.broader_area`), then `"{city} {country}"` if combined results < 8. Accepts optional `country` and `broaderArea` params. Throws on rate limit (403/429) so crons can stop early. Triggers download endpoint for attribution tracking (required by Unsplash terms). Cost: 2 API calls per neighborhood (well within 5000/hr budget).
- **Generator:** `src/lib/image-library-generator.ts` - calls `searchAllCategoriesWithAlternates()`, stores results in `image_library_status.unsplash_photos` JSONB + overflow in `unsplash_alternates` JSONB. Fetches `rejected_image_ids` before search to exclude blacklisted photos. Passes `broader_area` from `NeighborhoodInfo` for regional fallback. ~200ms per neighborhood. Returns `{ photos_found, errors }`.
- **Unsplash CDN URLs:** Hotlinked per Unsplash terms (no downloading/re-hosting). Format: `images.unsplash.com/...&w=1200&q=80&fm=webp`. Already in `next.config.ts` remotePatterns.
- **Categories (8 per neighborhood):** `daily-brief-1/2/3`, `look-ahead-1/2/3`, `sunday-edition`, `rss-story`. ALL article types rotate across the full pool (8 category photos + up to 40 alternates). Rotation index always includes `djb2(neighborhoodId)` offset so different neighborhoods (especially combo components like nyc-tribeca and nyc-fidi) never collide on the same photo. When `articleIndex` is provided, uses `(articleIndex + neighborhoodOffset) % poolLength`. Otherwise uses `(getDayOfYear() + typeOffset + neighborhoodOffset) % poolLength` where `typeOffset` varies by article type (brief_summary=0, look_ahead=7, weekly_recap=13, standard=19). Category-based selection is only a fallback when the pool has fewer than 2 photos.
- **Selection (sync):** `selectLibraryImage(neighborhoodId, articleType, categoryLabel?, libraryReadyIds?, articleIndex?)` - checks Unsplash cache. For RSS/news articles with `articleIndex`, builds combined pool from `cached.photos` + `cached.alternates` for maximum variety. Returns `''` on cache miss. All 273 neighborhoods have Unsplash photos.
- **Selection (async):** `selectLibraryImageAsync(supabase, neighborhoodId, articleType, categoryLabel?, articleIndex?)` - tries sync cache first, then queries DB directly (fetches both `unsplash_photos` and `unsplash_alternates`). Same full-pool logic for RSS/news articles. Returns Unsplash URL or `''`.
- **Cache preload required:** All crons using `selectLibraryImage()` must call `preloadUnsplashCache(supabase)` at startup. The Unsplash photos and alternates live in `image_library_status.unsplash_photos` and `unsplash_alternates` JSONB and are loaded into an in-memory module-level cache (`CacheEntry` = `{ photos, alternates, timestamp }`). Without preloading, `selectLibraryImage()` returns `''`. Applies to 7 crons: generate-brief-articles, generate-look-ahead, generate-guide-digests, sync-news, sync-weekly-brief, generate-community-news, retry-missing-images.
- **Attribution:** Article pages (`[slug]/page.tsx`) display "Photo by [Name] on Unsplash" with UTM-tagged links below Unsplash images. Credit resolved from `image_library_status.unsplash_photos` JSONB.
- **Admin endpoint:** `POST /api/admin/generate-image-library` - single (`neighborhoodId`) or batch mode. `GET` returns status counts.
- **Automated refresh:** `refresh-image-library` cron (`0 */4 * * *`, every 4 hours). Stops on rate limit. Triggers on: no Unsplash photos, empty alternates (backfill), or different season (quarterly variety). Emails admin on completion.
- **Rate limits:** Production: 5000/hr (all 273 in one run).
- **Cost:** $0 (Unsplash API is free)
- **DB:** `image_library_status` table - `unsplash_photos` JSONB column stores `{ "category": { id, url, photographer, photographer_url, download_location } }` per neighborhood. `unsplash_alternates` JSONB stores overflow photos (up to 40) for swap pool. `rejected_image_ids` TEXT[] blacklists photo IDs that received negative feedback. Legacy `images_generated` column kept for backward compat.
- **Fallback chain:** Unsplash cache → empty string (retry-missing-images fills later). Async path: Unsplash cache → DB lookup → empty string. Legacy Supabase Storage URLs eliminated (files don't exist). **Unsplash search fallback:** `"{name} {city}"` + `"{name}"` (primary, interleaved) → `"{city}"` → `"{broader_area}"` (province/region) → `"{city} {country}"`. The `broader_area` step helps small towns (Utrera → "Seville") and resort areas (Cap Ferrat → "Cote d'Azur") that produce few results with name/city alone.
- **generate-image endpoint:** Library lookup + sensitive headline check + SVG placeholder only (no more Gemini Image generation)
- **retry-missing-images cron:** Library-only (no generate-image fallback). Skips HEAD check for Unsplash CDN URLs. Phase 3: calls `get_negative_images(-2)` RPC to find Unsplash URLs with score <= -2, resolves neighborhood via articles table, calls `swapNegativeImage()` to replace bad photo with alternate.
- **Negative image swap:** `swapNegativeImage(supabase, neighborhoodId, badImageUrl)` in `image-library.ts` - finds category holding bad URL, swaps in first alternate, bulk-updates all articles, blacklists old photo ID in `rejected_image_ids`, invalidates cache, triggers Unsplash download attribution. Returns `{ oldUrl, newUrl, articlesUpdated, newPhotographer }` or null.
- **RPC:** `get_negative_images(threshold)` - returns `{image_url, score}` for Unsplash URLs with aggregate feedback score <= threshold. Index on `image_feedback(image_url)` for efficient aggregation.
- **Cron category images:** `src/lib/cron-images.ts` - `getCronImage(category, supabase, { neighborhoodId })` prefers Unsplash library photos when `neighborhoodId` is provided (DB lookup for `image_library_status.unsplash_photos`). Uses deterministic `getDayOfYear() + djb2(neighborhoodId)` rotation (not `Math.random()`) so different neighborhoods always get different photos. Falls back to AI cached images in Supabase Storage `cron-cache/` only when no Unsplash photos exist. All 28 specialized crons pass `neighborhoodId` per-article. `retry-missing-images` also detects and replaces existing `cron-cache/` AI images with Unsplash.

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
- **Timezone tooltip:** "Change my Timezone" button shows hover tooltip explaining it controls 7am email delivery time. Panel description shows current saved timezone: "(7 am local time, currently Europe/Stockholm)". `currentTimezone` state populated from `flaneur-profile.timezone` (authenticated) or `flaneur-primary-location.timezone` (anonymous) on modal open. Manual save syncs timezone to DB via `/api/preferences` with `forceTimezone: true` and updates `flaneur-profile` cache.

### Neighborhoods Page
- **Page:** `/destinations` (`src/app/destinations/page.tsx`) - server component fetches all active neighborhoods + Unsplash photos, passes to `DestinationsClient`. Page title "Neighborhoods - Flaneur". Nav link reads "Neighborhoods" (translated in all 9 languages).
- **Split view:** Scrollable card grid (left, `flex-1`) + sticky Leaflet map (right, `md:w-[40%] lg:w-[45%]`). Map collapsible on mobile. No page heading ("Our Neighborhoods" removed).
- **Components:** `DestinationsClient` (main layout + search + state), `DestinationCard` (4:3 Unsplash card with text below image), `DestinationsMap` (Mapbox GL JS with circle markers, popups, flyTo)
- **Search bar:** Clean search input at top of card grid with fuzzy matching via `resolveSearchQuery()` (Levenshtein edit distance, handles typos like "auk" for Auckland). Debounced 200ms. Sort dropdown: Nearest (geolocation), A-Z, Region. Replaces the old LC-style 4-button filter system (ALL FILTERS/COASTAL/SLOPES/COLLECTIONS removed).
- **Card layout:** Text (name, city, country) rendered below image. Grid is 2-column. Community badge in text area.
- **Save button:** Expedia-style pill button (`rounded-full border`) with heart icon + "Save"/"Saved" text label. Reads/writes `flaneur-neighborhood-preferences` localStorage, syncs cookie via `syncNeighborhoodCookie()`, fire-and-forget DB sync via `/api/neighborhoods/add` (adding) and `/api/neighborhoods/save-preferences` (removing). Confirm dialog on unsave.
- **Unified save concept:** Save = add to feed + get daily briefs. No separate lists system. The old `destination_lists`/`destination_list_items` DB tables, `useDestinationLists` hook, `AddToListModal`, `/api/lists/` routes, and `/lists/[shareToken]` shared list page have been removed (~1,575 lines deleted).
- **Images:** Unsplash photos from `image_library_status.unsplash_photos` JSONB, resized to `w=600` for card thumbnails.
- **Map:** Mapbox GL JS (dynamic import, client-only), GeoJSON circle layer with data-driven styling for hover/selected states. Dark grey dots (#444444 fill, white #ffffff stroke 1.5px). Mapbox styles: `streets-v12` (light), `dark-v11` (dark). Popup on hover. FlyTo zoom 9. Map bounds filter bidirectional with card grid.
- **WishlistDropdown:** `src/components/layout/WishlistDropdown.tsx` - heart icon button in header. Outline heart when empty, filled + amber count badge when items exist. Shows "MY NEIGHBORHOODS" header + scrollable list of saved neighborhoods from `flaneur-neighborhood-preferences` localStorage with names/cities fetched via `/api/neighborhoods/details`. Filled hearts for inline removal with confirm. "Browse neighborhoods" footer link to /destinations. Fixed positioning with z-index 9999.

### Swagger API Documentation
- **Page:** `/api-docs` - public Swagger UI page
- **Spec endpoint:** `GET /api/docs` - returns OpenAPI 3.0 JSON spec
- **Config:** `src/lib/swagger.ts` - central OpenAPI config with tags, security schemes, reusable schemas
- **Coverage:** 151 paths, 172 methods across 24 tags (Auth, Neighborhoods, Briefs, Feed, Ads, Lists, Explore, Cron, Admin, Internal, etc.)
- **How to add:** Add `/** @swagger */` JSDoc block above `export async function` in any `route.ts` - `next-swagger-doc` auto-discovers them
- **Dependencies:** `next-swagger-doc`, `swagger-ui-react`, `@types/swagger-ui-react`
- **Security schemes:** `supabaseAuth` (cookie), `cronSecret` (header)
- **Reusable schemas:** `Error`, `Neighborhood`, `ArticleSummary`, `ReactionCounts`, `DestinationList`, `ExploreSuggestion`

### Article Search
- **Page:** `/search` (`src/app/search/page.tsx`) - full-page search with X close button (`router.back()`), rounded-lg inputs/buttons/cards
- **API:** `GET /api/search?q={query}` - searches articles by headline, body, preview text via Supabase `ilike`. Max 50 results.
- **Header icon:** Magnifying glass in both desktop nav and mobile icon bar, links to `/search`
- **Results:** Thumbnail + neighborhood (uppercase tracked) + time ago + headline. Excerpts hidden on mobile.

### Combo Neighborhoods
- `src/lib/combo-utils.ts` — `getNeighborhoodIdsForQuery()`, `getComboInfo()`, `getComboForComponent()`
- Articles stored under component IDs (e.g., `nyc-fidi`, `nyc-tribeca-core`), not the combo ID (`nyc-tribeca`)
- Query must include BOTH combo ID and component IDs — use `combo_neighborhoods` table to expand
- `/feed` page does early combo expansion via `combo_neighborhoods` table, passes `combo_component_ids` to client components. `MultiFeed` uses `in.(id1,id2,id3)` for REST queries when a combo pill is selected.
- Article detail page uses `getComboForComponent()` to show parent combo name as a breadcrumb link for component neighborhood articles
- Dedicated neighborhood pages (`/[city]/[neighborhood]/page.tsx`) already use `getNeighborhoodIdsForQuery()` — no fix needed

### Reactions System
- **Table:** `article_reactions` (bookmark, heart) — replaces comments. Fire emoji removed.
- **API:** `src/app/api/reactions/route.ts` — GET counts, POST toggle
- **Saved:** `src/app/api/reactions/saved/route.ts` + `/saved` page
- **Component:** `src/components/article/ArticleReactions.tsx` — compact inline (no borders), optimistic UI, anonymous via localStorage
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
- **Current models:** Claude Sonnet 4.5, Gemini 2.5 Flash (enrichment fallback/translation), Gemini 2.5 Pro (enrichment primary + Sunday Edition, 1K RPD budget), Grok 4.1 Fast. Image library now uses Unsplash API (no AI image generation).
- **Import pattern:** `import { AI_MODELS } from '@/config/ai-models'` then use `AI_MODELS.GEMINI_FLASH` etc.
- **Flash thinking disabled:** All Flash calls must include `thinkingConfig: { thinkingBudget: 0 }` to avoid hidden thinking tokens billed at $2.50/M. New SDK (`@google/genai`): add to `config` object. Old SDK (`@google/generative-ai`): use `gemini-2.0-flash` model instead (doesn't support thinkingConfig). Pro keeps thinking enabled for daily brief enrichment quality.
- **Cron metadata:** DB `ai_model` fields use short names (`'gemini-2.5-flash'`, `'claude-sonnet-4-5'`) not full version IDs

## Critical Gotchas

### Supabase Data-API Grants on New Tables (October 30, 2026 cutover)
After October 30, 2026, new tables in `public` schema do NOT auto-expose to the Data API (supabase-js / PostgREST / GraphQL). Every `CREATE TABLE` migration must include explicit GRANT statements or the API returns `42501`. Pattern for new tables:
```sql
CREATE TABLE IF NOT EXISTS public.your_table (...);

-- Grants required for Data API access (post Oct 30, 2026)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO service_role;
GRANT SELECT ON public.your_table TO anon;                            -- only if anonymous reads needed
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO authenticated;  -- only if client-side writes needed

-- RLS + policies as before
ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "..." ON public.your_table FOR ALL USING (auth.role() = 'service_role');
```
**Existing tables** (everything created before October 30) keep their current grants. Only NEW tables created after the cutover need this. To audit: Supabase Dashboard → Database → Advisors → Security.

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

### Gmail Strips Anchor Links
Never use `<a href="#section-id">` in email templates — Gmail strips anchor hrefs entirely. Use plain `<Text>` labels instead (e.g., "Family Corner below" instead of a jump link).

### No Em Dashes
Never use em dashes (—) in user-facing text. Use hyphens (-) instead. Em dashes look AI-generated.

### Theme System (Light/Dark)
- **Default:** Dark mode. Toggle via sun/moon icon in Header (desktop nav + mobile hamburger area)
- **localStorage key:** `flaneur-theme` (`'dark'` | `'light'`, absence = dark)
- **Flash prevention:** Inline `<script>` in `layout.tsx` sets `data-theme` attribute before first paint
- **CSS variables:** Semantic tokens in `globals.css` `:root` (dark) and `[data-theme="light"]` (light)
- **Hook:** `useTheme()` from `src/hooks/useTheme.ts` - `{ theme, setTheme, toggleTheme }`
- **Component:** `ThemeToggle` from `src/components/layout/ThemeToggle.tsx`
- **Semantic Tailwind classes:** `text-fg`, `text-fg-muted`, `text-fg-subtle`, `bg-canvas`, `bg-surface`, `bg-elevated`, `border-border`, `border-border-strong`, `hover:bg-hover`, `hover:text-fg`, `text-accent`, `text-accent-muted`
- **Accent color:** `--theme-accent` - `#fbbf24` (amber-400) in dark, `#b45309` (amber-700) in light. Use `text-accent` for selected/interactive states that need contrast in both themes. `text-accent-muted` for softer variant.
- **Light palette:** Stone shades (warm undertone) - canvas `#fafaf9`, surface `#ffffff`, fg `#1c1917`
- **Dark palette:** Canvas `#050505`, Surface `#121212`, fg `#e5e5e5`
- **Buttons:** `.btn-primary` = `bg-fg text-canvas` hover amber-600, `.btn-secondary` = `bg-transparent text-fg border-border-strong`, `.btn-ghost` = `text-fg-muted` hover text-fg
- **Header:** `.header-bg` class (CSS var `--theme-header-bg`) + `backdrop-blur`, `border-border`
- **Force-dark sections:** Homepage hero, discover hero, invite hero use `data-theme="dark"` to scope all children to dark CSS variables
- **Gradient fades:** Use `from-canvas` (tracks theme automatically)
- **Article prose:** Semantic text classes (`text-fg`, `text-fg-muted`) instead of `prose-invert`
- **DO NOT touch:** email templates in `src/lib/email/` (must stay light for mail clients)
- **DO NOT touch:** `src/components/home/` (hero components, excluded from theme sweep)

### Homepage Hero ("Cinematic Dark Mode")
- **Background:** `bg-black` base + `radial-gradient(ellipse at top, rgba(30,30,30,1), rgba(0,0,0,1) 70%)` overlay for tonal depth (CSS-only, no image asset)
- **FLANEUR:** `text-6xl md:text-7xl lg:text-8xl` Cormorant Garamond serif, `tracking-[0.3em]`. Plain `<h1>` (no link wrapper - the "Read Stories" button is the CTA).
- **Tagline:** `tracking-[0.5em] uppercase`, `text-sm md:text-base`, neutral-400
- **Animations:** Staggered `heroFadeIn` keyframes in `globals.css` - 1.5s ease-out with 0.3s delays between elements (logo, tagline, stats, rule, "Read Stories" button at delay-4/1.2s)
- **Padding:** `py-28 md:py-36 lg:py-48` for cinematic breathing room
- **No neighborhood chips:** Homepage shows only hero + stats + button. `HomeSignupEnhanced` (with neighborhood chips) removed from homepage, kept on `/discover`.

### NeighborhoodHeader (Feed Page)
- **Mode prop:** `mode: 'single' | 'all'` (default `'single'`). Controls masthead content and control deck layout.
- **Masthead (single):** Centered `text-center pt-8`. City label, serif neighborhood name, italic combo sub-line, `NeighborhoodLiveStatus` with `mb-8`.
- **Masthead (all):** Centered `text-center pt-2 md:pt-6` (tighter mobile). "My Neighborhoods" heading (clickable - opens NeighborhoodSelectorModal) + "{N} locations" subtitle when no pill active. When a pill is active: neighborhood name + city inline on same baseline (`flex items-baseline justify-center gap-2.5`), combo component names on subtitle line below, Maps/History links, LiveStatus. Subtitle conditionally rendered (not fixed-height invisible). **Desktop compact bento masthead:** When bento grid is shown (`isMultiple && !activeFilter`), full NeighborhoodHeader is hidden on ALL screens (`hidden` not `md:hidden`) and replaced by compact row with "My Neighborhoods · {N} locations" on left + "PRIMARY NEIGHBORHOOD {name} {weather/time}" on right (translated via `feed.primaryNeighborhood`). Uses `items-baseline` for cross-size text alignment. Always visible without flash (condition is `isMultiple` not bento-data-dependent). **Mobile wake-up indicator:** `md:hidden` section in MultiFeed shows serif primary neighborhood name + grey city on left with `NeighborhoodLiveStatus` on right, directly above Daily Brief card.
- **Maps/History links (all mode):** Small grey dotted-underline links (`text-xs text-neutral-500 decoration-dotted`) under neighborhood name. Only shown when a specific pill is active. Same URLs as single-mode MAP/HISTORY.
- **NeighborhoodLiveStatus:** `font-mono text-xs font-medium tracking-[0.2em] text-amber-600/80`. Clickable - Google weather. Accepts `initialWeather` prop for server-side pre-fetch (skips client fetch when provided).
- **Control Deck:** CSS Grid `grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]` for overflow-safe centering. Left: `<ContextSwitcher>` (truncates long names), Center: GUIDE/MAP/HISTORY `hidden md:flex` on desktop, `...` overflow dropdown on mobile (`md:hidden`), Right: ViewToggle.
- **ContextSwitcher:** `src/components/feed/ContextSwitcher.tsx` - dropdown trigger (`{LABEL} ▾`, truncated `max-w-[80px] md:max-w-[200px]`) + popover (`bg-surface border-border-strong w-64 z-30`). Sections: "All Neighborhoods" (layers icon), neighborhood list (dot + name + city + primary badge + "Set primary" on hover with `hover:text-accent`), "Customize List..." (opens modal), "The Front Door" (house icon, links to `/discover`), "Invite a Friend" (via ShareWidget, shown only to subscribers). Click-outside + Escape close.
- **useNeighborhoodPreferences:** `src/hooks/useNeighborhoodPreferences.ts` - reads localStorage IDs, fetches name/city from Supabase, cross-tab sync via `storage` event. Exposes `primaryId` and `setPrimary(id)` to reorder localStorage array.
- **Primary neighborhood:** First item in localStorage array. Indicated across ContextSwitcher (amber dot + "PRIMARY" label), MultiFeed pill bar, HomeSignupEnhanced chips (on `/discover`), and NeighborhoodSelectorModal. Users can change primary via "Set primary" actions.
- **Combo dropdowns:** `bg-surface border-white/[0.08]`, items `hover:text-white hover:bg-white/5`
- **ViewToggle:** Desktop: two buttons (compact + gallery) in pill bar row, active `text-white`, inactive `text-neutral-300`. Mobile: rendered separately just above feed content (`md:hidden flex justify-end`), not in dropdown row.
- **DailyBriefWidget:** Renders between Control Deck and FeedList (passed as `dailyBrief` ReactNode prop to `NeighborhoodFeed` or `MultiFeed`). Spacing: `mt-8 mb-12`. Section headings in brief cards use `text-neutral-200` (brighter than body `text-neutral-400`). Brief headline is single-line (`whitespace-nowrap overflow-hidden`).
- **MultiFeed integration:** `MultiFeed` now uses `<NeighborhoodHeader mode="all">` instead of standalone header. Accepts `dailyBrief` and `initialWeather` props. Passes `comboComponentNames` for combo subtitle. Pill filter switches the daily brief dynamically - fetches brief from `neighborhood_briefs` table client-side per neighborhood, with skeleton loading state.
- **MultiFeed render order:** Neighborhood nav renders BEFORE masthead for vertical stability. Desktop pills `md:sticky` with `top: var(--header-offset, 64px)` (syncs with header hide/show via CSS variable). Opaque `md:bg-canvas` background. Mobile dropdown is not sticky. Left/right gradient fade indicators on desktop pill scroll container.
- **Header-pills sync:** Header sets `--header-offset` CSS variable on `<html>` (64px when visible, 0px when hidden on scroll-down). Pills transition smoothly via `transition-[top] duration-300 ease-in-out`. Eliminates gap where articles bleed through when header hides.
- **Back-to-top button:** `fixed bottom-6 right-4 z-40` on all screen sizes (previously top-center on desktop, which overlapped sticky pills).
- **Drag-to-reorder pills:** Desktop only. Neighborhood pills are `draggable` with pointer events. On drop: reorders localStorage, syncs cookie, calls `router.refresh()`. First pill = primary. Visual: dragged pill `opacity-50`, drop target amber left border, `cursor-grab`/`cursor-grabbing`. Mobile users reorder via the neighborhood selector modal.
- **ContextSwitcher setPrimary navigation:** `handleSetPrimary` syncs cookie from localStorage then calls `router.refresh()`, so MultiFeed reflects new primary immediately.
- **Shared slug utils:** `getCitySlugFromId()` and `getNeighborhoodSlugFromId()` in `neighborhood-utils.ts` replace duplicate helpers in MultiFeed, ComboNeighborhoodCards, feed/page.
- **ComboNeighborhoodCards:** Still exists for GuidesClient.tsx but removed from feed header

### Exploration Engagement (Multi-Level Discovery)
- **Problem solved:** Users clicking a postcard or discovery card read one article and bounce. Four strategies deepen engagement beyond 1 level.
- **`?explore=true` URL param:** Appended by BentoCard links, postcard links, and exploration suggestions. Activates exploration-mode UI on article pages.
- **API:** `GET /api/explore/next?neighborhoodId=xxx&city=yyy&country=zzz&lat=N&lng=N&category=zzz` - returns 3 contextual suggestions: `sameCity` (different neighborhood, same city), `sameTheme` (same category, any city), `geoHop` (different country, nearest by Haversine). Each `Suggestion` includes `neighborhoodName`, `city`, `headline`, `teaser`, `url`, `imageUrl` (Unsplash URLs only, null for non-Unsplash). 5-min `s-maxage` cache. All suggestion URLs include `?explore=true`.
- **Visual "Read Next" card:** `ExplorationNextSuggestions` (`src/components/article/ExplorationNextSuggestions.tsx`) - replaces plain text links. `border-t border-border` divider above "Keep exploring" label for visual separation. Hero card (first suggestion with Unsplash image): full-width `aspect-[2/1] md:aspect-[5/2]` with `rounded-xl`, gradient overlay `from-black/80 via-black/20`, tracked-caps neighborhood/city, serif headline (1-2 lines), "Continue exploring" CTA in `text-sm text-white font-medium tracking-wider uppercase`. Secondary suggestions show 32px circular Unsplash thumbnails with flex layout (matching sticky bar aesthetic). Fallback: styled `bg-surface border-border` card when no image available. sessionStorage cache (`flaneur-explore-{neighborhoodId}`) prevents redundant API calls across components. `getVisitedIds()` reads sessionStorage cache keys to find previously visited neighborhoods and passes as `exclude` param to API, breaking suggestion ping-pong loops.
- **Sticky ExplorationBar:** `ExplorationBar` (`src/components/article/ExplorationBar.tsx`) - fixed bottom bar, only renders when `?explore=true`. Appears at 40% article scroll via IntersectionObserver on a marker div. `bg-surface/90 backdrop-blur-md border-t border-border`. Layout: circular 40px Unsplash thumbnail + neighborhood name + headline + trail count ("N visited") + "Next" link + dismiss X. Positioned `bottom-0 md:bottom-14` with `z-[55]` to sit above the `z-50` LocationPrompt toast on mobile. Outer fixed wrapper has `pointer-events-none`, inner `max-w-2xl` content div has `pointer-events-auto` - clicks pass through bar's background to elements below (e.g., location toast buttons). Hides on scroll-up, reappears on scroll-down. Dismiss persists to `flaneur-explore-bar-dismissed` sessionStorage. 500ms delay before checking cache/fetching so ExplorationNextSuggestions caches first. Own `getVisitedIds()` + `exclude` param prevents suggesting already-visited neighborhoods (fixes wrong suggestion on level 2+ pages).
- **Exploration session trail:** `useExplorationSession` hook (`src/hooks/useExplorationSession.ts`) - tracks visited neighborhoods in `flaneur-exploration-session` sessionStorage as `{ trail: Array<{name, city, url}>, startedAt }`. Auto-adds current page on mount. Deduplicates by name+city.
- **Back link with trail count:** `ExplorationBackLink` in `ExplorationWrapper.tsx` - when trail > 1, shows "EXPLORING (N NEIGHBORHOODS)" instead of "KEEP EXPLORING". Creates micro-reward / progress feeling.
- **Subscribe nudge:** `ExploreSubscribeNudge` (`src/components/article/ExploreSubscribeNudge.tsx`) - renders after SourceAttribution when `?explore=true` and neighborhood not in localStorage `flaneur-neighborhood-preferences`. Single line: "Enjoying {name}?" + amber "Add to my neighborhoods" link. On click: adds to localStorage, syncs cookie via `syncNeighborhoodCookie()`, fire-and-forget `POST /api/neighborhoods/add`, shows checkmark "Added". Returns null if already subscribed.
- **Client wrappers:** `ExplorationWrapper.tsx` (`src/components/article/ExplorationWrapper.tsx`) - `ExplorationBackLink` and `ExplorationBarWithSession` connect `useExplorationSession` state to the server-rendered article page. Re-exported `ExploreSubscribeNudge`.
- **Article page integration:** `[slug]/page.tsx` uses `ExplorationBackLink` (replaces `BackToFeedLink`), `ExploreSubscribeNudge` (after SourceAttribution), `ExplorationNextSuggestions` (after editorial content, before bottom ad), `ExplorationBarWithSession` (after inner wrapper, fixed positioning). Outer div has `relative` for IntersectionObserver marker. In explore mode, `ExplorationNextSuggestions` renders ABOVE `BriefDiscoveryFooter` so "Keep Exploring" (next neighborhood) is the primary CTA right after subscribe nudge, with "Keep Reading" (current neighborhood links) below. Non-explore mode keeps original order.
- **Ad-free explore flow:** When `isExploring` is true, `[slug]/page.tsx` hides: top house ad (was blocking content immediately after back link), bottom house ad (was interrupting hero card → footer flow), `PostReadEmailCapture` (redundant with `ExploreSubscribeNudge`), and `MoreStoriesButton` (misleading `/feed` link when sticky bar + hero card already provide navigation). Paid `StoryOpenAd` is also gated - explore sessions are ad-free to preserve "next episode" momentum.
- **sessionStorage keys:** `flaneur-explore-{neighborhoodId}` (cached API response), `flaneur-explore-bar-dismissed` ('true'), `flaneur-exploration-session` (trail JSON)

### Article Page Navigation
- **Back link:** `← ALL MY NEIGHBORHOOD STORIES` at top (or `← KEEP EXPLORING` / `← EXPLORING (N NEIGHBORHOODS)` when `?explore=true`), links to `/feed`. `ExplorationBackLink` wraps `BackToFeedLink` with trail state.
- **Bottom CTA:** `MORE STORIES` button, also links to `/feed`. Both in `TranslatedArticleNav.tsx`.
- **Feed cookie:** Feed reads neighborhood IDs from `flaneur-neighborhoods` SameSite=Strict cookie (synced from localStorage by inline script in `layout.tsx`). `MultiFeed` detects empty `neighborhoods` prop, reads localStorage, syncs cookie, and calls `router.refresh()`. `syncChecked` state gate suppresses the "Choose Neighborhoods" empty state CTA until localStorage has been checked - prevents 1-2 second flash of empty state on mobile when server renders with empty cookie but localStorage has neighborhoods.
- **Empty feed CTA:** When localStorage is also empty (new user from search), shows centered "Choose Neighborhoods" button that opens the selector modal instead of a dead-end empty state. Only appears after `syncChecked` confirms localStorage is genuinely empty.
- **No neighborhood-specific links:** Article pages are entry points from shared links too - `/feed` loads the user's own neighborhood set regardless of which neighborhood the article belongs to
- **Source verification:** `SourceAttribution` shows source attribution for all articles with sources in DB. Props: `headline`, `neighborhoodName`, `editorNotes`, `category` passed from article page. Uses same dotted-underline academic link styling. Editorial categories (`brief_summary`, `look_ahead`, `weekly_recap`) suppress "verify here" link but still show actual sources when they exist ("Synthesized from reporting by Eater NY, West Side Rag..."). Generic "Synthesized from public news sources" only shown when no sources exist in DB.
- **Government source attribution:** When `editor_notes` contains `Source: Name - URL` format, SourceAttribution displays a direct link to the authoritative government database (e.g., "NYC 311 Open Data"). The "Single-source story - verify here" fallback is NOT shown when a valid government source exists (government data is authoritative). 5 crons inject government source URLs into editor_notes: sync-nuisance-watch (NYC 311), sync-filming-permits (NYC Film Permits), sync-alfresco-permits (NYC Open Restaurants), sync-retail-watch (NYC DOB Signage), sync-nimby-alerts (dynamic per community board + agenda URL).
- **Nuisance watch location resolution:** `anonymizeAddress()` in `nuisance-watch.ts` uses 3-layer fallback: `street_name` -> extract street from `incident_address` (regex strips leading house numbers) -> cross streets (`cross_street_1`/`cross_street_2`). ALL CAPS 311 data converted via `titleCase()`. "0 Block of..." (house numbers 1-99) shows just street name. `clusterComplaints()` skips complaints with no resolvable location. `RawComplaint` interface includes optional `crossStreets` field.
- **Nuisance watch neighborhood roundups:** When 2+ complaint hotspots exist for the same neighborhood on the same day, the cron generates a single consolidated roundup article instead of separate per-location articles (e.g., "Noise Watch: 5 hotspots, 102 complaints across Upper West Side"). `generateNuisanceRoundup()` in `nuisance-watch.ts` uses Gemini to write a blurb mentioning top locations. `processNuisanceWatch()` returns `clusters` alongside `stories` so the cron can group by neighborhood. Single-hotspot neighborhoods still get individual articles. Roundup slug pattern: `nuisance-roundup-{neighborhoodId}-{date}`.
- **Nuisance watch story quality:** Both `generateNuisanceStory()` and `generateNuisanceRoundup()` must use exact date ranges (e.g., "Monday, February 12 through Wednesday, February 19") — never vague "this week". Ban "spike"/"surge" language since there is no historical comparison data. Roundup stories use structured bullet-point format (opening sentence, bullet list of hotspots with counts, closing sentence). Individual stories require exact dates in the body.
- **Civic data cron filter tuning:** Filming permits: 7-day lookahead (was 48h), includes Documentary/Music Video/Theater categories (was TV/Film/Commercial/WEB only). Retail watch: 30-day lookback (was 7d), ~200 brands including DTC (Warby Parker, Glossier, Allbirds), restaurant groups (Major Food Group, Balthazar, Via Carota), and premium retail (Moncler, Arc'teryx, Lululemon). Alfresco permits: 30-day lookback (was 7d), includes pending applications (not just approved) with appropriate "has applied for" language in stories. `OutdoorDiningEvent` has `isPending` flag.
- **NYC Open Data column name fixes:** Film permits API (`tg4x-b46p`) uses camelCase column names without underscores (e.g., `startdatetime` not `start_date_time`, `parkingheld` not `parking_held`). Alfresco API (`pitm-atqc`) uses `time_of_submission` not `time_submitted`, `bulding_number` (NYC typo) not `building`, seating interest values are `'sidewalk'`/`'both'` not `'yes'`. **Alfresco dataset stale since Aug 2023** — no new data available. Retail watch switched from stale BIS dataset (`ipu4-2q9a`, last updated 2018) to DOB NOW (`rbx6-tga4`) with `work_type='Sign'`.
- **Retail watch brand pattern false positives:** The `ald\b` shortcut in Aimé Leon Dore's regex matched any name ending in "ald" (Ronald, Gerald, Donald) in owner/applicant fields — every permit matched ALD. Removed `|ald\b`, tightened 12 other patterns (Vince, Theory, Apple, COS, Edition, Aman, Sandro, Creed, Rumble, RH, Barry's, Credo) to require brand-specific context words (e.g., `/\bapple\s*(store|retail|inc)\b/i`). Changed dedup from permit-ID-based to brand+address-based slug to prevent duplicate articles for same location.
- **AI writing persona architecture:** Three-tier model: (1) **Grok** = neutral fact-gatherer ("You are a local news/events researcher"), no writing-style constraints so it doesn't filter facts; (2) **Claude Sonnet** (6 cron prompts in route.ts files) = insider resident persona with writing-style rules (no em dashes, no slang, assume reader is local); (3) **Gemini Flash/Pro** (30+ lib files) = insider resident persona via shared `insiderPersona(location, role)` from `src/lib/ai-persona.ts`. Grok feeds raw facts to Gemini enrichment which applies the voice. The `insiderPersona()` utility prevents drift: "You are a well-travelled, successful 35-year-old who has lived in {location} for years..." with insider writing rules and banned outsider phrases ("for those in the know", "the elite", "Manhattan's elite", "if you know you know", "the usual suspects", "movers and shakers"). Never define separate persona constants in cron files - 6 crons had stale `SYSTEM_PROMPT` constants that lacked the banned phrases.
- **Grok-powered event crons (9 crons):** Shared `grokEventSearch()` utility in `grok.ts` (Responses API with `web_search` + `x_search`, temperature 0.5). Each cron's system prompt requests JSON array, caller parses with `raw.match(/\[[\s\S]*\]/)` then validates against existing configs (brand whitelists, venue lists, airline configs, Blue Chip keywords). **Batching constraint:** Each `grokEventSearch()` call takes 60-120s. Must batch all items into 1-2 calls per cron (not per-item) to stay under 300s Vercel timeout — prompt lists all items with a discriminating field (e.g., `"venue"`, `"city"`, `"house"`) in the JSON response for mapping back. For large item counts, split into 2 regional batches (Americas + Europe/Asia) via `Promise.all`. Crons: overture-alert (9 venues, 1 call), museum-watch (18 museums, 2 calls), sample-sale (5 cities, 1 call), gala-watch (9 hubs, 1 call), route-alert (8 hubs, 1 call), residency-radar (1 call), archive-hunter (~15 stores, 1 call), nyc-auctions (3 houses, 1 call), global-auctions (5 hubs × 3 houses, 2 calls). All preserve existing Gemini story generation + article insertion untouched.
- **political-wallet thresholds:** FEC API works but original thresholds were too restrictive. `LOOKBACK_DAYS` 7→30, `STORY_TRIGGER_THRESHOLD` $10K→$2.5K, `POWER_DONOR_THRESHOLD` $1K→$500.
- **heritage-filings fixes:** NYC DOB heritage filings had 24h lookback (too short for lagging dataset) — changed to 336h (14 days). Missing `nyc-` prefix on neighborhood IDs (same systemic bug as liquor-watch).
- **Liquor license cron rewrite:** Old cron used NY State dataset `wg8y-fzsj` requiring authentication (always 0 results). Switched to two public datasets: pending licenses (`f8i8-k2gm`) for new applications and active licenses (`9s3h-dpkz`) for recently granted. Full pipeline: fetch → filter newsworthy (restaurants, bars, hotels, clubs — skip grocery/manufacturer/wholesaler) → generate "Last Call" stories via Gemini Flash → create articles with brand+address dedup. Category labels: "Last Call: Application" / "Last Call: Approved". `NEIGHBORHOOD_ID_TO_CONFIG` keys lack `nyc-` prefix so `getNeighborhoodFromZip()` prepends it. Story generation parallelized in batches of 5. Uses placeholder image (not AI-generated) to stay within 120s function timeout.
- **Non-government single-source:** Text reads "This is a single-source story. It's always wise to double-check here" with "here" linking to Google Search (`headline + neighborhoodName`).

### Article Body Typography ("Effortless Legibility")
- **Font:** Merriweather (Google Fonts, screen-optimized serif) via `--font-body-serif` CSS variable, fallback Georgia/Times New Roman. ALL article content uses serif - no sans-serif overrides in EventListingBlock or elsewhere.
- **Size:** Mobile `text-[1.1rem]` (~17.6px), Desktop `text-[1.2rem]` (~19.2px) - consistent with feed card text (~17px) without jarring size jump
- **Line height:** `leading-relaxed` (1.625x) - comfortable on dark backgrounds without excessive spacing
- **Color:** `text-neutral-200` (off-white, never pure #FFFFFF on dark)
- **Paragraph spacing:** `mb-6` between paragraphs
- **Links:** Academic "invisible link" style - `text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4`, hover: `decoration-solid decoration-neutral-300/60`. Markdown links `[text](url)` in content are rendered as clickable `<a>` tags. HTML `<a>` tags from AI output are converted to markdown format first. **Auto-linking disabled** - render-time entity detection and pipeline hyperlink injection both removed to avoid cluttered articles. No amber/blue link colors anywhere.
- **Bold:** `font-bold text-neutral-100`
- **Section headers:** `text-lg font-semibold text-fg mt-8 mb-4` in Merriweather

### Font Sizes (General)
- Feed body: 17px, Feed headlines: 20-22px (single-line on desktop `whitespace-nowrap overflow-hidden`, 2-line wrap on mobile gallery `line-clamp-2`), Metadata: 10-12px, Masthead: 30px
- Article body: 17.6-19.2px Merriweather serif
- **Date metadata format:** "Mon Feb 17" (weekday + month + day). Auto-translated via `Intl.DateTimeFormat(locale)`. Locale passed from `useLanguageContext()` in CompactArticleCard, ArticleCard, NeighborhoodBrief. Shared `formatDate()`/`formatRelativeTime()`/`getDayAbbr()` in `src/lib/utils.ts` accept `locale` and optional `timezone` params. Article detail page passes `article.neighborhood?.timezone` to `getDayAbbr()` so "Fri Daily Brief" displays correctly in neighborhood's local timezone.

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
│   ├── api-docs/                  # Swagger UI page (public)
│   └── api/
│       ├── docs/                  # OpenAPI JSON spec endpoint
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
│       ├── translations/           # Serve cached article/brief translations
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
    ├── look-ahead-events.ts       # Structured event listing formatter (StructuredEvent, formatEventListing, isEventLine, isPlaceholder)
    ├── rss-sources.ts             # RSS feed aggregation (DB + hardcoded fallback)
    ├── search-aliases.ts          # Country/region/state search aliases
    ├── geo-utils.ts               # Haversine distance + sorting
    ├── grok.ts                    # Grok X Search integration
    ├── brief-enricher-gemini.ts   # Gemini enrichment pipeline
    ├── weekly-brief-service.ts    # Sunday Edition generation
    ├── ad-quality-service.ts      # AI ad review pipeline
    ├── translations.ts            # UI string dictionaries (10 languages)
    ├── translation-service.ts     # Gemini Flash translation + DB lookup
    └── weather.ts                 # Server-side Open-Meteo weather fetch (10-min cache)
```

## Environment Variables

**Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`
**Optional:** `GEMINI_API_KEY`, `GROK_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY` (Qwen translation; falls back to Gemini if unset), `QWEN_MODEL` (override default Qwen model), `UNSPLASH_ACCESS_KEY`, `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`, `RESEND_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `SENTRY_AUTH_TOKEN`, `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` (audio edition TTS; same Azure Speech resource as yous.news), `ELEVENLABS_API_KEY` (voice options D and E; Vercel only)

## Key Database Tables

- `neighborhoods` — 270+ active neighborhoods with coordinates, region, country, `is_combo`, `is_community`, `created_by`, `community_status`, `broader_area` (province/region for Unsplash fallback, null for major cities)
- `combo_neighborhoods` — join table for combo components
- `articles` — news articles with AI images (`enriched_at`, `enrichment_model`)
- `neighborhood_briefs` — Grok-generated daily summaries (column is `model`, NOT `ai_model`). `brief_date DATE NOT NULL` with `UNIQUE(neighborhood_id, brief_date)` constraint prevents duplicate briefs per neighborhood per day at DB level.
- `weekly_briefs` — Sunday Edition content (rearview, horizon, holiday, data_point)
- `ads` — ad campaigns with booking fields (stripe_session_id, customer_email, is_global_takeover) and quality control (proof_token, approval_status, ai_quality_score)
- `house_ads` — fallback ads (types: waitlist, app_download, advertise, newsletter, sunday_edition, suggest_neighborhood, community_neighborhood)
- `neighborhood_suggestions` — reader-submitted neighborhood requests (suggestion, email, city/country, status: new/reviewed/added/dismissed)
- `article_reactions` — emoji reactions (bookmark/heart/fire), anonymous + authenticated
- `cron_executions` / `cron_issues` — monitoring & self-healing
- `ai_usage_events` — per-call AI cost instrumentation (provider, model, operation, kind search/generation, tokens, estimated_cost_usd); written fire-and-forget by `src/lib/ai-cost.ts`
- `daily_brief_sends` / `weekly_brief_sends` — email dedup (weekly: unique on `recipient_id, neighborhood_id, week_date`)
- `referrals` — click/conversion tracking (referral_code, referrer_type/id, referred_email, status, ip_hash)
- `profiles` — user prefs (primary_city, primary_timezone, paused_topics, referral_code)
- `newsletter_subscribers` — timezone, paused_topics, referral_code
- `article_translations` / `brief_translations` — cached Gemini Flash translations (unique on article_id/brief_id + language_code)
- `rss_sources` — RSS feed URLs by city (192 feeds across 92 cities, 100% coverage)
- `neighborhood_reports` — user reports on community neighborhoods (unique per neighborhood+reporter, RLS: own reports only)
- `executive_applications` — executive status credit applications (status: pending, RLS: own applications only)

## Deployment

```bash
git push origin master    # Deploy (then promote in Vercel dashboard)
npx supabase db push --include-all --yes  # Run migrations
```

## MCP Servers

Supabase, Vercel, Playwright, Supermemory, Frontend Design, Resend, Stripe, Sentry, BigQuery (Google Cloud billing monitoring - read-only, table `gen-lang-client-0527325266.billing_export.gcp_billing_export_resource_v1_01B232_408E93_0A6CD7`, data has ~5 week lag from billing export enabled 2026-03-23, `GOOGLE_PLACES_API_KEY` removed from Vercel 2026-03-24)
