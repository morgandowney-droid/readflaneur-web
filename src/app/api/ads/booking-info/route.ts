import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/ads/booking-info?session_id=cs_xxx
 *
 * Returns booking details for the success page.
 * Supports multi-neighborhood bookings (multiple ads per session).
 */
export async function GET(request: NextRequest) {
  const sessionId = new URL(request.url).searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fetch all ads for this session (multi-neighborhood support)
  const { data: ads } = await supabase
    .from('ads')
    .select('id, neighborhood_id, start_date, placement_type')
    .eq('stripe_session_id', sessionId);

  if (!ads || ads.length === 0) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Look up all neighborhood names
  const hoodIds = [...new Set(ads.map((a) => a.neighborhood_id).filter(Boolean))];
  const { data: hoods } = await supabase
    .from('neighborhoods')
    .select('id, name, city')
    .in('id', hoodIds);

  const hoodMap = new Map((hoods || []).map((h) => [h.id, h]));

  const bookings = ads.map((ad) => {
    const hood = hoodMap.get(ad.neighborhood_id);
    return {
      adId: ad.id,
      neighborhoodName: hood?.name || '',
      cityName: hood?.city || '',
      date: ad.start_date,
      placementType: ad.placement_type,
    };
  });

  // Return single booking shape for backwards compat, plus full array
  return NextResponse.json({
    // Legacy single-booking fields (first ad)
    adId: bookings[0].adId,
    neighborhoodName: bookings[0].neighborhoodName,
    cityName: bookings[0].cityName,
    date: bookings[0].date,
    placementType: bookings[0].placementType,
    // Multi-neighborhood
    bookings,
  });
}
