import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

/**
 * GET /api/briefs/look-ahead?neighborhoodId=xxx
 *
 * Returns the most recent Look Ahead article URL for a neighborhood
 * published within the last 48 hours.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const neighborhoodId = searchParams.get('neighborhoodId');

    if (!neighborhoodId) {
      return NextResponse.json({ url: null });
    }

    const supabase = await createClient();

    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48);

    const { data: articles } = await supabase
      .from('articles')
      .select('slug')
      .eq('neighborhood_id', neighborhoodId)
      .eq('status', 'published')
      .eq('article_type', 'look_ahead')
      .gte('published_at', cutoff.toISOString())
      .order('published_at', { ascending: false })
      .limit(1);

    if (!articles || articles.length === 0) {
      return NextResponse.json({ url: null });
    }

    const citySlug = getCitySlugFromId(neighborhoodId);
    const neighborhoodSlug = getNeighborhoodSlugFromId(neighborhoodId);

    return NextResponse.json({
      url: `/${citySlug}/${neighborhoodSlug}/${articles[0].slug}`,
    });
  } catch {
    return NextResponse.json({ url: null });
  }
}
