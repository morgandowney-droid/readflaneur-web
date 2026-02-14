import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

/**
 * GET /api/briefs/yesterday?neighborhoodId=xxx&excludeSlug=yyy
 *
 * Returns the previous day's daily brief article URL for a neighborhood.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const neighborhoodId = searchParams.get('neighborhoodId');
    const excludeSlug = searchParams.get('excludeSlug') || '';

    if (!neighborhoodId) {
      return NextResponse.json({ url: null });
    }

    const supabase = await createClient();

    // Find the most recent brief article that isn't the current one
    let query = supabase
      .from('articles')
      .select('slug')
      .eq('neighborhood_id', neighborhoodId)
      .eq('status', 'published')
      .ilike('category_label', '%Daily Brief%')
      .order('published_at', { ascending: false })
      .limit(2);

    const { data: articles } = await query;

    if (!articles || articles.length === 0) {
      return NextResponse.json({ url: null });
    }

    // Find the first article that isn't the current one
    const previous = articles.find(a => a.slug !== excludeSlug);
    if (!previous) {
      return NextResponse.json({ url: null });
    }

    const citySlug = getCitySlugFromId(neighborhoodId);
    const neighborhoodSlug = getNeighborhoodSlugFromId(neighborhoodId);

    return NextResponse.json({
      url: `/${citySlug}/${neighborhoodSlug}/${previous.slug}`,
    });
  } catch {
    return NextResponse.json({ url: null });
  }
}
