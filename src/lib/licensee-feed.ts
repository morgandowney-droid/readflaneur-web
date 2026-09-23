import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LICENSEES, type FeedLanguage, type Licensee } from './licensees';
import { splitEventListing, parseEventListing, type ListedEvent } from './look-ahead-events';
import { isPlaceholderSourceName, isGroundingRedirect, isHttpUrl } from './source-links';
import { translateArticle, type LanguageCode } from './translation-service';
import { cleanArticleHeadline } from './utils';

/**
 * The licensee feed behind /api/v1: auth, rate limit, and the data functions the
 * three routes share. Read-only against content (service role, status
 * 'published', published_at not in the future); the one write is the
 * translation cache, the same upsert /api/translations/* makes.
 *
 * Spec for licensees: docs/licensee-feed-api.md. Keep the two in step.
 */

export const FEED_VERSION = 'v1';
export const SUPPORTED_LANGUAGES: readonly FeedLanguage[] = ['en', 'de', 'fr', 'es', 'it', 'pt', 'sv', 'zh', 'ja'];
/** Source language of every edition: enrichment writes English, translation is a layer on top. */
export const SOURCE_LANGUAGE: FeedLanguage = 'en';

export const RATE_LIMIT_PER_MINUTE = 60;
const MAX_STORIES_PAGE = 200;
const DEFAULT_STORIES_PAGE = 50;
const DEFAULT_SINCE_HOURS = 48;
const MAX_SINCE_DAYS = 30;

// ---------------------------------------------------------------------------
// Keys and auth
// ---------------------------------------------------------------------------

/** First 24 hex of sha256(`${CRON_SECRET}:licensee:<id>`). Null without a secret. */
export function licenseeKey(licenseeId: string): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return null;
  return createHash('sha256').update(`${secret}:licensee:${licenseeId}`).digest('hex').slice(0, 24);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export interface AuthedLicensee {
  id: string;
  licensee: Licensee;
}

export function authenticate(request: Request): AuthedLicensee | null {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+([A-Za-z0-9]+)\s*$/);
  if (!match) return null;
  const presented = match[1].toLowerCase();
  for (const id of Object.keys(LICENSEES)) {
    const key = licenseeKey(id);
    if (key && safeEqual(presented, key)) return { id, licensee: LICENSEES[id] };
  }
  return null;
}

// Fixed one-minute window per key. In memory, so counted per server instance:
// a caller spread across instances can exceed it. It exists to stop a runaway
// integration loop, not to meter usage.
const windows = new Map<string, { start: number; count: number }>();

function rateLimit(licenseeId: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const w = windows.get(licenseeId);
  if (!w || now - w.start >= 60_000) {
    windows.set(licenseeId, { start: now, count: 1 });
    return { ok: true };
  }
  w.count += 1;
  if (w.count > RATE_LIMIT_PER_MINUTE) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((w.start + 60_000 - now) / 1000)) };
  }
  return { ok: true };
}

const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, max-age=300',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Feed-Version': FEED_VERSION,
};

export function feedJson(body: unknown, status = 200, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...BASE_HEADERS, ...extra } });
}

export function feedError(status: number, code: string, message: string, extra: Record<string, string> = {}): NextResponse {
  // Errors are never cached: a 401 or 429 must not stick in a proxy for five minutes.
  return feedJson({ error: { code, message } }, status, { ...extra, 'Cache-Control': 'no-store' });
}

/** Auth + rate limit + error boundary shared by every /api/v1 route. */
export async function withLicensee(
  request: Request,
  handler: (auth: AuthedLicensee, db: SupabaseClient) => Promise<NextResponse>,
): Promise<NextResponse> {
  const auth = authenticate(request);
  if (!auth) {
    return feedError(401, 'unauthorized', 'Missing or invalid API key. Send it as "Authorization: Bearer <key>".', {
      'WWW-Authenticate': 'Bearer',
    });
  }
  const limited = rateLimit(auth.id);
  if (!limited.ok) {
    return feedError(429, 'rate_limited', `More than ${RATE_LIMIT_PER_MINUTE} requests in a minute.`, {
      'Retry-After': String(limited.retryAfter),
    });
  }
  try {
    return await handler(auth, adminClient());
  } catch (err) {
    console.error('[licensee-feed]', auth.id, err instanceof Error ? err.message : err);
    return feedError(500, 'internal_error', 'Something went wrong on our side. Retry shortly.');
  }
}

