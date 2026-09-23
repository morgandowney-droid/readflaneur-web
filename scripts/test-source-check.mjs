#!/usr/bin/env node
/**
 * Tests for the deterministic source check (src/lib/source-check.ts) and the
 * story-to-page source matching that feeds it (src/lib/source-links.ts,
 * src/lib/grok-citations.ts).
 *
 *   node scripts/test-source-check.mjs
 *
 * The modules are compiled from the shipped source to a temp dir first (same
 * pattern as test-edition-rules.mjs), so the tests exercise exactly the code
 * the pipeline runs. No network, no database, no model calls.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = mkdtempSync(join(tmpdir(), 'source-check-'));
writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');
const tscPath = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(
  process.execPath,
  [
    tscPath, 'src/lib/source-check.ts', 'src/lib/source-links.ts', 'src/lib/grok-citations.ts',
    '--outDir', outDir,
    '--module', 'commonjs',
    '--target', 'es2020',
    '--moduleResolution', 'node',
    '--skipLibCheck',
    '--types', 'node',
  ],
  { stdio: 'inherit' },
);
const require = createRequire(join(outDir, 'x.js'));
const C = require(join(outDir, 'source-check.js'));
const L = require(join(outDir, 'source-links.js'));
const G = require(join(outDir, 'grok-citations.js'));

let passed = 0;
let failed = 0;
const queue = [];
function test(name, fn) {
  queue.push([name, fn]);
}
async function run(name, fn) {
  if (name === null) { console.log(`
${fn}`); return; }
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${err.message.split('\n').join('\n       ')}`);
  }
}
const kinds = (facts, kind) => facts.filter(f => f.kind === kind);

test(null, 'Numbers');
test('1,000 / 1.000 / 1000 / 1 000 are one value', () => {
  for (const s of ['1,000', '1.000', '1000', '1 000']) assert.deepEqual(C.numberValues(s), ['1000'], s);
});
test('3,5 and 3.5 are the same decimal', () => {
  assert.deepEqual(C.numberValues('3,5'), ['3.5']);
  assert.deepEqual(C.numberValues('3.5'), ['3.5']);
});
test('1.234,56 and 1,234.56 are the same value', () => {
  assert.deepEqual(C.numberValues('1.234,56'), ['1234.56']);
  assert.deepEqual(C.numberValues('1,234.56'), ['1234.56']);
});
test('a figure written 12.500 EUR on the page matches €12,500 in the story', () => {
  const r = C.checkStoryAgainstText(
    { entity: 'Seehotel Kaiserstrand', context: 'The Seehotel Kaiserstrand garden sold for €12,500.' },
    'Der Garten des Seehotel Kaiserstrand wurde um 12.500 Euro verkauft.',
  );
  assert.equal(kinds(r.facts, 'number')[0].found, true);
  assert.equal(r.verdict, 'verified');
});
test('percentages keep their value across formats', () => {
  const r = C.checkStoryAgainstText(
    { entity: 'SO41 house prices', context: 'Prices fell 6.7% in a year.' },
    'Property prices in SO41 have fallen by 6,7 % over the last twelve months.',
  );
  assert.equal(kinds(r.facts, 'number')[0].found, true);
});
test('small bare integers and years are not facts', () => {
  const f = C.extractFacts({ entity: 'Test', context: 'Open 3 days a week since 2019, with 45 seats.' });
  assert.deepEqual(kinds(f, 'number').map(x => x.text), ['45']);
});

test(null, 'Dates and times');
test('English month-day and day-month give the same key', () => {
  assert.equal(C.extractDates('September 25')[0].key, '9-25');
  assert.equal(C.extractDates('25 September 2026')[0].key, '9-25');
  assert.equal(C.extractDates('Sept. 25th')[0].key, '9-25');
});
test('Italian month names', () => {
  assert.equal(C.extractDates('sabato 27 settembre alle 17.30')[0].key, '9-27');
  assert.equal(C.extractDates('dal 2 ottobre')[0].key, '10-2');
  assert.equal(C.extractDates('12 dic.')[0].key, '12-12');
});
test('German month names and numeric dates', () => {
  assert.equal(C.extractDates('am 25. September')[0].key, '9-25');
  assert.equal(C.extractDates('Freitag, 9. Oktober 2026')[0].key, '10-9');
  assert.equal(C.extractDates('am 3. März')[0].key, '3-3');
  assert.equal(C.extractDates('Fr, 25.09.')[0].key, '9-25');
  assert.equal(C.extractDates('25.09.2026')[0].key, '9-25');
});
test('Spanish, French and Portuguese month names', () => {
  assert.equal(C.extractDates('25 de septiembre')[0].key, '9-25');
  assert.equal(C.extractDates('le 1er octobre')[0].key, '10-1');
  assert.equal(C.extractDates('25 de setembro')[0].key, '9-25');
});
test('a decimal is not a date', () => {
  assert.equal(C.extractDates('rated 3.5 by guests').length, 0);
});
test('ISO dates in JSON-LD count', () => {
  assert.equal(C.extractDates('"startDate":"2026-09-26T19:00"')[0].key, '9-26');
});
test('an English date in the story matches an Italian date on the page', () => {
  const r = C.checkStoryAgainstText(
    { entity: 'Mercatone dell\'Antiquariato', context: 'The antiques fair returns on Sunday, September 27.' },
    'Il Mercatone dell’Antiquariato del Naviglio Grande torna domenica 27 settembre 2026.',
  );
  assert.equal(kinds(r.facts, 'date')[0].found, true);
  assert.equal(r.verdict, 'verified');
});
test('7:00 PM in the story matches 19:00 or 19 Uhr on the page, and is one fact', () => {
  const f = C.extractFacts({ entity: 'Cantores Brigantini', context: 'They sing at 7:00 PM.' });
  assert.equal(kinds(f, 'time').length, 1);
  const a = C.checkStoryAgainstText({ entity: 'Cantores Brigantini', context: 'They sing at 7:00 PM.' }, 'Cantores Brigantini, Beginn 19 Uhr');
  assert.equal(kinds(a.facts, 'time')[0].found, true);
  const b = C.checkStoryAgainstText({ entity: 'Cantores Brigantini', context: 'They sing at 7:00 PM.' }, 'Cantores Brigantini ore 19.00');
  assert.equal(kinds(b.facts, 'time')[0].found, true);
});

test(null, 'Names');
test('accent-insensitive: Sala Lopez matches Sala López', () => {
  const r = C.checkStoryAgainstText(
    { entity: 'Maria Escarmiento at Sala Lopez', context: 'A new show by Maria Escarmiento opens at Sala Lopez.' },
    'Exposición de María Escarmiento en la Sala López del Ayuntamiento de Zaragoza.',
  );
  assert.ok(r.facts.filter(x => x.kind !== 'date').every(x => x.found), JSON.stringify(r.missing));
  assert.equal(r.verdict, 'verified');
});
test('Gaißau and Gaissau fold to the same name', () => {
  const r = C.checkStoryAgainstText({ entity: 'Gemeinde Gaissau', context: '' }, 'Die Gemeinde Gaißau lädt ein.');
  assert.equal(r.verdict, 'verified');
});
test('an English generic word does not block a page in another language', () => {
  const r = C.checkStoryAgainstText({ entity: 'Pablo Gargallo Museum', context: '' }, 'El Museo Pablo Gargallo abre una nueva sala.');
  assert.equal(r.facts[0].found, true);
});
test('possessive with or without the apostrophe', () => {
  const r = C.checkStoryAgainstText({ entity: "Chalk's Gallery (Wonderland Exhibition)", context: '' }, 'Chalks Gallery presents Wonderland');
  assert.equal(r.facts[0].found, true);
});
test('names are extracted from runs of capitalised words, sentence starts dropped', () => {
  const names = C.extractNames('On Friday The White Hart hosts Sven Berlin at St Barbe Museum.');
  assert.ok(names.includes('White Hart'), names.join(' | '));
  assert.ok(names.includes('Sven Berlin'), names.join(' | '));
  assert.ok(names.some(n => n.startsWith('St Barbe')), names.join(' | '));
});
test('the place name of the edition is not a fact', () => {
  const f = C.extractFacts({ entity: 'Lymington House Prices', context: 'Lymington New Forest prices fell.' }, ['Lymington', 'Hampshire']);
  assert.equal(f.find(x => x.kind === 'entity'), undefined);
});

test(null, 'Verdicts');
test('verified: every fact on the page', () => {
  const story = {
    entity: 'Chalk\'s Gallery (Wonderland Exhibition)',
    context: 'Chalk\'s Gallery opens Wonderland on Friday, October 2, with a Meet the Artists evening on October 9 from 6 PM.',
  };
  const page = '<html><head><title>Wonderland | Chalks Gallery Lymington</title><script>var x="October 30"</script></head>' +
    '<body><nav>Home Shop</nav><h1>Wonderland</h1><p>Our winter exhibition runs from 2 October 2026 to 30 January 2027.</p>' +
    '<p>Meet the Artists: Friday 9 October, 6pm - 8pm. Free.</p></body></html>';
  const r = C.checkStoryAgainstText(story, C.htmlToText(page), ['Lymington']);
  assert.equal(r.verdict, 'verified', JSON.stringify(r.missing));
});
test('not_found: the page is about something else', () => {
  const r = C.checkStoryAgainstText(
    { entity: 'Mountain Warehouse (Expansion)', context: 'Mountain Warehouse opened a larger store at 78-80 High Street on September 21.' },
    'Lymington Town Council: agenda for the planning committee meeting. Apologies were received from two councillors.',
    ['Lymington'],
  );
  assert.equal(r.verdict, 'not_found', JSON.stringify(r.facts));
});
test('partial: the subject is there but the figures are not', () => {
  const r = C.checkStoryAgainstText(
    { entity: 'Hurst Spit to Lymington Strategy', context: 'The exhibition runs until October 14 and the plan costs £32 million.' },
    'The Hurst Spit to Lymington Strategy sets out coastal management for the next 100 years.',
    ['Lymington'],
  );
  assert.equal(r.verdict, 'partial');
});
test('htmlToText drops scripts and styles and keeps JSON-LD values', () => {
  const t = C.htmlToText('<script>alert("September 25")</script><style>.a{}</style><script type="application/ld+json">{"startDate":"2026-10-09T18:00"}</script><p>Hello&nbsp;there &amp; you</p>');
  assert.ok(!/alert/.test(t));
  assert.ok(/2026-10-09/.test(t));
  assert.ok(/Hello there & you/.test(t));
});

test(null, 'Story-to-page matching (live path, no model)');
const pages = [
  { uri: 'https://www.dailyecho.co.uk/news/mountain-warehouse-lymington', domain: 'dailyecho.co.uk', supports: [
    'Mountain Warehouse has opened a new, larger store at 78-80 High Street, Lymington, in the former Poundland premises.',
  ] },
  { uri: 'https://www.newforestnpa.gov.uk/pannage', domain: 'newforestnpa.gov.uk', supports: [
    'The New Forest Pannage Season 2026 is running from Monday, September 14, to Sunday, November 29.',
  ] },
];
test('a story is matched to the page whose grounded passage names it', () => {
  const m = L.matchStoryToPages({ entity: 'Mountain Warehouse (Expansion)', context: 'Now at 78-80 High Street.' }, pages, ['Lymington']);
  assert.equal(m?.chunk.domain, 'dailyecho.co.uk');
});
test('a story no read page mentions gets nothing', () => {
  const m = L.matchStoryToPages({ entity: 'The White Hart (Award)', context: 'Three stars from the SRA.' }, pages, ['Lymington']);
  assert.equal(m, null);
});
test('a descriptive entity with no subject left gets nothing rather than a guess', () => {
  const m = L.matchStoryToPages({ entity: 'Lymington House Prices', context: '' }, pages, ['Lymington']);
  assert.equal(m, null);
});
test('cleanStorySources replaces a placeholder with a matched page and marks the origin', async () => {
  const stories = [
    { entity: 'Pannage Season', context: 'Pigs are out in the New Forest until November 29.', source: { name: 'Provided Context', url: null } },
    { entity: 'The White Hart', context: 'Award.', source: { name: 'Internal Note', url: null } },
  ];
  await L.cleanStorySources(stories, [], { gathered: pages, placeNames: ['Lymington'] });
  assert.equal(stories[0].source?.url, 'https://www.newforestnpa.gov.uk/pannage');
  assert.equal(stories[0].source?.origin, 'story-match');
  assert.equal(stories[1].source, null);
});
test('markSourceOrigins: a model-written URL in no tool metadata is "model"', () => {
  const stories = [
    { source: { name: 'Daily Echo', url: 'https://www.dailyecho.co.uk/news/mountain-warehouse-lymington/' } },
    { source: { name: 'Made Up', url: 'https://example.com/invented' } },
  ];
  L.markSourceOrigins(stories, pages);
  assert.equal(stories[0].source.origin, 'tool');
  assert.equal(stories[1].source.origin, 'model');
});
test('grounding supports are attached to the chunks they cite', () => {
  const chunks = L.extractGroundingChunks({ candidates: [{ groundingMetadata: {
    groundingChunks: [{ web: { uri: 'https://a.example/x', title: 'a.example' } }, { web: { uri: 'https://b.example/y', title: 'b.example' } }],
    groundingSupports: [{ segment: { text: 'Cantores Brigantini sing at the vorarlberg museum.' }, groundingChunkIndices: [1] }],
  } }] }, 'gemini_search');
  assert.equal(chunks[1].supports?.[0], 'Cantores Brigantini sing at the vorarlberg museum.');
  assert.equal(chunks[0].supports, undefined);
});
test('Grok citations are read from url_citation annotations, and inline markers tie a claim', () => {
  const data = { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'x', annotations: [
    { type: 'url_citation', url: 'https://x.com/i/status/1', start_index: 0, end_index: 0, title: 'https://x.com/i/status/1' },
  ] }] }] };
  const raw = 'The clinic opened today at Chilliwack General Hospital.[[1]](https://x.com/markstrahl/status/2)\n\nNext.';
  const c = G.extractGrokCitations(data, raw);
  assert.deepEqual(c.map(x => x.url), ['https://x.com/i/status/1', 'https://x.com/markstrahl/status/2']);
  assert.equal(c[1].supports?.[0], 'The clinic opened today at Chilliwack General Hospital');
});
test('pagesFromText keeps the fact line as the passage', () => {
  const p = L.pagesFromText('- Fair on Sunday https://example.org/fair (Source: Example)\n- Other');
  assert.equal(p[0].uri, 'https://example.org/fair');
  assert.ok(p[0].supports[0].includes('Fair on Sunday'));
});

for (const [name, fn] of queue) await run(name, fn);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
