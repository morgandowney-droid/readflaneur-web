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

    // Step 1: Get ALL article IDs from last 48h (lightweight query)
    const { data: allArticleIds } = await supabase
      .from('articles')
      .select('id')
      .eq('status', 'published')
      .gte('published_at', cutoff)
      .not('body_text', 'is', null)
      .order('published_at', { ascending: false })
      .limit(1000);

    const articleIdList = (allArticleIds || []).map(a => a.id);

    // Phase 1: Translate articles
    for (const lang of PHASE1_LANGUAGES) {
      if (Date.now() - functionStart > TIME_BUDGET_MS * 0.6) break;
      if (quotaExhausted) break;

      // Step 2: Find which already have translations for this language
      const existingIds = new Set<string>();
      for (let i = 0; i < articleIdList.length; i += 100) {
        const chunk = articleIdList.slice(i, i + 100);
        const { data: existing } = await supabase
          .from('article_translations')
          .select('article_id')
          .eq('language_code', lang)
          .in('article_id', chunk);
        for (const e of existing || []) existingIds.add(e.article_id);
      }

      // Step 3: Get IDs that need translation (newest first, 30 per language per run)
      const needsIds = articleIdList.filter(id => !existingIds.has(id)).slice(0, 30);
      if (needsIds.length === 0) continue;

      // Step 4: Fetch full data only for articles that need translation
      const { data: articles } = await supabase
        .from('articles')
        .select('id, headline, body_text, preview_text')
        .in('id', needsIds);

      if (!articles || articles.length === 0) continue;

      // Process in batches of CONCURRENCY
      for (let i = 0; i < articles.length; i += CONCURRENCY) {
        if (Date.now() - functionStart > TIME_BUDGET_MS * 0.6) break;
        if (quotaExhausted) break;

        const batch = articles.slice(i, i + CONCURRENCY);
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

    // Step 1b: Get ALL enriched brief IDs from last 48h
    const { data: allBriefIds } = await supabase
      .from('neighborhood_briefs')
      .select('id')
      .not('enriched_content', 'is', null)
      .gte('generated_at', cutoff)
      .order('generated_at', { ascending: false })
      .limit(1000);

    const briefIdList = (allBriefIds || []).map(b => b.id);

    // Phase 2: Translate briefs (enriched only)
    for (const lang of PHASE1_LANGUAGES) {
      if (Date.now() - functionStart > TIME_BUDGET_MS) break;
      if (quotaExhausted) break;

      // Find which already have translations for this language
      const existingIds = new Set<string>();
      for (let i = 0; i < briefIdList.length; i += 100) {
        const chunk = briefIdList.slice(i, i + 100);
        const { data: existing } = await supabase
          .from('brief_translations')
          .select('brief_id')
          .eq('language_code', lang)
          .in('brief_id', chunk);
        for (const e of existing || []) existingIds.add(e.brief_id);
      }

      const needsIds = briefIdList.filter(id => !existingIds.has(id)).slice(0, 30);
      if (needsIds.length === 0) continue;

      const { data: briefs } = await supabase
        .from('neighborhood_briefs')
        .select('id, content, enriched_content')
        .in('id', needsIds);

      if (!briefs || briefs.length === 0) continue;

      for (let i = 0; i < briefs.length; i += CONCURRENCY) {
        if (Date.now() - functionStart > TIME_BUDGET_MS) break;
        if (quotaExhausted) break;

        const batch = briefs.slice(i, i + CONCURRENCY);
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
    // Log to cron_executions (must match schema used by other crons)
    await supabase.from('cron_executions').insert({
      job_name: 'translate-content',
      started_at: new Date(functionStart).toISOString(),
      completed_at: new Date().toISOString(),
      success: errors === 0 || (articlesTranslated + briefsTranslated) > 0,
      errors: errors > 0 ? [`${errors} translation errors`, ...(quotaExhausted ? ['Quota exhausted'] : [])] : null,
      response_data: {
        articles_translated: articlesTranslated,
        briefs_translated: briefsTranslated,
        errors,
        quota_exhausted: quotaExhausted,
        duration_ms: Date.now() - functionStart,
      },
    }).then(null, (e: unknown) => console.error('Failed to log cron execution:', e));
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
