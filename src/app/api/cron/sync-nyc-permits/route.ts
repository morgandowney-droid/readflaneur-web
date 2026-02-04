/**
 * NYC Permits Sync Cron Job
 *
 * Fetches DOB permit filings from NYC Open Data and upserts to database.
 * Geofenced to Flâneur NYC coverage areas.
 *
 * Schedule: Daily at 6 AM UTC (1 AM EST)
 * Vercel Cron: 0 6 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchNYCPermits, filterNotablePermits } from '@/lib/nyc-permits';

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
    permits_fetched: 0,
    permits_inserted: 0,
    permits_updated: 0,
    permits_notable: 0,
    errors: [] as string[],
  };

  try {
    // Fetch permits from the last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);

    console.log(`Fetching NYC permits since ${since.toISOString()}`);

    const permits = await fetchNYCPermits(since, 2000);
    results.permits_fetched = permits.length;

    // Count notable permits
    const notable = filterNotablePermits(permits);
    results.permits_notable = notable.length;

    // Upsert each permit
    for (const permit of permits) {
      if (!permit.neighborhood_id) continue;

      try {
        const { error } = await supabase
          .from('nyc_permits')
          .upsert(
            {
              job_number: permit.job_number,
              permit_type: permit.permit_type,
              filing_date: permit.filing_date || null,
              job_description: permit.job_description,
              zip_code: permit.zip_code,
              address: permit.address,
              neighborhood_id: permit.neighborhood_id,
              raw_data: permit.raw_data,
            },
            {
              onConflict: 'job_number',
              ignoreDuplicates: false,
            }
          );

        if (error) {
          if (error.code === '23505') {
            // Duplicate - this is expected for updates
            results.permits_updated++;
          } else {
            results.errors.push(`${permit.job_number}: ${error.message}`);
          }
        } else {
          results.permits_inserted++;
        }
      } catch (err) {
        results.errors.push(
          `${permit.job_number}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(
      `NYC Permits Sync: ${results.permits_inserted} inserted, ${results.permits_updated} updated, ${results.permits_notable} notable`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.permits_inserted > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('NYC Permits sync failed:', error);

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
