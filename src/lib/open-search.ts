/**
 * The open-weight route's fact gathering, for the shadow trial only.
 *
 * Production gathers a brief's facts with Gemini's built-in Google Search
 * ($35 per 1,000 calls once past the free daily allowance) and Grok. This
 * gathers them the cheap way and is measured against production:
 *
 *  1. Serper returns raw Google results for four queries (about $0.001 each).
 *  2. Our own fetcher reads the result pages, honouring robots.txt and the
 *     text-and-data-mining opt-out (source-check.ts fetchPage).
 *  3. DeepSeek V4 Flash lists the local facts on those pages, each tagged with
 *     the number of the page it came from. Code maps the number to the page's
 *     URL: the model is never asked for a URL, and a fact with no valid page
 *     number is dropped.
 *
 * The result has the shape production's gathered facts have (a bullet list
 * plus the pages read, each carrying the lines it backs), so it goes through
 * the same enricher and the same checks.
 */
import { recordAiUsage } from '@/lib/ai-cost';
import { openRouterChat } from '@/lib/openrouter-chat';
import { fetchPage } from '@/lib/source-check';
import type { GroundingChunk } from '@/lib/source-links';

export const OPEN_EXTRACT_MODEL = 'deepseek/deepseek-v4-flash';
const SERPER_URL = 'https://google.serper.dev';
const MAX_PAGES = 12;
const PAGE_CHARS = 3000;
const FETCH_CONCURRENCY = 6;

/** Sites that are never local news: reference, travel, maps, video. */
const SKIP_HOSTS = /(^|\.)(wikipedia\.org|wikiwand\.com|tripadvisor\.[a-z.]+|booking\.com|expedia\.[a-z.]+|yelp\.[a-z.]+|youtube\.com|maps\.google\.[a-z.]+|google\.[a-z.]+|airbnb\.[a-z.]+|zillow\.com|realtor\.com)$/i;

export interface Lang { gl: string; hl: string; news: string; council: string; events: string }

const LANGS: Record<string, Lang> = {
  italy: { gl: 'it', hl: 'it', news: 'notizie', council: 'consiglio comunale', events: 'eventi' },
  austria: { gl: 'at', hl: 'de', news: 'Nachrichten', council: 'Gemeinderat', events: 'Veranstaltungen' },
  germany: { gl: 'de', hl: 'de', news: 'Nachrichten', council: 'Stadtrat', events: 'Veranstaltungen' },
  switzerland: { gl: 'ch', hl: 'de', news: 'Nachrichten', council: 'Gemeinderat', events: 'Veranstaltungen' },
  spain: { gl: 'es', hl: 'es', news: 'noticias', council: 'ayuntamiento', events: 'eventos' },
  france: { gl: 'fr', hl: 'fr', news: 'actualités', council: 'conseil municipal', events: 'événements' },
  portugal: { gl: 'pt', hl: 'pt', news: 'notícias', council: 'câmara municipal', events: 'eventos' },
  norway: { gl: 'no', hl: 'no', news: 'nyheter', council: 'kommunestyret', events: 'arrangementer' },
  sweden: { gl: 'se', hl: 'sv', news: 'nyheter', council: 'kommunfullmäktige', events: 'evenemang' },
  denmark: { gl: 'dk', hl: 'da', news: 'nyheder', council: 'byråd', events: 'arrangementer' },
  netherlands: { gl: 'nl', hl: 'nl', news: 'nieuws', council: 'gemeenteraad', events: 'evenementen' },
  ireland: { gl: 'ie', hl: 'en', news: 'news', council: 'county council', events: 'events' },
  'united kingdom': { gl: 'gb', hl: 'en', news: 'news', council: 'council', events: 'events' },
  uk: { gl: 'gb', hl: 'en', news: 'news', council: 'council', events: 'events' },
  canada: { gl: 'ca', hl: 'en', news: 'news', council: 'council', events: 'events' },
  australia: { gl: 'au', hl: 'en', news: 'news', council: 'council', events: 'events' },
  'new zealand': { gl: 'nz', hl: 'en', news: 'news', council: 'council', events: 'events' },
};
const US: Lang = { gl: 'us', hl: 'en', news: 'news', council: 'township council', events: 'events' };

export function langFor(country: string | null | undefined): Lang {
  return LANGS[(country || '').trim().toLowerCase()] || US;
}

export interface SerperHit { title: string; link: string; snippet?: string; date?: string; source?: string }

export async function serper(kind: 'news' | 'search', q: string, lang: Lang, tbs: string | null, label: string): Promise<SerperHit[]> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) throw new Error('SERPER_API_KEY not set');
  const res = await fetch(`${SERPER_URL}/${kind}`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: lang.gl, hl: lang.hl, num: 10, ...(tbs ? { tbs } : {}) }),
  });
  recordAiUsage({ provider: 'serper', model: 'serper', operation: 'open_search', kind: 'search', label, inputTokens: 1, metadata: { kind, q, status: res.status } });
  if (!res.ok) throw new Error(`Serper HTTP ${res.status}`);
  const data = await res.json();
  return ((kind === 'news' ? data.news : data.organic) || []) as SerperHit[];
}

export interface OpenGather {
  content: string;
  pages: GroundingChunk[];
  queries: string[];
  hits: number;
  pagesRead: number;
  pagesBlocked: number;
  factsKept: number;
  factsDropped: number;
  /** The extraction model's raw answer (first 4,000 characters) and why it stopped, for diagnosis. */
  extractRaw?: string;
  extractFinish?: string | null;
  extractReasoningTokens?: number | null;
  error?: string;
}

