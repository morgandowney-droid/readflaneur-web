import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { translateArticle, translateBrief, type LanguageCode } from '@/lib/translation-service';
import { AI_MODELS } from '@/config/ai-models';

/**
 * Batch pre-translate articles and briefs into supported languages via Gemini Flash.
 *
 * Schedule: every 30 minutes
 * Demand-driven: only translates into languages with active users.
 * Processes content from last 48h that lacks translations.
 *
 * Time budget: 250s (leaves 50s for logging before 300s maxDuration).
 * Concurrency: 3 parallel Gemini calls.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIME_BUDGET_MS = 250_000;
const CONCURRENCY = 3;
const ALL_LANGUAGES: LanguageCode[] = ['sv', 'fr', 'de', 'es', 'pt', 'it', 'zh', 'ja'];

/** Rotate language order based on current half-hour so all languages get fair coverage */
function getRotatedLanguages(): LanguageCode[] {
  const halfHours = Math.floor(Date.now() / (30 * 60 * 1000));
  const offset = halfHours % ALL_LANGUAGES.length;
  return [...ALL_LANGUAGES.slice(offset), ...ALL_LANGUAGES.slice(0, offset)];
}

export async function GET(request: Request) {
  const functionStart = Date.now();
  const PHASE1_LANGUAGES = getRotatedLanguages();

  // Auth
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let articlesTranslated = 0;
  let briefsTranslated = 0;
  let errors = 0;
  let quotaExhausted = false;

  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Phase 1: Translate articles
    for (const lang of PHASE1_LANGUAGES) {
      if (Date.now() - functionStart > TIME_BUDGET_MS * 0.6) break;
      if (quotaExhausted) break;

      // Get articles from last 48h missing this language's translation
      const { data: articles } = await supabase
        .from('articles')
        .select('id, headline, body_text, preview_text')
        .eq('status', 'published')
        .gte('published_at', cutoff)
        .not('body_text', 'is', null)
        .order('published_at', { ascending: false })
        .limit(20);

      if (!articles || articles.length === 0) continue;

      // Check which already have translations
      const { data: existing } = await supabase
        .from('article_translations')
        .select('article_id')
        .eq('language_code', lang)
        .in('article_id', articles.map(a => a.id));

      const existingIds = new Set((existing || []).map(e => e.article_id));
      const needsTranslation = articles.filter(a => !existingIds.has(a.id));

      // Process in batches of CONCURRENCY
      for (let i = 0; i < needsTranslation.length; i += CONCURRENCY) {
        if (Date.now() - functionStart > TIME_BUDGET_MS * 0.6) break;
        if (quotaExhausted) break;

        const batch = needsTranslation.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (article) => {
            const translated = await translateArticle(
              article.headline,
              article.body_text,
              article.preview_text,
              lang
            );
            if (!translated) {
              errors++;
              return;
            }

            const { error: insertError } = await supabase
              .from('article_translations')
              .upsert({
                article_id: article.id,
                language_code: lang,
                headline: translated.headline,
                body: translated.body,
                preview_text: translated.preview_text,
                model: AI_MODELS.GEMINI_FLASH,
                translated_at: new Date().toISOString(),
              }, { onConflict: 'article_id,language_code' });

            if (insertError) {
              console.error(`Insert error for article ${article.id} (${lang}):`, insertError.message);
              errors++;
            } else {
              articlesTranslated++;
            }
          })
        );

        // Check for quota exhaustion
        for (const r of results) {
          if (r.status === 'rejected' && String(r.reason).includes('RESOURCE_EXHAUSTED')) {
            quotaExhausted = true;
            break;
          }
        }
      }
    }

    // Phase 2: Translate briefs (enriched only)
    for (const lang of PHASE1_LANGUAGES) {
      if (Date.now() - functionStart > TIME_BUDGET_MS) break;
      if (quotaExhausted) break;

      const { data: briefs } = await supabase
        .from('neighborhood_briefs')
        .select('id, content, enriched_content')
        .not('enriched_content', 'is', null)
        .gte('generated_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .order('generated_at', { ascending: false })
        .limit(20);

      if (!briefs || briefs.length === 0) continue;

      const { data: existing } = await supabase
        .from('brief_translations')
        .select('brief_id')
        .eq('language_code', lang)
        .in('brief_id', briefs.map(b => b.id));

      const existingIds = new Set((existing || []).map(e => e.brief_id));
      const needsTranslation = briefs.filter(b => !existingIds.has(b.id));

      for (let i = 0; i < needsTranslation.length; i += CONCURRENCY) {
        if (Date.now() - functionStart > TIME_BUDGET_MS) break;
        if (quotaExhausted) break;

        const batch = needsTranslation.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (brief) => {
            const translated = await translateBrief(
              brief.content,
              brief.enriched_content,
              lang
            );
            if (!translated) {
              errors++;
              return;
            }

            const { error: insertError } = await supabase
              .from('brief_translations')
              .upsert({
                brief_id: brief.id,
                language_code: lang,
                content: translated.content,
                enriched_content: translated.enriched_content,
                model: AI_MODELS.GEMINI_FLASH,
                translated_at: new Date().toISOString(),
              }, { onConflict: 'brief_id,language_code' });

            if (insertError) {
              console.error(`Insert error for brief ${brief.id} (${lang}):`, insertError.message);
              errors++;
            } else {
              briefsTranslated++;
            }
          })
        );

        for (const r of results) {
          if (r.status === 'rejected' && String(r.reason).includes('RESOURCE_EXHAUSTED')) {
            quotaExhausted = true;
            break;
          }
        }
      }
    }
  } catch (err) {
    console.error('translate-content cron error:', err);
    errors++;
  } finally {
    // Log to cron_executions
    const elapsed = Date.now() - functionStart;
    try {
      await supabase.from('cron_executions').insert({
        job_name: 'translate-content',
        status: errors > 0 ? 'partial' : 'success',
        started_at: new Date(functionStart).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: elapsed,
        items_processed: articlesTranslated + briefsTranslated,
        details: {
          articles_translated: articlesTranslated,
          briefs_translated: briefsTranslated,
          errors,
          quota_exhausted: quotaExhausted,
        },
      });
    } catch (logErr) {
      console.error('Failed to log cron execution:', logErr);
    }
  }

  return NextResponse.json({
    success: true,
    articles_translated: articlesTranslated,
    briefs_translated: briefsTranslated,
    errors,
    quota_exhausted: quotaExhausted,
    duration_ms: Date.now() - functionStart,
  });
}
