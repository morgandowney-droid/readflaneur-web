import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateNeighborhoodBrief, isGrokConfigured } from '@/lib/grok';

/**
 * Neighborhood Briefs Sync Cron Job
 *
 * Runs every hour and generates briefs ONLY for neighborhoods where it's
 * currently between 4-8am local time. This ensures briefs feel like fresh
 * morning updates for each neighborhood globally.
 *
 * Schedule: 0 * * * * (every hour)
 * Brief expiration: 24 hours (one per day per neighborhood)
 * Archive: All briefs are kept for history
 *
 * Cost estimate: ~$0.05 per run (avg 5-10 neighborhoods in 4-8am window)
 * Daily cost: ~$1.20 (24 runs x ~$0.05)
 */

/**
 * Check if it's currently between 4-8am in a given timezone
 */
function isMorningWindow(timezone: string): boolean {
  try {
    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const hour = localTime.getHours();
    return hour >= 4 && hour < 8;
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
  const batchSize = parseInt(url.searchParams.get('batch') || '20'); // Process in batches

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
    errors: [] as string[],
  };

  // Get neighborhoods that already have recent briefs (not expired)
  const { data: existingBriefs } = await supabase
    .from('neighborhood_briefs')
    .select('neighborhood_id')
    .gt('expires_at', new Date().toISOString());

  const coveredIds = new Set((existingBriefs || []).map(b => b.neighborhood_id));

  // Fetch active neighborhoods WITH timezone
  let query = supabase
    .from('neighborhoods')
    .select('id, name, city, country, timezone')
    .eq('is_active', true)
    .order('name');

  // If testing, filter to single neighborhood
  if (testNeighborhoodId) {
    query = query.eq('id', testNeighborhoodId);
  }

  const { data: allNeighborhoods, error: fetchError } = await query;

  // Filter neighborhoods:
  // 1. Don't already have a valid brief
  // 2. It's currently 4-8am local time (unless force=true or testing)
  const neighborhoods = (allNeighborhoods || []).filter(n => {
    // Always process if testing specific neighborhood
    if (testNeighborhoodId) return true;

    // Skip if already has a brief
    if (coveredIds.has(n.id)) return false;

    // Check morning window (unless forced)
    if (!forceRun && n.timezone) {
      const inMorningWindow = isMorningWindow(n.timezone);
      if (!inMorningWindow) {
        // Log skipped neighborhoods at debug level
        console.log(`Skipping ${n.name} - local time is ${getLocalHour(n.timezone)}:00 (not in 4-8am window)`);
        return false;
      }
      console.log(`Processing ${n.name} - local time is ${getLocalHour(n.timezone)}:00 (in morning window)`);
    }

    return true;
  }).slice(0, batchSize);

  if (fetchError || !allNeighborhoods) {
    return NextResponse.json({
      success: false,
      error: fetchError?.message || 'Failed to fetch neighborhoods',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }

  if (!neighborhoods || neighborhoods.length === 0) {
    // Count how many were skipped due to time window
    const skippedCount = (allNeighborhoods || []).filter(n =>
      !coveredIds.has(n.id) && n.timezone && !isMorningWindow(n.timezone)
    ).length;

    return NextResponse.json({
      success: true,
      message: skippedCount > 0
        ? `No neighborhoods in 4-8am window right now (${skippedCount} skipped, waiting for their morning)`
        : 'All neighborhoods already have briefs',
      neighborhoods_processed: 0,
      briefs_generated: 0,
      briefs_failed: 0,
      neighborhoods_skipped_time_window: skippedCount,
      errors: [],
      timestamp: new Date().toISOString(),
    });
  }

  // Process each neighborhood
  for (const hood of neighborhoods) {
    try {
      results.neighborhoods_processed++;

      // Generate brief using Grok
      const brief = await generateNeighborhoodBrief(
        hood.name,
        hood.city,
        hood.country
      );

      if (!brief) {
        results.briefs_failed++;
        results.errors.push(`${hood.name}: Brief returned null`);
        continue;
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
        continue;
      }

      results.briefs_generated++;

      // Rate limiting - avoid hitting API limits
      // Grok has generous limits but let's be respectful
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (err) {
      results.briefs_failed++;
      results.errors.push(`${hood.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Archive: Keep all briefs for history (no deletion)
  // Old briefs can be queried for historical "What's Happening" data

  return NextResponse.json({
    success: results.briefs_failed === 0 || results.briefs_generated > 0,
    ...results,
    timestamp: new Date().toISOString(),
  });
}
