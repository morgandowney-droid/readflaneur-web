import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateNeighborhoodBrief, isGrokConfigured } from '@/lib/grok';
import { getComboInfo } from '@/lib/combo-utils';
import { generateBriefContextSnippet } from '@/lib/nyc-content-generator';
import { NYCPermit } from '@/lib/nyc-permits';
import { LiquorLicense } from '@/lib/nyc-liquor';
import { searchNeighborhoodFacts, mergeContent } from '@/lib/gemini-search';

/**
 * Neighborhood Briefs Sync Cron Job
 *
 * Runs every 15 minutes and generates briefs ONLY for neighborhoods where it's
 * currently midnight-7am local time. Starting at midnight gives the full pipeline
 * (generation → enrichment → article creation) up to 7 hours to complete before
 * the 7 AM email send.
 *
 * Schedule: *\/15 * * * * (every 15 minutes)
 * Concurrency: 3 parallel Grok calls (~3x throughput vs sequential)
 * Brief expiration: 24 hours (one per day per neighborhood)
 * Archive: All briefs are kept for history
 *
 * Daily generation: Each neighborhood gets ONE brief per day during its
 * morning window, regardless of previous day's brief status.
 * The "already covered" check uses each neighborhood's local timezone
 * to determine what "today" means (not UTC midnight).
 *
 * The 7-hour window (midnight-7 AM) combined with 15-minute frequency gives
 * 28 chances per timezone to generate a brief, surviving Vercel cron
 * gaps up to ~6 hours.
 */

const CONCURRENCY = 3;

/**
 * Check if it's currently between midnight-7am in a given timezone.
 * 7-hour window (28 chances at every-15-min) survives Vercel cron gaps up to ~6 hours.
 * Starts at midnight to give the full pipeline (generation → enrichment → article)
 * up to 7 hours before the 7 AM email send.
 */
function isMorningWindow(timezone: string): boolean {
  try {
    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const hour = localTime.getHours();
    return hour >= 0 && hour < 7;
  } catch (e) {
    console.error(`Invalid timezone: ${timezone}`, e);
    return false;
  }
}

/**
 * Get the current local hour for a timezone (for logging)
 */
