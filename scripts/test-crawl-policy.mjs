/** Tests for src/lib/crawl-policy.ts. Run: node scripts/test-crawl-policy.mjs */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { createJiti } = createRequire(import.meta.url)('jiti');
const C = await createJiti(join(root, 'scripts', 'x.js'), { alias: { '@': join(root, 'src') } }).import(join(root, 'src/lib/crawl-policy.ts'));
let passed = 0; const test = (n, f) => { f(); passed++; console.log(`ok - ${n}`); };

test('a site that disallows everyone is not read', () => {
  const g = C.parseRobots('User-agent: *\nDisallow: /');
  assert.equal(C.robotsAllows(g, '/news/story'), false);
});

test('longest match wins, and allow wins a tie', () => {
  const g = C.parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/press\n');
  assert.equal(C.robotsAllows(g, '/private/notes'), false);
  assert.equal(C.robotsAllows(g, '/private/press/release'), true);
  assert.equal(C.robotsAllows(g, '/public'), true);
});

test('a group naming our agent replaces the * group', () => {
  const g = C.parseRobots('User-agent: *\nAllow: /\n\nUser-agent: FlaneurSourceCheck\nDisallow: /');
  assert.equal(C.robotsAllows(g, '/anything'), false);
});

test('AI-crawler blocks for other agents do not apply to us, the * group does', () => {
  const g = C.parseRobots('User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n');
  assert.equal(C.robotsAllows(g, '/news'), true);
  assert.equal(C.robotsAllows(g, '/admin/x'), false);
});

test('wildcards and end anchors', () => {
  const g = C.parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /search?\n');
  assert.equal(C.robotsAllows(g, '/files/agenda.pdf'), false);
  assert.equal(C.robotsAllows(g, '/files/agenda.pdf?x=1'), true);
  assert.equal(C.robotsAllows(g, '/search?q=x'), false);
});

test('an empty Disallow allows everything', () => {
  assert.equal(C.robotsAllows(C.parseRobots('User-agent: *\nDisallow:'), '/x'), true);
});

test('TDMRep file, header and meta tag are honoured', () => {
  assert.equal(C.tdmRepReserves([{ location: '/news/*', 'tdm-reservation': 1 }], '/news/a'), true);
  assert.equal(C.tdmRepReserves([{ location: '/news/*', 'tdm-reservation': 0 }], '/news/a'), false);
  assert.equal(C.pageReservesTdm(new Headers({ 'TDM-Reservation': '1' }), null), true);
  assert.equal(C.pageReservesTdm(null, '<meta name="tdm-reservation" content="1">'), true);
  assert.equal(C.pageReservesTdm(null, '<meta name="description" content="1">'), false);
});

console.log(`\n${passed} passed`);
