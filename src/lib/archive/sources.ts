/**
 * Low-cost sources for the archive tier, all free except the Serper fallback:
 *
 *  - published news: one Serper news query a day (Google News results with
 *    real article links). GDELT's free index (gdeltArticles, kept for its bulk
 *    files later) missed the local papers of small towns in testing;
 *  - the area's own council site: news feed or page, found once and stored;
 *  - Bluesky public search and Mastodon hashtag timelines, filtered by the
 *    area's place names;
 *
 * Every item keeps the URL it came from; nothing here asks a model for one.
 */
import { fetchPage } from '@/lib/source-check';
import { serper, type Lang, type SerperHit } from '@/lib/open-search';

export interface ArchiveArea {
  id: string;
  name: string;
  kind: string;
  kreis?: string;
  land?: string;
  city?: string;
  country: string;
  population: number;
  /** IANA zone when it differs inside a country (Australia); else the country's. */
  timezone?: string;
  lat: number;
  lng: number;
  members: Array<{ name: string; qualified: string; pop: number }>;
}

export type ItemKind = 'news' | 'council' | 'official' | 'bluesky' | 'mastodon' | 'reddit' | 'search';

export interface SourceItem {
  kind: ItemKind;
  url: string;
  title: string;
  /** Page text, or the post itself for social items. */
  text: string;
  date?: string | null;
  publisher?: string | null;
  /** Set when the item is about this area by where it was posted (a subreddit named after the place). */
  aboutArea?: boolean;
}

const UA = 'FlaneurArchive/1.0 (+https://readflaneur.com/standards)';
const FIPS: Record<string, string> = { Germany: 'GM', Austria: 'AU', Switzerland: 'SZ', Italy: 'IT', France: 'FR', Spain: 'SP' };
const BSKY_LANG: Record<string, string> = {
  Germany: 'de', Austria: 'de', Switzerland: 'de', Italy: 'it', France: 'fr', Spain: 'es',
  'United Kingdom': 'en', Ireland: 'en', Australia: 'en', 'New Zealand': 'en', 'United States': 'en',
};
/** National Mastodon servers, read alongside mastodon.social and the German Land servers. */
const MASTODON_BY_COUNTRY: Record<string, string[]> = {
  'United Kingdom': ['mastodonapp.uk'], Ireland: ['mastodon.ie'], Australia: ['aus.social'], 'New Zealand': ['mastodon.nz'],
};
const DIRECTIONAL = /\s+(Central|North|South|East|West|North East|North West|South East|South West|Inner|Outer|Town|Village)$/i;
/** City and regional Mastodon servers by German Land; mastodon.social is always read. */
const MASTODON_BY_LAND: Record<string, string[]> = {
  'Nordrhein-Westfalen': ['nrw.social'],
  Bayern: ['muenchen.social'],
  Berlin: ['berlin.social'],
  Hamburg: ['norden.social'],
  'Schleswig-Holstein': ['norden.social'],
  Niedersachsen: ['norden.social'],
  Bremen: ['norden.social'],
};

/** The names an area is searched by: its own name and its largest members, at most four. */
// Words that join a single place name ("Carrick-on-Shannon", "Pen-y-groes", "Stratford-upon-Avon",
// "Frankfurt am Main"): a hyphen next to one of these is part of the name, not a list.
const NAME_CONNECTORS = new Set(['on', 'upon', 'under', 'in', 'by', 'le', 'la', 'les', 'sur', 'y', 'am', 'an', 'im', 'auf', 'bei', 'ob', 'der', 'den', 'de', 'du', 'of', 'the']);

function splitHyphens(part: string): string[] {
  const bits = part.split(/\s+-\s+|-/).map((x) => x.trim()).filter(Boolean);
  if (bits.length < 2) return [part];
  if (part.includes(' - ')) return part.split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  return bits.some((b) => NAME_CONNECTORS.has(b.toLowerCase()) || b.length < 3) ? [part] : bits;
}

