# Flaneur Web - Change History

> Full changelog moved here from CLAUDE.md to reduce context overhead.
> Only read this file when you need to understand how a specific feature was built.

## 2026-02-28

**Polish Exploration UX:**
- In explore mode, `ExplorationNextSuggestions` ("Keep Exploring") now renders ABOVE `BriefDiscoveryFooter` ("Keep Reading") so the next-neighborhood hero card is the primary CTA right after the subscribe nudge. Explorer no longer has to scroll past current-neighborhood links (yesterday's brief, Look Ahead) to find the next neighborhood. Non-explore mode keeps original order.
- Hero card "Continue exploring" CTA strengthened from `text-xs text-white/70` to `text-sm text-white font-medium` for better readability on dark images.
- Secondary suggestion links now show 32px circular Unsplash thumbnails with flex layout, matching the sticky bar aesthetic. Previously plain truncated text.
- `border-t border-border` divider added above "Keep exploring" section label for visual separation from subscribe nudge above.
- Files: `src/app/[city]/[neighborhood]/[slug]/page.tsx`, `src/components/article/ExplorationNextSuggestions.tsx`

**Ad-Free Explore Sessions:**
- Explore articles (`?explore=true`) now hide all ads and redundant CTAs to preserve "next episode" flow. Top house ad was the first visible element after the back link - explorer clicked a beautiful postcard/hero card excited to read about a neighborhood, and got an ad before the content. Bottom house ad interrupted the hero card → footer flow. `PostReadEmailCapture` was redundant with `ExploreSubscribeNudge`. `MoreStoriesButton` linking to `/feed` was misleading for explorers who may not have a feed.
- Four `{!isExploring && (...)}` guards in `[slug]/page.tsx`: top ad slot, bottom ad slot, PostReadEmailCapture, MoreStoriesButton. Both paid `StoryOpenAd` and `FallbackAd` are gated.
- Explore page bottom now flows: subscribe nudge → KEEP READING links → KEEP EXPLORING hero card → secondary text link → footer. Clean.
- Files: `src/app/[city]/[neighborhood]/[slug]/page.tsx`

**Deepen Exploration Engagement Beyond 1 Level:**
- Users clicking postcards or discovery cards were reading one article and bouncing. The old `ExplorationNextSuggestions` rendered 3 plain text links buried below the article - easy to miss and no visual pull.
- **Visual "Read Next" card:** Rewrote `ExplorationNextSuggestions.tsx`. Hero card with Unsplash photo (`aspect-[2/1] md:aspect-[5/2]`, `rounded-xl`, gradient overlay `from-black/80 via-black/20`), tracked-caps neighborhood/city, serif headline, "Continue exploring" CTA in `text-white/70 tracking-wider uppercase`. Secondary suggestions as truncated text links below. Fallback to styled `bg-surface` card when no image. sessionStorage cache (`flaneur-explore-{neighborhoodId}`) shared with ExplorationBar. `getVisitedIds()` reads sessionStorage cache keys to pass `exclude` param to API, breaking suggestion ping-pong loops.
- **Sticky ExplorationBar:** New `ExplorationBar.tsx` - fixed bottom bar during `?explore=true` sessions. Appears at 40% article scroll via IntersectionObserver. `bg-surface/90 backdrop-blur-md`. Shows circular 40px Unsplash thumbnail + neighborhood + headline + "Next" link. Positioned `bottom-0 md:bottom-14` with `z-[55]` to sit above `z-50` LocationPrompt toast on mobile. Outer wrapper `pointer-events-none` with inner content div `pointer-events-auto` so clicks pass through background to elements below (e.g., location toast "Not now" button). 500ms delay before cache check so ExplorationNextSuggestions populates sessionStorage first. Own `getVisitedIds()` reads sessionStorage cache keys and passes `exclude` param to API, preventing wrong suggestion on level 2+ pages (was showing the neighborhood user came FROM). Hides on scroll-up, reappears on scroll-down. Dismiss X persists to `flaneur-explore-bar-dismissed` sessionStorage.
- **Exploration session trail:** New `useExplorationSession` hook tracks visited neighborhoods in `flaneur-exploration-session` sessionStorage. Auto-adds current page on mount. `BackToFeedLink` now accepts `trailCount` prop - shows "EXPLORING (N NEIGHBORHOODS)" when trail > 1.
- **Subscribe nudge:** New `ExploreSubscribeNudge.tsx` - after SourceAttribution on explore articles. "Enjoying {name}? Add to my neighborhoods" one-tap action. Checks localStorage, adds with cookie sync + fire-and-forget API, shows checkmark. Hidden if already subscribed.
- **API change:** `/api/explore/next` now returns `imageUrl: string | null` in Suggestion interface. All 3 strategy queries include `image_url` in SELECT. Returns Unsplash URLs only (null for non-Unsplash images).
- **Client wrappers:** New `ExplorationWrapper.tsx` with `ExplorationBackLink` and `ExplorationBarWithSession` connecting session trail state to server-rendered `[slug]/page.tsx`.
- New files: `src/components/article/ExplorationBar.tsx`, `src/components/article/ExplorationWrapper.tsx`, `src/components/article/ExploreSubscribeNudge.tsx`, `src/hooks/useExplorationSession.ts`
- Modified files: `src/app/api/explore/next/route.ts`, `src/components/article/ExplorationNextSuggestions.tsx`, `src/components/article/TranslatedArticleNav.tsx`, `src/app/[city]/[neighborhood]/[slug]/page.tsx`

**Polish Email Template:**
- Moved postcard section up from after Family Corner to right after primary stories/referral CTA. Provides an early color break (Unsplash photo) in the otherwise B&W text-heavy email, instead of being buried at the bottom.
- Removed "Share on X / Facebook" links from lead story in `StoryList.tsx`. Nobody clicks social share links from inside an email - they share the article URL directly. Removed `ShareLinks` component and unused `shareRow`/`shareLink`/`shareDot` styles.
- Files: `DailyBriefTemplate.tsx`, `StoryList.tsx`

**Polish Exploration Discovery UX:**
- Discovery card "+" button now toggles between add/remove - tapping again removes the neighborhood from the user's feed (previously one-way add only). Cards check localStorage on mount so already-subscribed neighborhoods show "✓" immediately.
- Mobile discovery cards show brief feedback label ("Added to feed" / "Removed") that auto-clears after 2 seconds. Added `animate-fade-in` CSS animation.
- Added `handleRemove` callback to `useDiscoveryBriefs` hook (removes from localStorage + syncs cookie). `onRemove` passed through `BentoCardProps` alongside `onAdd`, stripped from sessionStorage cache alongside `onAdd`.
- Article page: moved `ExplorationNextSuggestions` above the bottom ad (was sandwiched between ad and "More Stories" - now directly after BriefDiscoveryFooter, close to article content).
- Removed "Explore nearby" neighborhood pills section from article pages (redundant with exploration suggestions). Removed associated `nearbyNeighborhoods` Supabase query (saves a DB call per article page load).
- Files: `MobileDiscoveryCard.tsx`, `BentoCard.tsx`, `useDiscoveryBriefs.ts`, `MobileDiscoverySection.tsx`, `globals.css`, `[slug]/page.tsx`

**Exploration Discovery Redesign:**
- **Email Postcards:** New `email_postcards` cache table stores daily postcard selection (same for all recipients). `selectDailyPostcard()` scores candidates on proper nouns (+5), date references (+3), city recency (+3/-10 for 7-day repeat), teaser density (+2 if >60 chars), filler (-5). Sunday variant picks top 3 with city diversity. `PostcardSection` React Email component with gold `#C9A96E` POSTCARD label, warm `#FDFBF7` background, Unsplash photo, and "Explore" link. Daily single inserted after Family Corner in DailyBriefTemplate. Sunday triple replaces "Your Other Editions" in SundayEditionTemplate (falls back to existing links if < 2 candidates).
- **Mobile Feed Discovery:** `useDiscoveryBriefs` hook extracted from MultiFeed (~180 lines of inline bento state/fetch/cache logic). `MobileDiscoveryCard` renders photo cards in 2-col grid (`aspect-[4/3]`, rounded-xl, gradient overlay, "+" subscribe button). `MobileDiscoverySection` container with "Beyond {Name}" title, per-region labels, loading skeleton, and "Show me more" refresh button. `NeighborhoodDiscovery` client wrapper wraps hook for single-neighborhood pages. MultiFeed refactored to use hook with `md:hidden` mobile section after load-more. Discovery prop wired into NeighborhoodFeed, `[neighborhood]/page.tsx`, and `feed/page.tsx`.
- **Article Page Exploration:** `GET /api/explore/next` endpoint with three strategies: sameCity (different neighborhood in same city), sameTheme (category keyword matching across cities), geoHop (nearest different-country neighborhood via Haversine). `ExplorationNextSuggestions` client component fetches on mount, renders up to 3 links ("Also in {city}", "Elsewhere", "Meanwhile in {city}") with shimmer skeleton. `?explore=true` URL param tracks exploration sessions - BackToFeedLink shows "Keep Exploring" instead of "All My Neighborhood Stories". BentoCard and MobileDiscoveryCard links append `?explore=true`.
- **Removals:** `AddToCollectionCTA` removed from FallbackAd.tsx (~70 lines), `articleNeighborhoodId`/`articleNeighborhoodName` props removed. Escape mode house ad deactivated via migration (`active = false`), escape_mode branches removed from FallbackAd.tsx and email/ads.ts. `BriefDiscoveryFooter` simplified from 248 to 92 lines - removed add-to-neighborhoods button, nearby/random discovery fetches, inline email capture form; kept only yesterday's brief link and Look Ahead link. `NeighborhoodBrief` discovery CTAs removed (nearbyDiscovery, randomDiscovery, yesterdayUrl state, lazy-fetch useEffect, and rendering block).
- **Translations:** 4 new keys in all 9 languages: `bento.beyond`, `bento.beyondYour`, `bento.showMore`, `explore.keepExploring`.
- New files: `supabase/migrations/20260303_email_postcards.sql`, `src/lib/email/postcard-selector.ts`, `src/lib/email/templates/components/PostcardSection.tsx`, `src/hooks/useDiscoveryBriefs.ts`, `src/components/feed/MobileDiscoveryCard.tsx`, `src/components/feed/MobileDiscoverySection.tsx`, `src/components/feed/NeighborhoodDiscovery.tsx`, `src/app/api/explore/next/route.ts`, `src/components/article/ExplorationNextSuggestions.tsx`
- Modified files: `types.ts`, `assembler.ts`, `DailyBriefTemplate.tsx`, `SundayEditionTemplate.tsx`, `send-sunday-edition/route.ts`, `MultiFeed.tsx`, `NeighborhoodFeed.tsx`, `[neighborhood]/page.tsx`, `feed/page.tsx`, `[slug]/page.tsx`, `TranslatedArticleNav.tsx`, `BentoCard.tsx`, `FallbackAd.tsx`, `NeighborhoodBrief.tsx`, `BriefDiscoveryFooter.tsx`, `ads.ts`, `translations.ts`
- Net: -549 lines removed, +366 lines added (183 lines net reduction)

## 2026-02-27

**Expand Look Ahead Search to Include Major Cultural Venues:**
- Neighborhood-scoped search queries in both Grok (`generateLookAhead`) and Gemini Search (`searchUpcomingEvents`) missed city-wide cultural venues like national theaters, opera houses, concert halls, and philharmonics (e.g., Dramaten, Stockholm Opera, Konserthuset wouldn't appear in a "Vasastan, Stockholm" search).
- Added explicit "MAJOR CULTURAL VENUES" search instruction to both `grok.ts` (Look Ahead system prompt) and `gemini-search.ts` (upcoming events prompt) - instructs the search to always check what's playing at the city's major cultural venues, noting they serve all neighborhoods not just the one they're located in.
- Added "Theater, opera, ballet, classical music" and "Performances at major cultural venues in {city}" to search focus lists in both files.
- Files: `grok.ts`, `gemini-search.ts`

**Polish Look Ahead Event Listing:**
- Strip "(not Vasastan)" and similar neighborhood annotations from event addresses via `stripNeighborhoodAnnotations()` regex: removes `(not X)`, `(bordering X)`, `(near X)`, `(outside X)`, `(close to X)` patterns.
- Normalize category badge text: `normalizeCategory()` strips "/SubType" suffixes (e.g., "Music/Show" -> "MUSIC", "Food & Drink/Fair" -> "FOOD & DRINK") for cleaner uppercase pills.
- Make filter bar collapsible: three filter rows (day/time/category) now hidden behind a "Filter" toggle button with chevron icon and count badge showing active filter count. Saves significant vertical space on mobile, especially for articles with many day/category options.
- Files: `ArticleBody.tsx`

**Redesign Look Ahead Event Listing with Interactive Filters and Hyperlinks:**
- Replaced static "At a glance" event listing with interactive `EventListingBlock` component featuring three filter dimensions: day pills, time-of-day chips (Morning/Afternoon/Evening/All Day), and category chips (top 5 shown, "+N more" toggle for rest). All filters are client-side `useState` with `useMemo` for efficient re-rendering.
- Event names are hyperlinked to Google Search (`name + city`) using the existing dotted-underline academic link styling (`decoration-dotted decoration-neutral-500/40`).
- Two-line event layout: Line 1 = hyperlinked name + category badge (small pill), Line 2 = time/venue/address/price with middot separators in `text-fg-muted`.
- Added `isPlaceholder()` helper to `look-ahead-events.ts` - filters "Not Listed", "TBD", "TBA", "N/A", "Unknown", "Not Available", "None" from both source (`formatEventLine()`) and render-time parsing. Exported for use in `ArticleBody.tsx`.
- Locale-aware AM/PM time formatting: `formatTime()` converts 24h times to AM/PM for US/USA country codes (e.g., "19:00" -> "7:00 PM", "10:00-15:00" -> "10:00 AM - 3:00 PM"). Non-US countries pass through as-is. Already-formatted AM/PM times pass through.
- When `articleType === 'look_ahead'` and an event listing block exists, the prose body is skipped entirely - it restated the same events in paragraph form, wasting reader time.
- `country` prop threaded through `ArticleBody` -> `TranslatedArticleBody` -> `[slug]/page.tsx` (reads `article.neighborhood?.country`).
- "No events match" empty state with accent-colored "Clear filters" link. Filter summary at bottom shows "Showing N of M events - Clear filters".
- Files: `ArticleBody.tsx`, `TranslatedArticleBody.tsx`, `[slug]/page.tsx`, `look-ahead-events.ts`

**Fix Supabase 1000-Row Default Limit Causing Duplicate Brief Generation:**
- `sync-neighborhood-briefs` fetches 7 days of briefs (~1890+ rows) to check `hasBriefForLocalToday()`. Without `.limit()`, Supabase silently caps at 1000 rows. Today's briefs for some neighborhoods were dropped, causing `hasBriefForLocalToday()` to return false. The 4 alphabetically-first NYC neighborhoods (Bergen Gold, Brooklyn Heights, Brooklyn West, Chelsea) regenerated every 15-min run (10+ times each today), consuming ~20% of processing capacity while 27 other NYC neighborhoods (Tribeca, West Village, Upper West Side, SoHo, etc.) stayed pending.
- Added `.limit(5000)` to sync cron query and `.limit(3000)` to health-checks and issue-detector monitoring queries.
- Files: `sync-neighborhood-briefs/route.ts`, `health-checks.ts`, `issue-detector.ts`

**Fix Email Assembler Brief Shadowing Bug:**
- `fetchBriefAsStory()` fallback query fetched the newest brief by `created_at` DESC without filtering `enriched_content IS NOT NULL` in the query. If a newer unenriched brief existed (generated by midnight cron but not yet enriched by `*/15` cron), it shadowed the older enriched brief and returned null - causing Daily Brief content to be missing from the email body.
- Subject teaser query used different sort order (`generated_at` DESC) and lacked `enriched_content` and `expires_at` filters, so it could find a teaser from a different brief than the body used. This caused emails with a subject line teaser but no Daily Brief content.
- Fix: Moved `enriched_content IS NOT NULL` into the DB query (not post-fetch check) in `fetchBriefAsStory()`. Aligned subject teaser query to use same sort order (`created_at` DESC), same `enriched_content IS NOT NULL` filter, and same `expires_at` filter.
- File: `assembler.ts`

**Prioritize City-Qualified Unsplash Results (3:1 Ratio):**
- Ambiguous neighborhood names like SoHo, Chelsea, Downtown got wrong city's photos because the `interleave()` function used 1:1 alternating between city-qualified (`"{name} {city}"`) and name-only (`"{name}"`) search results.
- Name-only results for "SoHo" are dominated by NYC photos regardless of which city was queried in the city-qualified search, so 50% of category slots got NYC photos even for SoHo London.
- Changed interleave ratio from 1:1 to 3:1 - takes 3 city-qualified results for every 1 name-only result, ensuring 6+ of 8 category slots get the correct city's photos.
- File: `unsplash.ts`

**Compact Masthead Neighborhood Label:**
- Primary neighborhood name now displayed next to weather/time in the compact masthead bar above the bento grid, so users know which neighborhood the weather refers to.
- File: `MultiFeed.tsx`

**Polish Bento Grid (5 Fixes):**
- **Lighter gradient:** Changed overlay from `from-black/85 via-black/30` to `from-black/70 via-black/25` so neighborhood photos are more visible. Added `text-shadow: 0 1px 4px rgba(0,0,0,0.5)` on headlines as safety net for bright photos.
- **Lopsided discovery sections:** When a region has exactly 2 cards, both are now `wide` (col-span-2 each, filling all 4 columns). Discovery sections with <2 cards are filtered out entirely. User section keeps hero card behavior.
- **"+" subscribe button:** Discovery cards show a `+` circle button (top-right, appears on hover with `bg-black/50 backdrop-blur-sm`). Click adds neighborhood to `flaneur-neighborhood-preferences` localStorage, syncs cookie, and fires `/api/neighborhoods/add`. Swaps to green checkmark on success. `onAdd` prop on `BentoCardProps`, handler in MultiFeed follows same pattern as `AddToCollectionCTA`.
- **Session cache + refresh:** Bento sections cached in `sessionStorage` (`flaneur-bento-cache`) after first API fetch. Within a session, content stays consistent. "Discover more" button at grid bottom clears cache and refetches with `&_t=` cache-buster. `onAdd` callbacks re-attached after loading from cache (functions aren't serializable).
- **Compact masthead:** Desktop shows single-line bar between pills and bento grid: "My Neighborhoods" (clickable, opens selector modal) + location count on left, `NeighborhoodLiveStatus` (weather + time for primary neighborhood) on right. Full `NeighborhoodHeader` stays hidden on desktop when bento is active, visible on mobile as before.
- Files: `BentoCard.tsx`, `BentoGrid.tsx`, `MultiFeed.tsx`, `translations.ts`
- Translation keys added: `bento.discoverMore`, `bento.added` in all 9 languages

## 2026-02-26

**Fix Daily Brief Card Showing Teaser Text Before Greeting:**
- Some neighborhoods (Upper West Side, West Village) showed the `subject_teaser` value (e.g., "affordability shift") and `email_teaser` blurb as visible paragraphs above the "Morning, neighbors." greeting in the Daily Brief card on the feed. Other neighborhoods (Tribeca, Malibu, Ostermalm) were unaffected.
- Root cause: Gemini inconsistently outputs teaser values as standalone prose paragraphs WITHOUT `SUBJECT TEASER:` / `EMAIL TEASER:` label prefixes. The existing regex stripping (`^SUBJECT TEASER:.*$`) only catches lines WITH labels, so unlabeled teasers slipped through.
- Fix: `NeighborhoodBrief.tsx` now finds the first greeting/filler paragraph (via existing `isGreetingOrFillerParagraph()`) and drops all paragraphs before it, matching the same pre-greeting stripping logic already in `ArticleBody.tsx` for article detail pages.
- This is a render-side fix - the stored `enriched_content` still contains the teaser text but it's now invisible. The collapsed card preview was already unaffected (preview extraction already skipped non-greeting paragraphs).
- Files: `NeighborhoodBrief.tsx`

**Expand Image Rotation to Full Unsplash Photo Pool:**
- RSS/news articles previously rotated across only 8 category photos per neighborhood. Now draws from the full pool: 8 category photos + up to 40 alternates stored in `unsplash_alternates` JSONB, giving ~48 unique images to rotate through per neighborhood.
- `CacheEntry` in `image-library.ts` now includes `alternates` field. `preloadUnsplashCache()`, `getUnsplashPhotos()`, and `selectLibraryImageAsync()` all fetch `unsplash_alternates` from DB. `selectLibraryImage()` builds combined pool for RSS/news articles (`articleIndex % fullPool.length`). Brief/Look Ahead/Sunday Edition articles still use their dedicated category photos.
- `swapNegativeImage()` cache invalidation now preserves remaining alternates. `getLibraryReadyIds()` cache set includes `alternates: []` placeholder.
- Refresh cron (`refresh-image-library`) now triggers regeneration for neighborhoods with empty `unsplash_alternates` (feature added mid-quarter, needs backfill). Added `unsplash_alternates` to status query and empty-alternates condition to `needsRefresh` filter.
- Files: `image-library.ts`, `refresh-image-library/route.ts`

**Rotate RSS/News Article Images Across Full Photo Library:**
- RSS and news articles all used the single `rss-story` category photo, causing identical images on every "News Brief" article for a neighborhood (visible when multiple articles appear in the same feed view).
- Fix: `resolveCategory()` in `image-library.ts` now rotates RSS/news/standard articles across all 8 Unsplash library categories using `articleIndex % 8`. Added optional `articleIndex` param to `selectLibraryImage()` and `selectLibraryImageAsync()`.
- Updated callsites: `sync-news` (RSS articles use `results.articles_created`, Grok articles use `results.grok_articles_created`), `sync-nuisance-watch` (uses `results.articles_created`), `retry-missing-images` (uses loop index `i`).
- Existing articles keep their current image; new articles going forward get visual variety.
- Files: `image-library.ts`, `sync-news/route.ts`, `sync-nuisance-watch/route.ts`, `retry-missing-images/route.ts`

**Use Gemini Subject Teaser for Look Ahead Headlines:**
- Look Ahead articles used Grok's raw `HEADLINE:` output directly, producing generic date-heavy headlines like "Art Openings Thu", "Wine Class Tonight!", "Lincoln Center Vogue Tonight" while Daily Brief headlines got punchy Gemini-generated teasers like "Tragedy on Waverly".
- Fix: `generate-look-ahead/route.ts` now prefers `enriched.subjectTeaser` via `toHeadlineCase()`, matching the Daily Brief pattern from `generate-brief-articles`. Falls back to Grok headline when no teaser available.
- Files: `generate-look-ahead/route.ts`

**Fix Repeating Topics in Daily Briefs:**
- Persistent topics (e.g., Artion Cafe closure in Tribeca) appeared in nearly every brief for 2 weeks. Root cause: Grok searched blind with zero topic history, Gemini Search got 5 headlines but Grok ran in parallel ignoring them, and Gemini enrichment only passively suggested back-references.
- Layer 1 - Grok: Added optional `recentTopics` param to `generateNeighborhoodBrief()`. Injects "RECENTLY COVERED TOPICS" block into system prompt instructing Grok to find different stories unless genuinely new information exists (new tenant, legal update, community reaction).
- Layer 2 - Cron: Extended `sync-neighborhood-briefs` lookback from 36h to 7 days, increased headline count from 5 to 10, now passes `recentTopics` to both Grok and Gemini Search (previously only Gemini Search).
- Layer 3 - Gemini enrichment: Changed anti-repetition instruction from passive ("you may briefly reference") to prescriptive ("DROP that story entirely, dedicate space to other stories"). Exception only for concrete new facts with back-reference.
- Layer 4 - Continuity context: Extended `fetchContinuityContext` in enrich-briefs from 5-day/3-day lookback to 10-day/7-day, item limits from 5/10 to 10/20.
- Files: `grok.ts`, `sync-neighborhood-briefs/route.ts`, `brief-enricher-gemini.ts`, `enrich-briefs/route.ts`

**Auto-Swap Negatively-Scored Unsplash Photos:**
- Users can thumbs-down article images via `ImageFeedback.tsx`, but votes were just stored with no action. Now photos with 2+ net downvotes (score <= -2) are automatically replaced.
- New `searchAllCategoriesWithAlternates()` in `unsplash.ts` - same dual-search logic but returns overflow photos (positions 8+, capped at 40) as alternates, and filters out rejected photo IDs before category assignment. Existing `searchAllCategories()` untouched for zero risk.
- `image-library-generator.ts` now fetches `rejected_image_ids` before search, calls the alternate-aware search, and upserts `unsplash_alternates` alongside `unsplash_photos`.
- New `swapNegativeImage()` in `image-library.ts` - finds which category holds the bad URL, swaps in first alternate, bulk-updates all articles using the bad URL, blacklists old photo ID in `rejected_image_ids` (persists across library refreshes), invalidates module-level cache, triggers Unsplash download attribution.
- Phase 3 added to `retry-missing-images` cron after existing Phases 1 (missing) and 2 (AI replacement): calls `get_negative_images(-2)` RPC, resolves neighborhood via articles table, calls `swapNegativeImage()`, logs `negative_swapped` count.
- DB migration: `unsplash_alternates JSONB DEFAULT '[]'` and `rejected_image_ids TEXT[] DEFAULT '{}'` columns on `image_library_status`, index on `image_feedback(image_url)`, `get_negative_images(threshold)` RPC.
- Zero extra Unsplash API calls - alternates are photos already fetched and previously discarded.
- Files: `unsplash.ts`, `image-library.ts`, `image-library-generator.ts`, `retry-missing-images/route.ts`, migration `20260302_image_swap_alternates.sql`

## 2026-02-25

**Family Corner Email Improvements:**
- Added light divider line (`#e5e5e5`) between age group sections for visual separation (detects when age band prefix changes, e.g., "Infant" to "Toddler").
- "For your primary neighborhood" now shows the neighborhood name: "For your primary neighborhood: Tribeca".
- Headline prompt tightened: max 50 chars (was 80), must name a specific activity/venue, no neighborhood prefix, no "for your kids" suffix, no colons. Bad: "Tribeca Fun: BPC Play, Art & Music for Your Kids". Good: "Baggywrinkle crafts at the Seaport".
- Empty day sub-sections now skipped entirely instead of "No specific events today" filler. If an age group has nothing for today AND next 2 days, a single ongoing drop-in option is mentioned without the Today/Next 2 Days split.
- Both Grok and Gemini prompts updated.
- Files: `FamilyCornerSection.tsx`, `generate-childcare-content.ts`

**Consistent Greeting on Daily Brief Article Pages:**
- Daily Brief articles opened from the feed sometimes showed the greeting ("Morning, neighbors.") and sometimes didn't. Root cause: Gemini occasionally outputs subject_teaser and email_teaser as prose text before the greeting in the body content, pushing the greeting to the 3rd paragraph instead of the 1st.
- Fix: `ArticleBody.tsx` now detects the greeting paragraph for `brief_summary` articles and strips all preceding paragraphs (teaser labels, summary lines). Greeting patterns cover all 9 languages.
- New `articleType` prop threaded through `TranslatedArticleBody` -> `ArticleBody` from the article detail page.
- Does NOT affect feed card previews, compact card blurbs, or email blurbs - those continue to strip greetings as before.
- Files: `ArticleBody.tsx`, `TranslatedArticleBody.tsx`, `[slug]/page.tsx`

**Rounded Corners on Website Images, Ads, and CTA Buttons:**
- Added `rounded-xl` (12px) with `overflow-hidden` to all article images: compact feed card thumbnails (CompactArticleCard), gallery hero images (ArticleCard), article detail page hero image, and ad card images (AdCard).
- Added `rounded-xl` to all ad/house ad containers: StoryOpenAd, FallbackAd (all variants - bonus ads, house ads, newsletter signup, static house ad, add-to-collection, suggest neighborhood, community neighborhood, family corner, escape mode).
- Added `rounded-lg` to all inline CTA buttons and spans that were missing rounding (Add, Learn More, Subscribe, etc.) and form inputs in newsletter signup.
- Files: `CompactArticleCard.tsx`, `ArticleCard.tsx`, `[slug]/page.tsx`, `AdCard.tsx`, `StoryOpenAd.tsx`, `FallbackAd.tsx`

**Softer Rounded Corners on Email Images and Buttons:**
- Inspired by Hedvig's email design. Bumped `borderRadius` across all email templates for a softer, more modern look.
- Hero/outer images: `4px` to `12px` (HeroStory.tsx story image, Header.tsx ad banner, SundayEditionTemplate.tsx hero image).
- Ad/sponsor container borders: `4px` to `12px` (NativeAd.tsx container, SundayEditionTemplate.tsx sponsor section).
- Nested images inside containers: `4px` to `8px` (NativeAd.tsx ad image, SundayEditionTemplate.tsx sponsor image).
- CTA buttons: `4px` to `8px` (NativeAd.tsx ctaButton).
- Weather tomorrowBox: `6px` to `12px` (DailyBriefTemplate.tsx).
- Added missing `borderRadius: '12px'` to Sunday Edition hero image (was the only image without any rounding).
- Files: `HeroStory.tsx`, `Header.tsx`, `NativeAd.tsx`, `SundayEditionTemplate.tsx`, `DailyBriefTemplate.tsx`

**Fix Look Ahead published_at 24h Off for APAC Timezones:**
- Waiheke (Auckland, NZ, UTC+13) Look Ahead articles showed "Feb 26" content and "-461m ago" timestamp on Feb 25. Root cause: `getLocalPublishDate()` used noon UTC as reference to compute timezone offset, but noon UTC on Feb 25 is already 1 AM Feb 26 in NZ. The offset came out as -11 instead of +13, setting `published_at` to 7 AM Feb 26 NZDT (wrong) instead of 7 AM Feb 25 NZDT (correct).
- Fix: use midnight UTC as reference and compare local day/month to detect which side of the date boundary we're on. Same date = positive offset (APAC), previous day = negative offset (Americas). `Date.UTC` handles hour rollover for negative utcHour values.
- Verified for Auckland (UTC+13: 7 AM local = prev day 18:00 UTC) and NYC (UTC-5: 7 AM local = same day 12:00 UTC).
- Also fixed `formatRelativeTime()` in utils.ts: when `published_at` is in the future (viewer in earlier timezone), returns just the date string instead of "-461m ago".
- Files: `src/app/api/cron/generate-look-ahead/route.ts`, `src/lib/utils.ts`

**Use Subject Teaser as Daily Brief Article Headline:**
- The short 1-4 word Gemini-generated `subject_teaser` (e.g., "heated school meeting", "$12m lodge sale") now used as the Daily Brief article headline in Title Case, replacing the longer Grok-generated headline.
- New `toHeadlineCase()` utility in `utils.ts` - smart title case that keeps small words (a, the, of, in) lowercase unless first word, preserves tokens starting with symbols ($12m) or already mixed-case (IKEA, de Blasio).
- `generate-brief-articles` cron: added `subject_teaser` to SELECT, uses it as headline when available.
- `assembler.ts` fallback path: same change for on-the-fly article creation.
- Falls back to Grok headline when `subject_teaser` is null.
- Email subject line path completely untouched - reads `subject_teaser` from `neighborhood_briefs` table independently. No circular dependency.
- Files: `src/lib/utils.ts`, `src/app/api/cron/generate-brief-articles/route.ts`, `src/lib/email/assembler.ts`

**Filter Routine Gallery Hours from Look Ahead + Headline Must Reference Today:**
- Grok was listing 13+ galleries simply open during normal hours as "events" in Look Ahead articles (e.g., Tribeca Feb 25 listed ongoing exhibitions at One Art Space, Ippodo Gallery, Canada Gallery, etc. as if they were special events). Headline referenced "Feb 27" gallery openings despite today being Feb 25.
- Three-layer fix across all event-sourcing prompts:
  - `grok.ts` (generateLookAhead): New GALLERY AND MUSEUM FILTER section requires specific time-limited occasions (opening receptions, closing days, artist talks, exhibition premieres). Added to exclusion list. Headline rule now requires referencing today or the very next day with events.
  - `brief-enricher-gemini.ts` (lookAheadStyle): New GALLERY/MUSEUM FILTER mirrors Grok prompt rules.
  - `gemini-search.ts` (searchUpcomingEvents): Search targets updated from generic "Gallery exhibitions" to "Gallery opening RECEPTIONS, artist talks, exhibition premieres, closing days (NOT galleries simply open during normal hours)". New filter section added.
- The test applied everywhere: "would a local specifically plan to visit on THIS day vs any other day?" If no, exclude it.
- Files: `src/lib/grok.ts`, `src/lib/brief-enricher-gemini.ts`, `src/lib/gemini-search.ts`

## 2026-02-24

**Align Email Assembler Blurb Filters with Feed-Side Fixes:**
- Email blurbs from `toEmailStory()` in assembler.ts had the same filler detection gaps as the feed side: missing curly apostrophes, no sign-off detection, no generic scene-setter patterns.
- `isGreetingStart()`: expanded to check first sentence only (not whole text) with curly apostrophe `['\u2019]?` support. Added filler openers: "Here's the download"/"Another brisk morning"/"A crisp Tuesday"/"Right then, Tuesday"/"A crisp Monday".
- `isFillerText()`: added generic scene-setters matching NeighborhoodBrief patterns, curly apostrophe support throughout.
- New `isSignOff()`: detects closing remarks ("Enjoy the day", "Stay warm", "Until tomorrow", "Bundle up", "Have a great day") that shouldn't be email preview text.
- `extractInformativeSentences()`: now strips teaser labels case-insensitively from body text before sentence extraction, filters sign-off sentences, curly apostrophe in date-filler pattern.
- `needsBetterPreview` in `toEmailStory()`: now also checks `isSignOff(previewText)`.
- Files: `src/lib/email/assembler.ts`

**Fix Case-Insensitive Teaser Label Stripping + Generic Filler Openers:**
- Gemini outputs teaser labels in varying case: "SUBJECT TEASER:", "subject_teaser:", "EMAIL TEASER:", "email_teaser:". Old regex was case-sensitive, only matching uppercase.
- Updated to case-insensitive `(?:SUBJECT|subject)[_ ](?:TEASER|teaser)` pattern in 3 files: `NeighborhoodBrief.tsx` cleanContent(), `ArticleBody.tsx` content cleaning, `brief-enricher-gemini.ts` enrichment post-processing.
- Added generic scene-setting filler patterns to both `NeighborhoodBrief.tsx` and `CompactArticleCard.tsx`: "Another brisk/chilly/cold/warm morning", "A crisp Tuesday morning", "Right then, Tuesday", "Here is the latest", "There's always something", "For those looking to", "Welcome to", "Ready for".
- Verified across 8 neighborhoods: UWS, Tribeca, West Village (NYC), Stockholm/Ostermalm, London/Soho, Paris/Le Marais, Tokyo/Shibuya.

**Fix [[Header]] Marker Stripping and Sign-Off Detection in Brief Preview:**
- Paragraph loop was skipping entire paragraphs starting with `[[` (section headers). But some paragraphs have the marker inline with content: `[[Tin Building Goes Dark]] The corporation's Tin Building...`. Skipping the whole paragraph lost the useful content after the marker.
- Fix: strip `[[header]]` markers with `.replace(/^\[\[[^\]]*\]\]\s*/, '')` and use remaining content instead of skipping.
- Added `isSignOff()` function detecting closing remarks: "Enjoy the day", "Stay warm", "Stay safe", "Until tomorrow", "See you tomorrow", "Have a great/good/wonderful", "That's all for", "Bundle up".
- Paragraphs under 30 chars now skipped (catches fragments like "Enjoy the day." that aren't caught by sign-off patterns).
- Fallback when all paragraphs are filler changed from `paragraphs[0]` (which was "Morning, neighbors.") to empty string with a secondary search for any paragraph with 15+ chars.
- Files: `src/components/feed/NeighborhoodBrief.tsx`

## 2026-03-01

**Handle Curly Apostrophes in Filler Detection:**
- Gemini enrichment outputs U+2019 (right single quotation mark / curly apostrophe) instead of ASCII apostrophe (U+0027). Filler regex patterns like `/^here'?s/` used `'?` which only matches the ASCII variant, so "Here\u2019s the download..." bypassed filler detection entirely.
- Updated all apostrophe-containing patterns in both `isGreetingOrFillerParagraph()` (NeighborhoodBrief.tsx) and `isFillerSentence()` (CompactArticleCard.tsx) to use `['\u2019]?` character class matching both straight and curly apostrophes.
- Root cause of persistent "Here's the download for our corner of the world today..." preview despite the multi-paragraph loop fix being deployed correctly.

**Fix Filler Detection for Long Paragraphs and Multi-Paragraph Filler:**
- `isGreetingOrFillerParagraph()` had a 200-char length limit that caused it to miss filler-starting paragraphs exceeding 200 chars. Fix: checks only the first sentence against filler patterns, no length limit.
- Enriched briefs have separate short paragraphs for each filler line (P0: "Morning, neighbors." P1: "Here's the download..." P2: "[[Digging Out]]" header P3: "If you're just waking up..."). Old code only skipped P0 and used P1 unconditionally.
- Fix: loops through all paragraphs, skipping filler paragraphs and `[[header]]` section markers, extracts useful sentences from long filler-starting paragraphs. UWS preview now shows "Yesterday's blizzard left its mark, dropping a hefty 19.7 inches in Central Park." instead of three consecutive filler sentences.
- Added "If you're just waking up" filler pattern to both NeighborhoodBrief and CompactArticleCard.

**Skip Filler Blurbs in Feed Cards + Suppress Subscribe Prompt for Logged-In Users:**
- Daily Brief card showed "Here's the download for our corner of the world today, Tuesday, February 24, 2026." as preview text. `isGreetingParagraph()` only caught greetings like "Good morning" but missed filler openers.
- Expanded to `isGreetingOrFillerParagraph()` with filler patterns: "Here's the download/latest/lowdown/update", "It's been a busy/quiet week", "Welcome to", "Let's dive in", date-only sentences, plus equivalents in all 9 languages.
- CompactArticleCard: added `cleanBlurb()` that splits text into sentences, skips filler/greeting sentences, then truncates at sentence boundary. Feed article blurbs now show real news content instead of filler.
- ReturnVisitPrompt + EmailCaptureCard: suppressed for logged-in users by checking `flaneur-auth` localStorage. Users who signed up before auto-subscribe feature was added didn't have `flaneur-newsletter-subscribed` key set, causing subscribe prompts despite being active email recipients.

**Fix Look Ahead Article Paragraph Splitting:**
- Look Ahead day sections rendered as wall-of-text paragraphs with multiple events crammed together (e.g., tree tapping + teen hangout + Come From Away musical all in one paragraph).
- Root cause: sentence-boundary splitting in `ArticleBody.tsx` only triggered when `paragraphs.length === 1 && length > 500`. Look Ahead articles have multiple paragraphs (one per `[[Day, Date]]` header), so the condition never fired.
- Fix: apply sentence splitting to any individual paragraph over 400 chars, targeting ~300 char sub-paragraphs at sentence boundaries. Skips `[[header]]` paragraphs and short content.
- Result: each event/topic within a day section gets its own paragraph for better readability.

**Replace Look Ahead Expandable Card with Simple Link:**
- The expandable card with "At a glance" event listing was visually jarring and didn't integrate well with the brief styling.
- Replaced `LookAheadCard` (362 lines) with a minimal component (~50 lines) that fetches the Look Ahead URL and renders a clean link: "What's Coming Up in {name}" (translated via `feed.lookAheadCta` in all 9 languages).
- Same props interface (`neighborhoodId`, `neighborhoodName`, `city`) so all 3 callsites (`[city]/[neighborhood]/page.tsx`, `MultiFeed.tsx` x2) remain unchanged.
- Removed: expandable card UI, event listing parsing/rendering, prose paragraph rendering, discovery CTAs (yesterday/nearby/random), markdown link rendering helpers, sentence teaser extraction.

**Strip SUBJECT TEASER/EMAIL TEASER Labels and Daily Brief Label from Display:**
- Gemini outputs "SUBJECT TEASER: snowball showdown" and "EMAIL TEASER: Snowball fight targets NYPD..." as visible prose text alongside the JSON block. These leaked into `enriched_content` and displayed in brief cards and article pages.
- Stripped in `brief-enricher-gemini.ts` during text processing (prevents future storage).
- Render-time stripping in 3 components for existing articles: `NeighborhoodBrief.tsx` `cleanContent()`, `ArticleBody.tsx`, `LookAheadCard.tsx`.
- Also strips "Daily Brief: {name}." label text from Look Ahead card teaser and expanded body (Gemini injects label at start of Look Ahead prose).

**Post-Process Email Teasers for Gemini Stubborn Patterns:**
- Gemini Pro ignores negative prompt instructions ("NEVER say starts tomorrow", "NO boilerplate like See what's on at") despite explicit rules. Two fixes:
- **Fix 1 - JSON schema example:** Changed JSON schema `email_teaser` value from description placeholder to concrete example text ("Shin Takumi finally opens on Spring St. DEJAVU pop-up extended again. Golden Steer reservations live."). Gemini follows examples over prose instructions (known gotcha).
- **Fix 2 - `cleanEmailTeaser()` post-processor:** Strips connective filler ("Plus,", "Also,", "And", "Meanwhile,", "In addition"), converts passive future to active present ("starts tomorrow" -> "now live", "opens tomorrow" -> "just opened", "launches tomorrow" -> "finally launches", "will open" -> "opens"), removes boilerplate openers ("See what's on at", "Check out", "Catch", "Don't miss"). Applied during enrichment response parsing before DB save.
- **Subject teaser prompt tightened:** ALL lowercase (only proper nouns capitalized), no leading "the" ("building of the year" not "the building of the year").
- **Email teaser prompt tightened:** Standalone nuggets only (no "Plus,"/"Also,"), active present tense ("now live" not "starts tomorrow"), one venue per sentence (no lists like "X and Y"), no boilerplate.
- Test results: Vasastan "Hagastaden's Forskaren is building of the year. Wasahof's husmanskost menu now live. A vernissage at Galleri Kaktus this Friday." / West Village "Snowball fight targets NYPD in Washington Square Park. A Cornelia Street cafe is named one of the world's best. Subterranean cocktail bar Kees is now open."
- File: `src/lib/brief-enricher-gemini.ts` (prompt + JSON schema + `cleanEmailTeaser()` + parsing).

**Information-Dense Email Teasers + Look Ahead Blurb Fix:**
- **Problem A:** Daily Brief email blurbs showed content-free filler like "Morning, neighbors. It's been a busy couple of weeks for openings." instead of engaging teasers. Root cause: `isGreetingOnly()` in assembler.ts returned `false` for text >60 chars, letting greetings bypass detection entirely.
- **Problem B:** Several Look Ahead stories (West Village, Stockholm, Summit) showed "Daily Brief: {neighborhood}." as their blurb because `generatePreviewText()` in the Look Ahead cron captured label text from Gemini output.
- **Fix 1 - email_teaser field:** Added `email_teaser` to Gemini enrichment JSON response (zero extra API cost - same call). Prompt instructs Gemini to generate 2-3 sentence teasers packed with specific names, places, and facts (max 160 chars). Examples: "Village snowball fight against NYPD. Hello Kees bar and Dahla Thai. Goodbye Da Toscano." Validated: 10-200 chars, must contain period/exclamation, no greeting patterns. Stored in `neighborhood_briefs.email_teaser` (new column). Used as `preview_text` when creating articles in `generate-brief-articles`, `generate-look-ahead`, and assembler fallback.
- **Fix 2 - Label text stripping:** `generatePreviewText()` in Look Ahead cron now strips "Daily Brief:", "Look Ahead:" prefix labels that Gemini sometimes injects at start of prose.
- **Fix 3 - Robust blurb extraction:** Replaced `isGreetingOnly()` (broken 60-char limit) with three helpers: `isGreetingStart()` (checks first sentence only, no length limit), `isLabelText()` (detects label prefixes), `isFillerText()` (detects vague openers like "It's been a busy couple of weeks"). New `extractInformativeSentences()` filters out greetings/labels/filler/date-only sentences from body text and builds 160-char information-dense blurbs.
- **Pipeline:** `enrich-briefs` cron saves `email_teaser` to DB. `generate-brief-articles` and `generate-look-ahead` prefer `email_teaser` as `preview_text`. Assembler fallback path also uses `email_teaser`. `toEmailStory()` detects bad preview text at render time as final safety net.
- Files: `src/lib/brief-enricher-gemini.ts` (prompt + parsing), `src/lib/email/assembler.ts` (helpers + fallback), `src/app/api/cron/enrich-briefs/route.ts` (DB save), `src/app/api/cron/generate-brief-articles/route.ts` (use email_teaser), `src/app/api/cron/generate-look-ahead/route.ts` (label strip + use email_teaser), migration `20260301_add_brief_email_teaser.sql`.

## 2026-02-24

**Dual-Source Fact-Gathering: Grok + Gemini Search:**
- Previously Grok was the sole fact-gatherer (X search + web search), causing repetition (same trending topics daily) and thin coverage (Grok misses institutional sources like gallery calendars, official event listings, local news sites).
- New: Gemini Flash with Google Search grounding runs as a parallel second fact-gatherer alongside Grok via `Promise.allSettled`. Zero latency increase since Gemini (~5-10s) finishes before Grok (~25-30s).
- New file `src/lib/gemini-search.ts`: `searchNeighborhoodFacts()` for daily briefs (targets local newspapers, official calendars, city government, business press, real estate), `searchUpcomingEvents()` for Look Ahead (targets gallery exhibitions, museum schedules, concert listings, community meetings), `mergeContent()` appends Gemini facts with "ALSO NOTED:" label, `mergeStructuredEvents()` deduplicates by name similarity and sorts chronologically.
- Anti-repetition: `searchNeighborhoodFacts()` accepts `recentTopics` param (last 5 brief headlines) injected as "AVOID repeating these recently covered topics" in the Gemini prompt.
- `sync-neighborhood-briefs`: parallel Grok + Gemini call per neighborhood, merged before save. Falls back gracefully if either source fails. Tracks `gemini_supplemented` count in cron_executions.
- `generate-look-ahead`: parallel Grok + Gemini call, merges both prose content and structured events via `mergeStructuredEvents()`.
- `weekly-brief-service`: Horizon section changed from Grok-then-Gemini-fallback to always-dual parallel. Added `deduplicateHorizonEvents()` helper. Max events increased from 3 to 5.
- Retry: 2s/5s/15s exponential backoff on 429/RESOURCE_EXHAUSTED (same pattern as brief-enricher-gemini.ts).
- Cost: ~+$0.70/day (~$21/month) for ~350 additional Gemini Flash calls/day, well within 10K RPD budget.
- Files: `src/lib/gemini-search.ts` (new), `sync-neighborhood-briefs/route.ts`, `generate-look-ahead/route.ts`, `src/lib/weekly-brief-service.ts`.

**Fix Broken Legacy Image URLs in Assembler Fallback:**
- 8 daily brief articles had broken images (HTTP 400) because the email assembler fallback path (`fetchBriefAsStory()`) created articles before `generate-brief-articles` cron ran, and `selectLibraryImage()` sync function returned legacy Supabase Storage URLs on cache miss (those files no longer exist).
- New `selectLibraryImageAsync()` in `image-library.ts` - async function that queries DB directly for Unsplash photos without requiring cache preload. Assembler fallback now uses this instead of `image_url: ''`.
- Removed legacy Supabase Storage URL fallback from `selectLibraryImage()` sync path - now returns `''` on cache miss since all 273 neighborhoods have Unsplash photos. `retry-missing-images` cron fills gaps.
- Backfilled 15 articles (8 today + 7 older) with correct Unsplash URLs via one-off script.
- Files: `src/lib/image-library.ts` (new `selectLibraryImageAsync`, removed legacy fallback), `src/lib/email/assembler.ts` (async image lookup in fallback path).

**Enrichment Prompt: One Story Per Section + Recency-First Ordering:**
- Daily Brief (`dailyBriefStyle`): each distinct story gets its own [[header]] and paragraph, never combine unrelated stories. Lead with most recent and surprising news - yesterday's incident outranks last week's opening.
- Look Ahead (`lookAheadStyle`): each event gets its own paragraph within day sections. Lead each day with most noteworthy event - one-time specials outrank recurring happenings.
- Sunday Edition (`weeklyRecapStyle` + `editorialSynthesis`): one story per section, lead with most consequential and recent. Safety incidents or policy changes outrank restaurant openings.
- File: `src/lib/brief-enricher-gemini.ts`, `src/lib/weekly-brief-service.ts`.

## 2026-02-23

**Improve Unsplash Image Quality with Interleaved Dual-Query Search:**
- Old approach: sequential 4-tier fallback (`"{name} {city}"` -> `"{city} {name}"` -> `"{city}"` -> `"{city} {country}"`), 10 results per query, stopped at 8 photos. Often returned generic city photos instead of iconic neighborhood shots.
- New approach: two parallel searches via `Promise.all` - `"{name} {city}"` (30 results) for city-disambiguation + `"{name}"` alone (30 results) for the most popular/curated shots photographers tag with just the neighborhood name.
- Results interleaved: alternating city-qualified (positions 1,3,5...) with name-only (positions 2,4,6...), deduped by photo ID. The 8 categories get a mix of accurate and visually striking photos.
- Handles ambiguous names (SoHo exists in NYC, London, Hong Kong): city-qualified results take priority in the interleave, so SoHo London photos can't displace SoHo New York photos.
- Fallback to city-only and city+country queries preserved for neighborhoods with very few Unsplash results.
- Cost: 2 API calls per neighborhood (was 1-4 sequential), well within 5000/hr production budget. Actually faster due to `Promise.all` parallelism.
- File: `src/lib/unsplash.ts`. Photos refresh on next `refresh-image-library` cron run (every 4 hours).

**Fix Monitor-and-Fix Auto-Fixer Starvation Bug:**
- 1,544 stale open issues accumulated since Feb 16, and today's 25 new issues (url_encoded_text, missing_hyperlinks, missing_image) were all stuck unresolved.
- Root cause 1: `getRetryableIssues()` fetched only 10 issues (oldest first via `MAX_IMAGES_PER_RUN * 2`). The oldest 10 were all `unenriched_brief` from Feb 16.
- Root cause 2: The `monitor-and-fix` route's if/else chain was missing handlers for `unenriched_brief` and `missing_hyperlinks` - these types fell through to `else { skip }`, even though `attemptFix()` in auto-fixer.ts already had handlers for both.
- Fix 1: `getRetryableIssues()` - increased limit from 10 to 50, added 7-day max age filter (`.gte('created_at', maxAge)`), changed to newest-first ordering so today's issues get priority.
- Fix 2: Simplified the route's nonBriefIssues loop - all fixable types now route through `attemptFix()` with per-type rate limits instead of duplicating type dispatch. Added `unenriched_brief`/`missing_hyperlinks` with `enrichFixCount` counter (max 5/run, 2s delay).
- Fix 3: Added `FIX_CONFIG` constants: `MAX_ENRICHMENTS_PER_RUN` (5), `ENRICHMENT_DELAY_MS` (2000), `MAX_ISSUE_AGE_DAYS` (7).
- Fix 4: SQL migration bulk-closed all open issues older than 5 days as `needs_manual`.
- Files: `monitor-and-fix/route.ts` (simplified dispatch), `issue-detector.ts` (query fix), `types.ts` (new constants), migration `20260229_close_stale_cron_issues.sql`.

## 2026-02-23

**Daily Writing Quality Review Cron:**
- New `review-writing-quality` cron running daily at 11 AM UTC (after all briefs and look-aheads are generated/enriched).
- Samples 3 random neighborhoods with active subscribers for daily briefs (7 most recent enriched briefs per neighborhood from `neighborhood_briefs.enriched_content`).
- Samples 3 different random neighborhoods for look-ahead articles (7 most recent published articles per neighborhood from `articles.body_text` where `article_type = 'look_ahead'`).
- Sends identical editorial analysis prompt to both Gemini Pro 2.5 and Claude Sonnet 4.5 in parallel via `Promise.allSettled()` - one model failing doesn't block the other.
- Analysis benchmarks against FT How To Spend It, Morning Brew, Monocle, Puck, Airmail, Vanity Fair. Four sections: Grok search query recommendations, writing persona/style recommendations, engagement/shareability, biggest single improvement.
- HTML email report sent to `ADMIN_EMAIL` with both analyses side by side, sampled neighborhoods listed in header.
- Full Gemini + Claude analyses stored in `cron_executions.response_data` for historical tracking.
- Cost: ~$0.27/day (~$8.10/month). Recommendations-only - no automatic updates to prompts, personas, or queries.
- File: `src/app/api/cron/review-writing-quality/route.ts`. Added to `vercel.json` crons.

## 2026-02-24

**Eliminate AI-Generated Images from Specialized Cron Articles:**
- 28 specialized crons (overture-alerts, museum-watch, gala-watch, archive-hunter, etc.) were using `getCronImage()` which returned cached AI-generated images from Supabase Storage `cron-cache/`. All 269 neighborhoods now have Unsplash library photos, so AI images are no longer needed.
- Modified `getCronImage()` in `cron-images.ts` to accept optional `neighborhoodId` in options. When provided, does a DB lookup for `image_library_status.unsplash_photos` and returns the `rss-story` category Unsplash photo URL (catch-all for non-brief articles). Falls back to any available Unsplash photo, then to existing AI cached image.
- Updated all 28 cron callsites to pass `neighborhoodId` per-article. Old pattern: `getCronImage('category', supabase)` called once at top, shared across all articles. New pattern: `getCronImage('category', supabase, { neighborhoodId: finalNeighborhoodId })` called per-article inside the insert loop. Each article now gets a neighborhood-specific Unsplash photo.
- Expanded `retry-missing-images` cron to also find articles with `cron-cache/` in their `image_url` and replace with Unsplash library photos. This backfills all existing articles that already have AI-generated images. Phase 1: empty/null images (existing). Phase 2: cron-cache AI images (new). Separate counters: `library_filled` and `ai_replaced`.
- Files: `src/lib/cron-images.ts` (core change + new `getUnsplashForNeighborhood()` helper), 28 cron route files, `retry-missing-images/route.ts` (backfill).

**Shorten Look Ahead Link Text to "next 7 days":**
- Changed from "Read the Look Ahead (today and next 7 days) for {name}" to "Read the Look Ahead (next 7 days) for {name}" across all surfaces.
- Email templates: DailyBriefTemplate.tsx, SundayEditionTemplate.tsx.
- Web: BriefDiscoveryFooter.tsx link text.
- Email assembler: `cleanCategoryLabel` in assembler.ts now uses "Look Ahead (next 7 days)".
- Translations: `feed.lookAhead` and `feed.lookAheadCta` updated in all 9 languages.

**Change Sunday Edition House Ad CTA to "Place it":**
- Shortened from "Place it Now" / localized equivalents to "Place it" across all 9 languages.
- Updated `houseAd.sunday_edition.cta` key in translations.ts (en, sv, fr, de, es, pt, it, zh, ja).
- CTA text lives only in translations.ts (house_ads table has no cta_text column).

**Add Information Gap Teaser to Sunday Edition Email Subject:**
- Sunday Edition now uses the same Morning Brew-style subject as Daily Brief: `{teaser}, {neighborhood}` all lowercase.
- Old format `Sunday Edition: West Village. rent freeze & gala night` wasted ~36 chars on prefix and mechanically concatenated headline fragments.
- New format: `rent freeze showdown, west village` - Gemini generates a 1-4 word cryptic teaser during `editorialSynthesis()` (zero extra API calls, appended as `TEASER:` line to existing prompt).
- Stored in new `weekly_briefs.subject_teaser` TEXT column (DB migration `20260228_add_weekly_brief_subject_teaser.sql`).
- `WeeklyBriefContent` interface extended with `subjectTeaser?: string | null`.
- `editorialSynthesis()` return type changed from `string` to `{ narrative, subjectTeaser }`. Teaser validated: 1-5 words, max 40 chars.
- `buildSundaySubject()` rewritten in both `send-sunday-edition/route.ts` and `sunday-edition-request/route.ts`:
  - Gemini teaser: `{teaser}, {neighborhood}` lowercase
  - Headline fallback: lead headline truncated at word boundary, `{headline}, {neighborhood}` lowercase
  - No content: `your sunday edition, {neighborhood}`
- Existing briefs (no teaser) gracefully fall back to headline-based lowercase format.
- Files: `weekly-brief-service.ts`, `sync-weekly-brief/route.ts`, `send-sunday-edition/route.ts`, `sunday-edition-request/route.ts`, migration.

## 2026-02-23

**Change Daily Brief Subject Line to Lowercase Teaser-First Format:**
- Old format: `Daily Brief: West Village. Toughest table` - the "Daily Brief: {Neighborhood}." prefix consumed ~25 chars of the 70-char budget, truncating teasers.
- New format: `toughest table, west village` - teaser first, comma, neighborhood, all lowercase. No "Daily Brief:" prefix.
- Gemini teaser path: `{teaser}, {neighborhood}` all lowercase, falls back to teaser alone if combo exceeds 70 chars.
- Headline fallback: `{lead headline}, {neighborhood}` all lowercase, word-boundary truncated. Removed "& more" suffix.
- No teaser/no stories fallback: `your morning brief, {neighborhood}`.
- File: `src/lib/email/sender.ts` (`buildSubject()` and `buildTeaser()`).

**Replace Real Ad Images with AI-Generated Placeholder Creatives:**
- Uploaded 8 AI-generated ad creative images (Google nano banana AI, no copyright issues) to Supabase `ad-assets` bucket as placeholder paid ads.
- Brands: Emerald Dunes Links (golf), The Matterhorn Grand (ski hotel), Aethelred Yachts (yacht), Aether Jets (private jet), AURA Z-Fold (electronics), Important Property (real estate), 'St Morgan (restaurant), AURUM (sunglasses).
- 7 daily_brief placement + 1 sunday_edition (AURUM). All global (`is_global: true`), active for 1 year.
- Expired 2 old placeholder ads (Corcoran real estate + BMW i7 using Unsplash stock images).
- All placeholder ads tagged `customer_email: 'placeholder@readflaneur.com'` for easy bulk deactivation.
- Upload script: `scripts/upload-placeholder-ads.mjs`.

## 2026-02-22

**Fix Look Ahead Event Listing Font Jarring:**
- The "At a glance" event listing used `text-xs`/`text-sm` sans-serif while the prose body immediately below used `text-[1.35rem]` Merriweather serif with `leading-loose` - a jarring visual jump from 12-14px compact sans to 22px serif.
- Switched event listing container to serif (`var(--font-body-serif)`), bumped day headers from `text-xs` to `text-sm`, bumped event lines from `text-sm` to `text-[0.95rem]` (~15px) with `leading-relaxed`, keeping "At a glance" label in sans-serif.
- File: `src/components/article/ArticleBody.tsx`.

**Relax Tourist Filter to Stop Suppressing Legitimate Events:**
- SoHo Look Ahead had only 1 event for an entire week. The tourist filter's broad "any other activity primarily marketed to tourists rather than locals" language was causing Grok to self-censor aggressively in tourist-heavy neighborhoods - SoHo, where nearly everything could be considered "touristy".
- Narrowed all 3 filter layers (Grok Daily Brief prompt, Grok Look Ahead prompt, Gemini enrichment styles) to a specific exclusion list only: walking tours, food tours, hop-on-hop-off buses, segway tours, pub crawls, escape rooms, permanent Broadway shows. Removed the vague catch-all.
- Explicitly encouraged including galleries, exhibitions, concerts, comedy, restaurant openings, pop-up markets, community events, museum special exhibitions, etc. Added "cast a WIDE net" instruction.
- The JavaScript `isTouristActivity()` filter in `look-ahead-events.ts` was already narrow (only regex for specific terms) - no change needed there.
- Files: `src/lib/grok.ts`, `src/lib/brief-enricher-gemini.ts`.

**Fix Markdown Links Rendering as Raw Text in Daily Brief Cards:**
- Users saw raw `[Bar Maeda](https://www.google.com/search?...)` text in SoHo Daily Brief instead of a clickable link. The DB content was correct (proper markdown link in `enriched_content`), and `renderWithLinks()` handles markdown-to-anchor conversion.
- Root cause: `extractSectionHeader()` in `NeighborhoodBrief.tsx` is a heuristic that auto-detects section headers by scanning for sequences of capitalized words. It splits text into words on whitespace boundaries, so `[Bar Maeda](url)` becomes two words: `[Bar` (starts uppercase after stripping `[`) and `Maeda](url...)` (starts uppercase). The detector treated "Over in Hudson Square, [Bar" as the "header" and "Maeda](url) opened its doors..." as the "rest", breaking the markdown link in half. `renderWithLinks()` couldn't match the broken fragments.
- Fix: Skip header detection entirely when the paragraph contains markdown links (`/\[[^\]]+\]\(https?:\/\/[^)]+\)/` guard at top of function). Paragraphs with links are content, not section headers.
- This is a **rendering** bug (data is correct, display logic breaks it), so DB-level health checks cannot catch it. The existing health monitor checks hyperlinks exist in DB content (they do) and checks for HTML artifacts (there are none). The fix addresses the root cause in the rendering pipeline.
- File: `src/components/feed/NeighborhoodBrief.tsx`.

**Add Anchor Links from Look Ahead Event Listing to Day Headers:**
- In the expanded Look Ahead card, the "At a glance" event listing day headers (e.g., "Today, Wednesday February 18") are now clickable anchor links that smooth-scroll to the corresponding day section in the prose body below.
- Uses `scrollIntoView({ behavior: 'smooth', block: 'start' })` to avoid URL hash pollution. `stopPropagation` prevents card collapse, `preventDefault` keeps URL clean.
- `daySlug()` helper converts header text to deterministic IDs (e.g., `la-today-wednesday-february-18`). Prose `<h3>` headers get matching `id` attributes.
- File: `src/components/feed/LookAheadCard.tsx`.

**Persist Active Pill Selection Across Browser Back Navigation:**
- When a user clicked a neighborhood pill, read an article, then hit browser back, the feed defaulted to "All Neighborhoods" instead of the pill they had selected. Now `MultiFeed` persists `activeFilter` in `sessionStorage` (`flaneur-active-pill` key). On mount, restores the saved pill if it exists in the current neighborhoods list. Session-scoped (not localStorage) since pill selection is ephemeral navigation state.
- File: `src/components/feed/MultiFeed.tsx`.

**Stop Generating Briefs and Look-Aheads for Combo Component Neighborhoods:**
- Component neighborhoods like Djurgarden (part of Ostermalm combo) were getting their own independent daily briefs and look-ahead articles because they had `is_active=true` in the DB. Only combo neighborhoods should generate content - components are covered by the combo's expanded Grok search.
- SQL migration sets `is_active=false` for all neighborhoods in `combo_neighborhoods.component_id` and archives their incorrectly generated `brief_summary`/`look_ahead` articles.
- Added `combo_neighborhoods` exclusion guard in both `sync-neighborhood-briefs` and `generate-look-ahead` crons - fetches component IDs into a Set and skips them during filtering, preventing future DB drift from re-enabling generation.
- Files: `src/app/api/cron/sync-neighborhood-briefs/route.ts`, `src/app/api/cron/generate-look-ahead/route.ts`, `supabase/migrations/20260227_deactivate_combo_components.sql`.

**Add Tourist Activity Filter to Daily Brief Prompts:**
- Walking tours, food tours, and other tourist activities were appearing in Daily Briefs (e.g., Ostermalm brief mentioning a walking tour). The Look Ahead prompts already had this filter but Daily Brief Grok and Gemini enrichment prompts did not.
- Added tourist trap exclusion rules to both `generateNeighborhoodBrief()` in `grok.ts` and `dailyBriefStyle` in `brief-enricher-gemini.ts`.
- Files: `src/lib/grok.ts`, `src/lib/brief-enricher-gemini.ts`.

**Fix Sunday Edition Data Point Headline Overlap:**
- The "THE MARKET" data point section in Sunday Edition emails had overlapping text on mobile when the headline wrapped to multiple lines (e.g., "$1.995M, up 14.8% from last month"). The `dataPointValue` style had `fontSize: '36px'` with Playfair Display but no explicit `lineHeight`, defaulting to ~1.0.
- Added `lineHeight: '1.2'` to `dataPointValue` style in `SundayEditionTemplate.tsx`.
- File: `src/lib/email/templates/SundayEditionTemplate.tsx`.

**Fix Daily Brief and Look Ahead Card Appearance:**
- Daily Brief closed state preview now skips the AI greeting paragraph (e.g., "Good morning, neighbors." or "God morgon, grannar.") and shows actual news content from the second paragraph instead. `isGreetingParagraph()` function covers all 9 supported languages (en, sv, fr, de, es, pt, it, zh, ja) with regex patterns, max 120 chars.
- Look Ahead closed state: "Read more" moved to its own line below the teaser sentence instead of running inline, preventing messy wrapping.
- Look Ahead expanded state: summary block now appears at the top before the event listing with `bg-canvas/50 rounded-lg px-4 py-3` for subtle visual distinction, using the same `text-lg text-fg-muted leading-relaxed` font size as body text.
- Files: `src/components/feed/NeighborhoodBrief.tsx`, `src/components/feed/LookAheadCard.tsx`.

**Sunday Edition Admin Test Page:**
- New `/admin/sunday-edition` page for one-click generate, preview, and test-send of Sunday Edition emails on any day of the week.
- Neighborhood dropdown (all active neighborhoods), date picker, admin email input, cron secret (persisted to localStorage).
- Status check: queries `weekly_briefs` and `articles` to show whether brief and article exist for selected neighborhood+date.
- Three actions: "Generate Brief + Article" (calls sync-weekly-brief cron), "Preview Email" (renders full email HTML in iframe with subject line), "Send Test to Me" (calls send-sunday-edition with test/force params).
- New preview endpoint: `GET /api/admin/preview-sunday-edition?neighborhood={id}&date={date}` - auth via Bearer CRON_SECRET, fetches brief (falls back to most recent with warning), builds full SundayEditionContent with weather/ad/Look Ahead, returns `{ subject, html, briefWeekDate, articleExists, articleUrl, warning }`.
- Article URL safety fix: both `send-sunday-edition` and `sunday-edition-request` now verify the article exists and is published before constructing the "Read the full edition" URL. Prevents broken 404 links when article hasn't been created yet.
- Files: `src/app/admin/sunday-edition/page.tsx` (new), `src/app/api/admin/preview-sunday-edition/route.ts` (new), `src/app/api/cron/send-sunday-edition/route.ts`, `src/app/api/email/sunday-edition-request/route.ts`.

## 2026-02-27

**Fix Sunday Edition Data Point Voice and Past Holiday Detection:**
- Data Point section: replaced "we/our" possessive voice with neighborhood name references. "Our median listing is holding at $4.2M" becomes "The Tribeca median listing is holding at $4.2M". All 4 data point types updated (real_estate, safety, environment, flaneur_index).
- Holiday section: `detectUpcomingHoliday()` now anchored to publication `weekDate` instead of `new Date()` at generation time. Prevents past holidays (e.g., Mardi Gras Feb 17) from appearing in later editions (e.g., Feb 22) when briefs were generated before the holiday passed.
- `generateWeeklyBrief()` now accepts optional `weekDate` parameter, threaded from cron route.
- Files: `src/lib/weekly-brief-service.ts`, `src/app/api/cron/sync-weekly-brief/route.ts`.

**Fix Sunday Edition Throughput:**
- Only 47/270 neighborhoods had weekly briefs generated by Sunday morning. Concurrency 3 at 280s budget = ~6 per hourly run = 144/day max.
- Increased concurrency from 3 to 5 (~10 per run). Extended schedule from Sunday-only (`0 * * * 0`) to Saturday+Sunday (`0 * * * 6,0`), giving 48h window = ~480 capacity.
- Files: `vercel.json`, `src/app/api/cron/sync-weekly-brief/route.ts`.

**Silence GoTrue AbortError in Sentry:**
- Added `'signal is aborted without reason'` to Sentry `ignoreErrors` in `src/instrumentation-client.ts`. Harmless navigator.locks abort when users navigate away during `getSession()`.

**Morning Brew-Style Information Gap Email Subject Lines:**
- Daily Brief emails now use Gemini-generated 1-4 word cryptic teasers instead of headline excerpts. Format: `Daily Brief: {Neighborhood}. {teaser}` (e.g., "Daily Brief: West Village. Rent freeze showdown").
- Teaser generated during Gemini enrichment (zero extra API calls) via new `subject_teaser` field in the JSON response. Validated: 1-5 words, max 40 chars, must be incomplete/intriguing.
- Stored in `neighborhood_briefs.subject_teaser` column (new DB migration). Email assembler fetches from most recent enriched brief for primary neighborhood.
- `buildSubject()` in sender.ts prefers Gemini teaser, falls back to headline-based teaser (`{lead headline} & more`) when no teaser available or too long for 70-char limit.
- Files: `supabase/migrations/20260226_add_brief_subject_teaser.sql` (new), `src/lib/brief-enricher-gemini.ts`, `src/app/api/cron/enrich-briefs/route.ts`, `src/lib/email/types.ts`, `src/lib/email/assembler.ts`, `src/lib/email/sender.ts`.

**Disable Civic Data Story Generation:**
- Removed 5 crons from vercel.json: `generate-nyc-weekly-digest`, `generate-global-weekly-digest`, `sync-global-permits`, `sync-global-liquor`, `sync-global-crime`.
- Archived all 23 published "Civic Data" articles via DB update. Content was low-quality weekly civic recaps.

**Change Advertise House Ad CTA:**
- Changed from "Let's Place It" to "Place It" in English translations.

**Fix Article Back Link Going to /city/neighborhood Instead of /feed:**
- "← All My Neighborhood Stories" and "More Stories" buttons on article pages were linking to `/{city}/{neighborhood}` (the dedicated single-neighborhood page) instead of `/feed` (the multi-neighborhood feed with pills).
- Changed both `BackToFeedLink` and `MoreStoriesButton` in `TranslatedArticleNav.tsx` to always link to `/feed`. Removed unused `citySlug`/`neighborhoodSlug` props.
- Files: `src/components/article/TranslatedArticleNav.tsx`, `src/app/[city]/[neighborhood]/[slug]/page.tsx`.

**Fix Look Ahead Repeating Same Venue Across Multiple Days:**
- West Village article listed DEJAVU restaurant identically on 6 different days with slightly reworded paragraphs. Useless padding.
- Added NO REPETITION rule to both Grok prompt and Gemini `lookAheadStyle`: never repeat the same venue/restaurant/event across multiple day sections. If a venue is open daily, mention it once on the most relevant day. Skip days with no unique events rather than padding.
- Files: `src/lib/grok.ts`, `src/lib/brief-enricher-gemini.ts`.

**Add Structured Event Listing to Look Ahead Articles:**
- Grok prompt now requests `EVENTS_JSON:` section with structured event data (date, time, name, category, location, address, price) alongside prose `CONTENT:`.
- New `src/lib/look-ahead-events.ts`: `formatEventListing()` groups events by date, deduplicates recurring events with "(also on Sun, Mon)" suffix, strips postcodes and city names from addresses via `cleanAddress()`, sorts chronologically. Output prepended to enriched prose body with `[[Event Listing]]...---` separator.
- `ArticleBody.tsx`: New `EventListingBlock` component renders compact "At a glance" block with grey bullet points, middot-separated segments (name in `text-fg`, details in `text-fg-muted`), date headers as small uppercase tracking-widest text. Separated from prose body by border.
- `LookAheadCard.tsx`: Matching compact event rendering in expanded view. Teaser extraction skips event listing, only uses prose body for preview sentence.
- `isEventLine()` exported from `look-ahead-events.ts` (detects 2+ semicolons) for shared render detection.
- Grok `LookAheadResult` interface extends `NeighborhoodBrief` with `structuredEvents` field. Graceful fallback: if EVENTS_JSON missing/malformed, articles work prose-only.
- Suppressed duplicate CTA buttons on editorial article pages (PostReadEmailCapture and FallbackAd "Add to Collection" hidden when BriefDiscoveryFooter already present for look_ahead/brief_summary articles).
- Files: `src/lib/look-ahead-events.ts` (new), `src/lib/grok.ts`, `src/app/api/cron/generate-look-ahead/route.ts`, `src/components/article/ArticleBody.tsx`, `src/components/feed/LookAheadCard.tsx`, `src/app/[city]/[neighborhood]/[slug]/page.tsx`.

**Expand Tourist Trap Filter:**
- Grok prompt and Gemini enrichment `lookAheadStyle` now explicitly exclude guided walking tours, food tours, food hall tours, hop-on-hop-off buses, segway tours, pub crawls, escape rooms, and any activity primarily marketed to tourists (in addition to existing permanent show exclusions).
- Added `isTouristActivity()` safety-net filter in `look-ahead-events.ts` that catches common tourist patterns via regex on event name/category before formatting.

## 2026-02-26

**Fix Nuisance Watch Date Precision, Spacing, and Images:**
- Date range now ends yesterday (today's 311 data isn't complete) with precise "from and including X, through and including Y" language.
- Bullet list prompt requires blank line after list for proper spacing before closing sentence.
- Switched from `getCronImage` (AI-generated) to `selectLibraryImage` + `preloadUnsplashCache` for real Unsplash neighborhood photos.

**Update Look Ahead and Primary Brief Labels:**
- "Look Ahead (next 7 days)" changed to "Look Ahead (today and next 7 days)" across all 9 languages in translations.ts, email templates (DailyBriefTemplate, SundayEditionTemplate), BriefDiscoveryFooter, assembler cleanCategoryLabel, and welcome email.
- "Above is the Daily Brief for your primary neighborhood" changed to "Above are the Daily Brief and Look Ahead for your primary neighborhood" across all 9 languages.

**Update Sunday Edition House Ad Text:**
- Body: "native in" changed to "living in" across all 9 languages + DB `house_ads` table.
- CTA: "Let's Take a Quick Look" changed to "Place it Now" across all 9 languages.

**Fix Look Ahead Cron: Generate for Combos, Not Components:**
- Combo neighborhoods (Tribeca, Ostermalm, Hamptons) were getting fragmented Look Ahead articles - one per component (FiDi, Tribeca Core, LES) instead of one consolidated article per combo.
- Root cause: cron used `getActiveNeighborhoodIds()` which returns both combo and component IDs, then filtered `.eq('is_combo', false)` so only components were processed.
- Fix: switched to `.eq('is_active', true)` query (same pattern as Daily Brief cron) which naturally includes combos and excludes components. Added `getComboInfo()` component name expansion before Grok search so all component areas are covered in one article.
- Articles now stored under combo ID. API already handles combo expansion for backward compatibility.

**Fix Look Ahead API for Combo Neighborhoods:**
- Ostermalm and Tribeca Look Ahead cards returned null because articles are stored under component IDs (e.g., `stockholm-ostermalm-core`, `nyc-tribeca-core`), not the combo ID.
- API now queries `combo_neighborhoods` table to expand combo IDs to component IDs, matching the pattern used by `fetchLookAheadAsStory()` and `fetchLookAheadUrl()` in assembler.ts.

**Fix Look Ahead Card Teaser and Expanded Formatting:**
- Preview teaser stripped all markdown (bold `**...**`, links `[text](url)`, header `[[...]]` markers) before sentence extraction - was showing raw `[Lincoln Center](https://www.` in the closed card.
- Teaser renders as plain muted grey text (no bold/link parsing), matching the Daily Brief card's style.
- Body text preprocessed with `\n\n` paragraph breaks around `[[Day, Date]]` headers (same as `ArticleBody.tsx`) so "Today, Saturday February 21" starts on its own line as an `<h3>` when expanded.

**Fix Daily Brief Card Date Using Browser Timezone Instead of Neighborhood:**
- Waiheke Island (Auckland, UTC+13) brief showed "FRI FEB 20" when viewed from Stockholm (UTC+1) - should show "SAT FEB 21".
- Added `timezone?: string` prop to `NeighborhoodBrief`, date formatting uses `{ timeZone: timezone }` option.
- Passed from all 4 render sites: `feed/page.tsx` (single + multi), `[city]/[neighborhood]/page.tsx`, `MultiFeed.tsx` (pill-switch brief).

**Fix Look Ahead Same-Day Local Time Generation:**
- Look Ahead articles were appearing a day early because cron used UTC date math (`new Date().setUTCDate(+1)`) - at 5 PM UTC (12 PM NYC), UTC tomorrow = Saturday but NYC today = Friday. Article said "today Feb 21" while being visible on Feb 20.
- Added `getLocalPublishDate(timezone)` helper using `toLocaleDateString('en-CA', { timeZone })` for per-neighborhood local date computation. Each article gets `published_at` set to 7 AM in neighborhood's local timezone (converted to UTC).
- `generateLookAhead()` in `grok.ts` now accepts optional `timezone` and `targetLocalDate` params. Uses local date instead of UTC tomorrow.
- Cron schedule changed from `0 17-22 * * *` (evening UTC, generated for "tomorrow") to `0 0-7 * * *` (morning UTC, generated for "today"). Articles now refer to the same local day they're published.
- Dedup uses per-neighborhood local dates instead of global UTC date.

**Look Ahead Card Formatting:**
- Label changed from "Look Ahead" to "Look Ahead (next 7 days)" in all 9 languages via `feed.lookAhead` translation key.
- Closed card now shows one-sentence teaser (regex `^[^.!?]*[.!?]`) instead of full first paragraph, with "Read more" suffix when more content exists.
- Expanded card day headers (`[[Day, Date]]`) get extra top margin (`mt-6`) for clearer section breaks.

**Newsletter Auto-Subscribe on Login and Signup:**
- Registered users are now automatically inserted into `newsletter_subscribers` table during both login (`/api/auth/signin`) and signup (`/auth/callback` after PKCE code exchange).
- Uses admin client (service role) to bypass RLS. Checks for existing subscription first. Sets `email_verified: true` and `verified_at` immediately.
- Ensures all registered users receive Daily Brief emails without needing a separate newsletter subscribe action.

**Fix sort_order Column References (24h Outage):**
- `user_neighborhood_preferences` table only has `id`, `user_id`, `neighborhood_id`, `created_at` - NO `sort_order` column.
- All 8 files referencing `sort_order` silently failed because Supabase REST API returns error objects (not data) with 200 HTTP status for non-existent columns.
- Removed `sort_order` from: `signin/route.ts`, `auth/callback/route.ts`, `my-preferences/route.ts`, `save-preferences/route.ts`, `sync-to-db/route.ts`, `add/route.ts`, `create/route.ts`.
- This broke ALL neighborhood sync for 24 hours.

**Profile Data Caching for Instant Account Page:**
- Signin API now fetches profile data (timezone, childcare mode, email unsubscribe token) in parallel with prefs/newsletter queries.
- Login page caches profile to `flaneur-profile` localStorage after successful login.
- Account page reads cached profile synchronously on mount - instant rendering instead of grey flash while DB queries resolve.

**Turnstile Sitekey Trim:**
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` env var had trailing `\n` causing Cloudflare widget error.
- Added `.trim()` to sitekey references in both login and signup pages.

**Fix Login Auth - Header SIGN IN Bug + Mobile Login Hang:**
- Three compounding auth issues fixed: (1) Header showed SIGN IN when user IS authenticated (expired JWT cookies caused `getSession()` to return null, but flaneur-auth fallback was only checked on timeout/error, not on null session), (2) Login page redirect loop (flaneur-auth found → redirect to `/` → layout redirects to `/feed` → Header shows SIGN IN → back to `/login`), (3) Mobile login hung ~7-8s (`signInWithPassword` 4s timeout + `setSession` 2s timeout via navigator.locks).
- **Header.tsx:** `initAuth` now checks `flaneur-auth` localStorage FIRST (synchronous, instant "Account" display), then tries `getSession()` in background (3s timeout) to upgrade to full User object. Never clears user if getSession returns null - expired JWT is gracefully degraded. No more 3s SIGN IN flash.
- **Login page:** Removed flaneur-auth redirect shortcut from `checkSession` (was creating the redirect loop). Now only redirects if `getSession()` returns a valid session. If session null (expired cookies), clears stale flaneur-auth and shows login form. `handleSubmit` rewritten to server-only: single `POST /api/auth/signin` (zero `signInWithPassword`, zero `setSession`, zero `navigator.locks` calls). Writes flaneur-auth + GoTrue localStorage, then `window.location.href`. Mobile login: ~1-2s instead of ~7-8s.
- **Signin API:** Added server-side Cloudflare Turnstile token validation via `siteverify` endpoint before GoTrue password check. Gracefully degrades if Cloudflare unreachable. New env var: `TURNSTILE_SECRET_KEY`.

## 2026-02-25

**Fix Global Neighborhood Date Stamping:**
- Briefs for non-US/EU neighborhoods (e.g., Tokyo, Singapore, Sydney) had wrong day-of-week and dates because Gemini enrichment's timezone map only covered 7 countries, defaulting everything else to America/New_York.
- Expanded `countryTimezoneMap` from 7 to 42 countries as fallback, but primary fix is passing IANA timezone from DB directly via `options.timezone`.
- Grok brief generation now receives explicit local date string in search query and system prompt (prevents "today" ambiguity across timezones).
- Gemini enrichment gets DATE CORRECTION instruction: "If the source says Friday but the local date is Saturday, write Saturday."
- 9 files updated: `brief-enricher-gemini.ts`, `grok.ts`, 5 cron routes, `neighborhoods/create/route.ts`, `briefs/enrich-gemini/route.ts`, `auto-fixer.ts`.

**Fix Account Page Auth:**
- Three compounding bugs: (1) no timeout on `getSession()` (could hang indefinitely), (2) `[loading]` useEffect dependency caused double execution, (3) destructive `signOut()` auto-heal destroyed sessions when `getSession()` returned null.
- Added 3s `Promise.race` timeout matching Header pattern, `flaneur-auth` localStorage fallback for userId/email, empty dependency array.

## 2026-02-24

**Full Bidirectional Neighborhood Sync:**
- DB (`user_neighborhood_preferences`) is now the single source of truth for logged-in users. Removals on one device propagate to others.
- `useNeighborhoodPreferences` hook fetches DB prefs on mount and on `visibilitychange` (tab focus), overwrites localStorage + cookie. 30s throttle prevents excessive DB calls.
- 4-point login sync: (1) login page fetches DB prefs after `signInWithPassword`, (2) auth callback sets cookie from DB via admin client, (3) layout inline script does cookie-to-localStorage reverse sync pre-hydration, (4) Header `onAuthStateChange` SIGNED_IN always overwrites localStorage from DB.
- Anonymous users continue to use localStorage as sole source (no DB sync).

**Inline Article Reactions with Source Attribution:**
- Bookmark/heart buttons moved from standalone section below bottom ad to right-aligned on the same row as source attribution text.
- `SourceAttribution` accepts new `actions` ReactNode prop rendered right-aligned via flexbox.
- `ArticleReactions` component stripped of top margin (`mt-6` removed, `shrink-0` added) for inline use.
- Non-AI articles (rare) still show reactions via fallback wrapper in SourceAttribution.
- Password reset email expiry text corrected from "24 hours" to "1 hour" to match actual Supabase `otp_expiry` setting (3600s).

**Explicit Calendar Dates in AI-Generated Content:**
- All AI prompts now require explicit calendar dates alongside relative time references (e.g., "yesterday (February 19)", "this Thursday, February 20").
- Affects 6 prompt locations: Gemini enrichment (FORMATTING RULES), Grok brief generation, Grok news stories, Grok Look Ahead, Claude RSS rewrites, crime blotter Gemini.
- Prevents confusing articles that say "yesterday" or "Thursday" without specifying which date.

**Crime Blotter Source Attribution:**
- `sync-nyc-crime-blotter` cron now collects unique sources from Grok incident data (e.g., "NY Post", "@NYPDnews", "Citizen").
- Sources inserted into `article_sources` table after article creation. Falls back to generic "Local news & police reports" if no sources in incident data.
- `BlotterStory` type extended with `sources: BlotterSource[]`. Article insert now returns ID via `.select('id').single()` for source linking.
- SourceAttribution now shows "Synthesized from reporting by NY Post, @NYPDnews, and Citizen" instead of generic text.

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
