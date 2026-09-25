#!/usr/bin/env node
/**
 * Tests for the audio edition's deterministic parts (src/lib/edition-audio.ts):
 * the script guards, the SSML lexicon and the feed gate.
 *
 *   node scripts/test-edition-audio.mjs
 *
 * Loads the shipped TypeScript through jiti with the project's "@/" alias.
 * No network, no database, no model or TTS calls.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { createJiti } = require('jiti');
const jiti = createJiti(join(root, 'scripts', 'x.js'), { alias: { '@': join(root, 'src') } });
const A = await jiti.import(join(root, 'src/lib/edition-audio.ts'));
const { storyKey } = await jiti.import(join(root, 'src/lib/editorial-decisions.ts'));

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

const source = `NOTIZIA 1: La Corsa
Domani, sabato 26 settembre, torna la 33ª edizione del Memorial Peppe Greco a Scicli.

EVENTO 1: I Puritani by Bellini | venerdì 25 settembre, 17:30 | Teatro Metropolitan
EVENTO 2: Visita | venerdì 25 settembre, 09:00 | Hotel Villa Carlotta`;
const allowed = ['Scicli', 'Sicilia', '2026-09-25'];

test('names and figures from the source pass', () => {
  const s = 'Domani torna il Memorial Peppe Greco. Alle 17:30, al Teatro Metropolitan, I Puritani di Bellini. Alle 9, Hotel Villa Carlotta.';
  assert.deepEqual(A.unknownProperNouns(s, source, allowed), []);
});

test('an invented name is caught', () => {
  const s = "Domani torna il Memorial Peppe Greco con l'assessore Mario Rossi.";
  assert.deepEqual(A.unknownProperNouns(s, source, allowed), ['Mario', 'Rossi']);
});

test('an invented two-word name at a sentence start is caught', () => {
  const s = 'Mario Rossi ha parlato ieri. La corsa torna domani.';
  assert.ok(A.unknownProperNouns(s, source, allowed).includes('Mario'));
});

test('an ordinary sentence opening is not a name', () => {
  assert.deepEqual(A.unknownProperNouns('Infine, la corsa. Domani si parte.', source, allowed), []);
});

test('an invented figure is caught', () => {
  assert.deepEqual(A.unknownProperNouns('Attesi 5000 corridori.', source, allowed), ['5000']);
});

test('elided names are checked on the name', () => {
  assert.deepEqual(A.unknownProperNouns("Serata all'Hotel Villa Carlotta.", source, allowed), []);
  assert.deepEqual(A.unknownProperNouns("Serata all'Ariston.", source, allowed), ["all'Ariston"]);
});

test('Italian and English refusals are caught', () => {
  assert.ok(A.isAnyRefusal('Mi dispiace, ma non posso scrivere questo notiziario.'));
  assert.ok(A.isAnyRefusal('I am sorry, but I cannot fulfill your request.'));
  assert.ok(A.isAnyRefusal('Ecco il testo. Secondo le istruzioni devo usare solo la fonte.'));
  assert.ok(!A.isAnyRefusal('Domani torna il Memorial Peppe Greco.'));
});

test('cleanScript removes dashes and markdown', () => {
  const D = String.fromCharCode(0x2014, 0x2013);
  const out = A.cleanScript(`**Notizie**\n- La corsa ${D[0]} domani ${D[1]} torna, 2014.`);
  assert.ok(!out.includes(D[0]) && !out.includes(D[1]) && !out.includes('*'));
  assert.equal(out, 'Notizie\nLa corsa, domani, torna, 2014.', 'digits survive');
});

test('scriptProblem rejects short, refusing and inventive scripts', () => {
  const src = { text: source, stories: [], events: [], prose: null, briefArticleId: null, lookAheadArticleId: null };
  assert.match(A.scriptProblem('Troppo corto.', src, allowed), /too short/);
  assert.match(A.scriptProblem(`Mi dispiace, non posso scrivere. ${'parola '.repeat(120)}`, src, allowed), /refusal/);
  const long = `${'la corsa torna domani a Scicli. '.repeat(20)}Parla Mario Rossi.`;
  assert.match(A.scriptProblem(long, src, allowed), /Mario/);
  assert.equal(A.scriptProblem('la corsa torna domani a Scicli. '.repeat(20), src, allowed), null);
});

test('SSML escapes text and applies the lexicon once, whole words only', () => {
  const ssml = A.buildSsml('Scicli & Donnalucata.\n\nSciclitani a Brera.', A.voiceFor('sicily-scicli'));
  assert.ok(ssml.includes('<phoneme alphabet="ipa" ph="ˈʃikli">Scicli</phoneme> &amp; <phoneme alphabet="ipa" ph="donnaluˈkaːta">Donnalucata</phoneme>'));
  assert.ok(ssml.includes('Sciclitani a <phoneme'), 'Sciclitani is not Scicli');
  assert.ok(ssml.includes('<break time="700ms"/>'));
  assert.ok(ssml.includes('<voice name="it-IT-GiuseppeNeural">'));
  assert.ok(!A.buildSsml('Scicli', A.voiceFor('sicily-scicli'), false).includes('phoneme'));
});

test('Cola di Rienzo is one phoneme, not nested', () => {
  const ssml = A.buildSsml('Via Cola di Rienzo.', A.voiceFor('rome-prati'));
  assert.equal((ssml.match(/<phoneme/g) || []).length, 1);
});

test('each GEDI edition has its own voice', () => {
  const voices = ['milan-brera', 'milan-porta-venezia', 'rome-prati', 'sicily-scicli'].map((id) => A.voiceFor(id).voice);
  assert.equal(new Set(voices).size, 4);
});

test('unshout sentence-cases a shouted event name only', () => {
  assert.equal(A.unshout('RESTAURO, RIQUALIFICAZIONE E CURA'), 'Restauro, riqualificazione e cura');
  assert.equal(A.unshout('MACC Music Festival'), 'MACC Music Festival');
  assert.equal(A.unshout('FAI'), 'FAI');
});

test('mp3 duration from bytes at 48 kbit/s', () => {
  assert.equal(A.mp3DurationSeconds(450_000), 75);
});

test('feed gate: same articles, all items approved and unedited', () => {
  const brief = 'b1', la = 'l1';
  const keys = [storyKey(brief, 0), storyKey(brief, 1), storyKey(la, 'event:0')];
  const row = { audio_url: 'u', duration_s: 70, voice: 'v', brief_article_id: brief, look_ahead_article_id: la, item_keys: keys };
  const day = { daily_brief: { article_id: brief }, look_ahead: { article_id: la } };
  const st = (status, edited = false) => ({ status, edited, header: null, text: null, decided_by: 'x', decided_at: 'y' });
  const all = new Map(keys.map((k) => [k, st('approved')]));
  assert.deepEqual(A.audioForFeed(row, day, null), { url: 'u', duration_s: 70, voice: 'v' });
  assert.ok(A.audioForFeed(row, day, all));
  assert.equal(A.audioForFeed(row, day, new Map([[keys[0], st('approved')]])), null, 'pending items block it');
  assert.equal(A.audioForFeed(row, day, new Map([...all, [keys[1], st('approved', true)]])), null, 'an edit blocks it');
  assert.equal(A.audioForFeed(row, day, new Map([...all, [keys[2], st('held')]])), null, 'a held event blocks it');
  assert.equal(A.audioForFeed(row, { daily_brief: { article_id: 'other' }, look_ahead: day.look_ahead }, null), null, 'stale audio');
  assert.equal(A.audioForFeed(undefined, day, null), null);
});

console.log(`\n${passed} passed`);
