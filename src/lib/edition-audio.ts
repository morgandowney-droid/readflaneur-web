/**
 * The audio edition: a 60 to 90 second spoken version of one edition's
 * morning, first built for GEDI's four quartieri in Italian.
 *
 * Source: getDailyEdition() (licensee-feed.ts) in the edition's language, the
 * same reader the feed, the editor desk and the GEDI morning email use, so the
 * script can only carry what was published after the edition rules. Gemini
 * Flash writes the middle of the script with no search tool: the edition is
 * the only source and the prompt forbids adding facts or stories. The opening
 * (place and date) and the close are fixed text written by code.
 *
 * Deterministic guards before any audio is made: the model-refusal detector
 * (English and Italian phrasing), no em or en dashes, a word range for 60 to
 * 90 seconds, and a proper-noun check that rejects a script naming anything
 * (a capitalised name, or a figure written in digits) that does not appear in
 * the source text. One retry names the offending words; a second failure
 * means no audio for that edition today.
 *
 * Voice: Azure Speech, standard neural it-IT voices, one per edition so Milan,
 * Rome and Sicily do not share a voice. These are standard Italian voices.
 * Azure offers no regional dialect voices for Italian; call it a local voice,
 * never a dialect. Place names the voices misread go through an IPA
 * <phoneme> lexicon (ITALIAN_LEXICON below).
 *
 * Same Azure call as yous.news (AZURE_SPEECH_KEY + AZURE_SPEECH_REGION, REST
 * endpoint https://<region>.tts.speech.microsoft.com/cognitiveservices/v1,
 * output audio-24khz-48kbitrate-mono-mp3).
 *
 * Storage: public bucket `edition-audio` at <edition>/<local date>.mp3 and a
 * row in `edition_audio` (migration 20260927090000_edition_audio.sql).
 *
 * Publisher's voice (29 Sep): the publisher picks a voice A to E on
 * /editor/[group]/voices (catalogue in voice-options.ts), stored in
 * `edition_voice_choice`. Resolution: that choice, else EDITION_VOICES below,
 * else the language's option A. If the choice table cannot be read the
 * existing behaviour stands. An ElevenLabs voice gets plain text (the IPA
 * lexicon is Azure SSML); if the ElevenLabs call fails, the edition's Azure
 * voice reads the script instead, so no edition is left without audio, and
 * the row records which voice produced it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoogleGenAI } from '@google/genai';
import { AI_MODELS } from '@/config/ai-models';
import { recordAiUsage, recordGeminiCall, estimateCost } from '@/lib/ai-cost';
import { isModelRefusal } from '@/lib/model-refusal';
import { stateFor, storyKey, type ItemState } from '@/lib/editorial-decisions';
import { getDailyEdition, type DailyEdition, type Edition } from '@/lib/licensee-feed';
import type { FeedLanguage } from '@/lib/licensees';
import {
  azureLocale,
  customerVoiceLabel,
  defaultOption,
  labelForVoice,
  resolveVoice,
  type ResolvedVoice,
  type StoredVoiceChoice,
} from '@/lib/voice-options';

export const AUDIO_BUCKET = 'edition-audio';
export const AUDIO_TABLE = 'edition_audio';
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const BITRATE_BPS = 48_000;
const TTS_MODEL = 'azure-tts-neural';
/** ElevenLabs output: MP3 at 44.1 kHz, 128 kbps (duration is computed from this). */
const ELEVEN_OUTPUT_FORMAT = 'mp3_44100_128';
export const ELEVEN_BITRATE_BPS = 128_000;
export const VOICE_CHOICE_TABLE = 'edition_voice_choice';

// ─── Voices ────────────────────────────────────────────────────────────────

export interface EditionVoice {
  /** Azure voice name. */
  voice: string;
  /** SSML xml:lang. */
  lang: string;
  /** Speaking rate for <prosody>. */
  rate: string;
}

/**
 * One standard it-IT neural voice per edition (Azure lists 16 standard it-IT
 * neural voices, plus multilingual and HD ones). The two Milan editions get
 * different voices, and Rome and Sicily differ from both. None is a regional
 * accent: Azure's Italian voices are standard Italian.
 */
export const EDITION_VOICES: Record<string, EditionVoice> = {
  // Multilingual voices since 29 Sep: in a blind listen of the same Brera
  // script, Morgan picked Isabella Multilingual as more human and higher
  // definition than standard Isabella and than the MAI-Voice-2.1 HD previews
  // (which sounded flat). Isabella is the only female Multilingual voice.
  'milan-brera': { voice: 'it-IT-IsabellaMultilingualNeural', lang: 'it-IT', rate: '+4%' },
  'milan-porta-venezia': { voice: 'it-IT-AlessioMultilingualNeural', lang: 'it-IT', rate: '+4%' },
  'rome-prati': { voice: 'it-IT-MarcelloMultilingualNeural', lang: 'it-IT', rate: '+4%' },
  'sicily-scicli': { voice: 'it-IT-GiuseppeMultilingualNeural', lang: 'it-IT', rate: '+2%' },
  // United States, in English (30 Sep 2026, for the AP towns). One US voice per edition.
  'newjersey-warren': { voice: 'en-US-AvaMultilingualNeural', lang: 'en-US', rate: '+0%' },
  // AP's London and French towns, in British English for an English-reading desk.
  'london-clerkenwell': { voice: 'en-GB-OllieMultilingualNeural', lang: 'en-GB', rate: '+0%' },
  'provence-gordes': { voice: 'en-GB-AdaMultilingualNeural', lang: 'en-GB', rate: '+0%' },
};

