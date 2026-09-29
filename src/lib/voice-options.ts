/**
 * The voices a publisher chooses from for its audio edition.
 *
 * At setup, besides defining the area, we send the publisher the voices page
 * for that area (/editor/[group]/voices) and their own editors pick the voice
 * by ear: we are not native speakers of Italian, German or French, they are.
 * The customer sees only "Voce A" to "Voce E" (or "Voice A" to "Voice E").
 * Provider and model names never appear on the page, in a file name the
 * customer sees, or in the licensee feed.
 *
 * Per language, up to five options labelled A to E. A is always an Azure
 * voice and is the default. D and E are ElevenLabs voices on Eleven v4.
 *
 * Editing: change a row below. A sample on the voices page is cached under a
 * short hash of its provider, voice, model and rate, so an edited option gets
 * a fresh sample on the next view without ?refresh=1.
 *
 * Azure voices checked against the voices list endpoint (northeurope) on
 * 29 Sep 2026. ElevenLabs: our production key lacks voices_read, so voice ids
 * cannot be listed by us; D and E use ElevenLabs premade voices whose ids are
 * publicly documented, which speak every Eleven v4 language but are native
 * English speakers. They carry a TODO until a native voice from the ElevenLabs
 * library replaces them.
 *
 * Pure module (no database, no network) so scripts/test-voice-options.mjs can
 * load it directly.
 */

export type VoiceLabel = 'A' | 'B' | 'C' | 'D' | 'E';
export type VoiceProvider = 'azure' | 'elevenlabs';
export type VoiceLanguage = 'it' | 'de' | 'fr' | 'es' | 'en' | 'nb' | 'sv' | 'pt';

export const VOICE_LABELS: readonly VoiceLabel[] = ['A', 'B', 'C', 'D', 'E'];
export const DEFAULT_LABEL: VoiceLabel = 'A';

export interface VoiceOption {
  label: VoiceLabel;
  provider: VoiceProvider;
  /** Azure voice short name, or ElevenLabs voice id. */
  voice: string;
  /** ElevenLabs model id. Unused for Azure. */
  model?: string;
  /** Azure <prosody> rate. Unused for ElevenLabs. */
  rate?: string;
  gender: 'female' | 'male';
}

export const ELEVEN_MODEL = 'eleven_v4';

/**
 * ElevenLabs premade voices (public ids from the ElevenLabs docs). Native
 * English speakers; used for every language until native voices are chosen.
 */
const ELEVEN_ALICE = 'Xb7hH8MSUJpSbSDYk0k2'; // female, British English
const ELEVEN_GEORGE = 'JBFqnCBsd6RMkjVDRZzb'; // male, British English

function az(label: VoiceLabel, voice: string, gender: VoiceOption['gender'], rate = '+4%'): VoiceOption {
  return { label, provider: 'azure', voice, rate, gender };
}
function el(label: VoiceLabel, voice: string, gender: VoiceOption['gender']): VoiceOption {
  return { label, provider: 'elevenlabs', voice, model: ELEVEN_MODEL, gender };
}

