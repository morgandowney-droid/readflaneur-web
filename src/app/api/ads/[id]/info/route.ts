import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/ads/[id]/info
 *
 * Returns basic ad info for the upload page.
 * No auth required — secured by knowing the ad UUID.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: adId } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: ad } = await supabase
    .from('ads')
    .select('id, status, neighborhood_id, start_date, placement_type')
    .eq('id', adId)
    .single();

  if (!ad) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Look up neighborhood name
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
    id: ad.id,
    status: ad.status,
    neighborhood_name: neighborhoodName,
    city_name: cityName,
    start_date: ad.start_date,
    placement_type: ad.placement_type,
  });
}
