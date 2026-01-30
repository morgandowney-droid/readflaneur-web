import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();

  // Find ALL published articles and fix any with null published_at
  const { data: articles, error: fetchError } = await supabase
    .from('articles')
    .select('id, created_at, published_at')
    .eq('status', 'published');

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!articles || articles.length === 0) {
    return NextResponse.json({ message: 'No articles need fixing', fixed: 0 });
  }

  // Update articles that have no published_at
  let fixed = 0;
  for (const article of articles) {
    // Skip if already has published_at
    if (article.published_at) continue;

    const { error: updateError } = await supabase
      .from('articles')
      .update({ published_at: article.created_at })
      .eq('id', article.id);

    if (!updateError) {
      fixed++;
    }
  }

  return NextResponse.json({
    message: `Fixed ${fixed} articles`,
    fixed,
    total: articles.length,
  });
}

export async function GET() {
  return NextResponse.json({
    message: 'Send a POST request to fix missing published_at dates',
  });
}
