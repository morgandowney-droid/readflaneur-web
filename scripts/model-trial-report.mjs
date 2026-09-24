#!/usr/bin/env node
/**
 * Side-by-side report of the shadow model trial (model_trial_runs).
 *
 *   node scripts/model-trial-report.mjs              # last 7 days, both stages
 *   node scripts/model-trial-report.mjs --days 14
 *   node scripts/model-trial-report.mjs --stage search
 *   node scripts/model-trial-report.mjs --editions   # also one line per edition
 *
 * Read only. The comparison is the shipped compareRuns() from
 * src/lib/model-trial-metrics.ts, compiled here, so the report and the cron's
 * cron_executions summary cannot drift apart.
 *
 * writer: candidate = the trial model's rewrite of production's gathered
 *   facts; baseline = what production stored for the same brief.
 * search: candidate = the trial model's Grok brief search; baseline = a
 *   same-time run of production's Grok model on the same prompt.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const days = Number(arg('days', '7')) || 7;
const onlyStage = arg('stage', null);
const perEdition = args.includes('--editions');

const outDir = mkdtempSync(join(tmpdir(), 'model-trial-report-'));
writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');
const require = createRequire(import.meta.url);
execFileSync(process.execPath, [
  require.resolve('typescript/bin/tsc'), 'src/lib/model-trial-metrics.ts',
  '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node', '--skipLibCheck',
], { stdio: 'inherit' });
const M = createRequire(join(outDir, 'x.js'))(join(outDir, 'model-trial-metrics.js'));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local).');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

const { data: runs, error } = await admin
  .from('model_trial_runs')
  .select('run_date, neighborhood_id, stage, model, baseline_model, metrics, baseline_metrics, cost_usd, latency_ms, error')
  .gte('run_date', since)
  .order('run_date', { ascending: true });
if (error) {
  console.error(`model_trial_runs: ${error.message} (has the migration been run?)`);
  process.exit(1);
}

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const lpad = (s, n) => String(s).padStart(n).slice(-n);
const fmt = (v) => (v === null || v === undefined ? '-' : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));

// Metrics worth reading first; everything else follows alphabetically.
const LEAD = {
  writer: ['stories', 'words', 'traced_source_share', 'verified_share', 'verified_or_partial_share', 'verdicts.not_found', 'verdicts.unverifiable_origin', 'model_urls_written', 'model_urls_dropped', 'edition_rules_removed', 'refusal', 'json_parse_failed', 'thinking_leak_stripped', 'teaser_leak_stripped', 'residual_thinking_leak', 'residual_teaser_leak', 'latency_ms', 'cost_usd'],
  search: ['citations', 'posts_read', 'distinct_domains', 'load_share', 'mentions_place_share', 'content_words', 'opens_empty', 'failed', 'latency_ms', 'cost_usd'],
};

for (const stage of ['writer', 'search']) {
  if (onlyStage && onlyStage !== stage) continue;
  const rows = (runs || []).filter((r) => r.stage === stage);
  console.log(`\n${'='.repeat(78)}\n${stage.toUpperCase()} since ${since}: ${rows.length} runs`);
  if (rows.length === 0) continue;
  for (const model of Array.from(new Set(rows.map((r) => r.model)))) {
    const mine = rows.filter((r) => r.model === model);
    const baselines = Array.from(new Set(mine.map((r) => r.baseline_model).filter(Boolean)));
    const errs = mine.filter((r) => r.error).length;
    const cost = mine.reduce((n, r) => n + Number(r.cost_usd || 0), 0);
    const baseCost = mine.reduce((n, r) => n + Number(r.baseline_metrics?.cost_usd || 0), 0);
    console.log(`\ncandidate ${model}  vs  ${stage === 'writer' ? 'production as stored' : 'same-time control'} (${baselines.join(', ')})`);
    console.log(`runs ${mine.length}, editions ${new Set(mine.map((r) => r.neighborhood_id)).size}, dates ${new Set(mine.map((r) => r.run_date)).size}, candidate errors ${errs}`);
    console.log(`spend: candidate $${cost.toFixed(3)}${stage === 'search' ? `, control $${baseCost.toFixed(3)}` : ''}\n`);
    const cmp = M.compareRuns(mine);
    const order = [...LEAD[stage].filter((k) => cmp.some((c) => c.metric === k)), ...cmp.map((c) => c.metric).filter((k) => !LEAD[stage].includes(k)).sort()];
    console.log(`${pad('metric', 34)}${lpad('candidate', 11)}${lpad('baseline', 11)}${lpad('delta', 11)}${lpad('paired', 8)}`);
    console.log('-'.repeat(75));
    for (const k of order) {
      const c = cmp.find((x) => x.metric === k);
      const delta = c.candidate_mean !== null && c.baseline_mean !== null ? c.candidate_mean - c.baseline_mean : null;
      console.log(`${pad(k, 34)}${lpad(fmt(c.candidate_mean), 11)}${lpad(fmt(c.baseline_mean), 11)}${lpad(delta === null ? '-' : (delta > 0 ? '+' : '') + fmt(delta), 11)}${lpad(c.paired, 8)}`);
    }
    if (perEdition) {
      const keys = stage === 'writer' ? ['stories', 'verified_share', 'traced_source_share', 'words', 'cost_usd'] : ['citations', 'posts_read', 'mentions_place_share', 'opens_empty', 'cost_usd'];
      console.log(`\n${pad('date', 11)}${pad('edition', 30)}${keys.map((k) => lpad(k.slice(0, 13), 14)).join('')}`);
      for (const r of mine) {
        const cell = (k) => `${fmt(typeof r.metrics?.[k] === 'boolean' ? +r.metrics[k] : r.metrics?.[k])}/${fmt(typeof r.baseline_metrics?.[k] === 'boolean' ? +r.baseline_metrics[k] : r.baseline_metrics?.[k])}`;
        console.log(`${pad(r.run_date, 11)}${pad(r.neighborhood_id, 30)}${keys.map((k) => lpad(cell(k), 14)).join('')}${r.error ? `  ERROR ${r.error.slice(0, 60)}` : ''}`);
      }
      console.log('(each cell: candidate/baseline)');
    }
  }
}
console.log('');