function getLocalHour(timezone: string): number {
  try {
    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    return localTime.getHours();
  } catch {
    return -1;
  }
}

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  // Verify cron authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Support ?test=neighborhood-id for testing single neighborhood
  // Support ?force=true to ignore morning window check
  const url = new URL(request.url);
  const testNeighborhoodId = url.searchParams.get('test');
  const forceRun = url.searchParams.get('force') === 'true';

  // Check if Grok is configured
  if (!isGrokConfigured()) {
    return NextResponse.json({
      success: false,
      error: 'Grok API not configured. Set GROK_API_KEY or XAI_API_KEY environment variable.',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    neighborhoods_processed: 0,
    briefs_generated: 0,
    briefs_failed: 0,
    gemini_supplemented: 0,
    errors: [] as string[],
  };

  // Get recent briefs (last 7 days) for per-neighborhood local date coverage check
  // AND for anti-repetition topic history. 7-day window catches persistent topics
  // that keep appearing across multiple briefs (e.g., a restaurant closure for 2 weeks).
  // MUST paginate - Supabase has a server-side max-rows=1000 that overrides .limit().
  // With 270 neighborhoods * 7 days = 1890+ rows, a single query silently drops rows
  // beyond 1000, causing hasBriefForLocalToday to miss today's briefs and generate
  // duplicates (hit this bug 3 times: Feb 23-28 2026 generated 1218 briefs/day).
  const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentBriefs: { neighborhood_id: string; created_at: string; headline: string | null }[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: page, error: pageError } = await supabase
      .from('neighborhood_briefs')
      .select('neighborhood_id, created_at, headline')
      .gte('created_at', recentCutoff.toISOString())
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (pageError) {
      console.error('Failed to fetch recent briefs page:', pageError.message);
      break;
    }
    if (!page || page.length === 0) break;
    recentBriefs.push(...page);
    if (page.length < PAGE_SIZE) break; // Last page
    offset += PAGE_SIZE;
  }

  // Build map of neighborhood_id -> brief timestamps for local-date checking
  const briefsByNeighborhood = new Map<string, string[]>();
  for (const b of recentBriefs || []) {
    const existing = briefsByNeighborhood.get(b.neighborhood_id) || [];
    existing.push(b.created_at);
    briefsByNeighborhood.set(b.neighborhood_id, existing);
  }

  /**
   * Check if a neighborhood already has a brief for its local "today".
   * Uses the neighborhood's timezone to determine what "today" means,
   * fixing the UTC date boundary bug that caused APAC neighborhoods
   * (UTC+8 to +12) to be missed when their morning window straddles midnight UTC.
   */
  function hasBriefForLocalToday(neighborhoodId: string, timezone: string | null): boolean {
    const timestamps = briefsByNeighborhood.get(neighborhoodId);
    if (!timestamps || timestamps.length === 0) return false;

    const tz = timezone || 'UTC';
    const now = new Date();
    // 'en-CA' locale gives YYYY-MM-DD format
    const localToday = now.toLocaleDateString('en-CA', { timeZone: tz });

    return timestamps.some(ts => {
      const briefLocalDate = new Date(ts).toLocaleDateString('en-CA', { timeZone: tz });
      return briefLocalDate === localToday;
    });
  }

  // For backward compat in the "no neighborhoods" response, count covered
  const coveredCount = (recentBriefs || []).length;

  // Fetch active neighborhoods WITH timezone (includes combo neighborhoods)
  let query = supabase
    .from('neighborhoods')
    .select('id, name, city, country, timezone, is_combo')
    .eq('is_active', true)
    .order('name');

  // If testing, filter to single neighborhood
  if (testNeighborhoodId) {
    query = query.eq('id', testNeighborhoodId);
  }

  const { data: allNeighborhoods, error: fetchError } = await query;

  // Exclude component neighborhoods that are part of combos
  // (components should have is_active=false, but guard against DB drift)
  const { data: comboComponents } = await supabase
    .from('combo_neighborhoods')
    .select('component_id');
  const componentIds = new Set((comboComponents || []).map(c => c.component_id));

  // Filter neighborhoods:
  // 1. Not a component of a combo (combos generate content for their components)
  // 2. Don't already have a brief for their local "today"
  // 3. It's currently midnight-7am local time (unless force=true or testing)
  const neighborhoods = (allNeighborhoods || []).filter(n => {
    // Skip component neighborhoods (combo generates their content)
    if (!testNeighborhoodId && componentIds.has(n.id)) return false;
    // Always process if testing specific neighborhood
    if (testNeighborhoodId) return true;

    // Skip if already has a brief for this neighborhood's local "today"
    if (hasBriefForLocalToday(n.id, n.timezone)) {
      return false;
    }

    // Check morning window (unless forced)
    if (!forceRun && n.timezone) {
      const inMorningWindow = isMorningWindow(n.timezone);
      if (!inMorningWindow) {
        return false;
      }
    }

    return true;
  });

  if (fetchError || !allNeighborhoods) {
    return NextResponse.json({
      success: false,
      error: fetchError?.message || 'Failed to fetch neighborhoods',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }

  if (!neighborhoods || neighborhoods.length === 0) {
    // Count how many were skipped due to time window vs already having today's brief
    const skippedTimeWindow = (allNeighborhoods || []).filter(n =>
      !hasBriefForLocalToday(n.id, n.timezone) && n.timezone && !isMorningWindow(n.timezone)
    ).length;
    const alreadyHaveBrief = (allNeighborhoods || []).filter(n =>
      hasBriefForLocalToday(n.id, n.timezone)
    ).length;

    return NextResponse.json({
      success: true,
      message: skippedTimeWindow > 0
        ? `No neighborhoods in morning window right now (${skippedTimeWindow} waiting for morning, ${alreadyHaveBrief} already have today's brief)`
        : `All neighborhoods already have today's brief (${alreadyHaveBrief} total)`,
      neighborhoods_processed: 0,
      briefs_generated: 0,
      briefs_failed: 0,
      neighborhoods_skipped_time_window: skippedTimeWindow,
      neighborhoods_already_have_brief: alreadyHaveBrief,
      errors: [],
      timestamp: new Date().toISOString(),
    });
  }

  // Time budget: stop processing 30s before maxDuration to ensure logging completes
  const startTime = Date.now();
  const TIME_BUDGET_MS = 270_000; // 270s of 300s maxDuration
  const hasTimeBudget = () => Date.now() - startTime < TIME_BUDGET_MS;

  /** Generate a brief for one neighborhood */
  async function processNeighborhood(hood: typeof neighborhoods[0]) {
    try {
      results.neighborhoods_processed++;

      // For combo neighborhoods, build search location from component names
      let searchName = hood.name;
      if (hood.is_combo) {
        const comboInfo = await getComboInfo(supabase, hood.id);
        if (comboInfo && comboInfo.components.length > 0) {
          searchName = comboInfo.components.map(c => c.name).join(', ');
        }
      }

      // Fetch NYC Open Data context for NYC neighborhoods
      let nycDataContext: string | undefined;
      if (hood.city === 'New York') {
        try {
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);

          const [permitsResult, licensesResult] = await Promise.all([
            supabase
              .from('nyc_permits')
              .select('*')
              .eq('neighborhood_id', hood.id)
              .gte('filing_date', weekAgo.toISOString().split('T')[0])
              .order('filing_date', { ascending: false })
              .limit(10),
            supabase
              .from('nyc_liquor_licenses')
              .select('*')
              .eq('neighborhood_id', hood.id)
              .gte('effective_date', weekAgo.toISOString().split('T')[0])
              .order('effective_date', { ascending: false })
              .limit(10),
          ]);

          const permits = (permitsResult.data || []) as NYCPermit[];
          const licenses = (licensesResult.data || []) as LiquorLicense[];

          if (permits.length > 0 || licenses.length > 0) {
            nycDataContext = await generateBriefContextSnippet(hood.id, permits, licenses) || undefined;
          }
        } catch (nycError) {
          console.warn(`Failed to fetch NYC data for ${hood.name}:`, nycError);
        }
      }

      // Extract recent headlines for anti-repetition in both Grok and Gemini search
      const recentTopics = (recentBriefs || [])
        .filter(b => b.neighborhood_id === hood.id && b.headline)
        .slice(0, 10)
        .map(b => b.headline as string);

      // Run Grok + Gemini in parallel (Gemini ~5-10s finishes before Grok ~25-30s)
      const [grokResult, geminiResult] = await Promise.allSettled([
        generateNeighborhoodBrief(searchName, hood.city, hood.country, nycDataContext, hood.timezone, recentTopics),
        searchNeighborhoodFacts(searchName, hood.city, hood.country, hood.timezone, recentTopics),
      ]);

      const grokBrief = grokResult.status === 'fulfilled' ? grokResult.value : null;
      const geminiFacts = geminiResult.status === 'fulfilled' ? geminiResult.value : null;

      if (!grokBrief && !geminiFacts) {
        results.briefs_failed++;
        results.errors.push(`${hood.name}: Both Grok and Gemini returned null`);
        return;
      }

      // Merge content from both sources
      const mergedContent = mergeContent(grokBrief?.content || null, geminiFacts?.facts || null);
      const brief = grokBrief
        ? { ...grokBrief, content: mergedContent }
        : { headline: `What's Happening in ${hood.name}`, content: mergedContent, sources: [], sourceCount: geminiFacts?.sourceCount || 0, model: 'gemini-2.5-flash', searchQuery: '' };

      if (!brief.content) {
        results.briefs_failed++;
        results.errors.push(`${hood.name}: Merged content is empty`);
        return;
      }

      // Calculate expiration (24 hours from now - one brief per day)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Insert the brief
      const { error: insertError } = await supabase
        .from('neighborhood_briefs')
        .insert({
          neighborhood_id: hood.id,
          headline: brief.headline,
          content: brief.content,
          sources: brief.sources,
          source_count: brief.sourceCount,
          model: brief.model,
          search_query: brief.searchQuery,
          generated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        results.briefs_failed++;
        results.errors.push(`${hood.name}: ${insertError.message}`);
        return;
      }

      results.briefs_generated++;
      if (geminiFacts) results.gemini_supplemented++;

    } catch (err) {
      results.briefs_failed++;
      results.errors.push(`${hood.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Process neighborhoods in batches of CONCURRENCY (parallel Grok calls)
  for (let i = 0; i < neighborhoods.length; i += CONCURRENCY) {
    if (!hasTimeBudget()) {
      console.log(`Time budget exhausted after ${results.neighborhoods_processed} neighborhoods (${Date.now() - startTime}ms)`);
      break;
    }

    const batch = neighborhoods.slice(i, i + CONCURRENCY);
    console.log(`Processing batch ${Math.floor(i / CONCURRENCY) + 1}: ${batch.map(h => h.name).join(', ')}`);
    await Promise.allSettled(batch.map(hood => processNeighborhood(hood)));
  }

  // Log execution for monitoring
  const completedAt = new Date();
  await supabase.from('cron_executions').insert({
    job_name: 'sync-neighborhood-briefs',
    started_at: new Date(startTime).toISOString(),
    completed_at: completedAt.toISOString(),
    success: results.briefs_failed === 0 || results.briefs_generated > 0,
    articles_created: results.briefs_generated,
    errors: results.errors.slice(0, 10),
    response_data: {
      neighborhoods_processed: results.neighborhoods_processed,
      briefs_generated: results.briefs_generated,
      briefs_failed: results.briefs_failed,
      gemini_supplemented: results.gemini_supplemented,
      neighborhoods_eligible: neighborhoods.length,
    },
    triggered_by: testNeighborhoodId ? 'manual' : 'vercel_cron',
  }).then(null, (e: Error) => console.error('Failed to log cron execution:', e));

  return NextResponse.json({
    success: results.briefs_failed === 0 || results.briefs_generated > 0,
    ...results,
    neighborhoods_eligible: neighborhoods.length,
    timestamp: new Date().toISOString(),
  });
}
