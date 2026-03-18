import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * @swagger
 * /api/ads/{id}/info:
 *   get:
 *     summary: Get ad info for upload page
 *     description: Returns basic ad info. No auth required - secured by knowing the ad UUID.
 *     tags: [Ads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ad ID
 *     responses:
 *       200:
 *         description: Ad info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 status:
 *                   type: string
 *                 neighborhood_name:
 *                   type: string
 *                 city_name:
 *                   type: string
 *                 start_date:
 *                   type: string
 *                   format: date
 *                 placement_type:
 *                   type: string
 *       404:
 *         description: Ad not found
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
