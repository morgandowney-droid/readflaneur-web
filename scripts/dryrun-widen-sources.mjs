// Dry run: how many stories in recent pilot briefs gain a source when each
// read page also carries the whole fact line its credited sentence sits in.
// Usage: node scripts/dryrun-widen-sources.mjs [neighborhood_id] [days]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const outDir = mkdtempSync(join(tmpdir(), 'widen-'));
writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');
const tscPath = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tscPath, 'src/lib/source-links.ts', '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node', '--skipLibCheck', '--types', 'node'], { stdio: 'inherit' });
const L = createRequire(join(outDir, 'x.js'))(join(outDir, 'source-links.js'));
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, H = { apikey: K, Authorization: `Bearer ${K}` };
const id = process.argv[2]; const days = Number(process.argv[3] || 1);
const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const q = `${U}/rest/v1/neighborhood_briefs?brief_date=gte.${since}&enriched_content=not.is.null&select=neighborhood_id,brief_date,content,sources,enriched_categories,neighborhoods(name,city)${id ? `&neighborhood_id=eq.${id}` : ''}&limit=1000`;
const briefs = await (await fetch(q, { headers: H })).json();
let tot = 0, had = 0, before = 0, after = 0;
for (const b of briefs) {
  const pages = L.pagesFromStored ? L.pagesFromStored(b.sources) : (b.sources || []).filter(s => s.url).map(s => ({ uri: s.url, title: s.title, domain: s.domain, supports: s.supports || [] }));
  const wide = L.widenSupportsToLines(pages.map(p => ({ ...p, supports: [...(p.supports || [])] })), b.content);
  const place = [b.neighborhoods?.name, b.neighborhoods?.city].filter(Boolean);
  const cats = b.enriched_categories?.categories || b.enriched_categories || [];
  for (const c of cats) for (const st of c.stories || []) {
    tot++;
    if (st.source?.url) { had++; continue; }
    const m0 = L.matchStoryToPages(st, pages, place), m1 = L.matchStoryToPages(st, wide, place);
    if (m0) before++;
    if (m1) { after++; if (id || Math.random() < Number(process.env.SAMPLE || 0)) console.log(b.neighborhood_id, 'MATCH', (st.entity || '').slice(0, 45), '->', m1.chunk.uri, '|', m1.passage.slice(0, 150), '|| CTX:', (st.context||'').slice(0,90)); }
    else if (id) console.log('none ', (st.entity || '').slice(0, 45));
  }
}
console.log(JSON.stringify({ briefs: briefs.length, stories: tot, alreadySourced: had, unsourcedNowMatchedOld: before, unsourcedMatchedWidened: after }));
