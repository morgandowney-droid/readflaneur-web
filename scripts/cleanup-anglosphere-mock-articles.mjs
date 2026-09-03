/**
 * One-off cleanup for the sync-anglosphere-features mock-data leak
 * (20 Apr - 3 Sep 2026). See the 2026-09-03 CLAUDE.md note.
 *
 *   node scripts/cleanup-anglosphere-mock-articles.mjs            # dry run, prints counts
 *   node scripts/cleanup-anglosphere-mock-articles.mjs --confirm  # deletes
 *
 * Deletes (a) every "Design Watch", "GCB Alert" and "Motor Watch" article -
 * all of it came from hardcoded mock data, none of it is real - and (b) the
 * repeated Cape Town "Beach Alert" / "Grid Watch" rows, keeping only the most
 * recent article per (neighborhood, headline). Foreign keys onto articles
 * cascade (reactions, translations, sources) or set null.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const confirm = process.argv.includes('--confirm');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll(cats) {
  let out = [], cursor = null;
  for (;;) {
    let q = sb.from('articles').select('id,neighborhood_id,headline,category_label,published_at')
      .in('category_label', cats).order('published_at', { ascending: false }).limit(1000);
    if (cursor) q = q.lt('published_at', cursor);
    const { data, error } = await q;
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < 1000) break;
    cursor = data[data.length - 1].published_at;
  }
  return out;
}

async function del(ids) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { error, count } = await sb.from('articles').delete({ count: 'exact' }).in('id', ids.slice(i, i + 200));
    if (error) throw error;
    n += count || 0;
  }
  return n;
}

const fake = await fetchAll(['Design Watch', 'GCB Alert', 'Motor Watch']);
const byCat = {};
for (const a of fake) byCat[a.category_label] = (byCat[a.category_label] || 0) + 1;
console.log(`Fabricated mock articles: ${fake.length}`, byCat);

const beach = await fetchAll(['Beach Alert', 'Grid Watch']);
const keep = new Set(); const drop = [];
for (const a of beach) { const k = a.neighborhood_id + '|' + a.headline; if (keep.has(k)) drop.push(a.id); else keep.add(k); }
console.log(`Cape Town alerts: ${beach.length} rows, keeping ${keep.size} (most recent per headline), deleting ${drop.length}`);

if (!confirm) { console.log('\nDry run. Re-run with --confirm to delete.'); process.exit(0); }
console.log('Deleted fabricated:', await del(fake.map((a) => a.id)));
console.log('Deleted Cape Town repeats:', await del(drop));
const left = await fetchAll(['Design Watch', 'GCB Alert', 'Motor Watch', 'Beach Alert', 'Grid Watch']);
console.log('Remaining rows in these categories:', left.length);
for (const a of left) console.log('  ', a.neighborhood_id, '|', a.headline, '|', a.published_at.slice(0, 10));
