/**
 * The archive tier's daily brief, weekly events gather and daily Look Ahead.
 *
 * Brief: free sources (sources.ts) -> pages read by our own fetcher -> one
 * DeepSeek V4 Flash call that writes the brief in the local language from the
 * numbered sources -> deterministic checks: a story must cite a source number
 * that exists (the model never writes a URL), a crime story that names a
 * private person is dropped and the rest go last, refusals and dashes are
 * caught as in production.
 *
 * Events: once a week (plus a midweek top-up), the council events page and one
 * Serper search are read and DeepSeek lists dated events, each tied to a page.
 * Look Ahead: each day, code lists the stored events of the next seven days.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { openRouterChat } from '@/lib/openrouter-chat';
import { isModelRefusal } from '@/lib/model-refusal';
import { repairJsonStrings } from '@/lib/translation-service';
import { fetchPage } from '@/lib/source-check';
import { langFor, serper, type SerperHit } from '@/lib/open-search';
import {
  blueskyPosts, councilItems, discoverCouncil, mastodonPosts, namesPlace, newsSearch, readPages, searchNames,
  type ArchiveArea, type AreaSources, type SourceItem,
} from '@/lib/archive/sources';

export const ARCHIVE_MODEL = 'deepseek/deepseek-v4-flash';
/**
 * DeepSeek V4 Flash providers by price (OpenRouter, 3 Oct 2026): StreamLake
 * $0.028/$0.056 per million, DeepInfra and GMICloud about $0.09/$0.18. Some
 * providers charge $1.28 or more for output, so the ceiling is on output.
 */
const ARCHIVE_PROVIDERS = { order: ['StreamLake', 'DeepInfra', 'GMICloud'], maxPrice: { prompt: 0.15, completion: 0.3 } };
const MAX_ITEMS = 16;

const LOCALE: Record<string, { code: string; language: string; timezone: string; greeting: string; weekday: string }> = {
  Germany: { code: 'de', language: 'German', timezone: 'Europe/Berlin', greeting: 'Guten Morgen', weekday: 'de-DE' },
  Austria: { code: 'de', language: 'German', timezone: 'Europe/Vienna', greeting: 'Guten Morgen', weekday: 'de-AT' },
};
export function localeFor(country: string) {
  return LOCALE[country] || { code: 'en', language: 'English', timezone: 'UTC', greeting: 'Good morning', weekday: 'en-GB' };
}

export function localDate(timezone: string, offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400_000).toLocaleDateString('en-CA', { timeZone: timezone });
}

// ─── Area sources (found once) ─────────────────────────────────────────────

export async function areaSources(admin: SupabaseClient, area: ArchiveArea): Promise<AreaSources> {
  const { data } = await admin.from('archive_area_sources').select('council_url, council_feed, events_url, notes').eq('area_id', area.id).maybeSingle();
  if (data) return data as AreaSources;
  const found = await discoverCouncil(area, langFor(area.country));
  await admin.from('archive_area_sources').upsert({ area_id: area.id, country: area.country, ...found });
  return found;
}

// ─── Daily brief ───────────────────────────────────────────────────────────

// Crime, courts, accidents and deaths: never lead, and a named private person drops the story.
const CRIME = /\b(polizei|festgenommen|festnahme|verhaftet|einbruch|diebstahl|raub|überfall|messer|mord|totschlag|leiche|unfall|verletzt|verletzte|gestorben|verstorben|tot|todesfall|trauer|trauert|tödlich|staatsanwaltschaft|gericht|angeklagt|verurteilt|police|arrest|robbery|stabbing|murder|court|charged|injured|killed|died|dies|death|obituary)\b/i;

const MONTHS: Record<string, number> = { januar: 1, jänner: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, october: 10, december: 12 };
/**
 * True when every calendar date a story names is more than `maxAgeDays` before
 * today (e.g. "17. September" on 4 October). A story with no date, or with any
 * date in the window or ahead, passes. The prompt asks for the last three days;
 * this is the check that it was followed.
 */
