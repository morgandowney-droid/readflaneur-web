#!/usr/bin/env node
/**
 * Tests for how story sources are settled at enrichment
 * (src/lib/source-links.ts cleanStorySources with `traced`, and
 * src/lib/source-repair.ts).
 *
 *   node scripts/test-source-settling.mjs
 *
 * The rule under test: the writing model never supplies a URL. A URL it
 * writes that no search tool returned is dropped; a URL a tool returned is
 * kept; a story that names a real publication with no page may get one from
 * ONE repair search, and only when the page is on that publication's own host
 * and the deterministic fact check finds the story on it.
 *
 * Modules are compiled from the shipped source (same pattern as
 * test-source-check.mjs). No network, no database, no model calls: the repair
 * search and page fetcher are injected.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = mkdtempSync(join(tmpdir(), 'source-settling-'));
writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');
const tscPath = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(
  process.execPath,
  [
    tscPath, 'src/lib/source-repair.ts', 'src/lib/source-links.ts', 'src/lib/source-check.ts', 'src/lib/grok-citations.ts',
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
const L = require(join(outDir, 'source-links.js'));
const R = require(join(outDir, 'source-repair.js'));

let passed = 0;
let failed = 0;
const queue = [];
const test = (name, fn) => queue.push([name, fn]);

const htmlPage = (url, text) => ({ ok: true, status: 200, finalUrl: url, contentType: 'text/html', html: `<p>${text}</p>`, text, bytes: text.length, truncated: false });
const deadPage = (url) => ({ ok: false, status: 404, finalUrl: url, contentType: 'text/html', html: null, text: null, bytes: 0, truncated: false, error: 'HTTP 404' });

const MILAN_STORY = () => ({
  entity: 'Brera Design Week (Via Solferino)',
  context: 'Brera Design Week opens on 14 October with 120 studios along Via Solferino, the organisers said.',
  source: { name: 'Il Giorno', url: null },
});

// ─── Dropping untraced URLs ────────────────────────────────────────────────

test('a model-written URL that no search returned is dropped, the name kept, and recorded', async () => {
  const stories = [{ entity: 'Castello Sforzesco reopening', context: 'The courtyard reopens on Friday.', source: { name: 'Il Giorno', url: 'https://www.ilgiorno.it/milano/cronaca/castello-2026-invented' } }];
  const stats = await L.cleanStorySources(stories, [], { gathered: [], traced: [] });
  assert.equal(stats.modelUrlsDropped, 1);
  assert.equal(stories[0].source.name, 'Il Giorno');
  assert.equal(stories[0].source.url, null);
  assert.equal(stories[0].source.origin, undefined);
  assert.equal(stories[0].droppedModelUrl, 'https://www.ilgiorno.it/milano/cronaca/castello-2026-invented');
});

test('a URL present in the gathered pages is kept and marked tool', async () => {
  const page = { uri: 'https://www.ilgiorno.it/milano/castello', domain: 'ilgiorno.it', origin: 'gemini_search' };
  const stories = [{ entity: 'Castello Sforzesco reopening', context: 'x', source: { name: 'Il Giorno', url: 'https://ilgiorno.it/milano/castello/' } }];
  const stats = await L.cleanStorySources(stories, [], { gathered: [page], traced: [page] });
  L.markSourceOrigins(stories, [page]);
  assert.equal(stats.modelUrlsDropped, 0);
  assert.equal(stories[0].source.url, 'https://ilgiorno.it/milano/castello/');
  assert.equal(stories[0].source.origin, 'tool');
  assert.equal(stories[0].droppedModelUrl, undefined);
});

test('a URL written in the raw gathered facts counts as traced', async () => {
  const facts = L.pagesFromText('- Fair on Sunday at the Green https://example.org/fair (Source: Example)');
  const stories = [{ entity: 'Green Fair', context: 'On Sunday.', source: { name: 'Example', url: 'https://example.org/fair' } }];
  const stats = await L.cleanStorySources(stories, [], { gathered: facts, traced: facts });
  assert.equal(stats.modelUrlsDropped, 0);
  assert.equal(stories[0].source.url, 'https://example.org/fair');
});

test('an X post URL is traced by status id whatever its URL form', async () => {
  const page = { uri: 'https://x.com/i/status/1850000000000000001', origin: 'grok' };
  const stories = [{ entity: 'Road closure', context: 'x', source: { name: '@TfL', url: 'https://twitter.com/TfL/status/1850000000000000001' } }];
  const stats = await L.cleanStorySources(stories, [], { traced: [page] });
  assert.equal(stats.modelUrlsDropped, 0);
});

test('after a drop, the story is matched to a read page that names it (origin story-match)', async () => {
  const page = {
    uri: 'https://www.comune.milano.it/brera-design-week', domain: 'comune.milano.it', origin: 'gemini_search',
    supports: ['Brera Design Week opens on 14 October with 120 studios along Via Solferino.'],
  };
  const stories = [{ ...MILAN_STORY(), source: { name: 'Il Giorno', url: 'https://www.ilgiorno.it/invented' } }];
  const stats = await L.cleanStorySources(stories, [], { gathered: [page], traced: [page], placeNames: ['Brera', 'Milan'] });
  assert.equal(stats.modelUrlsDropped, 1);
  assert.equal(stats.storiesMatched, 1);
  assert.equal(stories[0].source.origin, 'story-match');
  assert.equal(stories[0].source.url, 'https://www.comune.milano.it/brera-design-week');
  // The page is not Il Giorno's, so the source is named for the page.
  assert.equal(stories[0].source.name, 'comune.milano.it');
});

test('without `traced` (older callers) URLs are left as they were', async () => {
  const stories = [{ entity: 'x', context: 'y', source: { name: 'Il Giorno', url: 'https://www.ilgiorno.it/a' } }];
  const stats = await L.cleanStorySources(stories, [], {});
  assert.equal(stats.modelUrlsDropped, 0);
  assert.equal(stories[0].source.url, 'https://www.ilgiorno.it/a');
});

// ─── Publication host matching ─────────────────────────────────────────────

test('hostMatchesPublication: the publication\'s own host only', () => {
  assert.equal(L.hostMatchesPublication('Il Giorno', 'https://www.ilgiorno.it/milano/x'), true);
  assert.equal(L.hostMatchesPublication('The Irish Times', 'https://www.irishtimes.com/news/x'), true);
  assert.equal(L.hostMatchesPublication('CBC News', 'https://www.cbc.ca/news/canada/x'), true);
  assert.equal(L.hostMatchesPublication('Vorarlberger Nachrichten', 'https://www.vn.at/lokal/x'), true);
  assert.equal(L.hostMatchesPublication('Vorarlberger Nachrichten', 'https://www.vol.at/lokal/x'), false);
  assert.equal(L.hostMatchesPublication('Daily Echo', 'https://www.dailyecho.co.uk/news/x'), true);
  assert.equal(L.hostMatchesPublication('Il Giorno', 'https://www.corriere.it/milano/x'), false);
  assert.equal(L.hostMatchesPublication('Il Giorno', 'https://milano.repubblica.it/ilgiorno-said'), false);
  assert.equal(L.hostMatchesPublication('Provided Context', 'https://provided-context.com/x'), false);
});

// ─── Repair ────────────────────────────────────────────────────────────────

test('isListingUrl: section fronts and pagers are not sources, articles are', () => {
  assert.equal(R.isListingUrl('https://www.echolive.ie/corknews/'), true);
  assert.equal(R.isListingUrl('https://www.irishexaminer.com/news/cork-news/'), true);
  assert.equal(R.isListingUrl('https://www.gandercanada.com/news/?page=13'), true);
  assert.equal(R.isListingUrl('https://www.vn.at/'), true);
  assert.equal(R.isListingUrl('https://www.irishexaminer.com/news/munster/arid-41168128.html'), false);
  assert.equal(R.isListingUrl('https://www.corkcity.ie/en/cork-city-development-plan/'), false);
  assert.equal(R.isListingUrl('https://www.thevillagetrip.com/event/framing-the-village-independent-thinkers/'), false);
});

test('placeholder names never trigger a repair search', async () => {
  let called = 0;
  const stories = [
    { entity: 'Market day', context: 'Saturday.', source: { name: 'Local News Compilation', url: null } },
    { entity: 'Council vote', context: 'Tuesday.', source: { name: 'Provided Context', url: null } },
    { entity: 'No source', context: 'x', source: null },
  ];
  const stats = await R.repairStorySources(stories, { search: async () => { called++; return []; } });
  assert.equal(called, 0);
  assert.equal(stats.eligible, 0);
  assert.equal(R.repairEligible(stories).length, 0);
});

test('a story that already has a traced URL is not repaired', async () => {
  let called = 0;
  const stories = [{ entity: 'x', context: 'y', source: { name: 'Il Giorno', url: 'https://www.ilgiorno.it/a', origin: 'tool' } }];
  await R.repairStorySources(stories, { search: async () => { called++; return []; } });
  assert.equal(called, 0);
});

test('repair attaches a verified page on the named publication\'s host (origin repair)', async () => {
  const story = MILAN_STORY();
  const url = 'https://www.ilgiorno.it/milano/brera-design-week-2026';
  let requests = null;
  const stats = await R.repairStorySources([story], {
    search: async (reqs) => { requests = reqs; return [{ uri: url, domain: 'ilgiorno.it', origin: 'repair' }]; },
    fetcher: async (u) => htmlPage(u, 'Brera Design Week apre il 14 October: 120 studios along Via Solferino in Brera.'),
    placeNames: ['Brera', 'Milan'],
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].publication, 'Il Giorno');
  assert.equal(stats.accepted, 1);
  assert.deepEqual(story.source, { name: 'Il Giorno', url, origin: 'repair' });
});

test('repair accepts a partial page that names the subject of the story', async () => {
  const story = MILAN_STORY();
  const url = 'https://www.ilgiorno.it/milano/brera';
  const stats = await R.repairStorySources([story], {
    search: async () => [{ uri: url }],
    fetcher: async (u) => htmlPage(u, 'Brera Design Week: the Via Solferino studios will open soon.'),
    placeNames: ['Brera', 'Milan'],
  });
  assert.equal(stats.accepted, 1);
  assert.equal(stats.outcomes[0].verdict, 'partial');
});

test('repair rejects a partial page with one stray fact and no subject (a section front)', async () => {
  const story = MILAN_STORY();
  const stats = await R.repairStorySources([story], {
    search: async () => [{ uri: 'https://www.ilgiorno.it/milano/' }],
    fetcher: async (u) => htmlPage(u, 'Milano news. Traffic on Via Solferino. Weather. Sport.'),
    placeNames: ['Brera', 'Milan'],
  });
  assert.equal(stats.accepted, 0);
  assert.equal(story.source.url, null);
});

test('repair also checks pages the pipeline already read on the named host', async () => {
  const story = MILAN_STORY();
  const url = 'https://www.ilgiorno.it/milano/brera-design-week-programma';
  const stats = await R.repairStorySources([story], {
    search: async () => [],
    knownPages: [{ uri: url, origin: 'gemini_search' }, { uri: 'https://www.corriere.it/x', origin: 'gemini_search' }],
    fetcher: async (u) => htmlPage(u, 'Brera Design Week opens on 14 October with 120 studios along Via Solferino.'),
    placeNames: ['Brera', 'Milan'],
  });
  assert.equal(stats.accepted, 1);
  assert.equal(stats.candidatePages, 1);
  assert.equal(story.source.url, url);
});

test('name-match needs the read page to name the story, not just the publication', async () => {
  const section = { uri: 'https://www.irishexaminer.com/news/cork-news/', domain: 'irishexaminer.com', origin: 'gemini_search', supports: ['Cork council approves new cycle lane on the Western Road.'] };
  const article = { uri: 'https://www.irishexaminer.com/news/munster/arid-1.html', domain: 'irishexaminer.com', origin: 'gemini_search', supports: ['Two red panda cubs have been born at Fota Wildlife Park.'] };
  const a = [{ entity: 'Red Panda Cubs at Fota Wildlife Park', context: 'Two cubs were born.', source: { name: 'Irish Examiner', url: null } }];
  const b = [{ entity: 'Beach Barbecue Regulations', context: 'New rules for disposable barbecues.', source: { name: 'Irish Examiner', url: null } }];
  await L.cleanStorySources(a, [], { gathered: [section, article], traced: [section, article], placeNames: ['Cork'] });
  await L.cleanStorySources(b, [], { gathered: [section], traced: [section], placeNames: ['Cork'] });
  assert.equal(a[0].source.url, article.uri);
  assert.equal(a[0].source.origin, 'name-match');
  assert.equal(b[0].source.url, null, 'a section front that does not name the story is not attached');
});

test('repair rejects a page on another host even when every fact is on it', async () => {
  const story = MILAN_STORY();
  const stats = await R.repairStorySources([story], {
    search: async () => [{ uri: 'https://www.corriere.it/milano/brera-design-week' }],
    fetcher: async (u) => htmlPage(u, 'Brera Design Week opens on 14 October with 120 studios along Via Solferino.'),
    placeNames: ['Brera', 'Milan'],
  });
  assert.equal(stats.accepted, 0);
  assert.equal(stats.candidatePages, 0);
  assert.equal(story.source.url, null);
  assert.equal(stats.outcomes[0].verdict, 'no_candidate');
});

test('repair rejects a page on the right host that does not report the story', async () => {
  const story = MILAN_STORY();
  const stats = await R.repairStorySources([story], {
    search: async () => [{ uri: 'https://www.ilgiorno.it/sport/inter-milan' }],
    fetcher: async (u) => htmlPage(u, 'Inter beat Lazio two nil at San Siro on Sunday night.'),
    placeNames: ['Brera', 'Milan'],
  });
  assert.equal(stats.accepted, 0);
  assert.equal(story.source.url, null);
  assert.equal(stats.outcomes[0].verdict, 'rejected');
});

test('repair rejects a dead page and a page that redirects off the publication\'s host', async () => {
  const a = MILAN_STORY();
  const b = MILAN_STORY();
  await R.repairStorySources([a], { search: async () => [{ uri: 'https://www.ilgiorno.it/x' }], fetcher: async (u) => deadPage(u), placeNames: ['Brera'] });
  assert.equal(a.source.url, null);
  await R.repairStorySources([b], {
    search: async () => [{ uri: 'https://www.ilgiorno.it/y' }],
    fetcher: async () => htmlPage('https://consent.example.net/wall', 'Brera Design Week opens on 14 October with 120 studios along Via Solferino.'),
    placeNames: ['Brera'],
  });
  assert.equal(b.source.url, null);
});

test('a failing or slow search never throws and leaves the stories as they were', async () => {
  const a = MILAN_STORY();
  const s1 = await R.repairStorySources([a], { search: async () => { throw new Error('RESOURCE_EXHAUSTED'); } });
  assert.equal(s1.searchFailed, true);
  assert.equal(a.source.url, null);
  const b = MILAN_STORY();
  const t0 = Date.now();
  const s2 = await R.repairStorySources([b], { search: () => new Promise(() => {}), budgetMs: 2500 });
  assert.equal(s2.timedOut, true);
  assert.ok(Date.now() - t0 < 4000, 'bounded by the budget');
  assert.equal(b.source.url, null);
});

test('repair is capped at eight stories per brief, in one search call', async () => {
  let calls = 0;
  let seen = 0;
  const stories = Array.from({ length: 11 }, (_, i) => ({ entity: `Story number ${i} Alpha`, context: 'x', source: { name: 'Il Giorno', url: null } }));
  const stats = await R.repairStorySources(stories, { search: async (reqs) => { calls++; seen = reqs.length; return []; } });
  assert.equal(calls, 1);
  assert.equal(seen, 8);
  assert.equal(stats.eligible, 11);
  assert.equal(stats.attempted, 8);
});

// ─── Read boundaries ───────────────────────────────────────────────────────

test('extractArticleSources never emits a model URL (older briefs)', async () => {
  const rows = await L.extractArticleSources([{ stories: [
    { source: { name: 'Il Giorno', url: 'https://www.ilgiorno.it/invented', origin: 'model' } },
    { source: { name: 'Corriere', url: 'https://www.corriere.it/real', origin: 'repair' } },
  ] }]);
  assert.equal(rows[0].source_name, 'Il Giorno');
  assert.equal(rows[0].source_url, undefined);
  assert.equal(rows[1].source_url, 'https://www.corriere.it/real');
});

test('publishableCategories withholds model URLs and strips droppedModelUrl', () => {
  const out = L.publishableCategories([{ name: 'News', stories: [
    { entity: 'a', droppedModelUrl: 'https://x.example/dead', source: { name: 'A', url: 'https://a.example/1', origin: 'model' } },
    { entity: 'b', source: { name: 'B', url: 'https://b.example/1', origin: 'tool' } },
  ] }]);
  assert.equal(out[0].stories[0].droppedModelUrl, undefined);
  assert.equal(out[0].stories[0].source.url, null);
  assert.equal(out[0].stories[1].source.url, 'https://b.example/1');
  assert.equal(L.publishableSourceUrl({ url: 'https://a.example', origin: 'model' }), null);
  assert.equal(L.publishableSourceUrl({ url: 'https://a.example', origin: 'repair' }), 'https://a.example');
});

for (const [name, fn] of queue) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${String(err.message).split('\n').join('\n       ')}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
