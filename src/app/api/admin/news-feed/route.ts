import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '1', 10);
    const category = searchParams.get('category') || null;
    const neighborhoodId = searchParams.get('neighborhood') || null;
    const sourceFilter = searchParams.get('source') || null; // 'rss', 'grok', 'gemini', or null

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    // Check authentication and admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Calculate time thresholds
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const filterDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Get all active neighborhoods
    const { data: allNeighborhoods } = await supabase
      .from('neighborhoods')
      .select('id, name, city, region')
      .eq('is_active', true)
      .eq('is_combo', false);

    if (!allNeighborhoods) {
      return NextResponse.json({ error: 'Failed to fetch neighborhoods' }, { status: 500 });
    }

    // Get article counts per neighborhood in last 24h (for stats)
    const { data: articlesLast24h } = await supabase
      .from('articles')
      .select('neighborhood_id, id')
      .eq('status', 'published')
      .gte('published_at', twentyFourHoursAgo.toISOString());

    // Group and count articles by neighborhood
    const countsByNeighborhood: Record<string, number> = {};
    if (articlesLast24h) {
      for (const a of articlesLast24h) {
        if (a.neighborhood_id) {
          countsByNeighborhood[a.neighborhood_id] = (countsByNeighborhood[a.neighborhood_id] || 0) + 1;
        }
      }
    }

    // Find neighborhoods with 0 content (last 24h)
    const neighborhoodsWithNoContent = allNeighborhoods
      .filter(n => !countsByNeighborhood[n.id])
      .map(n => ({ id: n.id, name: n.name, city: n.city }));

    // Find neighborhoods with >5 content (last 24h)
    const neighborhoodsOverwhelmed = allNeighborhoods
      .filter(n => countsByNeighborhood[n.id] > 5)
      .map(n => ({ id: n.id, name: n.name, city: n.city, count: countsByNeighborhood[n.id] }))
      .sort((a, b) => b.count - a.count);

    // Get all categories with counts
    const { data: categoryData } = await supabase
      .from('articles')
      .select('category_label')
      .eq('status', 'published')
      .gte('published_at', filterDate.toISOString())
      .not('category_label', 'is', null);

    const categoryCounts: Record<string, number> = {};
    if (categoryData) {
      for (const a of categoryData) {
        if (a.category_label) {
          categoryCounts[a.category_label] = (categoryCounts[a.category_label] || 0) + 1;
        }
      }
    }
    const categories = Object.entries(categoryCounts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    // Build articles query
    let articlesQuery = supabase
      .from('articles')
      .select(`
        id,
        headline,
        slug,
        category_label,
        published_at,
        ai_model,
        author_type,
        neighborhood:neighborhoods!articles_neighborhood_id_fkey(id, name, city, region)
      `)
      .eq('status', 'published')
      .gte('published_at', filterDate.toISOString())
      .order('published_at', { ascending: false })
      .limit(200);

    if (category) {
      articlesQuery = articlesQuery.eq('category_label', category);
    }
    if (neighborhoodId) {
      articlesQuery = articlesQuery.eq('neighborhood_id', neighborhoodId);
    }
    // Source filter: rss (Claude-processed RSS feeds), grok, gemini
    if (sourceFilter === 'rss') {
      // RSS articles are processed by Claude Sonnet and have 'News Brief' category
      articlesQuery = articlesQuery.eq('category_label', 'News Brief');
    } else if (sourceFilter === 'grok') {
      articlesQuery = articlesQuery.ilike('ai_model', 'grok%');
    } else if (sourceFilter === 'gemini') {
      articlesQuery = articlesQuery.ilike('ai_model', 'gemini%');
    }

    const { data: articles } = await articlesQuery;

    // Get stuck content (stale drafts/pending articles older than 24h)
    const { data: failedContent } = await supabase
      .from('articles')
      .select(`
        id,
        headline,
        status,
        created_at,
        editor_notes,
        neighborhood:neighborhoods!articles_neighborhood_id_fkey(name)
      `)
      .in('status', ['draft', 'pending'])
      .lt('created_at', twentyFourHoursAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({
      stats: {
        totalActiveNeighborhoods: allNeighborhoods.length,
        neighborhoodsWithNoContent,
        neighborhoodsOverwhelmed,
        totalArticles24h: articlesLast24h?.length || 0,
        categories,
      },
      articles: articles || [],
      failedContent: failedContent || [],
    });
  } catch (err) {
    console.error('Admin news-feed API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
