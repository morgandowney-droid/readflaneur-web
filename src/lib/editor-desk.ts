/**
 * Data for the licensee editor desk at /editor/[group].
 *
 * A group is a licensee with `requireApproval` (licensees.ts): the desk shows
 * the stories that licensee's feed would carry, exactly as the feed builds
 * them (getDailyEdition in licensee-feed.ts), with what an editor needs to
 * decide on each: stakes, sources with their archived copies, the shadow
 * source-check verdict, and what the edition rules cut before publication.
 * Decisions go to `editorial_decisions` and govern only that licensee's feed.
 *
 * Server only (service role). Reads content; the one write path is the
 * decide route, which inserts decision rows.
 */
import { createHash, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LICENSEES, type FeedLanguage, type Licensee } from './licensees';
import { getDailyEdition, loadDecisionStates, type Edition, type FeedStory, SOURCE_LANGUAGE, SUPPORTED_LANGUAGES } from './licensee-feed';
import { classifyStakes, type StakesReason } from './source-standard';
import { briefStories, type StoryFlags } from './story-flags';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from './neighborhood-utils';
import {
  parseRemovals,
  stateFor,
  storyKey,
  type DecisionRow,
  type ItemState,
  type LoggedRemoval,
} from './editorial-decisions';
import type { ListedEvent } from './look-ahead-events';

export const SNAPSHOT_BUCKET = 'source-snapshots';

// ─── Groups and keys ───────────────────────────────────────────────────────

export interface EditorGroup {
  id: string;
  licensee: Licensee;
  publisher: string;
}

/** A group exists only for a licensee whose feed requires approval. */
export function getEditorGroup(id: string): EditorGroup | null {
  if (!Object.prototype.hasOwnProperty.call(LICENSEES, id)) return null;
  const licensee = LICENSEES[id];
  if (!licensee.requireApproval) return null;
  return { id, licensee, publisher: licensee.deskName || licensee.name };
}

/** First 24 hex of sha256(`${CRON_SECRET}:editor:<group>`). Null without a secret. */
export function editorKey(group: string): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return null;
  return createHash('sha256').update(`${secret}:editor:${group}`).digest('hex').slice(0, 24);
}

export function checkEditorKey(group: string, presented: string | null | undefined): boolean {
  const key = editorKey(group);
  if (!key || !presented) return false;
  const a = Buffer.from(presented.toLowerCase());
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const PRIVATE_HEADERS: Record<string, string> = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
};

export function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });
}

// ─── Desk data ─────────────────────────────────────────────────────────────

export interface DeskSource {
  name: string;
  url: string | null;
  /** Object path inside the private bucket, when a copy was taken. */
  archivePath: string | null;
  archivedAt: string | null;
  dead: boolean;
  verdict: string | null;
  factsFound: number | null;
  factsTotal: number | null;
}

export type ItemKind = 'headline' | 'story' | 'prose' | 'event';

export interface DeskItem {
  key: string;
  ref: string;
  kind: ItemKind;
  articleId: string;
  /** What the feed would carry before any decision (in the view language). */
  header: string;
  text: string;
  state: ItemState;
  stakes: 'high' | 'low' | null;
  stakesReasons: StakesReason[];
  legalCheck: boolean;
  sources: DeskSource[];
  /** Edition-rules removals logged against this story's header. */
  removals: LoggedRemoval[];
  event?: ListedEvent;
}

export interface DeskEdition {
  id: string;
  name: string;
  city: string;
  timezone: string;
  showroomUrl: string;
  language: FeedLanguage;
  brief: {
    articleId: string;
    headline: DeskItem;
    stories: DeskItem[];
    removals: LoggedRemoval[];
    classified: boolean;
  } | null;
  lookAhead: {
    articleId: string;
    headline: string;
    prose: DeskItem | null;
    events: DeskItem[];
    sources: DeskSource[];
    removals: LoggedRemoval[];
  } | null;
}

