/**
 * Does the Grok search add events to the Look Ahead that the Gemini search does
 * not find? Runs both searches live, as generate-look-ahead calls them, for a
 * sample of priority editions, applies the production filters (past dates,
 * tourist traps, venues abroad), merges the way production does, and counts
 * the events only Grok found. The district geofence is not applied, so for a
 * district edition the Grok-only count is an upper bound.
 *
 * Costs real searches: about $0.05 an edition.
 * Usage: node scripts/measure-grok-lookahead.mjs [editions=30]
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const l of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
  if (!l.includes('=') || l.startsWith('#')) continue;
  const i = l.indexOf('=');
  const k = l.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = l.slice(i + 1).trim().replace(/^"|"$/g, '');
}
const require = createRequire(import.meta.url);
const jiti = require('jiti').createJiti(join(root, 'scripts', 'x.js'), { alias: { '@': join(root, 'src') } });
const imp = (p) => jiti.import(join(root, p));
const { generateLookAhead } = await imp('src/lib/grok.ts');
const { searchUpcomingEvents, mergeStructuredEvents } = await imp('src/lib/gemini-search.ts');
const { isTouristActivity } = await imp('src/lib/look-ahead-events.ts');
const { isVenueAbroad } = await imp('src/lib/place-boundary.ts');
const { searchCatchmentFor, isDistrictScoped } = await imp('src/lib/search-catchment.ts');
const { isPriorityNeighborhood } = await imp('src/lib/generation-cadence.ts');
for (const [n, f] of Object.entries({ generateLookAhead, searchUpcomingEvents, mergeStructuredEvents, isTouristActivity, isVenueAbroad, searchCatchmentFor, isDistrictScoped, isPriorityNeighborhood })) {
  if (typeof f !== 'function') throw new Error(`${n} is not exported; nothing was searched`);
}
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const N = Number(process.argv[2] || 30);
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
let hoods = null;
for (let i = 0; i < 5 && !hoods; i++) { hoods = (await sb.from('neighborhoods').select('id,name,city,country,timezone,is_combo').eq('is_active', true)).data; }
const pri = hoods.filter((h) => (ONLY.length ? ONLY.includes(h.id) : isPriorityNeighborhood(h.id, false)) && !h.is_combo);
// Spread across countries: round-robin by country.
const byCountry = new Map();
for (const h of pri) { const k = h.country || '?'; if (!byCountry.has(k)) byCountry.set(k, []); byCountry.get(k).push(h); }
const sample = [];
while (sample.length < N && [...byCountry.values()].some((l) => l.length)) {
  for (const l of byCountry.values()) { if (l.length && sample.length < N) sample.push(l.splice(Math.floor(Math.random() * l.length), 1)[0]); }
}

const keep = (events, localDate, country) => (events || []).filter((e) =>
  /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') && e.date >= localDate && e.name && !isTouristActivity(e)
  && !isVenueAbroad([e.location, e.address].filter(Boolean).join(', '), country));

const rows = [];
async function run(h) {
  const tz = h.timezone || 'UTC';
  const localDate = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const name = searchCatchmentFor(h.id, h.name);
  const scoped = isDistrictScoped(h.id);
  // A network failure is retried (twice), so a timeout is not counted as an empty search.
  const retry = async (fn) => { let last; for (let i = 0; i < 3; i++) { try { const v = await fn(); if (v) return v; last = new Error('null result'); } catch (e) { last = e; } await new Promise((s) => setTimeout(s, 3000)); } throw last; };
  const [g, m] = await Promise.allSettled([
    retry(() => generateLookAhead(name, h.city, h.country || undefined, tz, localDate, scoped, h.id)),
    retry(() => searchUpcomingEvents(name, h.city, h.country || undefined, tz, localDate, scoped, h.id)),
  ]);
  const grok = keep(g.status === 'fulfilled' ? g.value?.structuredEvents : [], localDate, h.country);
  const gem = keep(m.status === 'fulfilled' ? m.value?.structuredEvents : [], localDate, h.country);
  const merged = mergeStructuredEvents(gem, grok);
  const grokOnly = Math.max(0, merged.length - mergeStructuredEvents(gem, []).length);
  const onlyNames = merged.filter((e) => !gem.some((x) => x.name === e.name)).map((e) => e.name).slice(0, 3);
  rows.push({ id: h.id, country: h.country, grok: grok.length, gemini: gem.length, merged: merged.length, grokOnly, grokFailed: g.status !== 'fulfilled', geminiFailed: m.status !== 'fulfilled', onlyNames });
  console.log(`${h.id.padEnd(30)} grok ${String(grok.length).padStart(2)}  gemini ${String(gem.length).padStart(2)}  merged ${String(merged.length).padStart(2)}  grok-only ${grokOnly}${g.status !== 'fulfilled' ? '  GROK FAILED' : ''}${m.status !== 'fulfilled' ? '  GEMINI FAILED' : ''}  ${onlyNames.join(' | ').slice(0, 110)}`);
}
for (let i = 0; i < sample.length; i += 4) await Promise.all(sample.slice(i, i + 4).map((h) => run(h).catch((e) => console.log(h.id, 'error', e.message))));

const tot = rows.reduce((a, r) => ({ grok: a.grok + r.grok, gemini: a.gemini + r.gemini, merged: a.merged + r.merged, grokOnly: a.grokOnly + r.grokOnly }), { grok: 0, gemini: 0, merged: 0, grokOnly: 0 });
console.log(`\n${rows.length} editions. Events kept: Grok ${tot.grok}, Gemini ${tot.gemini}, merged ${tot.merged}; only Grok found ${tot.grokOnly} (${Math.round((100 * tot.grokOnly) / Math.max(1, tot.merged))}% of the merged listing).`);
console.log(`Failed after retries: Grok ${rows.filter((r) => r.grokFailed).length}, Gemini ${rows.filter((r) => r.geminiFailed).length}.`);
console.log(`Editions where Grok added nothing: ${rows.filter((r) => r.grokOnly === 0).length} of ${rows.length}.`);
const byC = {};
for (const r of rows) { const c = byC[r.country] || { merged: 0, grokOnly: 0, n: 0 }; c.merged += r.merged; c.grokOnly += r.grokOnly; c.n++; byC[r.country] = c; }
for (const [c, v] of Object.entries(byC).sort((a, b) => b[1].merged - a[1].merged)) console.log(`  ${c.padEnd(16)} ${v.n} ed, grok-only ${v.grokOnly}/${v.merged} (${Math.round((100 * v.grokOnly) / Math.max(1, v.merged))}%)`);
