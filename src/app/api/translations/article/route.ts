import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** GET /api/translations/article?id={articleId}&lang={code}
 *  Returns cached article translation or 404. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const articleId = url.searchParams.get('id');
  const lang = url.searchParams.get('lang');

  if (!articleId || !lang) {
    return NextResponse.json({ error: 'Missing id or lang' }, { status: 400 });
  }

  if (lang === 'en') {
    return NextResponse.json({ error: 'English is the original language' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('article_translations')
    .select('headline, body, preview_text, translated_at')
    .eq('article_id', articleId)
    .eq('language_code', lang)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Translation not available' }, { status: 404 });
  }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
