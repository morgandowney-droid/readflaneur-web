/**
 * Deterministic source check: does the page a story cites say what the story
 * says?
 *
 * For a story and one source URL: fetch the page, reduce it to readable text,
 * pull the checkable facts out of the story (figures, dates, times, proper
 * names, the story's own subject) and look for each in the page. No model is
 * called at any step, so the check cannot be talked into a verdict.
 *
 * Verdicts:
 *  - verified: every fact found, or the subject plus at least 60% of facts
 *  - partial: some facts found
 *  - not_found: page read, no fact found
 *  - fetch_failed: the page could not be read (status, timeout, not HTML)
 *  - no_source: the story has no URL to check
 *  - unverifiable_origin: the URL appears in no search tool's metadata, only
 *    in the model's own JSON (set by the caller from source.origin)
 *
 * Used in shadow by the shadow-source-checks cron. Nothing here writes.
 */

import { createHash } from 'node:crypto';
import { foldText, foldTokens, FUNCTION_WORDS } from './fold-text';
import { X_STATUS, readXPost } from './grok-citations';

export type CheckVerdict = 'verified' | 'partial' | 'not_found' | 'fetch_failed' | 'no_source' | 'unverifiable_origin';

export type FactKind = 'entity' | 'name' | 'number' | 'date' | 'time';

export interface Fact {
  kind: FactKind;
  /** As written in the story. */
  text: string;
  /** Comparable keys; the fact is found when the page has any of them. */
  keys: string[];
  /** Name facts: tokens that must all appear close together. */
  tokens?: string[];
}

export interface FactResult extends Fact {
  found: boolean;
}

export interface PageText {
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  contentType: string | null;
  html: string | null;
  text: string | null;
  bytes: number;
  truncated: boolean;
  error?: string;
}

export const SOURCE_CHECK_USER_AGENT = 'FlaneurSourceCheck/1.0 (+https://readflaneur.com/standards; source verification)';
const MAX_BYTES = 1_500_000;

// ─── Fetch and extract ─────────────────────────────────────────────────────

/** Read a page with a timeout and a byte cap. Never throws. */
export async function fetchPage(url: string, timeoutMs = 8000): Promise<PageText> {
  const empty: PageText = { ok: false, status: null, finalUrl: null, contentType: null, html: null, text: null, bytes: 0, truncated: false };

  // x.com serves a script shell with no post text. Read the post's public
  // record instead; the archive keeps that JSON as the snapshot.
  const xId = url.match(X_STATUS)?.[2];
  if (xId) {
    const post = await readXPost(xId, Math.min(timeoutMs, 8000));
    if (!post) return { ...empty, finalUrl: url, error: 'x post unreadable' };
    const text = [
      post.handle ? `@${post.handle}${post.name ? ` (${post.name})` : ''}` : '',
      post.text,
      post.quotedText || '',
      post.createdAt ? post.createdAt.slice(0, 10) : '',
    ].filter(Boolean).join('\n');
    return {
      ok: true, status: post.status, finalUrl: url, contentType: 'application/json',
      html: post.raw, text, bytes: post.raw.length, truncated: false,
    };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': SOURCE_CHECK_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en,de;q=0.8,it;q=0.8,es;q=0.8,fr;q=0.8,pt;q=0.7',
      },
    });
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
  const contentType = res.headers.get('content-type');
  const base = { ...empty, status: res.status, finalUrl: res.url || url, contentType };
  if (!res.ok) return { ...base, error: `HTTP ${res.status}` };
  if (contentType && !/text\/html|application\/xhtml|text\/plain|application\/xml|text\/xml/i.test(contentType)) {
    try { await res.body?.cancel(); } catch { /* ignore */ }
    return { ...base, error: `unsupported content-type ${contentType.split(';')[0]}` };
  }

  // Read up to MAX_BYTES.
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  try {
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        if (bytes + value.length > MAX_BYTES) {
          chunks.push(value.slice(0, MAX_BYTES - bytes));
          bytes = MAX_BYTES;
          truncated = true;
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
        chunks.push(value);
        bytes += value.length;
      }
    }
  } catch (err) {
    if (bytes === 0) return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
  const buf = new Uint8Array(bytes);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }

  const html = decode(buf, contentType);
  const text = /text\/plain/i.test(contentType || '') ? collapse(html) : htmlToText(html);
  return { ...base, ok: true, html, text, bytes, truncated };
}

