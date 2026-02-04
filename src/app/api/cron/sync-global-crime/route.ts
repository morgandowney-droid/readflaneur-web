/**
 * Global Crime/Safety Stats Sync Cron Job
 *
 * Fetches safety/crime statistics from international cities and upserts to database.
 * Uses the City Adapter pattern for standardized data fetching.
 *
 * Supported cities: London, Sydney, Chicago, Los Angeles, Washington DC
 *
 * Schedule: Weekly on Saturdays at 9 AM UTC
 * Vercel Cron: 0 9 * * 6
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdapter, getAvailableCities } from '@/lib/adapters';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for all cities

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

  // Support ?city=London for testing single city
  const url = new URL(request.url);
  const testCity = url.searchParams.get('city');
  const period = (url.searchParams.get('period') as 'week' | 'month') || 'week';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    cities_processed: 0,
    stats_fetched: 0,
    stats_inserted: 0,
    stats_updated: 0,
    by_city: {} as Record<string, { zones: number; inserted: number }>,
    errors: [] as string[],
  };

  try {
    // Determine which cities to process
    const cities = testCity ? [testCity] : getAvailableCities();

    console.log(
      `Syncing global crime stats for ${cities.length} cities (${period})`
    );

    for (const city of cities) {
      try {
        const adapter = getAdapter(city);
        if (!adapter) {
          results.errors.push(`No adapter found for city: ${city}`);
          continue;
        }

        results.cities_processed++;
        results.by_city[city] = { zones: 0, inserted: 0 };

        console.log(`Fetching safety stats for ${city}...`);
        const stats = await adapter.getSafety(period);
        results.by_city[city].zones = stats.length;
        results.stats_fetched += stats.length;

        console.log(`${city}: Retrieved stats for ${stats.length} zones`);

        // Upsert each zone's stats
        for (const zoneStat of stats) {
          if (!zoneStat.neighborhoodId) continue;

          try {
            const { error } = await supabase.from('global_safety_stats').upsert(
              {
                city,
                country: adapter.country,
                neighborhood_id: zoneStat.neighborhoodId,
                period_start: zoneStat.periodStart,
                period_end: zoneStat.periodEnd,
                total_incidents: zoneStat.totalIncidents,
                stats_by_category: zoneStat.byCategory,
                trend: zoneStat.trend || null,
                trend_percentage: zoneStat.trendPercentage || null,
              },
              {
                onConflict: 'city,neighborhood_id,period_start',
                ignoreDuplicates: false,
              }
            );

            if (error) {
              if (error.code !== '23505') {
                results.errors.push(
                  `${city}/${zoneStat.neighborhoodId}: ${error.message}`
                );
              } else {
                results.stats_updated++;
              }
            } else {
              results.stats_inserted++;
              results.by_city[city].inserted++;
            }
          } catch (err) {
            results.errors.push(
              `${city}/${zoneStat.neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // Rate limiting between cities
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        results.errors.push(
          `${city}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(
      `Global Crime Sync: ${results.stats_inserted} inserted, ${results.stats_updated} updated`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.stats_inserted > 0,
      period,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Global Crime sync failed:', error);

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
