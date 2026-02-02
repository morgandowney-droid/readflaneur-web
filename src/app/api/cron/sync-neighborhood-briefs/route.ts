import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateNeighborhoodBrief, isGrokConfigured } from '@/lib/grok';

/**
 * Neighborhood Briefs Sync Cron Job
 *
 * Runs every 4 hours to generate "What's Happening Today" briefs for each neighborhood
 * using Grok's X Search for real-time local news.
 *
 * Schedule: 0 0,4,8,12,16,20 * * * (every 4 hours)
 *
 * Cost estimate: ~$0.51 per run for 91 neighborhoods
 * - X Search: 91 calls x $0.005 = $0.455
 * - Tokens: ~$0.05
 */

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

  // Fetch active neighborhoods
  const { data: neighborhoods, error: fetchError } = await supabase
    .from('neighborhoods')
    .select('id, name, city, country')
    .eq('is_active', true)
    .order('name');

  if (fetchError || !neighborhoods) {
    return NextResponse.json({
      success: false,
      error: fetchError?.message || 'Failed to fetch neighborhoods',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
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
        results.errors.push(`${hood.name}: Failed to generate brief`);
        continue;
      }

      // Calculate expiration (6 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 6);

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

  // Clean up expired briefs (keep last 24 hours for history)
  const cleanupTime = new Date();
  cleanupTime.setHours(cleanupTime.getHours() - 24);

  await supabase
    .from('neighborhood_briefs')
    .delete()
    .lt('expires_at', cleanupTime.toISOString());

  return NextResponse.json({
    success: results.briefs_failed === 0 || results.briefs_generated > 0,
    ...results,
    timestamp: new Date().toISOString(),
  });
}