export const VOICE_OPTIONS: Record<VoiceLanguage, VoiceOption[]> = {
  it: [
    // A: Morgan's blind pick on 29 Sep, over standard Isabella and the HD previews.
    az('A', 'it-IT-IsabellaMultilingualNeural', 'female'),
    az('B', 'it-IT-GiuseppeMultilingualNeural', 'male'),
    az('C', 'it-IT-AlessioMultilingualNeural', 'male'),
    // TODO: replace with a native Italian voice from the ElevenLabs library.
    el('D', ELEVEN_ALICE, 'female'),
    // TODO: replace with a native Italian voice from the ElevenLabs library.
    el('E', ELEVEN_GEORGE, 'male'),
  ],
  de: [
    az('A', 'de-DE-SeraphinaMultilingualNeural', 'female'),
    az('B', 'de-DE-FlorianMultilingualNeural', 'male'),
    az('C', 'de-DE-KatjaNeural', 'female'),
    // TODO: replace with a native German voice from the ElevenLabs library.
    el('D', ELEVEN_ALICE, 'female'),
    // TODO: replace with a native German voice from the ElevenLabs library.
    el('E', ELEVEN_GEORGE, 'male'),
  ],
  fr: [
    az('A', 'fr-FR-VivienneMultilingualNeural', 'female'),
    az('B', 'fr-FR-RemyMultilingualNeural', 'male'),
    az('C', 'fr-FR-LucienMultilingualNeural', 'male'),
    // TODO: replace with a native French voice from the ElevenLabs library.
    el('D', ELEVEN_ALICE, 'female'),
    // TODO: replace with a native French voice from the ElevenLabs library.
    el('E', ELEVEN_GEORGE, 'male'),
  ],
  es: [
    az('A', 'es-ES-XimenaMultilingualNeural', 'female'),
    az('B', 'es-ES-TristanMultilingualNeural', 'male'),
    az('C', 'es-ES-ArabellaMultilingualNeural', 'female'),
    // TODO: replace with a native Spanish voice from the ElevenLabs library.
    el('D', ELEVEN_ALICE, 'female'),
    // TODO: replace with a native Spanish voice from the ElevenLabs library.
    el('E', ELEVEN_GEORGE, 'male'),
  ],
  en: [
    // British English locale. An Australian, Irish or North American edition
    // may want en-AU / en-IE / en-US voices here instead.
    az('A', 'en-GB-AdaMultilingualNeural', 'female'),
    az('B', 'en-GB-OllieMultilingualNeural', 'male'),
    az('C', 'en-GB-SoniaNeural', 'female'),
    // Alice and George are native British English voices already.
    el('D', ELEVEN_ALICE, 'female'),
    el('E', ELEVEN_GEORGE, 'male'),
  ],
  nb: [
    // Azure has no Multilingual nb-NO voice; these are the three standard ones.
    az('A', 'nb-NO-PernilleNeural', 'female'),
    az('B', 'nb-NO-FinnNeural', 'male'),
    az('C', 'nb-NO-IselinNeural', 'female'),
    // TODO: replace with a native Norwegian voice from the ElevenLabs library.
    el('D', ELEVEN_ALICE, 'female'),
    // TODO: replace with a native Norwegian voice from the ElevenLabs library.
    el('E', ELEVEN_GEORGE, 'male'),
  ],
  sv: [
    // Azure has no Multilingual sv-SE voice; these are the three standard ones.
    az('A', 'sv-SE-SofieNeural', 'female'),
    az('B', 'sv-SE-MattiasNeural', 'male'),
    az('C', 'sv-SE-HilleviNeural', 'female'),
    // TODO: replace with a native Swedish voice from the ElevenLabs library.
    el('D', ELEVEN_ALICE, 'female'),
    // TODO: replace with a native Swedish voice from the ElevenLabs library.
    el('E', ELEVEN_GEORGE, 'male'),
  ],
  pt: [
    // European Portuguese. Azure has no Multilingual pt-PT voice.
    az('A', 'pt-PT-RaquelNeural', 'female'),
    az('B', 'pt-PT-DuarteNeural', 'male'),
    az('C', 'pt-PT-FernandaNeural', 'female'),
    // TODO: replace with a native Portuguese voice from the ElevenLabs library.
    el('D', ELEVEN_ALICE, 'female'),
    // TODO: replace with a native Portuguese voice from the ElevenLabs library.
    el('E', ELEVEN_GEORGE, 'male'),
  ],
};

export function isVoiceLabel(s: unknown): s is VoiceLabel {
  return typeof s === 'string' && (VOICE_LABELS as readonly string[]).includes(s);
}

export function isVoiceLanguage(s: unknown): s is VoiceLanguage {
  return typeof s === 'string' && Object.prototype.hasOwnProperty.call(VOICE_OPTIONS, s);
}

/** The options for a language; a language with no catalogue gets the English one. */
export function voiceOptionsFor(language: string): VoiceOption[] {
  return isVoiceLanguage(language) ? VOICE_OPTIONS[language] : VOICE_OPTIONS.en;
}

export function optionFor(language: string, label: unknown): VoiceOption | null {
  if (!isVoiceLabel(label)) return null;
  return voiceOptionsFor(language).find((o) => o.label === label) || null;
}

export function defaultOption(language: string): VoiceOption {
  return voiceOptionsFor(language)[0];
}

