#!/usr/bin/env node
/**
 * Tests for the per-publisher edition rules (src/lib/edition-rules.ts).
 *
 *   node scripts/test-edition-rules.mjs
 *
 * The module is compiled from the shipped source to a temp dir first (same
 * pattern as backfill-british-english.mjs), so the tests exercise exactly the
 * code the pipeline runs. No network, no database, no model calls: the model
 * review is simulated by passing verdicts, or null for a failed review.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = mkdtempSync(join(tmpdir(), 'edition-rules-'));
writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');
// Resolve the project's own TypeScript rather than whatever npx might fetch.
const tscPath = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(
  process.execPath,
  [
    tscPath, 'src/lib/edition-rules.ts',
    '--outDir', outDir,
    '--module', 'commonjs',
    '--target', 'es2020',
    '--moduleResolution', 'node',
    '--skipLibCheck',
    '--typeRoots', outDir,
  ],
  { stdio: 'inherit' },
);
const require = createRequire(join(outDir, 'x.js'));
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

const gediLive = R.rulesForEdition('milan-brera');
// The sourcing rule is off for GEDI (2026-09-23) and measured in shadow; its
// logic is still tested with the rule switched on.
const gedi = { ...gediLive, requireTwoSourcesForNamedFacts: true };
const withBlocks = (blockedSources, extra = {}) => ({ ...gedi, blockedSources, ...extra });
const story = (entity, context, sources) => ({ index: 0, category: 'News', entity, context, sources });
const src = (name, url) => ({ name, url: url ?? null });

console.log('\nConfig');
test('the four GEDI editions have rules', () => {
  for (const id of ['milan-brera', 'milan-porta-venezia', 'rome-prati', 'sicily-scicli']) {
    assert.equal(R.rulesForEdition(id)?.groupId, 'gedi', id);
  }
});
test('an edition without a group gets null, and the insert check is a no-op', () => {
  assert.equal(R.rulesForEdition('nyc-tribeca'), null);
  assert.equal(R.rulesForEdition('milan-navigli'), null);
  assert.equal(R.rulesForEdition('vorarlberg-bregenz'), null);
  assert.equal(R.checkBeforeInsert({ neighborhoodId: 'nyc-tribeca', body: '[[A]]\n\nAnything.', categories: [] }), null);
  assert.equal(R.editionRulesBlock(null), '');
});
test('the live GEDI prompt block states its rules and never asks for a second source', () => {
  const live = R.editionRulesBlock(gediLive).toLowerCase();
  for (const s of ['party politics', 'sports commentary', 'private individuals', 'active criminal cases']) assert.ok(live.includes(s), s);
  assert.equal(live.includes('two independent sources'), false, 'the live prompt must not demand a second source');
});
test('with the sourcing rule on, the prompt block states it', () => {
  const b = R.editionRulesBlock(gedi);
  for (const s of ['party politics', 'sports commentary', 'private individuals', 'active criminal cases', 'two independent sources', 'different kind']) {
    assert.ok(b.toLowerCase().includes(s), s);
  }
});

console.log('\nBlocked sources');
test('a domain blocks the domain and its subdomains, not look-alikes', () => {
  const b = ['corriere.it'];
  assert.ok(R.matchBlockedSource(src('Corriere', 'https://www.corriere.it/cronaca/x'), b));
  assert.ok(R.matchBlockedSource(src('Corriere Milano', 'https://milano.corriere.it/notizie/y'), b));
  assert.equal(R.matchBlockedSource(src('Not Corriere', 'https://notcorriere.it/z'), b), null);
  assert.equal(R.matchBlockedSource(src('Repubblica', 'https://www.repubblica.it/'), b), null);
});
test('a social URL prefix blocks one group or account, not its neighbours', () => {
  const b = ['facebook.com/groups/12345', 'instagram.com/somepage', 'x.com/handle'];
  assert.ok(R.matchBlockedSource(src('Brera group', 'https://www.facebook.com/groups/12345/posts/678'), b));
  assert.ok(R.matchBlockedSource(src('Brera group', 'https://m.facebook.com/groups/12345'), b));
  assert.equal(R.matchBlockedSource(src('Other group', 'https://www.facebook.com/groups/123456'), b), null);
  assert.ok(R.matchBlockedSource(src('somepage', 'https://instagram.com/somepage/p/abc'), b));
  assert.equal(R.matchBlockedSource(src('otherpage', 'https://instagram.com/otherpage'), b), null);
  assert.ok(R.matchBlockedSource(src('@handle', 'https://twitter.com/handle/status/1'), b), 'twitter.com is x.com');
  assert.ok(R.matchBlockedSource(src('@handle'), b), 'a bare @handle');
});
test('a publication name blocks by name', () => {
  const b = ['Il Fatto Quotidiano'];
  assert.ok(R.matchBlockedSource(src('Il Fatto Quotidiano'), b));
  assert.equal(R.matchBlockedSource(src('Il Fatto Alimentare'), b), null);
});
test('a story whose only source is blocked is dropped', () => {
  const rules = withBlocks(['corriere.it']);
  const [d] = R.decideStories([story('Via Solferino market', 'Opens Saturday 14 June.', [src('Corriere', 'https://milano.corriere.it/a')])], rules, new Map());
  assert.equal(d.keep, false);
  assert.equal(d.rules[0], 'only-source-blocked');
});

console.log('\nSourcing standard');
const dated = 'The market opens on Saturday 14 June at 9:00 in Piazza Castello.';
test('one ordinary source for a dated fact is not enough', () => {
  const [d] = R.decideStories([story('Brera market', dated, [src('Milano Today', 'https://www.milanotoday.it/a')])], gedi, new Map());
  assert.equal(d.keep, false);
  assert.equal(d.rules[0], 'single-source-named-fact');
});
test('two independent sources pass; two pages on one domain do not', () => {
  const two = R.decideStories([story('Brera market', dated, [src('Milano Today', 'https://www.milanotoday.it/a'), src('Comune di Milano', 'https://www.comune.milano.it/b')])], gedi, new Map());
  assert.equal(two[0].keep, true, JSON.stringify(two[0].rules));
  const same = R.decideStories([story('Brera market', dated, [src('Milano Today', 'https://www.milanotoday.it/a'), src('Milano Today', 'https://milanotoday.it/c')])], gedi, new Map());
  assert.equal(same[0].keep, false);
});
test('a story resting on social media needs a second source of a different kind', () => {
  const socialPair = R.decideStories([story('Pop-up', dated, [src('brerapopup', 'https://instagram.com/brerapopup'), src('Brera page', 'https://facebook.com/brerapage')])], gedi, new Map());
  assert.equal(socialPair[0].keep, false);
  assert.equal(socialPair[0].rules[0], 'social-without-different-kind');
  const mixed = R.decideStories([story('Pop-up', dated, [src('brerapopup', 'https://instagram.com/brerapopup'), src('Comune di Milano', 'https://www.comune.milano.it/b')])], gedi, new Map());
  assert.equal(mixed[0].keep, true, JSON.stringify(mixed[0].rules));
  const socialOnlyNoFacts = R.decideStories([story('A pop-up', 'A small pop-up is open.', [src('brerapopup', 'https://instagram.com/brerapopup')])], gedi, new Map());
  assert.equal(socialOnlyNoFacts[0].keep, false, 'social alone fails even without named facts');
});
test('a newspaper of record is enough on its own, by domain or by full name', () => {
  for (const s of [src('la Repubblica', 'https://milano.repubblica.it/x'), src('Corriere della Sera'), src('ANSA', 'https://www.ansa.it/y'), src('Giornale di Sicilia', 'https://gds.it/z')]) {
    const [d] = R.decideStories([story('Brera market', dated, [s])], gedi, new Map());
    assert.equal(d.keep, true, `${s.name}: ${JSON.stringify(d.rules)}`);
  }
  assert.equal(R.isNewspaperOfRecord(src('Sicilia Tourism'), 'italy'), false);
  assert.equal(R.isNewspaperOfRecord(src('Repubblica', 'https://www.facebook.com/Repubblica'), 'italy'), false, 'a paper\'s Facebook page is social');
});

console.log('\nTopics');
const nor = src('ANSA', 'https://www.ansa.it/a');
test('an active criminal case without a newspaper of record is dropped', () => {
  const [d] = R.decideStories([story('Arrest in Via Fiori Chiari', 'Police arrested a man on 12 June after a robbery.', [src('Milano Today', 'https://www.milanotoday.it/a'), src('Comune', 'https://www.comune.milano.it/b')])], gedi, new Map());
  assert.equal(d.keep, false);
  assert.ok(d.rules.includes('active-crime-without-newspaper-of-record'), JSON.stringify(d.rules));
});
test('with a newspaper of record it stays, unless it names a private individual', () => {
  const s = story('Arrest in Via Fiori Chiari', 'Police arrested a man on 12 June after a robbery.', [nor]);
  const verdict = (names) => new Map([[0, { index: 0, supported: true, partyPolitics: false, sportsCommentary: false, activeCrime: true, namesPrivateIndividual: names, privatePersonalInfo: false }]]);
  assert.equal(R.decideStories([s], gedi, verdict(false))[0].keep, true);
  const named = R.decideStories([s], gedi, verdict(true))[0];
  assert.equal(named.keep, false);
  assert.ok(named.rules.includes('active-crime-names-private-individual'));
});
test('"trial" counts as crime only in court phrasing', () => {
  for (const t of ['Autonomous bus trial in Wolfurt', 'A pilot trial of the new app', 'clinical trial at the hospital', 'free trial for residents']) {
    assert.equal(R.topicHits(t, gedi).includes('active-crime'), false, t);
  }
  for (const t of ['He went on trial in Feldkirch', 'The murder trial opens Monday', 'The trial judge adjourned the case']) {
    assert.ok(R.topicHits(t, gedi).includes('active-crime'), t);
  }
});
test('Italian crime terms are caught too', () => {
  assert.ok(R.topicHits('Carabinieri: arrestato un uomo in Via Brera', gedi).includes('active-crime'));
});
test('party politics and sports commentary are caught; a fixture is not commentary', () => {
  assert.ok(R.topicHits('Fratelli d\'Italia opens its campaign office on Corso Garibaldi', gedi).includes('party-politics'));
  assert.ok(R.topicHits('Inter beat Juventus 2-1 in the derby at San Siro', gedi).includes('sports-commentary'));
  assert.equal(R.topicHits('Inter v Juventus, San Siro, Sunday 20:45', gedi).includes('sports-commentary'), false);
  assert.equal(R.topicHits('Concert 18:00-20:00 at the Teatro', gedi).includes('sports-commentary'), false);
  assert.equal(R.topicHits('Melon festival: meloni e angurie at the market', gedi).includes('party-politics'), false);
});
test('a failed review drops a story that names a person and keeps one that does not', () => {
  const two = [
    { ...story('Gallery talk', 'Mario Rossi gives a talk at the gallery on 12 June.', [nor]), index: 0 },
    { ...story('Market', 'The Saturday market returns on 14 June.', [nor]), index: 1 },
  ];
  const d = R.decideStories(two, gedi, null);
  assert.equal(d[0].keep, false);
  assert.equal(d[0].rules[0], 'review-unavailable-names-person');
  assert.equal(d[1].keep, true);
});
test('an unsupported review verdict is logged, not acted on', () => {
  const v = new Map([[0, { index: 0, supported: false, partyPolitics: false, sportsCommentary: false, activeCrime: false, namesPrivateIndividual: false, privatePersonalInfo: false, reason: 'date not in sources' }]]);
  const [d] = R.decideStories([story('Market', 'The market returns on 14 June.', [nor])], gedi, v);
  assert.equal(d.keep, true);
  assert.match((d.advisories || [])[0] || '', /^unsupported-by-sources \(review, log only\)/);
});

console.log('\nBody rebuild');
const categories = [
  { name: 'Openings', stories: [
    { entity: 'Pasticceria Marchesi (new counter)', context: 'Pasticceria Marchesi opens a second counter on Via Solferino on 14 June.', source: src('ANSA', 'https://www.ansa.it/a') },
    { entity: 'Libreria Bocca', context: 'Libreria Bocca hosts readings every Thursday from 12 June.', source: src('Milano Today', 'https://www.milanotoday.it/b'), secondarySource: src('Comune di Milano', 'https://www.comune.milano.it/c') },
  ] },
  { name: 'Safety', stories: [
    { entity: 'Robbery on Via Fiori Chiari', context: 'Police arrested a man after a robbery on Via Fiori Chiari on 11 June.', source: src('Milano Today', 'https://www.milanotoday.it/d'), secondarySource: src('Instagram', 'https://instagram.com/brera') },
  ] },
  { name: 'Blocked', stories: [
    { entity: 'Palazzo Citterio hours', context: 'Palazzo Citterio extends its opening hours from 13 June.', source: src('Corriere Milano', 'https://milano.corriere.it/e') },
  ] },
];
const body = [
  'Buongiorno, Brera.',
  '[[A Second Marchesi Counter]]',
  'Pasticceria Marchesi opens a second counter on Via Solferino on 14 June, with the same panettone.',
  '[[Readings at Bocca]]',
  'Libreria Bocca hosts readings every Thursday from 12 June, see [the programme](https://milano.corriere.it/bocca).',
  '[[Trouble on Fiori Chiari]]',
  'Police arrested a man after a robbery on Via Fiori Chiari on 11 June.',
  '[[Citterio Stays Open Later]]',
  'Palazzo Citterio extends its opening hours from 13 June.',
  '[[Overheard]]',
  'Someone says the tram is late again, which nobody could source.',
  'Buona giornata.',
].join('\n\n');
const rules = withBlocks(['corriere.it']);
const out = R.applyEditionRules({ body, categories, rules, verdicts: null, reviewRequired: false, placeNames: ['Brera', 'Milan'] });
test('dropped stories and unsourced prose leave the body, kept ones stay', () => {
  assert.ok(out.body.includes('[[A Second Marchesi Counter]]'));
  assert.ok(out.body.includes('[[Readings at Bocca]]'));
  assert.ok(!out.body.includes('Fiori Chiari'), 'crime story removed');
  assert.ok(!out.body.includes('Citterio'), 'blocked-source story removed');
  assert.ok(!out.body.includes('tram is late'), 'unsourced section removed');
  assert.ok(out.body.startsWith('Buongiorno, Brera.'), 'greeting kept');
  assert.ok(out.body.trim().endsWith('Buona giornata.'), 'sign-off kept');
});
test('no orphan [[header]] remains', () => {
  const blocks = out.body.split(/\n\n/);
  blocks.forEach((b, i) => {
    if (/^\[\[[^\]]+\]\]$/.test(b.trim())) {
      assert.ok(blocks[i + 1] && !/^\[\[/.test(blocks[i + 1].trim()), `orphan header: ${b}`);
    }
  });
});
test('a link to a blocked source is unlinked, the words stay', () => {
  assert.ok(!out.body.includes('corriere.it'));
  assert.ok(out.body.includes('the programme'));
});
test('categories keep only surviving stories, without blocked sources', () => {
  const kept = R.flattenStories(out.categories).map((s) => s.entity);
  assert.deepEqual(kept, ['Pasticceria Marchesi (new counter)', 'Libreria Bocca']);
});
test('every removal names the header and the rule that fired', () => {
  const rulesFired = out.removals.map((r) => `${r.header} -> ${r.rule}`).join('\n');
  assert.match(rulesFired, /Robbery on Via Fiori Chiari -> active-crime-without-newspaper-of-record/);
  assert.match(rulesFired, /Palazzo Citterio hours -> only-source-blocked/);
  assert.match(rulesFired, /Overheard -> no-verifiable-source/);
  const notes = R.formatRemovals(rules, out.removals);
  assert.ok(notes.startsWith('Edition rules (GEDI)'));
  assert.ok(!/^Source:/m.test(notes), 'must not parse as a government source line');
});
test('running the filter again changes nothing (idempotent)', () => {
  const again = R.applyEditionRules({ body: out.body, categories: out.categories, rules, verdicts: null, reviewRequired: false, placeNames: ['Brera', 'Milan'] });
  assert.equal(again.body, out.body);
  assert.equal(again.removals.length, 0, JSON.stringify(again.removals));
});

console.log('\nLook Ahead listing');
test('listing lines only stand on a surviving story; empty day headers go', () => {
  const laCats = [{ name: 'Music', stories: [
    { entity: 'Jazz at Blue Note', context: 'Blue Note Milano hosts a jazz trio on 14 June at 21:00.', source: nor },
    { entity: 'Party rally', context: 'Fratelli d\'Italia holds a rally in Piazza San Marco on 15 June.', source: nor },
  ] }];
  const laBody = [
    '[[Event Listing]]',
    '[[Today, Sat Jun 14]]',
    'Jazz trio at Blue Note; Concert, 21:00; Blue Note Milano, Via Borsieri 37.',
    '[[Sun, Jun 15]]',
    'Fratelli d\'Italia rally; Politics, 18:00; Piazza San Marco.',
    '---',
    '[[Today, Saturday June 14]]',
    'Blue Note Milano hosts a jazz trio on 14 June at 21:00.',
    '[[Sunday, June 15]]',
    'Fratelli d\'Italia holds a rally in Piazza San Marco on 15 June.',
  ].join('\n\n');
  const r = R.applyEditionRules({ body: laBody, categories: laCats, rules: gedi, verdicts: null, reviewRequired: false, placeNames: ['Brera', 'Milan'] });
  assert.ok(r.body.includes('Jazz trio at Blue Note;'));
  assert.ok(!r.body.includes('rally'), r.body);
  assert.ok(!r.body.includes('[[Sun, Jun 15]]'), 'empty listing day removed');
  assert.ok(!r.body.includes('[[Sunday, June 15]]'), 'empty prose day removed');
  assert.ok(r.body.includes('\n---'), 'listing block still closed');
  const ev = R.filterListingEvents([{ name: 'Jazz trio at Blue Note', location: 'Blue Note Milano' }, { name: 'Unverified street party', location: 'Via Brera' }], r.categories, gedi, ['Brera', 'Milan']);
  assert.deepEqual(ev.events.map((e) => e.name), ['Jazz trio at Blue Note']);
});

console.log('\nInsert check');
test('an edition with rules and no structured stories is blocked', () => {
  const c = R.checkBeforeInsert({ neighborhoodId: 'rome-prati', body: '[[Something]]\n\nText.', categories: [] });
  assert.ok(c && c.blockReason);
});
test('the insert check carries the enricher\'s removals into editor_notes', () => {
  const c = R.checkBeforeInsert({ neighborhoodId: 'milan-brera', body: out.body, categories: out.categories, placeNames: ['Brera', 'Milan'], priorRemovals: out.removals });
  assert.equal(c.blockReason, null);
  assert.equal(c.body, out.body);
  assert.ok(c.editorNotes.includes('Robbery on Via Fiori Chiari'));
});
test('teasers about a dropped story are caught', () => {
  assert.equal(R.mentionsDroppedStory('robbery on fiori chiari', out.droppedStories, ['Brera', 'Milan']), true);
  assert.equal(R.mentionsDroppedStory('second marchesi counter', out.droppedStories, ['Brera', 'Milan']), false);
  assert.equal(R.filterTeaserSentences('Marchesi opens a second counter. Robbery on Fiori Chiari.', out.droppedStories, ['Brera', 'Milan']), 'Marchesi opens a second counter.');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