function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export function parseLang(raw: string | null, auth: AuthedLicensee): FeedLanguage | null {
  const lang = (raw || auth.licensee.defaultLang || SOURCE_LANGUAGE).toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang) ? (lang as FeedLanguage) : null;
}

// ---------------------------------------------------------------------------
// Editions
// ---------------------------------------------------------------------------

interface EditionRow {
  id: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  broader_area: string | null;
}

export interface Edition {
  id: string;
  name: string;
  city: string;
  region: string | null;
  country: string;
  timezone: string;
  language: FeedLanguage;
  languages: readonly FeedLanguage[];
}

function toEdition(row: EditionRow): Edition {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    region: row.broader_area || null,
    country: row.country,
    timezone: row.timezone,
    language: SOURCE_LANGUAGE,
    languages: SUPPORTED_LANGUAGES,
  };
}

export async function listEditions(db: SupabaseClient, auth: AuthedLicensee): Promise<Edition[]> {
  const ids = auth.licensee.editions;
  if (!ids.length) return [];
  const { data, error } = await db
    .from('neighborhoods')
    .select('id, name, city, country, timezone, broader_area')
    .in('id', ids as string[]);
  if (error) throw new Error(`neighborhoods: ${error.message}`);
  const rows = (data || []) as EditionRow[];
  // In the order the licensee's config lists them.
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is EditionRow => Boolean(r)).map(toEdition);
}

/** Null when the edition is not licensed to this key or does not exist; both are a 404. */
export async function getEdition(db: SupabaseClient, auth: AuthedLicensee, id: string): Promise<Edition | null> {
  if (!auth.licensee.editions.includes(id)) return null;
  const { data, error } = await db
    .from('neighborhoods')
    .select('id, name, city, country, timezone, broader_area')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`neighborhoods: ${error.message}`);
  return data ? toEdition(data as EditionRow) : null;
}

export function localDateIn(timezone: string, at: Date = new Date()): string {
  return at.toLocaleDateString('en-CA', { timeZone: timezone });
}

// ---------------------------------------------------------------------------
// Parsing a published body into stories
// ---------------------------------------------------------------------------

export interface FeedSource {
  name: string;
  url: string | null;
}

export interface Place {
  edition_id: string;
  name: string;
  city: string;
  country: string;
}

interface Section {
  header: string;
  text: string;
}

interface ParsedBody {
  greeting: string | null;
  sections: Section[];
  sign_off: string | null;
}

const HEADER_LINE = /^\[\[(.+?)\]\]\s*$/;

/**
 * Split a brief body into greeting, [[header]] sections and sign-off. The
 * greeting is whatever precedes the first header ("Good morning, Belgravia.");
 * the sign-off is a short closing line at the end of the last section ("Enjoy
 * the day.").
 */
export function parseBody(body: string): ParsedBody {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const intro: string[] = [];
  const sections: Array<{ header: string; lines: string[] }> = [];
  for (const line of lines) {
    const h = line.trim().match(HEADER_LINE);
    if (h) {
      sections.push({ header: h[1].trim(), lines: [] });
    } else if (sections.length) {
      sections[sections.length - 1].lines.push(line);
    } else {
      intro.push(line);
    }
  }

  const out: Section[] = sections.map((s) => ({ header: s.header, text: s.lines.join('\n').trim() }));
  let signOff: string | null = null;
  const last = out[out.length - 1];
  if (last) {
    const paras = last.text.split(/\n\s*\n/);
    const tail = paras[paras.length - 1]?.trim() || '';
    if (paras.length > 1 && tail.length <= 60 && !/\d/.test(tail) && !tail.includes('](') && !/[:;]$/.test(tail)) {
      signOff = tail;
      last.text = paras.slice(0, -1).join('\n\n').trim();
    }
  }
  const greeting = intro.join('\n').trim() || null;
  return { greeting, sections: out.filter((s) => s.text || s.header), sign_off: signOff };
}

/** `[[Header]]` is the house format; licensees get standard markdown. */
export function toMarkdown(body: string): string {
  return body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const h = line.trim().match(HEADER_LINE);
      return h ? `## ${h[1].trim()}` : line;
    })
    .join('\n')
    .trim();
}

interface RawStory {
  entity?: string;
  context?: string;
  source?: { name?: string; url?: string } | null;
  secondarySource?: { name?: string; url?: string } | null;
}

