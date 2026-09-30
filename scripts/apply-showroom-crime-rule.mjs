/**
 * Apply the showroom crime rule (src/lib/showroom-crime-rule.ts) to a stored
 * daily brief and its published article: named crime stories out, unnamed ones
 * moved below the rest, a crime headline replaced. Translations of the brief
 * and article are deleted so they are made again from the corrected text.
 *
 * Usage: node scripts/apply-showroom-crime-rule.mjs <neighborhood_id> <YYYY-MM-DD> [--confirm]
 * Dry run by default: prints what would change.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { createJiti } = require('jiti');
const jiti = createJiti(join(root, 'scripts', 'x.js'), { alias: { '@': join(root, 'src') } });
const C = await jiti.import(join(root, 'src/lib/showroom-crime-rule.ts'));

const [id, date] = process.argv.slice(2);
const confirm = process.argv.includes('--confirm');
if (!id || !date) { console.error('usage: <neighborhood_id> <YYYY-MM-DD> [--confirm]'); process.exit(1); }

const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const get = async (p) => { const r = await fetch(`${U}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
const patch = async (p, body) => { const r = await fetch(`${U}/rest/v1/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`); };
const del = async (p) => { const r = await fetch(`${U}/rest/v1/${p}`, { method: 'DELETE', headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status}`); };

const toHeadline = (t) => t.replace(/\b([a-z])/g, (m) => m.toUpperCase());

const [b] = await get(`neighborhood_briefs?neighborhood_id=eq.${id}&brief_date=eq.${date}&select=id,enriched_content,enriched_categories,subject_teaser,email_teaser,neighborhoods(name,city)`);
if (!b) throw new Error('no brief');
const place = [b.neighborhoods?.name, b.neighborhoods?.city].filter(Boolean);
const wrapped = b.enriched_categories && !Array.isArray(b.enriched_categories);
const cats = wrapped ? b.enriched_categories.categories : b.enriched_categories;
const r = C.applyShowroomCrimeRule({ body: b.enriched_content || '', categories: cats, subjectTeaser: b.subject_teaser, emailTeaser: b.email_teaser, placeNames: place });
console.log(`${id} ${date}: dropped [${r.dropped.join(' | ')}] moved down [${r.movedDown.join(' | ')}] teaser ${b.subject_teaser} -> ${r.subjectTeaser}`);
if (!r.changed) { console.log('nothing to change'); process.exit(0); }

const arts = await get(`articles?neighborhood_id=eq.${id}&article_type=eq.brief_summary&slug=like.*brief-${date}*&select=id,slug,headline,body_text`);
const outs = arts.map((a) => {
  const ar = C.applyShowroomCrimeRule({ body: a.body_text || '', categories: cats, subjectTeaser: b.subject_teaser, emailTeaser: null, placeNames: place });
  const prefix = (a.headline || '').includes(':') ? a.headline.slice(0, a.headline.indexOf(':') + 1) : '';
  const headline = r.teaserReplaced && r.subjectTeaser && prefix ? `${prefix} ${toHeadline(r.subjectTeaser)}` : a.headline;
  console.log(`  article ${a.slug}\n    headline: ${a.headline} -> ${headline}\n    sections: ${(ar.body.match(/\[\[[^\]]+\]\]/g) || []).join(' ')}`);
  return { a, body: ar.body, headline };
});
if (!confirm) { console.log('\nDry run. Add --confirm to write.'); process.exit(0); }

await patch(`neighborhood_briefs?id=eq.${b.id}`, {
  enriched_content: r.body,
  enriched_categories: wrapped ? { ...b.enriched_categories, categories: r.categories } : r.categories,
  subject_teaser: r.subjectTeaser,
  email_teaser: r.emailTeaser,
});
await del(`brief_translations?brief_id=eq.${b.id}`);
for (const o of outs) {
  await patch(`articles?id=eq.${o.a.id}`, { body_text: o.body, headline: o.headline });
  await del(`article_translations?article_id=eq.${o.a.id}`);
}
console.log('Written.');
