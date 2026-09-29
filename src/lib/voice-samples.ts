/**
 * Voice samples for the publisher's voice choice (/editor/[group]/voices).
 *
 * Every option A to E reads the same text: the start of the edition's most
 * recent audio script, about 60 seconds. An edition with no audio yet (a new
 * publisher's area) gets its latest Daily Brief in the group's language, read
 * verbatim the way the audio fallback reads it.
 *
 * Samples are rendered once and cached in the public `edition-audio` bucket
 * at samples/<edition>/<label>-<date>-<hash>.mp3 (voice-options samplePath):
 * label, date and a short hash of the option, so the customer never sees a
 * provider or voice name, and an edited option gets a fresh sample. A sample
 * never falls back to another voice: a failed option shows as unavailable,
 * because a publisher must hear the voice they are choosing.
 *
 * Server only (service role).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AUDIO_BUCKET,
  AUDIO_TABLE,
  buildScriptSource,
  fallbackBody,
  synthesize,
  synthesizeElevenLabs,
} from './edition-audio';
import { getDailyEdition, localDateIn, SUPPORTED_LANGUAGES, type Edition } from './licensee-feed';
import type { FeedLanguage } from './licensees';
import { azureLocale, samplePath, type VoiceOption } from './voice-options';

/** About 60 seconds of speech at a news pace. */
const SAMPLE_WORDS = 150;

/** The first paragraphs of a script up to about 60 seconds, cut at a sentence end. */
export function sampleText(script: string, maxWords = SAMPLE_WORDS): string {
  const paras = script.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let words = 0;
  for (const p of paras) {
    const n = p.split(/\s+/).length;
    if (words + n <= maxWords) {
      out.push(p);
      words += n;
      continue;
    }
    // Take whole sentences from this paragraph while they fit.
    const sentences = p.match(/[^.!?]+[.!?]+(\s|$)/g) || [p];
    const part: string[] = [];
    for (const s of sentences) {
      const m = s.trim().split(/\s+/).length;
      if (words + m > maxWords) break;
      part.push(s.trim());
      words += m;
    }
    if (part.length) out.push(part.join(' '));
    break;
  }
  return out.join('\n\n');
}

export interface SampleSource {
  text: string;
  /** Date of the text read (the audio date, or the brief date). */
  date: string;
  from: 'audio' | 'brief';
}

/** Edition rows for these ids, in the order given. */
export async function loadEditions(db: SupabaseClient, ids: readonly string[]): Promise<Edition[]> {
  if (!ids.length) return [];
  const { data, error } = await db
    .from('neighborhoods')
    .select('id, name, city, country, timezone, broader_area')
    .in('id', ids as string[]);
  if (error) throw new Error(`neighborhoods: ${error.message}`);
  return ids
    .map((id) => (data || []).find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      city: r.city as string,
      region: (r.broader_area as string | null) || null,
      country: r.country as string,
      timezone: (r.timezone as string) || 'UTC',
      language: 'en' as const,
      languages: SUPPORTED_LANGUAGES,
    }));
}

/** The text every option reads for this edition, or null when there is nothing in the language yet. */
export async function sampleSource(db: SupabaseClient, edition: Edition, language: FeedLanguage): Promise<SampleSource | null> {
  try {
    const { data } = await db
      .from(AUDIO_TABLE)
      .select('script, audio_date')
      .eq('neighborhood_id', edition.id)
      .eq('language', language)
      .order('audio_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.script) return { text: sampleText(data.script as string), date: data.audio_date as string, from: 'audio' };
  } catch {
    // No audio table or no row: fall through to the brief.
  }

  const today = localDateIn(edition.timezone);
  const [y, m, d] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString().slice(0, 10);
  for (const date of [today, yesterday]) {
    try {
      const day = await getDailyEdition(db, edition, date, language);
      if (!day.daily_brief || day.language !== language) continue;
      const body = fallbackBody(buildScriptSource(day));
      if (body) return { text: sampleText(body), date, from: 'brief' };
    } catch {
      // Try the previous day.
    }
  }
  return null;
}

export interface SampleResult {
  label: VoiceOption['label'];
  url: string | null;
  error: string | null;
}

/** Existing sample files for an edition (names only). Empty on any error. */
export async function listSamples(db: SupabaseClient, editionId: string): Promise<Set<string>> {
  try {
    const { data, error } = await db.storage.from(AUDIO_BUCKET).list(`samples/${editionId}`, { limit: 1000 });
    if (error) return new Set();
    return new Set((data || []).map((f) => `samples/${editionId}/${f.name}`));
  } catch {
    return new Set();
  }
}

/** Render one option's sample if it is missing (or on refresh) and return its public URL. Never throws. */
export async function ensureSample(
  db: SupabaseClient,
  editionId: string,
  language: FeedLanguage,
  option: VoiceOption,
  src: SampleSource,
  existing: Set<string>,
  refresh: boolean,
): Promise<SampleResult> {
  const path = samplePath(editionId, option.label, src.date, option);
  const publicUrl = db.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl;
  if (existing.has(path) && !refresh) return { label: option.label, url: publicUrl, error: null };
  try {
    let audio: Buffer;
    if (option.provider === 'elevenlabs') {
      audio = (await synthesizeElevenLabs(src.text, option.voice, option.model || 'eleven_v4', 'edition_audio_sample')).audio;
    } else {
      audio = (await synthesize(src.text, { voice: option.voice, lang: azureLocale(option.voice, language), rate: option.rate || '+0%' }, 'edition_audio_sample')).audio;
    }
    const up = await db.storage.from(AUDIO_BUCKET).upload(path, audio, { contentType: 'audio/mpeg', upsert: true, cacheControl: '300' });
    if (up.error) return { label: option.label, url: null, error: `upload: ${up.error.message}` };
    return { label: option.label, url: `${publicUrl}?v=${Date.now().toString(36)}`, error: null };
  } catch (e) {
    return { label: option.label, url: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Run tasks with a concurrency limit; tasks still running at the deadline resolve to their fallback. */
export async function runLimited<T>(tasks: Array<() => Promise<T>>, limit: number, deadlineMs: number, onTimeout: (i: number) => T): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  const all = Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  await Promise.race([all, new Promise((r) => setTimeout(r, deadlineMs))]);
  return results.map((r, i) => (r === undefined ? onTimeout(i) : r));
}
