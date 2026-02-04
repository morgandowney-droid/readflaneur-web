/**
 * NYC Crime Stats Sync Cron Job
 *
 * Fetches NYPD crime statistics from NYC Open Data, aggregates by neighborhood,
 * and stores to database.
 *
 * Schedule: Weekly on Saturdays at 8 AM UTC (3 AM EST) - "Civics Saturday"
 * Vercel Cron: 0 8 * * 6
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchCrimeStatsForNeighborhood,
  summarizeCrimeStats,
} from '@/lib/nyc-crime';
import {
  FLANEUR_NYC_CONFIG,
  NEIGHBORHOOD_ID_TO_CONFIG,
} from '@/config/nyc-locations';

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
  const period = (url.searchParams.get('period') || 'week') as 'week' | 'month';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    neighborhoods_processed: 0,
    stats_inserted: 0,
    stats_updated: 0,
    total_incidents: 0,
    errors: [] as string[],
    summaries: [] as { neighborhood: string; summary: string }[],
  };

  try {
    // Determine which neighborhoods to process
    let neighborhoodKeys: string[];

    if (testNeighborhoodId) {
      // Test mode: single neighborhood
      const configKey = NEIGHBORHOOD_ID_TO_CONFIG[testNeighborhoodId];
      if (!configKey) {
        return NextResponse.json(
          { error: `Unknown neighborhood ID: ${testNeighborhoodId}` },
          { status: 400 }
        );
      }
      neighborhoodKeys = [configKey];
    } else {
      // Get NYC neighborhoods that have precinct data
      // Filter to neighborhoods that are directly served (not component-only)
      neighborhoodKeys = Object.keys(FLANEUR_NYC_CONFIG).filter((key) => {
        const config = FLANEUR_NYC_CONFIG[key];
        // Must have precincts and must be a served neighborhood (has an ID mapping)
        if (config.precincts.length === 0) return false;

        // Check if this neighborhood has a URL ID
        for (const [, configKeyVal] of Object.entries(NEIGHBORHOOD_ID_TO_CONFIG)) {
          if (configKeyVal === key) return true;
        }
        return false;
      });
    }

    console.log(`Processing ${neighborhoodKeys.length} neighborhoods for crime stats`);

    for (const neighborhoodKey of neighborhoodKeys) {
      try {
        results.neighborhoods_processed++;

        const stats = await fetchCrimeStatsForNeighborhood(neighborhoodKey, period);

        if (!stats || !stats.neighborhood_id) {
          console.log(`No stats available for ${neighborhoodKey}`);
          continue;
        }

        results.total_incidents += stats.total_incidents;

        // Generate summary for logging
        const summary = summarizeCrimeStats(stats);
        results.summaries.push({
          neighborhood: neighborhoodKey,
          summary,
        });

        // Upsert to database
        const { error } = await supabase
          .from('nyc_crime_stats')
          .upsert(
            {
              neighborhood_id: stats.neighborhood_id,
              period_start: stats.period_start,
              period_end: stats.period_end,
              total_incidents: stats.total_incidents,
              stats_by_category: stats.by_category,
              precincts_included: stats.precincts_included,
              raw_data: { incidents_count: stats.raw_data.length },
            },
            {
              onConflict: 'neighborhood_id,period_start',
              ignoreDuplicates: false,
            }
          );

        if (error) {
          if (error.code === '23505') {
            results.stats_updated++;
          } else {
            results.errors.push(`${neighborhoodKey}: ${error.message}`);
          }
        } else {
          results.stats_inserted++;
        }

        // Rate limiting between API calls
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        results.errors.push(
          `${neighborhoodKey}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(
      `NYC Crime Sync: ${results.stats_inserted} inserted, ${results.stats_updated} updated, ${results.total_incidents} total incidents`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.stats_inserted > 0,
      period,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('NYC Crime sync failed:', error);

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
