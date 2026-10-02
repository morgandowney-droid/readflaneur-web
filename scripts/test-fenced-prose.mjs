/** Tests for dropFencedOutMentions (look-ahead-events.ts). Run: node scripts/test-fenced-prose.mjs */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { createJiti } = createRequire(import.meta.url)('jiti');
const L = await createJiti(join(root, 'scripts', 'x.js'), { alias: { '@': join(root, 'src') } }).import(join(root, 'src/lib/look-ahead-events.ts'));
const ev = (name, location) => ({ date: '2026-10-02', name, location });
const prose = [
  '[[Today, Friday, October 2]]',
  'You can find fresh local produce at the Wochenmarkt Oberkassel from 14:00 to 18:00.',
  '',
  'The Tonhalle Düsseldorf presents a Star Talk with Adam Fischer at 19:00.',
  '',
  'Later, the Düsseldorfer Schauspielhaus shows "Fanny und Alexander" at 19:00.',
  '',
  '[[Saturday, October 3]]',
  'The Tonhalle Düsseldorf hosts another concert.',
].join('\n');
const kept = [ev('Wochenmarkt Oberkassel', 'Barbarossaplatz')];
const out = [ev('Star Talk with Adam Fischer', 'Tonhalle Düsseldorf'), ev('Fanny und Alexander', 'Düsseldorfer Schauspielhaus')];
const r = L.dropFencedOutMentions(prose, out, kept);
assert.equal(r.dropped.length, 3);
assert.ok(r.prose.includes('Wochenmarkt Oberkassel'));
assert.ok(!r.prose.includes('Tonhalle'));
assert.ok(!r.prose.includes('[[Saturday, October 3]]'), 'an emptied day section goes');
assert.deepEqual(L.dropFencedOutMentions(prose, [], kept), { prose, dropped: [] });
console.log('ok - prose about fenced-out events is removed; in-district prose stays\n\n1 passed');
