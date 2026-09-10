import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { resolveSearchQuery } from '@/lib/search-aliases';

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

  // Service role, not the cookie client. Under row-level security Postgres
  // will not use a non-leakproof operator (ILIKE) as an index condition, so
  // the anon role seq-scans 80k rows (6.6s) and hits its 3s statement
  // timeout; every search returned 500 (2026-09-10). Without RLS the same
  // query is a Bitmap Index Scan on the trigram index, ~50ms. Safe because
  // the queries below filter to status = 'published' themselves.
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Three indexed ILIKE queries in parallel, one per column, then merge.
  // A single OR across the three columns ran 3.6-5.3s even without RLS;
  // per column each query is 50-500ms on its own trigram index.
  const articleSelect = `
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
      `;
  const articleQuery = (column: 'headline' | 'preview_text' | 'body_text') =>
    supabase
      .from('articles')
      .select(articleSelect)
      .eq('status', 'published')
      .ilike(column, `%${query}%`)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit);

  const [headlineResult, previewResult, bodyResult, neighborhoodsResult] = await Promise.all([
    articleQuery('headline'),
    articleQuery('preview_text'),
    articleQuery('body_text'),
    // Neighborhood search - fetch all active for fuzzy matching
    supabase
      .from('neighborhoods')
      .select('id, name, city, country, region, is_combo, is_community')
      .eq('is_active', true)
      .neq('region', 'test')
      .order('name'),
  ]);

  const columnResults = [headlineResult, previewResult, bodyResult];
  if (columnResults.every(r => r.error)) {
    console.error('Search error:', headlineResult.error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
  for (const r of columnResults) if (r.error) console.error('Search column error:', r.error.message);

  // Merge: headline matches first, then dedupe by id, newest first, cap at limit
  const seen = new Set<string>();
  const merged: any[] = [];
  for (const r of columnResults) {
    for (const a of (r.data || []) as any[]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      merged.push(a);
    }
  }
  const headlineIds = new Set(((headlineResult.data || []) as any[]).map(a => a.id));
  merged.sort((a, b) => {
    const ah = headlineIds.has(a.id) ? 1 : 0, bh = headlineIds.has(b.id) ? 1 : 0;
    if (ah !== bh) return bh - ah;
    return String(b.published_at || b.created_at || '').localeCompare(String(a.published_at || a.created_at || ''));
  });
  const articlesResult = { data: merged.slice(0, limit) };

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

  // Fuzzy neighborhood search using resolveSearchQuery (handles typos like "auk" -> "Auckland")
  const allNeighborhoods = neighborhoodsResult.data || [];
  const searchResults = resolveSearchQuery(query, allNeighborhoods);
  const neighborhoods = searchResults.slice(0, 10).map((r) => {
    const n = r.item;
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