export const AUDIO_EDITION_IDS = Object.keys(EDITION_VOICES);

/** The language an edition's audio is written and read in. */
export type AudioLanguage = 'it' | 'en';

export function audioLanguageFor(editionId: string): AudioLanguage {
  return EDITION_VOICES[editionId]?.lang.startsWith('en') ? 'en' : 'it';
}

export function voiceFor(editionId: string): EditionVoice {
  return EDITION_VOICES[editionId] || { voice: 'it-IT-IsabellaMultilingualNeural', lang: 'it-IT', rate: '+4%' };
}

/**
 * The Azure voice that reads an edition when its chosen ElevenLabs voice
 * fails: the edition's configured voice, else the language's option A.
 */
export function azureFallbackVoice(editionId: string, language: string): EditionVoice {
  if (Object.prototype.hasOwnProperty.call(EDITION_VOICES, editionId)) return EDITION_VOICES[editionId];
  const a = defaultOption(language);
  if (a.provider === 'azure') return { voice: a.voice, lang: azureLocale(a.voice, language), rate: a.rate || '+0%' };
  return voiceFor(editionId);
}

/** Choice, else EDITION_VOICES, else the language's option A. */
export function resolveEditionVoice(editionId: string, language: string, choice: StoredVoiceChoice | null): ResolvedVoice {
  return resolveVoice(editionId, language, choice, EDITION_VOICES);
}

export interface VoiceChoiceRow {
  neighborhood_id: string;
  label: string;
  provider: string | null;
  voice: string | null;
  model: string | null;
  chosen_by: string | null;
  chosen_at: string | null;
}

/** The publisher's chosen voice for an edition, or null. Never throws (the table may not exist yet). */
export async function loadVoiceChoice(db: SupabaseClient, editionId: string): Promise<VoiceChoiceRow | null> {
  return (await loadVoiceChoices(db, [editionId])).get(editionId) || null;
}

/** Chosen voices keyed by edition. Never throws; an unreadable table gives an empty map. */
export async function loadVoiceChoices(db: SupabaseClient, editionIds: string[]): Promise<Map<string, VoiceChoiceRow>> {
  const map = new Map<string, VoiceChoiceRow>();
  if (!editionIds.length) return map;
  try {
    const { data, error } = await db
      .from(VOICE_CHOICE_TABLE)
      .select('neighborhood_id, label, provider, voice, model, chosen_by, chosen_at')
      .in('neighborhood_id', editionIds);
    if (error) {
      console.warn('[edition-audio] voice choice read failed:', error.message);
      return map;
    }
    for (const r of (data || []) as VoiceChoiceRow[]) map.set(r.neighborhood_id, r);
  } catch (e) {
    console.warn('[edition-audio] voice choice read failed:', e instanceof Error ? e.message : String(e));
  }
  return map;
}

/**
 * Place names the Italian voices stress or sound wrongly, as IPA. Scicli is
 * SHEE-klee; Modica and Ispica take the stress on the first syllable. Longest
 * terms are matched first, whole words only, case-sensitive.
 */
export const ITALIAN_LEXICON: Array<{ term: string; ipa: string }> = [
  { term: 'Cola di Rienzo', ipa: 'ˈkɔːla di ˈrjɛntso' },
  { term: "Cava d'Aliga", ipa: 'ˈkaːva ˈdaːliɡa' },
  { term: 'Donnalucata', ipa: 'donnaluˈkaːta' },
  { term: 'Sampieri', ipa: 'samˈpjɛːri' },
  { term: 'Scicli', ipa: 'ˈʃikli' },
  { term: 'Brera', ipa: 'ˈbrɛːra' },
  { term: 'Modica', ipa: 'ˈmɔːdika' },
  { term: 'Ispica', ipa: 'ˈispika' },
  { term: 'Pozzallo', ipa: 'potˈtsallo' },
  { term: 'Ragusa', ipa: 'raˈɡuːza' },
];

// ─── Script source ─────────────────────────────────────────────────────────

const MAX_STORIES = 4;
const MAX_EVENTS = 3;

export interface ScriptSource {
  /** Everything the model is given, as plain text; the proper-noun check reads it. */
  text: string;
  stories: Array<{ key: string; header: string; text: string }>;
  events: Array<{ key: string; when: string; name: string; place: string | null }>;
  /** Look Ahead prose, used only when there are no upcoming events. */
  prose: { key: string; text: string } | null;
  briefArticleId: string | null;
  lookAheadArticleId: string | null;
}

