import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/ads/booking-info?session_id=cs_xxx
 *
 * Returns booking details for the success page.
 * Looks up the ad by stripe_session_id.
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

  const { data: ad } = await supabase
    .from('ads')
    .select('id, neighborhood_id, start_date, placement_type')
    .eq('stripe_session_id', sessionId)
    .single();

  if (!ad) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  let neighborhoodName = '';
  let cityName = '';
  if (ad.neighborhood_id) {
    const { data: hood } = await supabase
      .from('neighborhoods')
      .select('name, city')
      .eq('id', ad.neighborhood_id)
      .single();
    if (hood) {
      neighborhoodName = hood.name;
      cityName = hood.city;
    }
  }

  return NextResponse.json({
    adId: ad.id,
    neighborhoodName,
    cityName,
    date: ad.start_date,
    placementType: ad.placement_type,
  });
}
