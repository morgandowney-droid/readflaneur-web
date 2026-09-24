/**
 * Archive every source at publish time.
 *
 * We tell publishers every story's source is archived. Until 2026-09-24 no
 * `article_sources` row had a snapshot: a source page that changed or went
 * away after publication left nothing to show what it had said. This module
 * fetches each source URL of an article once it is published and keeps a
 * copy in the private `source-snapshots` bucket:
 *
 *   <neighborhood_id>/<local date>/<sha1(url)>.html   raw HTML (or .json for an X post's public record)
 *   <neighborhood_id>/<local date>/<sha1(url)>.txt    the extracted text
 *
 * the same layout the shadow source check writes (shadow-source-checks), so a
 * page either path already stored that day is reused, not refetched. Then the
 * row records it:
 *
 *   archive_url      source-snapshots/<...>.html (private bucket object; sign on demand)
 *   source_snapshot  source-snapshots/<...>.txt, or 'dead: HTTP 404' / 'unreadable: <reason>'
 *   archived_at      when the copy was taken (null when there is no copy)
 *   source_url_dead  true on HTTP 404 or 410
 *
 * It never blocks or fails publishing: callers run it after the insert (via
 * source-archive-schedule.ts, which defers it past the response), each
 * article has a bounded time budget, every error is caught, and the
 * archive-article-sources cron picks up whatever was skipped.
 *
 * Only relative imports of pure modules plus a type import, so
 * scripts/test-source-standard.mjs can compile and test it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPage, urlSha1, type PageText } from './source-check';
import { isGroundingRedirect, isHttpUrl, isPlaceholderSourceName } from './source-links';

export const SNAPSHOT_BUCKET = 'source-snapshots';
export const ARCHIVE_BUDGET_MS = 8_000;
export const ARCHIVE_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 6_000;

export interface SourceRow {
  id: string;
  source_url: string | null;
  source_name?: string | null;
}

export interface ArchivePatch {
  archive_url?: string | null;
  source_snapshot?: string | null;
  archived_at?: string | null;
  source_url_dead?: boolean;
}

/** Storage IO, injectable so the path and idempotency logic can be tested without a bucket. */
export interface ArchiveStore {
  /** Object names (file names, no folder) already in a folder. */
  list(folder: string): Promise<Set<string>>;
  /** Returns an error message, or null on success. */
  upload(path: string, body: string, contentType: string): Promise<string | null>;
  /** Returns an error message, or null on success. */
  updateRow(id: string, patch: ArchivePatch): Promise<string | null>;
}

