import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PILOT_NEIGHBORHOOD_IDS } from '@/lib/generation-cadence';
import { isPlaceholderSourceName, isHttpUrl, type SourceRef } from '@/lib/source-links';
import {
  checkStorySource,
  contentHash,
  fetchPage,
  urlSha1,
  type CheckVerdict,
  type PageText,
} from '@/lib/source-check';

/**
 * Shadow run of the deterministic source check.
 *
 * For the latest enriched brief of every pilot edition, every story's source
 * page is fetched, reduced to text, and checked in code for the story's
 * figures, dates, times and names (src/lib/source-check.ts). Every page read
 * is archived to the private `source-snapshots` bucket, and one row per
 * (brief, story, source URL) goes to `story_source_checks`. No model is
 * called. Nothing that publishes is read from or written to: articles,
 * briefs and article_sources are untouched.
 *
 * A URL that appears only in the enrichment model's own JSON, in no search
 * tool's metadata (source.origin === 'model'), is recorded as
 * unverifiable_origin whatever the page says, because a model-written URL is
 * exactly what the pipeline must never rely on.
 *
 * Each edition also reports how its story sources were settled: stories by
 * origin (tool, story-match, name-match, repair, model, none) and how many
 * model-written URLs the enricher dropped (story.droppedModelUrl), read
 * straight from enriched_categories.
 *
 * Params: ?neighborhood=<id> (any edition, not only pilots), ?date=YYYY-MM-DD
 * (that brief_date; default: the latest enriched brief in the last 3 days).
 * Results: cron_executions.response_data (job 'shadow-source-checks').
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIME_BUDGET_MS = 240_000;
const CONCURRENCY = 6;
const BUCKET = 'source-snapshots';

interface RawStory {
  entity?: string;
  context?: string;
  source?: SourceRef | null;
  secondarySource?: SourceRef | null;
  /** A model-written URL the enricher removed (brief-enricher-gemini.ts). */
  droppedModelUrl?: string;
}

const ORIGIN_KEYS = ['tool', 'story-match', 'name-match', 'repair', 'model', 'no_url', 'no_source'] as const;
type OriginKey = (typeof ORIGIN_KEYS)[number];

/**
 * Per story, where its primary source's URL came from: a SourceOrigin, or
 * no_url (a publication named, no page), or no_source. A URL with no origin
 * stamp predates 2026-09-23 and counts as model.
 */
function originCounts(categories: unknown): Record<OriginKey | 'stories' | 'model_urls_dropped', number> {
  const out = { stories: 0, model_urls_dropped: 0 } as Record<OriginKey | 'stories' | 'model_urls_dropped', number>;
  for (const k of ORIGIN_KEYS) out[k] = 0;
  for (const { story } of storiesOf(categories)) {
    out.stories++;
    if (story.droppedModelUrl) out.model_urls_dropped++;
    const ref = story.source;
    let key: OriginKey;
    if (!ref || !ref.name || isPlaceholderSourceName(ref.name)) key = 'no_source';
    else if (!isHttpUrl(ref.url)) key = 'no_url';
    else key = (ref.origin && (ORIGIN_KEYS as readonly string[]).includes(ref.origin) ? ref.origin : 'model') as OriginKey;
    out[key]++;
  }
  return out;
}
interface RawCategory { name?: string; stories?: RawStory[] }

interface Task {
  briefId: string;
  editionId: string;
  briefDate: string;
  storyIndex: number;
  story: RawStory;
  ref: SourceRef | null;
  placeNames: string[];
}

interface Row {
  brief_id: string;
  neighborhood_id: string;
  brief_date: string;
  story_index: number;
  story_entity: string | null;
  source_name: string | null;
  source_url: string;
  source_origin: string | null;
  verdict: CheckVerdict;
  facts_total: number;
  facts_found: number;
  matched_facts: unknown;
  missing_facts: unknown;
  http_status: number | null;
  fetch_error: string | null;
  final_url: string | null;
  snapshot_html_path: string | null;
  snapshot_text_path: string | null;
  content_hash: string | null;
  fetched_at: string | null;
}

