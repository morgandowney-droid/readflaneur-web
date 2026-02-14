import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

/**
 * GET /api/briefs/yesterday?neighborhoodId=xxx&beforeDate=ISO
 *
 * Returns the most recent daily brief article URL for a neighborhood
 * published BEFORE the given date. This ensures "yesterday" is always
 * relative to the brief the user is currently reading.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const neighborhoodId = searchParams.get('neighborhoodId');
    const beforeDate = searchParams.get('beforeDate');

    if (!neighborhoodId) {
      return NextResponse.json({ url: null });
    }

    const supabase = await createClient();

    // Find the most recent brief article published before the given date
    let query = supabase
      .from('articles')
      .select('slug')
      .eq('neighborhood_id', neighborhoodId)
      .eq('status', 'published')
      .ilike('category_label', '%Daily Brief%')
      .order('published_at', { ascending: false })
      .limit(1);

    // If beforeDate provided, only return briefs from before that date
    if (beforeDate) {
      query = query.lt('published_at', beforeDate);
    }

    const { data: articles } = await query;

    if (!articles || articles.length === 0) {
      return NextResponse.json({ url: null });
    }

    const previous = articles[0];

    const citySlug = getCitySlugFromId(neighborhoodId);
    const neighborhoodSlug = getNeighborhoodSlugFromId(neighborhoodId);

    return NextResponse.json({
      url: `/${citySlug}/${neighborhoodSlug}/${previous.slug}`,
    });
  } catch {
    return NextResponse.json({ url: null });
  }
}
