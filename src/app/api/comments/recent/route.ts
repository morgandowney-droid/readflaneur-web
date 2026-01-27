import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 20);

  const supabase = await createClient();

  const { data: comments, error } = await supabase
    .from('comments')
    .select(`
      id,
      content,
      author_name,
      created_at,
      article:articles(
        id,
        headline,
        slug,
        neighborhood:neighborhoods(
          name,
          city,
          slug
        )
      )
    `)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform the data to flatten article info
  const transformed = (comments || []).map((comment: any) => {
    const article = comment.article?.[0];
    const neighborhood = article?.neighborhood?.[0];

    // Build the article URL
    let articleUrl = '#';
    if (article && neighborhood) {
      const citySlug = neighborhood.city.toLowerCase().replace(/\s+/g, '-');
      const neighborhoodSlug = neighborhood.name.toLowerCase().replace(/\s+/g, '-');
      articleUrl = `/${citySlug}/${neighborhoodSlug}/${article.slug || article.id}`;
    }

    return {
      id: comment.id,
      content: comment.content,
      author_name: comment.author_name,
      created_at: comment.created_at,
      article_headline: article?.headline || 'Unknown article',
      article_url: articleUrl,
    };
  });

  return NextResponse.json({ comments: transformed });
}
