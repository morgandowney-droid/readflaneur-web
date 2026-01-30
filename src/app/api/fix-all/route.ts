import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();

  // Get ALL published articles
  const { data: articles, error: fetchError } = await supabase
    .from('articles')
    .select('id, headline, body_text, preview_text, published_at, created_at')
    .eq('status', 'published');

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  let fixedDates = 0;
  let fixedPreviews = 0;
  const errors: string[] = [];

  for (const article of articles || []) {
    const updates: any = {};

    // Fix missing published_at
    if (!article.published_at && article.created_at) {
      updates.published_at = article.created_at;
    }

    // Fix missing preview_text
    if ((!article.preview_text || article.preview_text.length < 20) && article.body_text) {
      let preview = article.body_text.substring(0, 200);
      const lastSpace = preview.lastIndexOf(' ');
      if (lastSpace > 100) {
        preview = preview.substring(0, lastSpace);
      }
      updates.preview_text = preview.trim() + '...';
    }

    // Only update if there are changes
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('articles')
        .update(updates)
        .eq('id', article.id);

      if (updateError) {
        errors.push(`${article.headline}: ${updateError.message}`);
      } else {
        if (updates.published_at) fixedDates++;
        if (updates.preview_text) fixedPreviews++;
      }
    }
  }

  return NextResponse.json({
    message: 'Fix complete',
    totalArticles: articles?.length || 0,
    fixedDates,
    fixedPreviews,
    errors: errors.slice(0, 5), // First 5 errors only
  });
}
