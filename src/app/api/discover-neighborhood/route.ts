import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findDiscoveryBrief } from '@/lib/discover-neighborhood';

/**
 * GET /api/discover-neighborhood?subscribedIds=id1,id2&referenceId=id3
 *
 * Returns a URL to a nearby unsubscribed neighborhood's latest brief.
 * Used by the "Check Out a New Neighborhood" house ad on web.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subscribedIdsParam = searchParams.get('subscribedIds') || '';
    const referenceId = searchParams.get('referenceId') || null;

    const subscribedIds = subscribedIdsParam
      ? subscribedIdsParam.split(',').filter(Boolean)
      : [];

    const supabase = await createClient();
    const result = await findDiscoveryBrief(supabase, subscribedIds, referenceId);

    if (result) {
      return NextResponse.json(result);
    }

    return NextResponse.json({ url: '/discover', neighborhoodName: null });
  } catch {
    return NextResponse.json({ url: '/discover', neighborhoodName: null });
  }
}