/**
 * The places an area's news would name, best first: the edition name's places, then its members'.
 * Statistical names are cleaned for search and matching (5 Oct: half of the areas empty two nights
 * running had news that week, lost to these): "Upper West Side-Manhattan Valley" and "Pennant Hills -
 * Cheltenham" are two places each, "Kingston (ACT) and nearby" is Kingston (and never "nearby", which
 * matched almost any text), and "Galway City East" or "Harborne West" is searched and matched without
 * the statistical suffix.
 */
export function searchNames(area: ArchiveArea): string[] {
  const names = [area.name, ...area.members.map((m) => m.name)];
  const out: string[] = [];
  for (const raw of names) {
    const n = raw.replace(/\s*\([^)]*\)/g, '').replace(/\s+(und Umgebung|and nearby)$/i, '');
    for (const piece of n.split(/,| und | and | & /).map((x) => x.trim()).filter(Boolean)) {
      // German hyphenated names are one place (Wanne-Eickel, Baden-Baden); elsewhere a hyphen joins a list.
      for (let part of area.country === 'Germany' ? [piece] : splitHyphens(piece)) {
        part = part.replace(DIRECTIONAL, '').trim();
        if (part.length >= 3 && !/^(nearby|umgebung)$/i.test(part) && !out.some((o) => o.toLowerCase() === part.toLowerCase())) out.push(part);
      }
    }
  }
  return out.slice(0, 4);
}

/** True when a text names one of the area's places as a word. */
export function namesPlace(text: string, names: string[]): boolean {
  const t = text.toLowerCase();
  return names.some((n) => {
    const i = t.indexOf(n.toLowerCase());
    if (i < 0) return false;
    const before = i === 0 ? ' ' : t[i - 1];
    const after = t[i + n.length] ?? ' ';
    return !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
  });
}

async function getJson(url: string, timeoutMs = 20_000): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return JSON.parse(text);
}

// ─── GDELT ─────────────────────────────────────────────────────────────────

let lastGdelt = 0;
async function gdeltThrottle() {
  const wait = lastGdelt + 5600 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGdelt = Date.now();
}

/** Articles from the last two days naming the area's places, from GDELT's free index. */
export async function gdeltArticles(area: ArchiveArea): Promise<SourceItem[]> {
  const names = searchNames(area);
  const where = area.city ? ` "${area.city}"` : '';
  const q = `(${names.map((n) => `"${n}"`).join(' OR ')})${where}${FIPS[area.country] ? ` sourcecountry:${FIPS[area.country]}` : ''}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    await gdeltThrottle();
    try {
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=25&timespan=2d&format=json`;
      const data = await getJson(url) as { articles?: Array<{ url: string; title: string; domain: string; seendate: string }> };
      return (data.articles || []).map((a) => ({ kind: 'news' as const, url: a.url, title: a.title, text: '', date: a.seendate, publisher: a.domain }));
    } catch {
      // rate limited or empty: GDELT answers with plain text, retry after the throttle
    }
  }
  return [];
}

// ─── Bluesky and Mastodon ──────────────────────────────────────────────────

