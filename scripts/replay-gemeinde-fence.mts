import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { dropOtherGemeindeSections } from '../src/lib/place-boundary';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ids = ['nrw-stolberg', 'nrw-eschweiler', 'nrw-erkelenz', 'nrw-geilenkirchen', 'nrw-inden', 'nrw-juelich', 'bw-kuenzelsau', 'bw-eppingen', 'bw-beilstein'];
const { data } = await sb.from('neighborhood_briefs').select('neighborhood_id,brief_date,enriched_content').in('neighborhood_id', ids).gte('brief_date', '2026-10-27').order('brief_date');
let n = 0;
for (const b of data || []) {
  const r = dropOtherGemeindeSections(b.enriched_content || '', b.neighborhood_id);
  if (!r.dropped.length) continue;
  n += r.dropped.length;
  const heads = (b.enriched_content.match(/\[\[[^\]]+\]\]/g) || []).filter((h: string) => !r.text.includes(h));
  console.log(b.neighborhood_id, b.brief_date, '| would drop:', heads.join(' '), '| because:', r.dropped.join(', '));
  for (const h of heads) { const i = b.enriched_content.indexOf(h); console.log("   ", h, "=>", b.enriched_content.slice(i + h.length, i + h.length + 260).replace(/\]\([^)]*\)/g, "]").replace(/\s+/g, " ")); }
}
console.log('briefs', (data || []).length, 'sections dropped', n);
