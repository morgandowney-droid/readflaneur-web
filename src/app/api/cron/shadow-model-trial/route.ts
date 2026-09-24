import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getActiveNeighborhoodIds } from '@/lib/active-neighborhoods';
import { isPriorityNeighborhood } from '@/lib/generation-cadence';
import {
  loadTrialInputs,
  runSearchTrial,
  runWriterTrial,
  TRIAL_DAILY_COST_CAP_USD,
  TRIAL_EDITION_IDS,
  TRIAL_SEARCH_MODEL,
  TRIAL_UNIT_RESERVE_USD,
  TRIAL_WRITER_MODEL,
  type TrialRunRow,
  type TrialStage,
} from '@/lib/model-trial';
import { compareRuns } from '@/lib/model-trial-metrics';

/**
 * Shadow model trial (src/lib/model-trial.ts).
 *
 * Replays each trial edition's stored inputs through a candidate model and
 * measures the result against what production published, on the numbers the
 * other shadows already use. Publishes nothing: the only writes are
 * model_trial_runs, this job's cron_executions row, and ai_usage_events rows
 * under operation trial_writer / trial_search.
 *
 *   ?stage=writer  gemini-3.8-flash rewrites the brief from production's
 *                  gathered facts and pages (all 12 editions; ~$0.01 each).
 *   ?stage=search  grok-4.5 runs production's Grok brief search, with a
 *                  same-time grok-4-1-fast control (about $0.45-0.65 a pair, so 4
 *                  editions a day in rotation, each edition every 3 days).
 *
 * Idempotent per (brief_date, edition, stage, model); a rerun only does what
 * is missing. A hard daily cap (TRIAL_DAILY_COST_CAP_USD, both stages
 * together, UTC day) stops new work once reached: a unit starts only if what
 * is spent, plus a reserve for every unit in flight, plus its own reserve,
 * stays under the cap. The cap bounds what starts; a unit that costs more
 * than its reserve can take the day slightly over it.
 *
 * Params: ?neighborhood=<id> (one edition, any), ?date=YYYY-MM-DD (brief_date),
 * ?limit=N (search editions this run), ?dry=1 (no writes of any kind; prints).
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

/** No new unit starts after this; a search pair can take over three minutes. */
const START_BUDGET_MS: Record<TrialStage, number> = { writer: 200_000, search: 60_000 };
/** A unit still running at this point is abandoned so the run can log. */
const HARD_STOP_MS = 270_000;
const CONCURRENCY: Record<TrialStage, number> = { writer: 4, search: 4 };
const SEARCH_EDITIONS_PER_DAY = 4;

/** Four of the twelve, rotating by UTC day, so every edition is searched every 3 days. */
function searchRotation(ids: readonly string[], perDay: number, now = new Date()): string[] {
  const day = Math.floor(now.getTime() / 86400_000);
  const start = (day * perDay) % ids.length;
  return Array.from({ length: Math.min(perDay, ids.length) }, (_, i) => ids[(start + i) % ids.length]);
}

/** What the trial has spent today (UTC), both stages, candidate and control. */
async function spentToday(admin: SupabaseClient): Promise<number> {
  const since = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
  const { data, error } = await admin
    .from('model_trial_runs')
    .select('stage, cost_usd, baseline_metrics')
    .gte('created_at', since);
  if (error) throw new Error(`model_trial_runs: ${error.message} (has the migration been run?)`);
  return (data || []).reduce((n, r) => {
    const control = r.stage === 'search' ? Number((r.baseline_metrics as { cost_usd?: number } | null)?.cost_usd || 0) : 0;
    return n + Number(r.cost_usd || 0) + control;
  }, 0);
}

