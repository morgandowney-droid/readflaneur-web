import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PILOT_NEIGHBORHOOD_IDS } from '@/lib/generation-cadence';
import { flattenStories, hostOf, recordCountryFor } from '@/lib/edition-rules';
import {
  decideStandard,
  evaluateBrief,
  needsSecondSource,
  tallyStandard,
  type CheckedSource,
  type StandardStoryRow,
  type StoredCheckRow,
} from '@/lib/source-standard';
import { findSecondSources, SECOND_MAX_STORIES, type SecondSourceTarget } from '@/lib/second-source';
import { geminiSecondSourceSearch } from '@/lib/source-repair-search';
import { snapshotKey, SNAPSHOT_BUCKET } from '@/lib/source-archive';

/**
 * Shadow run of the TIERED sourcing standard (src/lib/source-standard.ts).
 *
 * Reads what shadow-source-checks (08:30 UTC) recorded for the latest
 * enriched brief of every pilot edition and asks, per story: is it HIGH or
 * LOW stakes (classified in code, plus the editor desk's stored flag when it
 * exists), which of its sources were confirmed by fetching the page, and
 * does it meet the standard (LOW: one confirmed source of an acceptable kind;
 * HIGH: two independent confirmed sources, or one official source or
 * newspaper of record).
 *
 * For a HIGH story with exactly one confirmed source, one batched
 * second-source search per brief (max four stories, grounding pages only,
 * fetched and fact-checked in code) records whether a second source exists.
 * A brief searched on an earlier run is not searched again.
 *
 * Nothing that publishes is read from or written to. Writes
 * story_source_standard (migration 20260924150000, run it first),
 * the second-source page snapshots in the private source-snapshots bucket,
 * cron_executions and ai_usage_events (operation shadow_second_source).
 *
 * Params: ?neighborhood=<id>, ?date=YYYY-MM-DD, ?search=0 (no second-source search).
 * Schedule: 09:00 UTC, after shadow-source-checks.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const TIME_BUDGET_MS = 230_000;
const SEARCH_CONCURRENCY = 3;

interface BriefRow {
  id: string;
  neighborhood_id: string;
  brief_date: string;
  enriched_categories: unknown;
  story_flags: { stories?: Array<{ index: number; sensitive?: boolean; reasons?: string[] }> } | null;
}

interface PriorRow {
  brief_id: string;
  story_index: number;
  second_tried: boolean;
  second_found: boolean;
  second_url: string | null;
  second_verdict: string | null;
  second_snapshot_path: string | null;
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
  const allowSearch = url.searchParams.get('search') !== '0';
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const errors: string[] = [];
  const counters = { briefs: 0, briefs_unchecked: 0, stories_unchecked: 0, searches: 0, second_tried: 0, second_found: 0, second_reused: 0, rows_written: 0, skipped_time_budget: false };
  let summary: Record<string, unknown> = {};
  let editions: Array<Record<string, unknown>> = [];

  try {
    const ids = onlyEdition ? [onlyEdition] : Array.from(PILOT_NEIGHBORHOOD_IDS);
    const { data: hoods, error: hoodErr } = await admin.from('neighborhoods').select('id, name, city, country').in('id', ids);
    if (hoodErr) throw new Error(`neighborhoods: ${hoodErr.message}`);
    const hoodOf = new Map((hoods || []).map((h) => [h.id as string, h as { id: string; name: string; city: string; country: string }]));

    const since = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
    let q = admin
      .from('neighborhood_briefs')
      .select('id, neighborhood_id, brief_date, enriched_categories, story_flags')
      .in('neighborhood_id', ids)
      .not('enriched_categories', 'is', null)
      .order('brief_date', { ascending: false });
    q = onlyDate ? q.eq('brief_date', onlyDate) : q.gte('brief_date', since);
    const { data: briefRows, error: briefErr } = await q;
    if (briefErr) throw new Error(`neighborhood_briefs: ${briefErr.message}`);
    const latest = new Map<string, BriefRow>();
    for (const b of (briefRows || []) as BriefRow[]) if (!latest.has(b.neighborhood_id)) latest.set(b.neighborhood_id, b);
    const briefs = Array.from(latest.values());
    const briefIds = briefs.map((b) => b.id);
    counters.briefs = briefs.length;

    const checkRows: Array<StoredCheckRow & { brief_id: string }> = [];
    const prior = new Map<string, PriorRow>();
    if (briefIds.length > 0) {
      const { data, error } = await admin
        .from('story_source_checks')
        .select('brief_id, story_index, source_name, source_url, source_origin, verdict, matched_facts')
        .in('brief_id', briefIds);
      if (error) throw new Error(`story_source_checks: ${error.message}`);
      checkRows.push(...((data || []) as typeof checkRows));
      const { data: p, error: pErr } = await admin
        .from('story_source_standard')
        .select('brief_id, story_index, second_tried, second_found, second_url, second_verdict, second_snapshot_path')
        .in('brief_id', briefIds);
      if (pErr) errors.push(`story_source_standard read: ${pErr.message} (has migration 20260924150000 been run?)`);
      for (const r of (p || []) as PriorRow[]) prior.set(`${r.brief_id}:${r.story_index}`, r);
    }

    // First pass: the standard from the stored checks.
    const perBrief = briefs.map((b) => {
      const hood = hoodOf.get(b.neighborhood_id);
      const recordCountry = recordCountryFor(hood?.country);
      const stories = flattenStories(b.enriched_categories).map((s) => ({ index: s.index, entity: s.entity, context: s.context, category: s.category }));
      const rows = checkRows.filter((r) => r.brief_id === b.id);
      const decisions = evaluateBrief(stories, rows, { flags: b.story_flags?.stories || null, recordCountry });
      if (rows.length === 0) counters.briefs_unchecked++;
      return { brief: b, hood, recordCountry, decisions };
    });

    // Second pass: one batched second-source search per brief, HIGH stories only.
    const secondByKey = new Map<string, { tried: boolean; found: boolean; url: string | null; verdict: string | null; snapshot: string | null; check: CheckedSource | null }>();
    const searchJobs: Array<() => Promise<void>> = [];
    for (const pb of perBrief) {
      const needing = pb.decisions.filter((d) => d.checked && needsSecondSource(d.decision));
      const fresh: SecondSourceTarget[] = [];
      for (const d of needing) {
        const key = `${pb.brief.id}:${d.index}`;
        const p = prior.get(key);
        if (p?.second_tried) {
          counters.second_reused++;
          secondByKey.set(key, {
            tried: true, found: p.second_found, url: p.second_url, verdict: p.second_verdict, snapshot: p.second_snapshot_path,
            check: p.second_found && p.second_url
              ? { name: hostOf(p.second_url), url: p.second_url, origin: 'second-search', verdict: p.second_verdict === 'verified' ? 'verified' : 'partial', matched: [{ kind: 'entity' }] }
              : null,
          });
          continue;
        }
        const first = d.decision.confirmed[0];
        fresh.push({
          key,
          entity: d.entity,
          context: d.context,
          firstPublication: d.checks.find((c) => c.url === first?.url)?.name || hostOf(first?.url) || 'a local site',
          existingUrls: d.checks.map((c) => c.url),
        });
      }
      if (!allowSearch || fresh.length === 0 || !pb.hood) continue;
      const hood = pb.hood;
      searchJobs.push(async () => {
        const place = `${hood.name}, ${hood.city}`;
        counters.searches++;
        const res = await findSecondSources(fresh, {
          search: geminiSecondSourceSearch({ place, label: hood.id }),
          placeNames: [hood.name, hood.city],
          maxStories: SECOND_MAX_STORIES,
        });
        for (const o of res.outcomes) {
          const tried = o.verdict !== 'not_tried';
          if (tried) counters.second_tried++;
          let snapshot: string | null = null;
          if (o.found && o.url && o.page?.html) {
            counters.second_found++;
            const k = snapshotKey(hood.id, pb.brief.brief_date, o.url);
            const isJson = /json/i.test(o.page.contentType || '');
            const rawPath = `${k}.${isJson ? 'json' : 'html'}`;
            const [h, x] = await Promise.all([
              admin.storage.from(SNAPSHOT_BUCKET).upload(rawPath, new Blob([o.page.html], { type: isJson ? 'application/json' : 'text/html; charset=utf-8' }), { upsert: true }),
              admin.storage.from(SNAPSHOT_BUCKET).upload(`${k}.txt`, new Blob([o.page.text || ''], { type: 'text/plain; charset=utf-8' }), { upsert: true }),
            ]);
            if (h.error || x.error) errors.push(`snapshot ${k}: ${(h.error || x.error)?.message}`);
            else snapshot = `${SNAPSHOT_BUCKET}/${rawPath}`;
          }
          secondByKey.set(o.key, {
            tried, found: o.found, url: o.url, verdict: o.verdict, snapshot,
            check: o.found && o.url
              ? { name: hostOf(o.url), url: o.url, origin: 'second-search', verdict: o.verdict as 'verified' | 'partial', matched: o.subjectFound ? [{ kind: 'entity' }] : [] }
              : null,
          });
        }
      });
    }
    let nextJob = 0;
    const worker = async () => {
      while (nextJob < searchJobs.length) {
        if (Date.now() - startTime > TIME_BUDGET_MS) { counters.skipped_time_budget = true; return; }
        const job = searchJobs[nextJob++];
        try { await job(); } catch (e) { errors.push(`second-source: ${e instanceof Error ? e.message : String(e)}`); }
      }
    };
    await Promise.all(Array.from({ length: SEARCH_CONCURRENCY }, worker));

    // Rows and tallies.
    const dbRows: Array<Record<string, unknown>> = [];
    const byEdition = new Map<string, StandardStoryRow[]>();
    const failureCounts: Record<string, number> = {};
    const reasonCounts: Record<string, number> = {};
    const basisCounts: Record<string, number> = {};
    for (const pb of perBrief) {
      const tallyRows: StandardStoryRow[] = [];
      for (const d of pb.decisions) {
        if (!d.checked) { counters.stories_unchecked++; continue; }
        const key = `${pb.brief.id}:${d.index}`;
        const second = secondByKey.get(key);
        const after = second?.check
          ? decideStandard({ entity: d.entity, context: d.context, flag: pb.brief.story_flags?.stories?.find((f) => f.index === d.index) || null }, [...d.checks, second.check], { recordCountry: pb.recordCountry })
          : d.decision;
        const row: StandardStoryRow = {
          stakes: d.decision.stakes,
          meets: d.decision.meets,
          second_tried: !!second?.tried,
          second_found: !!second?.found,
          meets_after_second: after.meets,
        };
        tallyRows.push(row);
        if (d.decision.failure) failureCounts[`${d.decision.stakes}:${d.decision.failure}`] = (failureCounts[`${d.decision.stakes}:${d.decision.failure}`] || 0) + 1;
        if (after.basis) basisCounts[after.basis] = (basisCounts[after.basis] || 0) + 1;
        for (const r of d.decision.reasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1;
        dbRows.push({
          brief_id: pb.brief.id,
          neighborhood_id: pb.brief.neighborhood_id,
          brief_date: pb.brief.brief_date,
          story_index: d.index,
          story_entity: d.entity || null,
          stakes: d.decision.stakes,
          stakes_reasons: d.decision.reasons,
          confirmed_sources: d.decision.confirmed,
          independent_count: d.decision.independentCount,
          meets: d.decision.meets,
          basis: d.decision.basis,
          failure: d.decision.failure,
          second_tried: row.second_tried,
          second_found: row.second_found,
          second_url: second?.url || null,
          second_verdict: second?.verdict || null,
          second_snapshot_path: second?.snapshot || null,
          meets_after_second: after.meets,
          checked_at: new Date().toISOString(),
        });
      }
      byEdition.set(pb.brief.neighborhood_id, tallyRows);
    }

    for (let i = 0; i < dbRows.length; i += 100) {
      const { error } = await admin.from('story_source_standard').upsert(dbRows.slice(i, i + 100), { onConflict: 'brief_id,story_index' });
      if (error) { errors.push(`write: ${error.message}`); break; }
      counters.rows_written += Math.min(100, dbRows.length - i);
    }

    editions = Array.from(byEdition.entries())
      .map(([edition, rows]) => ({ edition, ...tallyStandard(rows) }))
      .sort((a, b) => String(a.edition).localeCompare(String(b.edition)));
    const all = Array.from(byEdition.values()).flat();
    summary = {
      editions: briefs.length,
      date: onlyDate || 'latest',
      ...tallyStandard(all),
      failures: failureCounts,
      stakes_reasons: reasonCounts,
      basis_after_second: basisCounts,
      ...counters,
      note: 'Shadow only: nothing that publishes was read or changed. "cut" is how many stories the tiered standard would remove if it were switched on.',
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  await admin.from('cron_executions').insert({
    job_name: 'shadow-source-standard',
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    success: errors.length === 0,
    articles_created: 0,
    errors: errors.length ? errors.slice(0, 50) : null,
    response_data: { summary, editions },
  }).then(null, (e: Error) => console.error('[shadow-source-standard] log failed:', e.message));

  return NextResponse.json({ success: errors.length === 0, summary, editions, errors: errors.slice(0, 50), duration_ms: Date.now() - startTime });
}