export async function blueskyPosts(area: ArchiveArea): Promise<SourceItem[]> {
  const names = searchNames(area);
  const since = new Date(Date.now() - 2 * 86400_000).toISOString();
  const lang = BSKY_LANG[area.country];
  const out: SourceItem[] = [];
  for (const n of names.slice(0, 2)) {
    try {
      const url = `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(`"${n}"`)}&limit=25&sort=latest&since=${since}${lang ? `&lang=${lang}` : ''}`;
      const data = await getJson(url) as { posts?: Array<{ uri: string; author: { handle: string; displayName?: string }; record: { text?: string; createdAt?: string } }> };
      for (const p of data.posts || []) {
        const text = p.record?.text || '';
        if (!namesPlace(text, names)) continue;
        const rkey = p.uri.split('/').pop();
        out.push({ kind: 'bluesky', url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`, title: `@${p.author.handle}`, text, date: p.record?.createdAt || null, publisher: p.author.displayName || p.author.handle });
      }
    } catch { /* skip */ }
  }
  return out;
}

function hashtagOf(name: string): string {
  return name.toLowerCase().replace(/[\s\-./]+/g, '');
}

export async function mastodonPosts(area: ArchiveArea): Promise<SourceItem[]> {
  const names = searchNames(area);
  const servers = ['mastodon.social', ...(MASTODON_BY_LAND[area.land || ''] || []), ...(MASTODON_BY_COUNTRY[area.country] || [])];
  const cutoff = Date.now() - 2 * 86400_000;
  const out: SourceItem[] = [];
  for (const server of servers) {
    for (const n of names.slice(0, 2)) {
      try {
        const data = await getJson(`https://${server}/api/v1/timelines/tag/${encodeURIComponent(hashtagOf(n))}?limit=20`) as Array<{ url: string; created_at: string; content: string; account: { acct: string; display_name?: string } }>;
        for (const p of data) {
          if (Date.parse(p.created_at) < cutoff) continue;
          const text = p.content.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
          if (!text || out.some((o) => o.url === p.url)) continue;
          out.push({ kind: 'mastodon', url: p.url, title: `@${p.account.acct}`, text, date: p.created_at, publisher: p.account.display_name || p.account.acct });
        }
      } catch { /* skip */ }
    }
  }
  return out;
}

// ─── The council site ──────────────────────────────────────────────────────

export interface OfficialFeed { kind: 'police' | 'fire'; url: string; feed: string | null }

export interface AreaSources {
  council_url: string | null;
  council_feed: string | null;
  events_url: string | null;
  notes?: Record<string, unknown>;
  /** Police and fire news, found once (discoverOfficial); null means not looked for yet. */
  extra_feeds?: OfficialFeed[] | null;
}

const NOT_COUNCIL = /(wikipedia|wikiwand|tripadvisor|booking|facebook|instagram|youtube|meinestadt|stadtbranchenbuch|gelbeseiten|cylex|yelp|wetter|immobilienscout|kununu|zeit\.de|spiegel\.de|bild\.de|t-online)/i;

function absolute(href: string, base: string): string | null {
  try { return new URL(href, base).toString(); } catch { return null; }
}

/** Find the area's council website, its news feed or page, and its events page. Done once per area. */
export async function discoverCouncil(area: ArchiveArea, lang: Lang): Promise<AreaSources> {
  // German areas search their own Gemeinde or city; elsewhere the council is the
  // local authority (an English district, an Irish county, an Australian region).
  const german = lang.hl === 'de';
  const place = german ? (area.city || area.members[0]?.name || area.name) : (area.city || area.kreis || area.members[0]?.name || area.name);
  const qualifier = german && area.kreis && area.kreis !== place ? ` ${area.kreis}` : '';
  const query = german ? `${place}${qualifier} ${area.city ? 'Stadt' : 'Gemeinde'} Rathaus` : `${place} ${lang.council}`;
  const hits: SerperHit[] = await serper('search', query, lang, null, area.id).catch(() => []);
  // Domains spell umlauts both ways: duesseldorf.de, but also dusseldorf.de.
  const lower = place.toLowerCase().replace(/ß/g, 'ss');
  const wants = Array.from(new Set([
    lower.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'),
    lower.normalize('NFKD').replace(/[̀-ͯ]/g, ''),
  ].map((w) => w.replace(/[^a-z]/g, '').slice(0, 6))));
  const candidates = hits.filter((h) => {
    try {
      const host = new URL(h.link).hostname.replace(/^www\./, '');
      const flat = host.replace(/[^a-z]/g, '');
      return !NOT_COUNCIL.test(host) && wants.some((w) => flat.includes(w));
    } catch { return false; }
  });
  // The place's own site before its Kreis's: a host without "kreis" wins.
  const site = candidates.find((h) => !/kreis/i.test(new URL(h.link).hostname)) || candidates[0];
  if (!site) return { council_url: null, council_feed: null, events_url: null, notes: { reason: 'no council site found' } };

  const home = new URL(site.link).origin + '/';
  const page = await fetchPage(home).catch(() => null);
  const html = page?.html || '';
  const feed = html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/i)?.[1]
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]*type=["']application\/(?:rss|atom)\+xml["']/i)?.[1];
  const links = Array.from(html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{1,120}?)<\/a>/gi))
    .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() }));
  const news = links.find((l) => /^(aktuelles|aktuell|neuigkeiten|nachrichten|pressemitteilungen|presse|news|meldungen)\b/i.test(l.text));
  const events = links.find((l) => /(veranstaltung|termine|kalender|events)/i.test(l.text));
  return {
    council_url: news ? absolute(news.href, home) : home,
    council_feed: feed ? absolute(feed, home) : null,
    events_url: events ? absolute(events.href, home) : null,
    notes: { site: home, blocked: page?.blocked || null },
  };
}

