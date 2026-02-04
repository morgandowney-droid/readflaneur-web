import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPlaceDetails, getPhotoUrl } from '@/lib/google-places';

/**
 * Fix Missing Photos
 *
 * Fetches photos from Google Places for listings that are missing them.
 *
 * Usage:
 *   GET /api/admin/fix-missing-photos?neighborhood=nyc-tribeca&limit=10
 *   GET /api/admin/fix-missing-photos?all=true&limit=50
 */

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized && cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const neighborhoodId = url.searchParams.get('neighborhood');
  const fixAll = url.searchParams.get('all') === 'true';
  const limit = parseInt(url.searchParams.get('limit') || '20');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find places missing photos
  let query = supabase
    .from('guide_listings')
    .select('id, name, google_place_id, neighborhood_id')
    .is('google_photo_url', null)
    .not('google_place_id', 'is', null)
    .eq('is_active', true)
    .limit(limit);

  if (neighborhoodId && !fixAll) {
    query = query.eq('neighborhood_id', neighborhoodId);
  }

  const { data: listings, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!listings || listings.length === 0) {
    return NextResponse.json({
      message: 'No listings found with missing photos',
      fixed: 0,
    });
  }

  const results = {
    found: listings.length,
    fixed: 0,
    failed: 0,
    details: [] as { name: string; status: string; photoUrl?: string }[],
  };

  for (const listing of listings) {
    try {
      // Fetch place details including photos
      const details = await getPlaceDetails(listing.google_place_id);

      if (details?.photos?.[0]?.name) {
        const photoReference = details.photos[0].name;
        const photoUrl = getPhotoUrl(photoReference, 400);

        // Update the listing
        await supabase
          .from('guide_listings')
          .update({
            google_photo_url: photoUrl,
            google_photo_reference: photoReference,
            updated_at: new Date().toISOString(),
          })
          .eq('id', listing.id);

        results.fixed++;
        results.details.push({
          name: listing.name,
          status: 'fixed',
          photoUrl,
        });
      } else {
        results.failed++;
        results.details.push({
          name: listing.name,
          status: 'no_photo_available',
        });
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      results.failed++;
      results.details.push({
        name: listing.name,
        status: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    timestamp: new Date().toISOString(),
  });
}
