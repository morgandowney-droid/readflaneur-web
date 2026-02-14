import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findDiscoveryBrief } from '@/lib/discover-neighborhood';

/**
 * GET /api/discover-neighborhood?subscribedIds=id1,id2&referenceId=id3&mode=nearby|random&excludeCity=Paris
 *
 * Returns a URL to a nearby unsubscribed neighborhood's latest brief.
 * Used by the "Check Out a New Neighborhood" house ad and daily brief discovery CTAs.
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
