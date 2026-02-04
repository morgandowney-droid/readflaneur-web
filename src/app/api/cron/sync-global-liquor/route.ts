/**
 * Global Liquor/License Sync Cron Job
 *
 * Fetches liquor/licensing data from international cities and upserts to database.
 * Uses the City Adapter pattern for standardized data fetching.
 *
 * Supported cities: London, Sydney, Chicago, Los Angeles, Washington DC
 *
 * Schedule: Weekly on Tuesdays at 7 AM UTC
 * Vercel Cron: 0 7 * * 2
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
    licenses_fetched: 0,
    licenses_inserted: 0,
    licenses_updated: 0,
    by_city: {} as Record<string, { fetched: number; inserted: number }>,
    errors: [] as string[],
  };

  try {
    // Determine which cities to process
    const cities = testCity ? [testCity] : getAvailableCities();

    // Fetch licenses from the last 30 days
    const since = new Date();
    since.setDate(since.getDate() - 30);

    console.log(
      `Syncing global liquor licenses for ${cities.length} cities since ${since.toISOString()}`
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

        console.log(`Fetching liquor licenses for ${city}...`);
        const licenses = await adapter.getLiquor(since);
        results.by_city[city].fetched = licenses.length;
        results.licenses_fetched += licenses.length;

        console.log(`${city}: Retrieved ${licenses.length} licenses`);

        // Upsert each license
        for (const license of licenses) {
          if (!license.neighborhoodId) continue;

          try {
            const { error } = await supabase.from('global_licenses').upsert(
              {
                source_id: license.sourceId,
                city,
                country: adapter.country,
                neighborhood_id: license.neighborhoodId,
                license_type: license.category || 'Unknown',
                premises_name: license.title,
                effective_date: license.date || null,
                address: license.address,
                raw_data: license.rawData || {},
              },
              {
                onConflict: 'source_id,city',
                ignoreDuplicates: false,
              }
            );

            if (error) {
              if (error.code !== '23505') {
                results.errors.push(`${city}/${license.sourceId}: ${error.message}`);
              } else {
                results.licenses_updated++;
              }
            } else {
              results.licenses_inserted++;
              results.by_city[city].inserted++;
            }
          } catch (err) {
            results.errors.push(
              `${city}/${license.sourceId}: ${err instanceof Error ? err.message : String(err)}`
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
      `Global Liquor Sync: ${results.licenses_inserted} inserted, ${results.licenses_updated} updated`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.licenses_inserted > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Global Liquor sync failed:', error);

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