function decode(buf: Uint8Array, contentType: string | null): string {
  let charset = (contentType || '').match(/charset=([^;\s]+)/i)?.[1];
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 4096));
    charset = head.match(/<meta[^>]+charset=["']?([a-z0-9_-]+)/i)?.[1];
  }
  try {
    return new TextDecoder((charset || 'utf-8').toLowerCase().replace(/^utf8$/, 'utf-8')).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...',
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', euro: '€', pound: '£', eacute: 'é', egrave: 'è',
  agrave: 'à', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', ccedil: 'ç', uuml: 'ü',
  ouml: 'ö', auml: 'ä', szlig: 'ß', Uuml: 'Ü', Ouml: 'Ö', Auml: 'Ä', ograve: 'ò', ugrave: 'ù', igrave: 'ì',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n] ?? NAMED_ENTITIES[n.toLowerCase()] ?? m);
}

function safeChar(code: number): string {
  try { return String.fromCodePoint(code); } catch { return ' '; }
}

function collapse(s: string): string {
  return s.replace(/[ \t\f\v\u00a0]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

/** Every string value in a JSON-LD block (event dates and venues often live only here). */
function jsonLdStrings(json: string): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') { if (v.length < 2000) out.push(v); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  try { walk(JSON.parse(json)); } catch { /* ignore malformed */ }
  return out;
}

/**
 * Readable text from HTML: title, meta descriptions and JSON-LD first (pages
 * that render client-side often carry their facts only there), then the body
 * with script, style, nav and similar chrome removed.
 */
export function htmlToText(html: string): string {
  const parts: string[] = [];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) parts.push(title);
  for (const m of html.matchAll(/<meta\s+[^>]*(?:name|property)=["'](?:description|og:description|og:title|twitter:description|article:published_time)["'][^>]*>/gi)) {
    const c = m[0].match(/content=["']([^"']*)["']/i)?.[1];
    if (c) parts.push(c);
  }
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    parts.push(...jsonLdStrings(m[1]));
  }
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|nav|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/td|\/th|\/dd|\/dt)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  parts.push(body);
  return collapse(decodeEntities(parts.join('\n')));
}

