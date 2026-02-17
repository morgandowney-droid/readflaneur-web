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

## Last Updated: 2026-02-17

Recent work: Fix health check brief coverage false positives (was using UTC midnight as "today" but cron uses per-timezone local dates with 36h lookback - APAC briefs generated before UTC midnight were falsely missing; also skips neighborhoods whose morning window hasn't passed yet), 3x brief generation throughput (sequential -> concurrency 3 Grok calls, was only generating ~9 briefs per run), 6x translation throughput (was only translating 26% of articles - concurrency 3->8, schedule */30->*/15, removed 30-per-language cap, Phase 1 budget 60%->75%), Fix translation stale state bug (switching languages left old translation on screen when new one didn't exist - now clears state before fetch in all 4 translation-fetching components: CompactArticleCard, ArticleCard, TranslatedArticleBody, NeighborhoodBrief), Fix email primary neighborhood mismatch (added primary_neighborhood_id to profiles table - scheduler was using ambiguous city-matching which picked wrong neighborhood when user had multiple in same city, now stores exact ID via sync-primary endpoint with city-based fallback), Fix forgot password flow (PKCE code exchange on reset-password page, send reset email via Resend instead of Supabase for inbox deliverability, fix Supabase Site URL from localhost to readflaneur.com), Pro-first Flash-fallback enrichment strategy (uses gemini-2.5-pro for first 900 requests/day then cascades to gemini-2.5-flash, preserves Pro quality for majority of briefs while staying within 1K RPD limit), Daily content health monitor cron (7 automated checks at 10 AM UTC - brief coverage, content quality, hyperlinks, HTML artifacts, translation coverage, email delivery, story images - creates cron_issues for auto-fixable problems and emails admin summary report), Fix Daily Brief card hyperlink stripping (negative lookbehind regex preserves markdown links in NeighborhoodBrief cleanContent), Strengthen link_candidates in Gemini enrichment (mandatory for all content types including weekly recaps), Add time budget to sync-neighborhood-briefs (270s of 300s maxDuration prevents silent kills with no logging), Sunday Edition concurrency + parallelization (3x concurrent neighborhoods in cron route + parallel Horizon/DataPoint/Holiday sections in generateWeeklyBrief for 2-3x faster generation), Sunday Edition Sunday-context enrichment (weeklyRecapStyle explicitly states "write as if it is Sunday" even when processed later), Move sign-out to /account page for infinite session pattern, Add retry-missing-images cron to fill failed article images, Filter empty image_url strings in feed image fallback, Fix Header auth persistence (getSession() deadlock via navigator.locks from GoTrue _initialize(), 3s timeout + onAuthStateChange only handles positive events, router.push client-side nav after login, removed getUser() from middleware that was clearing cookies, loading guard prevents SIGN IN flash), Fix Sunday Edition not sending (Daily Brief skips Sundays so it doesn't block Sunday Edition dedup, sync-weekly-brief batch increased from 10 to 500 to cover all 270 neighborhoods), Fix login/auth split-brain state (login redirects authenticated users to /feed, account page auto-heals stale localStorage tokens, sign-out clears both client+server state, GoTrue REST API bypass for broken CAPTCHA), Translate house ad text (headlines, body, CTAs) into 9 languages with type-specific CTA buttons and {neighborhoodCount} placeholder handling, Translate all 5 footer pages (about, legal, standards, contact, careers) into 9 languages with server/client splits for metadata + translation sync checker script, Preserve markdown links in Gemini enrichment pipeline (was stripping [text](url) before saving to DB so render-time fix had nothing to work with), Change share title to "Check out Flaneur" (was "Join me on Flaneur" which Outlook rendered as "Url from [name]"), Reduce header spacing between Stories and theme/language icons, Fix inviter detection on /invite (check auth session + localStorage neighborhoods, not just newsletter-subscribed flag), Restore hyperlinks in daily briefs and article bodies (HTML tags converted to markdown, markdown links rendered as clickable <a> elements instead of stripped), Rename "All Stories" to "All My Neighborhood Stories" on article pages (all 9 languages), Add spacing between neighborhood name and Edit Neighborhoods link on feed, Dual-mode invite page (subscribed users see share UX with copy link + native share + referral stats; invitees see join form unchanged) + fix subscribe CAPTCHA bypass (admin generateLink + Resend instead of signInWithOtp), Streamline invite page (remove manual neighborhood selection, auto-detect location on subscribe, "Join" instead of "Subscribe", dynamic house ad neighborhood count), Fix "Read yesterday's Daily Brief" to use date-relative queries (beforeDate instead of excludeSlug, ensures yesterday is relative to the brief being viewed), Change "Daily Brief for your primary" to "Above is the Daily Brief for your primary" in all 9 languages, Fix translate-content cron starvation (LIMIT 20 only translated newest 20 items, never reaching 800+; now uses 4-step ID-first approach) + fix broken cron logging (wrong column names caused 0 logged runs), DB cleanup of corrupted articles (7 specialized articles with Gemini refusal bodies deleted, 107 unprotected articles retroactively given enriched_at), Systemic enriched_at fix across all 27 article-creating crons (prevents enrich-briefs Phase 2 from overwriting specialized article bodies with daily brief content), Fix nuisance watch articles overwritten by enrich-briefs (set enriched_at at creation), Mobile feed vertical space fix (hide MagicLinkReminder on mobile, tighten daily brief spacing), Headline truncation dangling preposition strip (for/in/at/on/to/of/by/with/from/into/as/the/a/an/and/or/but), Translation completeness sweep (wire remaining UI strings through t(), translate Daily Brief category labels, article page brief headline via TranslatedHeadline, cron language rotation for fair zh/ja coverage), Daily brief discovery system (yesterday's brief + nearby + "take me somewhere new" CTAs on expanded briefs and brief article pages, unified "Keep reading" footer with integrated email capture), Compact article reactions (bookmark/heart only, no fire, inline), Gallery story separators, House ad single-line headlines, Article body Grok leak stripping, Daily brief primary neighborhood context in all-stories view, Shift brief generation window to midnight-7 AM (was 3-9 AM) for reliable email delivery, Render markdown hyperlinks in article body and brief content as clickable links (HTML tags converted to markdown format, stripped raw URLs and citation markers), Mobile gallery single-line headlines (no wrap, truncated at last full word) + wider story spacing (space-y-14), Editorial photo image style (watercolor → photorealistic fashion photography of iconic locations), Per-neighborhood default fallback images (stored in storage, checked before article fallback), Gallery mobile layout (headline-first, truncated metadata, 4-line blurb), Tighten headline generation prompts (80 chars → 50 chars across sync-news/Grok briefs/Grok stories), Fix mobile dropdown "All Stories" light mode contrast (text-white to text-fg), Block AI scrapers via robots.txt (21 bots), Wire translations into remaining components (EmailCaptureCard, MagicLinkReminder, MultiFeed "My Neighborhoods", ArticleCard gallery headlines), Remove auto-linking from articles and briefs (render-time entity detection + pipeline hyperlink injection disabled), Mobile headline truncation (40-char word-boundary truncation, strip dangling prepositions/articles/conjunctions/St.), Strip DAILY BRIEF prefix from feed headlines + mobile brief headline wrap, Add Portuguese/Italian/Simplified Chinese (9 languages), Language toggle globe icon + mobile fix, Stripe webhook secret trim fix, Mobile feed card layouts (compact: metadata+headline above image on mobile, gallery: metadata+headline above image with 2-line wrap, gallery spacing), Language translation system (batch pre-translation via Gemini Flash cron, 9 languages, LanguageToggle UI, translated articles/briefs/UI chrome), Search page UX (close button, rounded corners, luxury styling), Feed empty state CTA (Choose Neighborhoods button opens modal), Theme accent fix (theme-aware accent color, hamburger chip contrast, scroll-close threshold), Full light/dark theme system (CSS variables, useTheme hook, ThemeToggle, semantic Tailwind classes, flash prevention, force-dark hero), Mobile ViewToggle moved above feed (not in dropdown row), Fix generate-brief-articles cron (batch=10 starved 260+ neighborhoods, now processes all in one pass with 36h window), mobile dropdown "Explore" link + empty search -> Community Created tab, rename Community -> Community Created in selector, Mobile neighborhood dropdown (replaces pill scroll on mobile, full list in one tap), Signup page polish (remove role picker, rounded corners, default reader), enrichment-gated brief publishing (email + article cron skip unenriched briefs), custom SMTP via Resend for auth emails, Cloudflare Turnstile CAPTCHA on signup/login, standards page restyle, mobile view toggle consolidation, Mobile UX overhaul (navigation wayfinding, feed layout, selector fixes, auth flow, ad grace period), Community neighborhoods (user-created neighborhoods with AI validation + full brief pipeline), "Create Your Own Neighborhood" house ad, community neighborhoods TypeScript fixes (openModal signature, GlobalRegion exhaustiveness), global 5-email-per-day limit, always-resend on primary neighborhood change, Vercel preview build fix (lazy-init Supabase admin in 6 routes), Hamptons component renames (removed redundant suffix), brief content sanitization fixes (nested-paren URLs, URL-encoded artifacts), neighborhood selector tidy (renames, region consolidation, new neighborhoods), single-line feed headlines, enrichment language/framing fixes, brighter brief section headings, "Suggest a Neighborhood" house ad + contact form + admin page, dynamic house ads ("Check Out a New Neighborhood" with discovery brief links), Add to Collection CTA on article pages, bare /feed redirect, Grok search result sanitization, Sunday Edition holidays expanded (19 → 50 across 20 countries), tracked referral system, primary neighborhood sync, Gemini model switch (2.5-pro), feed article dedup, engagement-triggered email capture, smart auto-redirect.

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
- **Turnstile CAPTCHA:** Cloudflare Turnstile on `/signup` and `/login` pages. Gracefully degrades (no widget shown) when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is not set. On error, widget resets automatically. Submit button disabled until token received. Dark theme, flexible size. Requires Supabase dashboard CAPTCHA config with the Turnstile secret key.
- **Newsletter subscribe:** `/api/newsletter/subscribe` uses `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink' })` + Resend to send verification email. Bypasses Turnstile CAPTCHA (admin key). Does NOT use `signInWithOtp` (requires CAPTCHA token from client).
- **Custom SMTP:** Auth emails (confirmation, magic link) sent via Resend SMTP for better deliverability. Configured in Supabase Dashboard > Authentication > SMTP Settings.
- **Forgot password:** `/forgot-password` page calls `POST /api/auth/forgot-password` which uses `supabaseAdmin.auth.admin.generateLink({ type: 'recovery' })` + Resend to send branded reset email (bypasses Supabase email system entirely for better deliverability). Reset link routes through `/auth/callback?next=/reset-password` for PKCE code exchange. `/reset-password` page checks session and allows password update, redirects to `/feed` on success.
- **Signup form:** Name, email, password only. No role picker (all users default to `reader`). Rounded corners (`rounded-lg`) on all inputs/buttons matching login page.
- **Login flow:** Dual path: client-side `signInWithPassword` (15s timeout, stores session + emits SIGNED_IN) → server fallback `/api/auth/signin` (GoTrue REST API with service role key, bypasses CAPTCHA, sets cookies via Set-Cookie headers, then tries `setSession()` with 3s timeout to hydrate client). Uses `router.push('/feed')` (client-side nav) so Header receives SIGNED_IN event via shared singleton. Falls back to `window.location.href` if setSession hangs.
- **Header auth:** `getSession()` wrapped in 3s `Promise.race` timeout (navigator.locks can deadlock with GoTrue's `_initialize()`). `onAuthStateChange` only handles positive session events (never sets user to null). `loading` guard hides auth slot until resolved. Sign-out via full page reload from `/account`.
- **Middleware:** `getSession()` only (no `getUser()`). `getUser()` was removed because it makes a network call that can hang, and if it returns 401, GoTrue internally clears session cookies via the response's `setAll` callback.
- **Sign-out:** `/account` page calls `signOut()` + `POST /api/auth/signout` + `window.location.href = '/'` (full reload clears all state).

### Language Translation (Batch Pre-Translation)
- **Approach:** Batch pre-translate articles and briefs via Gemini Flash cron. UI strings via client-side dictionary.
- **Languages:** English (default), Swedish (sv), French (fr), German (de), Spanish (es), Portuguese (pt), Italian (it), Simplified Chinese (zh), Japanese (ja)
- **DB tables:** `article_translations` (article_id, language_code, headline, body, preview_text), `brief_translations` (brief_id, language_code, content, enriched_content). RLS: public read, service_role write.
- **Hook:** `useLanguage()` (`src/hooks/useLanguage.ts`) - language state, browser detection via `navigator.languages`, localStorage `flaneur-language`
- **Provider:** `LanguageProvider` (`src/components/providers/LanguageProvider.tsx`) - React context wrapping useLanguage, added to layout.tsx
- **UI strings:** `src/lib/translations.ts` - ~290 keys per language, `t(key, language)` lookup with English fallback. `useTranslation()` hook wraps context + t().
- **Toggle:** `LanguageToggle` (`src/components/layout/LanguageToggle.tsx`) - greyscale wireframe globe icon. OFF: click auto-detects browser language; if English, opens picker dropdown so user can choose. ON: globe + amber badge ("SV"), click globe = back to English, click badge = picker dropdown.
- **Cron:** `translate-content` (*/15, maxDuration=300, 250s budget). Translates articles/briefs from last 48h. Concurrency 8, exponential backoff on 429. Phase split: 75% articles, 25% briefs. No per-language cap. **Language rotation:** Rotates start language each run (based on quarter-hour offset) so all 8 languages get fair coverage. Logs to `cron_executions`.
- **API:** `GET /api/translations/article?id=...&lang=...`, `GET /api/translations/brief?id=...&lang=...` - 1h cache headers, returns translation or 404.
- **Content integration:** `TranslatedArticleBody` + `TranslatedHeadline` (article pages), `CompactArticleCard` (feed headlines/previews), `NeighborhoodBrief` (brief content) - all fetch translations client-side, fall back to English.
- **UI chrome:** `t()` wired into Header, Footer, MultiFeed, FeedList, BackToTopButton, NeighborhoodHeader, ContextSwitcher, WelcomeBanner, NeighborhoodBrief, search page, About, Legal, Standards, Contact, Careers pages
- **Flash prevention:** Inline script in layout.tsx sets `document.documentElement.lang` from `flaneur-language` localStorage
- **NOT translated:** Email templates (stay English), admin pages, neighborhood/city names (proper nouns), paid ad content (advertiser-supplied), advertise booking page. House ads ARE translated via `houseAd.{type}.headline/body/cta` keys.
- **Translation sync check:** `node scripts/check-translations.mjs` - verifies all languages have the same keys as English. Run after editing English strings.
- **Footer pages:** About (server/client split for Supabase data), Legal (privacy + terms tabs), Standards (server/client for metadata), Contact, Careers (server/client for metadata) - all fully translated via `t()` keys
- **localStorage key:** `flaneur-language` (ISO 639-1 code, absence = English)
- **Translation service:** `src/lib/translation-service.ts` - Gemini Flash wrapper with retry, preserves local language terms and proper nouns

### Enrichment-Gated Brief Publishing
- **Rule:** Brief articles are NEVER created from unenriched (raw Grok) content. Only `enriched_content` from Gemini is used.
- **Email assembler** (`assembler.ts`): `fetchBriefAsStory()` returns `null` if the brief has no `enriched_content`, skipping the brief link in the email rather than linking to sparse content.
- **Brief article cron** (`generate-brief-articles`): Already filters `.not('enriched_content', 'is', null)`, and no longer has a raw content fallback.
- **Effect:** If enrichment hasn't run yet when the email sends, the email will include regular articles but skip the brief link. The brief article gets created on the next cron cycle after enrichment completes.

### Mobile UX Overhaul
- **Navigation wayfinding:** Logo links to `/feed` (not `/`). "Stories" link in both desktop and mobile nav for all users. "Dashboard" gated behind admin. Default entry point changed from `/login` to `/signup`.
- **Homepage hero:** FLANEUR + tagline wrapped in `<Link href="/feed">` on both `/` (homepage) and `/discover` as manual fallback for returning users.
- **Mobile menu:** "Edit selections" renamed to "Edit Neighborhoods" with `text-amber-500/80` accent. "Stories" link appears for all users (auth + unauth). Padding tightened to `py-3`.
- **Back-to-top button:** Bottom-right FAB on mobile (`fixed bottom-6 right-4`), top-center on desktop. Text label hidden on mobile (`hidden md:inline`).
- **Masthead padding:** `pt-2 md:pt-6` (tighter on mobile, preserved on desktop).
- **Neighborhood nav (MultiFeed):** Mobile (<768px): dropdown selector (`bg-[#121212] border-white/10 rounded-lg`) showing active neighborhood name + city or "All Stories", with `max-h-[60vh]` scrollable list (amber dot for primary, checkmark for active, PRIMARY badge). Click-outside-to-close. "Explore other neighborhoods" link at bottom opens selector modal. Manage button beside dropdown; ViewToggle moved down to just above feed (`md:hidden flex justify-end`). Desktop (>=768px): unchanged pill bar with drag-to-reorder, scroll arrows, fade indicators, manage + ViewToggle in pill row. Both share `activeFilter` state.
- **Guide/Map/History:** Hidden on mobile (`hidden md:flex`), replaced with `...` overflow dropdown (`md:hidden`) containing Guide/Map/History as vertical items.
- **Daily brief styling:** `border-l-2 border-amber-500/40` on brief container to distinguish from ads.
- **Brief ordering (single view):** Brief moved from before `<NeighborhoodFeed>` to `dailyBrief` prop (renders after header, not before neighborhood name).
- **Compact card mobile layout:** On mobile (`md:hidden`), metadata + headline render full-width above image. Image sits left with blurb to its right. Desktop unchanged (single flex row).
- **Gallery card mobile layout:** On mobile, metadata + headline render above the image (not overlaid). Headline wraps to max 2 lines via `line-clamp-2`. Desktop keeps gradient overlay on image. Gallery spacing: `space-y-6` mobile, `space-y-4` desktop.
- **Metadata no-wrap:** `CompactArticleCard` metadata row gets `overflow-hidden whitespace-nowrap`. Category label strips redundant neighborhood prefix via regex, truncates at 120px.
- **Neighborhood selector:** Search input no auto-focus on mobile (desktop only via `window.innerWidth >= 768`). Attempts geolocation on open for default nearest sort. "Set as Primary" always visible on mobile (`opacity-100 md:opacity-0 md:group-hover/item:opacity-100`). "Go to Stories >" escape link in modal header.
- **Auth flow:** `emailRedirectTo: window.location.origin/auth/callback` prevents localhost redirect. "Check spam" hint on confirmation screen.
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

### Primary Neighborhood Sync
- **Endpoint:** `POST /api/location/sync-primary-neighborhood` - syncs primary neighborhood change to DB for email scheduler
- **Called from:** `useNeighborhoodPreferences.setPrimary()` (fire-and-forget, covers ContextSwitcher, modal, drag-reorder)
- **Logic:** Uses `getSession()` (not `getUser()`), looks up neighborhood city, updates `profiles.primary_city`/`primary_timezone`/`primary_neighborhood_id`, triggers instant resend on any primary change (same city or different)
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
- **7 checks:** Brief coverage, content quality (enrichment + paragraph count), hyperlinks in enriched content, HTML artifacts in article bodies, translation coverage, email delivery, story images
- **Output:** Creates `cron_issues` for auto-fixable problems (picked up by `monitor-and-fix` on next 30-min cycle), emails admin summary report with pass/warn/fail per check
- **New issue types:** `missing_sunday_edition` (manual), `unenriched_brief` (auto-fix via re-enrichment), `thin_brief` (manual), `missing_hyperlinks` (auto-fix via re-enrichment), `html_artifact` (manual)
- **Files:** `src/lib/cron-monitor/health-checks.ts` (check functions), `src/lib/cron-monitor/health-report-email.ts` (email template), `src/app/api/cron/check-daily-health/route.ts` (cron endpoint)

### Article Deduplication (sync-news)
- **RSS articles:** Deterministic `generateSlug()` (djb2 hash, no timestamp) + source URL check in `editor_notes`
- **Grok articles:** Headline similarity check (first 40 chars, same neighborhood, last 24h) + deterministic slug
- **Fashion week:** Slug includes day number; prompt requires "Day N" in headline with day-specific angle

### Gemini Enrichment (enrich-briefs)
- **Model strategy:** Pro-first, Flash-fallback. Uses `gemini-2.5-pro` for first 900 requests/day (reserves 100 RPD for Sunday Edition), then cascades to `gemini-2.5-flash`. Daily Pro usage tracked via `enrichment_model` column in `neighborhood_briefs`. Model split logged in `response_data` (`model_pro_used`/`model_flash_used`).
- **Schedule:** `*/15`, batch size 30, concurrency 4, Phase 1 budget 200s
- **Backoff:** Exponential retry on 429/RESOURCE_EXHAUSTED (2s, 5s, 15s delays)
- **Early termination:** Drains queue if any batch call hits quota
- **Two phases:** Phase 1 = briefs (200s budget), Phase 2 = articles (remaining ~80s)
- **Greeting:** Prompt explicitly requires "Good morning" (never evening/afternoon) since briefs are delivered in the morning regardless of enrichment time
- **Language:** Prompt requires English output with local language terms sprinkled in naturally (Swedish greetings, French venue names, etc.). Prevents Gemini from writing entirely in the local language when searching local-language sources.
- **Daily framing:** Prompt explicitly states "This is a DAILY update" and prohibits weekly/monthly framing ("another week", "this week's roundup")
- **Link preservation:** Gemini's Google Search grounding naturally includes markdown links in prose. These are preserved in `enriched_content` (not stripped). Render-time components convert them to clickable `<a>` tags.

### Brief Generation Timezone Handling (sync-neighborhood-briefs)
- **Morning window:** Midnight-7 AM local time (28 chances at `*/15`, survives 6h cron gaps). Starts at midnight to give 7h for full pipeline before 7 AM email.
- **Concurrency:** 3 parallel Grok calls per run (~27-30 briefs per run vs ~9-10 sequential). Each Grok brief takes ~25-30s.
- **Dedup:** `hasBriefForLocalToday()` uses `toLocaleDateString('en-CA', { timeZone })` per neighborhood
- **NOT UTC midnight:** Fetches last 36h of briefs, checks each against its local "today"
- **Content sanitization:** Both `grok.ts` and `NeighborhoodBrief.cleanContent()` strip raw Grok search result objects (`{'title': ..., 'url': ...}`) that occasionally leak into brief text

### Image Generation
- Endpoint: `/api/internal/generate-image`
- Model: `gemini-3-pro-image-preview` (via `AI_MODELS.GEMINI_IMAGE`)
- **Article images:** Ultra-photorealistic editorial fashion photography of iconic neighborhood locations (golden hour, cinematic, magazine texture)
- **Neighborhood defaults:** `mode: 'neighborhood_default'` generates one editorial photo per neighborhood, cached at `images/neighborhoods/{id}.png` in Supabase storage. Feed page checks storage first, then falls back to most recent article image.
- **Cron category images:** `src/lib/cron-images.ts` (22 categories, photorealistic editorial style)

### Email System
- **Scheduler:** `src/lib/email/scheduler.ts` — 7 AM local time per recipient
- **Assembler:** `src/lib/email/assembler.ts` — articles + weather, dateline in category labels
- **Sender:** `src/lib/email/sender.ts` — React Email via Resend
- **Sunday Edition:** `src/lib/weekly-brief-service.ts` — Gemini Pro (default, 100 RPD reserved by enrich-briefs) + Grok. Sections: The Letter, The Next Few Days, That Time of Year, Data Point, Your Other Editions. Cron processes 3 neighborhoods concurrently. Model param threaded through all 7 Gemini calls. Enrichment uses `weeklyRecapStyle` which forces Sunday framing regardless of processing day.
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

### Article Search
- **Page:** `/search` (`src/app/search/page.tsx`) - full-page search with X close button (`router.back()`), rounded-lg inputs/buttons/cards
- **API:** `GET /api/search?q={query}` - searches articles by headline, body, preview text via Supabase `ilike`. Max 50 results.
- **Header icon:** Magnifying glass in both desktop nav and mobile icon bar, links to `/search`
- **Results:** Thumbnail + neighborhood (uppercase tracked) + time ago + headline. Excerpts hidden on mobile.

### Combo Neighborhoods
- `src/lib/combo-utils.ts` — `getNeighborhoodIdsForQuery()`, `getComboInfo()`, `getComboForComponent()`
- Articles stored under combo ID, not component IDs
- Query must include BOTH combo ID and component IDs
- Component neighborhoods fall back to parent combo's daily brief on feed page

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
- **Current models:** Claude Sonnet 4.5, Gemini 2.5 Flash (enrichment fallback/translation), Gemini 2.5 Pro (enrichment primary + Sunday Edition, 1K RPD budget), Gemini 3 Pro Image (image gen), Grok 4.1 Fast
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
- **FLANEUR:** `text-6xl md:text-7xl lg:text-8xl` Cormorant Garamond serif, `tracking-[0.3em]`. Wrapped in `<Link href="/feed">` with tagline.
- **Tagline:** `tracking-[0.5em] uppercase`, `text-sm md:text-base`, neutral-400
- **Animations:** Staggered `heroFadeIn` keyframes in `globals.css` - 1.5s ease-out with 0.3s delays between elements (logo, tagline, stats, rule)
- **Padding:** `py-28 md:py-36 lg:py-48` for cinematic breathing room

### NeighborhoodHeader (Feed Page)
- **Mode prop:** `mode: 'single' | 'all'` (default `'single'`). Controls masthead content and control deck layout.
- **Masthead (single):** Centered `text-center pt-8`. City label, serif neighborhood name, italic combo sub-line, `NeighborhoodLiveStatus` with `mb-8`.
- **Masthead (all):** Centered `text-center pt-2 md:pt-6` (tighter mobile). "My Neighborhoods" heading (clickable - opens NeighborhoodSelectorModal) + "{N} locations" subtitle when no pill active. When a pill is active: city + combo components on one line (dot separator), Maps/History links, LiveStatus. Subtitle conditionally rendered (not fixed-height invisible).
- **Maps/History links (all mode):** Small grey dotted-underline links (`text-xs text-neutral-500 decoration-dotted`) under neighborhood name. Only shown when a specific pill is active. Same URLs as single-mode MAP/HISTORY.
- **NeighborhoodLiveStatus:** `font-mono text-xs font-medium tracking-[0.2em] text-amber-600/80`. Clickable - Google weather. Accepts `initialWeather` prop for server-side pre-fetch (skips client fetch when provided).
- **Control Deck:** CSS Grid `grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]` for overflow-safe centering. Left: `<ContextSwitcher>` (truncates long names), Center: GUIDE/MAP/HISTORY `hidden md:flex` on desktop, `...` overflow dropdown on mobile (`md:hidden`), Right: ViewToggle.
- **ContextSwitcher:** `src/components/feed/ContextSwitcher.tsx` - dropdown trigger (`{LABEL} ▾`, truncated `max-w-[80px] md:max-w-[200px]`) + popover (`bg-surface border-border-strong w-64 z-30`). Sections: "All Neighborhoods" (layers icon), neighborhood list (dot + name + city + primary badge + "Set primary" on hover with `hover:text-accent`), "Customize List..." (opens modal), "Invite a Friend" (via ShareWidget, shown only to subscribers). Click-outside + Escape close.
- **useNeighborhoodPreferences:** `src/hooks/useNeighborhoodPreferences.ts` - reads localStorage IDs, fetches name/city from Supabase, cross-tab sync via `storage` event. Exposes `primaryId` and `setPrimary(id)` to reorder localStorage array.
- **Primary neighborhood:** First item in localStorage array. Indicated across ContextSwitcher (amber dot + "PRIMARY" label), MultiFeed pill bar, HomeSignupEnhanced chips, and NeighborhoodSelectorModal. Users can change primary via "Set primary" actions.
- **Combo dropdowns:** `bg-surface border-white/[0.08]`, items `hover:text-white hover:bg-white/5`
- **ViewToggle:** Desktop: two buttons (compact + gallery) in pill bar row, active `text-white`, inactive `text-neutral-300`. Mobile: rendered separately just above feed content (`md:hidden flex justify-end`), not in dropdown row.
- **DailyBriefWidget:** Renders between Control Deck and FeedList (passed as `dailyBrief` ReactNode prop to `NeighborhoodFeed` or `MultiFeed`). Spacing: `mt-8 mb-12`. Section headings in brief cards use `text-neutral-200` (brighter than body `text-neutral-400`). Brief headline is single-line (`whitespace-nowrap overflow-hidden`).
- **MultiFeed integration:** `MultiFeed` now uses `<NeighborhoodHeader mode="all">` instead of standalone header. Accepts `dailyBrief` and `initialWeather` props. Passes `comboComponentNames` for combo subtitle. Pill filter switches the daily brief dynamically - fetches brief from `neighborhood_briefs` table client-side per neighborhood, with skeleton loading state.
- **MultiFeed render order:** Neighborhood nav renders BEFORE masthead for vertical stability. Desktop pills `md:sticky md:top-[60px]`. Mobile dropdown is not sticky. Left/right gradient fade indicators on desktop pill scroll container.
- **Drag-to-reorder pills:** Desktop only. Neighborhood pills are `draggable` with pointer events. On drop: reorders localStorage, navigates with new URL order. First pill = primary. Visual: dragged pill `opacity-50`, drop target amber left border, `cursor-grab`/`cursor-grabbing`. Mobile users reorder via the neighborhood selector modal.
- **ContextSwitcher setPrimary navigation:** `handleSetPrimary` now navigates with reordered IDs after calling `setPrimary()`, so MultiFeed reflects new primary immediately.
- **Shared slug utils:** `getCitySlugFromId()` and `getNeighborhoodSlugFromId()` in `neighborhood-utils.ts` replace duplicate helpers in MultiFeed, ComboNeighborhoodCards, feed/page.
- **ComboNeighborhoodCards:** Still exists for GuidesClient.tsx but removed from feed header

### Article Page Navigation
- **Back link:** `← ALL STORIES` at top, links to `/feed`
- **Bottom CTA:** `MORE STORIES` button, also links to `/feed`
- **Bare /feed redirect:** Both links go to bare `/feed` (no query params). `MultiFeed` detects empty `neighborhoods` prop, reads localStorage, and does `router.replace()` with neighborhoods + `scrollTo(0,0)`. Covers any path to bare `/feed` (back links, bookmarks, direct URL).
- **Empty feed CTA:** When localStorage is also empty (new user from search), shows centered "Choose Neighborhoods" button that opens the selector modal instead of a dead-end empty state.
- **No neighborhood-specific links:** Article pages are entry points from shared links too - `/feed` loads the user's own neighborhood set regardless of which neighborhood the article belongs to

### Article Body Typography ("Effortless Legibility")
- **Font:** Merriweather (Google Fonts, screen-optimized serif) via `--font-body-serif` CSS variable, fallback Georgia/Times New Roman
- **Size:** Mobile `text-[1.2rem]` (~19px), Desktop `text-[1.35rem]` (~22px) - WSJ/New Yorker scale
- **Line height:** `leading-loose` (2x) - white on black needs more space to avoid bloom
- **Color:** `text-neutral-200` (off-white, never pure #FFFFFF on dark)
- **Paragraph spacing:** `mb-8` between paragraphs
- **Links:** Academic "invisible link" style - `text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4`, hover: `decoration-solid decoration-neutral-300/60`. Markdown links `[text](url)` in content are rendered as clickable `<a>` tags. HTML `<a>` tags from AI output are converted to markdown format first. **Auto-linking disabled** - render-time entity detection and pipeline hyperlink injection both removed to avoid cluttered articles. No amber/blue link colors anywhere.
- **Bold:** `font-bold text-neutral-100`
- **Section headers:** `text-xl font-semibold text-neutral-100 mt-10 mb-6` in Merriweather

### Font Sizes (General)
- Feed body: 17px, Feed headlines: 20-22px (single-line on desktop `whitespace-nowrap overflow-hidden`, 2-line wrap on mobile gallery `line-clamp-2`), Metadata: 10-12px, Masthead: 30px
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
- `article_translations` / `brief_translations` — cached Gemini Flash translations (unique on article_id/brief_id + language_code)
- `rss_sources` — RSS feed URLs by city (192 feeds across 92 cities, 100% coverage)

## Deployment

```bash
git push origin master    # Deploy (then promote in Vercel dashboard)
npx supabase db push --include-all --yes  # Run migrations
```

## MCP Servers

Supabase, Vercel, Playwright, Supermemory, Frontend Design, Resend, Stripe, Sentry