export function onlyStaleDates(text: string, todayIso: string, maxAgeDays = 7): boolean {
  const today = Date.parse(`${todayIso}T12:00:00Z`);
  const year = Number(todayIso.slice(0, 4));
  const dates: number[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})\.?\s+(januar|jänner|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember|january|february|march|may|june|july|october|december)\b(?:\s+(\d{4}))?/gi)) {
    const month = MONTHS[m[2].toLowerCase()];
    let y = m[3] ? Number(m[3]) : year;
    let t = Date.UTC(y, month - 1, Number(m[1]), 12);
    // "3. Januar" read in late December means next year.
    if (!m[3] && t - today > 180 * 86400_000) t = Date.UTC(--y, month - 1, Number(m[1]), 12);
    if (!m[3] && today - t > 180 * 86400_000) t = Date.UTC(y + 1, month - 1, Number(m[1]), 12);
    dates.push(t);
  }
  return dates.length > 0 && dates.every((t) => today - t > maxAgeDays * 86400_000);
}
/** A person's full name: two capitalised words in a row that are not a place we cover. */
function namesPerson(text: string, placeNames: string[]): boolean {
  const re = /\b([A-ZÄÖÜ][a-zäöüß]+) ([A-ZÄÖÜ][a-zäöüß]{2,})\b/g;
  for (const m of text.matchAll(re)) {
    const pair = `${m[1]} ${m[2]}`;
    if (placeNames.some((p) => pair.includes(p) || p.includes(pair))) continue;
    if (/^(Am|Im|In|Der|Die|Das|Den|Dem|Ein|Eine|Am|Bei|Zum|Zur|Vom|Nach|Für|Mit|Über|Unter)$/.test(m[1])) continue;
    return true;
  }
  return false;
}

export interface ArchiveStory { header: string; text: string; sources: number[]; crime: boolean }

export interface BriefResult {
  headline: string | null;
  body: string | null;
  stories: ArchiveStory[];
  sources: Array<{ n: number; url: string; title: string; kind: string; publisher: string | null }>;
  gathered: Record<string, number | string | null>;
  costUsd: number;
  error?: string;
}

