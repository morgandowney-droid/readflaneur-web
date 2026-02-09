import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  if (!query || query.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  const supabase = await createClient();

  // Search articles using Supabase text search
  // Using ilike for simple search - for production, consider adding a tsvector column
  const { data: articles, error } = await supabase
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
    .limit(limit);

  if (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  // Transform results with article URLs
  const results = (articles || []).map((article: any) => {
    // Supabase returns a single object for foreign key relations, not an array
    const neighborhood = Array.isArray(article.neighborhood)
      ? article.neighborhood[0]
      : article.neighborhood;
    let url = '#';

    if (neighborhood) {
      const citySlug = neighborhood.city.toLowerCase().replace(/\s+/g, '-');
      const neighborhoodSlug = neighborhood.id.split('-').slice(1).join('-');
      url = `/${citySlug}/${neighborhoodSlug}/${article.slug || article.id}`;
    }

    // Create excerpt with highlighted match
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

  return NextResponse.json({
    query,
    count: results.length,
    results
  });
}