function cleanSource(ref: { name?: string; url?: string } | null | undefined): FeedSource | null {
  const name = ref?.name?.trim();
  if (!name || isPlaceholderSourceName(name)) return null;
  const url = ref?.url?.trim();
  const usable = isHttpUrl(url) && !isGroundingRedirect(url) && !/google\.[a-z.]+\/search/i.test(url);
  return { name, url: usable ? url! : null };
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function rawStories(enrichedCategories: unknown): RawStory[] {
  if (!Array.isArray(enrichedCategories)) return [];
  return (enrichedCategories as Array<{ stories?: RawStory[] }>).flatMap((c) => c?.stories || []);
}

function tokens(s: string): Set<string> {
  // "7,407" and "7.407" both become "7407", so figures match across styles.
  const t = fold(s).replace(/(\d)[.,](?=\d)/g, '$1');
  return new Set(t.match(/[a-z0-9ß-ɏ]{4,}/g) || []);
}

function storySources(story: RawStory): FeedSource[] {
  return [story.source, story.secondarySource].map(cleanSource).filter((s): s is FeedSource => Boolean(s));
}

/**
 * Attach sources to each section from the stories the brief was written from.
 *
 * First pass: a story belongs to every section that names its entity in the
 * header or text. The enrichment writes each gathered story under its own
 * header naming the entity, so this is the normal case. Second pass, for
 * sections still without a story: the gathered story whose summary shares the
 * most distinctive words and figures with the section (at least three), taken
 * only from stories no section has claimed. That catches a story the prose
 * never names ("Berlin Property Prices" written up as "the late summer price
 * figures"). A section matching neither gets no sources; the edition-level
 * list still carries them.
 */
function sourcesBySection(sections: Section[], stories: RawStory[]): FeedSource[][] {
  const matched: RawStory[][] = sections.map(() => []);
  const claimed = new Set<RawStory>();
  sections.forEach((section, i) => {
    const hay = fold(`${section.header}\n${section.text}`);
    for (const story of stories) {
      const entity = story.entity?.trim();
      if (entity && entity.length >= 3 && hay.includes(fold(entity))) {
        matched[i].push(story);
        claimed.add(story);
      }
    }
  });

  sections.forEach((section, i) => {
    if (matched[i].length) return;
    const sectionTokens = tokens(`${section.header}\n${section.text}`);
    let best: RawStory | null = null;
    let bestScore = 2;
    for (const story of stories) {
      if (claimed.has(story)) continue;
      let score = 0;
      for (const t of tokens(`${story.entity || ''} ${story.context || ''}`)) if (sectionTokens.has(t)) score++;
      if (score > bestScore) {
        best = story;
        bestScore = score;
      }
    }
    if (best) {
      matched[i].push(best);
      claimed.add(best);
    }
  });

  return matched.map((list) => {
    const out: FeedSource[] = [];
    for (const src of list.flatMap(storySources)) {
      if (!out.some((o) => o.name.toLowerCase() === src.name.toLowerCase())) out.push(src);
    }
    return out;
  });
}

export function storyId(articleId: string, index: number): string {
  return createHash('sha256').update(`${articleId}:${index}`).digest('hex').slice(0, 24);
}

export interface FeedStory {
  id: string;
  position: number;
  header: string;
  text: string;
  sources: FeedSource[];
  place: Place;
}

/**
 * Stories from a published body. When the body is a translation, sources are
 * aligned by position against the English sections (the translation keeps the
 * section structure); if the counts differ, they are matched on the translated
 * text instead, where proper nouns survive translation.
 */
function buildStories(
  articleId: string,
  body: string,
  sourceBody: string | null,
  enrichedCategories: unknown,
  place: Place,
): { parsed: ParsedBody; stories: FeedStory[] } {
  const parsed = parseBody(body);
  const raws = rawStories(enrichedCategories);
  const english = sourceBody ? parseBody(sourceBody).sections : null;
  const aligned = english && english.length === parsed.sections.length ? english : null;
  const sources = sourcesBySection(aligned || parsed.sections, raws);
  const stories = parsed.sections.map((s, i) => ({
    id: storyId(articleId, i),
    position: i,
    header: s.header,
    text: s.text,
    sources: sources[i],
    place,
  }));
  return { parsed, stories };
}

// ---------------------------------------------------------------------------
// Translation (cache first, then on demand; same table as /api/translations/article)
// ---------------------------------------------------------------------------

interface ArticleText {
  headline: string;
  body: string;
}

async function translatedArticle(
  db: SupabaseClient,
  article: { id: string; headline: string; body_text: string | null; preview_text: string | null },
  lang: FeedLanguage,
): Promise<ArticleText | null> {
  if (lang === SOURCE_LANGUAGE) return null;
  const { data: cached } = await db
    .from('article_translations')
    .select('headline, body')
    .eq('article_id', article.id)
    .eq('language_code', lang)
    .maybeSingle();
  if (cached?.body) return { headline: cached.headline, body: cached.body };

  // A licensee is waiting on the response, so the fast provider (about 10s).
  const t = await translateArticle(article.headline, article.body_text || '', article.preview_text, lang as LanguageCode, 'gemini');
  if (!t) return null;
  await db
    .from('article_translations')
    .upsert(
      {
        article_id: article.id,
        language_code: lang,
        headline: t.headline,
        body: t.body,
        preview_text: t.preview_text,
        translated_at: new Date().toISOString(),
      },
      { onConflict: 'article_id,language_code' },
    )
    .then(null, (err: Error) => console.error('[licensee-feed] translation cache write failed:', err.message));
  return { headline: t.headline, body: t.body };
}

// ---------------------------------------------------------------------------
// Daily edition
// ---------------------------------------------------------------------------

interface ArticleRow {
  id: string;
  headline: string;
  body_text: string | null;
  preview_text: string | null;
  published_at: string;
  brief_id?: string | null;
  neighborhood_id?: string;
}

async function sourcesByArticle(db: SupabaseClient, ids: string[]): Promise<Map<string, FeedSource[]>> {
  const map = new Map<string, FeedSource[]>();
  if (!ids.length) return map;
  const { data, error } = await db.from('article_sources').select('article_id, source_name, source_url').in('article_id', ids);
  if (error) throw new Error(`article_sources: ${error.message}`);
  for (const row of data || []) {
    const src = cleanSource({ name: row.source_name, url: row.source_url });
    if (!src) continue;
    const list = map.get(row.article_id) || [];
    if (!list.some((s) => s.name.toLowerCase() === src.name.toLowerCase())) list.push(src);
    map.set(row.article_id, list);
  }
  return map;
}

export interface DailyEdition {
  edition: Omit<Edition, 'languages'>;
  date: string;
  language: FeedLanguage;
  requested_language: FeedLanguage;
  daily_brief: {
    article_id: string;
    headline: string;
    subject_teaser: string | null;
    published_at: string;
    greeting: string | null;
    sign_off: string | null;
    body_markdown: string;
    stories: FeedStory[];
    sources: FeedSource[];
  } | null;
  look_ahead: {
    article_id: string;
    headline: string;
    published_at: string;
    body_markdown: string;
    events: ListedEvent[];
    sources: FeedSource[];
  } | null;
}

export async function getDailyEdition(
  db: SupabaseClient,
  edition: Edition,
  date: string,
  lang: FeedLanguage,
): Promise<DailyEdition> {
  const nowIso = new Date().toISOString();
  const place: Place = { edition_id: edition.id, name: edition.name, city: edition.city, country: edition.country };

  // The daily brief for a local date is the brief row with that brief_date and
  // the published article made from it.
  const { data: brief, error: briefErr } = await db
    .from('neighborhood_briefs')
    .select('id, subject_teaser, enriched_categories')
    .eq('neighborhood_id', edition.id)
    .eq('brief_date', date)
    .not('enriched_content', 'is', null)
    .maybeSingle();
  if (briefErr) throw new Error(`neighborhood_briefs: ${briefErr.message}`);

  let briefArticle: ArticleRow | null = null;
  if (brief) {
    const { data, error } = await db
      .from('articles')
      .select('id, headline, body_text, preview_text, published_at')
      .eq('brief_id', brief.id)
      .eq('article_type', 'brief_summary')
      .eq('status', 'published')
      .lte('published_at', nowIso)
      .order('published_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(`articles: ${error.message}`);
    briefArticle = (data?.[0] as ArticleRow) || null;
  }

  // The Look Ahead for a local date is published at 07:00 local on that date.
  // Query a UTC window wide enough for any offset, then keep the one whose
  // published_at falls on the date in the edition's own timezone.
  const [y, m, d] = date.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, d) - 36 * 3600_000).toISOString();
  const to = new Date(Date.UTC(y, m - 1, d) + 60 * 3600_000).toISOString();
  const { data: laRows, error: laErr } = await db
    .from('articles')
    .select('id, headline, body_text, preview_text, published_at')
    .eq('neighborhood_id', edition.id)
    .eq('article_type', 'look_ahead')
    .eq('status', 'published')
    .gte('published_at', from)
    .lt('published_at', to)
    .lte('published_at', nowIso)
    .order('published_at', { ascending: false });
  if (laErr) throw new Error(`articles: ${laErr.message}`);
  const lookAhead = ((laRows || []) as ArticleRow[]).find(
    (a) => localDateIn(edition.timezone, new Date(a.published_at)) === date,
  ) || null;

  const [sources, briefTx, laTx] = await Promise.all([
    sourcesByArticle(db, [briefArticle?.id, lookAhead?.id].filter((x): x is string => Boolean(x))),
    briefArticle ? translatedArticle(db, briefArticle, lang) : Promise.resolve(null),
    lookAhead ? translatedArticle(db, lookAhead, lang) : Promise.resolve(null),
  ]);

  // A translation that failed falls back to English for that part; the
  // response says which language it actually carries.
  const translated = lang === SOURCE_LANGUAGE || ((!briefArticle || briefTx) && (!lookAhead || laTx));
  const language: FeedLanguage = translated ? lang : SOURCE_LANGUAGE;

  let dailyBrief: DailyEdition['daily_brief'] = null;
  if (briefArticle && brief) {
    const useTx = language !== SOURCE_LANGUAGE && briefTx;
    const body = useTx ? briefTx.body : briefArticle.body_text || '';
    const headline = cleanArticleHeadline(useTx ? briefTx.headline : briefArticle.headline);
    const { parsed, stories } = buildStories(
      briefArticle.id,
      body,
      useTx ? briefArticle.body_text : null,
      brief.enriched_categories,
      place,
    );
    dailyBrief = {
      article_id: briefArticle.id,
      headline,
      // The teaser is written in English; in a translated response it is the
      // translated headline, which is the same teaser in title case.
      subject_teaser: useTx ? headline : brief.subject_teaser || null,
      published_at: briefArticle.published_at,
      greeting: parsed.greeting,
      sign_off: parsed.sign_off,
      body_markdown: toMarkdown(body),
      stories,
      sources: sources.get(briefArticle.id) || [],
    };
  }

  let lookAheadOut: DailyEdition['look_ahead'] = null;
  if (lookAhead) {
    const useTx = language !== SOURCE_LANGUAGE && laTx;
    // translateArticle keeps the event listing in English and translates the
    // prose, so the events always parse from the source body.
    const source = splitEventListing(lookAhead.body_text || '');
    const prose = useTx ? splitEventListing(laTx.body).prose : source.prose;
    lookAheadOut = {
      article_id: lookAhead.id,
      headline: cleanArticleHeadline(useTx ? laTx.headline : lookAhead.headline),
      published_at: lookAhead.published_at,
      body_markdown: toMarkdown(prose),
      events: source.listing ? parseEventListing(source.listing, date) : [],
      sources: sources.get(lookAhead.id) || [],
    };
  }

  const { languages: _languages, ...editionOut } = edition;
  void _languages;
  return {
    edition: editionOut,
    date,
    language,
    requested_language: lang,
    daily_brief: dailyBrief,
    look_ahead: lookAheadOut,
  };
}

