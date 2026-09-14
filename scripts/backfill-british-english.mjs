// Rewrite American spellings in editions published to British and Irish readers.
//
// The enrichment prompt was written in American English, so Gemini returned
// "theater", "center", "program" and "neighborhood" for UK and Irish places.
// Lewes carried "Theater Performance" on the same line as "Lewes Little
// Theatre". src/lib/locale-register.ts fixes it going forward; this cleans what
// already published.
//
// Rules are imported from that module, not copied, so the backfill and the
// pipeline can never drift. The module is compiled to the scratch dir first
// because the repo has no TypeScript runner.
//
// Usage (dry run by default):
//   node scripts/backfill-british-english.mjs                      # last 7 days
//   node scripts/backfill-british-english.mjs --days 30 --confirm
//   node scripts/backfill-british-english.mjs --country Ireland --confirm

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};
const DAYS = Number(arg('--days', 7));
const COUNTRY_FILTER = arg('--country', null);

// Compile the shared rules so there is one source of truth
const outDir = mkdtempSync(join(tmpdir(), 'locale-'));
execFileSync(
  'npx',
  [
    'tsc', 'src/lib/locale-register.ts',
    '--outDir', outDir,
    '--module', 'es2022',
    '--target', 'es2022',
    '--moduleResolution', 'bundler',
    // The module imports nothing; ambient @types would only get in the way
    '--skipLibCheck',
    '--typeRoots', outDir,
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);
const { anglicise, usesBritishEnglish, getPlaceNoun, enforcePlaceNoun } = await import(
  pathToFileURL(join(outDir, 'locale-register.js')).href
);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: hoods, error: hoodErr } = await sb
  .from('neighborhoods')
  .select('id, name, city, country');
if (hoodErr) { console.error(hoodErr); process.exit(1); }

const british = hoods.filter(
  (h) => usesBritishEnglish(h.country) && (!COUNTRY_FILTER || h.country === COUNTRY_FILTER)
);
const ids = new Set(british.map((h) => h.id));
// Spelling is universal; register depends on the place. A Birmingham suburb is
// "the area", a Dorset market town is "the town", an Irish county is "the county".
const nounById = Object.fromEntries(british.map((h) => [h.id, getPlaceNoun(h)]));
const fixFor = (id) => (v) => enforcePlaceNoun(anglicise(v), nounById[id] || 'neighbourhood');
console.log(
  `${CONFIRM ? 'LIVE' : 'DRY RUN'}: ${british.length} British-English places, last ${DAYS} days` +
    (COUNTRY_FILTER ? ` (country: ${COUNTRY_FILTER})` : '')
);

const since = new Date(Date.now() - DAYS * 86400000).toISOString();

// Supabase silently caps a query at 1000 rows, so page explicitly
async function page(table, columns, dateColumn) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .gte(dateColumn, since)
      .in('neighborhood_id', [...ids])
      .order('id')
      .range(from, from + 499);
    if (error) { console.error(error); process.exit(1); }
    rows.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return rows;
}

const briefs = await page(
  'neighborhood_briefs',
  'id, neighborhood_id, enriched_content, subject_teaser, email_teaser',
  'created_at'
);
const articles = await page(
  'articles',
  'id, neighborhood_id, headline, body_text, preview_text',
  'published_at'
);
console.log(`  ${briefs.length} briefs, ${articles.length} articles in scope`);

let briefsFixed = 0;
let articlesFixed = 0;
const touchedBriefIds = [];
const touchedArticleIds = [];

for (const b of briefs) {
  const patch = {};
  const fix = fixFor(b.neighborhood_id);
  for (const col of ['enriched_content', 'subject_teaser', 'email_teaser']) {
    if (!b[col]) continue;
    const fixed = fix(b[col]);
    if (fixed !== b[col]) patch[col] = fixed;
  }
  if (Object.keys(patch).length === 0) continue;
  briefsFixed++;
  touchedBriefIds.push(b.id);
  console.log(`  brief ${b.neighborhood_id}: ${Object.keys(patch).join(', ')}`);
  if (CONFIRM) {
    const { error } = await sb.from('neighborhood_briefs').update(patch).eq('id', b.id);
    if (error) console.error('   brief update failed:', error.message);
  }
}

for (const a of articles) {
  const patch = {};
  const fix = fixFor(a.neighborhood_id);
  for (const col of ['headline', 'body_text', 'preview_text']) {
    if (!a[col]) continue;
    const fixed = fix(a[col]);
    if (fixed !== a[col]) patch[col] = fixed;
  }
  if (Object.keys(patch).length === 0) continue;
  articlesFixed++;
  touchedArticleIds.push(a.id);
  console.log(`  article ${a.neighborhood_id}: ${Object.keys(patch).join(', ')}`);
  if (CONFIRM) {
    const { error } = await sb.from('articles').update(patch).eq('id', a.id);
    if (error) console.error('   article update failed:', error.message);
  }
}

// A cached translation still carries the old wording, so drop the ones we changed
if (CONFIRM) {
  for (let i = 0; i < touchedArticleIds.length; i += 100) {
    await sb.from('article_translations').delete().in('article_id', touchedArticleIds.slice(i, i + 100));
  }
  for (let i = 0; i < touchedBriefIds.length; i += 100) {
    await sb.from('brief_translations').delete().in('brief_id', touchedBriefIds.slice(i, i + 100));
  }
}

console.log(`briefs ${CONFIRM ? 'fixed' : 'to fix'}: ${briefsFixed} | articles: ${articlesFixed}`);
if (!CONFIRM) console.log('Re-run with --confirm to write.');
