// Backfill article_sources rows written before src/lib/source-links.ts existed.
//
//   1. Delete placeholder "sources" (User provided content, Local listing,
//      X (Twitter), Google News, ...) on brief_summary / look_ahead articles.
//   2. Resolve Gemini grounding redirect URLs (vertexaisearch...grounding-api-redirect)
//      to the real page; set source_url to null when the redirect is dead.
//
// Name-only rows cannot be linked retroactively (the grounding chunks were not
// stored); the enricher attaches those from now on.
//
// Usage (dry run by default, nothing is written without --confirm):
//   node scripts/backfill-source-links.mjs                 # Irish counties, last 3 days
//   node scripts/backfill-source-links.mjs --all --days 14 # every neighborhood, last 14 days
//   node scripts/backfill-source-links.mjs --redirects-only     # every grounding redirect row, any age
//   node scripts/backfill-source-links.mjs --confirm

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const ALL = args.includes('--all');
const REDIRECTS_ONLY = args.includes('--redirects-only');
const daysIdx = args.indexOf('--days');
const DAYS = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 3;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Mirrors PLACEHOLDER_SOURCE_PATTERNS in src/lib/source-links.ts
const PLACEHOLDER = [
  /^user[\s-]*provided/i, /provided (content|context|information|data)/i,
  /^(local|event|events?) ?listings?$/i, /^listings?$/i, /^various( sources)?$/i,
  /^multiple sources$/i, /^n\/?a$/i, /^unknown( source)?$/i, /^none$/i, /^sources?$/i,
  /^x \(twitter\)$/i, /^google news$/i, /^google search$/i, /^web search$/i,
  /^search results?$/i, /^internal( source)?$/i, /^ai[- ]generated/i, /^grok/i, /^gemini/i,
  /^press release$/i, /^social media$/i,
];
const isPlaceholder = (n) => !n || n.trim().length < 2 || PLACEHOLDER.some((p) => p.test(n.trim()));
const isRedirect = (u) => !!u && /^https?:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//i.test(u);

async function resolve(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(6000) });
    const loc = res.headers.get('location');
    if (loc && /^https?:\/\/\S+$/i.test(loc) && !/google\.com|googleusercontent\.com|vertexaisearch/i.test(new URL(loc).hostname)) return loc;
  } catch { /* dead */ }
  return null;
}

// --redirects-only: sweep every grounding-redirect row in article_sources regardless
// of article age. Old ones are mostly dead already; resolving what still answers and
// nulling the rest stops article pages from showing links that 404.
if (REDIRECTS_ONLY) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error: e } = await sb.from('article_sources').select('id, source_url').like('source_url', '%grounding-api-redirect%').order('id').range(from, from + 999);
    if (e) { console.error(e); process.exit(1); }
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  console.log(`${CONFIRM ? 'LIVE' : 'DRY RUN'}: ${rows.length} grounding redirect rows`);
  let resolved = 0, dead = 0;
  const CONC = 10;
  for (let i = 0; i < rows.length; i += CONC) {
    const batch = rows.slice(i, i + CONC);
    const results = await Promise.all(batch.map(async (r) => ({ r, final: await resolve(r.source_url) })));
    for (const { r, final } of results) {
      if (final) resolved++; else dead++;
      if (CONFIRM) {
        const { error: e } = await sb.from('article_sources').update({ source_url: final }).eq('id', r.id);
        if (e) console.error('update failed:', e.message);
      }
    }
    if ((i / CONC) % 50 === 0) process.stdout.write(`  ${Math.min(i + CONC, rows.length)}/${rows.length}`);
  }
  console.log(`\nredirects: ${resolved} resolved, ${dead} dead (url set to null)${CONFIRM ? '' : ' [not written]'}`);
  process.exit(0);
}

const since = new Date(Date.now() - DAYS * 86400000).toISOString();
let q = sb.from('articles').select('id, neighborhood_id, article_type')
  .in('article_type', ['brief_summary', 'look_ahead'])
  .gte('published_at', since);
if (!ALL) q = q.like('neighborhood_id', 'ie-%');
const { data: articles, error } = await q;
if (error) { console.error(error); process.exit(1); }
console.log(`${CONFIRM ? 'LIVE' : 'DRY RUN'}: ${articles.length} ${ALL ? '' : 'Irish '}editorial articles in the last ${DAYS} days`);

// Fetch sources in chunks (Supabase caps rows at 1000 per query)
const rows = [];
const ids = articles.map((a) => a.id);
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await sb.from('article_sources').select('id, article_id, source_name, source_url').in('article_id', ids.slice(i, i + 100));
  rows.push(...(data || []));
}
console.log(`${rows.length} source rows`);

const placeholders = rows.filter((r) => isPlaceholder(r.source_name));
const redirects = rows.filter((r) => isRedirect(r.source_url));
console.log(`placeholders to delete: ${placeholders.length} | redirect URLs to resolve: ${redirects.length}`);

// 1. Placeholders
if (CONFIRM && placeholders.length) {
  for (let i = 0; i < placeholders.length; i += 200) {
    const { error: e } = await sb.from('article_sources').delete().in('id', placeholders.slice(i, i + 200).map((r) => r.id));
    if (e) console.error('delete failed:', e.message);
  }
  console.log(`deleted ${placeholders.length} placeholder rows`);
}

// 2. Redirects
let resolved = 0, dead = 0;
const CONC = 8;
for (let i = 0; i < redirects.length; i += CONC) {
  const batch = redirects.slice(i, i + CONC);
  const results = await Promise.all(batch.map(async (r) => ({ r, final: await resolve(r.source_url) })));
  for (const { r, final } of results) {
    if (final) resolved++; else dead++;
    if (CONFIRM) {
      const { error: e } = await sb.from('article_sources').update({ source_url: final }).eq('id', r.id);
      if (e) console.error('update failed:', e.message);
    }
  }
  if ((i / CONC) % 10 === 0) process.stdout.write(`  ${Math.min(i + CONC, redirects.length)}/${redirects.length}\r`);
}
console.log(`\nredirects: ${resolved} resolved, ${dead} dead (url set to null)${CONFIRM ? '' : ' [not written]'}`);
if (!CONFIRM) console.log('Re-run with --confirm to write.');
