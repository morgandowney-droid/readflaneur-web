/**
 * Archive tier runner for the dedicated server (no 5-minute limit).
 *
 *   node scripts/archive/run.mjs --stage brief|events|look_ahead --country de
 *        [--limit N] [--concurrency 12] [--cap-usd 15] [--ids a,b]
 *
 * Reads data/areas/<country>.json, runs the same pipeline as the Vercel test
 * route (src/lib/archive/pipeline.ts) for every area, writes archive_editions /
 * archive_events, and logs one cron_executions row (job 'archive-tier-server').
 * Stops starting new areas once the day's spend reaches --cap-usd.
 * Environment: the variables in ~/.env (or the process environment).
 */
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const file of [join(os.homedir(), '.env'), join(root, '.env.local')]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const stage = args.stage || 'brief';
const cc = args.country || 'de';
const concurrency = Number(args.concurrency || 12);
const capUsd = Number(args['cap-usd'] || 15);
const COUNTRY = { de: 'Germany', uk: 'United Kingdom', ie: 'Ireland', au: 'Australia', nz: 'New Zealand', 'us-nyc': 'United States', 'us-dc': 'United States' }[cc];
if (!COUNTRY) { console.error(`no areas for ${cc}`); process.exit(1); }

const require = createRequire(import.meta.url);
const { createJiti } = require('jiti');
const jiti = createJiti(join(root, 'scripts', 'x.js'), { alias: { '@': join(root, 'src') } });
const P = await jiti.import(join(root, 'src/lib/archive/pipeline.ts'));
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let areas = JSON.parse(fs.readFileSync(join(root, 'data', 'areas', `${cc}.json`), 'utf8')).areas.map((a) => ({ ...a, country: COUNTRY }));
if (args.ids) { const ids = args.ids.split(','); areas = areas.filter((a) => ids.includes(a.id)); }
if (args.limit) areas = areas.slice(0, Number(args.limit));

const loc = P.localeFor(COUNTRY);
// Each area is dated by its own local day (Perth and Sydney can differ).
const dateOf = (area) => P.localDate(P.tzFor(area));
const dates = Array.from(new Set(areas.map(dateOf)));
const started = Date.now();
const counts = { done: 0, with_content: 0, errors: 0, skipped_cap: 0, skipped_existing: 0 };
const errors = [];
let spent = 0;

// Why an area produced nothing, counted by reason. From 9 to 23 Oct 2026 a dead
// OpenRouter key failed every area ("writer: OpenRouter HTTP 401") and nothing
// counted it: with_content was 0, errors was 0, and Serper ran every night.
const reasons = {};
const noteReason = (r) => { const k = String(r || 'unknown').slice(0, 80); reasons[k] = (reasons[k] || 0) + 1; };

async function failRun(message) {
  console.error(message);
  await admin.from('cron_executions').insert({
    job_name: 'archive-tier-server', started_at: new Date(started).toISOString(), completed_at: new Date().toISOString(),
    success: false, articles_created: 0, errors: [message],
    response_data: { summary: { stage, country: COUNTRY, map: cc, dates, areas: areas.length, aborted: message } },
  });
  process.exit(2);
}

