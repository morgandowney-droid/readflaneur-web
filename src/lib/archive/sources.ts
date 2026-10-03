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
  lat: number;
  lng: number;
  members: Array<{ name: string; qualified: string; pop: number }>;
}

export type ItemKind = 'news' | 'council' | 'bluesky' | 'mastodon' | 'search';

export interface SourceItem {
  kind: ItemKind;
  url: string;
  title: string;
  /** Page text, or the post itself for social items. */
  text: string;
  date?: string | null;
  publisher?: string | null;
}

const UA = 'FlaneurArchive/1.0 (+https://readflaneur.com/standards)';
const FIPS: Record<string, string> = { Germany: 'GM', Austria: 'AU', Switzerland: 'SZ', Italy: 'IT', France: 'FR', Spain: 'SP' };
const BSKY_LANG: Record<string, string> = { Germany: 'de', Austria: 'de', Switzerland: 'de', Italy: 'it', France: 'fr', Spain: 'es' };
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
export function searchNames(area: ArchiveArea): string[] {
  const names = [area.name.replace(/ und Umgebung$/, ''), ...area.members.map((m) => m.name)];
  const out: string[] = [];
  for (const n of names) {
    for (const part of n.split(/,| und /).map((x) => x.trim()).filter(Boolean)) {
      if (part.length >= 3 && !out.includes(part)) out.push(part);
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
  const servers = ['mastodon.social', ...(MASTODON_BY_LAND[area.land || ''] || [])];
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

export interface AreaSources {
  council_url: string | null;
  council_feed: string | null;
  events_url: string | null;
  notes?: Record<string, unknown>;
}

const NOT_COUNCIL = /(wikipedia|wikiwand|tripadvisor|booking|facebook|instagram|youtube|meinestadt|stadtbranchenbuch|gelbeseiten|cylex|yelp|wetter|immobilienscout|kununu|zeit\.de|spiegel\.de|bild\.de|t-online)/i;

function absolute(href: string, base: string): string | null {
  try { return new URL(href, base).toString(); } catch { return null; }
}

/** Find the area's council website, its news feed or page, and its events page. Done once per area. */
export async function discoverCouncil(area: ArchiveArea, lang: Lang): Promise<AreaSources> {
  const place = area.city || area.members[0]?.name || area.name;
  const qualifier = area.kreis && area.kreis !== place ? ` ${area.kreis}` : '';
  const hits: SerperHit[] = await serper('search', `${place}${qualifier} ${area.city ? 'Stadt' : 'Gemeinde'} Rathaus`, lang, null, area.id).catch(() => []);
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

/** Published news: one Serper news query for the last day (Google News results, real article links). */
export async function newsSearch(area: ArchiveArea, lang: Lang): Promise<SourceItem[]> {
  const place = area.city ? `${area.name.replace(/ und Umgebung$/, '')} ${area.city}` : `${area.name.replace(/ und Umgebung$/, '')} ${area.kreis || ''}`.trim();
  const hits = await serper('news', place, lang, 'qdr:d', area.id).catch(() => [] as SerperHit[]);
  return hits.slice(0, 8).map((h) => ({ kind: 'news' as const, url: h.link, title: h.title, text: h.snippet || '', date: h.date || null, publisher: h.source || null }));
}

/** Read the article pages of non-social items (robots and TDM honoured), up to `max`. */
export async function readPages(items: SourceItem[], max: number): Promise<SourceItem[]> {
  const toRead = items.filter((i) => i.kind !== 'bluesky' && i.kind !== 'mastodon').slice(0, max);
  await Promise.all(toRead.map(async (it) => {
    const page = await fetchPage(it.url).catch(() => null);
    if (page?.ok && page.text && page.text.length > 200) it.text = page.text.replace(/\s+/g, ' ').slice(0, 2500);
    else if (!it.text) it.text = `(headline only) ${it.title}`;
  }));
  return items;
}