/** The council's items from the last three days: feed entries, else the links on its news page. */
export async function councilItems(src: AreaSources): Promise<SourceItem[]> {
  const cutoff = Date.now() - 3 * 86400_000;
  if (src.council_feed) {
    const page = await fetchPage(src.council_feed).catch(() => null);
    const xml = page?.html || page?.text || '';
    const items = Array.from(xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)).map((m) => m[0]);
    const out: SourceItem[] = [];
    for (const it of items.slice(0, 20)) {
      const title = (it.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const link = it.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1]?.trim() || it.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || '';
      const date = it.match(/<(pubDate|updated|published|dc:date)[^>]*>([^<]+)</i)?.[2] || null;
      if (date && Date.parse(date) < cutoff) continue;
      if (title && link) out.push({ kind: 'council', url: link, title, text: '', date, publisher: new URL(src.council_feed).hostname });
    }
    if (out.length) return out.slice(0, 6);
  }
  if (!src.council_url) return [];
  const page = await fetchPage(src.council_url).catch(() => null);
  if (!page?.ok || !page.html) return [];
  const base = page.finalUrl || src.council_url;
  const host = new URL(base).hostname;
  const out: SourceItem[] = [];
  for (const m of page.html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{25,200}?)<\/a>/gi)) {
    const url = absolute(m[1], base);
    const title = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!url || title.length < 25 || !url.includes(host) || out.some((o) => o.url === url)) continue;
    out.push({ kind: 'council', url, title, text: '', date: null, publisher: host });
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * Police and fire services post the same items to their own sites and feeds
 * that they post on Facebook, and those are free to read and clean to cite.
 * Found once per area by search, kept only when the host is the official one.
 */
const OFFICIAL_HOST: Record<string, RegExp> = {
  police: /(\.police\.uk$|^police\.|\.police\.|garda\.ie$|presseportal\.de$|polizei|police\.govt\.nz$|mpdc\.dc\.gov$|nyc\.gov$)/i,
  fire: /(fire.*\.(gov|org)\.uk$|\.fire\.|firerescue|fireservice|feuerwehr|rfs\.nsw\.gov\.au$|cfa\.vic\.gov\.au$|fire\.nsw\.gov\.au$|fireandemergency\.nz$)/i,
};

