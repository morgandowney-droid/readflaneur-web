import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/reactions/saved?anonymousId=...&type=bookmark
 * Returns articles the user has reacted to
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const anonymousId = searchParams.get('anonymousId');
  const reactionType = searchParams.get('type') || 'bookmark';

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;

  if (!userId && !anonymousId) {
    return NextResponse.json({ articles: [] });
  }

  let query = supabase
    .from('article_reactions')
    .select(`
      reaction_type,
      created_at,
      article:articles(id, headline, preview_text, slug, neighborhood_id, image_url, created_at,
        neighborhood:neighborhoods(name, city)
      )
    `)
    .eq('reaction_type', reactionType)
    .order('created_at', { ascending: false })
    .limit(50);

  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('anonymous_id', anonymousId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const articles = (data || [])
    .filter((r: any) => r.article)
    .map((r: any) => r.article);

  return NextResponse.json({ articles });
}
