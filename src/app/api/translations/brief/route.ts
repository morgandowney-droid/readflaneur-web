import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** GET /api/translations/brief?id={briefId}&lang={code}
 *  Returns cached brief translation or 404. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const briefId = url.searchParams.get('id');
  const lang = url.searchParams.get('lang');

  if (!briefId || !lang) {
    return NextResponse.json({ error: 'Missing id or lang' }, { status: 400 });
  }

  if (lang === 'en') {
    return NextResponse.json({ error: 'English is the original language' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('brief_translations')
    .select('content, enriched_content, translated_at')
    .eq('brief_id', briefId)
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