// ---------------------------------------------------------------------------
// Story-by-story feed
// ---------------------------------------------------------------------------

export interface FeedItem extends FeedStory {
  edition_id: string;
  article_id: string;
  published_at: string;
}

interface Cursor {
  p: string; // published_at of the article the last item came from
  a: string; // that article's id
  i: number; // position of the last item returned within it
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof c?.p === 'string' && typeof c?.a === 'string' && Number.isInteger(c?.i) && !isNaN(Date.parse(c.p))) return c;
  } catch {
    // fall through
  }
  return null;
}

export interface StoriesQuery {
  editionIds: string[];
  since: Date;
  cursor: Cursor | null;
  limit: number;
}

export function parseStoriesQuery(
  url: URL,
  auth: AuthedLicensee,
): { ok: true; query: StoriesQuery } | { ok: false; status: number; code: string; message: string } {
  const editionsParam = url.searchParams.get('editions');
  const editionIds = editionsParam
    ? Array.from(new Set(editionsParam.split(',').map((s) => s.trim()).filter(Boolean)))
    : [...auth.licensee.editions];
  const notAllowed = editionIds.filter((id) => !auth.licensee.editions.includes(id));
  if (notAllowed.length) {
    return { ok: false, status: 404, code: 'edition_not_found', message: `Not available to this key: ${notAllowed.join(', ')}` };
  }
  if (!editionIds.length) {
    return { ok: false, status: 400, code: 'bad_request', message: 'No editions requested.' };
  }

  const sinceParam = url.searchParams.get('since');
  const floor = Date.now() - MAX_SINCE_DAYS * 86400_000;
  let since = new Date(Date.now() - DEFAULT_SINCE_HOURS * 3600_000);
  if (sinceParam) {
    const t = Date.parse(sinceParam);
    if (isNaN(t)) return { ok: false, status: 400, code: 'bad_request', message: '"since" must be an ISO 8601 timestamp.' };
    since = new Date(Math.max(t, floor));
  }

  const limitParam = url.searchParams.get('limit');
  let limit = DEFAULT_STORIES_PAGE;
  if (limitParam) {
    const n = Number(limitParam);
    if (!Number.isInteger(n) || n < 1) return { ok: false, status: 400, code: 'bad_request', message: '"limit" must be a positive integer.' };
    limit = Math.min(n, MAX_STORIES_PAGE);
  }

  const cursorParam = url.searchParams.get('cursor');
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  if (cursorParam && !cursor) return { ok: false, status: 400, code: 'bad_request', message: 'Invalid cursor.' };

  return { ok: true, query: { editionIds, since, cursor, limit } };
}

