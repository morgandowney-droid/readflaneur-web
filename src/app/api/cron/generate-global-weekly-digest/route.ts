/**
 * Global Weekly Digest Generator Cron Job
 *
 * Aggregates the week's international civic data and generates full articles
 * with AI-generated content for each international neighborhood.
 *
 * Uses the City Adapter pattern and Gemini for culturally-appropriate content.
 *
 * Schedule: Weekly on Saturdays at 11 AM UTC
 * Vercel Cron: 0 11 * * 6
 *
 * This runs after the crime stats sync (9 AM) to have all data available.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  generateGlobalWeeklyDigest,
  GlobalWeeklyDigest,
} from '@/lib/global-content-generator';
import {
  GLOBAL_CITY_CONFIG,
  getZoneByNeighborhoodId,
} from '@/config/global-locations';
import { StoryData, SafetyStats } from '@/lib/adapters/types';
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

  // Support ?city=London or ?neighborhood=mayfair for testing
  const url = new URL(request.url);
  const testCity = url.searchParams.get('city');
  const testNeighborhood = url.searchParams.get('neighborhood');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    neighborhoods_processed: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_city: {} as Record<string, { processed: number; created: number }>,
    errors: [] as string[],
  };

  try {
    // Calculate date range for the week
    const weekEnd = new Date();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // Determine which cities/neighborhoods to process
    let citiesToProcess: string[];

    if (testNeighborhood) {
      const zoneInfo = getZoneByNeighborhoodId(testNeighborhood);
      if (zoneInfo) {
        citiesToProcess = [zoneInfo.city];
      } else {
        return NextResponse.json(
          { error: `Unknown neighborhood: ${testNeighborhood}` },
          { status: 400 }
        );
      }
    } else if (testCity) {
      citiesToProcess = [testCity];
    } else {
      citiesToProcess = Object.keys(GLOBAL_CITY_CONFIG);
    }

    console.log(
      `Generating global weekly digests for ${citiesToProcess.length} cities (${weekStartStr} to now)`
    );

    // Get cached image for civic data (reused across all digests)
    const cachedImageUrl = await getCronImage('civic-data', supabase);

    for (const city of citiesToProcess) {
      const config = GLOBAL_CITY_CONFIG[city];
      if (!config) {
        results.errors.push(`No config for city: ${city}`);
        continue;
      }

      results.by_city[city] = { processed: 0, created: 0 };

      // Determine which neighborhoods to process for this city
      let neighborhoods = config.zones;
      if (testNeighborhood) {
        neighborhoods = neighborhoods.filter(
          (z) => z.neighborhoodId === testNeighborhood
        );
      }

      for (const zone of neighborhoods) {
        const neighborhoodId = zone.neighborhoodId;

        try {
          results.neighborhoods_processed++;
          results.by_city[city].processed++;

          // Fetch this week's data for the neighborhood
          const [permitsResult, licensesResult, safetyResult] =
            await Promise.all([
              supabase
                .from('global_permits')
                .select('*')
                .eq('city', city)
                .eq('neighborhood_id', neighborhoodId)
                .gte('filing_date', weekStartStr)
                .order('filing_date', { ascending: false }),
              supabase
                .from('global_licenses')
                .select('*')
                .eq('city', city)
                .eq('neighborhood_id', neighborhoodId)
                .gte('effective_date', weekStartStr)
                .order('effective_date', { ascending: false }),
              supabase
                .from('global_safety_stats')
                .select('*')
                .eq('city', city)
                .eq('neighborhood_id', neighborhoodId)
                .gte('period_start', weekStartStr)
                .order('period_start', { ascending: false })
                .limit(1),
            ]);

          // Convert database records to StoryData format
          const permits: StoryData[] = (permitsResult.data || []).map(
            (p: Record<string, unknown>) => ({
              sourceId: String(p.source_id || ''),
              dataType: 'permit' as const,
              address: String(p.address || ''),
              zone: zone.name,
              neighborhoodId,
              date: String(p.filing_date || ''),
              title: String(p.description || '').substring(0, 100),
              description: String(p.description || ''),
              value: p.estimated_value as number | undefined,
              currency: String(p.currency || config.currency),
              category: String(p.permit_type || ''),
              rawData: (p.raw_data as Record<string, unknown>) || {},
            })
          );

          const licenses: StoryData[] = (licensesResult.data || []).map(
            (l: Record<string, unknown>) => ({
              sourceId: String(l.source_id || ''),
              dataType: 'liquor' as const,
              address: String(l.address || ''),
              zone: zone.name,
              neighborhoodId,
              date: String(l.effective_date || ''),
              title: String(l.premises_name || ''),
              description: '',
              category: String(l.license_type || ''),
              rawData: (l.raw_data as Record<string, unknown>) || {},
            })
          );

          const safetyRow = safetyResult.data?.[0] as
            | Record<string, unknown>
            | undefined;
          const safetyStats: SafetyStats | undefined = safetyRow
            ? {
                zone: zone.name,
                neighborhoodId,
                periodStart: String(safetyRow.period_start || ''),
                periodEnd: String(safetyRow.period_end || ''),
                totalIncidents: (safetyRow.total_incidents as number) || 0,
                byCategory:
                  (safetyRow.stats_by_category as Record<string, number>) || {},
                trend: safetyRow.trend as 'up' | 'down' | 'stable' | undefined,
                trendPercentage: safetyRow.trend_percentage as
                  | number
                  | undefined,
              }
            : undefined;

          // Skip if no data
          if (permits.length === 0 && licenses.length === 0 && !safetyStats) {
            console.log(`Skipping ${city}/${neighborhoodId} - no data this week`);
            results.articles_skipped++;
            continue;
          }

          console.log(
            `Generating digest for ${city}/${neighborhoodId}: ${permits.length} permits, ${licenses.length} licenses`
          );

          // Generate the weekly digest
          const digest: GlobalWeeklyDigest | null =
            await generateGlobalWeeklyDigest(
              neighborhoodId,
              permits,
              licenses,
              safetyStats
            );

          if (!digest) {
            results.errors.push(
              `${city}/${neighborhoodId}: Digest generation returned null`
            );
            continue;
          }

          // Generate a unique slug
          const dateSlug = weekStart.toISOString().split('T')[0];
          const slug = `global-weekly-${neighborhoodId}-${dateSlug}`;

          // Check if article already exists
          const { data: existingArticle } = await supabase
            .from('articles')
            .select('id')
            .eq('slug', slug)
            .single();

          if (existingArticle) {
            console.log(
              `Article already exists for ${city}/${neighborhoodId} this week`
            );
            results.articles_skipped++;
            continue;
          }

          // Ensure neighborhood exists in database
          const { data: neighborhood } = await supabase
            .from('neighborhoods')
            .select('id')
            .eq('id', neighborhoodId)
            .single();

          if (!neighborhood) {
            console.log(
              `Neighborhood ${neighborhoodId} not found in database, skipping article`
            );
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
            ai_prompt: `Global Weekly Digest for ${zone.name}, ${city}: ${permits.length} permits, ${licenses.length} licenses, ${safetyStats?.totalIncidents || 0} incidents`,
            category_label: 'Civic Data',
          });

          if (insertError) {
            results.errors.push(
              `${city}/${neighborhoodId}: ${insertError.message}`
            );
            continue;
          }

          results.articles_created++;
          results.by_city[city].created++;
          console.log(
            `Created weekly digest article for ${city}/${neighborhoodId}`
          );

          // Rate limiting between AI calls
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (err) {
          results.errors.push(
            `${city}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Global Weekly Digest: ${results.articles_created} created, ${results.articles_skipped} skipped`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      week_start: weekStartStr,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Global Weekly Digest generation failed:', error);

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
