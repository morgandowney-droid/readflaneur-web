import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PILOT_LANGUAGES } from '@/lib/generation-cadence';
import { translateArticle, translateBrief, type LanguageCode } from '@/lib/translation-service';

/**
 * Pre-warm translations for publisher pilot neighborhoods.
 *
 * Translation is lazy everywhere else (translate on first view, then cache),
 * which is right for a site nobody reads in German yet. A pilot is different:
 * a publisher opens the page in their own language, and the lazy path through
 * Qwen takes 40-55s on a 400-word brief, past the request limit, so the reader
 * sees English. This cron runs after the morning generation and translates
 * every recent pilot brief and article with Gemini Flash (~10s each) into the
 * pilot's language, using the same cache tables the lazy routes read, so the
 * page is already translated before anyone opens it.
 *
 * Schedule: after the European morning window. Idempotent: skips anything
 * already cached. ?force=true re-translates. ?neighborhood=id limits scope.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const LOOKBACK_HOURS = 48;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  if (!cronHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';
  const only = url.searchParams.get('neighborhood');

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const results = { articles_translated: 0, briefs_translated: 0, skipped: 0, failed: 0, errors: [] as string[] };
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();

  try {
    const pilots = Object.entries(PILOT_LANGUAGES).filter(([id]) => !only || id === only);

    for (const [neighborhoodId, lang] of pilots) {
      if (Date.now() - startTime > 240_000) { results.errors.push('time budget reached'); break; }

      // Articles: today's brief + Look Ahead (and anything else recent)
      const { data: articles } = await admin
        .from('articles')
        .select('id, headline, body_text, preview_text')
        .eq('neighborhood_id', neighborhoodId)
        .eq('status', 'published')
        .gte('published_at', since)
        .order('published_at', { ascending: false })
        .limit(6);

      for (const a of articles || []) {
        if (!force) {
          const { data: cached } = await admin.from('article_translations').select('article_id').eq('article_id', a.id).eq('language_code', lang).maybeSingle();
          if (cached) { results.skipped++; continue; }
        }
        const t = await translateArticle(a.headline, a.body_text || '', a.preview_text, lang as LanguageCode, 'gemini');
        if (!t) { results.failed++; results.errors.push(`article ${a.id}`); continue; }
        const { error } = await admin.from('article_translations').upsert(
          { article_id: a.id, language_code: lang, headline: t.headline, body: t.body, preview_text: t.preview_text, translated_at: new Date().toISOString() },
          { onConflict: 'article_id,language_code' },
        );
        if (error) { results.failed++; results.errors.push(`article ${a.id}: ${error.message}`); } else results.articles_translated++;
      }

      // Briefs: the neighborhood page renders the brief itself, not the article
      const { data: briefs } = await admin
        .from('neighborhood_briefs')
        .select('id, content, enriched_content')
        .eq('neighborhood_id', neighborhoodId)
        .gte('created_at', since)
        .not('enriched_content', 'is', null)
        .order('created_at', { ascending: false })
        .limit(3);

      for (const b of briefs || []) {
        if (!force) {
          const { data: cached } = await admin.from('brief_translations').select('brief_id').eq('brief_id', b.id).eq('language_code', lang).maybeSingle();
          if (cached) { results.skipped++; continue; }
        }
        const t = await translateBrief(b.content || '', b.enriched_content, lang as LanguageCode, 'gemini');
        if (!t) { results.failed++; results.errors.push(`brief ${b.id}`); continue; }
        const { error } = await admin.from('brief_translations').upsert(
          { brief_id: b.id, language_code: lang, content: t.content, enriched_content: t.enriched_content, translated_at: new Date().toISOString() },
          { onConflict: 'brief_id,language_code' },
        );
        if (error) { results.failed++; results.errors.push(`brief ${b.id}: ${error.message}`); } else results.briefs_translated++;
      }
    }
  } catch (err) {
    results.errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    await admin.from('cron_executions').insert({
      job_name: 'prewarm-pilot-translations',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      success: results.failed === 0 && results.errors.length === 0,
      articles_created: results.articles_translated + results.briefs_translated,
      errors: results.errors.length ? results.errors.slice(0, 10) : null,
      response_data: results,
    }).then(null, (e: Error) => console.error('[prewarm-pilot-translations] log failed:', e.message));
  }

  return NextResponse.json({ success: results.failed === 0, ...results, duration_ms: Date.now() - startTime });
}