export async function listStories(
  db: SupabaseClient,
  q: StoriesQuery,
): Promise<{ stories: FeedItem[]; next_cursor: string | null }> {
  const { data: hoods, error: hoodErr } = await db
    .from('neighborhoods')
    .select('id, name, city, country')
    .in('id', q.editionIds);
  if (hoodErr) throw new Error(`neighborhoods: ${hoodErr.message}`);
  const places = new Map<string, Place>(
    (hoods || []).map((h) => [h.id, { edition_id: h.id, name: h.name, city: h.city, country: h.country }]),
  );

  const upper = q.cursor ? q.cursor.p : new Date().toISOString();
  const out: FeedItem[] = [];
  const BATCH = 50;
  let offset = 0;
  let exhausted = false;
  let last: Cursor | null = null;

  while (out.length < q.limit && !exhausted) {
    const { data, error } = await db
      .from('articles')
      .select('id, neighborhood_id, brief_id, headline, body_text, preview_text, published_at')
      .in('neighborhood_id', q.editionIds)
      .eq('article_type', 'brief_summary')
      .eq('status', 'published')
      .gte('published_at', q.since.toISOString())
      .lte('published_at', upper)
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + BATCH - 1);
    if (error) throw new Error(`articles: ${error.message}`);
    const rows = (data || []) as ArticleRow[];
    offset += rows.length;
    if (rows.length < BATCH) exhausted = true;
    if (!rows.length) break;

    const briefIds = Array.from(new Set(rows.map((r) => r.brief_id).filter((x): x is string => Boolean(x))));
    const cats = new Map<string, unknown>();
    if (briefIds.length) {
      const { data: briefs, error: bErr } = await db.from('neighborhood_briefs').select('id, enriched_categories').in('id', briefIds);
      if (bErr) throw new Error(`neighborhood_briefs: ${bErr.message}`);
      for (const b of briefs || []) cats.set(b.id, b.enriched_categories);
    }

    for (const row of rows) {
      // Resume strictly after the cursor: rows sort by (published_at desc, id desc).
      let startAt = 0;
      if (q.cursor) {
        const samePublished = Date.parse(row.published_at) === Date.parse(q.cursor.p);
        if (samePublished && row.id > q.cursor.a) continue;
        if (row.id === q.cursor.a) startAt = q.cursor.i + 1;
      }
      const place = places.get(row.neighborhood_id || '');
      if (!place) continue;
      const { stories } = buildStories(row.id, row.body_text || '', null, row.brief_id ? cats.get(row.brief_id) : null, place);
      for (const s of stories.slice(startAt)) {
        out.push({ ...s, edition_id: place.edition_id, article_id: row.id, published_at: row.published_at });
        last = { p: row.published_at, a: row.id, i: s.position };
        if (out.length >= q.limit) break;
      }
      if (out.length >= q.limit) break;
    }
  }

  return { stories: out, next_cursor: out.length >= q.limit && last ? encodeCursor(last) : null };
}

