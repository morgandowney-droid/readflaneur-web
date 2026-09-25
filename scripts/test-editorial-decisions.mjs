#!/usr/bin/env node
/**
 * Tests for editorial decisions (src/lib/editorial-decisions.ts): story keys,
 * folding decision rows into item states, applying them to a story list, and
 * the approval filtering the licensee feed does for a licensee with
 * requireApproval.
 *
 *   node scripts/test-editorial-decisions.mjs
 *
 * Compiled from the shipped source first (same pattern as
 * test-edition-rules.mjs). No network, no database.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = mkdtempSync(join(tmpdir(), 'editorial-decisions-'));
writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');
const tscPath = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(
  process.execPath,
  [
    tscPath,
    'src/lib/editorial-decisions.ts', 'src/lib/edition-rules.ts',
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
const D = require(join(outDir, 'editorial-decisions.js'));
const R = require(join(outDir, 'edition-rules.js'));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${err.message.split('\n').join('\n       ')}`);
  }
}

const A = '3f1c2a9e-1111-4222-8333-444455556666';
const LA = '9a8b7c6d-1111-4222-8333-444455556666';
const row = (ref, action, at, extra = {}) => ({
  story_key: D.storyKey(A, ref), article_id: A, action, decided_by: 'Giulia', decided_at: at, ...extra,
});
const stories = [0, 1, 2].map((i) => ({ id: D.storyKey(A, i), position: i, header: `Header ${i}`, text: `Text ${i}.` }));

console.log('\nStory keys');
test('a story key equals the feed story id: sha256(`${articleId}:${index}`), 24 hex', () => {
  const expected = createHash('sha256').update(`${A}:2`).digest('hex').slice(0, 24);
  assert.equal(D.storyKey(A, 2), expected);
  assert.equal(D.storyKey(A, '2'), expected);
});
test('keys are stable and distinct per item', () => {
  assert.equal(D.storyKey(A, 0), D.storyKey(A, 0));
  const keys = new Set([D.storyKey(A, 0), D.storyKey(A, 1), D.storyKey(A, 'headline'), D.storyKey(LA, 'prose'), D.storyKey(LA, 'event:0'), D.storyKey(LA, 0)]);
  assert.equal(keys.size, 6);
});
test('item refs are validated', () => {
  for (const ok of ['0', '12', 'headline', 'prose', 'event:3']) assert.ok(D.isValidRef(ok), ok);
  for (const bad of ['', '-1', 'event:', 'event:x', 'Headline', '1; drop table', 3, null]) assert.ok(!D.isValidRef(bad), String(bad));
});

console.log('\nFolding decisions');
test('no rows means pending', () => {
  assert.equal(D.stateFor(D.foldDecisions([]), D.storyKey(A, 0)).status, 'pending');
});
test('approve, hold, restore in time order, whatever order the rows arrive', () => {
  const rows = [row(0, 'held', '2026-09-26T08:05:00Z'), row(0, 'approved', '2026-09-26T08:00:00Z')];
  assert.equal(D.stateFor(D.foldDecisions(rows), D.storyKey(A, 0)).status, 'held');
  rows.push(row(0, 'restored', '2026-09-26T08:10:00Z'));
  const st = D.stateFor(D.foldDecisions(rows), D.storyKey(A, 0));
  assert.equal(st.status, 'pending');
  assert.equal(st.decided_by, 'Giulia');
});
test('an edit approves the item with the new wording', () => {
  const st = D.stateFor(D.foldDecisions([row(1, 'edited', '2026-09-26T08:00:00Z', { edited_header: 'Nuovo', edited_text: 'Testo nuovo.' })]), D.storyKey(A, 1));
  assert.equal(st.status, 'approved');
  assert.equal(st.edited, true);
  assert.equal(st.header, 'Nuovo');
  assert.equal(st.text, 'Testo nuovo.');
});
test('an edit survives a hold and a later approval; a restore clears it', () => {
  const rows = [
    row(1, 'edited', '2026-09-26T08:00:00Z', { edited_text: 'Edited.' }),
    row(1, 'held', '2026-09-26T08:01:00Z'),
  ];
  let st = D.stateFor(D.foldDecisions(rows), D.storyKey(A, 1));
  assert.equal(st.status, 'held');
  assert.equal(st.text, 'Edited.');
  rows.push(row(1, 'approved', '2026-09-26T08:02:00Z'));
  st = D.stateFor(D.foldDecisions(rows), D.storyKey(A, 1));
  assert.equal(st.status, 'approved');
  assert.equal(st.text, 'Edited.');
  rows.push(row(1, 'restored', '2026-09-26T08:03:00Z'));
  st = D.stateFor(D.foldDecisions(rows), D.storyKey(A, 1));
  assert.equal(st.status, 'pending');
  assert.equal(st.text, null);
  assert.equal(st.edited, false);
});
test('a header-only edit keeps an earlier text edit', () => {
  const rows = [
    row(0, 'edited', '2026-09-26T08:00:00Z', { edited_text: 'T1' }),
    row(0, 'edited', '2026-09-26T08:01:00Z', { edited_header: 'H2' }),
  ];
  const st = D.stateFor(D.foldDecisions(rows), D.storyKey(A, 0));
  assert.deepEqual([st.header, st.text], ['H2', 'T1']);
});

console.log('\nApplying decisions to the feed');
test('without requireApproval the stories are returned untouched', () => {
  const states = D.foldDecisions([row(0, 'held', '2026-09-26T08:00:00Z')]);
  const out = D.applyDecisionsToStories(stories, states, false);
  assert.equal(out.stories, stories);
  assert.equal(out.stories[0].editorial, undefined);
});
test('with requireApproval only approved stories remain, edited, with their status', () => {
  const states = D.foldDecisions([
    row(0, 'approved', '2026-09-26T08:00:00Z'),
    row(1, 'held', '2026-09-26T08:00:00Z'),
    row(2, 'edited', '2026-09-26T08:00:00Z', { edited_header: 'H', edited_text: 'T' }),
  ]);
  const out = D.applyDecisionsToStories(stories, states, true);
  assert.deepEqual(out.stories.map((s) => s.position), [0, 2]);
  assert.equal(out.stories[0].header, 'Header 0');
  assert.equal(out.stories[0].editorial.status, 'approved');
  assert.equal(out.stories[0].editorial.edited, false);
  assert.deepEqual([out.stories[1].header, out.stories[1].text, out.stories[1].editorial.edited], ['H', 'T', true]);
  assert.deepEqual(out.withheld, { pending: 0, held: 1 });
  // The original list is not mutated.
  assert.equal(stories[2].header, 'Header 2');
});
test('fails closed: with no decisions a licensee that requires approval gets nothing', () => {
  const out = D.applyDecisionsToStories(stories, new Map(), true);
  assert.equal(out.stories.length, 0);
  assert.deepEqual(out.withheld, { pending: 3, held: 0 });
});
test('a decision on another article does not approve this one', () => {
  const other = '00000000-1111-4222-8333-444455556666';
  const states = D.foldDecisions([{ ...row(0, 'approved', '2026-09-26T08:00:00Z'), story_key: D.storyKey(other, 0), article_id: other }]);
  assert.equal(D.applyDecisionsToStories(stories, states, true).stories.length, 0);
});
test('headline and Look Ahead prose: value only when approved, edit applied', () => {
  const hk = D.storyKey(A, 'headline');
  assert.equal(D.approvedValue('Orig', D.PENDING, true).value, null);
  assert.equal(D.approvedValue('Orig', D.PENDING, false).value, 'Orig');
  const st = D.stateFor(D.foldDecisions([{ ...row('headline', 'edited', '2026-09-26T08:00:00Z', { edited_text: 'Nuovo titolo' }), story_key: hk }]), hk);
  assert.equal(D.approvedValue('Orig', st, true).value, 'Nuovo titolo');
});
test('Look Ahead events: only approved events, by position', () => {
  const events = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
  const k = (i) => D.storyKey(LA, `event:${i}`);
  const states = D.foldDecisions([
    { story_key: k(0), article_id: LA, action: 'approved', decided_by: 'G', decided_at: '2026-09-26T08:00:00Z' },
    { story_key: k(2), article_id: LA, action: 'held', decided_by: 'G', decided_at: '2026-09-26T08:00:00Z' },
  ]);
  const out = D.approvedEvents(events, LA, states, true);
  assert.deepEqual(out.events.map((e) => e.name), ['a']);
  assert.deepEqual(out.withheld, { pending: 1, held: 1 });
  assert.equal(D.approvedEvents(events, LA, states, false).events.length, 3);
});
test('the body is rebuilt from the stories that remain', () => {
  const md = D.rebuildMarkdown('Buongiorno, Brera.', [{ header: 'Uno', text: 'Primo.' }], 'Buona giornata.');
  assert.equal(md, 'Buongiorno, Brera.\n\n## Uno\n\nPrimo.\n\nBuona giornata.');
  assert.equal(D.rebuildMarkdown('Buongiorno, Brera.', [], 'Buona giornata.'), '');
});

console.log('\nInput from the page');
test('decision input is validated', () => {
  const ok = D.parseDecisionInput({ neighborhoodId: 'milan-brera', articleId: A, ref: '0', action: 'approved' }, ['milan-brera']);
  assert.equal(typeof ok, 'object');
  assert.equal(ok.header, null);
  assert.equal(D.parseDecisionInput({ neighborhoodId: 'paris-le-marais', articleId: A, ref: '0', action: 'approved' }, ['milan-brera']), 'unknown edition');
  assert.equal(D.parseDecisionInput({ neighborhoodId: 'milan-brera', articleId: 'x', ref: '0', action: 'approved' }, ['milan-brera']), 'bad article id');
  assert.equal(D.parseDecisionInput({ neighborhoodId: 'milan-brera', articleId: A, ref: '0', action: 'publish' }, ['milan-brera']), 'bad action');
  assert.equal(D.parseDecisionInput({ neighborhoodId: 'milan-brera', articleId: A, ref: '0', action: 'edited' }, ['milan-brera']), 'an edit needs a header or text');
  const ed = D.parseDecisionInput({ neighborhoodId: 'milan-brera', articleId: A, ref: '0', action: 'edited', header: '  H  ', text: 'x'.repeat(9000) }, ['milan-brera']);
  assert.equal(ed.header, 'H');
  assert.equal(ed.text.length, D.MAX_TEXT);
  // Edit text is ignored on a non-edit action.
  assert.equal(D.parseDecisionInput({ neighborhoodId: 'milan-brera', articleId: A, ref: '0', action: 'held', text: 'x' }, ['milan-brera']).text, null);
});
test('editor names are trimmed and bounded', () => {
  assert.equal(D.cleanEditorName('  Giulia Rossi \n'), 'Giulia Rossi');
  assert.equal(D.cleanEditorName(''), null);
  assert.equal(D.cleanEditorName(42), null);
  assert.equal(D.cleanEditorName('x'.repeat(200)).length, D.MAX_NAME);
});

console.log('\nRemovals logged at publication');
test('removals round-trip from formatRemovals in edition-rules.ts', () => {
  const rules = R.rulesForEdition('milan-brera');
  const notes = R.formatRemovals(rules, [
    { header: 'Arresto in via Solferino', rule: 'active-crime' },
    { header: 'Link in body', rule: 'blocked-source: ilgiornale.it' },
  ]);
  assert.deepEqual(D.parseRemovals(notes), [
    { header: 'Arresto in via Solferino', rule: 'active-crime' },
    { header: 'Link in body', rule: 'blocked-source: ilgiornale.it' },
  ]);
  assert.deepEqual(D.parseRemovals(null), []);
  assert.deepEqual(D.parseRemovals('Source: NYC 311 - https://example.com'), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
