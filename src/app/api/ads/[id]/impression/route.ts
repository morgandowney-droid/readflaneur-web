import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * @swagger
 * /api/ads/{id}/impression:
 *   post:
 *     summary: Record an ad impression
 *     description: Fire-and-forget endpoint to increment impression count for an ad.
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
 *         description: Impression recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const supabase = await createClient();

    // Increment impression count
    const { error } = await supabase.rpc('increment_ad_impressions', { ad_id: adId });

    if (error) {
      // Fallback to manual increment if RPC doesn't exist
      const { data: ad } = await supabase
        .from('ads')
        .select('impressions')
        .eq('id', adId)
        .single();

      if (ad) {
        await supabase
          .from('ads')
          .update({ impressions: (ad.impressions || 0) + 1 })
          .eq('id', adId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Impression tracking error:', err);
    // Return success anyway to not break the user experience
    return NextResponse.json({ success: true });
  }
}
