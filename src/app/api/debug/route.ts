import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const neighborhood = searchParams.get('neighborhood') || 'nyc-west-village';

  const supabase = await createClient();

  // Get top 10 articles with all relevant fields
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, headline, preview_text, published_at, created_at')
    .eq('status', 'published')
    .eq('neighborhood_id', neighborhood)
    .order('published_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    neighborhood,
    error: error?.message || null,
    articles: articles?.map(a => ({
      headline: a.headline?.substring(0, 40) + '...',
      hasPreview: !!a.preview_text,
      previewLength: a.preview_text?.length || 0,
      published_at: a.published_at,
      created_at: a.created_at,
    })) || [],
  });
}
