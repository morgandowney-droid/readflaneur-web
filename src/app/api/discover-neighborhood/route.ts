import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findDiscoveryBrief } from '@/lib/discover-neighborhood';

/**
 * @swagger
 * /api/discover-neighborhood:
 *   get:
 *     summary: Find a nearby unsubscribed neighborhood's latest brief
 *     tags: [Explore]
 *     description: Returns a URL to a nearby unsubscribed neighborhood's latest brief. Used by the "Check Out a New Neighborhood" house ad and daily brief discovery CTAs.
 *     parameters:
 *       - in: query
 *         name: subscribedIds
 *         schema:
 *           type: string
 *         description: Comma-separated list of already-subscribed neighborhood IDs to exclude
 *       - in: query
 *         name: referenceId
 *         schema:
 *           type: string
 *         description: Reference neighborhood ID for proximity sorting
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *           enum: [nearby, random]
 *         description: Discovery mode (default nearby)
 *       - in: query
 *         name: excludeCity
 *         schema:
 *           type: string
 *         description: City to exclude (used in random mode for diversity)
 *     responses:
 *       200:
 *         description: Discovery result with URL and neighborhood name
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: URL to the discovered neighborhood's brief, or /discover as fallback
 *                 neighborhoodName:
 *                   type: string
 *                   nullable: true
 *                   description: Name of the discovered neighborhood, or null if fallback
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subscribedIdsParam = searchParams.get('subscribedIds') || '';
    const referenceId = searchParams.get('referenceId') || null;
    const mode = (searchParams.get('mode') as 'nearby' | 'random') || undefined;
    const excludeCity = searchParams.get('excludeCity') || undefined;

    const subscribedIds = subscribedIdsParam
      ? subscribedIdsParam.split(',').filter(Boolean)
      : [];

    const supabase = await createClient();
    const result = await findDiscoveryBrief(supabase, subscribedIds, referenceId, {
      mode,
      excludeCity,
    });

    if (result) {
      return NextResponse.json(result);
    }

    return NextResponse.json({ url: '/discover', neighborhoodName: null });
  } catch {
    return NextResponse.json({ url: '/discover', neighborhoodName: null });
  }
}
