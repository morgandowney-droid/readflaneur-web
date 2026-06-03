import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { translateArticle, type LanguageCode } from '@/lib/translation-service';

/** GET /api/translations/article?id={articleId}&lang={code}
 *  Returns a cached article translation, or translates on-demand (lazy) and
 *  caches it. Lazy translation means we only ever translate articles someone
 *  actually views in a non-English language, instead of pre-translating every
 *  article into 8 languages on a cron - the bulk of which is never read. */

export const runtime = 'nodejs';
export const maxDuration = 60; // first-view translation takes a few seconds

const SUPPORTED_LANGS: Set<string> = new Set(['sv', 'fr', 'de', 'es', 'pt', 'it', 'zh', 'ja']);
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' };

/**
 * @swagger
 * /api/translations/article:
 *   get:
 *     summary: Get an article translation (lazy)
 *     description: Returns the article in the requested language. Served from cache when available; otherwise translated on-demand and cached. No authentication required.
 *     tags:
 *       - Translations
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Article ID (UUID)
 *       - in: query
 *         name: lang
 *         required: true
 *         schema:
 *           type: string
 *           enum: [sv, fr, de, es, pt, it, zh, ja]
 *         description: Target language code (not "en")
 *     responses:
 *       200:
 *         description: Translated article content
 *       400:
 *         description: Missing id or lang, or unsupported lang
 *       404:
 *         description: Article not found or translation unavailable
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const articleId = url.searchParams.get('id');
  const lang = url.searchParams.get('lang');

  if (!articleId || !lang) {
    return NextResponse.json({ error: 'Missing id or lang' }, { status: 400 });
  }
  if (!SUPPORTED_LANGS.has(lang)) {
    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
  }

  const supabase = await createClient();

  // 1. Serve from cache if we already have this translation.
  const { data: cached } = await supabase
    .from('article_translations')
    .select('headline, body, preview_text, translated_at')
    .eq('article_id', articleId)
    .eq('language_code', lang)
    .maybeSingle();

  if (cached) {
    return NextResponse.json(cached, { headers: CACHE_HEADERS });
  }

  // 2. Cache miss: translate on-demand from the source article.
  const { data: article } = await supabase
    .from('articles')
    .select('headline, body_text, preview_text')
    .eq('id', articleId)
    .maybeSingle();

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  const translated = await translateArticle(
    article.headline,
    article.body_text || '',
    article.preview_text,
    lang as LanguageCode,
  );

  if (!translated) {
    // Translation failed (provider error) - client falls back to English.
    return NextResponse.json({ error: 'Translation unavailable' }, { status: 404 });
  }

  // 3. Cache it (service_role - RLS allows only service_role to write).
  // upsert + onConflict makes a concurrent request for the same article+lang a
  // harmless no-op instead of a unique-violation error.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const translated_at = new Date().toISOString();
  await admin
    .from('article_translations')
    .upsert(
      {
        article_id: articleId,
        language_code: lang,
        headline: translated.headline,
        body: translated.body,
        preview_text: translated.preview_text,
        translated_at,
      },
      { onConflict: 'article_id,language_code' },
    )
    .then(null, (err: Error) => console.error('[translations/article] cache write failed:', err.message));

  return NextResponse.json({ ...translated, translated_at }, { headers: CACHE_HEADERS });
}
