// Repair translated article headlines whose section label was translated as prose.
//
// "LOOK AHEAD:", "{Place} DAILY BRIEF:" and "The Sunday Edition:" are fixed
// terms, but they were being handed to the translator with the rest of the
// headline. Four days of the German pilot carried VORAUSSCHAU, VORAUSBLICK and
// VORAUSGESCHAUT for the same section (the last is a past participle, not a
// noun), while "DAILY BRIEF" stayed in English inside German headlines.
//
// src/lib/section-labels.ts parks the label before translation and restores it
// from one table afterwards. This repairs rows translated before that shipped.
// The table is imported from the shipped module, not copied, so the backfill and
// the pipeline cannot drift. The module is compiled to a scratch dir first
// because the repo has no TypeScript runner.
//
// Only the label is touched. The translated teaser is carried across untouched.
//
// Usage (dry run by default):
//   node scripts/backfill-section-labels.mjs                       # last 14 days
//   node scripts/backfill-section-labels.mjs --lang de --confirm
//   node scripts/backfill-section-labels.mjs --days 60 --confirm

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
const DAYS = Number(arg('--days', 14));
const LANG_FILTER = arg('--lang', null);

// Compile the shipped table so there is one source of truth
const outDir = mkdtempSync(join(tmpdir(), 'seclabels-'));
execFileSync(
  'npx',
  [
    'tsc', 'src/lib/section-labels.ts',
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
const { enforceSectionLabel, parseSectionLabel } = await import(
  pathToFileURL(join(outDir, 'section-labels.js')).href
);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const since = new Date(Date.now() - DAYS * 864e5).toISOString();
const PAGE = 500;

// Supabase silently caps at 1000 rows, so page explicitly.
async function pageThrough(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) { console.error(error); process.exit(1); }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// Only headlines that actually carry a section label.
const articles = await pageThrough(() =>
  sb
    .from('articles')
    .select('id, headline, neighborhood_id, published_at')
    .gte('published_at', since)
    .or('headline.ilike.%DAILY BRIEF:%,headline.ilike.LOOK AHEAD:%,headline.ilike.The Sunday Edition:%')
    .order('published_at', { ascending: false })
);

const labelled = articles.filter((a) => parseSectionLabel(a.headline));
const byId = new Map(labelled.map((a) => [a.id, a]));
console.log(
  `${CONFIRM ? 'LIVE' : 'DRY RUN'}: ${labelled.length} labelled articles in the last ${DAYS} days` +
    (LANG_FILTER ? ` (language: ${LANG_FILTER})` : '')
);
if (!labelled.length) process.exit(0);

// Translations for those articles, in chunks so the IN list stays sane.
const ids = [...byId.keys()];
const translations = [];
for (let i = 0; i < ids.length; i += 200) {
  const chunk = ids.slice(i, i + 200);
  let q = sb
    .from('article_translations')
    .select('article_id, language_code, headline')
    .in('article_id', chunk);
  if (LANG_FILTER) q = q.eq('language_code', LANG_FILTER);
  const { data, error } = await q;
  if (error) { console.error(error); process.exit(1); }
  translations.push(...(data ?? []));
}

const changes = [];
for (const t of translations) {
  const article = byId.get(t.article_id);
  if (!article || !t.headline) continue;
  const fixed = enforceSectionLabel(article.headline, t.headline, t.language_code);
  if (fixed && fixed !== t.headline) {
    changes.push({ ...t, article, fixed });
  }
}

const byLang = {};
for (const c of changes) byLang[c.language_code] = (byLang[c.language_code] || 0) + 1;

console.log(`\n${translations.length} translations checked, ${changes.length} to fix`);
console.log(Object.entries(byLang).map(([l, n]) => `  ${l}: ${n}`).join('\n') || '  none');

// Print every change so the diff is reviewable before --confirm.
for (const c of changes) {
  console.log(`\n[${c.language_code}] ${c.article.neighborhood_id}  ${c.article.published_at?.slice(0, 10)}`);
  console.log(`  EN   ${c.article.headline}`);
  console.log(`  WAS  ${c.headline}`);
  console.log(`  NOW  ${c.fixed}`);
}

if (!CONFIRM) {
  console.log(`\nDry run. Re-run with --confirm to write ${changes.length} rows.`);
  process.exit(0);
}

let written = 0;
for (const c of changes) {
  const { error } = await sb
    .from('article_translations')
    .update({ headline: c.fixed })
    .eq('article_id', c.article_id)
    .eq('language_code', c.language_code);
  if (error) {
    console.error(`FAILED ${c.article_id} ${c.language_code}`, error.message);
    continue;
  }
  written += 1;
}
console.log(`\nWrote ${written} of ${changes.length} rows.`);
