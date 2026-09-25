#!/usr/bin/env node
/**
 * Tests for the Llama social-source judge's pure parts
 * (src/lib/social-judge-core.ts): which URLs it handles, what it reads from a
 * post page, how the model's reply is parsed into a verdict, and the desk label.
 *
 *   node scripts/test-social-judge.mjs
 *
 * Compiled from the shipped source to a temp dir first, like
 * test-edition-rules.mjs. No network, no database, no model calls.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const outDir = mkdtempSync(join(tmpdir(), 'social-judge-'));
writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');
const tscPath = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(
  process.execPath,
  [tscPath, 'src/lib/social-judge-core.ts', '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020',
    '--moduleResolution', 'node', '--skipLibCheck', '--typeRoots', outDir],
  { stdio: 'inherit' },
);
const J = createRequire(join(outDir, 'x.js'))(join(outDir, 'social-judge-core.js'));

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

console.log('\nPlatforms');
test('Meta platforms and TikTok are handled; X and ordinary sites are not', () => {
  assert.equal(J.socialPlatform('https://www.facebook.com/KilbrydeHospiceCharity/posts/123'), 'facebook');
  assert.equal(J.socialPlatform('https://m.facebook.com/events/957440059340082/'), 'facebook');
  assert.equal(J.socialPlatform('https://fb.watch/abc123/'), 'facebook');
  assert.equal(J.socialPlatform('https://www.instagram.com/p/C8x/'), 'instagram');
  assert.equal(J.socialPlatform('https://www.threads.net/@someone/post/1'), 'threads');
  assert.equal(J.socialPlatform('https://www.tiktok.com/@scout2015/video/6718335390845095173'), 'tiktok');
  assert.equal(J.socialPlatform('https://vm.tiktok.com/ZMabc/'), 'tiktok');
  assert.equal(J.socialPlatform('https://x.com/someone/status/1'), null);
  assert.equal(J.socialPlatform('https://www.notfacebook.com/a'), null);
  assert.equal(J.socialPlatform('Facebook'), null);
  assert.equal(J.socialPlatform(null), null);
});

console.log('\nReading the post');
test('a Facebook post: og:description spanning lines, entities decoded, page name kept', () => {
  const html = `<html><head><meta property="og:type" content="video.other" /><meta property="og:title" content="Kilbryde Hospice" /><meta property="og:description" content="Joe&#039;s Bistro is open today from 11am until 2pm for you to pop in.
We&#039;re dog friendly!" /><meta name="description" content="Joe&#039;s Bistro is open today from 11am until 2pm for you to pop in.
We&#039;re dog friendly!" /><title>Joe&#039;s Bistro is open today from 11am... - Kilbryde Hospice</title></head></html>`;
  const p = J.extractPostText(html);
  assert.ok(p.text.includes("Joe's Bistro is open today from 11am until 2pm"), p.text);
  assert.ok(p.text.includes('Kilbryde Hospice'));
  assert.equal(p.text.split("Joe's Bistro is open today from 11am until 2pm").length, 2, 'the duplicate description is dropped');
  assert.deepEqual(p.fields.slice(0, 2), ['og:title', 'og:description']);
});
test('an Instagram post: content before property also works', () => {
  const html = '<meta content="33 likes, 1 comments - brera.bakery on September 24, 2026: &quot;New autumn menu from Friday&quot;." property="og:description" />';
  assert.match(J.extractPostText(html).text, /New autumn menu from Friday/);
});
test('JSON-LD captions are read', () => {
  const html = '<script type="application/ld+json">{"@type":"SocialMediaPosting","articleBody":"Drag show at The Grove on Saturday 27 September at 9pm, tickets 20 dollars"}</script>';
  assert.match(J.extractPostText(html).text, /Drag show at The Grove/);
});
test('a login wall or a bare page name is unreadable', () => {
  assert.equal(J.extractPostText('<title>Facebook</title>').text, '');
  assert.equal(J.extractPostText('<title>Log into Facebook</title><meta property="og:title" content="Facebook" />').text, '');
  assert.equal(J.extractPostText('<meta property="og:title" content="Kilbryde Hospice" /><title>Facebook</title>').text, '');
  assert.equal(J.extractPostText(null).text, '');
});

console.log('\nThe prompt');
test('the prompt numbers the facts, carries the post text, and never asks for a source', () => {
  const p = J.buildJudgePrompt({ platform: 'facebook', entity: "Joe's Bistro", context: 'Open today 11am to 2pm.', facts: [{ kind: 'entity', text: "Joe's Bistro" }, { kind: 'time', text: '11am' }], postText: 'Joe is open today' });
  assert.match(p, /1\. \[entity\] Joe's Bistro/);
  assert.match(p, /2\. \[time\] 11am/);
  assert.match(p, /Joe is open today/);
  assert.match(p, /do not suggest any other source/i);
  assert.equal(/find (a|the|another) source|provide (a|the) (url|link|source)/i.test(p), false);
});

console.log('\nParsing the verdict');
test('a clean supports reply', () => {
  const r = J.parseJudgement('{"verdict":"supports","supported_facts":[1,2],"contradicted_facts":[],"reason":"Same bistro, same hours."}', 3);
  assert.deepEqual(r, { verdict: 'supports', supportedFacts: [1, 2], contradictedFacts: [], reason: 'Same bistro, same hours.' });
});
test('code fences, prose around the JSON, string numbers and case are tolerated', () => {
  const r = J.parseJudgement('Here is my answer:\n```json\n{"verdict": "Supports", "supported_facts": ["2", 2, "1"]}\n```', 3);
  assert.equal(r.verdict, 'supports');
  assert.deepEqual(r.supportedFacts, [1, 2]);
  assert.equal(r.reason, null);
});
test('fact numbers out of range are dropped', () => {
  assert.deepEqual(J.parseJudgement('{"verdict":"supports","supported_facts":[0,1,4,9]}', 3).supportedFacts, [1]);
});
test('a fact claimed both ways counts as contradicted; supports with only contradictions becomes contradicts', () => {
  const r = J.parseJudgement('{"verdict":"supports","supported_facts":[2],"contradicted_facts":[2]}', 3);
  assert.equal(r.verdict, 'contradicts');
  assert.deepEqual(r.supportedFacts, []);
  assert.deepEqual(r.contradictedFacts, [2]);
});
test('unrelated and unreadable carry no facts', () => {
  assert.deepEqual(J.parseJudgement('{"verdict":"unrelated","supported_facts":[1]}', 3).supportedFacts, []);
  assert.deepEqual(J.parseJudgement('{"verdict":"unreadable","contradicted_facts":[1]}', 3).contradictedFacts, []);
});
test('no JSON, broken JSON or an unknown verdict gives null, never a guess', () => {
  assert.equal(J.parseJudgement('', 3), null);
  assert.equal(J.parseJudgement('The post supports the story.', 3), null);
  assert.equal(J.parseJudgement('{"verdict": "supports", ', 3), null);
  assert.equal(J.parseJudgement('{"verdict":"probably"}', 3), null);
});

console.log('\nDesk label');
test('English and Italian labels', () => {
  assert.equal(J.judgeLabel({ platform: 'facebook', verdict: 'supports', supported: 2, total: 3 }), 'Facebook post, checked by Llama: supports 2 of 3 facts');
  assert.equal(J.judgeLabel({ platform: 'tiktok', verdict: 'contradicts', supported: 0, total: 2 }), 'TikTok video, checked by Llama: contradicts the story');
  assert.equal(J.judgeLabel({ platform: 'instagram', verdict: 'supports', supported: 1, total: 1 }, 'it'), 'Post di Instagram, verificato da Llama: conferma 1 fatto su 1');
  assert.equal(J.judgeLabel({ platform: 'facebook', verdict: 'unreadable', supported: 0, total: 0 }), 'Facebook post, checked by Llama: could not be read');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
