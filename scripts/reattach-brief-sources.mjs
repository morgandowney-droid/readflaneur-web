// Re-run story-to-page matching on a stored brief with the widened fact lines
// (widenSupportsToLines), then rebuild its brief article's source rows.
// Only pages the searches returned are used; nothing is re-written by a model.
// Usage: node scripts/reattach-brief-sources.mjs <neighborhood_id> <YYYY-MM-DD> [--confirm]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [id, date] = process.argv.slice(2); const confirm = process.argv.includes('--confirm');
if (!id || !date) { console.error('usage: <neighborhood_id> <YYYY-MM-DD> [--confirm]'); process.exit(1); }
const outDir = mkdtempSync(join(tmpdir(), 'reattach-'));
writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');
const tscPath = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tscPath, 'src/lib/source-links.ts', '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node', '--skipLibCheck', '--types', 'node'], { stdio: 'inherit' });
const L = createRequire(join(outDir, 'x.js'))(join(outDir, 'source-links.js'));
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const get = async (p) => { const r = await fetch(`${U}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`); return r.json(); };

const [b] = await get(`neighborhood_briefs?neighborhood_id=eq.${id}&brief_date=eq.${date}&select=id,content,sources,enriched_categories,neighborhoods(name,city)`);
if (!b) throw new Error('no brief');
const place = [b.neighborhoods?.name, b.neighborhoods?.city].filter(Boolean);
const pages = L.widenSupportsToLines(L.pagesFromStored(b.sources).map(p => ({ ...p, supports: [...(p.supports || [])] })), b.content);
const wrapped = !Array.isArray(b.enriched_categories);
const cats = wrapped ? b.enriched_categories.categories : b.enriched_categories;
let attached = 0;
for (const c of cats) for (const st of c.stories || []) {
  if (st.source?.url) continue;
  const m = L.matchStoryToPages(st, pages, place);
  if (!m) { console.log('none  ', st.entity); continue; }
  const named = st.source?.name;
  const keep = !!named && L.hostMatchesPublication?.(named, m.chunk.uri);
  st.source = { name: keep ? named : L.sourceNameForPage(m.chunk), url: m.chunk.uri, origin: 'story-match' };
  attached++;
  console.log('attach', st.entity, '->', m.chunk.uri);
}
const rows = await L.extractArticleSources(cats);
const [art] = await get(`articles?neighborhood_id=eq.${id}&article_type=eq.brief_summary&slug=like.*brief-${date}*&select=id,slug`);
const old = art ? await get(`article_sources?article_id=eq.${art.id}&select=source_name,source_url`) : [];
console.log(`\n${attached} stories attached. Article ${art?.slug || '(none)'}: ${old.length} source rows now, ${rows.length} after.`);
rows.forEach(r => console.log('  row', r.source_name, r.source_url || ''));
if (!confirm) { console.log('\nDry run. Add --confirm to write.'); process.exit(0); }
const newCats = wrapped ? { ...b.enriched_categories, categories: cats } : cats;
let r = await fetch(`${U}/rest/v1/neighborhood_briefs?id=eq.${b.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ enriched_categories: newCats }) });
if (!r.ok) throw new Error(`brief update ${r.status} ${await r.text()}`);
if (art && rows.length) {
  r = await fetch(`${U}/rest/v1/article_sources?article_id=eq.${art.id}`, { method: 'DELETE', headers: H });
  if (!r.ok) throw new Error(`delete ${r.status}`);
  r = await fetch(`${U}/rest/v1/article_sources`, { method: 'POST', headers: H, body: JSON.stringify(rows.map(x => ({ ...x, article_id: art.id }))) });
  if (!r.ok) throw new Error(`insert ${r.status} ${await r.text()}`);
}
console.log('Written.');
