import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** GET /api/translations/article?id={articleId}&lang={code}
 *  Returns cached article translation or 404. */

/**
 * @swagger
 * /api/translations/article:
 *   get:
 *     summary: Get a cached article translation
 *     description: Returns a pre-translated article in the requested language. No authentication required. Cached for 1 hour.
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 headline:
 *                   type: string
 *                 body:
 *                   type: string
 *                 preview_text:
 *                   type: string
 *                 translated_at:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Missing id or lang, or lang is "en"
 *       404:
 *         description: Translation not available
 */
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