/**
 * Stories in reading order with the same indexes as flattenStories() in
 * edition-rules.ts (a story with neither entity nor context is skipped and
 * takes no index), keeping each source's recorded origin.
 */
function storiesOf(categories: unknown): Array<{ index: number; story: RawStory }> {
  if (!Array.isArray(categories)) return [];
  const out: Array<{ index: number; story: RawStory }> = [];
  for (const cat of categories as RawCategory[]) {
    for (const s of cat?.stories || []) {
      if (!(s?.entity || '').trim() && !(s?.context || '').trim()) continue;
      out.push({ index: out.length, story: s });
    }
  }
  return out;
}

const VERDICT_RANK: CheckVerdict[] = ['verified', 'partial', 'not_found', 'unverifiable_origin', 'fetch_failed', 'no_source'];

async function ensureBucket(admin: SupabaseClient): Promise<void> {
  const { error } = await admin.storage.getBucket(BUCKET);
  if (error) {
    await admin.storage.createBucket(BUCKET, { public: false }).then(null, () => undefined);
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  if (!cronHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const onlyEdition = url.searchParams.get('neighborhood');
  const onlyDate = url.searchParams.get('date');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const errors: string[] = [];
  const counters = { tasks: 0, skipped_already_checked: 0, pages_fetched: 0, snapshots_stored: 0, rows_written: 0, skipped_time_budget: false };
  let summary: Record<string, unknown> = {};
  let editions: Array<Record<string, unknown>> = [];

  try {
    const ids = onlyEdition ? [onlyEdition] : Array.from(PILOT_NEIGHBORHOOD_IDS);
    const { data: hoods, error: hoodErr } = await admin.from('neighborhoods').select('id, name, city').in('id', ids);
    if (hoodErr) throw new Error(`neighborhoods: ${hoodErr.message}`);
    const placeOf = new Map((hoods || []).map((h) => [h.id as string, [h.name as string, h.city as string].filter(Boolean)]));

    const since = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
    let q = admin
      .from('neighborhood_briefs')
      .select('id, neighborhood_id, brief_date, enriched_categories')
      .in('neighborhood_id', ids)
      .not('enriched_categories', 'is', null)
      .order('brief_date', { ascending: false });
    q = onlyDate ? q.eq('brief_date', onlyDate) : q.gte('brief_date', since);
    const { data: briefRows, error: briefErr } = await q;
    if (briefErr) throw new Error(`neighborhood_briefs: ${briefErr.message}`);

    // Latest enriched brief per edition.
    const latest = new Map<string, { id: string; neighborhood_id: string; brief_date: string; enriched_categories: unknown }>();
    for (const b of briefRows || []) if (!latest.has(b.neighborhood_id)) latest.set(b.neighborhood_id, b);
    const briefs = Array.from(latest.values());
    const briefIds = briefs.map((b) => b.id);

    // What has already been checked, so a rerun only does new work.
    const done = new Set<string>();
    if (briefIds.length > 0) {
      const { data: prior, error: priorErr } = await admin
        .from('story_source_checks')
        .select('brief_id, story_index, source_url')
        .in('brief_id', briefIds);
      if (priorErr) throw new Error(`story_source_checks: ${priorErr.message} (has the migration been run?)`);
      for (const r of prior || []) done.add(`${r.brief_id}:${r.story_index}:${r.source_url}`);
    }

    const tasks: Task[] = [];
    for (const b of briefs) {
      const placeNames = placeOf.get(b.neighborhood_id) || [];
      for (const { index, story } of storiesOf(b.enriched_categories)) {
        const refs = [story.source, story.secondarySource].filter(
          (r): r is SourceRef => !!r && !!r.name && !isPlaceholderSourceName(r.name),
        );
        const withUrl = refs.filter((r) => isHttpUrl(r.url));
        const base = { briefId: b.id, editionId: b.neighborhood_id, briefDate: b.brief_date, storyIndex: index, story, placeNames };
        if (withUrl.length === 0) {
          const key = `${b.id}:${index}:`;
          if (done.has(key)) { counters.skipped_already_checked++; continue; }
          tasks.push({ ...base, ref: refs[0] || null });
          continue;
        }
        for (const ref of withUrl) {
          const key = `${b.id}:${index}:${(ref.url as string).trim()}`;
          if (done.has(key)) { counters.skipped_already_checked++; continue; }
          tasks.push({ ...base, ref });
        }
      }
    }
    counters.tasks = tasks.length;

    if (tasks.some((t) => t.ref?.url)) await ensureBucket(admin);

    const pageCache = new Map<string, Promise<PageText>>();
    const snapshotCache = new Map<string, Promise<{ html: string | null; text: string | null; hash: string | null }>>();
    const rows: Row[] = [];

    const snapshot = (t: Task, pageUrl: string, page: PageText) => {
      const key = `${t.editionId}/${t.briefDate}/${urlSha1(pageUrl)}`;
      if (!snapshotCache.has(key)) {
        snapshotCache.set(key, (async () => {
          if (!page.ok || !page.html) return { html: null, text: null, hash: null };
          const isJson = /json/i.test(page.contentType || '');
          const htmlPath = `${key}.${isJson ? 'json' : 'html'}`;
          const textPath = `${key}.txt`;
          const [h, x] = await Promise.all([
            admin.storage.from(BUCKET).upload(htmlPath, new Blob([page.html], { type: isJson ? 'application/json' : 'text/html; charset=utf-8' }), { upsert: true }),
            admin.storage.from(BUCKET).upload(textPath, new Blob([page.text || ''], { type: 'text/plain; charset=utf-8' }), { upsert: true }),
          ]);
          if (h.error) errors.push(`snapshot ${htmlPath}: ${h.error.message}`);
          if (x.error) errors.push(`snapshot ${textPath}: ${x.error.message}`);
          if (!h.error) counters.snapshots_stored++;
          return { html: h.error ? null : htmlPath, text: x.error ? null : textPath, hash: contentHash(page.html) };
        })());
      }
      return snapshotCache.get(key)!;
    };

    const runTask = async (t: Task) => {
      const entity = (t.story.entity || '').trim() || null;
      const pageUrl = t.ref?.url ? t.ref.url.trim() : null;
      if (!pageUrl) {
        rows.push({
          brief_id: t.briefId, neighborhood_id: t.editionId, brief_date: t.briefDate, story_index: t.storyIndex,
          story_entity: entity, source_name: t.ref?.name || null, source_url: '', source_origin: null,
          verdict: 'no_source', facts_total: 0, facts_found: 0, matched_facts: null, missing_facts: null,
          http_status: null, fetch_error: null, final_url: null, snapshot_html_path: null, snapshot_text_path: null,
          content_hash: null, fetched_at: null,
        });
        return;
      }
      if (!pageCache.has(pageUrl)) {
        counters.pages_fetched++;
        pageCache.set(pageUrl, fetchPage(pageUrl));
      }
      const page = await pageCache.get(pageUrl)!;
      const fetchedAt = new Date().toISOString();
      const result = await checkStorySource(t.story, pageUrl, { placeNames: t.placeNames, page });
      const snap = await snapshot(t, pageUrl, page);
      const origin = t.ref?.origin || 'unknown';
      rows.push({
        brief_id: t.briefId, neighborhood_id: t.editionId, brief_date: t.briefDate, story_index: t.storyIndex,
        story_entity: entity, source_name: t.ref?.name || null, source_url: pageUrl, source_origin: origin,
        verdict: origin === 'model' ? 'unverifiable_origin' : result.verdict,
        facts_total: result.factsTotal, facts_found: result.factsFound,
        matched_facts: result.facts.filter((f) => f.found).map((f) => ({ kind: f.kind, text: f.text })),
        missing_facts: result.missing,
        http_status: page.status, fetch_error: page.ok ? null : page.error || null, final_url: page.finalUrl,
        snapshot_html_path: snap.html, snapshot_text_path: snap.text, content_hash: snap.hash, fetched_at: fetchedAt,
      });
    };

    // Bounded worker pool with a time budget; unstarted work waits for the next run.
    let next = 0;
    const worker = async () => {
      while (next < tasks.length) {
        if (Date.now() - startTime > TIME_BUDGET_MS) { counters.skipped_time_budget = true; return; }
        const t = tasks[next++];
        try { await runTask(t); } catch (err) {
          errors.push(`${t.editionId}#${t.storyIndex}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await admin
        .from('story_source_checks')
        .upsert(rows.slice(i, i + 100), { onConflict: 'brief_id,story_index,source_url', ignoreDuplicates: true });
      if (error) errors.push(`insert: ${error.message}`);
      else counters.rows_written += Math.min(100, rows.length - i);
    }

    // Summary over everything recorded for these briefs, this run and earlier.
    const all: Array<{ brief_id: string; neighborhood_id: string; story_index: number; source_url: string; verdict: CheckVerdict }> = [];
    if (briefIds.length > 0) {
      const { data, error } = await admin
        .from('story_source_checks')
        .select('brief_id, neighborhood_id, story_index, source_url, verdict')
        .in('brief_id', briefIds);
      if (error) errors.push(`summary read: ${error.message}`);
      all.push(...((data || []) as typeof all));
    }
    const byEdition = new Map<string, Map<string, CheckVerdict[]>>();
    for (const r of all) {
      const e = byEdition.get(r.neighborhood_id) || new Map<string, CheckVerdict[]>();
      const k = `${r.brief_id}:${r.story_index}`;
      e.set(k, [...(e.get(k) || []), r.verdict]);
      byEdition.set(r.neighborhood_id, e);
    }
    const tally = (stories: Map<string, CheckVerdict[]>) => {
      const t: Record<string, number> = { stories: stories.size, with_source: 0, verified: 0, partial: 0, not_found: 0, unverifiable_origin: 0, fetch_failed: 0, no_source: 0 };
      stories.forEach((vs) => {
        if (vs.some((v) => v !== 'no_source')) t.with_source++;
        const best = VERDICT_RANK.find((v) => vs.includes(v)) || 'no_source';
        t[best]++;
      });
      return t;
    };
    // Source settling per edition, from the stored stories themselves.
    const settling = new Map(briefs.map((b) => [b.neighborhood_id, originCounts(b.enriched_categories)]));
    const settlingTotal: Record<string, number> = {};
    settling.forEach((c) => { for (const [k, v] of Object.entries(c)) settlingTotal[k] = (settlingTotal[k] || 0) + v; });
    editions = Array.from(byEdition.entries())
      .map(([edition, stories]) => {
        const t = tally(stories);
        const s = settling.get(edition);
        return {
          edition,
          ...t,
          verified_share_pct: t.stories ? Math.round((t.verified / t.stories) * 100) : 0,
          ...(s ? { origins: Object.fromEntries(ORIGIN_KEYS.map((k) => [k, s[k]])), model_urls_dropped: s.model_urls_dropped } : {}),
        };
      })
      .sort((a, b) => String(a.edition).localeCompare(String(b.edition)));
    const everything = new Map<string, CheckVerdict[]>();
    byEdition.forEach((m, ed) => m.forEach((v, k) => everything.set(`${ed}:${k}`, v)));
    const total = tally(everything);
    summary = {
      editions_checked: briefs.length,
      date: onlyDate || 'latest',
      ...total,
      share_with_verified_source_pct: total.stories ? Math.round((total.verified / total.stories) * 100) : 0,
      share_with_any_source_pct: total.stories ? Math.round((total.with_source / total.stories) * 100) : 0,
      origins: Object.fromEntries(ORIGIN_KEYS.map((k) => [k, settlingTotal[k] || 0])),
      model_urls_dropped: settlingTotal.model_urls_dropped || 0,
      ...counters,
      note: 'Shadow only: nothing that publishes was read or changed. Verdicts are per story, best across its sources.',
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  await admin.from('cron_executions').insert({
    job_name: 'shadow-source-checks',
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    success: errors.length === 0,
    articles_created: 0,
    errors: errors.length ? errors.slice(0, 50) : null,
    response_data: { summary, editions },
  }).then(null, (e: Error) => console.error('[shadow-source-checks] log failed:', e.message));

  return NextResponse.json({ success: errors.length === 0, summary, editions, errors: errors.slice(0, 50), duration_ms: Date.now() - startTime });
}