function localDate(timezone: string | null | undefined): string {
  return new Date().toLocaleDateString('en-GB', { timeZone: timezone || 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Gather one edition's facts the open-weight way. Never throws; an error is returned in `error`. */
export async function gatherOpenRoute(edition: { id: string; name: string; city: string; country: string | null; timezone: string | null }): Promise<OpenGather> {
  const out: OpenGather = { content: '', pages: [], queries: [], hits: 0, pagesRead: 0, pagesBlocked: 0, factsKept: 0, factsDropped: 0 };
  const lang = langFor(edition.country);
  const place = edition.name;
  const where = edition.city && edition.city !== edition.name ? `${place} ${edition.city}` : place;
  const plan: Array<[kind: 'news' | 'search', q: string, tbs: string | null]> = [
    ['news', where, 'qdr:d'],
    ['news', `${place} ${lang.council}`, 'qdr:w'],
    ['search', `${where} ${lang.news}`, 'qdr:d'],
    ['search', `${where} ${lang.events}`, null],
  ];

  if (!process.env.SERPER_API_KEY?.trim()) { out.error = 'SERPER_API_KEY not set'; return out; }
  try {
    const results = await Promise.all(plan.map(([kind, q, tbs]) => {
      out.queries.push(`${kind}: ${q}${tbs ? ` (${tbs})` : ''}`);
      return serper(kind, q, lang, tbs, edition.name).catch(() => [] as SerperHit[]);
    }));
    const seen = new Set<string>();
    const hits: SerperHit[] = [];
    for (const list of results) for (const h of list) {
      if (!h?.link || seen.has(h.link)) continue;
      let host = '';
      try { host = new URL(h.link).hostname.replace(/^www\./, ''); } catch { continue; }
      if (SKIP_HOSTS.test(host)) continue;
      seen.add(h.link);
      hits.push(h);
    }
    out.hits = hits.length;
    if (hits.length === 0) { out.error = 'no search results'; return out; }

    // Read the pages ourselves. A page we may not or cannot read keeps only
    // its search title and snippet, marked as such.
    const picked = hits.slice(0, MAX_PAGES);
    const texts: string[] = new Array(picked.length).fill('');
    let next = 0;
    await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, async () => {
      while (next < picked.length) {
        const i = next++;
        const h = picked[i];
        const page = await fetchPage(h.link).catch(() => null);
        if (page?.blocked) out.pagesBlocked++;
        if (page?.ok && page.text && page.text.length > 200) {
          out.pagesRead++;
          texts[i] = page.text.replace(/\s+/g, ' ').slice(0, PAGE_CHARS);
        } else {
          texts[i] = `(search snippet only) ${h.snippet || ''}`.trim();
        }
      }
    }));

    const today = localDate(edition.timezone);
    const pageBlock = picked.map((h, i) => `[P${i + 1}] ${h.title}${h.date ? ` (${h.date})` : ''}\n${texts[i]}`).join('\n\n');
    const prompt = `You are a local news researcher for ${place}${edition.city ? `, ${edition.city}` : ''}${edition.country ? `, ${edition.country}` : ''}. Today is ${today}.

Below are pages from a web search. List the facts on them that are local news from the last seven days, or upcoming events, in ${place} or its immediate area.

Rules:
- One fact per line, starting with "- ", in English.
- Give the date it happened or will happen, and names, places and figures exactly as the page states them.
- End every line with the tag of the page it came from, like [P3]. Use only tags shown below.
- Only facts the pages state. Nothing from your own knowledge.
- Skip anything in another town or country, anything older than seven days that is not upcoming, adverts, and general descriptions of the place.
- If nothing qualifies, reply NONE.

${pageBlock}`;

    const r = await openRouterChat({ model: OPEN_EXTRACT_MODEL, prompt, operation: 'open_extract', label: edition.name, maxTokens: 8000, temperature: 0.2, timeoutMs: 120_000, reasoningEffort: 'low' });
    out.extractRaw = r.text.slice(0, 4000);
    out.extractFinish = r.finishReason;
    out.extractReasoningTokens = r.reasoningTokens;
    const pages = new Map<number, GroundingChunk>();
    const lines: string[] = [];
    for (const raw of r.text.split('\n')) {
      const line = raw.trim();
      // A list item in any common form: "- ", "* ", "• ", "1. ", "1) ".
      if (!/^(?:[-*•]|\d{1,2}[.)])\s+/.test(line)) continue;
      // Page tags as [P3], (P3), [P3, P5] or [P3][P5], any case.
      const tags = Array.from(line.matchAll(/P(\d{1,2})(?=[\],)\s])/gi))
        .filter((m) => /[[(,]\s*$/.test(line.slice(Math.max(0, (m.index ?? 0) - 2), m.index)))
        .map((m) => Number(m[1]))
        .filter((n) => n >= 1 && n <= picked.length);
      const fact = line
        .replace(/\s*[[(]\s*P\d{1,2}(?:\s*,\s*P?\d{1,2})*\s*[\])]/gi, '')
        .replace(/^(?:[-*•]|\d{1,2}[.)])\s+/, '')
        .trim();
      if (tags.length === 0 || fact.length < 15) { out.factsDropped++; continue; }
      lines.push(`- ${fact}`);
      for (const n of tags) {
        const h = picked[n - 1];
        let domain: string | undefined;
        try { domain = new URL(h.link).hostname.replace(/^www\./, ''); } catch { /* keep */ }
        const page = pages.get(n) || { uri: h.link, title: h.title, domain, origin: 'open_search' as const, supports: [] };
        page.supports!.push(fact);
        pages.set(n, page);
      }
    }
    out.factsKept = lines.length;
    out.content = lines.join('\n');
    out.pages = Array.from(pages.values());
    if (lines.length === 0) out.error = 'no local facts on the pages read';
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  return out;
}
