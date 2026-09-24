#!/usr/bin/env node
/**
 * Tests for the shadow model trial's metrics (src/lib/model-trial-metrics.ts)
 * and the usage tap (src/lib/ai-usage-tap.ts).
 *
 *   node scripts/test-model-trial-metrics.mjs
 *
 * Modules are compiled from the shipped source (same pattern as
 * test-source-check.mjs). No network, no database, no model calls.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = mkdtempSync(join(tmpdir(), 'model-trial-metrics-'));
writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');
const tscPath = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(
  process.execPath,
  [
    tscPath, 'src/lib/model-trial-metrics.ts', 'src/lib/ai-usage-tap.ts',
    '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020',
    '--moduleResolution', 'node', '--skipLibCheck', '--types', 'node',
  ],
  { stdio: 'inherit' },
);
const require = createRequire(join(outDir, 'x.js'));
const M = require(join(outDir, 'model-trial-metrics.js'));
const T = require(join(outDir, 'ai-usage-tap.js'));

let passed = 0;
let failed = 0;
const queue = [];
const test = (name, fn) => queue.push([name, fn]);

const story = (source, extra = {}) => ({ entity: 'Pinacoteca di Brera', context: 'Late opening on 26 September for 1 euro.', source, ...extra });
const CATS = [
  { name: 'Culture', stories: [
    story({ name: 'Corriere', url: 'https://milano.corriere.it/a', origin: 'tool' }),
    story({ name: 'Il Giorno', url: 'https://ilgiorno.it/b', origin: 'model' }),
    story({ name: 'Comune', url: null }),
    story(null, { droppedModelUrl: 'https://invented.example/404' }),
  ] },
  { name: 'Empty', stories: [{ entity: '', context: '  ' }] },
];

// ─── Stories and sources ───────────────────────────────────────────────────
test('trialStories skips a story with neither entity nor context', () => {
  assert.equal(M.trialStories(CATS).length, 4);
  assert.equal(M.trialStories(null).length, 0);
});
test('a traced source has a URL and a non-model origin', () => {
  assert.equal(M.isTracedSource({ url: 'https://a.it/x', origin: 'tool' }), true);
  assert.equal(M.isTracedSource({ url: 'https://a.it/x', origin: 'repair' }), true);
  assert.equal(M.isTracedSource({ url: 'https://a.it/x', origin: 'model' }), false);
  assert.equal(M.isTracedSource({ url: 'https://a.it/x' }), false, 'unstamped counts as model');
  assert.equal(M.isTracedSource({ name: 'Comune', url: null, origin: 'tool' }), false);
});
test('tracedShare counts a story traced through its secondary source', () => {
  const stories = [story({ url: null }, { secondarySource: { url: 'https://b.it', origin: 'story-match' } }), story(null)];
  assert.deepEqual(M.tracedShare(stories), { traced: 1, share: 0.5 });
  assert.deepEqual(M.tracedShare([]), { traced: 0, share: null });
});
test('bodyWords drops headers, link targets and bare URLs', () => {
  const body = 'Good morning, Gander.\n\n[[Midnight Sparklers]]\nThe [Town of Gander](https://gander.ca/x) issued a notice - see https://x.com/a/status/1 today.';
  assert.equal(M.bodyWords(body), 12);
  assert.equal(M.bodyWords(null), 0);
});

// ─── Verdicts and rules ────────────────────────────────────────────────────
test('bestVerdict prefers verified, and no_source only when nothing else', () => {
  assert.equal(M.bestVerdict(['not_found', 'verified']), 'verified');
  assert.equal(M.bestVerdict(['fetch_failed', 'partial']), 'partial');
  assert.equal(M.bestVerdict(['unverifiable_origin', 'fetch_failed']), 'unverifiable_origin');
  assert.equal(M.bestVerdict([]), 'no_source');
});
test('verdictMix counts every verdict, zeros included', () => {
  const mix = M.verdictMix(['verified', 'verified', 'no_source']);
  assert.equal(mix.verified, 2);
  assert.equal(mix.no_source, 1);
  assert.equal(mix.not_found, 0);
  assert.equal(Object.keys(mix).length, M.VERDICTS.length);
});
test('removalsByRule groups by rule family', () => {
  assert.deepEqual(
    M.removalsByRule([{ rule: 'blocked-source: x.com' }, { rule: 'blocked-source: Il Giornale' }, { rule: 'no-source' }]),
    { 'blocked-source': 2, 'no-source': 1 },
  );
  assert.deepEqual(M.removalsByRule(null), {});
});
test('parseEditorNoteRemovals reads formatRemovals output', () => {
  const notes = 'Edition rules (GEDI) removed or changed 2 item(s):\n- "Bar Jamaica": no-source\n- "A \\"quoted\\" header": about-a-dropped-story\n- and 3 more';
  assert.deepEqual(M.parseEditorNoteRemovals(notes).map(r => r.rule), ['no-source', 'about-a-dropped-story']);
  assert.deepEqual(M.parseEditorNoteRemovals(null), []);
});

// ─── Places ────────────────────────────────────────────────────────────────
test('placeNamesFor strips qualifiers and county prefixes', () => {
  assert.deepEqual(M.placeNamesFor('County Cork'), ['county cork', 'cork']);
  assert.deepEqual(M.placeNamesFor('Warren', ['Warren Township (Somerset County, New Jersey)']), ['warren', 'warren township']);
  assert.ok(M.placeNamesFor('Dornbirn Nord-West', ['Dornbirn', 'Hatlerdorf']).includes('dornbirn'));
});
test('mentionsPlace is whole-word and accent-insensitive', () => {
  assert.equal(M.mentionsPlace('Neues aus Götzis und Altach', ['gotzis']), true);
  assert.equal(M.mentionsPlace('The Warrenton council met', ['warren']), false);
  assert.equal(M.mentionsPlace('Casco Histórico, Zaragoza', M.placeNamesFor('Casco Histórico')), true);
  assert.equal(M.mentionsPlace(null, ['cork']), false);
});
test('opensEmpty catches a nothing-found opening, not a closing line', () => {
  assert.equal(M.opensEmpty('Quiet Day on Corso Garibaldi, Brera', 'No major openings.'), true);
  assert.equal(M.opensEmpty('HEADLINE', 'No major restaurant openings, pop-ups or community events reported.'), true);
  const long = 'The Town of Gander issued a statement about fireworks. '.repeat(6) + 'No major events turned up for today.';
  assert.equal(M.opensEmpty('Fireworks complaints', long), false);
});

// ─── Search metrics ────────────────────────────────────────────────────────
test('searchMetrics shares are over the citations checked', () => {
  const urls = ['https://x.com/a/status/1', 'https://x.com/i/status/2', 'https://www.corriere.it/a', 'https://corriere.it/b'];
  const checks = [
    { url: urls[0], loaded: true, mentionsPlace: true },
    { url: urls[1], loaded: false, mentionsPlace: false },
  ];
  const m = M.searchMetrics(urls, checks, { latencyMs: 1000, costUsd: 0.4568372, postsRead: 75, headline: 'Fireworks', content: 'Ten words about fireworks in Gander from the town council today ok.' });
  assert.equal(m.citations, 4);
  assert.equal(m.x_posts, 2);
  assert.equal(m.distinct_domains, 2);
  assert.equal(m.load_share, 0.5);
  assert.equal(m.mentions_place_share, 0.5);
  assert.equal(m.cost_usd, 0.456837);
  assert.equal(m.posts_read, 75);
  assert.equal(m.failed, false);
  assert.equal(m.opens_empty, false);
});
test('a failed search is failed and never opens_empty', () => {
  const m = M.searchMetrics([], [], { latencyMs: 60000, costUsd: null, failed: true });
  assert.equal(m.failed, true);
  assert.equal(m.opens_empty, false);
  assert.equal(m.load_share, null);
  assert.equal(m.posts_read, null);
});

// ─── Writer metrics ────────────────────────────────────────────────────────
test('writerMetrics counts shares, dropped model URLs and removals', () => {
  const m = M.writerMetrics({
    body: '[[One]]\nFour words right here.', categories: CATS,
    storyVerdicts: ['verified', 'unverifiable_origin', 'no_source', 'no_source'], pagesChecked: 1,
    removals: [{ rule: 'no-source' }], refusal: false, jsonParseFailed: false,
    thinkingLeakStripped: false, teaserLeakStripped: true, residualThinkingLeak: false, residualTeaserLeak: false,
    modelUrlsWritten: 3, groundingQueries: 2, latencyMs: 6000, costUsd: 0.0061297, thoughtsTokens: 0,
  });
  assert.equal(m.stories, 4);
  assert.equal(m.words, 4);
  assert.equal(m.traced_source_stories, 1);
  assert.equal(m.traced_source_share, 0.25);
  assert.equal(m.verified_share, 0.25);
  assert.equal(m.model_urls_dropped, 1);
  assert.equal(m.edition_rules_removed, 1);
  assert.deepEqual(m.edition_rules_by_rule, { 'no-source': 1 });
  assert.equal(m.cost_usd, 0.00613);
});
test('writerMetrics with no rules reports removals as null, not zero', () => {
  const m = M.writerMetrics({
    body: null, categories: [], storyVerdicts: [], pagesChecked: 0, removals: null, refusal: true,
    jsonParseFailed: null, thinkingLeakStripped: null, teaserLeakStripped: null, residualThinkingLeak: false,
    residualTeaserLeak: false, modelUrlsWritten: null, groundingQueries: null, latencyMs: null, costUsd: null, thoughtsTokens: null,
  });
  assert.equal(m.edition_rules_removed, null);
  assert.equal(m.verified_share, null);
  assert.equal(m.refusal, true);
  assert.equal(m.cost_usd, null);
});

// ─── Comparison ────────────────────────────────────────────────────────────
test('scalarMetrics flattens nested counts and turns booleans into 0/1', () => {
  const s = M.scalarMetrics({ stories: 3, refusal: true, verdicts: { verified: 2 }, cost_usd: null, note: 'x' });
  assert.deepEqual(s, { stories: 3, refusal: 1, 'verdicts.verified': 2 });
});
test('compareRuns means each side and counts pairs', () => {
  const rows = [
    { metrics: { stories: 3, latency_ms: 100 }, baseline_metrics: { stories: 2, latency_ms: null } },
    { metrics: { stories: 5, latency_ms: 300 }, baseline_metrics: { stories: 4, latency_ms: null } },
    { metrics: null, baseline_metrics: { stories: 6 } },
  ];
  const cmp = M.compareRuns(rows);
  const stories = cmp.find(c => c.metric === 'stories');
  assert.deepEqual(stories, { metric: 'stories', candidate_mean: 4, baseline_mean: 4, paired: 2 });
  const latency = cmp.find(c => c.metric === 'latency_ms');
  assert.deepEqual(latency, { metric: 'latency_ms', candidate_mean: 200, baseline_mean: null, paired: 0 });
});

// ─── Usage tap ─────────────────────────────────────────────────────────────
test('the tap is scoped to its async chain and totals billed cost first', async () => {
  const tap = { operation: 'trial_writer', calls: [] };
  assert.equal(T.currentUsageTap(), undefined);
  const seen = await T.withUsageTap(tap, async () => {
    await new Promise(r => setTimeout(r, 5));
    const inside = T.currentUsageTap();
    inside.calls.push({ provider: 'grok', model: 'grok-4.5', operation: 'neighborhood_brief', inputTokens: 1, outputTokens: 1, cachedTokens: 0, estimatedCostUsd: 0.2, providerCostUsd: 0.45 });
    inside.calls.push({ provider: 'gemini', model: 'gemini-2.5-flash', operation: 'edition_rules_review', inputTokens: 1, outputTokens: 1, cachedTokens: 0, estimatedCostUsd: 0.001, providerCostUsd: null });
    return inside;
  });
  assert.equal(seen, tap);
  assert.equal(T.currentUsageTap(), undefined, 'no tap outside the scope');
  assert.equal(Number(T.tapCostUsd(tap.calls).toFixed(3)), 0.451);
});
test('parallel scopes do not see each other', async () => {
  const a = { operation: 'a', calls: [] };
  const b = { operation: 'b', calls: [] };
  const [x, y] = await Promise.all([
    T.withUsageTap(a, async () => { await new Promise(r => setTimeout(r, 10)); return T.currentUsageTap().operation; }),
    T.withUsageTap(b, async () => { await new Promise(r => setTimeout(r, 1)); return T.currentUsageTap().operation; }),
  ]);
  assert.deepEqual([x, y], ['a', 'b']);
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
