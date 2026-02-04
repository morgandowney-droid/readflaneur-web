/**
 * NYC Liquor Licenses Sync Cron Job
 *
 * Fetches liquor licenses from NY State Open Data and upserts to database.
 * Filtered to NYC zip codes within Flâneur coverage areas.
 *
 * Schedule: Weekly on Mondays at 7 AM UTC (2 AM EST)
 * Vercel Cron: 0 7 * * 1
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchLiquorLicenses,
  filterNotableLicenses,
  isNewLicense,
} from '@/lib/nyc-liquor';

export const runtime = 'nodejs';
export const maxDuration = 120;

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    licenses_fetched: 0,
    licenses_inserted: 0,
    licenses_updated: 0,
    licenses_notable: 0,
    new_licenses: 0,
    errors: [] as string[],
  };

  try {
    // Fetch licenses from the last 30 days
    const since = new Date();
    since.setDate(since.getDate() - 30);

    console.log(`Fetching liquor licenses since ${since.toISOString()}`);

    const licenses = await fetchLiquorLicenses(since, 2000);
    results.licenses_fetched = licenses.length;

    // Count notable and new licenses
    const notable = filterNotableLicenses(licenses);
    results.licenses_notable = notable.length;
    results.new_licenses = licenses.filter(isNewLicense).length;

    // Upsert each license
    for (const license of licenses) {
      if (!license.neighborhood_id) continue;

      try {
        const { error } = await supabase
          .from('nyc_liquor_licenses')
          .upsert(
            {
              serial_number: license.serial_number,
              license_type: license.license_type,
              premises_name: license.premises_name,
              effective_date: license.effective_date || null,
              expiration_date: license.expiration_date || null,
              zip_code: license.zip_code,
              address: license.address,
              neighborhood_id: license.neighborhood_id,
              raw_data: license.raw_data,
            },
            {
              onConflict: 'serial_number',
              ignoreDuplicates: false,
            }
          );

        if (error) {
          if (error.code === '23505') {
            // Duplicate - this is expected for updates
            results.licenses_updated++;
          } else {
            results.errors.push(`${license.serial_number}: ${error.message}`);
          }
        } else {
          results.licenses_inserted++;
        }
      } catch (err) {
        results.errors.push(
          `${license.serial_number}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(
      `NYC Liquor Sync: ${results.licenses_inserted} inserted, ${results.licenses_updated} updated, ${results.new_licenses} new`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.licenses_inserted > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('NYC Liquor sync failed:', error);

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
