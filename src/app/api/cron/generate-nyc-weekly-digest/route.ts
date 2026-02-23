/**
 * NYC Weekly Digest Generator Cron Job
 *
 * Reads House Story articles published that week from the articles table
 * and fetches crime stats live from the NYC Open Data API, then generates
 * a weekly digest article for each NYC neighborhood using Gemini.
 *
 * Schedule: Weekly on Saturdays at 10 AM UTC (5 AM EST)
 * Vercel Cron: 0 10 * * 6
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateWeeklyDigest, WeekArticle } from '@/lib/nyc-content-generator';
import { NEIGHBORHOOD_ID_TO_CONFIG } from '@/config/nyc-locations';
import { fetchCrimeStatsForNeighborhood } from '@/lib/nyc-crime';
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
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const weekStartStr = weekStart.toISOString().split('T')[0];

    console.log(
      `Generating weekly digests for ${neighborhoodIds.length} neighborhoods (${weekStartStr} to now)`
    );

    for (const configKey of neighborhoodIds) {
      // NEIGHBORHOOD_ID_TO_CONFIG keys lack `nyc-` prefix (e.g. "chelsea")
      // but DB neighborhood IDs are "nyc-chelsea"
      const dbNeighborhoodId = `nyc-${configKey}`;
      const neighborhoodConfigValue = NEIGHBORHOOD_ID_TO_CONFIG[configKey];

      try {
        results.neighborhoods_processed++;

        // Verify neighborhood exists in database
        const { data: neighborhood } = await supabase
          .from('neighborhoods')
          .select('id, name, city')
          .eq('id', dbNeighborhoodId)
          .single();

        if (!neighborhood || neighborhood.city !== 'New York') {
          console.log(`Skipping ${dbNeighborhoodId} - not a NYC neighborhood`);
          results.articles_skipped++;
          continue;
        }

        // Fetch this week's House Stories from the articles table
        const { data: articlesData } = await supabase
          .from('articles')
          .select('headline, body_text, category_label, published_at')
          .eq('neighborhood_id', dbNeighborhoodId)
          .gte('published_at', weekStartStr)
          .eq('status', 'published')
          .eq('author_type', 'ai')
          .not('category_label', 'in', '("Daily Brief","Look Ahead","The Sunday Edition","Weekly Community Recap","Civic Data","News Brief")')
          .order('published_at', { ascending: false })
          .limit(20);

        const weekArticles: WeekArticle[] = (articlesData || []).map(
          (a: { headline: string; body_text: string; category_label: string; published_at: string }) => ({
            headline: a.headline,
            body_text: a.body_text,
            category_label: a.category_label,
            published_at: a.published_at,
          })
        );

        // Fetch crime stats live from NYC Open Data API
        let crimeStats = null;
        try {
          crimeStats = await fetchCrimeStatsForNeighborhood(
            neighborhoodConfigValue,
            'week'
          );
        } catch (crimeErr) {
          console.warn(
            `Failed to fetch crime stats for ${configKey}:`,
            crimeErr instanceof Error ? crimeErr.message : String(crimeErr)
          );
        }

        // Skip if no data
        if (weekArticles.length === 0 && !crimeStats) {
          console.log(`Skipping ${dbNeighborhoodId} - no data this week`);
          results.articles_skipped++;
          continue;
        }

        console.log(
          `Generating digest for ${dbNeighborhoodId}: ${weekArticles.length} articles, ${crimeStats?.total_incidents || 0} incidents`
        );

        // Generate the weekly digest using this week's articles + crime stats
        // Pass configKey (without nyc- prefix) since generateWeeklyDigest
        // looks up NEIGHBORHOOD_ID_TO_CONFIG[neighborhoodId]
        const digest = await generateWeeklyDigest(
          configKey,
          weekArticles,
          crimeStats ?? undefined
        );

        if (!digest) {
          results.errors.push(`${dbNeighborhoodId}: Digest generation returned null`);
          continue;
        }

        // Generate a unique slug
        const dateSlug = weekStart.toISOString().split('T')[0];
        const slug = `nyc-weekly-${dbNeighborhoodId}-${dateSlug}`;

        // Check if article already exists
        const { data: existingArticle } = await supabase
          .from('articles')
          .select('id')
          .eq('slug', slug)
          .single();

        if (existingArticle) {
          console.log(`Article already exists for ${dbNeighborhoodId} this week`);
          results.articles_skipped++;
          continue;
        }

        // Create the article with per-neighborhood Unsplash image
        const { error: insertError } = await supabase.from('articles').insert({
          neighborhood_id: dbNeighborhoodId,
          headline: digest.headline,
          body_text: digest.body,
          preview_text: digest.previewText,
          image_url: await getCronImage('civic-data', supabase, { neighborhoodId: dbNeighborhoodId }),
          slug,
          status: 'published',
          published_at: new Date().toISOString(),
          author_type: 'ai',
          ai_model: 'gemini-2.5-pro',
          ai_prompt: `NYC Weekly Digest: ${weekArticles.length} articles, ${crimeStats?.total_incidents || 0} incidents`,
          category_label: 'Civic Data',
          enriched_at: new Date().toISOString(),
          enrichment_model: 'gemini-2.5-flash',
        });

        if (insertError) {
          results.errors.push(`${dbNeighborhoodId}: ${insertError.message}`);
          continue;
        }

        results.articles_created++;
        console.log(`Created weekly digest article for ${dbNeighborhoodId}`);

        // Rate limiting between AI calls
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        results.errors.push(
          `${dbNeighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
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
