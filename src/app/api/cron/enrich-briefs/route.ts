import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enrichBriefWithGemini } from '@/lib/brief-enricher-gemini';

/**
 * Auto-enrich Neighborhood Briefs with Gemini
 *
 * Runs 15 minutes after the hour to enrich briefs that were just generated.
 * Uses Gemini with Google Search grounding to verify and add sources.
 *
 * Schedule: 15 * * * * (15 minutes past each hour)
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

  // Check if Gemini is configured
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      success: false,
      error: 'GEMINI_API_KEY not configured',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }

  const url = new URL(request.url);
  const testBriefId = url.searchParams.get('test');
  const batchSize = parseInt(url.searchParams.get('batch') || '5');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    briefs_processed: 0,
    briefs_enriched: 0,
    briefs_failed: 0,
    errors: [] as string[],
  };

  // Find briefs that need enrichment:
  // - Generated in the last 2 hours (recent)
  // - Don't have enriched_content yet
  const twoHoursAgo = new Date();
  twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

  let query = supabase
    .from('neighborhood_briefs')
    .select(`
      id,
      content,
      headline,
      neighborhood_id,
      generated_at,
      neighborhoods (
        name,
        id,
        city,
        country
      )
    `)
    .is('enriched_content', null)
    .gt('generated_at', twoHoursAgo.toISOString())
    .order('generated_at', { ascending: false })
    .limit(batchSize);

  if (testBriefId) {
    query = supabase
      .from('neighborhood_briefs')
      .select(`
        id,
        content,
        headline,
        neighborhood_id,
        generated_at,
        neighborhoods (
          name,
          id,
          city,
          country
        )
      `)
      .eq('id', testBriefId);
  }

  const { data: briefs, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({
      success: false,
      error: fetchError.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }

  if (!briefs || briefs.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No briefs to enrich',
      ...results,
      timestamp: new Date().toISOString(),
    });
  }

  // Process each brief
  for (const brief of briefs) {
    try {
      results.briefs_processed++;

      const hood = brief.neighborhoods as unknown as {
        name: string;
        id: string;
        city: string;
        country: string;
      };

      console.log(`Enriching brief for ${hood.name}...`);

      // Enrich with Gemini
      const result = await enrichBriefWithGemini(
        brief.content,
        hood.name,
        hood.id,
        hood.city,
        hood.country || 'USA',
        {
          briefGeneratedAt: brief.generated_at,
        }
      );

      // Store the enriched data
      const { error: updateError } = await supabase
        .from('neighborhood_briefs')
        .update({
          enriched_content: result.rawResponse || null,
          enriched_categories: result.categories,
          enriched_at: new Date().toISOString(),
          enrichment_model: result.model,
        })
        .eq('id', brief.id);

      if (updateError) {
        results.briefs_failed++;
        results.errors.push(`${hood.name}: ${updateError.message}`);
        continue;
      }

      results.briefs_enriched++;
      console.log(`Successfully enriched brief for ${hood.name}`);

      // Rate limiting - avoid hitting Gemini API limits
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (err) {
      results.briefs_failed++;
      const hood = brief.neighborhoods as unknown as { name: string };
      results.errors.push(`${hood?.name || brief.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    success: results.briefs_failed === 0 || results.briefs_enriched > 0,
    ...results,
    timestamp: new Date().toISOString(),
  });
}
