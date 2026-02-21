import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateLookAhead } from '@/lib/grok';
import { enrichBriefWithGemini } from '@/lib/brief-enricher-gemini';
import { getActiveNeighborhoodIds } from '@/lib/active-neighborhoods';
import { getComboInfo } from '@/lib/combo-utils';
import { getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';
import { selectLibraryImage, getLibraryReadyIds, preloadUnsplashCache } from '@/lib/image-library';
import { formatEventListing } from '@/lib/look-ahead-events';

/**
 * Generate Look Ahead Articles
 *
 * Single-pass cron: Grok search -> Gemini Flash enrichment -> article creation.
 * Only processes neighborhoods with active subscribers.
 * Runs midnight-7 AM UTC so articles are generated and published on the SAME
 * local day they refer to as "today". Each neighborhood gets its local date
 * computed via IANA timezone, and published_at is set to 7 AM local time.
 *
 * Schedule: 0 0-7 * * * (hourly midnight-7 AM UTC, dedup skips already-processed)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIME_BUDGET_MS = 270_000; // 270s budget (leave 30s for logging)
const CONCURRENCY = 5;

interface ArticleSourceInput {
  source_name: string;
  source_type: 'publication' | 'x_user' | 'platform' | 'other';
  source_url?: string;
}

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

  // Compute 7 AM local time in UTC:
  // Create a date at midnight UTC on the local date, then adjust for timezone offset
  const [year, month, day] = localDate.split('-').map(Number);

  // Use Intl to find the UTC offset for this timezone at 7 AM local
  // Create a reference date at the target local time
  const refDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // noon UTC as starting point
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(refDate);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
  const localHourAtRef = parseInt(getPart('hour'), 10);

  // The offset between UTC noon and the local hour tells us the timezone offset
  const offsetHours = localHourAtRef - 12;
  // 7 AM local = 7 - offset hours in UTC
  const utcHour = 7 - offsetHours;

  const publishAt = new Date(Date.UTC(year, month - 1, day, utcHour, 0, 0));
  return {
    localDate,
    publishAtUtc: publishAt.toISOString(),
  };
}

function generatePreviewText(content: string): string {
  // Skip event listing section (everything before ---) if present
  const separatorIdx = content.indexOf('\n---\n');
  const prose = separatorIdx > -1 ? content.substring(separatorIdx + 5) : content;

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

function extractSources(enrichedData: { categories?: Array<{ stories: Array<{ source?: { name: string; url: string } | null; secondarySource?: { name: string; url: string } }> }> }): ArticleSourceInput[] {
  if (!enrichedData?.categories) {
    return [
      { source_name: 'X (Twitter)', source_type: 'platform' },
      { source_name: 'Google News', source_type: 'platform' },
    ];
  }

  const sources: ArticleSourceInput[] = [];
  const seen = new Set<string>();

  for (const category of enrichedData.categories) {
    for (const story of category.stories || []) {
      if (story.source?.name && !seen.has(story.source.name.toLowerCase())) {
        seen.add(story.source.name.toLowerCase());
        const isX = story.source.name.startsWith('@') || story.source.url?.includes('x.com') || story.source.url?.includes('twitter.com');
        const url = story.source.url;
        const isValidUrl = url && !url.includes('google.com/search') && url.startsWith('http');
        sources.push({
          source_name: story.source.name,
          source_type: isX ? 'x_user' : 'publication',
          source_url: isValidUrl ? url : undefined,
        });
      }
      if (story.secondarySource?.name && !seen.has(story.secondarySource.name.toLowerCase())) {
        seen.add(story.secondarySource.name.toLowerCase());
        sources.push({
          source_name: story.secondarySource.name,
          source_type: 'publication',
          source_url: story.secondarySource.url?.startsWith('http') ? story.secondarySource.url : undefined,
        });
      }
    }
  }

  return sources.length > 0 ? sources : [
    { source_name: 'X (Twitter)', source_type: 'platform' },
    { source_name: 'Google News', source_type: 'platform' },
  ];
}

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
  };

  try {
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
      // Get active subscriber set for filtering
      const activeSubscriberIds = await getActiveNeighborhoodIds(supabase);

      // Fetch is_active=true neighborhoods (combos + standalone, excludes components)
      const { data, error: fetchError } = await supabase
        .from('neighborhoods')
        .select('id, name, city, country, timezone, is_combo, is_active')
        .eq('is_active', true)
        .order('name');

      if (fetchError || !data) {
        throw new Error(`Failed to fetch neighborhoods: ${fetchError?.message}`);
      }

      // Filter to only neighborhoods with active subscribers
      neighborhoods = data.filter(n => activeSubscriberIds.has(n.id));
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

    // Dedup: check which neighborhoods already have a Look Ahead article for their local today
    // Query across all relevant dates (usually just 1-2 distinct dates)
    const dateArray = Array.from(allLocalDates);
    const alreadyProcessed = new Set<string>();
    for (const date of dateArray) {
      const { data: existingArticles } = await supabase
        .from('articles')
        .select('neighborhood_id')
        .eq('article_type', 'look_ahead')
        .gte('published_at', `${date}T00:00:00Z`)
        .lt('published_at', `${date}T23:59:59Z`);
      if (existingArticles) {
        for (const a of existingArticles) {
          // Only mark as processed if the existing article's date matches this neighborhood's local date
          const nDates = neighborhoodDates.get(a.neighborhood_id);
          if (nDates && nDates.localDate === date) {
            alreadyProcessed.add(a.neighborhood_id);
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
          let searchName = name;
          if (neighborhood.is_combo) {
            const comboInfo = await getComboInfo(supabase, id);
            if (comboInfo && comboInfo.components.length > 0) {
              searchName = comboInfo.components.map(c => c.name).join(', ');
            }
          }

          // Step 1: Grok search for upcoming events
          console.log(`[generate-look-ahead] Grok search for ${searchName}, ${city} (local date: ${localDate})...`);
          const lookAheadBrief = await generateLookAhead(searchName, city, country || undefined, tz, localDate);

          if (!lookAheadBrief || !lookAheadBrief.content) {
            console.log(`[generate-look-ahead] No content from Grok for ${name}`);
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
            }
          );

          const enrichedBody = enriched.rawResponse;
          if (!enrichedBody) {
            console.log(`[generate-look-ahead] No enriched content for ${name}`);
            return null;
          }

          // Prepend structured event listing to enriched prose body
          const eventListing = formatEventListing(
            lookAheadBrief.structuredEvents || [],
            localDate,
            city
          );
          const articleBody = eventListing
            ? eventListing + '\n\n' + enrichedBody
            : enrichedBody;

          // Step 3: Create article
          const headline = lookAheadBrief.headline;
          const articleHeadline = `LOOK AHEAD: ${headline}`;
          const slug = generateSlug(headline, id, localDate);
          const previewText = generatePreviewText(articleBody);

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
            const sources = extractSources(enriched);
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