function unitCost(row: TrialRunRow): number {
  const control = row.stage === 'search' ? Number((row.baseline_metrics as { cost_usd?: number | null } | null)?.cost_usd || 0) : 0;
  return Number(row.cost_usd || 0) + control;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  if (!cronHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  // vercel.json passes ?stage=; if a scheduler ever drops the query string,
  // the 09:45 slot is the search pass and every other slot the writer.
  const stageParam = url.searchParams.get('stage');
  const now = new Date();
  const stage: TrialStage = stageParam
    ? (stageParam === 'search' ? 'search' : 'writer')
    : (now.getUTCHours() === 9 && now.getUTCMinutes() >= 40 ? 'search' : 'writer');
  const onlyEdition = url.searchParams.get('neighborhood');
  const onlyDate = url.searchParams.get('date');
  const dry = url.searchParams.get('dry') === '1';
  const limit = Number(url.searchParams.get('limit')) || SEARCH_EDITIONS_PER_DAY;
  const model = stage === 'writer' ? TRIAL_WRITER_MODEL : TRIAL_SEARCH_MODEL;

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const errors: string[] = [];
  const counters = {
    editions_considered: 0,
    units_run: 0,
    skipped_existing: 0,
    skipped_cost_cap: 0,
    skipped_time_budget: 0,
    abandoned_at_hard_stop: 0,
    unit_errors: 0,
    rows_written: 0,
  };
  const rows: TrialRunRow[] = [];
  let spent = 0;
  let summary: Record<string, unknown> = {};

  try {
    const ids = onlyEdition
      ? [onlyEdition]
      : stage === 'search'
        ? searchRotation(TRIAL_EDITION_IDS, limit)
        : [...TRIAL_EDITION_IDS];
    const inputs = await loadTrialInputs(admin, ids, { date: onlyDate });
    counters.editions_considered = inputs.length;

    spent = dry ? 0 : await spentToday(admin);

    // Idempotency: skip what already has a row for this brief date.
    const done = new Set<string>();
    if (!dry && inputs.length > 0) {
      const { data: prior, error } = await admin
        .from('model_trial_runs')
        .select('run_date, neighborhood_id')
        .eq('stage', stage)
        .eq('model', model)
        .in('run_date', Array.from(new Set(inputs.map((i) => i.brief.brief_date))));
      if (error) throw new Error(`model_trial_runs: ${error.message}`);
      for (const r of prior || []) done.add(`${r.run_date}:${r.neighborhood_id}`);
    }
    const todo = inputs.filter((i) => {
      if (done.has(`${i.brief.brief_date}:${i.edition.id}`)) { counters.skipped_existing++; return false; }
      return true;
    });

    const subscribed = stage === 'writer' ? await getActiveNeighborhoodIds(admin) : new Set<string>();
    const reserve = TRIAL_UNIT_RESERVE_USD[stage];
    let committed = 0; // reserved for units in flight

    const write = async (row: TrialRunRow) => {
      if (dry) return;
      const { error } = await admin
        .from('model_trial_runs')
        .upsert(row, { onConflict: 'run_date,neighborhood_id,stage,model', ignoreDuplicates: true });
      if (error) errors.push(`insert ${row.neighborhood_id}: ${error.message}`);
      else counters.rows_written++;
    };

    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        if (Date.now() - startTime > START_BUDGET_MS[stage]) { counters.skipped_time_budget += todo.length - next; next = todo.length; return; }
        if (spent + committed + reserve > TRIAL_DAILY_COST_CAP_USD) { counters.skipped_cost_cap++; next++; continue; }
        const { edition, brief } = todo[next++];
        committed += reserve;
        try {
          const unit = stage === 'writer'
            ? runWriterTrial(admin, edition, brief, {
                isPriority: isPriorityNeighborhood(edition.id, subscribed.has(edition.id)),
                suppressWrite: dry,
              })
            : runSearchTrial(admin, edition, brief, { suppressWrite: dry });
          const remaining = HARD_STOP_MS - (Date.now() - startTime);
          const row = await Promise.race([
            unit,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(0, remaining))),
          ]);
          if (!row) { counters.abandoned_at_hard_stop++; continue; }
          counters.units_run++;
          if (row.error) { counters.unit_errors++; errors.push(`${edition.id}: ${row.error.slice(0, 200)}`); }
          spent += unitCost(row);
          rows.push(row);
          await write(row);
        } catch (err) {
          counters.unit_errors++;
          errors.push(`${edition.id}: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          committed -= reserve;
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY[stage] }, worker));

    // Candidate vs production means, over every row of this stage for the
    // brief dates this run touched (earlier runs included).
    let compared: Array<{ metrics: Record<string, unknown> | null; baseline_metrics: Record<string, unknown> | null }> = rows as never;
    if (!dry && inputs.length > 0) {
      const { data } = await admin
        .from('model_trial_runs')
        .select('metrics, baseline_metrics')
        .eq('stage', stage)
        .eq('model', model)
        .in('run_date', Array.from(new Set(inputs.map((i) => i.brief.brief_date))));
      if (data) compared = data;
    }
    summary = {
      stage,
      model,
      baseline: stage === 'writer' ? 'what production stored (enrichment_model per row)' : 'same-time run of grok-4-1-fast',
      dry,
      runs_compared: compared.length,
      spent_today_usd: Number(spent.toFixed(4)),
      cost_cap_usd: TRIAL_DAILY_COST_CAP_USD,
      ...counters,
      comparison: compareRuns(compared),
      note: 'Shadow only: nothing that publishes was read from the trial or changed by it.',
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  if (!dry) {
    await admin.from('cron_executions').insert({
      job_name: 'shadow-model-trial',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      success: errors.length === 0,
      articles_created: 0,
      errors: errors.length ? errors.slice(0, 50) : null,
      response_data: { summary },
    }).then(null, (e: Error) => console.error('[shadow-model-trial] log failed:', e.message));
  }

  return NextResponse.json({
    success: errors.length === 0,
    summary,
    ...(dry ? { rows } : {}),
    errors: errors.slice(0, 50),
    duration_ms: Date.now() - startTime,
  });
}