/** Azure SSML xml:lang for an Azure voice name ("it-IT-IsabellaMultilingualNeural" gives "it-IT"). */
export function azureLocale(voice: string, language: string): string {
  const m = voice.match(/^([a-z]{2,3}-[A-Z]{2})-/);
  if (m) return m[1];
  const fallback: Record<string, string> = { it: 'it-IT', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', en: 'en-GB', nb: 'nb-NO', sv: 'sv-SE', pt: 'pt-PT' };
  return fallback[language] || 'en-GB';
}

// ─── Resolution ────────────────────────────────────────────────────────────

/** A stored choice (edition_voice_choice row). */
export interface StoredVoiceChoice {
  label: string;
  provider?: string | null;
  voice?: string | null;
  model?: string | null;
}

/** An edition's configured Azure voice (EDITION_VOICES in edition-audio.ts). */
export interface ConfiguredVoice {
  voice: string;
  lang: string;
  rate: string;
}

export interface ResolvedVoice {
  provider: VoiceProvider;
  voice: string;
  model: string | null;
  /** SSML xml:lang for Azure. */
  lang: string;
  rate: string;
  /** Catalogue label when the voice is one of the options, else null. */
  label: VoiceLabel | null;
  source: 'choice' | 'edition' | 'default';
}

function fromOption(o: VoiceOption, language: string, source: ResolvedVoice['source']): ResolvedVoice {
  return {
    provider: o.provider,
    voice: o.voice,
    model: o.model || null,
    lang: o.provider === 'azure' ? azureLocale(o.voice, language) : azureLocale('', language),
    rate: o.rate || '+0%',
    label: o.label,
    source,
  };
}

/**
 * The voice for an edition's audio: the publisher's choice if there is one,
 * else the edition's configured voice, else the language's option A.
 *
 * A choice is resolved through the catalogue by label, so editing an option
 * moves every edition that chose it. If the label is no longer in the
 * catalogue, the provider and voice stored with the choice are used.
 */
export function resolveVoice(
  editionId: string,
  language: string,
  choice: StoredVoiceChoice | null | undefined,
  editionVoices: Record<string, ConfiguredVoice>,
): ResolvedVoice {
  if (choice) {
    const o = optionFor(language, choice.label);
    if (o) return fromOption(o, language, 'choice');
    if ((choice.provider === 'azure' || choice.provider === 'elevenlabs') && choice.voice) {
      return {
        provider: choice.provider,
        voice: choice.voice,
        model: choice.model || (choice.provider === 'elevenlabs' ? ELEVEN_MODEL : null),
        lang: azureLocale(choice.provider === 'azure' ? choice.voice : '', language),
        rate: '+0%',
        label: null,
        source: 'choice',
      };
    }
  }
  const configured = Object.prototype.hasOwnProperty.call(editionVoices, editionId) ? editionVoices[editionId] : null;
  if (configured) {
    return {
      provider: 'azure',
      voice: configured.voice,
      model: null,
      lang: configured.lang,
      rate: configured.rate,
      label: labelForVoice(language, configured.voice),
      source: 'edition',
    };
  }
  return fromOption(defaultOption(language), language, 'default');
}

/** The catalogue label of a voice in this language, or null. */
export function labelForVoice(language: string, voice: string | null | undefined): VoiceLabel | null {
  if (!voice) return null;
  return voiceOptionsFor(language).find((o) => o.voice === voice)?.label || null;
}

// ─── What the customer sees ────────────────────────────────────────────────

/** "Voce A" in Italian, "Voice A" otherwise. Never a provider or voice name. */
export function customerVoiceLabel(label: VoiceLabel, uiLang: string): string {
  return `${uiLang === 'it' ? 'Voce' : 'Voice'} ${label}`;
}

/** A short stable hash of what makes a sample sound the way it does. */
export function optionHash(o: Pick<VoiceOption, 'provider' | 'voice' | 'model' | 'rate'>): string {
  const s = `${o.provider}|${o.voice}|${o.model || ''}|${o.rate || ''}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 6);
}

/** Storage path of a cached sample. Label, date and a hash only: no provider or voice name. */
export function samplePath(editionId: string, label: VoiceLabel, date: string, o: VoiceOption): string {
  return `samples/${editionId}/${label}-${date}-${optionHash(o)}.mp3`;
}
