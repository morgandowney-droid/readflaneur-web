import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateLookAhead } from '@/lib/grok';
import { extractArticleSources } from '@/lib/source-links';
import { enrichBriefWithGemini } from '@/lib/brief-enricher-gemini';
import { getComboInfo } from '@/lib/combo-utils';
import { searchCatchmentFor } from '@/lib/search-catchment';
import { unpublishableReason } from '@/lib/model-refusal';
import { getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';
import { selectLibraryImage, getLibraryReadyIds, preloadUnsplashCache } from '@/lib/image-library';
import { formatEventListing } from '@/lib/look-ahead-events';
import { isVenueAbroad } from '@/lib/place-boundary';
import { searchUpcomingEvents, mergeContent, mergeStructuredEvents } from '@/lib/gemini-search';
import { toHeadlineCase } from '@/lib/utils';
import { getActiveNeighborhoodIds } from '@/lib/active-neighborhoods';
import { isPriorityNeighborhood } from '@/lib/generation-cadence';
import { checkBeforeInsert, fallbackTeaser, filterListingEvents, mentionsDroppedStory, rulesForEdition, type Removal } from '@/lib/edition-rules';

/**
 * Generate Look Ahead Articles
 *
 * Single-pass cron: Grok search -> Gemini Flash enrichment -> article creation.
 * Subscribed + Irish (ie-*) neighborhoods generate daily; cold neighborhoods
 * generate once every 4 days (see src/lib/generation-cadence.ts).
 * Runs midnight-7 AM UTC so articles are generated and published on the SAME
 * local day they refer to as "today". Each neighborhood gets its local date
 * computed via IANA timezone, and published_at is set to 7 AM local time.
 *
 * Schedule: 0 0-7,17-23 * * *
 *
 * The 17-23 UTC half exists for Asia-Pacific. 7am local is (7 - offset) UTC on
 * the PREVIOUS day, so Auckland's is 18:00 UTC, Sydney's 20:00 and Brisbane's
 * 21:00, and a window of 0-7 UTC missed every one of them: an Australian Look
 * Ahead was being generated at 10 or 11am local and backdated to a 7am stamp it
 * had never actually met. Found when AAP named two Queensland and Victorian
 * LGAs to watch for five weeks.
 *
 * This costs almost nothing. Dedup runs BEFORE the Grok call, so on the extra
 * invocations a neighbourhood that already has today's edition is skipped
 * without a search. The number of generations per neighbourhood per local day
 * is unchanged; only which invocation does the work moves.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

// Budget leaves ~100s of the 300s maxDuration as headroom so an in-flight batch
// (a Grok look_ahead can take ~120s) always finishes before Vercel kills the
// function. Starting a batch too late billed Grok for live searches whose
// articles were then discarded by the kill (observed May 30). With Look Ahead
// now scoped to priority neighborhoods only (~45), concurrency 6 over the 4
// daily runs still covers the full set.
const TIME_BUDGET_MS = 200_000;
const CONCURRENCY = 6;


function generateSlug(headline: string, neighborhoodId: string, publishDate: string): string {
  const headlineSlug = headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  return `${neighborhoodId}-look-ahead-${publishDate}-${headlineSlug}`;
}

/**
 * Sort neighborhoods so that those whose 7 AM local time comes soonest
 * after "now" are processed first. This ensures APAC/East neighborhoods
 * (whose morning is hours away at 8 PM UTC) get priority over Americas
 * (whose morning is 10+ hours away).
 */
function sortByDeliveryUrgency(
  neighborhoods: Array<{ id: string; name: string; city: string; country: string | null; timezone: string | null; is_combo: boolean; is_active: boolean }>
): typeof neighborhoods {
  const now = Date.now();
  return [...neighborhoods].sort((a, b) => {
    const hoursUntilA = hoursUntil7AM(a.timezone || 'America/New_York', now);
    const hoursUntilB = hoursUntil7AM(b.timezone || 'America/New_York', now);
    return hoursUntilA - hoursUntilB;
  });
}

function hoursUntil7AM(timezone: string, nowMs: number): number {
  try {
    // Get the current local time in the neighborhood's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const localHour = parseInt(formatter.format(new Date(nowMs)), 10);

    // Hours until next 7 AM local
    if (localHour < 7) {
      return 7 - localHour;
    } else {
      return 24 - localHour + 7;
    }
  } catch {
    return 12; // Default middle priority if timezone parsing fails
  }
}

/**
 * Get the neighborhood's local "today" date (YYYY-MM-DD) and the UTC timestamp
 * for 7 AM in that timezone on that date.
 * This ensures articles are dated to the day the reader sees them.
 */
function getLocalPublishDate(timezone: string): { localDate: string; publishAtUtc: string } {
  const tz = timezone || 'America/New_York';
  // Get today's date in the neighborhood's local timezone
  const localDate = new Date().toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD

  // Compute 7 AM local time in UTC by binary-searching the offset.
  // We need to find the UTC instant where formatting it in `tz` gives 7:00 on `localDate`.
  // Approach: start from midnight UTC on the local date, format that instant in tz,
  // and measure how far off we are from 7 AM local on that date.
  const [year, month, day] = localDate.split('-').map(Number);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });

  // Start guess: midnight UTC on the target date
  const guessUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const parts = formatter.formatToParts(guessUtc);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
  const localHour = parseInt(getPart('hour'), 10);
  const localDay = parseInt(getPart('day'), 10);
  const localMonth = parseInt(getPart('month'), 10);

  // How many hours is midnight UTC from midnight local on the target date?
  // If midnight UTC = 13:00 local on the same day, offset is +13 hours
  // If midnight UTC = 19:00 local on the previous day, offset is -5 hours
  let offsetHours: number;
  if (localMonth === month && localDay === day) {
    // Same date: offset = localHour (e.g., midnight UTC = 13:00 local means UTC+13)
    offsetHours = localHour;
  } else if (localDay > day || localMonth > month) {
    // Already next day locally (e.g., midnight UTC Feb 25 = 1 AM local Feb 26 for UTC+13 via DST edge)
    offsetHours = localHour + 24;
  } else {
    // Previous day locally (e.g., midnight UTC Feb 25 = 7 PM local Feb 24 for UTC-5)
    offsetHours = localHour - 24;
  }

  // 7 AM local = (7 - offset) hours UTC on the same calendar date
  const utcHour = 7 - offsetHours;

  // utcHour may be negative (APAC) or > 23 (western Pacific edge), Date.UTC handles rollover
  const publishAt = new Date(Date.UTC(year, month - 1, day, utcHour, 0, 0));
  return {
    localDate,
    publishAtUtc: publishAt.toISOString(),
  };
}

