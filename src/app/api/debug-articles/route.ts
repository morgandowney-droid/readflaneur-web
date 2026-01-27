import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const neighborhood = searchParams.get('neighborhood') || 'nyc-west-village';

  const supabase = await createClient();

  // Query exactly like the page does
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, headline, neighborhood_id, status, published_at, image_url')
    .eq('neighborhood_id', neighborhood)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(20);

  return NextResponse.json({
    neighborhood,
    error: error?.message || null,
    count: articles?.length || 0,
    articles: articles || [],
  });
}