export interface ArchiveStats {
  rows: number;
  skipped: number;
  reused: number;
  fetched: number;
  archived: number;
  dead: number;
  unreadable: number;
  deferred: number;
  /** Why pages could not be read this time ("<status or error> <url>"), first 10. */
  unreadNotes: string[];
  errors: string[];
  ms: number;
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

/** The local calendar date of a publish time in the edition's timezone (YYYY-MM-DD). */
export function snapshotDate(publishedAt: string | Date | null | undefined, timezone?: string | null): string {
  const d = publishedAt ? new Date(publishedAt) : new Date();
  const when = Number.isNaN(d.getTime()) ? new Date() : d;
  try {
    return when.toLocaleDateString('en-CA', { timeZone: timezone || 'UTC' });
  } catch {
    return when.toISOString().slice(0, 10);
  }
}

/** Folder for an edition and day. */
export function snapshotFolder(neighborhoodId: string, date: string): string {
  return `${neighborhoodId}/${date}`;
}

/** Path without extension for one URL: <neighborhood_id>/<date>/<sha1(url)>. Same key as shadow-source-checks. */
export function snapshotKey(neighborhoodId: string, date: string, url: string): string {
  return `${snapshotFolder(neighborhoodId, date)}/${urlSha1(url.trim())}`;
}

/** A row worth archiving: an http URL that is not a search page, a grounding redirect or a placeholder. */
export function isArchivableSource(row: { source_url?: string | null; source_name?: string | null }): boolean {
  const url = row.source_url?.trim();
  if (!isHttpUrl(url)) return false;
  if (isGroundingRedirect(url)) return false;
  if (/^https?:\/\/(www\.)?google\.[a-z.]+\/(search|url)\b/i.test(url) || /google\.[a-z.]+\/search\?/i.test(url)) return false;
  if (row.source_name != null && isPlaceholderSourceName(row.source_name)) return false;
  return true;
}

export function isDeadStatus(status: number | null | undefined): boolean {
  return status === 404 || status === 410;
}

/**
 * The snapshot already stored for a key, if both files are there. The raw
 * copy may be .html or .json (an X post).
 */
export function existingSnapshot(names: Set<string>, key: string): { raw: string; text: string } | null {
  const base = key.slice(key.lastIndexOf('/') + 1);
  const folder = key.slice(0, key.lastIndexOf('/'));
  if (!names.has(`${base}.txt`)) return null;
  const raw = names.has(`${base}.html`) ? `${base}.html` : names.has(`${base}.json`) ? `${base}.json` : null;
  if (!raw) return null;
  return { raw: `${folder}/${raw}`, text: `${folder}/${base}.txt` };
}

/** What to write on the row for a stored copy. */
export function archivedPatch(rawPath: string, textPath: string, at: string): ArchivePatch {
  return {
    archive_url: `${SNAPSHOT_BUCKET}/${rawPath}`,
    source_snapshot: `${SNAPSHOT_BUCKET}/${textPath}`,
    archived_at: at,
    source_url_dead: false,
  };
}

/**
 * What to write when no copy could be taken. Dead (404/410) is final.
 * Anything else is left for the catch-up cron to retry, unless this is the
 * final attempt, when it is recorded so the row stops being retried.
 */
export function failurePatch(page: Pick<PageText, 'status' | 'error'> | null, finalAttempt: boolean): ArchivePatch | null {
  if (page && isDeadStatus(page.status)) {
    return { source_url_dead: true, source_snapshot: `dead: HTTP ${page.status}`, archived_at: null };
  }
  if (!finalAttempt) return null;
  const reason = (page?.error || (page?.status ? `HTTP ${page.status}` : 'no response')).slice(0, 200);
  return { source_snapshot: `unreadable: ${reason}`, archived_at: null };
}

// ─── Archiving ─────────────────────────────────────────────────────────────

/**
 * Snapshot a set of source rows belonging to one edition and day. Never
 * throws. Rows with the same URL share one fetch.
 */
export async function archiveSourceRows(
  rows: SourceRow[],
  ctx: { neighborhoodId: string; date: string },
  store: ArchiveStore,
  opts: {
    budgetMs?: number;
    concurrency?: number;
    /** Record an unreadable page as final (the catch-up cron's last try). */
    finalAttempt?: boolean;
    fetcher?: (url: string, timeoutMs: number) => Promise<PageText>;
    now?: () => Date;
  } = {},
): Promise<ArchiveStats> {
  const start = Date.now();
  const budget = opts.budgetMs ?? ARCHIVE_BUDGET_MS;
  const stats: ArchiveStats = { rows: rows.length, skipped: 0, reused: 0, fetched: 0, archived: 0, dead: 0, unreadable: 0, deferred: 0, unreadNotes: [], errors: [], ms: 0 };
  const now = () => (opts.now ? opts.now() : new Date()).toISOString();
  try {
    const byUrl = new Map<string, SourceRow[]>();
    for (const r of rows) {
      if (!isArchivableSource(r)) { stats.skipped++; continue; }
      const u = (r.source_url as string).trim();
      byUrl.set(u, [...(byUrl.get(u) || []), r]);
    }
    if (byUrl.size === 0) return stats;

    const folder = snapshotFolder(ctx.neighborhoodId, ctx.date);
    let existing = new Set<string>();
    try { existing = await store.list(folder); } catch (e) { stats.errors.push(`list ${folder}: ${msg(e)}`); }

    const apply = async (targets: SourceRow[], patch: ArchivePatch) => {
      for (const r of targets) {
        const err = await store.updateRow(r.id, patch).catch((e) => msg(e));
        if (err) stats.errors.push(`update ${r.id}: ${err}`);
      }
    };

    const urls = [...byUrl.keys()];
    const fetcher = opts.fetcher ?? ((u: string, t: number) => fetchPage(u, t));
    let next = 0;
    const worker = async () => {
      while (next < urls.length) {
        const url = urls[next++];
        const targets = byUrl.get(url) as SourceRow[];
        try {
          const key = snapshotKey(ctx.neighborhoodId, ctx.date, url);
          const have = existingSnapshot(existing, key);
          if (have) {
            stats.reused++;
            stats.archived += targets.length;
            await apply(targets, archivedPatch(have.raw, have.text, now()));
            continue;
          }
          const left = budget - (Date.now() - start);
          if (left < 1500) { stats.deferred += targets.length; continue; }
          stats.fetched++;
          const page = await fetcher(url, Math.min(FETCH_TIMEOUT_MS, left - 500));
          if (page.ok && page.html) {
            const isJson = /json/i.test(page.contentType || '');
            const rawPath = `${key}.${isJson ? 'json' : 'html'}`;
            const textPath = `${key}.txt`;
            const [e1, e2] = await Promise.all([
              store.upload(rawPath, page.html, isJson ? 'application/json' : 'text/html; charset=utf-8'),
              store.upload(textPath, page.text || '', 'text/plain; charset=utf-8'),
            ]);
            if (e1 || e2) {
              stats.errors.push(`upload ${key}: ${e1 || e2}`);
              stats.deferred += targets.length;
              continue;
            }
            existing.add(rawPath.slice(rawPath.lastIndexOf('/') + 1));
            existing.add(textPath.slice(textPath.lastIndexOf('/') + 1));
            stats.archived += targets.length;
            await apply(targets, archivedPatch(rawPath, textPath, now()));
            continue;
          }
          const patch = failurePatch(page, !!opts.finalAttempt);
          if (stats.unreadNotes.length < 10) stats.unreadNotes.push(`${page.status ?? page.error ?? 'no response'} ${url}`);
          if (!patch) { stats.deferred += targets.length; continue; }
          if (patch.source_url_dead) stats.dead += targets.length; else stats.unreadable += targets.length;
          await apply(targets, patch);
        } catch (e) {
          stats.errors.push(`${url}: ${msg(e)}`);
          stats.deferred += targets.length;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? ARCHIVE_CONCURRENCY, urls.length) }, worker));
  } catch (e) {
    stats.errors.push(msg(e));
  }
  stats.ms = Date.now() - start;
  return stats;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The Supabase-backed store: the private bucket plus article_sources. */
export function supabaseArchiveStore(admin: SupabaseClient): ArchiveStore {
  return {
    async list(folder) {
      const names = new Set<string>();
      const { data, error } = await admin.storage.from(SNAPSHOT_BUCKET).list(folder, { limit: 1000 });
      if (error) throw new Error(error.message);
      for (const o of data || []) names.add(o.name);
      return names;
    },
    async upload(path, body, contentType) {
      const { error } = await admin.storage.from(SNAPSHOT_BUCKET).upload(path, new Blob([body], { type: contentType }), { upsert: true, contentType });
      return error ? error.message : null;
    },
    async updateRow(id, patch) {
      const { error } = await admin.from('article_sources').update(patch).eq('id', id);
      return error ? error.message : null;
    },
  };
}

/**
 * Archive the sources of one article that have no copy yet. Loads the
 * article's edition, publish time and source rows itself, so a call site
 * only needs the article id. Never throws.
 */
export async function archiveArticleSources(
  admin: SupabaseClient,
  articleId: string,
  opts: { budgetMs?: number; finalAttempt?: boolean; store?: ArchiveStore } = {},
): Promise<ArchiveStats | null> {
  try {
    const { data: article, error: aErr } = await admin
      .from('articles')
      .select('id, neighborhood_id, published_at, neighborhoods(timezone)')
      .eq('id', articleId)
      .maybeSingle();
    if (aErr || !article) return null;
    const { data: rows, error: rErr } = await admin
      .from('article_sources')
      .select('id, source_url, source_name')
      .eq('article_id', articleId)
      .is('archived_at', null)
      .is('source_snapshot', null)
      .not('source_url', 'is', null);
    if (rErr || !rows || rows.length === 0) return null;
    const hood = (article as { neighborhoods?: { timezone?: string } | Array<{ timezone?: string }> | null }).neighborhoods;
    const timezone = Array.isArray(hood) ? hood[0]?.timezone : hood?.timezone;
    const stats = await archiveSourceRows(
      rows as SourceRow[],
      { neighborhoodId: article.neighborhood_id as string, date: snapshotDate(article.published_at as string, timezone) },
      opts.store ?? supabaseArchiveStore(admin),
      { budgetMs: opts.budgetMs, finalAttempt: opts.finalAttempt },
    );
    if (stats.errors.length) console.warn(`[source-archive] ${articleId}: ${stats.errors.slice(0, 3).join('; ')}`);
    return stats;
  } catch (e) {
    console.warn(`[source-archive] ${articleId} failed: ${msg(e)}`);
    return null;
  }
}
