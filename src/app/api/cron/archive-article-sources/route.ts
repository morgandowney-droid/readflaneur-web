import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  archiveSourceRows,
  isArchivableSource,
  snapshotDate,
  supabaseArchiveStore,
  type ArchiveStats,
  type SourceRow,
} from '@/lib/source-archive';

/**
 * Catch-up for source archiving (src/lib/source-archive.ts).
 *
 * Every article insert path archives its sources after the response
 * (scheduleSourceArchive), with an 8s budget per article. Whatever that
 * skipped (a slow page, a function that ended first, an upload error) is
 * picked up here: article_sources rows from the last 48 hours on
 * brief_summary and look_ahead articles, for every edition including the
 * Irish counties, that have no copy (archived_at null) and no recorded
 * outcome (source_snapshot null).
 *
 * A page that still cannot be read on a row older than two hours is recorded
 * as 'unreadable: <reason>' so it stops being retried; a 404 or 410 is
 * recorded as dead on any attempt. Never changes an article or a source URL.
 *
 * Params: ?limit=N (rows per run, default 400), ?hours=N (lookback, default 48).
 * Schedule: every 30 minutes.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIME_BUDGET_MS = 240_000;
const ARTICLE_CONCURRENCY = 4;
const PER_ARTICLE_BUDGET_MS = 20_000;
const FINAL_ATTEMPT_AFTER_MS = 2 * 3600_000;
const ARTICLE_TYPES = ['brief_summary', 'look_ahead'];

interface JoinedRow {
  id: string;
  article_id: string;
  source_url: string | null;
  source_name: string | null;
  created_at: string;
  articles: {
    neighborhood_id: string;
    published_at: string | null;
    article_type: string;
    neighborhoods: { timezone: string | null } | Array<{ timezone: string | null }> | null;
  } | null;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  if (!cronHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 400, 1), 1000);
  const hours = Math.min(Math.max(Number(url.searchParams.get('hours')) || 48, 1), 24 * 14);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const errors: string[] = [];
  const totals = { candidates: 0, articles: 0, rows: 0, skipped: 0, reused: 0, fetched: 0, archived: 0, dead: 0, unreadable: 0, deferred: 0, articles_not_reached: 0 };

  try {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const { data, error } = await admin
      .from('article_sources')
      .select('id, article_id, source_url, source_name, created_at, articles!inner(neighborhood_id, published_at, article_type, neighborhoods(timezone))')
      .is('archived_at', null)
      .is('source_snapshot', null)
      .not('source_url', 'is', null)
      .gte('created_at', since)
      .in('articles.article_type', ARTICLE_TYPES)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw new Error(`article_sources: ${error.message}`);

    const rows = ((data || []) as unknown as JoinedRow[]).filter((r) => r.articles);
    totals.candidates = rows.length;

    // Rows that will never be archived (a search page, a placeholder) get an
    // outcome now so they drop out of the queue.
    const store = supabaseArchiveStore(admin);
    const unarchivable = rows.filter((r) => !isArchivableSource(r));
    for (const r of unarchivable) {
      const err = await store.updateRow(r.id, { source_snapshot: 'skipped: not an archivable page' });
      if (err) errors.push(`skip ${r.id}: ${err}`);
    }
    totals.skipped += unarchivable.length;

    // One job per article: its edition and publish date decide the folder.
    const byArticle = new Map<string, JoinedRow[]>();
    for (const r of rows) {
      if (!isArchivableSource(r)) continue;
      byArticle.set(r.article_id, [...(byArticle.get(r.article_id) || []), r]);
    }
    const jobs = [...byArticle.values()];
    totals.articles = jobs.length;

    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        if (Date.now() - startTime > TIME_BUDGET_MS) return;
        const group = jobs[next++];
        const a = group[0].articles!;
        const hood = Array.isArray(a.neighborhoods) ? a.neighborhoods[0] : a.neighborhoods;
        const oldest = Math.min(...group.map((r) => Date.parse(r.created_at) || Date.now()));
        let stats: ArchiveStats;
        try {
          stats = await archiveSourceRows(
            group.map((r): SourceRow => ({ id: r.id, source_url: r.source_url, source_name: r.source_name })),
            { neighborhoodId: a.neighborhood_id, date: snapshotDate(a.published_at, hood?.timezone) },
            store,
            { budgetMs: PER_ARTICLE_BUDGET_MS, finalAttempt: Date.now() - oldest > FINAL_ATTEMPT_AFTER_MS },
          );
        } catch (e) {
          errors.push(`${group[0].article_id}: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }
        totals.rows += stats.rows;
        totals.skipped += stats.skipped;
        totals.reused += stats.reused;
        totals.fetched += stats.fetched;
        totals.archived += stats.archived;
        totals.dead += stats.dead;
        totals.unreadable += stats.unreadable;
        totals.deferred += stats.deferred;
        errors.push(...stats.errors.slice(0, 3));
      }
    };
    await Promise.all(Array.from({ length: ARTICLE_CONCURRENCY }, worker));
    totals.articles_not_reached = Math.max(0, jobs.length - next);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  await admin.from('cron_executions').insert({
    job_name: 'archive-article-sources',
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    success: errors.length === 0,
    articles_created: 0,
    errors: errors.length ? errors.slice(0, 50) : null,
    response_data: { ...totals, hours, limit },
  }).then(null, (e: Error) => console.error('[archive-article-sources] log failed:', e.message));

  return NextResponse.json({ success: errors.length === 0, ...totals, errors: errors.slice(0, 50), duration_ms: Date.now() - startTime });
}
