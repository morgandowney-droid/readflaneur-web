import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { translateBrief, type LanguageCode } from '@/lib/translation-service';

/** GET /api/translations/brief?id={briefId}&lang={code}&neighborhoodId={optional}
 *  Returns a cached brief translation, or translates on-demand (lazy) and caches
 *  it. When neighborhoodId is provided, also returns the translated headline
 *  from the corresponding brief_summary article translation (best-effort). */

export const runtime = 'nodejs';
export const maxDuration = 60; // first-view translation takes a few seconds

const SUPPORTED_LANGS: Set<string> = new Set(['sv', 'fr', 'de', 'es', 'pt', 'it', 'zh', 'ja']);
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' };

/**
 * @swagger
 * /api/translations/brief:
 *   get:
 *     summary: Get a brief translation (lazy)
 *     description: Returns the brief in the requested language. Served from cache when available; otherwise translated on-demand and cached. Optionally includes the translated headline from the corresponding article. No authentication required.
 *     tags:
 *       - Translations
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Brief ID (UUID)
 *       - in: query
 *         name: lang
 *         required: true
 *         schema:
 *           type: string
 *           enum: [sv, fr, de, es, pt, it, zh, ja]
 *         description: Target language code (not "en")
 *       - in: query
 *         name: neighborhoodId
 *         required: false
 *         schema:
 *           type: string
 *         description: Neighborhood ID to also fetch the translated article headline
 *     responses:
 *       200:
 *         description: Translated brief content
 *       400:
 *         description: Missing id or lang, or unsupported lang
 *       404:
 *         description: Brief not found or translation unavailable
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const briefId = url.searchParams.get('id');
  const lang = url.searchParams.get('lang');
  const neighborhoodId = url.searchParams.get('neighborhoodId');

  if (!briefId || !lang) {
    return NextResponse.json({ error: 'Missing id or lang' }, { status: 400 });
  }
  if (!SUPPORTED_LANGS.has(lang)) {
    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
  }

  const supabase = await createClient();

  // Best-effort translated headline from the neighborhood's brief_summary
  // article translation (only returned if that translation already exists).
  const resolveHeadline = async (): Promise<string | null> => {
    if (!neighborhoodId) return null;
    const { data: article } = await supabase
      .from('articles')
      .select('id')
      .eq('neighborhood_id', neighborhoodId)
      .eq('article_type', 'brief_summary')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!article) return null;
    const { data: artTx } = await supabase
      .from('article_translations')
      .select('headline')
      .eq('article_id', article.id)
      .eq('language_code', lang)
      .maybeSingle();
    return artTx?.headline || null;
  };

  // 1. Serve from cache if present.
  const { data: cached } = await supabase
    .from('brief_translations')
    .select('content, enriched_content, translated_at')
    .eq('brief_id', briefId)
    .eq('language_code', lang)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({ ...cached, headline: await resolveHeadline() }, { headers: CACHE_HEADERS });
  }

  // 2. Cache miss: translate on-demand from the source brief.
  const { data: brief } = await supabase
    .from('neighborhood_briefs')
    .select('content, enriched_content')
    .eq('id', briefId)
    .maybeSingle();

  if (!brief) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
  }

  const translated = await translateBrief(
    brief.content || '',
    brief.enriched_content,
    lang as LanguageCode,
  );

  if (!translated) {
    return NextResponse.json({ error: 'Translation unavailable' }, { status: 404 });
  }

  // 3. Cache it (service_role write).
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const translated_at = new Date().toISOString();
  await admin
    .from('brief_translations')
    .upsert(
      {
        brief_id: briefId,
        language_code: lang,
        content: translated.content,
        enriched_content: translated.enriched_content,
        translated_at,
      },
      { onConflict: 'brief_id,language_code' },
    )
    .then(null, (err: Error) => console.error('[translations/brief] cache write failed:', err.message));

  return NextResponse.json(
    { ...translated, translated_at, headline: await resolveHeadline() },
    { headers: CACHE_HEADERS },
  );
}