function generatePreviewText(content: string): string {
  // Skip event listing section (everything before ---) if present
  const separatorIdx = content.indexOf('\n---\n');
  let prose = separatorIdx > -1 ? content.substring(separatorIdx + 5) : content;

  // Strip any label text that Gemini might inject at the start
  prose = prose.replace(/^(Daily Brief|Look Ahead|DAILY BRIEF|LOOK AHEAD)[:\s]*[^.!?\n]*[.!?\n]\s*/i, '');

  const cleaned = prose
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  if (cleaned.length <= 200) return cleaned;
  const slice = cleaned.substring(0, 200);
  const lastPeriod = slice.lastIndexOf('.');
  const lastExcl = slice.lastIndexOf('!');
  const lastQuestion = slice.lastIndexOf('?');
  const lastEnd = Math.max(lastPeriod, lastExcl, lastQuestion);
  if (lastEnd > 0) return cleaned.slice(0, lastEnd + 1);
  const lastSpace = slice.lastIndexOf(' ');
  return lastSpace > 0 ? cleaned.slice(0, lastSpace) : slice;
}


/**
 * @swagger
 * /api/cron/generate-look-ahead:
 *   get:
 *     summary: Generate 7-day Look Ahead articles per neighborhood
 *     tags: [Cron]
 *     security:
 *       - cronSecret: []
 *     responses:
 *       200:
 *         description: Look Ahead generation results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 articles_created:
 *                   type: number
 *                 skipped:
 *                   type: number
 *                 errors:
 *                   type: number
 */
