import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** GET /api/translations/brief?id={briefId}&lang={code}&neighborhoodId={optional}
 *  Returns cached brief translation or 404.
 *  When neighborhoodId is provided, also returns translated headline from the
 *  corresponding brief_summary article translation. */

/**
 * @swagger
 * /api/translations/brief:
 *   get:
 *     summary: Get a cached brief translation
 *     description: Returns a pre-translated brief in the requested language. Optionally includes translated headline from the corresponding article. No authentication required. Cached for 1 hour.
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                 enriched_content:
 *                   type: string
 *                 translated_at:
 *                   type: string
 *                   format: date-time
 *                 headline:
 *                   type: string
 *                   nullable: true
 *                   description: Translated headline from the corresponding brief_summary article (only when neighborhoodId provided)
 *       400:
 *         description: Missing id or lang, or lang is "en"
 *       404:
 *         description: Translation not available
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const briefId = url.searchParams.get('id');
  const lang = url.searchParams.get('lang');
  const neighborhoodId = url.searchParams.get('neighborhoodId');

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

  // If neighborhoodId provided, look up the translated headline from the
  // most recent brief_summary article for this neighborhood
  let headline: string | null = null;
  if (neighborhoodId) {
    const { data: article } = await supabase
      .from('articles')
      .select('id')
      .eq('neighborhood_id', neighborhoodId)
      .eq('article_type', 'brief_summary')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .single();

    if (article) {
      const { data: artTx } = await supabase
        .from('article_translations')
        .select('headline')
        .eq('article_id', article.id)
        .eq('language_code', lang)
        .single();

      if (artTx?.headline) {
        headline = artTx.headline;
      }
    }
  }

  return NextResponse.json({ ...data, headline }, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
