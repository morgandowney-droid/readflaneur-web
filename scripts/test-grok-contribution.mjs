/** Tests for src/lib/grok-contribution.ts. Run: node scripts/test-grok-contribution.mjs */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { createJiti } = createRequire(import.meta.url)('jiti');
const G = await createJiti(join(root, 'scripts', 'x.js'), { alias: { '@': join(root, 'src') } }).import(join(root, 'src/lib/grok-contribution.ts'));
let passed = 0; const test = (n, f) => { f(); passed++; console.log(`ok - ${n}`); };

const place = { name: 'Clerkenwell', city: 'London', country: 'UK' };
const brief = (grok, gemini, stories) => ({ content: `${grok}\n\nALSO NOTED:\n${gemini}`, enriched_categories: [{ name: 'News', stories }] });

test('a story is attributed to the search whose text carries its names', () => {
  const b = brief('The Horseshoe pub on Clerkenwell Close closes on October 9.', 'Exmouth Market traders face higher rents.', [
    { entity: 'The Horseshoe', context: 'The Horseshoe on Clerkenwell Close closes on October 9.' },
    { entity: 'Exmouth Market Squeezed', context: 'Exmouth Market traders face higher rents.' },
  ]);
  const c = G.storyContributions(b.content, b.enriched_categories, place);
  assert.equal(c.grokOnly, 1); assert.equal(c.geminiOnly, 1);
});

const empty = brief('No new events reported. Local X activity stayed minimal.', 'Kunsthaus Bregenz offers free admission for KUB Night.', [{ entity: 'Kunsthaus Bregenz', context: 'KUB Night free admission.' }]);
const useful = brief('Genuss-Baeckerei Tillmann filed for insolvency, 105 jobs at risk.', 'Market on Saturday.', [{ entity: 'Genuss-Baeckerei Tillmann', context: 'Tillmann insolvency puts 105 jobs at risk.' }]);

test('an off-market edition with no Grok-only stories runs Grok only on its probe day', () => {
  const ed = { id: 'vorarlberg-bregenz', name: 'Bregenz', city: 'Vorarlberg', country: 'Austria' };
  const days = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
  const decisions = days.map((d) => G.decideGrok(ed, d, Array(10).fill(empty)));
  assert.equal(decisions.filter((x) => x.useGrok).length, 2, 'two probe days in fourteen');
  assert.ok(decisions.every((x) => x.useGrok ? x.reason === 'weekly-probe' : x.reason === 'off-market-no-recent-grok-story'));
});

test('an edition where Grok is the only source of enough stories keeps it, in any market', () => {
  const ed = { id: 'sauerland-balve', name: 'Balve', city: 'Sauerland', country: 'Germany' };
  const r = G.decideGrok(ed, '2026-10-02', [useful, useful, empty, empty]);
  assert.equal(r.useGrok, true); assert.match(r.reason, /^grok-only-/);
});

test('one stray Grok-only story is not enough', () => {
  const ed = { id: 'ie-county-down', name: 'County Down', city: 'Down', country: 'Ireland' };
  const many = Array(9).fill(brief('quiet', 'Story A B C at Newry. Story D at Bangor.', [{ entity: 'Newry Story', context: 'Story A B C at Newry.' }, { entity: 'Bangor Story', context: 'Story D at Bangor.' }]));
  const r = G.decideGrok(ed, '2026-10-02', [useful, ...many]);
  assert.equal(r.useGrok, G.isGrokProbeDay(ed.id, '2026-10-02'));
});

test('a new edition in a Grok market keeps Grok until it has history', () => {
  const ed = { id: 'louisiana-shreveport', name: 'Shreveport', city: 'Louisiana', country: 'USA' };
  assert.deepEqual(G.decideGrok(ed, '2026-10-02', [empty]), { useGrok: true, reason: 'grok-market' });
});

console.log(`\n${passed} passed`);