export async function GET(request: Request) {
  const functionStart = Date.now();

  // Auth
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GROK_API_KEY && !process.env.XAI_API_KEY) {
    return NextResponse.json({ success: false, error: 'Grok API key not configured' }, { status: 500 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ success: false, error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const testNeighborhoodId = url.searchParams.get('test');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const libraryReadyIds = await getLibraryReadyIds(supabase);
  await preloadUnsplashCache(supabase);
  const startedAt = new Date().toISOString();
  const results = {
    neighborhoods_eligible: 0,
    neighborhoods_skipped: 0,
    articles_created: 0,
    articles_failed: 0,
    errors: [] as string[],
    // Publisher edition rules (edition-rules.ts): what was cut from which edition and why.
    edition_rules_removals: [] as Array<{ neighborhood: string; header: string; rule: string }>,
  };

  try {
    // Subscriber set for the generation-cadence gate (cost control).
    const subscribedIds = await getActiveNeighborhoodIds(supabase);

    // Determine which neighborhoods to process
    // Use is_active=true (same as Daily Brief cron): combos are is_active=true,
    // their components are is_active=false. This naturally generates one Look Ahead
    // per combo covering all components, instead of separate articles per component.
    let neighborhoods: Array<{ id: string; name: string; city: string; country: string | null; timezone: string | null; is_combo: boolean; is_active: boolean }>;

    if (testNeighborhoodId) {
      // Test mode: process a single neighborhood directly
      const { data, error: fetchError } = await supabase
        .from('neighborhoods')
        .select('id, name, city, country, timezone, is_combo, is_active')
        .eq('id', testNeighborhoodId);

      if (fetchError || !data || data.length === 0) {
        return NextResponse.json({ success: false, error: `Neighborhood ${testNeighborhoodId} not found` }, { status: 404 });
      }

      neighborhoods = data;
    } else {
      // Fetch all is_active=true neighborhoods (combos + standalone, excludes components)
      const { data, error: fetchError } = await supabase
        .from('neighborhoods')
        .select('id, name, city, country, timezone, is_combo, is_active')
        .eq('is_active', true)
        .order('name');

      if (fetchError || !data) {
        throw new Error(`Failed to fetch neighborhoods: ${fetchError?.message}`);
      }

      // Exclude component neighborhoods that are part of combos
      // (components should have is_active=false, but guard against DB drift)
      const { data: comboComponents } = await supabase
        .from('combo_neighborhoods')
        .select('component_id');
      const componentIds = new Set((comboComponents || []).map(c => c.component_id));

      // Cost control: Look Ahead is now generated ONLY for priority
      // neighborhoods - those with a subscriber, plus the 33 Irish syndication
      // entities (feeding yous.news). Cold (unsubscribed, non-Irish)
      // neighborhoods no longer get a Look Ahead at all; they keep only a lean
      // Daily Brief. This drops the dominant Grok live-search cost for the
      // ~96% of neighborhoods with no reader.
      neighborhoods = data
        .filter(n => !componentIds.has(n.id))
        .filter(n => isPriorityNeighborhood(n.id, subscribedIds.has(n.id)));
    }

    if (neighborhoods.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active neighborhoods to process',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    results.neighborhoods_eligible = neighborhoods.length;

    // Compute each neighborhood's local "today" date and 7 AM publish time.
    // This ensures articles are dated to the day the reader sees them.
    const neighborhoodDates = new Map<string, { localDate: string; publishAtUtc: string }>();
    const allLocalDates = new Set<string>();
    for (const n of neighborhoods) {
      const dates = getLocalPublishDate(n.timezone || 'America/New_York');
      neighborhoodDates.set(n.id, dates);
      allLocalDates.add(dates.localDate);
    }

    // Dedup: check which neighborhoods already have a Look Ahead article for their local today.
    // We query a broad 48h window and then compare per-neighborhood publish dates.
    // This avoids the UTC calendar date mismatch bug where UTC+13 neighborhoods have
    // publishAtUtc on the PREVIOUS UTC day (e.g., localDate=Feb 28 but publishAtUtc=Feb 27 18:00Z).
    const alreadyProcessed = new Set<string>();
    const allPublishTimes = Array.from(neighborhoodDates.values()).map(d => d.publishAtUtc);
    const minPublish = allPublishTimes.reduce((a, b) => a < b ? a : b);
    const maxPublish = allPublishTimes.reduce((a, b) => a > b ? a : b);
    // Widen by 1h each side to catch edge cases
    const windowStart = new Date(new Date(minPublish).getTime() - 3600_000).toISOString();
    const windowEnd = new Date(new Date(maxPublish).getTime() + 3600_000).toISOString();
    {
      const { data: existingArticles, error: dedupError } = await supabase
        .from('articles')
        .select('neighborhood_id, published_at')
        .eq('article_type', 'look_ahead')
        .gte('published_at', windowStart)
        .lt('published_at', windowEnd);
      // An unchecked failure here empties the skip list, so every neighborhood
      // the earlier run already finished gets a SECOND edition. That is exactly
      // what happened on 12 and 14 Sep: the 00:00 run finished ~15 towns before
      // its time budget, and the 02:00 run duplicated all of them.
      if (dedupError) {
        console.error('[generate-look-ahead] Dedup query FAILED, per-neighborhood guard is now the only protection:', dedupError.message);
        results.errors.push(`dedup query failed: ${dedupError.message}`);
      }
      if (existingArticles) {
        for (const a of existingArticles) {
          // Mark as processed if the article's published_at matches this neighborhood's target
          const nDates = neighborhoodDates.get(a.neighborhood_id);
          if (nDates) {
            // Compare: article's published_at should be within 2h of the target publishAtUtc
            const articleTime = new Date(a.published_at).getTime();
            const targetTime = new Date(nDates.publishAtUtc).getTime();
            if (Math.abs(articleTime - targetTime) < 7200_000) {
              alreadyProcessed.add(a.neighborhood_id);
            }
          }
        }
      }
    }

    const unprocessed = neighborhoods.filter(n => !alreadyProcessed.has(n.id));
    // Sort by delivery urgency: neighborhoods whose 7 AM is soonest get processed first
    const toProcess = sortByDeliveryUrgency(unprocessed);
    results.neighborhoods_skipped = neighborhoods.length - toProcess.length;

    if (toProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: `All ${neighborhoods.length} neighborhoods already have Look Ahead articles for their local today`,
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[generate-look-ahead] Processing ${toProcess.length} neighborhoods (${results.neighborhoods_skipped} already done)`);

    // Process in batches with concurrency
    for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
      if (Date.now() - functionStart > TIME_BUDGET_MS) {
        results.errors.push(`Time budget exhausted after ${results.articles_created} articles`);
        break;
      }

      const batch = toProcess.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (neighborhood) => {
          const { id, name, city, country, timezone } = neighborhood;
          const tz = timezone || 'America/New_York';
          const dates = neighborhoodDates.get(id) || getLocalPublishDate(tz);
          const localDate = dates.localDate; // YYYY-MM-DD in neighborhood's timezone

          // For combo neighborhoods, build search name from component names
          // (same pattern as sync-neighborhood-briefs)
          // Some editions cover more ground than their name implies (an
          // Australian LGA contains its outlying townships). radius does not
          // reach the search; the place-name string is the only lever.
          let searchName = searchCatchmentFor(id, name);
          if (neighborhood.is_combo) {
            const comboInfo = await getComboInfo(supabase, id);
            if (comboInfo && comboInfo.components.length > 0) {
              searchName = comboInfo.components.map(c => c.name).join(', ');
            }
          }

          // Step 1: Grok + Gemini search in parallel for upcoming events
          console.log(`[generate-look-ahead] Searching for ${searchName}, ${city} (local date: ${localDate})...`);
          const [grokResult, geminiResult] = await Promise.allSettled([
            generateLookAhead(searchName, city, country || undefined, tz, localDate, id),
            searchUpcomingEvents(searchName, city, country || undefined, tz, localDate, id),
          ]);

          const grokLookAhead = grokResult.status === 'fulfilled' ? grokResult.value : null;
          const geminiEvents = geminiResult.status === 'fulfilled' ? geminiResult.value : null;

          if (!grokLookAhead && !geminiEvents) {
            console.log(`[generate-look-ahead] No content from either source for ${name}`);
            return null;
          }

          // Merge content and structured events from both sources
          const mergedContent = mergeContent(grokLookAhead?.content || null, geminiEvents?.events || null);
          const mergedStructuredEvents = mergeStructuredEvents(
            grokLookAhead?.structuredEvents || [],
            geminiEvents?.structuredEvents || []
          );

          const lookAheadBrief = grokLookAhead
            ? { ...grokLookAhead, content: mergedContent, structuredEvents: mergedStructuredEvents }
            : { headline: `Look Ahead: ${name}`, content: mergedContent, sources: [], sourceCount: geminiEvents?.sourceCount || 0, model: 'gemini-2.5-flash', searchQuery: '', structuredEvents: mergedStructuredEvents };

          if (!lookAheadBrief.content) {
            console.log(`[generate-look-ahead] Merged content empty for ${name}`);
            return null;
          }

          // Step 2: Gemini Flash enrichment
          // Pass today's local date as the context time so Gemini frames
          // "today"/"tomorrow" correctly from the reader's morning perspective
          console.log(`[generate-look-ahead] Enriching ${name} with Gemini Flash...`);
          const neighborhoodSlug = getNeighborhoodSlugFromId(id);
          // Format the local date as a readable string for Gemini
          const [yr, mo, dy] = localDate.split('-').map(Number);
          const localDateReadable = new Date(yr, mo - 1, dy).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          const enriched = await enrichBriefWithGemini(
            lookAheadBrief.content,
            name,
            neighborhoodSlug,
            city,
            country || 'USA',
            {
              articleType: 'look_ahead',
              modelOverride: 'gemini-2.5-flash',
              timezone: tz,
              date: localDateReadable,
              briefGeneratedAt: dates.publishAtUtc,
              // neighborhoodSlug above is the display slug ("brera"), not the id
              editionId: id,
            }
          );

          const enrichedBody = enriched.rawResponse;
          if (!enrichedBody) {
            console.log(`[generate-look-ahead] No enriched content for ${name}`);
            return null;
          }

          // Prepend structured event listing to enriched prose body.
          // Prefer the enrichment's OWN events (it wrote the prose, so they
          // match it) over the lossier upstream Grok/Gemini-search extraction,
          // and merge in any upstream events the enrichment missed.
          // mergeStructuredEvents dedups by name.
          const mergedListing = mergeStructuredEvents(
            enriched.structuredEvents || [],
            lookAheadBrief.structuredEvents || []
          );

          // Drop anything whose venue is in another country. The prompts ask for
          // this and do not reliably deliver it: a Birmingham edition published
          // ten events in Birmingham, Alabama from a prompt that said to drop
          // them. Checked against the venue and address only, so a local event
          // that merely mentions another country survives.
          let listingEvents = mergedListing.filter((e) => {
            const venue = [e.location, e.address].filter(Boolean).join(', ');
            if (!isVenueAbroad(venue, country)) return true;
            console.warn(`[generate-look-ahead] Dropped foreign venue for ${name}: ${e.name} @ ${venue}`);
            return false;
          });

          // Publisher edition rules. The upstream search events were never
          // checked by the enricher, so a listing entry stays only when a story
          // that survived the rules accounts for it.
          const editionRules = rulesForEdition(id);
          const priorRemovals: Removal[] = [...(enriched.editionRules?.removals || [])];
          if (editionRules) {
            const filtered = filterListingEvents(listingEvents, enriched.categories, editionRules, [name, city]);
            listingEvents = filtered.events;
            priorRemovals.push(...filtered.removals);
          }
          const eventListing = formatEventListing(
            listingEvents,
            localDate,
            city
          );
          const rawBody = eventListing
            ? eventListing + '\n\n' + enrichedBody
            : enrichedBody;
          // A Look Ahead has no intro by design: the prompt says jump straight
          // into the first event, so the body must begin at a [[header]].
          // Anything before it is leakage - a teaser written as prose, or in
          // four Irish cases a fragment of the raw JSON block (found 2026-09-14).
          const firstHeader = rawBody.indexOf('[[');
          let articleBody = firstHeader > 0 ? rawBody.slice(firstHeader).trim() : rawBody;
          if (firstHeader > 0) {
            console.warn(`[generate-look-ahead] Stripped ${firstHeader} chars before the first section for ${name}`);
          }

          // Last deterministic pass for an edition with rules, on the exact body
          // about to be inserted. No-op (null) for every other edition.
          const rulesCheck = checkBeforeInsert({
            neighborhoodId: id,
            body: articleBody,
            categories: enriched.categories,
            placeNames: [name, city],
            priorRemovals,
          });
          let sourceCategories: unknown = enriched?.categories;
          if (rulesCheck) {
            for (const r of rulesCheck.removals) results.edition_rules_removals.push({ neighborhood: id, header: r.header, rule: r.rule });
            if (rulesCheck.blockReason) {
              console.warn(`[generate-look-ahead] ${name}: not published (${rulesCheck.blockReason})`);
              return 'skipped';
            }
            articleBody = rulesCheck.body;
            sourceCategories = rulesCheck.categories;
          }

          // Step 3: Create article
          // Prefer Gemini's punchy subject_teaser over Grok's generic headline.
          // Grok sometimes reports "No Confirmed Events This Week" while the
          // enriched body lists a dozen of them; never publish a headline that
          // contradicts the article (found 2026-09-14, five live articles).
          const EMPTY_HEADLINE = /no confirmed events|no events|nothing (major|much)|quiet (week|day|weekend|friday)|slow (week|day)|not much going on/i;
          let headline = enriched.subjectTeaser
            ? toHeadlineCase(enriched.subjectTeaser)
            : lookAheadBrief.headline;
          // With rules, never headline a story the rules removed. The Grok
          // headline was written before any rule ran.
          if (rulesCheck && (!enriched.subjectTeaser || mentionsDroppedStory(headline, rulesCheck.droppedStories, [name, city]))) {
            const fb = fallbackTeaser(rulesCheck.categories);
            if (fb) headline = toHeadlineCase(fb);
          }
          if (EMPTY_HEADLINE.test(headline)) {
            const firstEvent = listingEvents[0]?.name?.trim();
            if (firstEvent) {
              headline = toHeadlineCase(firstEvent.split(/\s+/).slice(0, 4).join(' '));
              console.warn(`[generate-look-ahead] Replaced an empty-week headline for ${name} with "${headline}"`);
            }
          }
          const articleHeadline = `LOOK AHEAD: ${headline}`;
          const slug = generateSlug(headline, id, localDate);
          // Use email_teaser from Gemini enrichment if available, otherwise auto-generate
          const previewText = (rulesCheck && rulesCheck.droppedStories.length > 0)
            ? generatePreviewText(articleBody)
            : (enriched.emailTeaser || generatePreviewText(articleBody));

          // Last line of defence: re-check immediately before the insert, so a
          // failed or stale bulk dedup cannot produce a second edition for a
          // town that already has one for this publish time.
          const { data: raceCheck } = await supabase
            .from('articles')
            .select('id')
            .eq('neighborhood_id', id)
            .eq('article_type', 'look_ahead')
            .gte('published_at', new Date(new Date(dates.publishAtUtc).getTime() - 7200_000).toISOString())
            .lte('published_at', new Date(new Date(dates.publishAtUtc).getTime() + 7200_000).toISOString())
            .limit(1);
          if (raceCheck && raceCheck.length > 0) {
            console.log(`[generate-look-ahead] ${name} already has a Look Ahead for ${localDate}, skipping insert`);
            return 'skipped';
          }

          // Nothing to say is a reason to publish nothing. A Look Ahead is a
          // list of what is coming, so with no events there is no article, and
          // the two things the pipeline produces instead are both worse than
          // silence.
          //
          // The first is a model refusal published verbatim as the body. A
          // Charters Towers edition went live reading "I am sorry, but I cannot
          // fulfill your request... My instructions explicitly state:" followed
          // by a quote of its own system prompt. Same family as the Pro
          // thinking-leak, except this one hands the prompt to the reader.
          //
          // The second is a degenerate stub: headline "No Confirmed Events",
          // body "no confirmed events." That is the passive framing the ENERGY
          // RULES ban, published as a finished edition under a masthead.
          const reason =
            listingEvents.length === 0
              ? 'no events in the listing'
              : unpublishableReason(articleBody);
          if (reason) {
            console.warn(
              `[generate-look-ahead] ${name}: refusing to publish (${reason}). ` +
              `events=${listingEvents.length} headline="${articleHeadline}"`
            );
            return 'skipped';
          }

          const { data: inserted, error: insertError } = await supabase
            .from('articles')
            .insert({
              neighborhood_id: id,
              headline: articleHeadline,
              body_text: articleBody,
              preview_text: previewText,
              slug,
              status: 'published',
              published_at: dates.publishAtUtc,
              author_type: 'ai',
              ai_model: 'grok-4-1-fast + gemini-2.5-flash',
              article_type: 'look_ahead',
              category_label: `${name} Look Ahead`,
              image_url: selectLibraryImage(id, 'look_ahead', undefined, libraryReadyIds),
              enriched_at: new Date().toISOString(),
              enrichment_model: 'gemini-2.5-flash',
              ...(rulesCheck?.editorNotes ? { editor_notes: rulesCheck.editorNotes } : {}),
            })
            .select('id')
            .single();

          if (insertError) {
            if (insertError.message?.includes('articles_slug_key')) {
              console.log(`[generate-look-ahead] Slug collision for ${name}, skipping`);
              return 'skipped';
            }
            throw new Error(`Insert failed for ${name}: ${insertError.message}`);
          }

          // Step 4: Store sources
          if (inserted?.id) {
            const sources = await extractArticleSources(sourceCategories);
            if (sources.length > 0) {
              await supabase
                .from('article_sources')
                .insert(sources.map(s => ({
                  article_id: inserted.id,
                  source_name: s.source_name,
                  source_type: s.source_type,
                  source_url: s.source_url,
                })))
                .then(null, (err: Error) => {
                  console.error(`Failed to insert sources for ${name}:`, err.message);
                });
            }

            // Image is set via selectLibraryImage() at insert time
          }

          console.log(`[generate-look-ahead] Created Look Ahead article for ${name}`);
          return 'created';
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          if (result.value === 'created') results.articles_created++;
          else if (result.value === 'skipped') results.neighborhoods_skipped++;
          // null = no content found, counts as failed
          else if (result.value === null) results.articles_failed++;
        } else {
          results.articles_failed++;
          results.errors.push(result.reason?.message || String(result.reason));
        }
      }
    }

  } catch (err) {
    results.errors.push(err instanceof Error ? err.message : String(err));
  }

  // Log to cron_executions
  try {
    await supabase
      .from('cron_executions')
      .insert({
        job_name: 'generate-look-ahead',
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        success: results.errors.length === 0,
        articles_created: results.articles_created,
        errors: results.errors.length > 0 ? results.errors : null,
        response_data: results,
      })
      .then(null, (err: Error) => console.error('Failed to log cron execution:', err.message));
  } catch {}

  const duration = ((Date.now() - functionStart) / 1000).toFixed(1);
  console.log(`[generate-look-ahead] Done in ${duration}s: ${results.articles_created} created, ${results.articles_failed} failed, ${results.neighborhoods_skipped} skipped`);

  return NextResponse.json({
    success: results.errors.length === 0,
    ...results,
    duration_seconds: parseFloat(duration),
    timestamp: new Date().toISOString(),
  });
}
