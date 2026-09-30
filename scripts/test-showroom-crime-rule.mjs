/**
 * Tests for src/lib/showroom-crime-rule.ts. Run: node scripts/test-showroom-crime-rule.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { createJiti } = require('jiti');
const jiti = createJiti(join(root, 'scripts', 'x.js'), { alias: { '@': join(root, 'src') } });
const C = await jiti.import(join(root, 'src/lib/showroom-crime-rule.ts'));

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

const body = [
  'Good morning, Warren.',
  '',
  '[[I-78 Police Chase]]',
  'On Thursday four men from Newark were charged after a police pursuit through Warren and Bernards Township.',
  '',
  '[[Get Your Shots Today]]',
  'A flu clinic runs this afternoon at the court room on Mountain Blvd.',
  '',
  '[[Arrest in Shooting]]',
  'Police arrested Javieon Abbott in the shooting of a 13-year-old.',
  '',
  '[[Walk It Out]]',
  'Wellness walks are planned for October.',
  '',
  'Enjoy your Wednesday.',
].join('\n');
const categories = [{ name: 'News', stories: [
  { entity: 'I-78 Police Chase', context: 'Four men from Newark were charged after a police pursuit.' },
  { entity: 'Flu Clinic', context: 'A flu clinic runs this afternoon.' },
  { entity: 'Shooting Arrest', context: 'Police arrested Javieon Abbott in the shooting.' },
  { entity: 'Wellness Walks', context: 'Walks in October.' },
] }];

test('a named crime story is dropped and an unnamed one goes last, sign-off kept at the end', () => {
  const r = C.applyShowroomCrimeRule({ body, categories, subjectTeaser: 'interstate pursuit', emailTeaser: null, placeNames: ['Warren', 'New Jersey'] });
  const heads = r.body.match(/\[\[[^\]]+\]\]/g);
  assert.deepEqual(heads, ['[[Get Your Shots Today]]', '[[Walk It Out]]', '[[I-78 Police Chase]]']);
  assert.ok(r.body.startsWith('Good morning, Warren.'));
  assert.ok(r.body.trim().endsWith('Enjoy your Wednesday.'));
  assert.ok(!r.body.includes('Javieon'));
  const ents = r.categories.flatMap((c) => c.stories.map((s) => s.entity));
  assert.deepEqual(ents, ['Flu Clinic', 'Wellness Walks', 'I-78 Police Chase']);
});

test('a headline drawn from a crime story is replaced from the first other story', () => {
  const r = C.applyShowroomCrimeRule({ body, categories, subjectTeaser: 'interstate pursuit', emailTeaser: 'Four men charged after a chase', placeNames: ['Warren'] });
  assert.equal(r.subjectTeaser, 'flu clinic');
  assert.equal(r.emailTeaser, null);
  assert.ok(r.teaserReplaced);
});

test('an edition with no crime is returned unchanged', () => {
  const plain = 'Good morning.\n\n[[Market]]\nThe market opens.\n\n[[Walks]]\nWalks in October.';
  const r = C.applyShowroomCrimeRule({ body: plain, categories: [{ name: 'N', stories: [{ entity: 'Market', context: 'opens' }] }], subjectTeaser: 'market day', emailTeaser: null, placeNames: [] });
  assert.equal(r.body, plain);
  assert.equal(r.changed, false);
});

test('name detection ignores places, institutions and line breaks', () => {
  assert.equal(C.namesAPerson('Police Chase\nYou might have noticed', []), false);
  assert.equal(C.namesAPerson('through Warren and Bernards Township onto Interstate 78', ['Warren']), false);
  assert.equal(C.namesAPerson('the death of Reece Salmon on Lloyd Baker Street', []), true);
});

test('only the showroom editions carry the rule', () => {
  assert.ok(C.hasShowroomCrimeRule('newjersey-warren'));
  assert.ok(C.hasShowroomCrimeRule('louisiana-shreveport'));
  assert.equal(C.hasShowroomCrimeRule('milan-brera'), false);
});

console.log(`\n${passed} passed`);