// Preflight the writer before any search is paid for: the brief and events stages
// cannot store anything without it, so a dead or exhausted key must stop the run here.
if (stage === 'brief' || stage === 'events') {
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!key) await failRun('writer preflight: OPENROUTER_API_KEY not set');
  let res = null, body = {};
  try {
    res = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    body = await res.json().catch(() => ({}));
  } catch (err) {
    console.warn(`writer preflight skipped (network): ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res) {
    if (!res.ok) await failRun(`writer preflight: OpenRouter HTTP ${res.status} ${JSON.stringify(body.error || body).slice(0, 160)}`);
    const d = body.data || {};
    if (d.limit != null && d.limit_remaining != null && d.limit_remaining < 1) await failRun(`writer preflight: OpenRouter key limit reached (limit ${d.limit}, used ${d.usage})`);
    console.log(`writer preflight ok: key ${d.label || '?'}, limit ${d.limit ?? 'none'}, remaining ${d.limit_remaining ?? 'n/a'}`);
  }
}

// Areas already done today (a rerun only does what is missing).
const done = new Set();
if (stage !== 'events') {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('archive_editions').select('area_id, local_date').in('local_date', dates).eq('kind', stage === 'brief' ? 'brief' : 'look_ahead').range(from, from + 999);
    if (error) { console.error(error.message); break; }
    for (const r of data) done.add(`${r.area_id}:${r.local_date}`);
    if (data.length < 1000) break;
  }
}

let next = 0;
async function worker() {
  while (next < areas.length) {
    const area = areas[next++];
    const date = dateOf(area);
    if (!args.force && done.has(`${area.id}:${date}`)) { counts.skipped_existing++; continue; }
    if (spent >= capUsd) { counts.skipped_cap++; continue; }
    try {
      if (stage === 'brief') {
        const r = await P.writeBrief(admin, area);
        spent += r.costUsd || 0;
        if (r.body) {
          counts.with_content++;
          const { error } = await admin.from('archive_editions').upsert({
            area_id: area.id, country: COUNTRY, local_date: date, kind: 'brief', language: loc.code,
            headline: r.headline, body: r.body, stories: r.stories, sources: r.sources, gathered: r.gathered, cost_usd: r.costUsd,
          }, { onConflict: 'area_id,local_date,kind' });
          if (error) throw new Error(error.message);
        } else noteReason(r.error || 'no body');
      } else if (stage === 'events') {
        const r = await P.gatherEvents(admin, area);
        spent += r.costUsd || 0;
        if (r.stored) counts.with_content++; else noteReason(r.error || 'no events');
      } else {
        const r = await P.buildLookAhead(admin, area);
        if (r.body) {
          counts.with_content++;
          const { error } = await admin.from('archive_editions').upsert({
            area_id: area.id, country: COUNTRY, local_date: date, kind: 'look_ahead', language: loc.code, body: r.body, sources: r.sources, cost_usd: 0,
          }, { onConflict: 'area_id,local_date,kind' });
          if (error) throw new Error(error.message);
        } else noteReason('no upcoming events');
      }
      counts.done++;
    } catch (err) {
      counts.errors++;
      if (errors.length < 50) errors.push(`${area.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if ((counts.done + counts.errors) % 50 === 0) console.log(new Date().toISOString(), stage, counts, `$${spent.toFixed(3)}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

// A run that processed areas and stored nothing is a failure, whatever the error count
// says; so is a writer that failed on a fifth of the areas. Both reach cron_executions
// as success=false, which the daily health monitor turns into a job_failure issue.
const writerFailures = Object.entries(reasons).filter(([k]) => /^writer:|OpenRouter|OPENROUTER/i.test(k)).reduce((n, [, v]) => n + v, 0);
const silentRun = stage !== 'look_ahead' && counts.done >= 25 && counts.with_content === 0;
const writerDown = writerFailures >= Math.max(5, Math.ceil(counts.done * 0.2));
const success = counts.errors === 0 && !silentRun && !writerDown;
const runErrors = [...errors];
if (writerDown) runErrors.unshift(`writer failed on ${writerFailures} of ${counts.done} areas`);
if (silentRun) runErrors.unshift(`silent run: ${counts.done} areas processed, none with content; reasons ${JSON.stringify(reasons).slice(0, 300)}`);
const summary = { stage, country: COUNTRY, map: cc, dates, areas: areas.length, ...counts, writer_failures: writerFailures, reasons, spent_usd: Number(spent.toFixed(4)), cap_usd: capUsd, minutes: Math.round((Date.now() - started) / 60000) };
console.log(JSON.stringify(summary));
await admin.from('cron_executions').insert({
  job_name: 'archive-tier-server', started_at: new Date(started).toISOString(), completed_at: new Date().toISOString(),
  success, articles_created: 0, errors: runErrors.length ? runErrors : null, response_data: { summary },
});
if (!success) process.exitCode = 2;