function plain(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ITALIAN_CITY: Record<string, string> = { Milan: 'Milano', Rome: 'Roma', Sicily: 'Sicilia' };

export function spokenPlace(edition: Pick<Edition, 'name' | 'city'>): { name: string; city: string } {
  return { name: edition.name, city: ITALIAN_CITY[edition.city] || edition.city };
}

export function italianSpokenDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function englishSpokenDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function spokenDate(date: string, lang: AudioLanguage = 'it'): string {
  return lang === 'en' ? englishSpokenDate(date) : italianSpokenDate(date);
}

function eventWhen(date: string, time: string | null | undefined, lang: AudioLanguage = 'it'): string {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(lang === 'en' ? 'en-US' : 'it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return time ? `${day}, ${time}` : day;
}

/**
 * An event name written in capitals ("RESTAURO, RIQUALIFICAZIONE E CURA...")
 * in sentence case, so the voice reads words rather than spelling letters.
 * Short all-caps tokens (MACC, FAI) are left alone.
 */
export function unshout(name: string): string {
  const letters = name.replace(/[^\p{L}]/gu, '');
  if (letters.length < 12 || letters !== letters.toUpperCase()) return name;
  const lower = name.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function buildScriptSource(day: DailyEdition, lang: AudioLanguage = 'it'): ScriptSource {
  const stories = (day.daily_brief?.stories || [])
    .filter((s) => plain(s.text).length > 0)
    .slice(0, MAX_STORIES)
    .map((s) => ({ key: s.id, header: plain(s.header), text: plain(s.text) }));

  const la = day.look_ahead;
  const events: ScriptSource['events'] = [];
  if (la) {
    la.events.forEach((e, i) => {
      if (events.length >= MAX_EVENTS || e.date < day.date) return;
      events.push({
        key: storyKey(la.article_id, `event:${i}`),
        when: eventWhen(e.date, e.time, lang),
        name: unshout(e.name),
        place: e.location || e.address || null,
      });
    });
  }
  const prose = la && !events.length && la.body_markdown
    ? { key: storyKey(la.article_id, 'prose'), text: plain(la.body_markdown).slice(0, 900) }
    : null;

  const parts: string[] = [];
  const L = lang === 'en' ? { story: 'STORY', event: 'EVENT', coming: 'COMING UP' } : { story: 'NOTIZIA', event: 'EVENTO', coming: 'IN ARRIVO' };
  stories.forEach((s, i) => parts.push(`${L.story} ${i + 1}: ${s.header}\n${s.text}`));
  events.forEach((e, i) => parts.push(`${L.event} ${i + 1}: ${e.name} | ${e.when}${e.place ? ` | ${e.place}` : ''}`));
  if (prose) parts.push(`${L.coming}: ${prose.text}`);

  return {
    text: parts.join('\n\n'),
    stories,
    events,
    prose,
    briefArticleId: day.daily_brief?.article_id || null,
    lookAheadArticleId: la?.article_id || null,
  };
}

export function itemKeys(src: ScriptSource): string[] {
  return [...src.stories.map((s) => s.key), ...src.events.map((e) => e.key), ...(src.prose ? [src.prose.key] : [])];
}

// ─── Guards ────────────────────────────────────────────────────────────────

const ITALIAN_REFUSAL_OPENING =
  /^[\s>*_#-]*(?:mi dispiace|purtroppo,?\s+non (?:posso|sono in grado)|non (?:posso|sono in grado di) (?:scrivere|generare|creare|fornire)|in quanto (?:modello|intelligenza artificiale)|come (?:modello|intelligenza artificiale))/i;
const ITALIAN_PROMPT_LEAK =
  /\b(?:le mie istruzioni|secondo le istruzioni|il prompt|come modello (?:linguistico|di intelligenza artificiale)|non posso soddisfare)\b/i;

export function isAnyRefusal(text: string): boolean {
  const t = text.trim();
  return isModelRefusal(t) || ITALIAN_REFUSAL_OPENING.test(t.slice(0, 400)) || ITALIAN_PROMPT_LEAK.test(t);
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase();
}

/** Elided article or preposition in front of a word: l'Arena, dell'Accademia. */
const ELISION = /^(?:l|un|dell|all|dall|nell|sull|coll|d|c|quell|quest|sant)'/i;

/**
 * Words written with a capital that do not appear in the source, and figures
 * written in digits that do not appear in the source. A sentence-initial word
 * is checked only when the next word is capitalised too (a two-word name such
 * as "Mario Rossi"), because Italian capitalises every sentence opening.
 */
/**
 * Italian words the script may use for an English word in the source. The
 * Look Ahead listing is stored in English, so "Vatican Museums" is correctly
 * read as "Musei Vaticani"; without this the check called that an invented
 * name and Prati lost its audio on 27 Sep. A word counts only when one of its
 * English equivalents is in the source, so nothing new can slip in this way.
 */
const ITALIAN_FOR_ENGLISH: Record<string, string[]> = {
  museo: ['museum'], musei: ['museums', 'museum'], vaticano: ['vatican'], vaticani: ['vatican'], vaticana: ['vatican'],
  nazionale: ['national'], galleria: ['gallery'], gallerie: ['galleries', 'gallery'], teatro: ['theatre', 'theater'],
  piazza: ['square', 'piazza'], chiesa: ['church'], basilica: ['basilica'], biblioteca: ['library'], mercato: ['market'],
  mercatino: ['market'], parco: ['park'], palazzo: ['palace', 'palazzo'], mostra: ['exhibition'], festa: ['festival', 'party'],
  festival: ['festival'], concerto: ['concert'], giardino: ['garden'], giardini: ['gardens', 'garden'], fiume: ['river'],
  castello: ['castle'], ponte: ['bridge'], stazione: ['station'], scuola: ['school'], comune: ['council', 'municipality'],
  municipio: ['municipality', 'municipio'], maratona: ['marathon'], fiera: ['fair'], antiquariato: ['antiques', 'antique'],
  arte: ['art'], moderna: ['modern'], contemporanea: ['contemporary'], internazionale: ['international'], europee: ['european'],
  giornate: ['days'], patrimonio: ['heritage'],
  primavera: ['spring'], estate: ['summer'], autunno: ['autumn', 'fall'], inverno: ['winter'], collezione: ['collection'],
  sfilata: ['show', 'runway'], moda: ['fashion'], settimana: ['week'], design: ['design'], cinema: ['cinema', 'film'],
};

const ITALIAN_FUNCTION_WORDS = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'del', 'dello', 'della',
  'dei', 'degli', 'delle', 'nel', 'nello', 'nella', 'nei', 'negli', 'nelle', 'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle',
  'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle', 'a', 'da', 'di', 'in', 'con', 'su', 'per', 'tra', 'fra', 'e', 'ed', 'o',
  'anche', 'poi', 'oggi', 'domani', 'infine', 'inoltre', 'sempre', 'ma', 'mentre', 'presso', 'questo', 'questa', 'ecco',
]);

export function unknownProperNouns(script: string, sourceText: string, allowed: string[] = []): string[] {
  const hay = ` ${fold(sourceText)} ${fold(allowed.join(' '))} `.replace(/[^\p{L}\p{N}']+/gu, ' ');
  const inSourceExact = (w: string) => hay.includes(` ${fold(w)} `) || hay.includes(` ${fold(w)}'`) || hay.includes(`'${fold(w)} `);
  const inSource = (w: string) => inSourceExact(w) || (ITALIAN_FOR_ENGLISH[fold(w)] || []).some((en) => hay.includes(` ${en} `));
  const bad = new Set<string>();
  // Figures compared as numbers, so "alle 9" matches "09:00" in the source.
  const figures = new Set((`${sourceText} ${allowed.join(' ')}`.match(/\d+/g) || []).map((n) => String(Number(n))));
  // "2:00 PM" in the English listing is read aloud as "14:00" (Prati, 28 Sep).
  for (const m of `${sourceText} ${allowed.join(' ')}`.matchAll(/\b(\d{1,2})(?::\d{2})?\s*([AaPp])\.?[Mm]\b/g)) {
    const h = Number(m[1]) % 12 + (/p/i.test(m[2]) ? 12 : 0);
    figures.add(String(h));
  }

  for (const sentence of script.split(/(?<=[.!?:;])\s+|\n+/)) {
    const words = sentence.split(/[\s/\-]+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
    words.forEach((raw, i) => {
      const w = raw.replace(ELISION, '');
      if (!w) return;
      if (/^\p{N}/u.test(w)) {
        // A figure: every digit run must appear in the source.
        for (const run of w.match(/\d+/g) || []) {
          if (!figures.has(String(Number(run)))) bad.add(raw);
        }
        return;
      }
      if (!/^\p{Lu}/u.test(w)) return;
      const initial = i === 0 && w === raw;
      // "Al Museo...", "Nella Galleria...": an article or preposition opening a
      // sentence before a name is not itself a name.
      if (initial && ITALIAN_FUNCTION_WORDS.has(fold(w))) return;
      if (initial) {
        const next = words[i + 1];
        if (!next || !/^\p{Lu}/u.test(next)) return;
      }
      if (!inSource(w)) bad.add(raw);
    });
  }
  return [...bad];
}

/** Em and en dash, built from char codes so the source file holds neither character. */
const DASH_CHARS = String.fromCharCode(0x2014, 0x2013);
const DASH = new RegExp(`[${DASH_CHARS}]`);
const DASH_RUN = new RegExp(` *[${DASH_CHARS}] *`, 'g');

export function cleanScript(text: string): string {
  return text
    .replace(/^```[a-z]*\s*|```\s*$/gi, '')
    .replace(/\*\*|__|^#+\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(DASH_RUN, ', ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Middle section limits: with the fixed opening and close, about 60 to 90 seconds. */
const MIN_WORDS = 90;
const MAX_WORDS = 250;

export function scriptProblem(body: string, src: ScriptSource, allowed: string[]): string | null {
  if (!body.trim()) return 'empty script';
  if (isAnyRefusal(body)) return 'model refusal or prompt leak';
  if (DASH.test(body)) return 'contains an em or en dash';
  const n = wordCount(body);
  if (n < MIN_WORDS) return `too short (${n} words)`;
  if (n > MAX_WORDS) return `too long (${n} words)`;
  const unknown = unknownProperNouns(body, src.text, allowed);
  if (unknown.length) return `names not in the edition: ${unknown.slice(0, 8).join(', ')}`;
  return null;
}

// ─── Script writing ────────────────────────────────────────────────────────

export function openingLine(edition: Pick<Edition, 'name' | 'city'>, date: string, lang: AudioLanguage = 'it'): string {
  if (lang === 'en') {
    return `${edition.name}, ${edition.city}. ${englishSpokenDate(date)}. Good morning, ${edition.name}. Here is the news this morning.`;
  }
  const p = spokenPlace(edition);
  return `${p.name}, ${p.city}. ${italianSpokenDate(date)}. Buongiorno, ${p.name}. Ecco le notizie di stamattina.`;
}

export const CLOSING_LINE = 'Per oggi è tutto. Buona giornata.';
export const CLOSING_LINE_EN = 'That is all for this morning. Have a good day.';

export function closingLine(lang: AudioLanguage = 'it'): string {
  return lang === 'en' ? CLOSING_LINE_EN : CLOSING_LINE;
}

function buildPromptEn(edition: Edition, date: string, src: ScriptSource, feedback: string | null): string {
  const eventsRule = src.events.length
    ? `Then present ${src.events.length >= 2 ? 'two or three' : 'the one'} of the upcoming EVENTS, with the day and place as given.`
    : src.prose
      ? 'Then sum up the COMING UP text in one or two sentences.'
      : 'There are no events: do not mention any.';
  const variety = voiceFor(edition.id).lang === 'en-US' ? 'American English' : 'British English';
  return `Write the middle section of a morning local radio news bulletin, in ${variety}, for ${edition.name}, ${edition.city}, ${englishSpokenDate(date)}.

The opening and the close are already written: do NOT greet, do NOT say the place or the date at the start, do NOT sign off.

SOURCE: the text below is this morning's published edition and it is the ONLY source. Do not add facts, stories, names, figures, dates, times or places that are not written below. Do not use outside knowledge. If a detail is missing, leave it out.

STRUCTURE:
- The stories first, in the order given, two sentences each at most.
- ${eventsRule}
- No more than 170 words in all. Keep it short: this is read aloud in about a minute.

STYLE:
- Short sentences that are easy to follow by ear. A calm, warm local-news tone.
- Only text to be read aloud: no headings, lists, symbols, markdown or links.
- Names of people, businesses, events and streets exactly as written in the source.
- Write times with digits as in the source, for example 7:00 PM.
- Do not name any private individual who is not already named in the source.
- No long dashes; use commas or full stops.
- One paragraph per story, separated by a blank line.
${feedback ? `\nCORRECTION: the previous version was rejected because of ${feedback}. Use only names and figures that appear in the source.\n` : ''}
THIS MORNING'S EDITION:
${src.text}`;
}

function buildPrompt(edition: Edition, date: string, src: ScriptSource, feedback: string | null): string {
  const p = spokenPlace(edition);
  const eventsRule = src.events.length
    ? `Poi presenta ${src.events.length >= 2 ? 'due o tre' : 'l\'unico'} degli EVENTI in arrivo, con giorno e luogo come indicati.`
    : src.prose
      ? 'Poi riassumi in una o due frasi il testo IN ARRIVO.'
      : 'Non ci sono eventi: non parlarne.';
  return `Scrivi la parte centrale di un notiziario radiofonico del mattino, in italiano, per ${p.name} (${p.city}), ${italianSpokenDate(date)}.

L'apertura e la chiusura sono già scritte: NON salutare, NON dire il nome del luogo o la data in apertura, NON congedarti.

FONTE: il testo qui sotto è l'edizione pubblicata stamattina ed è l'UNICA fonte. Non aggiungere fatti, notizie, nomi, cifre, date, orari o luoghi che non siano scritti qui sotto. Non usare conoscenze esterne. Se un dettaglio non c'è, non inventarlo.

STRUTTURA:
- Prima le notizie, nell'ordine dato, due o tre frasi ciascuna al massimo.
- ${eventsRule}
- Tra 120 e 180 parole in tutto.

STILE:
- Frasi brevi, facili da ascoltare. Tono sobrio e caldo, da giornale locale.
- Solo testo da leggere ad alta voce: niente titoli, elenchi, simboli, markdown o link.
- Nomi di persone, locali, eventi e vie esattamente come scritti nella fonte.
- Se il titolo di un evento è una frase descrittiva in inglese, descrivilo in italiano con parole semplici invece di leggerlo in inglese; i nomi propri restano come sono.
- Non usare lineette lunghe; usa virgole o punti.
- Un paragrafo per notizia, separati da una riga vuota.
${feedback ? `\nCORREZIONE: la versione precedente è stata scartata perché ${feedback}. Usa solo nomi e cifre presenti nella fonte.\n` : ''}
EDIZIONE DI STAMATTINA:
${src.text}`;
}

export async function writeScript(
  genAI: GoogleGenAI,
  edition: Edition,
  date: string,
  src: ScriptSource,
  lang: AudioLanguage = 'it',
): Promise<{ body: string; attempts: number; rejected: string[] }> {
  const p = spokenPlace(edition);
  const allowed = [p.name, p.city, edition.name, edition.city, 'Flaneur', spokenDate(date, lang), date];
  const rejected: string[] = [];
  let feedback: string | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await genAI.models.generateContent({
      model: AI_MODELS.GEMINI_FLASH,
      contents: lang === 'en' ? buildPromptEn(edition, date, src, feedback) : buildPrompt(edition, date, src, feedback),
      config: { temperature: 0.4, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: 0 } },
    });
    recordGeminiCall(response, { operation: 'edition_audio_script', kind: 'generation', model: AI_MODELS.GEMINI_FLASH, label: edition.id });
    const body = cleanScript(response.text || '');
    const problem = scriptProblem(body, src, allowed);
    if (!problem) return { body, attempts: attempt, rejected };
    rejected.push(problem);
    feedback = problem;
  }
  const fallback = fallbackBody(src, lang);
  if (!fallback) throw new Error(`script rejected: ${rejected.join(' / ')}`);
  rejected.push('used the edition text read verbatim');
  return { body: fallback, attempts: 4, rejected };
}

/**
 * The last resort when every model script fails a check: read the edition's own
 * Italian text, each story's header and its first two sentences, then the
 * events as listed. Nothing is written by a model here, so nothing can be
 * invented, and a quartiere never goes without audio (Prati and Porta Venezia
 * lost theirs on 28 Sep to a time format and an overlong script).
 */
export function fallbackBody(src: ScriptSource, lang: AudioLanguage = 'it'): string | null {
  const parts: string[] = [];
  for (const s of src.stories) {
    const sentences = s.text.match(/[^.!?]+[.!?]+/g) || [s.text];
    const lead = sentences.slice(0, 2).join(' ').trim();
    if (lead) parts.push(`${s.header}. ${lead}`);
  }
  if (src.events.length) {
    const evs = src.events.slice(0, 3).map((e) => `${e.name}, ${e.when}${e.place ? `, ${e.place}` : ''}.`);
    parts.push(`${lang === 'en' ? 'Coming up.' : 'In arrivo.'} ${evs.join(' ')}`);
  }
  const body = cleanScript(parts.join('\n\n'));
  return wordCount(body) >= 20 ? body : null;
}

export function fullScript(edition: Pick<Edition, 'name' | 'city'>, date: string, body: string, lang: AudioLanguage = 'it'): string {
  return `${openingLine(edition, date, lang)}\n\n${body.trim()}\n\n${closingLine(lang)}`;
}

// ─── SSML and synthesis ────────────────────────────────────────────────────

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

function applyLexicon(escaped: string): string {
  const slots: string[] = [];
  let out = escaped;
  const terms = [...ITALIAN_LEXICON].sort((a, b) => b.term.length - a.term.length);
  for (const { term, ipa } of terms) {
    const t = escapeXml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![\\p{L}])${t}(?![\\p{L}])`, 'gu'), (m) => {
      slots.push(`<phoneme alphabet="ipa" ph="${ipa}">${m}</phoneme>`);
      return `\u0000${slots.length - 1}\u0000`;
    });
  }
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)]);
}

export function buildSsml(script: string, v: EditionVoice, lexicon = true): string {
  const paras = script.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // The lexicon is Italian IPA; it is only for an Italian voice.
  lexicon = lexicon && v.lang.startsWith('it');
  const body = paras
    .map((p) => (lexicon ? applyLexicon(escapeXml(p)) : escapeXml(p)))
    .join('<break time="700ms"/>');
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${v.lang}"><voice name="${v.voice}"><prosody rate="${v.rate}">${body}</prosody></voice></speak>`;
}

export function azureConfigured(): boolean {
  return Boolean(process.env.AZURE_SPEECH_KEY?.trim() && process.env.AZURE_SPEECH_REGION?.trim());
}

async function azureTts(ssml: string): Promise<{ audio: Buffer | null; status: number; error: string | null }> {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const region = process.env.AZURE_SPEECH_REGION?.trim();
  if (!key || !region) return { audio: null, status: 0, error: 'AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set' };
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
      'User-Agent': 'flaneur-edition-audio',
    },
    body: ssml,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const err = (await res.text().catch(() => '')).slice(0, 300);
    return { audio: null, status: res.status, error: `Azure TTS ${res.status}: ${err}` };
  }
  return { audio: Buffer.from(await res.arrayBuffer()), status: res.status, error: null };
}

/**
 * Synthesize the script. If Azure rejects the SSML (400, for example over a
 * phoneme), retry once without the lexicon rather than lose the edition.
 * Characters are counted on the SSML sent, an upper bound on what Azure bills.
 */
export async function synthesize(
  script: string,
  v: EditionVoice,
  operation = 'edition_audio_tts',
): Promise<{ audio: Buffer; characters: number; lexicon: boolean }> {
  let ssml = buildSsml(script, v, true);
  let characters = ssml.length;
  let r = await azureTts(ssml);
  let lexicon = true;
  if (!r.audio && r.status === 400) {
    ssml = buildSsml(script, v, false);
    characters += ssml.length;
    r = await azureTts(ssml);
    lexicon = false;
  }
  recordAiUsage({
    provider: 'azure',
    model: TTS_MODEL,
    operation,
    kind: 'generation',
    inputTokens: characters,
    metadata: { voice: v.voice, ok: Boolean(r.audio), lexicon },
  });
  if (!r.audio) throw new Error(r.error || 'Azure TTS returned no audio');
  return { audio: r.audio, characters, lexicon };
}

export function mp3DurationSeconds(bytes: number, bitrateBps: number = BITRATE_BPS): number {
  return Math.round(((bytes * 8) / bitrateBps) * 10) / 10;
}

export function elevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

/** Plain text for ElevenLabs: paragraphs separated by a blank line, nothing else. */
export function elevenLabsText(script: string): string {
  return script.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
}

async function elevenLabsTts(text: string, voiceId: string, model: string): Promise<{ audio: Buffer | null; status: number; error: string | null }> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return { audio: null, status: 0, error: 'ELEVENLABS_API_KEY not set' };
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${ELEVEN_OUTPUT_FORMAT}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: model }),
        signal: AbortSignal.timeout(90_000),
      },
    );
    if (!res.ok) {
      const err = (await res.text().catch(() => '')).slice(0, 300);
      return { audio: null, status: res.status, error: `ElevenLabs TTS ${res.status}: ${err}` };
    }
    const audio = Buffer.from(await res.arrayBuffer());
    if (!audio.length) return { audio: null, status: res.status, error: 'ElevenLabs TTS returned no audio' };
    return { audio, status: res.status, error: null };
  } catch (e) {
    return { audio: null, status: 0, error: `ElevenLabs TTS: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** One ElevenLabs call, recorded in ai_usage_events. Throws on failure. */
export async function synthesizeElevenLabs(
  script: string,
  voiceId: string,
  model: string,
  operation = 'edition_audio_tts',
): Promise<{ audio: Buffer; characters: number; cost_usd: number }> {
  const text = elevenLabsText(script);
  const r = await elevenLabsTts(text, voiceId, model);
  const cost = estimateCost({ provider: 'elevenlabs', model, inputTokens: text.length, outputTokens: 0 });
  recordAiUsage({
    provider: 'elevenlabs',
    model,
    operation,
    kind: 'generation',
    inputTokens: text.length,
    metadata: { voice: voiceId, ok: Boolean(r.audio), status: r.status },
  });
  if (!r.audio) throw new Error(r.error || 'ElevenLabs TTS returned no audio');
  return { audio: r.audio, characters: text.length, cost_usd: cost };
}

export interface VoiceSynthesis {
  audio: Buffer;
  characters: number;
  provider: 'azure' | 'elevenlabs';
  voice: string;
  model: string;
  bitrateBps: number;
  /** True when the chosen ElevenLabs voice failed and Azure read the script. */
  fellBack: boolean;
  fallbackReason: string | null;
  cost_usd: number;
}

/**
 * Read the script with the resolved voice. An ElevenLabs failure falls back
 * to the edition's Azure voice so the edition still gets audio.
 */
export async function synthesizeVoice(script: string, resolved: ResolvedVoice, fallback: EditionVoice): Promise<VoiceSynthesis> {
  let fallbackReason: string | null = null;
  if (resolved.provider === 'elevenlabs') {
    const model = resolved.model || 'eleven_v4';
    try {
      const r = await synthesizeElevenLabs(script, resolved.voice, model);
      return {
        audio: r.audio, characters: r.characters, provider: 'elevenlabs', voice: resolved.voice, model,
        bitrateBps: ELEVEN_BITRATE_BPS, fellBack: false, fallbackReason: null, cost_usd: r.cost_usd,
      };
    } catch (e) {
      fallbackReason = e instanceof Error ? e.message : String(e);
      console.warn('[edition-audio] ElevenLabs failed, reading with Azure:', fallbackReason);
    }
  }
  const v: EditionVoice = resolved.provider === 'azure' ? { voice: resolved.voice, lang: resolved.lang, rate: resolved.rate } : fallback;
  const tts = await synthesize(script, v);
  return {
    audio: tts.audio, characters: tts.characters, provider: 'azure', voice: v.voice, model: TTS_MODEL,
    bitrateBps: BITRATE_BPS, fellBack: resolved.provider === 'elevenlabs', fallbackReason,
    cost_usd: estimateCost({ provider: 'azure', model: TTS_MODEL, inputTokens: tts.characters, outputTokens: 0 }),
  };
}

// ─── Rows ──────────────────────────────────────────────────────────────────

export interface EditionAudioRow {
  neighborhood_id: string;
  audio_date: string;
  language: string;
  voice: string;
  script: string;
  storage_path: string;
  audio_url: string;
  duration_s: number | null;
  bytes: number | null;
  brief_article_id: string | null;
  look_ahead_article_id: string | null;
  item_keys: string[];
  tts_characters: number | null;
  cost_usd: number | null;
  model: string | null;
  created_at?: string;
  updated_at?: string;
}

export function audioPath(editionId: string, date: string): string {
  return `${editionId}/${date}.mp3`;
}

/** Today's audio rows for these editions, keyed by edition id. Never throws (the table may not exist yet). */
export async function loadEditionAudio(
  db: SupabaseClient,
  editionIds: string[],
  date: string,
  language: string,
): Promise<Map<string, EditionAudioRow>> {
  const map = new Map<string, EditionAudioRow>();
  if (!editionIds.length) return map;
  const { data, error } = await db
    .from(AUDIO_TABLE)
    .select('*')
    .in('neighborhood_id', editionIds)
    .eq('audio_date', date)
    .eq('language', language);
  if (error) {
    console.warn('[edition-audio] read failed:', error.message);
    return map;
  }
  for (const r of (data || []) as EditionAudioRow[]) map.set(r.neighborhood_id, r);
  return map;
}

/**
 * The audio a licensee feed may serve for this day. It must have been made
 * from the same articles the response carries. For a licensee that requires
 * approval, every story and event the script used must be approved and
 * unedited; otherwise the audio would speak something the feed withholds or
 * an editor has changed.
 */
export function audioForFeed(
  row: EditionAudioRow | undefined,
  day: Pick<DailyEdition, 'daily_brief' | 'look_ahead'>,
  states: Map<string, ItemState> | null,
): { url: string; duration_s: number | null; voice: string } | null {
  if (!row) return null;
  const briefId = day.daily_brief?.article_id || null;
  const laId = day.look_ahead?.article_id || null;
  if (row.brief_article_id && row.brief_article_id !== briefId) return null;
  if (row.look_ahead_article_id && row.look_ahead_article_id !== laId) return null;
  if (states) {
    for (const k of row.item_keys || []) {
      const st = stateFor(states, k);
      if (st.status !== 'approved' || st.edited) return null;
    }
  }
  // A licensee sees the voice as its option label ("Voce A"), never a provider's voice name or id.
  const label = labelForVoice(row.language, row.voice);
  return {
    url: row.audio_url,
    duration_s: row.duration_s === null ? null : Number(row.duration_s),
    // A voice outside the A to E catalogue (a US edition voice) is still never named.
    voice: label ? customerVoiceLabel(label, row.language) : (row.language === 'it' ? 'Voce' : 'Voice'),
  };
}

// ─── One edition, end to end ───────────────────────────────────────────────

export interface AudioResult {
  edition: string;
  status: 'created' | 'skipped' | 'failed';
  reason?: string;
  voice?: string;
  /** Which provider produced the audio, and whether a chosen voice fell back to Azure. */
  provider?: 'azure' | 'elevenlabs';
  voice_label?: string | null;
  voice_source?: ResolvedVoice['source'];
  fell_back?: boolean;
  duration_s?: number;
  words?: number;
  characters?: number;
  cost_usd?: number;
  attempts?: number;
  rejected?: string[];
  url?: string;
  script?: string;
  audio?: Buffer;
}

export interface GenerateOptions {
  language: FeedLanguage;
  /** Read articles scheduled up to this time (they publish at 07:00 local). */
  asOf: Date;
  force: boolean;
  /** Write MP3 and row. False for a local dry run that only returns the audio. */
  store: boolean;
}

export async function generateEditionAudio(
  db: SupabaseClient,
  genAI: GoogleGenAI,
  edition: Edition,
  date: string,
  opts: GenerateOptions,
): Promise<AudioResult> {
  const base: AudioResult = { edition: edition.id, status: 'skipped' };
  const day = await getDailyEdition(db, edition, date, opts.language, null, { asOf: opts.asOf });
  if (!day.daily_brief) return { ...base, reason: 'no published Daily Brief yet' };
  if (day.language !== opts.language) return { ...base, reason: `translation to ${opts.language} not ready` };

  const lang: AudioLanguage = opts.language === 'en' ? 'en' : 'it';
  const src = buildScriptSource(day, lang);
  if (!src.stories.length) return { ...base, reason: 'Daily Brief has no stories' };

  if (opts.store && !opts.force) {
    const existing = (await loadEditionAudio(db, [edition.id], date, opts.language)).get(edition.id);
    // Remake only when a Look Ahead has appeared since, or the brief changed.
    if (
      existing &&
      existing.brief_article_id === src.briefArticleId &&
      (existing.look_ahead_article_id || !src.lookAheadArticleId)
    ) {
      return { ...base, reason: 'audio already made for this date' };
    }
  }

  // The publisher's chosen voice, else the configured one, else option A.
  // A failed read of the choice table leaves the choice null.
  const choice = await loadVoiceChoice(db, edition.id);
  const resolved = resolveEditionVoice(edition.id, opts.language, choice);
  const written = await writeScript(genAI, edition, date, src, lang);
  const script = fullScript(edition, date, written.body, lang);
  const tts = await synthesizeVoice(script, resolved, azureFallbackVoice(edition.id, opts.language));
  const duration = mp3DurationSeconds(tts.audio.length, tts.bitrateBps);
  // Script cost is small and recorded per call in ai_usage_events; the row
  // carries TTS cost plus a rough allowance for the script call(s).
  const cost = Number((tts.cost_usd + written.attempts * 0.0015).toFixed(6));
  const rejected = tts.fellBack
    ? [...written.rejected, `chosen voice failed, read by the Azure voice: ${tts.fallbackReason}`]
    : written.rejected;

  const result: AudioResult = {
    edition: edition.id,
    status: 'created',
    voice: tts.voice,
    provider: tts.provider,
    voice_label: labelForVoice(opts.language, tts.voice),
    voice_source: resolved.source,
    fell_back: tts.fellBack,
    duration_s: duration,
    words: wordCount(script),
    characters: tts.characters,
    cost_usd: cost,
    attempts: written.attempts,
    rejected,
    script,
    audio: tts.audio,
  };
  if (!opts.store) return result;

  const path = audioPath(edition.id, date);
  const up = await db.storage.from(AUDIO_BUCKET).upload(path, tts.audio, { contentType: 'audio/mpeg', upsert: true, cacheControl: '300' });
  if (up.error) throw new Error(`storage upload: ${up.error.message}`);
  const publicUrl = db.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl;
  // Version the URL so a regenerated file is not served from a cache.
  const url = `${publicUrl}?v=${Date.now().toString(36)}`;

  const row: EditionAudioRow = {
    neighborhood_id: edition.id,
    audio_date: date,
    language: opts.language,
    voice: tts.voice,
    script,
    storage_path: path,
    audio_url: url,
    duration_s: duration,
    bytes: tts.audio.length,
    brief_article_id: src.briefArticleId,
    look_ahead_article_id: src.lookAheadArticleId,
    item_keys: itemKeys(src),
    tts_characters: tts.characters,
    cost_usd: cost,
    // Which provider, model and voice produced the file (after any fallback).
    model: `${AI_MODELS.GEMINI_FLASH} + ${tts.provider}:${tts.model}:${tts.voice}${tts.fellBack ? ' (fallback)' : ''}`,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from(AUDIO_TABLE).upsert(row, { onConflict: 'neighborhood_id,audio_date,language' });
  if (error) throw new Error(`${AUDIO_TABLE}: ${error.message}`);
  return { ...result, url };
}
