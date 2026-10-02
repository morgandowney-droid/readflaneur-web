/**
 * How much of each published brief came from the Grok (X) search, and how much
 * from the Gemini web search?
 *
 * The stored brief content holds Grok's text first and Gemini's facts after
 * "ALSO NOTED:". For each published story (enriched_categories), its
 * distinctive words (capitalised words and figures, place names excluded) are
 * looked for in each part: a story is Grok-only, Gemini-only, both, or neither.
 * Grok text that reports nothing ("no new", "quiet", "minimal") is counted as
 * an empty search.
 *
 * Usage: node scripts/measure-grok-contribution.mjs [days=7]
 * Read-only.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The same matching the brief cron uses to decide (src/lib/grok-contribution.ts).
const { createJiti } = createRequire(import.meta.url)('jiti');
const G = await createJiti(join(root, 'scripts', 'x.js'), { alias: { '@': join(root, 'src') } }).import(join(root, 'src/lib/grok-contribution.ts'));
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, H = { apikey: K, Authorization: `Bearer ${K}` };
const get = async (u) => { for (let i = 0; i < 6; i++) { try { const r = await fetch(u, { headers: H }); const j = await r.json(); if (Array.isArray(j)) return j; } catch { /* retry */ } await new Promise((s) => setTimeout(s, 3000)); } throw new Error(`failed: ${u}`); };

const days = Number(process.argv[2] || 7);
const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

const hoods = new Map((await get(`${U}/rest/v1/neighborhoods?is_active=eq.true&select=id,name,city,country,region`)).map((n) => [n.id, n]));
let briefs = [], off = 0;
for (;;) {
  const page = await get(`${U}/rest/v1/neighborhood_briefs?brief_date=gte.${since}&model=eq.grok-4-1-fast&enriched_content=not.is.null&select=neighborhood_id,brief_date,content,enriched_categories&order=brief_date&limit=500&offset=${off}`);
  briefs.push(...page);
  if (page.length < 500) break;
  off += 500;
}

const STOP = new Set(['the', 'this', 'that', 'with', 'from', 'today', 'tonight', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'local', 'residents', 'city', 'town', 'council', 'street', 'road', 'free', 'new', 'event', 'festival', 'market']);
const EMPTY = /\b(no (new|major|significant|fresh|notable)|nothing (new|major|notable)|quiet (day|week|thursday|friday|monday|tuesday|wednesday|saturday|sunday)|calm (day|thursday|friday)|activity (stayed|remained) (minimal|quiet|low)|subdued|no (local )?(announcements|developments|updates))\b/i;
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function distinctive(text, placeWords) {
  const caps = (text.match(/\b[\p{Lu}][\p{L}'’-]{3,}/gu) || []).map(fold).filter((w) => !STOP.has(w) && !placeWords.has(w));
  const nums = (text.match(/\b\d{2,}\b/g) || []).filter((n) => !/^(19|20)\d\d$/.test(n));
  return Array.from(new Set([...caps, ...nums]));
}
const coverage = (words, hay) => words.length ? words.filter((w) => hay.includes(w)).length / words.length : 0;

const tally = new Map();
const add = (key, field, n = 1) => { const t = tally.get(key) || { briefs: 0, grokEmpty: 0, noGemini: 0, stories: 0, grokOnly: 0, geminiOnly: 0, both: 0, neither: 0 }; t[field] += n; tally.set(key, t); };

for (const b of briefs) {
  const n = hoods.get(b.neighborhood_id);
  if (!n) continue;
  const group = n.country || '?';
  const split = (b.content || '').split(/\n\s*ALSO NOTED:\s*\n/);
  const grokText = fold(split[0] || '');
  const geminiText = fold(split.slice(1).join(' '));
  const placeWords = new Set(fold(`${n.name} ${n.city} ${n.country}`).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  for (const key of [group, 'ALL']) {
    add(key, 'briefs');
    if (EMPTY.test(split[0] || '') || grokText.trim().length < 80) add(key, 'grokEmpty');
    if (split.length < 2) add(key, 'noGemini');
  }
  const c = G.storyContributions(b.content, b.enriched_categories, n);
  for (const key of [group, 'ALL']) {
    add(key, 'stories', c.stories); add(key, 'grokOnly', c.grokOnly); add(key, 'geminiOnly', c.geminiOnly); add(key, 'both', c.both); add(key, 'neither', c.neither);
  }
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
console.log(`Briefs with a Grok search, published since ${since}: ${briefs.length}\n`);
console.log('group'.padEnd(14), 'briefs', 'grokEmpty', 'stories', 'grokOnly', 'geminiOnly', 'both', 'neither');
for (const [k, t] of [...tally.entries()].sort((a, b) => (a[0] === 'ALL' ? -1 : b[0] === 'ALL' ? 1 : b[1].briefs - a[1].briefs))) {
  console.log(k.padEnd(14), String(t.briefs).padStart(6), pct(t.grokEmpty, t.briefs).padStart(9), String(t.stories).padStart(7), pct(t.grokOnly, t.stories).padStart(8), pct(t.geminiOnly, t.stories).padStart(10), pct(t.both, t.stories).padStart(4), pct(t.neither, t.stories).padStart(7));
}
