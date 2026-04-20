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

## Last Updated: 2026-04-20


Recent work: Broker waitlist + nearby-suggestions when neighborhood is taken (new `partner_waitlist` table with `source='setup_blocked'|'cold_pitch'`; `/api/partner/check-neighborhood` auto-saves broker interest on upsert + returns top 5 Haversine-sorted nearby available neighborhoods within 15km; `pitch-preview` endpoint upserts cold-pitch recipients with source='cold_pitch'; `customer.subscription.deleted` webhook queries waitlist and emails each entry with a pre-filled setup URL stamping notified_at to prevent double-sends; setup page UI shows inline "Get notified if this opens up" email capture or waitlist confirmation + clickable nearby suggestions with "These nearby neighborhoods are still available - act fast" copy), Weather hint no longer word-wraps (tomorrowBox maxWidth 280→520px in both templates), Broker signup flow polish (8 mobile bugs found during end-to-end test) - scroll-to-top on step advance via `useEffect` on currentStep + clear stale error banner; copy-to-clipboard feedback ("Copied!" for 2s via `copied` state); subscribe-link label clarifies it's also emailed separately; new `sendSubscribeLinkEmail()` in `api/partner/setup/route.ts` fires fire-and-forget on partner creation so broker gets `/r/{slug}` link in inbox before activation; `handlePhotoUpload` rewritten to return boolean + 5MB+MIME client-side check + 30s AbortController timeout + actionable error messages (iPhone photos routinely 10-20MB were stalling silently on cellular); listing onChange uses functional setState `setEditingListing(prev => ({...prev, photo_url}))` to avoid stale-closure data loss; both photo inputs reset `e.target.value` after attempt; "US$999 - Billed in USD" on landing + step 6 (disambiguates for AU/CA/SG/HK brokers); `areaUnit` auto-derives `Sqft` for US vs `m²` elsewhere from `selectedNeighborhood.country`; subscribe-link input gets `min-w-0 text-xs` so long slugs don't bleed off mobile viewport; 14-day trial billing terms now explicit on both surfaces ("First billing starts 14 days after activation, then monthly on the 15th day after activation. You can cancel anytime before or after the free trial."), Simplify partner client offering (broker's clients now receive ONLY the branded Daily Brief, every day at 7 AM local time including Sundays - no Sunday Edition; `send-daily-brief` cron skips standard sends on Sunday but still runs the branded partner block; `resolveRecipients()` in scheduler.ts excludes `partner_agent_id IS NOT NULL` from both standard Daily Brief and Sunday Edition; updated `/partner` landing copy "What Your Clients Receive" to say "One email every day, delivered at 7 AM in the neighborhood's local timezone - 365 mornings a year" and removed the Sunday Edition block), Add broker discovery link to homepage hero (subtle "Real estate agents: partner with us →" link in muted uppercase below the "Read Stories" button, routes to /partner), Analytics instrumentation for email capture + onboarding + ad surfaces (client-side `track()` in `src/lib/analytics.ts` POSTs to `/api/analytics/track` which writes to `analytics_events` table with allowlisted event names; instrumented NewsletterSignup, EmailCaptureCard, /onboard page, AdCard, StoryOpenAd, FallbackAd bonus/house/static blocks; events: newsletter_signup.view/submit/success/error, email_capture.view/submit/success/error/dismiss, onboard.step1.view/continue, onboard.step2.view/google_click/submit/success/error, ad.impression, ad.click), Unify saved neighborhoods (removed destination lists system - deleted useDestinationLists hook, AddToListModal, /api/lists/ routes, /lists/[shareToken] page, ~1,575 lines removed, 10 files deleted - heart icon badge and WishlistDropdown now use flaneur-neighborhood-preferences localStorage, one concept: save = subscribe to neighborhood feed), Remove auto-redirect for returning users (all visitors see cinematic homepage at readflaneur.com, "Read Stories" routes to /feed if neighborhoods saved or /onboard if new, cookie sync preserved), Agent partner system for luxury real estate agents (self-serve /partner setup page with 6-step flow, /r/[agent-slug] subscribe links, BrandedDailyBriefTemplate with agent header/listing cards/branded footer, sendBrandedDailyBrief() sender with "James Chen: Tribeca Daily" from line, partner-scheduler for branded sends integrated into daily brief cron, Stripe $999/month subscription with webhook handling, agent_partners DB table with one-agent-per-neighborhood constraint and partner-assets storage bucket), Simplify destinations page (removed complex LC-style filter system - ALL FILTERS slide-out panel, COASTAL/SLOPES/COLLECTIONS dropdowns, region/country/neighborhood-type filters, 9 state variables, ~441 net lines removed - replaced with clean search bar + 3-option sort dropdown nearest/A-Z/region, map and Table View and cards untouched), Fuzzy search for neighborhoods (Levenshtein edit distance matching in resolveSearchQuery so typos like "aukland" find "Auckland", 1 edit for 3-5 char queries, 2 for 6+, search API uses resolveSearchQuery server-side for fuzzy neighborhood matching), Search page searches neighborhoods alongside articles (dedicated section above article results with location pin icons, search.neighborhoods translation key in all 9 languages), Look Ahead generation for ALL active neighborhoods not just those with subscribers (schedule hourly 0-7 UTC), BriefDiscoveryFooter shows Look Ahead link + 2 nearest neighborhood daily brief links, Rename "AI Standards & Ethics" to "Standards & Ethics" across all 9 languages

### Email Capture (Engagement-Triggered)
- **Trigger:** `flaneur-article-reads` localStorage counter incremented in `ArticleViewTracker`. Threshold: 3 reads.
- **Placement 1 - Feed inline:** `EmailCaptureCard` injected after 5th article via `injectEmailPrompt()` in `ad-engine.ts`. "Get {neighborhood} stories in your inbox" + email input. Dismiss stores `flaneur-email-prompt-dismissed`.
- **Placement 2 - Article page:** `PostReadEmailCapture` after `ArticleReactions`. Compact inline: "Enjoying {neighborhood} stories? Get them daily."
- **Placement 3 - Return visit:** `ReturnVisitPrompt` in global layout. `flaneur-session-count` incremented once per session (sessionStorage guard). Shows slide-up toast on 2nd+ session with 3+ reads. Auto-dismisses after 10s unless interacted.
- **All prompts:** Hidden when `flaneur-newsletter-subscribed` = `'true'` or `flaneur-email-prompt-dismissed` = `'true'`. Posts to `/api/newsletter/subscribe` with neighborhoodIds from localStorage.
- **New localStorage keys:** `flaneur-article-reads` (number), `flaneur-email-prompt-dismissed` ('true'), `flaneur-session-count` (number)

### PWA (Progressive Web App)
- **Manifest:** `public/manifest.json` - `display: standalone`, `start_url: /feed`, dark theme colors (#050505). Icons: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (dark "F" on black).
- **Meta tags:** `layout.tsx` metadata includes `manifest`, `icons.apple`, `appleWebApp` (capable, black-translucent status bar, title "Flaneur"), `mobile-web-app-capable: yes`.
- **iOS install prompt:** `IOSInstallPrompt` (`src/components/pwa/IOSInstallPrompt.tsx`) - top card guide with 4 steps matching Safari UI flow. Detection: `isIOSSafari()` checks UA for iPhone/iPad + Safari (not CriOS/FxiOS/OPiOS/EdgiOS) + not already standalone. Shows on first iOS Safari visit (no engagement gate). First dismissal: re-shows after 7 days. Subsequent dismissals: re-shows every 30 days. Never permanently stops. 2s delay before showing. `?pwa-test=true` URL param bypasses all checks for testing.
- **Steps:** (1) Tap three dots on lower right, (2) Tap Share, (3) Tap "View More", (4) Tap "Add to Home Screen". Each with custom SVG icon matching Safari UI.
- **External trigger:** Listens for `flaneur-show-pwa-prompt` custom event on `window`, allowing other components (e.g., account page) to open the prompt overlay on demand.
- **Account page link:** iOS-only "Add Flaneur to your Home Screen" link in account page App section. Detects iOS + not standalone. Dispatches `flaneur-show-pwa-prompt` event.
- **PWA refresh bar:** `PWARefreshBar` (`src/components/pwa/PWARefreshBar.tsx`) - shown only in standalone PWA mode (no browser chrome). Displays "Updated {time} - Refresh" at the top of the feed page. `window.location.reload()` on click. Rendered in `feed/page.tsx`.
- **localStorage keys:** `flaneur-pwa-prompt-dismissed` (timestamp), `flaneur-pwa-prompt-dismiss-count` (number)

### Homepage "Front Door" Experience
- **New visitors:** Full cinematic hero animation plays (logo → tagline → stats → rule → "Read Stories" button). No auto-redirect. User clicks "READ STORIES" to enter.
- **"Read Stories" button:** `HomepageEnterButton` (`src/components/home/HomepageEnterButton.tsx`) - checks `flaneur-neighborhood-preferences` localStorage: if neighborhoods exist, navigates to `/feed`; if new user, navigates to `/onboard`. Uses `btn-secondary` styling, `hero-fade-in-delay-4` (1.2s delay).
- **Returning users:** All users see the cinematic homepage when visiting readflaneur.com. No auto-redirect. Inline `<script>` in `layout.tsx` syncs localStorage to `flaneur-neighborhoods` cookie on every page load but does NOT redirect to `/feed`.

### Onboarding Flow
- **Page:** `/onboard` (`src/app/onboard/page.tsx`) - two-step client component
- **Step 1:** Pick neighborhoods. Auto-detects location via `/api/location/detect-and-match` (pre-selects nearest). Search input with accent-insensitive filtering. Neighborhoods grouped by city. Selected shown as removable pills. "Continue with N neighborhoods" button.
- **Step 2:** Enter email. Single email input, no password required. "Start reading" button. Back link to step 1. Shows selected neighborhoods below.
- **On submit:** Saves neighborhoods to localStorage + cookie via `syncNeighborhoodCookie()`. Subscribes to newsletter via `POST /api/newsletter/subscribe` with email + neighborhoodIds + auto-detected timezone. Sets `flaneur-newsletter-subscribed`, `flaneur-onboarded`, `flaneur-onboard-email` in localStorage. Fire-and-forget DB sync. Redirects to `/feed?welcome=true`.
- **Sign-in link:** "Already have an account? Sign in" at top-right links to `/login`.
- **Skip conditions:** Redirects to `/feed` if `flaneur-auth` (logged in) or `flaneur-newsletter-subscribed` + neighborhoods already exist.
- **Email verification:** Tracking pixel in daily brief and Sunday Edition emails (`GET /api/email/pixel?token={subscriberToken}`) marks `newsletter_subscribers.email_verified = true` on first email open. 1x1 transparent PNG, fire-and-forget, no-cache headers.
- **localStorage keys:** `flaneur-onboarded` ('true'), `flaneur-onboard-email` (email string)
- **Revisiting the front door:** Footer FLANEUR logo links to `/discover` (not `/`). ContextSwitcher has "The Front Door" link to `/discover` (house icon).
- **Discover page:** `/discover` — full homepage experience with `HomeSignupEnhanced` (neighborhood chips + "READ STORIES"), no auto-redirect
- **API:** `src/app/api/location/detect-and-match/route.ts` — uses `detectLocationFromIP()` + Haversine sort against all active non-combo neighborhoods
- **WelcomeBanner:** `src/components/feed/WelcomeBanner.tsx` — "Viewing stories near {city}. Customize" with dismiss X. Strips `welcome` param on dismiss. Stores dismissal in localStorage.
- **Translation keys:** `homepage.readStories` (9 languages), `nav.frontDoor` (9 languages)
- **SmartRedirect:** Component still exists (`src/components/home/SmartRedirect.tsx`) but no longer used on homepage. Kept for potential reuse.

### Auth
- **Passwordless login:** `/login` page shows passkey (primary, if browser supports WebAuthn) + Google OAuth + email magic link. No password field, no signup page, no forgot password.
- **Passkey login:** `@simplewebauthn/server` + `@simplewebauthn/browser` v11. Login: `POST /api/auth/passkey/authenticate/options` generates challenge stored in `passkey_challenges` table → browser shows passkey dialog (discoverable credentials, no email needed) → `POST /api/auth/passkey/authenticate/verify` verifies signature against stored public key in `user_passkeys`, creates Supabase session via `createSessionForUser()` (magic link mint-and-verify), sets cookies, returns user state. Registration: authenticated users add passkeys from `/account` page via `POST /api/auth/passkey/register/options` + `POST /api/auth/passkey/register/verify`. Management: `GET/DELETE /api/auth/passkey/list`. Config: `src/lib/passkey.ts` (RP_ID=`readflaneur.com` prod, `localhost` dev). Session helper: `src/lib/auth-session.ts` (shared `createSessionForUser`, `fetchUserState`, `setSessionCookies`). DB: `user_passkeys` (credential_id, public_key base64, counter, device_type, backed_up, transports, friendly_name) + `passkey_challenges` (ephemeral, 5-min TTL, service_role only RLS). `flaneur-auth-method` localStorage set to `'passkey'` on passkey login. NotAllowedError (user cancel) handled gracefully.
- **Magic link endpoint:** `POST /api/auth/magic-link` uses `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink' })` + Resend to send branded sign-in email. Bypasses CAPTCHA. Always returns success to prevent email enumeration. Link routes through `/auth/callback?next=/feed` for session exchange.
- **OAuth:** Google login via "Continue with Google" button. Redirects through `/api/auth/callback` which sets session cookies + `?auth=oauth` URL marker for client-side `flaneur-auth` localStorage setup. Apple login hidden but implemented.
- **OAuth callback routes:** Both `/auth/callback` (page) and `/api/auth/callback` (API) are intact. API callback used by OAuth, page callback used by magic links.
- **Legacy password login:** `/api/auth/signin` still exists for backward compatibility but the login page no longer links to it. Password-based accounts still work if users have them.
- **Newsletter subscribe:** `/api/newsletter/subscribe` uses `admin.generateLink({ type: 'magiclink' })` + Resend for verification email. Bypasses CAPTCHA.
- **Custom SMTP:** Auth emails sent via Resend SMTP for deliverability. Configured in Supabase Dashboard > Authentication > SMTP Settings.
- **Login page session check:** Only checks `getSession()` (2s timeout). Does NOT check flaneur-auth (creates redirect loop when cookies expired). If getSession returns null, clears stale flaneur-auth and shows login form.
- **Header auth:** Checks `flaneur-auth` localStorage FIRST (instant, no locks) to show "Account" immediately. Then `getSession()` in background (3s timeout) to upgrade to full User object. Never clears user if getSession returns null (expired JWT is gracefully degraded). `onAuthStateChange` only handles positive session events. Sign-out via full page reload from `/account`.
- **Turnstile server-side:** `/api/auth/signin` validates captcha token via Cloudflare `siteverify` API using `TURNSTILE_SECRET_KEY` env var. Gracefully degrades if Cloudflare unreachable.
- **Middleware:** `getSession()` only (no `getUser()`). `getUser()` was removed because it makes a network call that can hang, and if it returns 401, GoTrue internally clears session cookies via the response's `setAll` callback.
- **Newsletter auto-subscribe:** Both login (`/api/auth/signin`) and signup (`/auth/callback`) auto-insert user into `newsletter_subscribers` table if not already subscribed. Uses admin client (service role), sets `email_verified: true`. Ensures all registered users receive Daily Brief emails.
- **Profile caching:** Signin API fetches profile data (timezone, childcare_mode, prefsToken, theme, language) in parallel with prefs/newsletter. Login page writes to `flaneur-profile` localStorage and restores theme/language to localStorage + DOM. Account page reads cached profile on mount for instant rendering.
- **Preference persistence:** Theme and language preferences synced to `profiles.preferred_theme`/`preferred_language` via fire-and-forget `POST /api/preferences`. `PreferencesSync` component in layout.tsx restores preferences from `flaneur-profile` cache on first authenticated visit when localStorage doesn't have them (new device, OAuth login). Also auto-detects browser timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` when `flaneur-profile` has no `timezone` field - VPN-immune (reads OS clock), only sets `primary_timezone` in DB when null (won't overwrite manual choices), updates `flaneur-profile` cache immediately. `/api/preferences` POST accepts `timezone` (IANA format with `/` validation) with `forceTimezone` flag - auto-detect omits flag (only-set-if-null via DB check), modal manual save sends `forceTimezone: true` (always overwrites). Runs once per session via `flaneur-prefs-synced` sessionStorage guard.
- **Sign-out:** `/account` page calls `signOut()` + `POST /api/auth/signout` + `window.location.href = '/'` (full reload clears all state).

### Language Translation (Batch Pre-Translation)
- **Approach:** Batch pre-translate articles and briefs via Gemini Flash cron. UI strings via client-side dictionary.
- **Languages:** English (default), Swedish (sv), French (fr), German (de), Spanish (es), Portuguese (pt), Italian (it), Simplified Chinese (zh), Japanese (ja)
- **DB tables:** `article_translations` (article_id, language_code, headline, body, preview_text), `brief_translations` (brief_id, language_code, content, enriched_content). RLS: public read, service_role write.
- **Hook:** `useLanguage()` (`src/hooks/useLanguage.ts`) - language state, browser detection via `navigator.languages`, localStorage `flaneur-language`
- **Provider:** `LanguageProvider` (`src/components/providers/LanguageProvider.tsx`) - React context wrapping useLanguage, added to layout.tsx
- **UI strings:** `src/lib/translations.ts` - ~329 keys per language, `t(key, language)` lookup with English fallback. `useTranslation()` hook wraps context + t().
- **Toggle:** `LanguageToggle` (`src/components/layout/LanguageToggle.tsx`) - greyscale wireframe globe icon. OFF: click auto-detects browser language; if English, opens picker dropdown so user can choose. ON: globe + amber badge ("SV"), click globe = back to English, click badge = picker dropdown.
- **Cron:** `translate-content` (*/15, maxDuration=300, 250s budget). Translates articles/briefs from last 48h. Concurrency 8, exponential backoff on 429. Phase split: 75% articles, 25% briefs. No per-language cap. **Language rotation:** Rotates start language each run (based on quarter-hour offset) so all 8 languages get fair coverage. Logs to `cron_executions`.
- **API:** `GET /api/translations/article?id=...&lang=...`, `GET /api/translations/brief?id=...&lang=...` - 1h cache headers, returns translation or 404.
- **Content integration:** `TranslatedArticleBody` + `TranslatedHeadline` (article pages), `CompactArticleCard` (feed headlines/previews), `NeighborhoodBrief` (brief content) - all fetch translations client-side, fall back to English.
- **UI chrome:** `t()` wired into Header, Footer, MultiFeed, FeedList, BackToTopButton, NeighborhoodHeader, ContextSwitcher, WelcomeBanner, NeighborhoodBrief, search page, About, Legal, Standards, Contact, Careers pages
- **Flash prevention:** Inline script in layout.tsx sets `document.documentElement.lang` from `flaneur-language` localStorage
- **NOT translated:** Email templates (stay English), admin pages, neighborhood/city names (proper nouns), paid ad content (advertiser-supplied), advertise booking page. House ads ARE translated via `houseAd.{type}.headline/body/cta` keys.
- **Translation sync check:** `node scripts/check-translations.mjs` - verifies all languages have the same keys as English. Run after editing English strings.
- **Footer pages:** About (server/client split for Supabase data), Legal (privacy + terms tabs), Standards (server/client for metadata), Contact, Careers (server/client for metadata) - all fully translated via `t()` keys
- **localStorage keys:** `flaneur-language` (ISO 639-1 code, absence = English), `flaneur-language-offered` ('1' after first auto-detection attempt, prevents re-detection if user switches back to English)
- **Browser auto-detect:** On first visit (no `flaneur-language` AND no `flaneur-language-offered` in localStorage), `useLanguage.ts` runs `detectBrowserLanguage()` from `navigator.languages`. If a supported non-English language is found, sets it automatically, persists to localStorage, syncs to DB. The `flaneur-language-offered` flag ensures this only happens once per device.
- **Translation service:** `src/lib/translation-service.ts` - Gemini Flash wrapper with retry, preserves local language terms and proper nouns. `translateArticle()` strips `[[Event Listing]]...---` block before translation and recombines after, so Look Ahead structured event data stays in English for `isEventLine()` parsing and `EventListingBlock` rendering.

### Enrichment-Gated Brief Publishing
- **Rule:** Brief articles are NEVER created from unenriched (raw Grok) content. Only `enriched_content` from Gemini is used.
- **Email assembler** (`assembler.ts`): `fetchBriefAsStory()` returns `null` if the brief has no `enriched_content`, skipping the brief link in the email rather than linking to sparse content. **Fallback path:** When generate-brief-articles hasn't created an article yet, assembler creates brief_summary articles directly — uses brief's actual `model` value (not hardcoded), sets `enriched_at`/`enrichment_model`, extracts+inserts sources from `enriched_categories`, and uses `selectLibraryImageAsync()` for Unsplash image lookup (async DB query, no cache preload needed).
- **Brief article cron** (`generate-brief-articles`): Already filters `.not('enriched_content', 'is', null)`, and no longer has a raw content fallback. Neighborhood+date dedup keeps only the latest brief per neighborhood per local day using IANA timezone (`toLocaleDateString('en-CA', { timeZone })`) - prevents duplicate articles from concurrent deployments and fixes UTC date mismatch for non-US timezones. Slug date also uses local timezone. `neighborhoods!inner(id, name, city, timezone)` SELECT includes timezone. Uses actual `model` from brief (DB column is `model`, NOT `ai_model`). Uses `enrichment_model` from brief for enrichment tracking.
- **Effect:** If enrichment hasn't run yet when the email sends, the email will include regular articles but skip the brief link. The brief article gets created on the next cron cycle after enrichment completes.

### Look Ahead Articles (Forward-Looking Events)
- **Cron:** `generate-look-ahead` (`0 0,2,4,6 * * *`, maxDuration=300, 270s budget) - runs every 2h at midnight/2/4/6 AM UTC (4 runs, halved from 8 to cut xAI search costs), publishes for 7 AM local same day. Per-neighborhood local date computation via `getLocalPublishDate(timezone)`: `toLocaleDateString('en-CA', { timeZone })` for YYYY-MM-DD, `published_at` set to 7 AM local converted to UTC. Grok receives local date (not UTC tomorrow). Dedup queries a broad time window around all neighborhoods' publishAtUtc values and compares per-neighborhood within 2h tolerance (avoids UTC calendar date mismatch for UTC+11..+13 timezones where 7AM local falls on the previous UTC day).
- **Priority:** Neighborhoods sorted by delivery urgency - those whose 7 AM local comes soonest (APAC/East) are processed first
- **Scope:** Fetches `is_active=true` neighborhoods (same as Daily Brief cron - combos are `is_active=true`, components are `is_active=false` so naturally excluded). Filtered to only neighborhoods with active subscribers via `getActiveNeighborhoodIds()`, plus Irish counties (`ie-county-*`) and national Ireland (`ie-ireland`) which are always included regardless of subscriber count since their Look Ahead content is syndicated to yous.news. For combo neighborhoods, `getComboInfo()` expands to component names for Grok search (e.g., "FiDi, Tribeca Core, Lower East Side"). Article stored under combo ID.
- **Grok function:** `generateLookAhead()` in `grok.ts` - forward-looking search framed as "tomorrow morning" (since cron runs evening before). Explicit date context so Grok knows publication date. Returns `LookAheadResult` extending `NeighborhoodBrief` with `structuredEvents: StructuredEvent[]` parsed from `EVENTS_JSON:` section in Grok response.
- **Structured event listing:** `src/lib/look-ahead-events.ts` - `StructuredEvent` interface (date, day_label, time, name, category, location, address, price), `formatEventListing()` groups by date, deduplicates recurring events with "(also on Sun, Mon)" suffix, strips postcodes/city from addresses via `cleanAddress()`, sorts chronologically. Output format: `[[Event Listing]]\n\n[[Today, Sat Feb 21]]\n\nEvent name; Category, Time; Venue, Address.\n\n---`. Cron prepends formatted listing to Gemini-enriched prose body. `isEventLine()` exported for render detection (2+ semicolons). `isPlaceholder()` exported - filters "Not Listed", "TBD", "TBA", "N/A", "Unknown", "Not Available", "None" at both source (`formatEventLine()`) and render time. `ArticleBody.tsx` extracts `[[Event Listing]]...---` block and renders via interactive `EventListingBlock` component with three filter dimensions (day pills, time-of-day chips morning/afternoon/evening/all-day, category chips with +N more toggle), Google Search hyperlinked event names with dotted-underline academic styling, two-line layout (name + category badge, then time/venue/address/price with middot separators), locale-aware AM/PM for US via `formatTime(timeStr, country)`, and "No events match" empty state with "Clear filters" link. When `articleType === 'look_ahead'` and event listing exists, prose body is skipped entirely (redundant restatement of same events). `country` prop threaded through `ArticleBody` -> `TranslatedArticleBody` -> `[slug]/page.tsx`. `LookAheadCard.tsx` has matching compact rendering in expanded view. Teaser extraction skips event listing, only uses prose body. Fallback: if EVENTS_JSON missing/malformed, `structuredEvents = []`, article works prose-only.
- **Tourist trap filter:** Three layers: (1) Grok prompt excludes permanent shows (Mamma Mia, Lion King, Phantom, Wicked), guided tours, food tours, food hall tours, hop-on-hop-off, segway tours, pub crawls, escape rooms, and any activity primarily marketed to tourists; (2) Gemini enrichment `lookAheadStyle` has matching filter; (3) `isTouristActivity()` in `look-ahead-events.ts` catches anything that slips through via regex on event name/category. Only include tourist attractions if something genuinely unusual is happening (closing, reopening, major cast change, anniversary milestone).
- **Gallery/museum filter:** Three-layer filter (Grok prompt, Gemini enrichment, Gemini Search) prevents galleries/museums from being listed just because they're open during normal hours. Only include when there's a specific time-limited occasion: opening reception (with evening time like 6-8 PM), closing day, artist talk, new exhibition premiere, members-only preview, special ticketed event. The test: "would a local specifically plan to visit on THIS day vs any other day?" If no, exclude it.
- **Headline date rule:** Headline must reference something happening today or the very next day with events. Never headline an event 2+ days away when there are things happening sooner.
- **No repetition rule:** Both Grok prompt and Gemini `lookAheadStyle` prohibit repeating the same venue/restaurant/event across multiple day sections. If a venue is open every day, mention it once on the most relevant day. Skip days with no unique events rather than padding with repeats. Quality over quantity.
- **Banned passive language:** Both `grok.ts` (look-ahead system prompt) and `brief-enricher-gemini.ts` (`dailyBriefStyle` and `lookAheadStyle`) ban "Quiet Week/Friday/Day", "Slow", "Calm", "Winding Down", "Not Much Going On", "Nothing Major" in both headlines AND body text via ENERGY RULES. Always lead with what IS happening.
- **Enrichment:** `articleType: 'look_ahead'` in `brief-enricher-gemini.ts` - no greeting/sign-off, organized by individual day headers using `[[Day, Weekday Month Date]]` format (e.g., `[[Today, Wednesday February 18]]`, `[[Thursday, February 19]]`). Skip days with no events. Rendered as `<h3>` section headers by ArticleBody.tsx for scannability. `briefGeneratedAt` set to tomorrow 7 AM so Gemini CURRENT TIME context matches reader's perspective. Uses Flash exclusively (10K RPD, no Pro budget pressure).
- **Headline format:** `LOOK AHEAD: {headline}` (no neighborhood name prefix). Headline prefers Gemini's `subjectTeaser` via `toHeadlineCase()` (same punchy 1-4 word information-gap style as Daily Brief), falls back to Grok's raw headline. `cleanArticleHeadline()` strips the `LOOK AHEAD:` prefix for feed/email display. Article page shows full "LOOK AHEAD:" headline.
- **Article:** `article_type: 'look_ahead'`, `category_label: '{Name} Look Ahead'`, deterministic slug `{id}-look-ahead-{tomorrowDate}-{headline}`, `published_at` set to tomorrow 7 AM UTC, concurrency 5
- **Dedup:** Queries broad time window around all neighborhoods' `publishAtUtc` values, compares per-neighborhood within 2h tolerance (not calendar date range, which fails for UTC+11..+13)
- **API:** `GET /api/briefs/look-ahead?neighborhoodId=xxx` - returns most recent Look Ahead article URL (last 48h). Articles now stored under combo IDs directly. API still expands combo neighborhoods via `combo_neighborhoods` table for backward compatibility with any existing component-stored articles.
- **Feed link:** `LookAheadCard` (`src/components/feed/LookAheadCard.tsx`) - simple self-fetching link below daily brief. Fetches URL from Look Ahead API, renders "What's Coming Up in {name}" link (translated via `feed.lookAheadCta`). Returns null if no Look Ahead article exists. Wired into single-feed `page.tsx` and `MultiFeed.tsx`.
- **Discovery CTAs:** Look Ahead link in `BriefDiscoveryFooter` on article pages. Removed from `NeighborhoodBrief` expanded view (redundant since LookAheadCard itself now expands with discovery CTAs).
- **Email:** Look Ahead URL fetched in `assembler.ts` (`fetchLookAheadUrl()`), passed via `DailyBriefContent.lookAheadUrl`. Rendered in `DailyBriefTemplate` (after stories, before satellites) and `SundayEditionTemplate` (after THE NEXT FEW DAYS section). Link text: "Read the Look Ahead (next 7 days) for {name}". Both `fetchLookAheadAsStory()` and `fetchLookAheadUrl()` accept `isCombo` param — for combo neighborhoods, `expandNeighborhoodIds()` queries `combo_neighborhoods` table to include component IDs in the article lookup (fixes Tribeca, Ostermalm, Hamptons Overview missing Look Ahead articles stored under component IDs).
- **Article pages:** `BriefDiscoveryFooter` rendered with `variant="look_ahead"` on Look Ahead pages (shows "Read today's Daily Brief", hides self-referential Look Ahead link, shows add-to-neighborhoods + email capture), `variant="sunday"` on Sunday Edition pages (discovery links only), default `variant="daily"` on daily brief pages. Uses `article.neighborhood_id` from DB (not `buildNeighborhoodId()`) to avoid mismatches for non-standard country slugs.
- **Cost:** ~$0.48/day (~50-80 neighborhoods x $0.006 per Grok+Flash call)
- **Translation keys:** `feed.lookAhead`, `feed.lookAheadCta` in all 9 languages. Article body translation handled by existing `translate-content` cron.

### Mobile UX Overhaul
- **Navigation wayfinding:** Logo links to `/feed` (not `/`). "Stories" link in both desktop and mobile nav for all users. "Dashboard" gated behind admin. Default entry point changed from `/login` to `/signup`.
- **Homepage hero:** FLANEUR + tagline wrapped in `<Link href="/feed">` on both `/` (homepage) and `/discover` as manual fallback for returning users.
- **Mobile menu:** "Edit selections" renamed to "Edit Neighborhoods" with `text-amber-500/80` accent. "Stories" link appears for all users (auth + unauth). Padding tightened to `py-3`.
- **Back-to-top button:** Bottom-right FAB on mobile (`fixed bottom-6 right-4`), top-center on desktop. Text label hidden on mobile (`hidden md:inline`).
- **Masthead padding:** `pt-2 md:pt-6` (tighter on mobile, preserved on desktop).
- **Neighborhood nav (MultiFeed):** Mobile (<768px): dropdown selector (`bg-[#121212] border-white/10 rounded-lg`) showing active neighborhood name + city or "All Stories", with `max-h-[60vh]` scrollable list (amber dot for primary, checkmark for active, PRIMARY badge). Click-outside-to-close. "Explore other neighborhoods" link at bottom opens selector modal. Manage button beside dropdown; ViewToggle moved down to just above feed (`md:hidden flex justify-end`). "Make {name} my primary" link (`md:hidden`) appears below dropdown when a non-primary pill is selected - reorders localStorage, syncs cookie, calls sync-primary API, then `router.refresh()`. Desktop (>=768px): unchanged pill bar with drag-to-reorder, scroll arrows, fade indicators, manage + ViewToggle in pill row. Both share `activeFilter` state.
- **Guide/Map/History:** Hidden on mobile (`hidden md:flex`), replaced with `...` overflow dropdown (`md:hidden`) containing Guide/Map/History as vertical items.
- **Daily brief styling:** `border-l-2 border-amber-500/40` on brief container to distinguish from ads.
- **Brief ordering (single view):** Brief moved from before `<NeighborhoodFeed>` to `dailyBrief` prop (renders after header, not before neighborhood name).
- **Compact card mobile layout:** On mobile (`md:hidden`), metadata + headline render full-width above image. Image sits left with blurb to its right. Desktop unchanged (single flex row).
- **Gallery card mobile layout:** On mobile, metadata + headline render above the image (not overlaid). Headline wraps to max 2 lines via `line-clamp-2`. Desktop keeps gradient overlay on image. Gallery spacing: `space-y-6` mobile, `space-y-4` desktop.
- **Metadata no-wrap:** `CompactArticleCard` metadata row gets `overflow-hidden whitespace-nowrap`. Category label strips redundant neighborhood prefix via regex, truncates at 120px.
- **Neighborhood selector:** Search input no auto-focus on mobile (desktop only via `window.innerWidth >= 768`). Attempts geolocation on open for default nearest sort. Tapping a selected neighborhood in the list expands an inline action row (`expandedId` state) with Set Primary / Go to stories / Remove buttons instead of instantly deselecting - `expandedId` resets on search/tab change. Selected pills at top of modal are also clickable - tapping a pill expands Set as Primary (if non-primary) + Go to stories below it, X button still removes. `makePrimary` calls sync-primary API for DB sync. Mobile keyboard fix: `isSearchActive` state hides selected pills and sort buttons when focused + typing to maximize result space (200ms blur delay so clicks register). "Go to Stories >" escape link in modal header.
- **Auth flow:** `emailRedirectTo: window.location.origin/auth/callback` prevents localhost redirect. "Check spam" hint on confirmation screen.
- **AI badge on feed images:** `ArticleCard.tsx` skips the AI badge when `image_url` contains `unsplash.com` since those are real photos, not AI-generated.
- **Ad grace period:** `useNewUserGracePeriod` hook (`src/hooks/useNewUserGracePeriod.ts`) checks `flaneur-first-visit` localStorage timestamp. `FeedList` filters out ads and email prompts during first 5 days.
- **New localStorage key:** `flaneur-first-visit` (timestamp, set on first visit)

### Tracked Referral System
- **Invite page:** `/invite` - dual-mode page. **Inviter mode** (existing user, no `?ref=` param): "Share Flaneur" heading, personalized invite link in readonly input, "Copy Link" + "Share" buttons (native share on mobile), referral stats (clicks/friends joined) if > 0. **Invitee mode** (new visitor or `?ref=` param): streamlined hero with email input, auto-detects location on submit, subscribes, redirects to `/feed?welcome={city}`. No `SmartRedirect` (visitors must see the page). Detection: `flaneur-newsletter-subscribed` localStorage OR `flaneur-neighborhood-preferences` localStorage OR active auth session (via `getSession()`), AND no `?ref=` param.
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
  - Invite page: `/invite` shows share UX with invite link + copy/share buttons for subscribed users (inviter mode)
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
- **Create endpoint:** `POST /api/neighborhoods/create` (maxDuration=300) - auth, limit check, Gemini Flash AI validation (verifies real place where people live - neighborhoods, towns, villages, municipalities, cities - rejects countries/states/continents/fictional, normalizes name/city/country/region/timezone/coordinates), duplicate detection (exact ID + 500m Haversine proximity), insert, newsletter_subscribers sync, fast pipeline, instant resend
- **Pipeline:** Fast initial content via Gemini Flash (~15-20s total) instead of Grok (~40-60s). Image library runs in parallel with fact-gathering via `Promise.allSettled`. Full Grok pipeline runs overnight via `sync-neighborhood-briefs` cron for quality upgrade. Steps:
  1. Gemini Flash Search (`searchNeighborhoodFacts()`) + Unsplash image library (`generateNeighborhoodLibrary()`) in parallel (~5-10s)
  2. Brief creation from Gemini Search facts
  3. Gemini enrichment (`enrichBriefWithGemini()`) for proper greeting, structured sections, hyperlinks, subject teaser headline (~5-10s). If Gemini fails (quota exhaustion, API error), Claude Sonnet fallback via `enrichWithClaude()` produces same output format (local-language greeting, `[[section headers]]`, prose paragraphs, TEASER extraction).
  4. Article creation from enriched content (with `enriched_at` set so enrich-briefs Phase 2 skips it)
  5. If creator has non-English `preferred_language` in profiles, translates both brief and article via Gemini Flash in parallel (~2-3s). Inserts into `brief_translations` and `article_translations` so user sees content in their language immediately instead of waiting for translate-content cron.
- **Newsletter sync:** Auto-adds new neighborhood to creator's `newsletter_subscribers.neighborhood_ids` so email crons (sync-neighborhood-briefs, send-daily-brief) discover it
- **Count endpoint:** `GET /api/neighborhoods/my-community-count` - returns `{ count }` for limit UI
- **DB columns:** `neighborhoods.is_community` (boolean), `neighborhoods.created_by` (UUID), `neighborhoods.community_status` ('active'|'removed')
- **Region:** All community neighborhoods use `region: 'community'`
- **ID format:** `generateCommunityId(city, name)` - deterministic slug (e.g., `paris-montmartre`)
- **Shared utilities:** `src/lib/community-pipeline.ts` - `generateCommunityId()`, `generateBriefArticleSlug()`, `generatePreviewText()`
- **Neighborhood selector:** "All Neighborhoods" | "Community" tab toggle. Community tab has create form (text input + button with validating/generating status states), count display, community neighborhood list grouped by city. "Created by you" badge in `text-accent` for neighborhoods where `created_by === userId`, "Community" badge in `text-fg-subtle` for others. Prominent create CTA: when search has no results in All tab, sort buttons and selected pills hide, amber-bordered card appears with "Create {query}" full-width button that switches to Community tab with query pre-filled.
- **Modal tab param:** `openModal('community')` opens directly to Community tab (used by house ad)
- **House ad:** `community_neighborhood` type in `house_ads` - "Create Your Own Neighborhood" with "Get Started" button. Opens modal to Community tab. Hidden via `flaneur-has-community-neighborhood` localStorage once user has created one.
- **Post-creation flow:** On success, modal closes and navigates to `/{city}/{neighborhood}?created=true`. `NewNeighborhoodCelebration` component (`src/components/feed/NewNeighborhoodCelebration.tsx`) renders countdown timer with elapsed seconds, polls Supabase every 3s for first published article. On article found: balloon emoji celebration animation (24 emojis rising from bottom, `@keyframes balloon` in globals.css) for 4s, then `router.replace()` strips `?created=true` param and `router.refresh()` loads the feed. Safety timeout at 90s shows page anyway. Wired into `[city]/[neighborhood]/page.tsx` - renders when `created=true` and no articles exist.
- **Admin:** `/admin/community-neighborhoods` page + `GET/PATCH /api/admin/community-neighborhoods` - list all, remove/restore (toggles `community_status` + `is_active`)
- **Neighborhoods API:** Filters out `community_status = 'removed'` neighborhoods. Hides `region = 'test'` neighborhoods from non-admin users (admin check via session + profile role).
- **localStorage keys:** `flaneur-has-community-neighborhood` ('true' after first creation)
- **Executive status application:** When users reach 2-neighborhood limit, "apply for executive status here" link reveals inline textarea + submit. API: `POST /api/neighborhoods/apply-executive` inserts into `executive_applications` table (pending status). Duplicate prevention: one pending application per user.
- **Self-delete:** Creator can delete community neighborhood within 24h if 0 other followers. Trash icon with confirm dialog. API: `POST /api/neighborhoods/delete-community` (soft-delete: sets `community_status = 'removed'`, `is_active = false`). `GET` returns eligibility map. DB: `neighborhoods.created_at` column (null for existing = not eligible).
- **Report:** Users can report others' community neighborhoods. Inline "Report" link with reason input. API: `POST /api/neighborhoods/report`. DB: `neighborhood_reports` table (unique per neighborhood+reporter). "Reported" label replaces link after submission.
- **Celebration empty state:** Community neighborhoods with 0 articles and `?created=true` show `NewNeighborhoodCelebration` with countdown timer, pulsing dot, "Building your {name} edition" message, and balloon celebration when content arrives. Without `?created=true`, shows "Initializing Coverage Protocol" with pulsing dot. Feed page queries `is_community` from neighborhoods table.
- **1-week reminder email:** `send-community-reminder` cron (`0 9 * * *`) sends branded email to creators 7 days after creation. Links to most recent daily brief article + neighborhood feed page. Uses 24h time-window dedup (7-8 days ago) so each neighborhood is matched exactly once with no migration needed. Skips neighborhoods with no published articles or creators with no email. Logged to `cron_executions`.

### Dynamic House Ads ("Check Out a New Neighborhood")
- **DB record:** `house_ads` where `type = 'app_download'` updated: headline "Check Out a New Neighborhood", body "See what's happening today in a nearby neighborhood.", click_url `/discover` (static fallback)
- **Shared utility:** `src/lib/discover-neighborhood.ts` - `findDiscoveryBrief(supabase, subscribedIds, referenceNeighborhoodId, options?)` returns `{ url, neighborhoodName }` or null. `DiscoveryOptions`: `mode` (`'nearby'` default, or `'random'`), `excludeCity` (for random diversity).
- **Logic:** Fetches active non-combo neighborhoods, filters out subscribed. Nearby mode: sorts by Haversine distance. Random mode: Fisher-Yates shuffle, excludes specified city. Tries top 10 for a published Daily Brief article.
- **Email integration:** `src/lib/email/ads.ts` - `getHouseAd()` accepts `subscribedIds`/`primaryNeighborhoodId`, resolves dynamic URL for `app_download` type via `findDiscoveryBrief()`
- **Web integration:** `HouseAdDisplay` in `FallbackAd.tsx` - `useEffect` reads localStorage prefs, fetches `/api/discover-neighborhood?subscribedIds=...&referenceId=...`, updates click URL from `/discover` to resolved brief URL
- **API endpoint:** `GET /api/discover-neighborhood` - public, no auth, accepts `mode` and `excludeCity` query params, calls `findDiscoveryBrief()`, returns `{ url, neighborhoodName }` or `{ url: "/discover" }` fallback
- **Brief card CTAs:** `NeighborhoodBrief.tsx` - when expanded, shows discovery links below source attribution: "Read yesterday's [Name] Daily Brief", "Read today's nearby [Name] Daily Brief" (nearby mode), and "Take me somewhere new" (random mode, excludes current city). Lazy-fetched on first expand (three parallel API calls), cached in component state.
- **Brief article CTAs:** `BriefDiscoveryFooter.tsx` - on daily brief article pages, unified "Keep reading" section right after source attribution: yesterday's brief, add to neighborhoods (if not subscribed), nearby brief, "take me somewhere new", and inline email capture ("Get them emailed 7am daily"). Current neighborhood excluded from discovery candidates.
- **Yesterday's brief API:** `GET /api/briefs/yesterday?neighborhoodId=...&excludeSlug=...` - returns previous brief article URL for a neighborhood.

### Add to Collection CTA (Article Pages)
- **Component:** `AddToCollectionCTA` (private, inline in `FallbackAd.tsx`) - shows "Add {neighborhoodName} to Your Collection" on article bottom ad slot when the neighborhood is not in user's collection
- **Props:** `articleNeighborhoodId` and `articleNeighborhoodName` passed from article page to bottom `FallbackAd` only
- **Logic:** `useEffect` checks `flaneur-neighborhood-preferences` localStorage. If neighborhood already present, returns null (normal fallback renders). On click: adds to localStorage array, fires `POST /api/neighborhoods/add` (fire-and-forget DB sync), shows success state.
- **API endpoint:** `POST /api/neighborhoods/add` - accepts `{ neighborhoodId }`, uses `getSession()` auth. Authenticated: inserts into `user_neighborhood_preferences` (with next sort_order). Anonymous: returns success (localStorage-only).
- **Placement:** Bottom ad slot only on article pages (`position="bottom"`). Top slot remains normal house ad/fallback.

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

### Email System
- **Scheduler:** `src/lib/email/scheduler.ts` — 7 AM local time per recipient
- **Assembler:** `src/lib/email/assembler.ts` — explicit `fetchBriefAsStory()` + `fetchLookAheadAsStory()` per section (primary + each satellite), 2 stories per neighborhood (1 Daily Brief + 1 Look Ahead). `fetchBriefAsStory` uses 28h article window (must cover cross-timezone gap: Stockholm UTC+1 recipient's 6 AM UTC email vs NYC UTC-5 brief published_at 12 PM UTC previous day = 18h gap). `fetchLookAheadAsStory` uses 48h window. Both accept `isCombo` param and use `expandNeighborhoodIds()` with `.in('neighborhood_id', ids)` to find briefs stored under component IDs for combo neighborhoods. `isGreetingOnly()` regex detects greeting-only preview text (multilingual), `extractSentences()` splits text at sentence boundaries while skipping single-letter initials (e.g., "Solomon R."), falls back to first 2 non-greeting sentences of `body_text`. Dateline in category labels.
- **Sender:** `src/lib/email/sender.ts` — React Email via Resend. Sender name always "Flaneur News" (extracts email from `EMAIL_FROM` env var, wraps with display name). Daily Brief subject: `{teaser}, {neighborhood}` all lowercase (under 70 chars, e.g., "toughest table, west village"). Prefers Gemini-generated teaser from `neighborhood_briefs.subject_teaser`, falls back to lead headline (word-boundary truncated). No "Daily Brief:" prefix. Fallback when no teaser: `your morning brief, {neighborhood}`. Preview text: "Your morning brief from {Neighborhood}+" (+ appended when satellite neighborhoods exist).
- **Sunday Edition subject:** `{teaser}, {neighborhood}` all lowercase (matches Daily Brief format). Gemini-generated teaser from `weekly_briefs.subject_teaser` preferred, falls back to lead headline truncated at word boundary, last resort `your sunday edition, {neighborhood}`. `buildSundaySubject()` defined in both cron and on-demand routes.
- **Sunday Edition:** `src/lib/weekly-brief-service.ts` — Gemini Pro-first/Flash-fallback + Grok. Cron checks Pro RPD usage at start, uses Pro until budget exhausted (~5 calls/neighborhood), then falls back to Flash. Model param threaded through all 7 Gemini calls. Sections: The Letter, The Next Few Days, That Time of Year, Data Point, Your Other Editions. Cron processes 5 neighborhoods concurrently (~10/run at 280s budget). Schedule: `0 * * * 6,0` (hourly Saturday + Sunday, 48h window for full 270 neighborhood coverage). `weekDate` always calculates "this coming Sunday" (if already Sunday, use today; otherwise add days until Sunday) so Saturday and Sunday runs share the same date for dedup. Enrichment uses `weeklyRecapStyle` which forces Sunday framing regardless of processing day. Banned generic opener "quiet significance" and variants.
- **Sunday Edition template:** `SundayEditionTemplate.tsx` renders all narrative paragraphs in The Letter (not just teaser), single "Read the full edition" CTA (no duplicate "Continue reading" link), Unsplash hero image, postcards AND "Your Other Editions" shown together (not either/or).
- **Sunday Edition sender:** `send-sunday-edition/route.ts` falls back to other subscribed neighborhoods when primary has no weekly brief (iterates through all subscribed IDs, uses first with a brief, logs fallback). All downstream references (article URLs, Look Ahead, ad resolution, send tracking, secondary neighborhoods) use `usedNeighborhoodId`. Hero image fetched via `selectLibraryImageAsync()`. **Per-recipient dedup:** `recipientsSentThisWeek` Set checks `recipient_id` (not `recipient_id:neighborhood_id`) so each person gets at most one Sunday Edition per week regardless of which neighborhood is selected by fallback. The per-neighborhood `sentSet` is kept for backward compat but the per-recipient check runs first.
- **Holiday system:** 50 holidays across 20 countries. Local holidays listed before global so `detectUpcomingHoliday()` prioritizes them (e.g., Lunar New Year over Valentine's Day for Singapore). `detectUpcomingHoliday` accepts optional `referenceDate` param (publication `weekDate`) to anchor the 7-day window to the edition date, not generation time - prevents past holidays from appearing when briefs are generated days before publication. Fixed-date and nth-weekday holidays use calculation; lunar/Islamic/Hebrew/Hindu holidays use lookup tables (2025-2030). Regions: East Asian (CNY, Mid-Autumn, Dragon Boat), Japanese (Golden Week, Obon, Coming of Age), Islamic (Eid al-Fitr, Eid al-Adha), Jewish (Passover, Rosh Hashanah, Yom Kippur, Hanukkah), Indian (Diwali, Vesak), European national days, South African, UAE National Day, plus existing Western holidays.
- **Data Point voice:** Prompts reference neighborhood by name ("The Tribeca median listing", "Crime in Nolita is holding steady") instead of "we/our" possessive voice. Never use "we/our/us" in data point context - sounds too possessive for real estate/safety data.
- **Weather:** Pure logic in `src/lib/email/weather-story.ts` (no LLM). Priority hierarchy: 1) Safety/Extremes (blizzard, extreme heat) → red-bordered WeatherStoryCard, 2) Travel & Lunch (weekday rain probability) → thin-bordered `tomorrowBox`, 3) Weekend Lookahead (Thu/Fri only), 4) General Anomaly (forecast vs climate normals). Non-alert stories (priority 2-4) render in thin-bordered box (`tomorrowBox` style, `backgroundColor: '#fafafa'`) in `DailyBriefTemplate.tsx` with 13px #999999 text (each sentence on own line). Weather body references the forecast day explicitly. All probability displays use "% prob" suffix.
- **Hero block:** `{neighborhood} · {city}` (12px tracked caps) + temperature (48px Playfair Display, clickable link to Google weather search) + weather description + weather story hint (non-alerts only, 13px grey) - merged as one centered visual thought, no label
- **Temperature:** Single-unit: °F for USA, °C for everyone else. Sunday Edition data point same logic.
- **US neighborhoods:** °F only. Determined by `neighborhoods.country`
- **Instant resend:** `src/lib/email/instant-resend.ts` (3/day resend limit, skips Sundays via `getUTCDay() === 0` early return matching daily brief cron behavior)
- **Global daily email limit:** `src/lib/email/daily-email-limit.ts` - max 5 content emails per recipient per day (UTC), checked across `daily_brief_sends` + `weekly_brief_sends`. Wired into daily brief sender, instant resend, Sunday Edition cron, and on-demand Sunday Edition request. Transactional emails (password reset, ad confirmations) are exempt.
- **Layout:** Primary stories use compact `StoryList variant="primary"` (19px/16px), no hero image. Native ad after all primary stories (bordered frame, 1px solid #eeeeee, 4px radius).
- **Section headers:** Always `{neighborhood} · {city}` - no smart geography hiding. City in muted `#b0b0b0`.
- **Section dividers:** `SectionDivider` component - centered wide-tracked uppercase `{name} · {city}` + 32px gold accent rule (`rgba(120, 53, 15, 0.4)`). When combined text exceeds 25 chars, city renders on separate centered line below neighborhood name (prevents word-wrap on mobile for long names like "Greenwich Backcountry · New York Surroundings"). Same stacking logic in `DailyBriefTemplate.tsx` hero block.
- **Truncation:** `truncateAtSentence()` (160 chars) for both primary (`StoryList`) and satellite (`SatelliteSection`) preview text. No CSS line-clamp (was causing Gmail to render "..." dots instead of content).
- **Metadata word wrap:** `StoryList.tsx` drops city from location when combined `categoryLabel · location` exceeds 50 chars (shows just neighborhood name).
- **Preview text:** Uses plain hidden `<div>` instead of react-email `<Preview>` component. The `@react-email/preview` component injects 100+ invisible Unicode filler characters that Gmail renders as a visible "..." bubble. Both DailyBriefTemplate and SundayEditionTemplate use `previewHidden` style constant.
- **Typography:** Playfair Display via Google Fonts `@import` (Apple Mail renders; Gmail falls back to Georgia serif). All headlines, masthead, temperature use serif.
- **Masthead:** "FLANEUR" is a clickable link to `readflaneur.com` in both Daily Brief (`Header.tsx`) and Sunday Edition templates. Styled to match surrounding text (no underline).
- **Ad rotation:** `src/lib/email/ads.ts` - paid ads rotate deterministically per recipient per day via `djb2Hash(date + recipientId)` to compute a start index into the ad pool. Header ad = rotated[0], native ad = rotated[1], interstitial ads = rotated[2+]. Query uses `.order('id')` for stable ordering. House ad fallback uses `getHouseAds(count)` to pick multiple unique ads with per-slot hash offsets (`djb2Hash(date:recipientId:slotIndex)`), weighted pool expands each ad by `weight` column. `app_download` type resolves dynamic discovery brief URL via `findDiscoveryBrief()`. NativeAd supports body text, centered layout, bordered frame (1px solid, 4px radius). Image wrapped in `{ad.imageUrl && (...)}` to prevent alt text rendering as blue link when no image exists. Sunday Edition sponsor ad has matching bordered frame (1px solid #e8e0d4).
- **Interstitial ads:** `DailyBriefTemplate.tsx` inserts a `<NativeAd>` after every 3rd satellite section using `content.interstitialAds[Math.floor(i/3)]`. Populated from remaining rotated paid ads or additional unique house ads. `DailyBriefContent.interstitialAds: EmailAd[]` threaded from assembler.
- **Category labels:** `cleanCategoryLabel()` in assembler.ts strips neighborhood prefix, then renames "Daily Brief" to "Daily Brief (Today)" and "Look Ahead" to "Look Ahead (next 7 days)" for email display. Accepts `recipientTimezone` and `neighborhoodTimezone` params — "(Today)" check compares article's `published_at` formatted in neighborhood timezone against recipient's current date in recipient timezone (cross-timezone correct: Shibuya Mar 5 22:00Z = Mar 6 JST matches Stockholm Mar 6 CET → "(Today)"). `formatDateline(dateString?, timezone?)` formats dates in neighborhood timezone so Shibuya shows "Fri Mar 6" not "Thu Mar 5". Both threaded from `assembleDailyBrief()` via `recipient.timezone` + `neighborhood.timezone` (fetched from DB) through `fetchBriefAsStory`/`fetchLookAheadAsStory`/`toEmailStory`. Appended with dateline: "Daily Brief (Today) - Wed Feb 18".
- **Footer "forwarded" CTA:** "Was this forwarded to you? Subscribe here — it's free." shown in all emails. Daily Brief: rendered by `Footer.tsx`. Sunday Edition: inline in `SundayEditionTemplate.tsx`. Links to `/invite`.
- **Welcome email deliverability coaching:** `buildMagicLinkEmail()` in `subscribe/route.ts` includes platform-specific inbox tips after Verify Email button (Gmail Primary tab, Apple Mail VIPs, add to contacts).
- **Welcome email "Here's what to expect" grid:** 2x2 grid + bonus row between CTA and deliverability coaching showing Daily Brief, Look Ahead, Sunday Edition, Family Corner, Escape Mode features.
- **Inline referral CTA:** "Know someone who'd enjoy this? Share Flaneur or forward this email." After primary stories in `DailyBriefTemplate.tsx`, before footer in `SundayEditionTemplate.tsx`. Only renders when `referralUrl` exists.
- **Email divider hierarchy:** Primary story dividers `#d5d5d5`. Full-width `#999999` divider between primary and satellite sections (`DailyBriefTemplate.tsx`). Satellite section dividers full-width `#e0e0e0` (replaced 32px amber). Light `#e5e5e5` dividers between satellite stories.
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
- **Sunday ad resolver:** `src/lib/email/sunday-ad-resolver.ts` — date-aware cascade (`.lte('start_date', today).gte('end_date', today)` matching Daily Brief pattern in `ads.ts`) with house ad fallback
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

### Content Syndication API
- **Endpoint:** `GET /api/syndicate/irish-briefs?date=YYYY-MM-DD&county=dublin&secret=CRON_SECRET`
- **Auth:** `CRON_SECRET` via `Authorization: Bearer` header or `?secret=` query param
- **Purpose:** Provides enriched Daily Brief and Look Ahead content for all 32 Irish counties + national Ireland brief to yous.news
- **Params:** `date` (optional, defaults to today in Europe/Dublin), `county` (optional single county slug, or `ireland` for national brief only)
- **Response:** `{ date, count, coverage: { dailyBriefs, lookAheads }, counties: [{ county, countyName, dailyBrief: { briefId, headline, subjectTeaser, emailTeaser, enrichedContent, categories, article: { headline, bodyText, previewText, sources } }, lookAhead: { headline, bodyText, sources } }] }`
- **National brief:** When no county filter or `?county=ireland`, generates an "All Ireland" national brief by synthesizing top stories from all 32 county briefs via Gemini Flash with Google Search grounding. Returns as `county: "ireland"`, `neighborhoodId: "ie-ireland"` (maps to yous.news `ie-ireland` pseudo-county). National entry appears first in the response. Includes subject teaser, email teaser, 300-400 word body, preview text, and aggregated sources from contributing counties. Also includes `lookAhead` data from the `ie-ireland` Look Ahead article (generated by generate-look-ahead cron alongside county look-aheads).
- **Consumer:** yous.news fetches this daily to replace its own county brief generation for the 32 Irish counties
- **Cache:** 5 min private (secret-gated)

### Story Rewrite Syndication API
- **Endpoint:** `POST /api/syndicate/rewrite-stories`
- **Auth:** `CRON_SECRET` via `Authorization: Bearer` header
- **Purpose:** Rewrites yous.news stories using Flaneur's editorial voice via Gemini Flash with Google Search grounding
- **Request:** `{ stories: [{ id?, headline, sourceUrl, secondarySourceUrl?, sourceName, secondarySourceName?, category, originalBlurb?, publishedAt?, originalPublishedAt? }] }` (max 20 per request)
- **Response:** `{ count, errors, stories: [{ id?, headline, blurb (3 sentences), bodyText (150-200 words), sourceUrl }] }`
- **Processing:** Parallel batches of 5, Gemini Flash + Google Search grounding, insiderPersona('Ireland', 'News Editor'), exponential backoff on 429
- **JSON handling:** `responseMimeType: 'application/json'` is incompatible with Google Search grounding tools, so uses free-text JSON parse + `repairJson()` regex fallback for truncated output
- **Cost:** ~$0.003 per story (~$0.30/day for 100 stories)
- **Consumer:** yous.news calls after its own story generation to overwrite blurbs and bodies with Flaneur-quality rewrites. Yous.news preserves original source material (URLs, timestamps, original blurb) in its DB.

### Audio Bulletin Syndication
- **Cron:** `generate-audio-bulletin` (`55 * * * *`, maxDuration=60) - generates at :55, yous.news polls at :05
- **Endpoint:** `GET /api/syndicate/audio-bulletin?lang=en` - returns latest bulletin script with phonetic pronunciations
- **Auth:** `CRON_SECRET` via `Authorization: Bearer` header or `?secret=` query param
- **Purpose:** Writes 2-minute hourly news bulletin scripts for yous.news Irish TTS (Azure en-IE-EmilyNeural). Plain text output - yous.news owns SSML conversion and TTS.
- **Structure:** Lead story (~40s) + 3 Ireland-linked stories (~20s each) + human interest closer (~20s). No weather/markets (yous.news appends those).
- **Sources:** Fetches yous.news homepage stories via `GET /api/internal/homepage-stories` + last 3 bulletin scripts via `GET /api/internal/recent-bulletins?limit=3&lang=en` for continuity. Gemini Flash with Google Search grounding for latest facts.
- **Phonetic dictionary:** `IRISH_PHONETICS` in `src/lib/audio-bulletin.ts` - 120+ static entries (Irish government terms, names, places, counties, organisations, international names). Dynamic per-script pronunciations generated by Gemini. Merged and filtered to only terms appearing in the script.
- **Response:** `{ script, pronunciations: Record<string, string>, story_count, generated_at, hour }`
- **DB:** `audio_bulletin_scripts` table with `UNIQUE(bulletin_date, hour)` constraint. Upsert on each generation.
- **Fallback:** If Flaneur is down, yous.news falls back to its own local script generation.
- **Cost:** ~$0.15/day (24 Gemini Flash calls with search grounding)
- **Files:** `src/lib/audio-bulletin.ts` (dictionary + generation), `src/app/api/cron/generate-audio-bulletin/route.ts` (cron), `src/app/api/syndicate/audio-bulletin/route.ts` (GET endpoint)

### Agent Partner System (White-Label for Real Estate Agents)
- **Setup page:** `/partner` - 6-step client component: choose neighborhood, enter details (name/title/brokerage/phone/email/photo), add listings (up to 3 with address/price/beds/baths/photo), enter client emails, send preview email, activate with Stripe
- **Subscribe link:** `/r/[agent-slug]` - server component with agent branding, OG metadata, email capture form with timezone auto-detect. Subscribers tagged with `partner_agent_id`
- **Branded email template:** `src/lib/email/templates/BrandedDailyBriefTemplate.tsx` - separate from standard template. Header: "[NEIGHBORHOOD] DAILY / Curated by [Agent] - [Brokerage]". Listing cards after primary stories. Agent photo + contact in footer. "Neighborhood stories powered by Flaneur" credit.
- **Sender:** `sendBrandedDailyBrief()` in `sender.ts`. From name: `"James Chen: Tribeca Daily" <tribeca@readflaneur.com>` - reader sees neighborhood name in inbox, not "Flaneur"
- **Scheduler:** `src/lib/email/partner-scheduler.ts` - resolves branded recipients from three sources: (A) the broker's own `agent_email` so they receive a daily copy and see exactly what their clients see, (B) `client_emails` array on `agent_partners`, (C) `newsletter_subscribers` with matching `partner_agent_id`. Integrated into `send-daily-brief` cron after standard sends. Agent self-copy uses recipient id `agent-{partner_id}` (not a UUID) and is filtered out of the `daily_brief_sends` dedup check.
- **Cadence (simplified 2026-04-19):** Partner clients receive exactly ONE email - the branded Daily Brief, every day at 7 AM local time, 7 days a week. They never receive the Sunday Edition. On Sundays, `send-daily-brief` skips standard sends but still runs the branded partner block. `resolveRecipients()` in `scheduler.ts` excludes `newsletter_subscribers` with `partner_agent_id IS NOT NULL` so partner clients don't double up on either the standard Daily Brief or Sunday Edition.
- **Pricing:** $999/month flat per neighborhood, exclusive (one agent per neighborhood). **14-day free trial** via Stripe `subscription_data.trial_period_days: 14` with `missing_payment_method: 'cancel'` fallback and `payment_method_collection: 'always'` so card is captured up front. Stripe subscription via `/api/partner/checkout`.
- **DB:** `agent_partners` table (agent identity, neighborhood_id, agent_slug, listings JSONB, client_emails TEXT[], stripe fields, status setup/active/paused/cancelled). Unique index on `neighborhood_id WHERE status IN ('setup', 'active')`. `newsletter_subscribers.partner_agent_id` FK for tracking agent-sourced subscribers.
- **Storage:** `partner-assets` Supabase bucket (public) for agent photos and listing images
- **API routes:** `POST /api/partner/setup` (upsert), `GET /api/partner/check-neighborhood` (availability), `POST /api/partner/preview` (send preview email to a saved partner), `POST /api/partner/pitch-preview` (CRON_SECRET-gated - sends a real branded Daily Brief to a prospective broker WITHOUT persisting; used for cold-pitch outreach), `POST /api/partner/checkout` (Stripe session with trial), `GET /api/partner/status` (setup state), `POST /api/partner/upload` (photo upload), `POST /api/partner/subscribe` (client signup)
- **Setup pre-fill URL:** `/partner/setup` reads query params `?neighborhood=<id>&name=<agent>&email=<email>&brokerage=<brokerage>&title=<title>&phone=<phone>` on mount and hydrates form state. Neighborhood is pre-selected + availability-checked once the neighborhoods list loads. Used for cold-pitch deep links so brokers arrive at a partially completed form.
- **Broker welcome email:** Sent inside the `checkout.session.completed` webhook handler immediately after activation. Subject "Welcome to Flaneur - your {neighborhood} newsletter starts tomorrow". Explains first delivery at 7 AM local, confirms broker receives a daily copy, mentions weekly Monday report, shows trial end date (14 days from activation), includes `/r/{agent_slug}` subscribe URL and `/partner/dashboard` link.
- **Weekly broker report:** `send-weekly-broker-report` cron (`0 * * * 1` hourly Mondays). Sends at 9 AM local time per partner's neighborhood timezone. Reports new subscribers (7-day), total clients (`client_emails.length + newsletter_subscribers WHERE partner_agent_id`), daily briefs sent (`daily_brief_sends` filtered by `primary_neighborhood_id`), active listings count. Dedup via `agent_partners.last_report_sent_at` (migration `20260419_agent_partners_weekly_report.sql`) with 6.5-day guard. Open/click tracking is a future addition.
- **Stripe webhook:** Handles `checkout.session.completed` (activate + admin notification + broker welcome email), `customer.subscription.deleted` (cancel), `customer.subscription.updated` (pause on `past_due`/`unpaid`, reactivate on `active`), `invoice.upcoming` (admin alert with renewal date and amount — acts as early warning window to replace brokers if needed), `invoice.payment_failed` (admin alert with retention guidance; Smart Retries runs for ~3 weeks before cancellation). All gated by `metadata.type === 'partner'` lookup via `stripe_subscription_id`.
- **Isolation:** Standard Flaneur subscribers never receive branded emails. Only clients via `/r/[slug]` or agent's `client_emails` list get branded version. Partner clients never receive the standard Daily Brief or Sunday Edition - they get only the branded Daily Brief.
- **Pitch docs:** `C:\Users\morga\Desktop\flaneur-sothebys-pitch\` - email mockup, one-pager, coverage overlap, action plan, cold email template

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
    ├── translations.ts            # UI string dictionaries (9 languages)
    ├── translation-service.ts     # Gemini Flash translation + DB lookup
    └── weather.ts                 # Server-side Open-Meteo weather fetch (10-min cache)
```

## Environment Variables

**Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`
**Optional:** `GEMINI_API_KEY`, `GROK_API_KEY`, `OPENAI_API_KEY`, `UNSPLASH_ACCESS_KEY`, `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`, `RESEND_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `SENTRY_AUTH_TOKEN`

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
