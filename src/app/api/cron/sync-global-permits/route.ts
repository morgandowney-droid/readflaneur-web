/**
 * Global Permits Sync Cron Job
 *
 * Fetches permit/planning data from international cities and upserts to database.
 * Uses the City Adapter pattern for standardized data fetching.
 *
 * Supported cities: London, Sydney, Chicago, Los Angeles, Washington DC
 *
 * Schedule: Daily at 7 AM UTC
 * Vercel Cron: 0 7 * * *
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    cities_processed: 0,
    permits_fetched: 0,
    permits_inserted: 0,
    permits_updated: 0,
    by_city: {} as Record<string, { fetched: number; inserted: number }>,
    errors: [] as string[],
  };

  try {
    // Determine which cities to process
    const cities = testCity ? [testCity] : getAvailableCities();

    // Fetch permits from the last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);

    console.log(
      `Syncing global permits for ${cities.length} cities since ${since.toISOString()}`
    );

    for (const city of cities) {
      try {
        const adapter = getAdapter(city);
        if (!adapter) {
          results.errors.push(`No adapter found for city: ${city}`);
          continue;
        }

        results.cities_processed++;
        results.by_city[city] = { fetched: 0, inserted: 0 };

        console.log(`Fetching permits for ${city}...`);
        const permits = await adapter.getPermits(since);
        results.by_city[city].fetched = permits.length;
        results.permits_fetched += permits.length;

        console.log(`${city}: Retrieved ${permits.length} permits`);

        // Upsert each permit
        for (const permit of permits) {
          if (!permit.neighborhoodId) continue;

          try {
            const { error } = await supabase.from('global_permits').upsert(
              {
                source_id: permit.sourceId,
                city,
                country: adapter.country,
                neighborhood_id: permit.neighborhoodId,
                permit_type: permit.category || 'Unknown',
                filing_date: permit.date || null,
                description: permit.description,
                address: permit.address,
                estimated_value: permit.value || null,
                currency: permit.currency || adapter.currency,
                raw_data: permit.rawData || {},
              },
              {
                onConflict: 'source_id,city',
                ignoreDuplicates: false,
              }
            );

            if (error) {
              if (error.code !== '23505') {
                results.errors.push(`${city}/${permit.sourceId}: ${error.message}`);
              } else {
                results.permits_updated++;
              }
            } else {
              results.permits_inserted++;
              results.by_city[city].inserted++;
            }
          } catch (err) {
            results.errors.push(
              `${city}/${permit.sourceId}: ${err instanceof Error ? err.message : String(err)}`
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
      `Global Permits Sync: ${results.permits_inserted} inserted, ${results.permits_updated} updated`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.permits_inserted > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Global Permits sync failed:', error);

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
