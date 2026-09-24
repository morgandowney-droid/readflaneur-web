#!/usr/bin/env node
/**
 * Tests for the tiered sourcing standard (src/lib/source-standard.ts), the
 * shadow second-source search (src/lib/second-source.ts) and the source
 * archive's path and idempotency helpers (src/lib/source-archive.ts).
 *
 *   node scripts/test-source-standard.mjs
 *
 * The modules are compiled from the shipped source first (same pattern as
 * test-source-check.mjs). No network, no database, no model calls: the
 * search, the page fetcher and the storage are injected.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = mkdtempSync(join(tmpdir(), 'source-standard-'));
writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');
const tscPath = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(
  process.execPath,
  [
    tscPath,
    'src/lib/source-standard.ts', 'src/lib/second-source.ts', 'src/lib/source-archive.ts',
    'src/lib/source-repair.ts', 'src/lib/source-links.ts', 'src/lib/source-check.ts', 'src/lib/grok-citations.ts',
    'src/lib/edition-rules.ts', 'src/lib/sensitive-story-rules.ts', 'src/lib/fold-text.ts',
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
const S = require(join(outDir, 'source-standard.js'));
const SS = require(join(outDir, 'second-source.js'));
const A = require(join(outDir, 'source-archive.js'));
const C = require(join(outDir, 'source-check.js'));
const R = require(join(outDir, 'source-repair.js'));

let passed = 0;
let failed = 0;
const queue = [];
const test = (name, fn) => queue.push([name, fn]);

const htmlPage = (url, text) => ({ ok: true, status: 200, finalUrl: url, contentType: 'text/html', html: `<p>${text}</p>`, text, bytes: text.length, truncated: false });
const deadPage = (url, status = 404) => ({ ok: false, status, finalUrl: url, contentType: 'text/html', html: null, text: null, bytes: 0, truncated: false, error: `HTTP ${status}` });

// ─── Stakes ────────────────────────────────────────────────────────────────

const stakes = (entity, context, flag) => S.classifyStakes({ entity, context, flag });

test('LOW: an opening, a menu, a market, an exhibition, a council agenda', () => {
  for (const [e, c] of [
    ['Riverside Cafe opens', 'Riverside Cafe opens on Main Street on 3 October with a breakfast menu.'],
    ['Farmers market returns', 'The Saturday farmers market returns to the square from 9am.'],
    ['New exhibition at the gallery', 'The gallery opens a show of 40 prints by local artists on 12 October.'],
    ['Council agenda', 'The council meets on Tuesday to consider a new cycle lane on Station Road and the library hours.'],
    ['Roadworks on High Street', 'Resurfacing works close High Street between 8pm and 6am for two weeks.'],
  ]) {
    const r = stakes(e, c);
    assert.equal(r.stakes, 'low', `${e}: ${r.reasons.join(',')}`);
  }
});

test('HIGH: crime, court, death, injury (shared fixed rules)', () => {
  assert.deepEqual(stakes('Man charged', 'A man has been charged with burglary after police were called.').reasons.includes('crime-or-court'), true);
  assert.equal(stakes('Crash on N20', 'Two people were injured in a car crash on the N20.').stakes, 'high');
  assert.equal(stakes('Tributes paid', 'Tributes were paid after the death of a well-known publican.').stakes, 'high');
});

test('HIGH: a private individual described as one', () => {
  assert.ok(stakes('Local woman wins award', 'A local woman, aged 34, won the county baking prize.').reasons.includes('private-individual'));
  assert.ok(stakes('Resident speaks out', 'John Murphy, 62, of Main Street said the road floods every winter.').reasons.includes('private-individual'));
  // An address with a house number is not a person with an age.
  assert.equal(stakes('Pop Up Chic', 'A pop-up market has opened at Calle Serrano, 40, offering clothing from independent designers.').stakes, 'low');
  assert.equal(stakes('Bakery moves', 'The bakery moves to Main Street, 12, next month.').stakes, 'low');
  // A named chef or artist is not flagged on the name alone.
  assert.equal(stakes('Chef Maria Rossi opens trattoria', 'Maria Rossi opens her trattoria on Via Roma on Friday.').stakes, 'low');
});

test('HIGH: allegations, health claims, money disputes, contested and political claims', () => {
  assert.ok(stakes('Landlord accused', 'Tenants allege the landlord ignored repairs.').reasons.includes('allegation'));
  assert.ok(stakes('Boil water notice', 'Irish Water issued a boil water notice for 3,000 homes.').reasons.includes('health-claim'));
  assert.ok(stakes('Shop closes owing suppliers', 'The shop went into liquidation owing suppliers EUR 200,000.').reasons.includes('money-dispute'));
  assert.ok(stakes('Objections to housing plan', 'Residents lodged objections to the 200-home plan.').reasons.includes('contested'));
  assert.ok(stakes('By-election date set', 'The by-election will be held on 14 November.').reasons.includes('contested'));
});

test('LOW words that only look risky stay LOW (cured meats, cancer charity run, birthday party)', () => {
  assert.equal(stakes('Deli adds cured meats', 'The deli now stocks cured meats from Parma.').stakes, 'low');
  assert.equal(stakes('Charity run', 'A 5km run on Sunday raises money for a cancer charity.').stakes, 'low');
  assert.equal(stakes('Birthday party at the library', 'The library celebrates its 50th birthday with a party on Saturday.').stakes, 'low');
});

test('the editor desk flag is read when present: sensitive or controversy makes HIGH', () => {
  assert.equal(stakes('Market day', 'The market is on Saturday.', { sensitive: true, reasons: [] }).stakes, 'high');
  assert.ok(stakes('Market day', 'The market is on Saturday.', { sensitive: false, reasons: ['controversy'] }).reasons.includes('flag-controversy'));
  assert.equal(stakes('Market day', 'The market is on Saturday.', { sensitive: false, reasons: ['named-person', 'money'] }).stakes, 'low');
});

// ─── Source kinds ──────────────────────────────────────────────────────────

const kind = (url, name, entity, recordCountry = '') => S.standardSourceKind({ name: name || url, url }, { entity, recordCountry });

test('source kinds: official, record, primary, outlet, social, low-trust', () => {
  assert.equal(kind('https://www.birmingham.gov.uk/news/1', 'Birmingham City Council'), 'official');
  assert.equal(kind('https://www.corkcoco.ie/en/news/x', 'Cork County Council'), 'official');
  assert.equal(kind('https://greatershepparton.com.au/news/x', 'Greater Shepparton City Council'), 'official');
  assert.equal(kind('https://www.irishtimes.com/news/x', 'The Irish Times', '', 'ireland'), 'record');
  assert.equal(kind('https://www.irishtimes.com/news/x', 'The Irish Times', '', ''), 'outlet');
  assert.equal(kind('https://www.riversidecafe.ie/menu', 'Riverside Cafe', 'Riverside Cafe'), 'primary');
  assert.equal(kind('https://www.eventbrite.ie/e/quiz-night-123', 'Eventbrite', 'Quiz night'), 'primary');
  assert.equal(kind('https://www.instagram.com/riversidecafe_ie/', 'Instagram', 'Riverside Cafe'), 'primary');
  assert.equal(kind('https://www.instagram.com/somefoodie/', 'Instagram', 'Riverside Cafe'), 'social');
  assert.equal(kind('https://www.limerickleader.ie/news/x-123', 'Limerick Leader', 'Something'), 'outlet');
  assert.equal(kind('https://en.wikipedia.org/wiki/Limerick', 'Wikipedia', 'Limerick'), 'low-trust');
  assert.equal(kind('https://allevents.in/cork/quiz', 'AllEvents', 'Quiz'), 'low-trust');
});

// ─── The standard ──────────────────────────────────────────────────────────

const chk = (url, verdict = 'verified', extra = {}) => ({ name: extra.name ?? null, url, origin: extra.origin ?? 'tool', verdict, matched: extra.matched ?? [{ kind: 'entity' }] });
const LOW_STORY = { entity: 'Riverside Cafe opens', context: 'Riverside Cafe opens on Main Street on 3 October.' };
const HIGH_STORY = { entity: 'Man charged after burglary', context: 'A man has been charged with burglary on Main Street, police said.' };

test('LOW meets with one confirmed source; not with none', () => {
  assert.equal(S.decideStandard(LOW_STORY, [chk('https://www.limerickleader.ie/news/cafe-123')]).meets, true);
  const none = S.decideStandard(LOW_STORY, []);
  assert.equal(none.meets, false);
  assert.equal(none.failure, 'no-confirmed-source');
});

test('confirmation: verified, or partial with the subject; never a model URL', () => {
  assert.equal(S.isConfirmed(chk('https://a.ie/x', 'partial', { matched: [{ kind: 'date' }] })), false);
  assert.equal(S.isConfirmed(chk('https://a.ie/x', 'partial', { matched: [{ kind: 'entity' }] })), true);
  assert.equal(S.isConfirmed(chk('https://a.ie/x', 'verified', { origin: 'model' })), false);
  assert.equal(S.isConfirmed(chk('https://a.ie/x', 'not_found')), false);
  assert.equal(S.isConfirmed(chk('https://a.ie/x', 'fetch_failed')), false);
  assert.equal(S.decideStandard(LOW_STORY, [chk('https://a.ie/x', 'verified', { origin: 'model' })]).meets, false);
});

test('LOW on an aggregator or someone else\'s social post alone does not meet', () => {
  const d = S.decideStandard(LOW_STORY, [chk('https://allevents.in/limerick/x')]);
  assert.equal(d.meets, false);
  assert.equal(d.failure, 'only-unacceptable-sources');
  assert.equal(S.decideStandard(LOW_STORY, [chk('https://www.facebook.com/groups/12345/posts/9')]).meets, false);
});

test('HIGH needs two independent confirmed sources', () => {
  const one = S.decideStandard(HIGH_STORY, [chk('https://www.limerickleader.ie/news/x-1')]);
  assert.equal(one.stakes, 'high');
  assert.equal(one.meets, false);
  assert.equal(one.failure, 'high-needs-second-independent-source');
  assert.equal(S.needsSecondSource(one), true);
  // Two pages on one domain are one source.
  const sameSite = S.decideStandard(HIGH_STORY, [chk('https://www.limerickleader.ie/news/x-1'), chk('https://limerickleader.ie/news/x-2')]);
  assert.equal(sameSite.meets, false);
  assert.equal(sameSite.independentCount, 1);
  const two = S.decideStandard(HIGH_STORY, [chk('https://www.limerickleader.ie/news/x-1'), chk('https://www.limerickpost.ie/2026/09/24/x')]);
  assert.equal(two.meets, true);
  assert.equal(two.basis, 'two-independent');
});

test('HIGH meets on one confirmed official source or newspaper of record', () => {
  const official = S.decideStandard(HIGH_STORY, [chk('https://www.garda.ie/en/about-us/our-departments/office-of-corporate-communications/press-releases/x', 'verified', { name: 'An Garda Siochana' })]);
  assert.equal(official.meets, true);
  assert.equal(official.basis, 'official');
  const record = S.decideStandard(HIGH_STORY, [chk('https://www.rte.ie/news/munster/2026/0924/x/')], { recordCountry: 'ireland' });
  assert.equal(record.meets, true);
  assert.equal(record.basis, 'record');
  // The same page without the country's record list is one outlet.
  assert.equal(S.decideStandard(HIGH_STORY, [chk('https://www.rte.ie/news/munster/2026/0924/x/')]).meets, false);
});

test('an unconfirmed second source does not count', () => {
  const d = S.decideStandard(HIGH_STORY, [chk('https://www.limerickleader.ie/news/x-1'), chk('https://www.limerickpost.ie/x', 'not_found')]);
  assert.equal(d.meets, false);
});

test('evaluateBrief joins stored check rows to stories by index and marks unchecked stories', () => {
  const out = S.evaluateBrief(
    [{ index: 0, entity: LOW_STORY.entity, context: LOW_STORY.context }, { index: 1, entity: HIGH_STORY.entity, context: HIGH_STORY.context }, { index: 2, entity: 'x', context: 'y' }],
    [
      { story_index: 0, source_name: 'Limerick Leader', source_url: 'https://www.limerickleader.ie/news/cafe-1', source_origin: 'tool', verdict: 'verified', matched_facts: [{ kind: 'entity' }] },
      { story_index: 1, source_name: 'Limerick Leader', source_url: 'https://www.limerickleader.ie/news/x-1', source_origin: 'tool', verdict: 'verified', matched_facts: [{ kind: 'entity' }] },
      { story_index: 1, source_name: null, source_url: '', source_origin: null, verdict: 'no_source', matched_facts: null },
    ],
    { recordCountry: 'ireland' },
  );
  assert.equal(out[0].decision.meets, true);
  assert.equal(out[1].decision.meets, false);
  assert.equal(out[1].checks.length, 1);
  assert.equal(out[2].checked, false);
});

test('tallyStandard splits by stakes and counts cuts before and after the second search', () => {
  const t = S.tallyStandard([
    { stakes: 'low', meets: true, second_tried: false, second_found: false, meets_after_second: true },
    { stakes: 'low', meets: false, second_tried: false, second_found: false, meets_after_second: false },
    { stakes: 'high', meets: false, second_tried: true, second_found: true, meets_after_second: true },
    { stakes: 'high', meets: false, second_tried: true, second_found: false, meets_after_second: false },
  ]);
  assert.equal(t.stories, 4);
  assert.equal(t.meets, 1);
  assert.equal(t.cut, 3);
  assert.equal(t.high.second_found, 1);
  assert.equal(t.meets_after_second, 2);
  assert.equal(t.low.cut, 1);
  assert.equal(t.meets_pct, 25);
});

// ─── Second-source candidates and search ───────────────────────────────────

test('second-source candidate: different registrable domain, not social, not aggregator, not a section front', () => {
  const existing = ['https://www.limerickleader.ie/news/x-9172511'];
  assert.equal(S.acceptableSecondCandidate('https://www.limerickpost.ie/2026/09/24/crash-on-n20/', existing, R.isListingUrl), true);
  assert.equal(S.acceptableSecondCandidate('https://limerickleader.ie/news/other-story-123', existing, R.isListingUrl), false);
  assert.equal(S.acceptableSecondCandidate('https://www.facebook.com/limerickpost/posts/1', existing, R.isListingUrl), false);
  assert.equal(S.acceptableSecondCandidate('https://allevents.in/limerick/x', existing, R.isListingUrl), false);
  assert.equal(S.acceptableSecondCandidate('https://www.limerickpost.ie/news/', existing, R.isListingUrl), false);
});

const TARGET = () => ({
  key: 'b1:3',
  entity: 'Collision on N20 at Croom',
  context: 'Two people were injured in a collision on the N20 at Croom on Tuesday evening, gardai said.',
  firstPublication: 'Limerick Leader',
  existingUrls: ['https://www.limerickleader.ie/news/collision-n20-9172511'],
});

test('findSecondSources: one batched search, only tool pages, checked on the page, first site excluded', async () => {
  let calls = 0;
  const search = async (reqs) => {
    calls++;
    assert.equal(reqs.length, 1);
    assert.equal(reqs[0].publication, 'Limerick Leader');
    return [
      { uri: 'https://www.limerickleader.ie/news/collision-follow-up-9172600' },
      { uri: 'https://www.limerickpost.ie/2026/09/24/two-injured-in-n20-collision-at-croom/' },
      { uri: 'https://www.limerickpost.ie/news/' },
    ];
  };
  const fetched = [];
  const fetcher = async (u) => {
    fetched.push(u);
    return htmlPage(u, 'Two people were injured in a collision on the N20 at Croom on Tuesday evening. Gardai attended.');
  };
  const res = await SS.findSecondSources([TARGET()], { search, fetcher, placeNames: ['Limerick'] });
  assert.equal(calls, 1);
  assert.deepEqual(fetched, ['https://www.limerickpost.ie/2026/09/24/two-injured-in-n20-collision-at-croom/']);
  assert.equal(res.found, 1);
  assert.equal(res.outcomes[0].url, 'https://www.limerickpost.ie/2026/09/24/two-injured-in-n20-collision-at-croom/');
});

test('findSecondSources: a page that does not carry the story is rejected; at most four stories per search', async () => {
  const search = async () => [{ uri: 'https://www.limerickpost.ie/2026/09/24/county-final-preview/' }];
  const fetcher = async (u) => htmlPage(u, 'Patrickswell meet Na Piarsaigh in the county final on Sunday.');
  const res = await SS.findSecondSources([TARGET()], { search, fetcher });
  assert.equal(res.found, 0);
  assert.equal(res.outcomes[0].verdict, 'rejected');

  const many = Array.from({ length: 6 }, (_, i) => ({ ...TARGET(), key: `b1:${i}` }));
  let seen = 0;
  const r2 = await SS.findSecondSources(many, { search: async (reqs) => { seen = reqs.length; return []; }, fetcher });
  assert.equal(seen, 4);
  assert.equal(r2.outcomes.filter((o) => o.verdict === 'not_tried').length, 2);
});

test('findSecondSources never throws when the search fails', async () => {
  const res = await SS.findSecondSources([TARGET()], { search: async () => { throw new Error('quota'); }, fetcher: async (u) => htmlPage(u, '') });
  assert.equal(res.searchFailed, true);
  assert.equal(res.found, 0);
});

// ─── Archive helpers ───────────────────────────────────────────────────────

test('snapshot key: <edition>/<local date>/<sha1(url)>, same as the shadow check', () => {
  const url = 'https://www.limerickleader.ie/news/x-1';
  assert.equal(A.snapshotKey('ie-county-limerick', '2026-09-24', url), `ie-county-limerick/2026-09-24/${C.urlSha1(url)}`);
  assert.equal(A.snapshotKey('ie-county-limerick', '2026-09-24', ` ${url} `), A.snapshotKey('ie-county-limerick', '2026-09-24', url));
});

test('snapshotDate uses the edition\'s local day, not UTC', () => {
  // 22:30 UTC on the 24th is the 25th in Sydney and the 24th in Dublin.
  assert.equal(A.snapshotDate('2026-09-24T22:30:00Z', 'Australia/Sydney'), '2026-09-25');
  assert.equal(A.snapshotDate('2026-09-24T22:30:00Z', 'Europe/Dublin'), '2026-09-24');
  assert.equal(A.snapshotDate('2026-09-24T22:30:00Z', 'Not/AZone'), '2026-09-24');
});

test('isArchivableSource skips search links, grounding redirects, placeholders and non-URLs', () => {
  assert.equal(A.isArchivableSource({ source_url: 'https://www.limerickleader.ie/news/x', source_name: 'Limerick Leader' }), true);
  assert.equal(A.isArchivableSource({ source_url: 'https://www.google.com/search?q=limerick', source_name: 'Google' }), false);
  assert.equal(A.isArchivableSource({ source_url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', source_name: 'x.ie' }), false);
  assert.equal(A.isArchivableSource({ source_url: 'https://a.ie/x', source_name: 'Provided Context' }), false);
  assert.equal(A.isArchivableSource({ source_url: null, source_name: 'Limerick Leader' }), false);
});

test('existingSnapshot finds a stored copy (html or json) only when the text is there too', () => {
  const key = 'e/2026-09-24/abc';
  assert.deepEqual(A.existingSnapshot(new Set(['abc.html', 'abc.txt']), key), { raw: 'e/2026-09-24/abc.html', text: 'e/2026-09-24/abc.txt' });
  assert.deepEqual(A.existingSnapshot(new Set(['abc.json', 'abc.txt']), key), { raw: 'e/2026-09-24/abc.json', text: 'e/2026-09-24/abc.txt' });
  assert.equal(A.existingSnapshot(new Set(['abc.html']), key), null);
  assert.equal(A.existingSnapshot(new Set(['abd.html', 'abd.txt']), key), null);
});

test('failurePatch: 404/410 is dead on any attempt; other failures only on the final attempt', () => {
  assert.deepEqual(A.failurePatch({ status: 404, error: 'HTTP 404' }, false), { source_url_dead: true, source_snapshot: 'dead: HTTP 404', archived_at: null });
  assert.equal(A.failurePatch({ status: 410 }, false).source_url_dead, true);
  assert.equal(A.failurePatch({ status: 403, error: 'HTTP 403' }, false), null);
  assert.deepEqual(A.failurePatch({ status: 403, error: 'HTTP 403' }, true), { source_snapshot: 'unreadable: HTTP 403', archived_at: null });
  assert.equal(A.failurePatch({ status: null, error: 'timeout' }, true).source_snapshot, 'unreadable: timeout');
});

function memoryStore(initial = {}) {
  const folders = new Map(Object.entries(initial).map(([k, v]) => [k, new Set(v)]));
  const uploads = [];
  const updates = [];
  return {
    uploads, updates,
    async list(folder) { return new Set(folders.get(folder) || []); },
    async upload(path, body, type) { uploads.push({ path, type, size: body.length }); const f = path.slice(0, path.lastIndexOf('/')); if (!folders.has(f)) folders.set(f, new Set()); folders.get(f).add(path.slice(path.lastIndexOf('/') + 1)); return null; },
    async updateRow(id, patch) { updates.push({ id, patch }); return null; },
  };
}

test('archiveSourceRows: fetches once per URL, stores html + text, writes paths on every row', async () => {
  const store = memoryStore();
  const url = 'https://www.limerickleader.ie/news/x-1';
  let fetches = 0;
  const stats = await A.archiveSourceRows(
    [{ id: 'r1', source_url: url, source_name: 'Limerick Leader' }, { id: 'r2', source_url: url, source_name: 'Limerick Leader' }, { id: 'r3', source_url: 'https://www.google.com/search?q=x', source_name: 'Google' }],
    { neighborhoodId: 'ie-county-limerick', date: '2026-09-24' },
    store,
    { fetcher: async (u) => { fetches++; return htmlPage(u, 'text of the page'); }, now: () => new Date('2026-09-24T10:00:00Z') },
  );
  const key = A.snapshotKey('ie-county-limerick', '2026-09-24', url);
  assert.equal(fetches, 1);
  assert.equal(stats.skipped, 1);
  assert.equal(stats.archived, 2);
  assert.deepEqual(store.uploads.map((u) => u.path).sort(), [`${key}.html`, `${key}.txt`]);
  assert.equal(store.updates.length, 2);
  assert.deepEqual(store.updates[0].patch, { archive_url: `source-snapshots/${key}.html`, source_snapshot: `source-snapshots/${key}.txt`, archived_at: '2026-09-24T10:00:00.000Z', source_url_dead: false });
});

test('archiveSourceRows: reuses a snapshot already stored that day (no fetch, no upload)', async () => {
  const url = 'https://www.limerickleader.ie/news/x-1';
  const key = A.snapshotKey('ie-county-limerick', '2026-09-24', url);
  const base = key.slice(key.lastIndexOf('/') + 1);
  const store = memoryStore({ 'ie-county-limerick/2026-09-24': [`${base}.html`, `${base}.txt`] });
  let fetches = 0;
  const stats = await A.archiveSourceRows([{ id: 'r1', source_url: url, source_name: 'Limerick Leader' }], { neighborhoodId: 'ie-county-limerick', date: '2026-09-24' }, store, { fetcher: async (u) => { fetches++; return htmlPage(u, 'x'); } });
  assert.equal(fetches, 0);
  assert.equal(store.uploads.length, 0);
  assert.equal(stats.reused, 1);
  assert.equal(store.updates[0].patch.archive_url, `source-snapshots/${key}.html`);
});

test('archiveSourceRows: dead URL marked, transient failure deferred, never throws', async () => {
  const store = memoryStore();
  const stats = await A.archiveSourceRows(
    [{ id: 'd', source_url: 'https://a.ie/gone', source_name: 'Site A' }, { id: 't', source_url: 'https://b.ie/slow', source_name: 'Site B' }, { id: 'x', source_url: 'https://c.ie/boom', source_name: 'Site C' }],
    { neighborhoodId: 'e', date: '2026-09-24' },
    store,
    { fetcher: async (u) => { if (u.includes('gone')) return deadPage(u, 410); if (u.includes('boom')) throw new Error('socket hang up'); return deadPage(u, 503); } },
  );
  assert.equal(stats.dead, 1);
  assert.equal(stats.deferred, 2);
  assert.deepEqual(store.updates.map((u) => u.id), ['d']);
  assert.equal(store.updates[0].patch.source_url_dead, true);
});

test('archiveSourceRows: respects the time budget (nothing fetched when none is left)', async () => {
  const store = memoryStore();
  let fetches = 0;
  const stats = await A.archiveSourceRows([{ id: 'r', source_url: 'https://a.ie/x', source_name: 'Site A' }], { neighborhoodId: 'e', date: '2026-09-24' }, store, { budgetMs: 1000, fetcher: async (u) => { fetches++; return htmlPage(u, 'x'); } });
  assert.equal(fetches, 0);
  assert.equal(stats.deferred, 1);
});

for (const [name, fn] of queue) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
