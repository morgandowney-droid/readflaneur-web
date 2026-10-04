/**
 * Archive quality run for one archive map (src/lib/archive/quality.ts):
 *   node scripts/archive/quality.mjs --country de [--date YYYY-MM-DD]
 * Writes the country scorecard and every production pair for that map to
 * archive_quality. The date defaults to the map's local today.
 */
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const file of [join(os.homedir(), '.env'), join(root, '.env.local')]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const cc = args.country || 'de';
const COUNTRY = { de: 'Germany', uk: 'United Kingdom', ie: 'Ireland', au: 'Australia', nz: 'New Zealand', 'us-nyc': 'United States', 'us-dc': 'United States' }[cc];
const require = createRequire(import.meta.url);
const { createJiti } = require('jiti');
const jiti = createJiti(join(root, 'scripts', 'x.js'), { alias: { '@': join(root, 'src') } });
const P = await jiti.import(join(root, 'src/lib/archive/pipeline.ts'));
const Q = await jiti.import(join(root, 'src/lib/archive/quality.ts'));
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const areas = JSON.parse(fs.readFileSync(join(root, 'data', 'areas', `${cc}.json`), 'utf8')).areas.map((a) => ({ ...a, country: COUNTRY }));
const date = args.date || P.localDate(P.tzFor(areas[0]));
const save = async (scope, key, metrics) => {
  const { error } = await admin.from('archive_quality').upsert({ check_date: date, scope, key, metrics }, { onConflict: 'check_date,scope,key' });
  if (error) console.error(scope, key, error.message);
};

const card = await Q.scorecard(admin, COUNTRY, areas, date);
await save('scorecard', cc, card);
console.log(JSON.stringify({ scorecard: cc, coverage: card.coverage, stories_per_brief: card.stories_per_brief, confirmed_share: card.confirmed_share, story_names_area: card.story_names_area, cost_per_brief: card.cost_per_brief }));
for (const pair of Q.QUALITY_PAIRS.filter((p) => p.country === cc)) {
  try {
    const m = await Q.comparePair(admin, pair, areas, COUNTRY, date);
    await save('pair', pair.production, m);
    console.log(JSON.stringify({ pair: pair.production, prod: m.production_stories, arch: m.archive_stories, confirmed: [m.production_confirmed, m.archive_confirmed], overlap: m.overlap, judge: m.judge?.preferred ?? m.judge?.error ?? null }));
  } catch (err) {
    console.error(pair.production, err instanceof Error ? err.message : String(err));
  }
}