export function contentHash(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function urlSha1(url: string): string {
  return createHash('sha1').update(url).digest('hex');
}

// ─── Dates and times ───────────────────────────────────────────────────────

/** Month names and abbreviations in the languages the editions search in. */
const MONTHS: Record<string, number> = {};
const MONTH_NAMES: Array<[number, string[]]> = [
  [1, ['january', 'jan', 'januar', 'jaenner', 'janner', 'gennaio', 'genn', 'gen', 'enero', 'ene', 'janvier', 'janv', 'janeiro']],
  [2, ['february', 'feb', 'februar', 'febbraio', 'febrero', 'fevrier', 'fevr', 'fev', 'fevereiro']],
  [3, ['march', 'mar', 'marz', 'maerz', 'marzo', 'mars', 'marco']],
  [4, ['april', 'apr', 'aprile', 'abril', 'abr', 'avril', 'avr']],
  [5, ['may', 'mai', 'maggio', 'mag', 'mayo', 'maio']],
  [6, ['june', 'jun', 'juni', 'giugno', 'giu', 'junio', 'juin', 'junho']],
  [7, ['july', 'jul', 'juli', 'luglio', 'lug', 'julio', 'juillet', 'juil', 'julho']],
  [8, ['august', 'aug', 'agosto', 'ago', 'aout']],
  [9, ['september', 'sept', 'sep', 'settembre', 'sett', 'septiembre', 'setiembre', 'septembre', 'setembro']],
  [10, ['october', 'oct', 'oktober', 'okt', 'ottobre', 'ott', 'octubre', 'octobre', 'outubro']],
  [11, ['november', 'nov', 'novembre', 'noviembre', 'novembro']],
  [12, ['december', 'dec', 'dezember', 'dez', 'dicembre', 'dic', 'diciembre', 'decembre', 'dezembro']],
];
for (const [n, names] of MONTH_NAMES) for (const name of names) MONTHS[name] = n;
const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const DAY = '([0-3]?\\d)(?:st|nd|rd|th|er|º|°)?';
// "25 September", "25. September", "25 de septiembre", "25 settembre"
const RE_DAY_MONTH = new RegExp(`(?<![\\d])${DAY}\\.?\\s*(?:de\\s+|of\\s+)?(${MONTH_ALT})\\.?(?![a-z])`, 'g');
// "September 25", "Sept. 25", "sept 25th"
const RE_MONTH_DAY = new RegExp(`(?<![a-z])(${MONTH_ALT})\\.?\\s+${DAY}(?![\\d])`, 'g');
// 2026-09-25
const RE_ISO = /(?<!\d)(20\d\d)-(\d{1,2})-(\d{1,2})(?!\d)/g;
// 25/09/2026, 25.09.2026, 25.09., 25/9
const RE_NUMERIC = /(?<![\d.,/])([0-3]?\d)([./])([01]?\d)(?:\2((?:20)?\d\d))?(?![\d/])/g;

function dayMonthKey(day: number, month: number): string | null {
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  return `${month}-${day}`;
}

/** Every (month, day) mentioned in text, as "m-d" keys, with the span each came from. */
export function extractDates(text: string): Array<{ key: string; text: string; index: number; length: number }> {
  const folded = foldForDates(text);
  const out: Array<{ key: string; text: string; index: number; length: number }> = [];
  const push = (key: string | null, m: RegExpMatchArray) => {
    if (!key || typeof m.index !== 'number') return;
    out.push({ key, text: m[0].trim(), index: m.index, length: m[0].length });
  };
  for (const m of folded.matchAll(RE_DAY_MONTH)) push(dayMonthKey(Number(m[1]), MONTHS[m[2]]), m);
  for (const m of folded.matchAll(RE_MONTH_DAY)) push(dayMonthKey(Number(m[2]), MONTHS[m[1]]), m);
  for (const m of folded.matchAll(RE_ISO)) push(dayMonthKey(Number(m[3]), Number(m[2])), m);
  for (const m of folded.matchAll(RE_NUMERIC)) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    // A bare "3.5" is a decimal, not a date: require a year, a trailing dot
    // (German "25.09."), or a slash.
    const trailingDot = m[2] === '.' && folded[(m.index ?? 0) + m[0].length] === '.';
    if (!m[4] && m[2] === '.' && !trailingDot) continue;
    // Day-first everywhere; month-first only when day-first is impossible.
    push(dayMonthKey(a, b) ?? dayMonthKey(b, a), m);
  }
  // A date written two ways at one position counts once.
  const seen = new Set<string>();
  return out.filter(d => { const k = `${d.index}:${d.key}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Lowercase and strip accents but keep punctuation and positions stable. */
function foldForDates(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Every clock time in text, as minutes after midnight, with spans. */
export function extractTimes(text: string): Array<{ key: string; text: string; index: number; length: number }> {
  const t = foldForDates(text);
  const out: Array<{ key: string; text: string; index: number; length: number }> = [];
  const push = (h: number, min: number, m: RegExpMatchArray) => {
    if (h > 23 || min > 59 || typeof m.index !== 'number') return;
    out.push({ key: `t${h * 60 + min}`, text: m[0].trim(), index: m.index, length: m[0].length });
  };
  // 8:30 pm, 8.30pm, 8 pm, 8pm, 8 p.m.
  const ampmSpans: Array<[number, number]> = [];
  for (const m of t.matchAll(/(?<![\d:.])(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s?m\b\.?/g)) {
    let h = Number(m[1]) % 12;
    if (m[3] === 'p') h += 12;
    push(h, Number(m[2] || 0), m);
    if (typeof m.index === 'number') ampmSpans.push([m.index, m.index + m[0].length]);
  }
  // A 24-hour reading inside "6:30 pm" is not a second time.
  const inAmPm = (m: RegExpMatchArray) => typeof m.index === 'number' && ampmSpans.some(([a, b]) => m.index! >= a && m.index! < b);
  const push24 = (h: number, min: number, m: RegExpMatchArray) => { if (!inAmPm(m)) push(h, min, m); };
  // 20:30, 20h30, 20.30 uhr, ore 20.30, 19 uhr, 19h
  for (const m of t.matchAll(/(?<![\d:.,])([01]?\d|2[0-3])(?::|h)([0-5]\d)(?![\d])/g)) push24(Number(m[1]), Number(m[2]), m);
  for (const m of t.matchAll(/(?<![\d:.,])([01]?\d|2[0-3])\.([0-5]\d)\s*(?:uhr|h\b|hrs?\b|horas?\b)/g)) push24(Number(m[1]), Number(m[2]), m);
  for (const m of t.matchAll(/(?:\bore|\balle|\bum|\ba las|\bas|\bàs)\s+([01]?\d|2[0-3])[.:]([0-5]\d)(?![\d])/g)) push24(Number(m[1]), Number(m[2]), m);
  for (const m of t.matchAll(/(?<![\d:.,])([01]?\d|2[0-3])\s*(?:uhr\b|h\b(?![0-9]))/g)) push24(Number(m[1]), 0, m);
  const seen = new Set<string>();
  return out.filter(x => { const k = `${x.index}:${x.key}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ─── Numbers ───────────────────────────────────────────────────────────────

/**
 * Candidate values for one written number. "1,000" and "1.000" and "1 000"
 * are 1000; "3,5" and "3.5" are 3.5; "1.000" could also be 1 in English,
 * so ambiguous forms carry both readings.
 */
export function numberValues(raw: string): string[] {
  const s = raw.replace(/[\s\u00a0\u202f']/g, '');
  const vals = new Set<string>();
  const add = (n: number) => { if (Number.isFinite(n)) vals.add(String(Math.round(n * 1000) / 1000)); };
  if (/^\d+$/.test(s)) { add(Number(s)); return [...vals]; }
  // Exactly three digits after every separator is thousands grouping in every
  // language the editions use ("1,000", "1.000"); reading it as a decimal
  // would let "1,000" match any page that says "1".
  const grouped = (sep: string) => new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(s);
  if (grouped(',')) { add(Number(s.replace(/,/g, ''))); return [...vals]; }
  if (grouped('.')) { add(Number(s.replace(/\./g, ''))); return [...vals]; }
  // 1,234.56 / 1.234,56
  if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) add(Number(s.replace(/,/g, '')));
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) add(Number(s.replace(/\./g, '').replace(',', '.')));
  // Plain decimals either way
  if (/^\d+[.,]\d+$/.test(s)) add(Number(s.replace(',', '.')));
  return [...vals];
}

const RE_NUMBER = /(?<![\p{L}\d.,])(\d{1,3}(?:[.,\u00a0\u202f ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?![\d])(\s?(?:%|per ?cent|prozent|por ?ciento|percento))?/gu;

export function extractNumbers(text: string): Array<{ values: string[]; text: string; index: number; length: number; percent: boolean; currency: boolean }> {
  const out: Array<{ values: string[]; text: string; index: number; length: number; percent: boolean; currency: boolean }> = [];
  for (const m of text.matchAll(RE_NUMBER)) {
    if (typeof m.index !== 'number') continue;
    const before = text.slice(Math.max(0, m.index - 4), m.index);
    const currency = /[$€£¥]|\b(?:eur|usd|gbp|chf|sek|cad|aud|nzd|r)\s?$/i.test(before);
    out.push({ values: numberValues(m[1]), text: m[0].trim(), index: m.index, length: m[0].length, percent: !!m[2], currency });
  }
  return out;
}

// ─── Names ─────────────────────────────────────────────────────────────────

/** Capitalised words that start sentences or name dates, not things. */
const NOT_NAME_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'its', 'on', 'in', 'at', 'for', 'and', 'but', 'or', 'with',
  'from', 'after', 'before', 'while', 'when', 'where', 'if', 'as', 'by', 'to', 'of', 'expect', 'catch', 'look', 'head',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'today', 'tomorrow', 'tonight',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'good', 'morning', 'meanwhile', 'plus', 'also', 'there', 'here', 'you', 'we', 'our', 'your', 'they', 'their',
]);

/** Generic institution words, dropped from a name's required tokens when a page may name it in another language. */
const GENERIC_NAME_WORDS = new Set([
  'museum', 'gallery', 'theatre', 'theater', 'church', 'council', 'street', 'square', 'market', 'festival',
  'exhibition', 'hall', 'center', 'centre', 'park', 'library', 'school', 'club', 'hotel', 'restaurant', 'cafe',
  'bar', 'station', 'bridge', 'road', 'avenue', 'lane', 'house', 'building', 'foundation', 'society', 'association',
  'orchestra', 'choir', 'band', 'shop', 'store', 'office', 'university', 'college', 'hospital', 'city', 'town',
]);
const CONNECTORS = new Set(['of', 'de', 'del', 'della', 'di', 'da', 'dos', 'das', 'do', 'la', 'le', 'les', 'du', 'des', 'von', 'van', 'der', 'den', 'am', 'im', 'an', 'and', '&', 'y', 'e', 'et', 'st', 'st.', 'san', 'santa', 'sankt']);

/** Required tokens for a name: folded, function and generic words removed. */
export function nameTokens(name: string, placeTokens: Set<string> = new Set()): string[] {
  const toks = foldTokens(name).filter(t => !FUNCTION_WORDS.has(t) && !CONNECTORS.has(t));
  const specific = toks.filter(t => !GENERIC_NAME_WORDS.has(t) && !placeTokens.has(t));
  // Keep generic words only when nothing specific is left ("Town Hall").
  return (specific.length > 0 ? specific : toks.filter(t => !placeTokens.has(t))).filter((t, i, a) => a.indexOf(t) === i);
}

/** Runs of two or more capitalised words (with connectors) in the story text. */
export function extractNames(text: string): string[] {
  const clean = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const words = clean.split(/(\s+|[,;:()"“”!?]|\.\s)/);
  const names: string[] = [];
  let run: string[] = [];
  const flush = () => {
    while (run.length && CONNECTORS.has(run[run.length - 1].toLowerCase())) run.pop();
    while (run.length && NOT_NAME_WORDS.has(run[0].toLowerCase())) run.shift();
    const caps = run.filter(w => /^\p{Lu}/u.test(w));
    if (caps.length >= 2) names.push(run.join(' '));
    run = [];
  };
  for (const w of words) {
    if (!w || /^\s+$/.test(w)) continue;
    if (/^[,;:()"“”!?]$/.test(w) || /^\.\s$/.test(w)) { flush(); continue; }
    const bare = w.replace(/[.'’]$/, '');
    if (/^\p{Lu}[\p{L}'’&-]*$/u.test(bare) || /^\d+\p{L}*$/u.test(bare) && run.length > 0) run.push(bare);
    else if (run.length > 0 && CONNECTORS.has(bare.toLowerCase())) run.push(bare);
    else flush();
  }
  flush();
  return [...new Set(names)];
}

// ─── Fact extraction ───────────────────────────────────────────────────────

const YEAR = /^(19|20)\d\d$/;

export interface StoryInput {
  entity?: string | null;
  context?: string | null;
}

/**
 * The checkable facts in a story. Dates and times are taken first and their
 * text removed, so "September 25" is a date and not the number 25. Bare small
 * integers (under 10) and years are too common to prove anything and are
 * skipped; percentages and prices are kept whatever their size.
 */
export function extractFacts(story: StoryInput, placeNames: string[] = []): Fact[] {
  const entity = (story.entity || '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const context = (story.context || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const placeTokens = new Set(placeNames.flatMap(p => foldTokens(p)));
  const facts: Fact[] = [];
  const seenKeys = new Set<string>();
  const addFact = (f: Fact) => {
    const sig = `${f.kind}:${[...(f.tokens || f.keys)].sort().join('|')}`;
    if (seenKeys.has(sig)) return;
    seenKeys.add(sig);
    facts.push(f);
  };

  if (entity) {
    const toks = nameTokens(entity, placeTokens).filter(t => !DESCRIPTIVE.has(t));
    if (toks.length > 0) addFact({ kind: 'entity', text: entity, keys: [foldText(entity)], tokens: toks });
  }

  // Dates, times and numbers are read from a folded copy so spans line up.
  let text = foldForDates(`${entity}. ${context}`);
  const blank = (spans: Array<{ index: number; length: number }>) => {
    const chars = text.split('');
    for (const s of spans) for (let i = s.index; i < s.index + s.length && i < chars.length; i++) chars[i] = ' ';
    text = chars.join('');
  };

  const dates = extractDates(text);
  for (const d of dates) addFact({ kind: 'date', text: d.text, keys: [d.key] });
  blank(dates);
  const times = extractTimes(text);
  for (const t of times) addFact({ kind: 'time', text: t.text, keys: [t.key] });
  blank(times);

  for (const n of extractNumbers(text)) {
    if (n.values.length === 0) continue;
    const v = Number(n.values[0]);
    if (!n.percent && !n.currency && (YEAR.test(n.values[0]) || (Number.isInteger(v) && v < 10))) continue;
    addFact({ kind: 'number', text: n.text, keys: n.values.map(x => `n${x}`) });
  }

  const entityFolded = foldText(entity);
  for (const name of extractNames(context)) {
    const f = foldText(name);
    if (!f || f === entityFolded) continue;
    const toks = nameTokens(name, placeTokens);
    if (toks.length === 0) continue;
    // Place names prove nothing about a local page.
    if (toks.every(t => placeTokens.has(t))) continue;
    addFact({ kind: 'name', text: name, keys: [f], tokens: toks });
  }
  return facts;
}

/** Words that describe a story rather than name its subject ("Lymington House Prices"). */
const DESCRIPTIVE = new Set([
  'expansion', 'award', 'awards', 'update', 'updates', 'news', 'event', 'events', 'opening', 'openings', 'closing', 'closure',
  'reopening', 'season', 'price', 'prices', 'rent', 'rental', 'rents', 'hours', 'plan', 'plans', 'project', 'proposal',
  'meeting', 'exhibition', 'show', 'launch', 'sale', 'sales', 'report', 'week', 'weekend', 'returns', 'return', 'series',
  'programme', 'program', 'schedule', 'listings', 'listing', 'local', 'new', 'latest', 'upcoming', 'annual', 'free',
  'public', 'community', 'shopping', 'property', 'properties', 'market',
]);

// ─── Matching ──────────────────────────────────────────────────────────────

export interface PageIndex {
  folded: string;
  tokens: string[];
  positions: Map<string, number[]>;
  dateKeys: Set<string>;
  timeKeys: Set<string>;
  numberKeys: Set<string>;
}

export function indexPage(text: string): PageIndex {
  const folded = foldText(text);
  const tokens = folded ? folded.split(' ') : [];
  const positions = new Map<string, number[]>();
  tokens.forEach((t, i) => {
    const p = positions.get(t);
    if (p) p.push(i); else positions.set(t, [i]);
  });
  const dateKeys = new Set(extractDates(text).map(d => d.key));
  const timeKeys = new Set(extractTimes(text).map(t => t.key));
  const numberKeys = new Set<string>();
  for (const n of extractNumbers(text)) for (const v of n.values) numberKeys.add(`n${v}`);
  return { folded, tokens, positions, dateKeys, timeKeys, numberKeys };
}

/** All tokens within `window` words of one another somewhere in the page. */
function tokensNear(page: PageIndex, toks: string[], window = 8): boolean {
  if (toks.length === 0) return false;
  const lists = toks.map(t => page.positions.get(t) || []);
  if (lists.some(l => l.length === 0)) return false;
  if (toks.length === 1) return true;
  const [first, ...rest] = lists;
  return first.some(p => rest.every(l => l.some(q => Math.abs(q - p) <= window)));
}

export function factFound(fact: Fact, page: PageIndex): boolean {
  switch (fact.kind) {
    case 'date': return fact.keys.some(k => page.dateKeys.has(k));
    case 'time': return fact.keys.some(k => page.timeKeys.has(k));
    case 'number': return fact.keys.some(k => page.numberKeys.has(k));
    case 'entity':
    case 'name': {
      if (fact.keys.some(k => k.length >= 4 && ` ${page.folded} `.includes(` ${k} `))) return true;
      return tokensNear(page, fact.tokens || []);
    }
  }
}

export interface CheckResult {
  verdict: CheckVerdict;
  factsTotal: number;
  factsFound: number;
  facts: FactResult[];
  missing: Array<{ kind: FactKind; text: string }>;
}

/** Apply the verdict rule to a story's facts against one page's text. */
export function checkStoryAgainstText(story: StoryInput, pageText: string, placeNames: string[] = []): CheckResult {
  const facts = extractFacts(story, placeNames);
  const page = indexPage(pageText);
  const results: FactResult[] = facts.map(f => ({ ...f, found: factFound(f, page) }));
  const found = results.filter(r => r.found).length;
  const entity = results.find(r => r.kind === 'entity');
  let verdict: CheckVerdict;
  if (results.length === 0) verdict = 'partial';
  else if (found === results.length) verdict = 'verified';
  else if (entity?.found && found / results.length >= 0.6) verdict = 'verified';
  else if (found > 0) verdict = 'partial';
  else verdict = 'not_found';
  return {
    verdict,
    factsTotal: results.length,
    factsFound: found,
    facts: results,
    missing: results.filter(r => !r.found).map(r => ({ kind: r.kind, text: r.text })),
  };
}

/** Fetch and check. `page` may be passed in when the URL was already fetched this run. */
export async function checkStorySource(
  story: StoryInput,
  url: string | null | undefined,
  opts: { placeNames?: string[]; page?: PageText; timeoutMs?: number } = {},
): Promise<CheckResult & { page: PageText | null }> {
  if (!url) return { verdict: 'no_source', factsTotal: 0, factsFound: 0, facts: [], missing: [], page: null };
  const page = opts.page ?? await fetchPage(url, opts.timeoutMs);
  if (!page.ok || !page.text) {
    const facts = extractFacts(story, opts.placeNames);
    return {
      verdict: 'fetch_failed', factsTotal: facts.length, factsFound: 0,
      facts: facts.map(f => ({ ...f, found: false })),
      missing: facts.map(f => ({ kind: f.kind, text: f.text })),
      page,
    };
  }
  return { ...checkStoryAgainstText(story, page.text, opts.placeNames), page };
}