export async function writeBrief(admin: SupabaseClient, area: ArchiveArea): Promise<BriefResult> {
  const loc = localeFor(area.country);
  const lang = langFor(area.country);
  const names = searchNames(area);
  const gathered: BriefResult['gathered'] = {};
  let cost = 0;

  const src = await areaSources(admin, area).catch(() => ({ council_url: null, council_feed: null, events_url: null }) as AreaSources);
  // Published news: one Serper news search (Google News results with real links).
  // GDELT's free index missed the local papers of small towns in testing.
  const [news, council, bsky, masto] = await Promise.all([
    newsSearch(area, lang).catch(() => []),
    councilItems(src).catch(() => []),
    blueskyPosts(area).catch(() => []),
    mastodonPosts(area).catch(() => []),
  ]);
  gathered.news = news.length; gathered.council = council.length; gathered.bluesky = bsky.length; gathered.mastodon = masto.length;

  let items: SourceItem[] = [...council, ...news, ...bsky.slice(0, 5), ...masto.slice(0, 3)];
  const seen = new Set<string>();
  items = items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
  items = items.slice(0, MAX_ITEMS);
  await readPages(items, 10);
  // Keep what names the area, or comes from the area's own council.
  items = items.filter((i) => i.kind === 'council' || namesPlace(`${i.title} ${i.text}`, names));
  gathered.kept = items.length;
  if (items.length === 0) return { headline: null, body: null, stories: [], sources: [], gathered, costUsd: cost, error: 'nothing local found' };

  const today = new Date().toLocaleDateString(loc.weekday, { timeZone: loc.timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const block = items.map((it, i) => `[${i + 1}] (${it.kind}${it.publisher ? `, ${it.publisher}` : ''}${it.date ? `, ${String(it.date).slice(0, 16)}` : ''}) ${it.title}\n${it.text.slice(0, 2000)}`).join('\n\n');
  const prompt = `You write a short local morning news brief in ${loc.language} for ${area.name}${area.city ? ` (${area.city})` : area.kreis ? ` (${area.kreis})` : ''}, ${area.country}. Today is ${today}.

Use ONLY the numbered sources below. Write up to five stories that are local news from the last three days, or something happening in the next few days, in ${area.name} or right next to it.

Rules:
- Every story lists the numbers of the sources it is based on. Never write a URL.
- Names, dates, places and figures exactly as the sources state them. Nothing from your own knowledge.
- Skip anything elsewhere, older news, adverts, and general descriptions of the place.
- Skip standing information: opening hours, services, offers that run all year, page navigation. A story reports something new, dated, or about to happen.
- Skip weather forecasts and general weather.
- Never name a private person in a story about crime, an accident or a court case.
- No em dashes or en dashes. Plain, factual ${loc.language}.
- If nothing qualifies, return {"stories": []}.

Return JSON only:
{"headline": "a short ${loc.language} headline for the lead story", "stories": [{"header": "short header", "text": "two to four sentences", "sources": [1, 3], "crime": false}]}

SOURCES:
${block}`;

  // Two attempts: a timeout or an answer that is not JSON gets one retry.
  type Parsed = { headline?: string; stories?: Array<{ header?: string; text?: string; sources?: number[]; crime?: boolean }> };
  let parsed: Parsed | null = null;
  let raw = '';
  let lastError = '';
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      const r = await openRouterChat({ model: ARCHIVE_MODEL, prompt, operation: 'archive_brief', label: area.id, maxTokens: 3000, temperature: 0.3, json: true, timeoutMs: 150_000, reasoningEffort: 'low', providers: ARCHIVE_PROVIDERS });
      raw = r.text;
      cost += r.costUsd ?? 0;
      if (isModelRefusal(raw)) { lastError = 'model refusal'; continue; }
      parsed = parseJsonObject(raw) as Parsed | null;
      if (!parsed) lastError = 'unparseable JSON';
    } catch (err) {
      lastError = `writer: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  if (!parsed) {
    gathered.raw = raw.slice(0, 400);
    return { headline: null, body: null, stories: [], sources: [], gathered, costUsd: cost, error: lastError };
  }
  gathered.stories_written = (parsed.stories || []).length;

  const clean = (s: string) => s.replace(/\s*[–—]\s*/g, ', ').replace(/\s+/g, ' ').trim();
  const placeNames = [...names, area.city || '', area.kreis || ''].filter(Boolean);
  let stories: ArchiveStory[] = [];
  let droppedNoSource = 0, droppedCrimeName = 0, droppedStale = 0;
  for (const s of parsed.stories || []) {
    const refs = (s.sources || []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= items.length);
    if (!s.header || !s.text || refs.length === 0) { droppedNoSource++; continue; }
    const text = clean(s.text);
    const crime = !!s.crime || CRIME.test(`${s.header} ${text}`);
    if (crime && namesPerson(`${s.header} ${text}`, placeNames)) { droppedCrimeName++; continue; }
    if (onlyStaleDates(`${s.header} ${text}`, localDate(loc.timezone))) { droppedStale++; continue; }
    stories.push({ header: clean(s.header), text, sources: refs, crime });
  }
  stories = [...stories.filter((s) => !s.crime), ...stories.filter((s) => s.crime)];
  gathered.dropped_no_source = droppedNoSource; gathered.dropped_crime_name = droppedCrimeName; gathered.dropped_stale = droppedStale;
  if (stories.length === 0) gathered.raw = raw.slice(0, 400);
  if (stories.length === 0) return { headline: null, body: null, stories: [], sources: [], gathered, costUsd: cost, error: 'no story survived the checks' };

  const used = Array.from(new Set(stories.flatMap((s) => s.sources))).sort((a, b) => a - b);
  const headline = stories[0].crime ? stories[0].header : clean(parsed.headline || stories[0].header);
  const body = [`${loc.greeting}, ${area.name.replace(/ und Umgebung$/, '')}.`, ...stories.map((s) => `[[${s.header}]]\n\n${s.text}`)].join('\n\n');
  return {
    headline,
    body,
    stories,
    sources: used.map((n) => ({ n, url: items[n - 1].url, title: items[n - 1].title, kind: items[n - 1].kind, publisher: items[n - 1].publisher || null })),
    gathered,
    costUsd: cost,
  };
}

/** The JSON object in a model's answer, tolerating code fences and text around it. */
export function parseJsonObject(raw: string): unknown | null {
  const t = raw.replace(/```(?:json)?/gi, '').trim();
  const inner = t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1);
  for (const candidate of [t, inner, inner && repairJsonStrings(inner)]) {
    if (!candidate) continue;
    try { return JSON.parse(candidate); } catch { /* next */ }
  }
  return null;
}

/** The complete objects in a JSON list that was cut off: each {...} that parses on its own. */
export function salvageObjects(raw: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const m of raw.matchAll(/\{[^{}]*\}/g)) {
    for (const c of [m[0], repairJsonStrings(m[0])]) {
      try { out.push(JSON.parse(c)); break; } catch { /* next */ }
    }
  }
  return out;
}

// ─── Weekly events and the daily Look Ahead ───────────────────────────────