export async function discoverOfficial(area: ArchiveArea, lang: Lang): Promise<OfficialFeed[]> {
  const where = area.kreis || area.city || area.members[0]?.name || area.name;
  const queries: Array<[OfficialFeed['kind'], string]> = lang.hl === 'de'
    ? [['police', `presseportal blaulicht Polizei ${where}`]]
    : [['police', `${where} police news`], ['fire', `${where} fire and rescue news`]];
  const out: OfficialFeed[] = [];
  for (const [kind, q] of queries) {
    const hits: SerperHit[] = await serper('search', q, lang, null, area.id).catch(() => []);
    const hit = hits.find((h) => { try { return OFFICIAL_HOST[kind].test(new URL(h.link).hostname); } catch { return false; } });
    if (!hit) continue;
    // German police press releases: each Presseportal station page has a feed.
    const station = hit.link.match(/presseportal\.de\/blaulicht\/(?:nr|pm)\/(\d+)/)?.[1];
    if (station) { out.push({ kind, url: `https://www.presseportal.de/blaulicht/nr/${station}`, feed: `https://www.presseportal.de/rss/dienststelle_${station}.rss2` }); continue; }
    const page = await fetchPage(hit.link).catch(() => null);
    const html = page?.html || '';
    const feed = html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/i)?.[1]
      || html.match(/<link[^>]+href=["']([^"']+)["'][^>]*type=["']application\/(?:rss|atom)\+xml["']/i)?.[1];
    out.push({ kind, url: hit.link, feed: feed ? absolute(feed, hit.link) : null });
  }
  return out;
}

/** Items from a feed in the last `days`; shared by the council and official readers. */
async function feedItems(feedUrl: string, kind: ItemKind, days = 3): Promise<SourceItem[]> {
  const cutoff = Date.now() - days * 86400_000;
  const page = await fetchPage(feedUrl).catch(() => null);
  const xml = page?.html || page?.text || '';
  const out: SourceItem[] = [];
  for (const it of Array.from(xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)).map((m) => m[0]).slice(0, 40)) {
    const title = (it.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const link = it.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1]?.trim() || it.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || '';
    const date = it.match(/<(pubDate|updated|published|dc:date)[^>]*>([^<]+)</i)?.[2] || null;
    const desc = (it.match(/<(description|summary|content)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (date && Date.parse(date) < cutoff) continue;
    if (title && link) out.push({ kind, url: link, title, text: desc.slice(0, 1500), date, publisher: (() => { try { return new URL(feedUrl).hostname; } catch { return null; } })() });
  }
  return out;
}

// One police force or fire service covers many areas: read each source once per run.
const officialCache = new Map<string, Promise<SourceItem[]>>();

/** Today's police and fire items for an area: only those that name one of its places. */
/** A news item, not a listing, archive, tag page or document. */
function isOfficialArticle(h: SerperHit): boolean {
  if ((h.title || '').length < 10 || /\|| archive$|^regions?:|^(news|appeals|incidents|latest)\b/i.test(h.title)) return false;
  try {
    const path = new URL(h.link).pathname.toLowerCase();
    if (path.split('/').filter(Boolean).length < 2) return false;
    return !/\/(tag|tags|regions?|category|filtered-search|search|media|documents?|downloads?)\/|\.(pdf|docx?|xlsx?)$/.test(path);
  } catch { return false; }
}

/** Serper's dates are relative ("2 days ago") or absolute; unknown counts as recent, the writer drops stale stories. */
function withinDays(date: string | undefined, days: number): boolean {
  if (!date) return true;
  const rel = date.match(/(\d+)\s*(minute|hour|day|week|month)/i);
  if (rel) return /minute|hour/i.test(rel[2]) || (/day/i.test(rel[2]) && Number(rel[1]) <= days);
  const t = Date.parse(date);
  return Number.isNaN(t) || Date.now() - t <= days * 86400_000;
}

export async function officialItems(feeds: OfficialFeed[] | null | undefined, names: string[], lang: Lang): Promise<SourceItem[]> {
  const out: SourceItem[] = [];
  for (const f of feeds || []) {
    const key = f.feed || f.url;
    if (!officialCache.has(key)) {
      // No feed (most UK, Irish and Australian services): one site search per service per run, shared by every area it covers.
      officialCache.set(key, f.feed ? feedItems(f.feed, 'official').catch(() => []) : (async () => {
        const host = new URL(f.url).hostname.replace(/^www\./, '');
        const hits = await serper('search', `site:${host}`, lang, 'qdr:w', `official:${host}`).catch(() => [] as SerperHit[]);
        return hits.filter((h) => withinDays(h.date, 3) && isOfficialArticle(h)).map((h) => ({ kind: 'official' as const, url: h.link, title: h.title, text: h.snippet || '', date: h.date || null, publisher: host }));
      })());
    }
    for (const it of await officialCache.get(key)!) if (namesPlace(`${it.title} ${it.text}`, names)) out.push(it);
  }
  return out.slice(0, 5);
}

/** Published news: one Serper news query for the last day (Google News results, real article links). */
// A news hit on another country's site is a namesake (Christchurch, Dorset in a Christchurch, NZ
// edition; Lismore, New South Wales in Lismore, County Waterford). The UK and Ireland are one market.
const COUNTRY_TLDS: Record<string, string[]> = {
  'United Kingdom': ['uk', 'ie'], Ireland: ['ie', 'uk'], Australia: ['au'], 'New Zealand': ['nz'],
  Germany: ['de', 'at', 'ch'], 'United States': ['us'],
};
const NATIONAL_TLDS = ['uk', 'ie', 'au', 'nz', 'de', 'at', 'ch', 'ca', 'us', 'za', 'in', 'fr', 'it', 'es', 'nl', 'se', 'no', 'dk', 'jm', 'bb', 'tt', 'sg', 'hk', 'ph', 'my'];

export function isForeignSite(url: string, country: string): boolean {
  const own = COUNTRY_TLDS[country];
  if (!own) return false;
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  const tld = host.split('.').pop() || '';
  return NATIONAL_TLDS.includes(tld) && !own.includes(tld);
}

const RECENT = /(minute|hour|stunde|minuten|1 day|2 days|3 days|1 tag|2 tagen|3 tagen|vor einem tag)/i;

// Property portals: a listing is an advert, not news (Baringa, 5 Oct: a brief of four listings).
const LISTING_SITE = /(^|\.)(realestate\.com\.au|domain\.com\.au|allhomes\.com\.au|realcommercial\.com\.au|rightmove\.co\.uk|zoopla\.co\.uk|onthemarket\.com|daft\.ie|myhome\.ie|trademe\.co\.nz|oneroof\.co\.nz|homes\.co\.nz|immobilienscout24\.de|immowelt\.de|kleinanzeigen\.de|zillow\.com|streeteasy\.com|realtor\.com|redfin\.com|trulia\.com|apartments\.com)$/i;

export function isListingSite(url: string): boolean {
  try { return LISTING_SITE.test(new URL(url).hostname); } catch { return false; }
}

function toItems(hits: SerperHit[], country: string): SourceItem[] {
  return hits
    .filter((h) => (!h.date || RECENT.test(h.date)) && !isForeignSite(h.link, country) && !isListingSite(h.link))
    .map((h) => ({ kind: 'news' as const, url: h.link, title: h.title, text: h.snippet || '', date: h.date || null, publisher: h.source || null }));
}

export async function newsSearch(area: ArchiveArea, lang: Lang): Promise<SourceItem[]> {
  // The lead place and its city or council: "Oberkassel Düsseldorf", not the edition's full name.
  // The last week from Google News, kept to the last three days by its own date ("vor 2 Tagen",
  // "5 hours ago"); a quiet district has no news in 24 hours.
  const names = searchNames(area);
  const where = area.city || area.kreis || '';
  const query = (name: string) => `${name} ${where && where.toLowerCase() !== name.toLowerCase() ? where : ''}`.trim();
  let items = toItems(await serper('news', query(names[0]), lang, 'qdr:w', area.id).catch(() => [] as SerperHit[]), area.country);
  // Nothing for the lead place: the area's next place (Timmerlah had nothing, its neighbour Lamme did).
  if (items.length === 0 && names[1]) items = toItems(await serper('news', query(names[1]), lang, 'qdr:w', area.id).catch(() => [] as SerperHit[]), area.country);
  return items.slice(0, 8);
}

/**
 * One news search per council or city, shared by all its areas: a "Christchurch" search returns
 * stories that name Merivale or St Albans, which a search per suburb often misses. Run once per
 * council per process and cached; each area keeps only the items that name one of its places
 * (the caller's namesPlace filter). Foreign sites are dropped (isForeignSite), and US boroughs and
 * counties carry their state ("Manhattan" alone is also a city in Kansas).
 */
const councilCache = new Map<string, Promise<SourceItem[]>>();

export function councilQuery(area: ArchiveArea): string | null {
  const base = (area.city || area.kreis || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+(City|District|Suburbs|Council|Borough|County|Shire|Region|Inner|North|South|East|West)$/i, '').trim();
  if (base.length < 3) return null;
  return area.country === 'United States' && area.land ? `${base} ${area.land}` : base;
}

/**
 * Reddit posts about a council's places from the last three days, found through one Google search
 * per council (site:reddit.com) and shared by its areas: what residents are talking about in the
 * suburbs where Google News has little. We read only Google's title and snippet, never Reddit's
 * pages (no Reddit API until a commercial agreement is in place). These are leads: writeBrief
 * drops any story whose only sources are Reddit posts.
 */
const redditCache = new Map<string, Promise<SourceItem[]>>();

// Local subreddits whose names are not the council's: r/chch is Christchurch, r/AskNYC every borough.
const LOCAL_SUBREDDITS: Record<string, string[]> = {
  christchurch: ['chch'], 'manhattan new york': ['nyc', 'asknyc'], 'queens new york': ['nyc', 'asknyc'],
  'brooklyn new york': ['nyc', 'asknyc'], 'bronx new york': ['nyc', 'asknyc', 'thebronx'], 'staten island new york': ['nyc', 'asknyc'],
  'washington, dc district of columbia': ['washingtondc', 'dc', 'askdc'], dublin: ['dublin', 'dublinireland'],
  'south canberra': ['canberra'], 'north canberra': ['canberra'], 'belconnen': ['canberra'], 'tuggeranong': ['canberra'], 'woden valley': ['canberra'],
  'sydney inner city': ['sydney'], 'melbourne city': ['melbourne'], 'brisbane inner': ['brisbane'],
};

const squash = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/** The subreddits that speak for this area: the council's, its places', and known local aliases. */
function localSubreddits(area: ArchiveArea, q: string): Set<string> {
  const base = q.replace(/\s+(New York|District of Columbia)$/i, '');
  return new Set([squash(base), ...(LOCAL_SUBREDDITS[q.toLowerCase()] || []), ...searchNames(area).map(squash)].filter((x) => x.length >= 3));
}

export async function redditTips(area: ArchiveArea, lang: Lang): Promise<SourceItem[]> {
  const q = councilQuery(area);
  if (!q) return [];
  const key = `${area.country}:${q}`;
  if (!redditCache.has(key)) {
    redditCache.set(key, serper('search', `site:reddit.com ${q.replace(/\s+District of Columbia$/i, '')}`, lang, 'qdr:w', `reddit:${q}`, 20).then((hits) => hits
      .filter((h) => /reddit\.com\/r\/[^/]+\/comments\//.test(h.link) && withinDays(h.date, 3))
      .map((h) => ({
        kind: 'reddit' as const, url: h.link,
        title: h.title.replace(/^r\/\w+\s*-\s*/i, '').replace(/\s*:\s*r\/\w+\s*$/i, '').replace(/\s*-\s*Reddit\s*$/i, '').trim(),
        text: h.snippet || '', date: h.date || null,
        publisher: `r/${h.link.match(/reddit\.com\/r\/([^/]+)/)?.[1] || 'reddit'}`,
      }))).catch(() => []));
  }
  // Only local subreddits: a council name also appears in r/BikeLA, r/coldcases and job boards.
  const subs = localSubreddits(area, q);
  const own = new Set(searchNames(area).map(squash));
  return (await redditCache.get(key)!)
    .filter((i) => subs.has(squash((i.publisher || '').slice(2))))
    .map((i) => ({ ...i, aboutArea: own.has(squash((i.publisher || '').slice(2))) }));
}

export async function councilNews(area: ArchiveArea, lang: Lang): Promise<SourceItem[]> {
  const q = councilQuery(area);
  if (!q) return [];
  const key = `${area.country}:${q}`;
  if (!councilCache.has(key)) {
    councilCache.set(key, serper('news', q, lang, 'qdr:w', `council:${q}`, 40).then((h) => toItems(h, area.country)).catch(() => []));
  }
  return councilCache.get(key)!;
}

/** Read the article pages of non-social items (robots and TDM honoured), up to `max`. */
export async function readPages(items: SourceItem[], max: number): Promise<SourceItem[]> {
  const toRead = items.filter((i) => i.kind !== 'bluesky' && i.kind !== 'mastodon' && i.kind !== 'reddit').slice(0, max);
  await Promise.all(toRead.map(async (it) => {
    const page = await fetchPage(it.url).catch(() => null);
    if (page?.ok && page.text && page.text.length > 200) it.text = page.text.replace(/\s+/g, ' ').slice(0, 2500);
    else if (!it.text) it.text = `(headline only) ${it.title}`;
  }));
  return items;
}
