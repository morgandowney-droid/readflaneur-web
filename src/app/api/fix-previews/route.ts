import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();

  // Find ALL published articles and fix any with missing/short preview_text
  const { data: articles, error: fetchError } = await supabase
    .from('articles')
    .select('id, body_text, preview_text')
    .eq('status', 'published');

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!articles || articles.length === 0) {
    return NextResponse.json({ message: 'No articles need fixing', fixed: 0 });
  }

  // Update articles that have no preview or very short preview
  let fixed = 0;
  for (const article of articles) {
    if (!article.body_text) continue;

    // Skip if preview already exists and is decent length
    if (article.preview_text && article.preview_text.length > 50) continue;

    // Extract first 150 chars as preview, ending at word boundary
    let preview = article.body_text.substring(0, 200);
    const lastSpace = preview.lastIndexOf(' ');
    if (lastSpace > 100) {
      preview = preview.substring(0, lastSpace);
    }
    preview = preview.trim() + '...';

    const { error: updateError } = await supabase
      .from('articles')
      .update({ preview_text: preview })
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
