/**
 * The GEDI morning email: each quartiere's Daily Brief and Look Ahead for the
 * day, in Italian, with links to the public pages and to the editor desk.
 *
 * Content comes from getDailyEdition() (licensee-feed.ts), the same reader the
 * /api/v1 feed and the editor desk use. It serves the cached Italian
 * translation from article_translations and, when one is missing, translates
 * on demand and caches it exactly as /api/translations/article does. No
 * approval scope is applied: the email describes the public showroom pages it
 * links to, and says that the desk governs what GEDI's own feed carries.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { LICENSEES } from '@/lib/licensees';
import { getDailyEdition, localDateIn, type Edition, type FeedStory } from '@/lib/licensee-feed';
import { editorKey } from '@/lib/editor-desk';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';
import type { ListedEvent } from '@/lib/look-ahead-events';
import { loadEditionAudio, type EditionAudioRow } from '@/lib/edition-audio';

export const GEDI_GROUP = 'gedi';
export const GEDI_TIMEZONE = 'Europe/Rome';
export const GEDI_LIVE_RECIPIENTS = [
  "Mirja Cartia d'Asero <m.cartia@gedi.it>",
  'Veronica Di Quattro <v.diquattro@gedidigital.it>',
  'Stefano Cappellini <s.cappellini@repubblica.it>',
] as const;
/** First morning the live list may receive it (also needs GEDI_MORNING_LIVE=true). */
export const GEDI_LIVE_FROM = '2026-09-28';
export const PREVIEW_RECIPIENT = 'md@readflaneur.com';
export const REPLY_TO = 'md@readflaneur.com';

const SITE = 'https://readflaneur.com';

export interface MorningStory {
  header: string;
  text: string;
}

export interface MorningEvent {
  when: string;
  name: string;
  place: string | null;
}

export interface MorningEdition {
  id: string;
  name: string;
  city: string;
  brief: { headline: string; url: string; stories: MorningStory[]; moreCount: number } | null;
  lookAhead: { headline: string; url: string; intro: string | null; events: MorningEvent[]; moreCount: number } | null;
  /** The spoken edition (edition-audio.ts), when this morning's was made. */
  audio: { url: string; label: string } | null;
  /** True when a part is shown in English because the Italian could not be made. */
  english: boolean;
  error: string | null;
}

export interface MorningContent {
  date: string;
  dateLabel: string;
  deskUrl: string | null;
  editions: MorningEdition[];
}

/** Local date and hour in Rome. */
export function romeNow(at: Date = new Date()): { date: string; hour: number } {
  const date = localDateIn(GEDI_TIMEZONE, at);
  const hour = Number(at.toLocaleString('en-GB', { timeZone: GEDI_TIMEZONE, hour: '2-digit', hour12: false }));
  return { date, hour: hour === 24 ? 0 : hour };
}

export function italianDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export function deskUrlFor(date: string): string | null {
  const key = editorKey(GEDI_GROUP);
  return key ? `${SITE}/editor/${GEDI_GROUP}?key=${key}&lang=it&date=${date}` : null;
}

export function articleUrl(neighborhoodId: string, slug: string): string {
  return `${SITE}/${getCitySlugFromId(neighborhoodId)}/${getNeighborhoodSlugFromId(neighborhoodId)}/${slug}?lang=it`;
}

