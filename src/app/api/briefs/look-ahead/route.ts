import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

/**
 * GET /api/briefs/look-ahead?neighborhoodId=xxx
 *
 * Returns the most recent Look Ahead article URL for a neighborhood
 * published within the last 48 hours. Expands combo neighborhoods
 * to include component IDs (articles stored under components, not combo).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const neighborhoodId = searchParams.get('neighborhoodId');

    if (!neighborhoodId) {
      return NextResponse.json({ url: null });
    }

    const supabase = await createClient();

    // Expand combo neighborhoods to include component IDs
    const queryIds = [neighborhoodId];
    const { data: components } = await supabase
      .from('combo_neighborhoods')
      .select('component_id')
      .eq('combo_id', neighborhoodId);
    if (components && components.length > 0) {
      queryIds.push(...components.map(c => c.component_id));
    }

    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48);

    const { data: articles } = await supabase
      .from('articles')
      .select('slug, headline, body_text, preview_text, published_at, neighborhood_id')
      .in('neighborhood_id', queryIds)
      .eq('status', 'published')
      .eq('article_type', 'look_ahead')
      .gte('published_at', cutoff.toISOString())
      .order('published_at', { ascending: false })
      .limit(1);

    if (!articles || articles.length === 0) {
      return NextResponse.json({ url: null });
    }

    const article = articles[0];
    // Use the combo ID for the URL so the user stays on their neighborhood page
    const citySlug = getCitySlugFromId(neighborhoodId);
    const neighborhoodSlug = getNeighborhoodSlugFromId(neighborhoodId);

    return NextResponse.json({
      url: `/${citySlug}/${neighborhoodSlug}/${article.slug}`,
      headline: article.headline,
      bodyText: article.body_text,
      previewText: article.preview_text,
      publishedAt: article.published_at,
    });
  } catch {
    return NextResponse.json({ url: null });
  }
}