export interface DeskDay {
  group: EditorGroup;
  date: string;
  lang: FeedLanguage;
  editions: DeskEdition[];
  history: Array<DecisionRow & { neighborhood_id?: string; label: string; edition: string }>;
  /** Set when editorial_decisions could not be read (for example, not yet migrated). */
  decisionsError: string | null;
}

export function isFeedLanguage(s: string | null | undefined): s is FeedLanguage {
  return Boolean(s) && (SUPPORTED_LANGUAGES as readonly string[]).includes(s!);
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function stripBucket(p: string | null | undefined): string | null {
  if (!p) return null;
  const s = p.replace(/^source-snapshots\//, '');
  return /^(dead|unreadable):/.test(s) ? null : s;
}

interface SourceRow {
  article_id: string;
  source_name: string | null;
  source_url: string | null;
  archive_url?: string | null;
  archived_at?: string | null;
  source_url_dead?: boolean | null;
}

interface CheckRow {
  brief_id: string;
  story_index: number;
  story_entity: string | null;
  source_url: string;
  verdict: string;
  facts_found: number | null;
  facts_total: number | null;
  snapshot_html_path: string | null;
}

async function loadSourceRows(db: SupabaseClient, articleIds: string[]): Promise<SourceRow[]> {
  if (!articleIds.length) return [];
  const full = await db
    .from('article_sources')
    .select('article_id, source_name, source_url, archive_url, archived_at, source_url_dead')
    .in('article_id', articleIds);
  if (!full.error) return (full.data || []) as SourceRow[];
  // The archive columns may not exist yet in an environment; the page still works without them.
  const basic = await db.from('article_sources').select('article_id, source_name, source_url').in('article_id', articleIds);
  return (basic.data || []) as SourceRow[];
}

async function loadChecks(db: SupabaseClient, briefIds: string[]): Promise<CheckRow[]> {
  if (!briefIds.length) return [];
  const { data, error } = await db
    .from('story_source_checks')
    .select('brief_id, story_index, story_entity, source_url, verdict, facts_found, facts_total, snapshot_html_path')
    .in('brief_id', briefIds);
  return error ? [] : ((data || []) as CheckRow[]);
}

function deskSource(
  src: { name: string; url: string | null },
  rows: SourceRow[],
  checks: CheckRow[],
): DeskSource {
  const url = src.url;
  const row = url ? rows.find((r) => r.source_url === url) : rows.find((r) => (r.source_name || '').toLowerCase() === src.name.toLowerCase());
  const check = url ? checks.find((c) => c.source_url === url) : undefined;
  const archivePath = stripBucket(row?.archive_url) || stripBucket(check?.snapshot_html_path) || null;
  return {
    name: src.name,
    url,
    archivePath,
    archivedAt: row?.archived_at || null,
    dead: Boolean(row?.source_url_dead),
    verdict: check?.verdict || null,
    factsFound: check?.facts_found ?? null,
    factsTotal: check?.facts_total ?? null,
  };
}

function removalsFor(header: string, removals: LoggedRemoval[]): LoggedRemoval[] {
  const h = fold(header).trim();
  return removals.filter((r) => fold(r.header).trim() === h);
}

/**
 * Everything the desk shows for one group and one local date, in the view
 * language. Stakes are always classified on the English text, because the
 * rules are written for it.
 */
export async function loadDeskDay(db: SupabaseClient, group: EditorGroup, date: string, lang: FeedLanguage): Promise<DeskDay> {
  const ids = group.licensee.editions as string[];
  const { data: hoods, error: hoodErr } = await db
    .from('neighborhoods')
    .select('id, name, city, country, timezone, broader_area')
    .in('id', ids);
  if (hoodErr) throw new Error(`neighborhoods: ${hoodErr.message}`);
  const editions: Edition[] = ids
    .map((id) => hoods?.find((h) => h.id === id))
    .filter((h): h is NonNullable<typeof h> => Boolean(h))
    .map((h) => ({
      id: h.id, name: h.name, city: h.city, region: h.broader_area || null, country: h.country, timezone: h.timezone,
      language: SOURCE_LANGUAGE, languages: SUPPORTED_LANGUAGES,
    }));

  // The same builder the feed uses, with no approval scope, so the desk sees
  // every story the feed could carry. English always (for stakes and
  // alignment), plus the view language when it differs.
  const [english, viewed, briefs] = await Promise.all([
    Promise.all(editions.map((e) => getDailyEdition(db, e, date, SOURCE_LANGUAGE))),
    lang === SOURCE_LANGUAGE ? Promise.resolve(null) : Promise.all(editions.map((e) => getDailyEdition(db, e, date, lang))),
    db.from('neighborhood_briefs')
      .select('id, neighborhood_id, enriched_categories, story_flags')
      .in('neighborhood_id', ids)
      .eq('brief_date', date)
      .not('enriched_content', 'is', null),
  ]);

  const articleIds = english.flatMap((d) => [d.daily_brief?.article_id, d.look_ahead?.article_id]).filter((x): x is string => Boolean(x));
  const briefRows = (briefs.data || []) as Array<{ id: string; neighborhood_id: string; enriched_categories: unknown; story_flags: StoryFlags | null }>;
  const [notes, sourceRows, checks, decisions] = await Promise.all([
    articleIds.length
      ? db.from('articles').select('id, slug, editor_notes').in('id', articleIds)
      : Promise.resolve({ data: [] as Array<{ id: string; slug: string; editor_notes: string | null }> }),
    loadSourceRows(db, articleIds),
    loadChecks(db, briefRows.map((b) => b.id)),
    loadDecisionStates(db, group.id, articleIds),
  ]);
  const articleMeta = new Map(((notes.data || []) as Array<{ id: string; slug: string; editor_notes: string | null }>).map((a) => [a.id, a]));
  const states = decisions.states;

  const out: DeskEdition[] = editions.map((e, i) => {
    const en = english[i];
    const view = viewed ? viewed[i] : en;
    const viewLang = view.language;
    const brief = briefRows.find((b) => b.neighborhood_id === e.id);
    const briefId = brief?.id;
    const rawStories = briefStories(brief?.enriched_categories);
    const flags = brief?.story_flags || null;

    let briefOut: DeskEdition['brief'] = null;
    let showroomUrl = `https://readflaneur.com/${getCitySlugFromId(e.id)}/${getNeighborhoodSlugFromId(e.id)}`;

    if (en.daily_brief && view.daily_brief) {
      const aid = en.daily_brief.article_id;
      const meta = articleMeta.get(aid);
      if (meta?.slug) showroomUrl = `${showroomUrl}/${meta.slug}`;
      const removals = parseRemovals(meta?.editor_notes);
      const rows = sourceRows.filter((r) => r.article_id === aid);
      const briefChecks = checks.filter((c) => c.brief_id === briefId);
      const enStories = en.daily_brief.stories;
      const stories: DeskItem[] = view.daily_brief.stories.map((s: FeedStory, idx: number) => {
        const enS = enStories[idx] && enStories.length === view.daily_brief!.stories.length ? enStories[idx] : s;
        const hay = fold(`${enS.header}\n${enS.text}`);
        const matched = rawStories.filter((r) => r.title.length >= 3 && hay.includes(fold(r.title)));
        const matchedFlags = (flags?.stories || []).filter((f) => matched.some((m) => m.index === f.index));
        const flag = matchedFlags.length
          ? { sensitive: matchedFlags.some((f) => f.sensitive), reasons: matchedFlags.flatMap((f) => f.reasons) }
          : null;
        const st = classifyStakes({ entity: enS.header, context: enS.text, flag });
        return {
          key: s.id,
          ref: String(s.position),
          kind: 'story',
          articleId: aid,
          header: s.header,
          text: s.text,
          state: stateFor(states, s.id),
          stakes: st.stakes,
          stakesReasons: st.reasons,
          legalCheck: Boolean(flag?.sensitive),
          sources: enS.sources.map((src) => deskSource(src, rows, briefChecks)),
          removals: removalsFor(enS.header, removals),
        };
      });
      const headlineKey = storyKey(aid, 'headline');
      briefOut = {
        articleId: aid,
        headline: {
          key: headlineKey, ref: 'headline', kind: 'headline', articleId: aid,
          header: '', text: view.daily_brief.headline || en.daily_brief.headline || '',
          state: stateFor(states, headlineKey), stakes: null, stakesReasons: [], legalCheck: false, sources: [], removals: [],
        },
        stories,
        removals,
        classified: Boolean(flags),
      };
    }

    let laOut: DeskEdition['lookAhead'] = null;
    if (en.look_ahead && view.look_ahead) {
      const aid = en.look_ahead.article_id;
      const meta = articleMeta.get(aid);
      const removals = parseRemovals(meta?.editor_notes);
      const rows = sourceRows.filter((r) => r.article_id === aid);
      const proseKey = storyKey(aid, 'prose');
      const proseText = view.look_ahead.body_markdown || '';
      const proseStakes = classifyStakes({ entity: '', context: en.look_ahead.body_markdown || '' });
      laOut = {
        articleId: aid,
        headline: view.look_ahead.headline,
        prose: proseText
          ? {
              key: proseKey, ref: 'prose', kind: 'prose', articleId: aid, header: '', text: proseText,
              state: stateFor(states, proseKey), stakes: proseStakes.stakes, stakesReasons: proseStakes.reasons,
              legalCheck: false, sources: [], removals: [],
            }
          : null,
        events: en.look_ahead.events.map((ev, idx) => {
          const key = storyKey(aid, `event:${idx}`);
          const line = [ev.day_label || ev.date, ev.time, [ev.location, ev.address].filter(Boolean).join(', '), ev.price].filter(Boolean).join(' · ');
          const st = classifyStakes({ entity: ev.name, context: `${ev.category || ''} ${ev.location || ''}` });
          return {
            key, ref: `event:${idx}`, kind: 'event' as const, articleId: aid,
            header: ev.name, text: line, state: stateFor(states, key),
            stakes: st.stakes, stakesReasons: st.reasons, legalCheck: false, sources: [],
            removals: removals.filter((r) => fold(r.header) === fold(`Listing: ${ev.name}`)),
            event: ev,
          };
        }),
        sources: (en.look_ahead.sources || []).map((src) => deskSource(src, rows, [])),
        removals,
      };
    }

    return {
      id: e.id, name: e.name, city: e.city, timezone: e.timezone,
      showroomUrl: `${showroomUrl}${lang === SOURCE_LANGUAGE ? '' : `?lang=${lang}`}`,
      language: viewLang,
      brief: briefOut,
      lookAhead: laOut,
    };
  });

  // History: every decision on these articles, newest first, labelled.
  const labels = new Map<string, { label: string; edition: string }>();
  for (const ed of out) {
    const put = (it: DeskItem | null | undefined, label: string) => { if (it) labels.set(it.key, { label, edition: ed.name }); };
    if (ed.brief) {
      put(ed.brief.headline, `Headline: ${ed.brief.headline.text}`);
      for (const s of ed.brief.stories) put(s, s.header);
    }
    if (ed.lookAhead) {
      put(ed.lookAhead.prose, 'Look Ahead text');
      for (const ev of ed.lookAhead.events) put(ev, ev.header);
    }
  }
  const history = [...decisions.rows]
    .sort((a, b) => Date.parse(b.decided_at) - Date.parse(a.decided_at))
    .map((r) => ({ ...r, ...(labels.get(r.story_key) || { label: r.story_key, edition: '' }) }));

  return { group, date, lang, editions: out, history, decisionsError: decisions.error };
}