function plain(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Up to `max` characters, cut at a sentence end where one falls late enough, else at a word. */
export function firstLines(text: string, max = 240): string {
  const t = plain(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (stop >= max * 0.5) return cut.slice(0, stop + 1);
  return `${cut.replace(/\s+\S*$/, '')}...`;
}

/**
 * Drop a leading all-caps label such as "LOOK AHEAD:" or, in a translated
 * headline, "Porta Venezia IL PUNTO DEL GIORNO:" (the edition name before it).
 */
export function cleanHeadline(h: string): string {
  return h.replace(/^[^:]*?\p{Lu}{2,}[\p{Lu}\s'’-]*:\s*/u, '').trim() || h.trim();
}

/** City names as an Italian reader writes them. */
const ITALIAN_CITY: Record<string, string> = { Milan: 'Milano', Rome: 'Roma', Sicily: 'Sicilia', Florence: 'Firenze', Naples: 'Napoli', Turin: 'Torino', Venice: 'Venezia' };

function eventWhen(e: ListedEvent): string {
  const [y, m, d] = e.date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return e.time ? `${day}, ${e.time}` : day;
}

const MAX_STORIES = 4;
const MAX_EVENTS = 4;

async function slugsFor(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data, error } = await db.from('articles').select('id, slug').in('id', ids);
  if (error) throw new Error(`articles: ${error.message}`);
  for (const r of data || []) if (r.slug) map.set(r.id as string, r.slug as string);
  return map;
}

/** "Ascolta (1 min)": whole minutes, at least one. */
export function audioLabel(durationS: number | null): string {
  const mins = Math.max(1, Math.round((durationS || 60) / 60));
  return `Ascolta (${mins} min)`;
}

async function buildEdition(db: SupabaseClient, edition: Edition, date: string, audioRow?: EditionAudioRow): Promise<MorningEdition> {
  const out: MorningEdition = {
    id: edition.id, name: edition.name, city: ITALIAN_CITY[edition.city] || edition.city, brief: null, lookAhead: null,
    audio: audioRow ? { url: audioRow.audio_url, label: audioLabel(audioRow.duration_s === null ? null : Number(audioRow.duration_s)) } : null,
    english: false, error: null,
  };
  try {
    const day = await getDailyEdition(db, edition, date, 'it', null);
    out.english = day.language !== 'it';
    const slugs = await slugsFor(db, [day.daily_brief?.article_id, day.look_ahead?.article_id].filter((x): x is string => Boolean(x)));
    const db_ = day.daily_brief;
    if (db_ && slugs.get(db_.article_id)) {
      const stories = db_.stories.filter((s: FeedStory) => plain(s.text).length > 0);
      out.brief = {
        headline: cleanHeadline(db_.headline || db_.subject_teaser || edition.name),
        url: articleUrl(edition.id, slugs.get(db_.article_id)!),
        stories: stories.slice(0, MAX_STORIES).map((s) => ({ header: plain(s.header), text: firstLines(s.text) })),
        moreCount: Math.max(0, stories.length - MAX_STORIES),
      };
    }
    const la = day.look_ahead;
    if (la && slugs.get(la.article_id)) {
      const upcoming = la.events.filter((e) => e.date >= date);
      const intro = la.body_markdown ? plain(la.body_markdown.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !/^##\s/.test(p)) || '') : '';
      out.lookAhead = {
        headline: cleanHeadline(la.headline),
        url: articleUrl(edition.id, slugs.get(la.article_id)!),
        intro: upcoming.length ? null : intro ? firstLines(intro, 220) : null,
        events: upcoming.slice(0, MAX_EVENTS).map((e) => ({
          when: eventWhen(e),
          name: e.name,
          place: e.location || e.address || null,
        })),
        moreCount: Math.max(0, upcoming.length - MAX_EVENTS),
      };
    }
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  return out;
}

/** Everything the email shows for one Rome local date. */
export async function buildGediMorning(db: SupabaseClient, date: string): Promise<MorningContent> {
  const ids = LICENSEES[GEDI_GROUP].editions as string[];
  const { data, error } = await db.from('neighborhoods').select('id, name, city, country, timezone, broader_area').in('id', ids);
  if (error) throw new Error(`neighborhoods: ${error.message}`);
  const editions: Edition[] = ids
    .map((id) => (data || []).find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      id: r.id, name: r.name, city: r.city, region: r.broader_area || null, country: r.country, timezone: r.timezone,
      language: 'en' as const, languages: ['en', 'it'] as const,
    }));
  const audio = await loadEditionAudio(db, editions.map((e) => e.id), date, 'it');
  const built = await Promise.all(editions.map((e) => buildEdition(db, e, date, audio.get(e.id))));
  return { date, dateLabel: italianDate(date), deskUrl: deskUrlFor(date), editions: built };
}

export function buildGediSubject(content: MorningContent, preview: boolean): string {
  const names = content.editions.map((e) => e.name.toLowerCase()).join(', ');
  return `${preview ? '[ANTEPRIMA] ' : ''}le edizioni di stamattina: ${names}`;
}
