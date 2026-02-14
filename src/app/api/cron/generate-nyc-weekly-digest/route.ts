/**
 * NYC Weekly Digest Generator Cron Job
 *
 * Aggregates the week's NYC Open Data and generates full articles
 * with AI-generated content for each NYC neighborhood.
 *
 * Schedule: Weekly on Saturdays at 10 AM UTC (5 AM EST)
 * Vercel Cron: 0 10 * * 6
 *
 * This runs after the crime stats sync (8 AM) to have all data available.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateWeeklyDigest } from '@/lib/nyc-content-generator';
import { NEIGHBORHOOD_ID_TO_CONFIG } from '@/config/nyc-locations';
import { NYCPermit } from '@/lib/nyc-permits';
import { LiquorLicense } from '@/lib/nyc-liquor';
import { CrimeStats } from '@/lib/nyc-crime';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // Allow up to 5 minutes for all neighborhoods

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
  const url = new URL(request.url);
  const testNeighborhoodId = url.searchParams.get('test');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    neighborhoods_processed: 0,
    articles_created: 0,
    articles_skipped: 0,
    errors: [] as string[],
  };

  try {
    // Determine which neighborhoods to process
    let neighborhoodIds: string[];

    if (testNeighborhoodId) {
      neighborhoodIds = [testNeighborhoodId];
    } else {
      // Get all NYC neighborhood IDs from config
      neighborhoodIds = Object.keys(NEIGHBORHOOD_ID_TO_CONFIG);
    }

    // Calculate date range for the week
    const weekEnd = new Date();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const weekStartStr = weekStart.toISOString().split('T')[0];

    console.log(
      `Generating weekly digests for ${neighborhoodIds.length} neighborhoods (${weekStartStr} to now)`
    );

    // Get cached image for civic data (reused across all digests)
    const cachedImageUrl = await getCronImage('civic-data', supabase);

    for (const neighborhoodId of neighborhoodIds) {
      try {
        results.neighborhoods_processed++;

        // Verify neighborhood exists in database
        const { data: neighborhood } = await supabase
          .from('neighborhoods')
          .select('id, name, city')
          .eq('id', neighborhoodId)
          .single();

        if (!neighborhood || neighborhood.city !== 'New York') {
          console.log(`Skipping ${neighborhoodId} - not a NYC neighborhood`);
          results.articles_skipped++;
          continue;
        }

        // Fetch this week's data for the neighborhood
        const [permitsResult, licensesResult, crimeResult] = await Promise.all([
          supabase
            .from('nyc_permits')
            .select('*')
            .eq('neighborhood_id', neighborhoodId)
            .gte('filing_date', weekStartStr)
            .order('filing_date', { ascending: false }),
          supabase
            .from('nyc_liquor_licenses')
            .select('*')
            .eq('neighborhood_id', neighborhoodId)
            .gte('effective_date', weekStartStr)
            .order('effective_date', { ascending: false }),
          supabase
            .from('nyc_crime_stats')
            .select('*')
            .eq('neighborhood_id', neighborhoodId)
            .gte('period_start', weekStartStr)
            .order('period_start', { ascending: false })
            .limit(1),
        ]);

        const permits = (permitsResult.data || []) as NYCPermit[];
        const licenses = (licensesResult.data || []) as LiquorLicense[];
        const crimeStats = crimeResult.data?.[0] as CrimeStats | undefined;

        // Skip if no data
        if (permits.length === 0 && licenses.length === 0 && !crimeStats) {
          console.log(`Skipping ${neighborhoodId} - no data this week`);
          results.articles_skipped++;
          continue;
        }

        console.log(
          `Generating digest for ${neighborhoodId}: ${permits.length} permits, ${licenses.length} licenses`
        );

        // Generate the weekly digest
        const digest = await generateWeeklyDigest(
          neighborhoodId,
          permits,
          licenses,
          crimeStats
        );

        if (!digest) {
          results.errors.push(`${neighborhoodId}: Digest generation returned null`);
          continue;
        }

        // Generate a unique slug
        const dateSlug = weekStart.toISOString().split('T')[0];
        const slug = `nyc-weekly-${neighborhoodId}-${dateSlug}`;

        // Check if article already exists
        const { data: existingArticle } = await supabase
          .from('articles')
          .select('id')
          .eq('slug', slug)
          .single();

        if (existingArticle) {
          console.log(`Article already exists for ${neighborhoodId} this week`);
          results.articles_skipped++;
          continue;
        }

        // Create the article with cached image
        const { error: insertError } = await supabase.from('articles').insert({
          neighborhood_id: neighborhoodId,
          headline: digest.headline,
          body_text: digest.body,
          preview_text: digest.previewText,
          image_url: cachedImageUrl, // Reuse cached category image
          slug,
          status: 'published',
          published_at: new Date().toISOString(),
          author_type: 'ai',
          ai_model: 'gemini-2.5-pro',
          ai_prompt: `NYC Weekly Digest: ${permits.length} permits, ${licenses.length} licenses, ${crimeStats?.total_incidents || 0} incidents`,
          category_label: 'Civic Data',
          enriched_at: new Date().toISOString(),
          enrichment_model: 'gemini-2.5-flash',
        });

        if (insertError) {
          results.errors.push(`${neighborhoodId}: ${insertError.message}`);
          continue;
        }

        results.articles_created++;
        console.log(`Created weekly digest article for ${neighborhoodId}`);

        // Rate limiting between AI calls
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        results.errors.push(
          `${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(
      `NYC Weekly Digest: ${results.articles_created} created, ${results.articles_skipped} skipped`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      week_start: weekStartStr,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('NYC Weekly Digest generation failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        ...results,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
