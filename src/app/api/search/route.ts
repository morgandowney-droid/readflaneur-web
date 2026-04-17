import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * @swagger
 * /api/search:
 *   get:
 *     tags: [Search]
 *     summary: Search articles by keyword
 *     description: Full-text search across article headlines, body text, and preview text. Returns published articles only.
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Search query (minimum 2 characters)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: Maximum results to return
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 query:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ArticleSummary'
 *       400:
 *         description: Query too short
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  if (!query || query.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  const supabase = await createClient();

  // Search articles and neighborhoods in parallel
  const [articlesResult, neighborhoodsResult] = await Promise.all([
    // Article search
    supabase
      .from('articles')
      .select(`
        id,
        headline,
        preview_text,
        body_text,
        image_url,
        slug,
        created_at,
        published_at,
        neighborhood:neighborhoods(
          id,
          name,
          city
        )
      `)
      .eq('status', 'published')
      .or(`headline.ilike.%${query}%,body_text.ilike.%${query}%,preview_text.ilike.%${query}%`)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit),

    // Neighborhood search - match name or city
    supabase
      .from('neighborhoods')
      .select('id, name, city, country, region, is_combo, is_community')
      .eq('is_active', true)
      .neq('region', 'test')
      .or(`name.ilike.%${query}%,city.ilike.%${query}%`)
      .order('name')
      .limit(10),
  ]);

  if (articlesResult.error) {
    console.error('Search error:', articlesResult.error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  // Transform article results
  const results = (articlesResult.data || []).map((article: any) => {
    const neighborhood = Array.isArray(article.neighborhood)
      ? article.neighborhood[0]
      : article.neighborhood;
    let url = '#';

    if (neighborhood) {
      const citySlug = neighborhood.city.toLowerCase().replace(/\s+/g, '-');
      const neighborhoodSlug = neighborhood.id.split('-').slice(1).join('-');
      url = `/${citySlug}/${neighborhoodSlug}/${article.slug || article.id}`;
    }

    let excerpt = article.preview_text || article.body_text?.substring(0, 200) || '';
    if (excerpt.length > 200) {
      excerpt = excerpt.substring(0, 200) + '...';
    }

    return {
      id: article.id,
      headline: article.headline,
      excerpt,
      image_url: article.image_url,
      url,
      neighborhood: neighborhood?.name || null,
      city: neighborhood?.city || null,
      published_at: article.published_at || article.created_at,
    };
  });

  // Transform neighborhood results
  const neighborhoods = (neighborhoodsResult.data || []).map((n: any) => {
    const citySlug = n.city.toLowerCase().replace(/\s+/g, '-');
    const neighborhoodSlug = n.id.split('-').slice(1).join('-');
    return {
      id: n.id,
      name: n.name,
      city: n.city,
      country: n.country,
      url: `/${citySlug}/${neighborhoodSlug}`,
    };
  });

  return NextResponse.json({
    query,
    count: results.length,
    neighborhoods,
    results,
  });
}
