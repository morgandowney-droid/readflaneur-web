import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBentoRegion, BENTO_REGIONS, BentoRegion } from '@/lib/region-utils';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

export interface DiscoveryBrief {
  slug: string;
  headline: string;
  previewText: string;
  imageUrl: string;
  neighborhoodName: string;
  neighborhoodId: string;
  city: string;
  citySlug: string;
  neighborhoodSlug: string;
}

export interface DiscoveryBriefsResponse {
  regions: Record<BentoRegion, DiscoveryBrief[]>;
}

/**
 * GET /api/feed/discovery-briefs?subscribedIds=id1,id2&count=3
 *
 * Fetches daily brief articles for non-subscribed neighborhoods, grouped by bento region.
 * Used by the desktop bento grid discovery layout.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subscribedIdsParam = searchParams.get('subscribedIds') || '';
    const count = Math.min(parseInt(searchParams.get('count') || '3', 10), 12);

    const subscribedIds = new Set(
      subscribedIdsParam.split(',').filter(Boolean)
    );

    const supabase = await createClient();

    // Fetch all active, non-combo neighborhoods
    const { data: neighborhoods, error: hoodError } = await supabase
      .from('neighborhoods')
      .select('id, name, city, country, region, latitude, longitude')
      .eq('is_active', true)
      .eq('is_combo', false)
      .neq('region', 'test');

    if (hoodError || !neighborhoods) {
      return NextResponse.json({ regions: {} }, { status: 200 });
    }

    // Filter out subscribed and group by bento region
    const grouped = new Map<BentoRegion, typeof neighborhoods>();
    for (const hood of neighborhoods) {
      if (subscribedIds.has(hood.id)) continue;
      const bentoRegion = getBentoRegion(hood.region);
      if (!bentoRegion) continue;
      if (!grouped.has(bentoRegion)) grouped.set(bentoRegion, []);
      grouped.get(bentoRegion)!.push(hood);
    }

    // For each region, shuffle and pick `count` neighborhoods
    const regionPicks = new Map<BentoRegion, typeof neighborhoods>();
    for (const { key } of BENTO_REGIONS) {
      const pool = grouped.get(key) || [];
      // Fisher-Yates shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      regionPicks.set(key, pool.slice(0, count));
    }

    // Collect all picked neighborhood IDs to batch-fetch articles
    const allPickedIds = Array.from(regionPicks.values()).flat().map(n => n.id);
    if (allPickedIds.length === 0) {
      return NextResponse.json({ regions: {} }, {
        status: 200,
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      });
    }

    // Fetch most recent brief_summary article for each picked neighborhood
    // Use a single query with all IDs, then group client-side
    const { data: articles } = await supabase
      .from('articles')
      .select('slug, headline, preview_text, body_text, image_url, neighborhood_id')
      .eq('status', 'published')
      .eq('article_type', 'brief_summary')
      .in('neighborhood_id', allPickedIds)
      .not('image_url', 'is', null)
      .order('published_at', { ascending: false })
      .limit(allPickedIds.length * 3); // Overfetch to ensure coverage

    // Index articles by neighborhood_id (keep only first per neighborhood)
    const articleByHood = new Map<string, typeof articles extends (infer T)[] | null ? T : never>();
    if (articles) {
      for (const article of articles) {
        if (!articleByHood.has(article.neighborhood_id)) {
          articleByHood.set(article.neighborhood_id, article);
        }
      }
    }

    // Build response
    const result: Record<string, DiscoveryBrief[]> = {};
    for (const { key } of BENTO_REGIONS) {
      const picks = regionPicks.get(key) || [];
      const briefs: DiscoveryBrief[] = [];
      for (const hood of picks) {
        const article = articleByHood.get(hood.id);
        if (!article || !article.image_url) continue;
        briefs.push({
          slug: article.slug,
          headline: article.headline || '',
          previewText: article.preview_text || article.body_text?.slice(0, 200) || '',
          imageUrl: article.image_url,
          neighborhoodName: hood.name,
          neighborhoodId: hood.id,
          city: hood.city,
          citySlug: getCitySlugFromId(hood.id),
          neighborhoodSlug: getNeighborhoodSlugFromId(hood.id),
        });
      }
      result[key] = briefs;
    }

    return NextResponse.json({ regions: result }, {
      status: 200,
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch {
    return NextResponse.json({ regions: {} }, { status: 200 });
  }
}