export async function gatherEvents(admin: SupabaseClient, area: ArchiveArea): Promise<{ stored: number; costUsd: number; error?: string }> {
  const loc = localeFor(area.country);
  const lang = langFor(area.country);
  const src = await areaSources(admin, area).catch(() => null);
  const pages: Array<{ url: string; title: string; text: string }> = [];
  if (src?.events_url) {
    const p = await fetchPage(src.events_url).catch(() => null);
    if (p?.ok && p.text) pages.push({ url: src.events_url, title: 'Veranstaltungskalender', text: p.text.replace(/\s+/g, ' ').slice(0, 5000) });
  }
  const place = area.city ? `${area.name.replace(/ und Umgebung$/, '')} ${area.city}` : area.name.replace(/ und Umgebung$/, '');
  const hits = await serper('search', `${place} ${lang.events}`, lang, 'qdr:w', area.id).catch(() => [] as SerperHit[]);
  for (const h of hits.slice(0, 5)) {
    const p = await fetchPage(h.link).catch(() => null);
    pages.push({ url: h.link, title: h.title, text: p?.ok && p.text ? p.text.replace(/\s+/g, ' ').slice(0, 3000) : h.snippet || '' });
  }
  if (pages.length === 0) return { stored: 0, costUsd: 0, error: 'no event pages' };

  const from = localDate(loc.timezone), to = localDate(loc.timezone, 14);
  const prompt = `List the dated public events in ${area.name}${area.city ? ` (${area.city})` : ''}, ${area.country}, between ${from} and ${to}, from the numbered pages below.

Rules: only events the pages state with a date in that window; only in ${area.name} or right next to it; no permanent attractions, opening hours or adverts. Give names and venues as written. Each event gives the number of the page it came from. At most 20 events, soonest first; keep each field short.
Return JSON only: {"events": [{"date": "YYYY-MM-DD", "time": "19:30 or empty", "name": "...", "venue": "...", "category": "music|theatre|market|sport|family|talk|council|festival|other", "page": 2}]}

${pages.map((p, i) => `[${i + 1}] ${p.title}\n${p.text}`).join('\n\n')}`;
  let raw = '', cost = 0;
  try {
    const r = await openRouterChat({ model: ARCHIVE_MODEL, prompt, operation: 'archive_events', label: area.id, maxTokens: 3500, temperature: 0.2, json: true, timeoutMs: 150_000, reasoningEffort: 'low', providers: ARCHIVE_PROVIDERS });
    raw = r.text; cost = r.costUsd ?? 0;
  } catch (err) {
    return { stored: 0, costUsd: cost, error: err instanceof Error ? err.message : String(err) };
  }
  let events: Array<{ date?: string; time?: string; name?: string; venue?: string; category?: string; page?: number }> = [];
  const ev = parseJsonObject(raw) as { events?: typeof events } | null;
  // A long list cut off at the length limit still has its complete events.
  events = ev?.events || (salvageObjects(raw) as typeof events);
  if (!ev && events.length === 0) return { stored: 0, costUsd: cost, error: 'unparseable JSON' };
  const rows = events
    .filter((e) => e.name && e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= from && e.date <= to && Number.isInteger(e.page) && e.page! >= 1 && e.page! <= pages.length)
    .map((e) => ({ area_id: area.id, event_date: e.date!, time_text: e.time || null, name: e.name!.trim().slice(0, 200), venue: e.venue?.trim().slice(0, 200) || null, category: e.category || null, source_url: pages[e.page! - 1].url }));
  if (rows.length) {
    const { error } = await admin.from('archive_events').upsert(rows, { onConflict: 'area_id,event_date,name', ignoreDuplicates: true });
    if (error) return { stored: 0, costUsd: cost, error: error.message };
  }
  return { stored: rows.length, costUsd: cost };
}

/** The next seven days of stored events as a Look Ahead listing. No model call. */
export async function buildLookAhead(admin: SupabaseClient, area: ArchiveArea): Promise<{ body: string | null; count: number; sources: Array<{ url: string }> }> {
  const loc = localeFor(area.country);
  const from = localDate(loc.timezone), to = localDate(loc.timezone, 7);
  const { data } = await admin.from('archive_events').select('event_date, time_text, name, venue, category, source_url').eq('area_id', area.id).gte('event_date', from).lte('event_date', to).order('event_date').order('time_text');
  const events = data || [];
  if (events.length === 0) return { body: null, count: 0, sources: [] };
  const byDay = new Map<string, typeof events>();
  for (const e of events) { const k = e.event_date as string; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k)!.push(e); }
  const parts: string[] = [];
  for (const [day, list] of byDay) {
    const label = new Date(`${day}T12:00:00Z`).toLocaleDateString(loc.weekday, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    parts.push(`[[${label}]]`);
    parts.push(list.map((e) => `${e.name}${e.time_text ? `, ${e.time_text}` : ''}${e.venue ? `, ${e.venue}` : ''}`).join('\n'));
  }
  return { body: parts.join('\n\n'), count: events.length, sources: Array.from(new Set(events.map((e) => e.source_url as string))).map((url) => ({ url })) };
}
