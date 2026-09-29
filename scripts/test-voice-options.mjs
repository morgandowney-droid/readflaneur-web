#!/usr/bin/env node
/**
 * Tests for the publisher's voice choice (src/lib/voice-options.ts and its
 * use in src/lib/edition-audio.ts): resolution order (choice, then the
 * edition's configured voice, then option A), label validation, and that no
 * provider, model or voice name reaches what the customer sees.
 *
 *   node scripts/test-voice-options.mjs
 *
 * Loads the shipped TypeScript through jiti with the project's "@/" alias.
 * No network, no database, no TTS calls.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { createJiti } = require('jiti');
const jiti = createJiti(join(root, 'scripts', 'x.js'), { alias: { '@': join(root, 'src') } });
const V = await jiti.import(join(root, 'src/lib/voice-options.ts'));
const A = await jiti.import(join(root, 'src/lib/edition-audio.ts'));

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

const LANGS = ['it', 'de', 'fr', 'es', 'en', 'nb', 'sv', 'pt'];

test('every language has A to E, A is Azure, labels are unique', () => {
  for (const l of LANGS) {
    const opts = V.VOICE_OPTIONS[l];
    assert.deepEqual(opts.map((o) => o.label), ['A', 'B', 'C', 'D', 'E'], l);
    assert.equal(opts[0].provider, 'azure', l);
    for (const o of opts) {
      if (o.provider === 'elevenlabs') assert.equal(o.model, 'eleven_v4', `${l} ${o.label}`);
      if (o.provider === 'azure') assert.ok(o.voice.startsWith(`${l === 'en' ? 'en-GB' : V.azureLocale(o.voice, l)}-`), `${l} ${o.label}`);
    }
  }
});

test('Italian A is Isabella Multilingual (Morgan\'s blind pick)', () => {
  assert.equal(V.defaultOption('it').voice, 'it-IT-IsabellaMultilingualNeural');
  assert.equal(V.optionFor('it', 'B').voice, 'it-IT-GiuseppeMultilingualNeural');
});

test('label validation', () => {
  for (const l of ['A', 'B', 'C', 'D', 'E']) assert.ok(V.isVoiceLabel(l));
  for (const bad of ['a', 'F', '', ' A', 'AB', null, undefined, 1, {}]) assert.equal(V.isVoiceLabel(bad), false, String(bad));
  assert.equal(V.optionFor('it', 'F'), null);
  assert.equal(V.optionFor('it', 'a'), null);
  // An unknown language falls back to the English catalogue, not to nothing.
  assert.equal(V.optionFor('zh', 'A').voice, V.VOICE_OPTIONS.en[0].voice);
});

const EV = { 'milan-brera': { voice: 'it-IT-IsabellaMultilingualNeural', lang: 'it-IT', rate: '+4%' }, 'rome-prati': { voice: 'it-IT-MarcelloMultilingualNeural', lang: 'it-IT', rate: '+4%' } };

test('resolution: a choice wins over the configured voice', () => {
  const r = V.resolveVoice('rome-prati', 'it', { label: 'D' }, EV);
  assert.equal(r.source, 'choice');
  assert.equal(r.label, 'D');
  assert.equal(r.provider, 'elevenlabs');
  assert.equal(r.model, 'eleven_v4');
});

test('resolution: no choice uses the configured voice', () => {
  const r = V.resolveVoice('rome-prati', 'it', null, EV);
  assert.equal(r.source, 'edition');
  assert.equal(r.provider, 'azure');
  assert.equal(r.voice, 'it-IT-MarcelloMultilingualNeural');
  assert.equal(r.label, null); // Marcello is not one of A to E
  assert.equal(V.resolveVoice('milan-brera', 'it', null, EV).label, 'A');
});

test('resolution: no choice and no configured voice uses option A', () => {
  const r = V.resolveVoice('vorarlberg-bregenz', 'de', null, EV);
  assert.equal(r.source, 'default');
  assert.equal(r.label, 'A');
  assert.equal(r.voice, V.VOICE_OPTIONS.de[0].voice);
  assert.equal(r.lang, 'de-DE');
});

test('resolution: an invalid stored label falls through to the stored voice, then to the configured one', () => {
  const stored = V.resolveVoice('rome-prati', 'it', { label: 'Z', provider: 'azure', voice: 'it-IT-DiegoNeural' }, EV);
  assert.equal(stored.source, 'choice');
  assert.equal(stored.voice, 'it-IT-DiegoNeural');
  const junk = V.resolveVoice('rome-prati', 'it', { label: 'Z', provider: 'openai', voice: 'x' }, EV);
  assert.equal(junk.source, 'edition');
});

test('edition-audio resolves through EDITION_VOICES', () => {
  assert.equal(A.resolveEditionVoice('sicily-scicli', 'it', null).voice, A.EDITION_VOICES['sicily-scicli'].voice);
  assert.equal(A.resolveEditionVoice('sicily-scicli', 'it', { label: 'C' }).voice, V.optionFor('it', 'C').voice);
  assert.equal(A.resolveEditionVoice('oslo-frogner', 'nb', null).voice, 'nb-NO-PernilleNeural');
});

test('an ElevenLabs failure has an Azure voice to fall back to', () => {
  assert.equal(A.azureFallbackVoice('rome-prati', 'it').voice, 'it-IT-MarcelloMultilingualNeural');
  const nb = A.azureFallbackVoice('oslo-frogner', 'nb');
  assert.equal(nb.voice, 'nb-NO-PernilleNeural');
  assert.equal(nb.lang, 'nb-NO');
});

test('durations follow the output bitrate', () => {
  assert.equal(A.mp3DurationSeconds(48_000 * 60 / 8), 60);
  assert.equal(A.mp3DurationSeconds(128_000 * 60 / 8, A.ELEVEN_BITRATE_BPS), 60);
});

test('ElevenLabs gets plain text with paragraph breaks', () => {
  assert.equal(A.elevenLabsText('Scicli,  Sicilia.\n\n\nUna  notizia.\nSegue.'), 'Scicli, Sicilia.\n\nUna notizia. Segue.');
});

test('the lexicon applies only to an Italian voice', () => {
  assert.ok(A.buildSsml('Scicli', { voice: 'it-IT-IsabellaMultilingualNeural', lang: 'it-IT', rate: '+0%' }).includes('phoneme'));
  assert.ok(!A.buildSsml('Scicli', { voice: 'de-DE-KatjaNeural', lang: 'de-DE', rate: '+0%' }).includes('phoneme'));
});

// Everything a provider or model could be called.
const LEAK = /azure|eleven|neural|multilingual|microsoft|openai|gemini|google|\b[a-z]{2}-[A-Z]{2}\b|eleven_v4|Xb7hH8|JBFqnC/i;

test('customer labels carry no provider, model or voice name', () => {
  for (const l of LANGS) {
    for (const o of V.VOICE_OPTIONS[l]) {
      for (const ui of ['it', 'en', 'de']) {
        const s = V.customerVoiceLabel(o.label, ui);
        assert.match(s, /^(Voce|Voice) [A-E]$/);
        assert.doesNotMatch(s, LEAK);
      }
    }
  }
});

test('sample file paths carry no provider or voice name', () => {
  for (const l of LANGS) {
    for (const o of V.VOICE_OPTIONS[l]) {
      const p = V.samplePath('milan-brera', o.label, '2026-09-29', o);
      assert.match(p, /^samples\/milan-brera\/[A-E]-2026-09-29-[0-9a-z]{1,6}\.mp3$/);
      assert.doesNotMatch(p.replace('milan-brera', ''), LEAK);
    }
  }
  // An edited option gets a different file.
  const o = V.optionFor('it', 'C');
  assert.notEqual(V.samplePath('x', 'C', '2026-09-29', o), V.samplePath('x', 'C', '2026-09-29', { ...o, voice: 'it-IT-MarcelloMultilingualNeural' }));
});

test('the licensee feed shows a catalogue voice as its label', () => {
  const day = { daily_brief: { article_id: 'b' }, look_ahead: null };
  const row = { audio_url: 'u', duration_s: 70, voice: 'it-IT-GiuseppeMultilingualNeural', language: 'it', brief_article_id: 'b', look_ahead_article_id: null, item_keys: [] };
  assert.equal(A.audioForFeed(row, day, null).voice, 'Voce B');
  const eleven = { ...row, voice: V.optionFor('it', 'D').voice };
  assert.equal(A.audioForFeed(eleven, day, null).voice, 'Voce D');
  assert.doesNotMatch(A.audioForFeed(eleven, day, null).voice, LEAK);
});

test('the customer-facing page source names no provider or model', () => {
  for (const f of ['src/app/editor/[group]/voices/route.ts', 'src/app/editor/[group]/voices/choose/route.ts']) {
    const src = readFileSync(join(root, f), 'utf8');
    // Only the STRINGS tables and HTML are shown; check the whole file for provider names in quotes.
    const quoted = src.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) || [];
    for (const q of quoted) assert.doesNotMatch(q, /azure|elevenlabs|eleven labs|microsoft|eleven_v4/i, `${f}: ${q.slice(0, 80)}`);
  }
});

console.log(`\n${passed} passed`);
