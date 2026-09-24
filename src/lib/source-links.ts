/**
 * Source link hygiene shared by enrichment, article creation, the auto-fixer
 * and the syndication API.
 *
 * Three problems this fixes (found 2026-09-09 when PA/AP-side readers looked at
 * the county pages on yous.news):
 *
 * 1. Placeholder "sources" leaking as if they were publications: Gemini labels
 *    a story that came from the supplied facts as "User provided content", and
 *    our own fallbacks insert "X (Twitter)" / "Google News" platform rows.
 *    None of these is a checkable source and none should be stored or shown.
 *
 * 2. Gemini Google-Search grounding gives source URLs on the
 *    vertexaisearch.cloud.google.com/grounding-api-redirect/... host. They 302
 *    to the real page for a week or two and then 404. Resolve them to the
 *    final URL at generation time; never store the redirect.
 *
 * 3. Gemini often names a source but omits its URL. The same response carries
 *    groundingMetadata.groundingChunks with the pages it actually read (uri +
 *    title + domain). Match name-only sources against those to attach a URL.
 */

import { foldText, foldTokens, FUNCTION_WORDS, tokenStem } from './fold-text';

export interface GroundingChunk {
  uri: string;
  title?: string;
  domain?: string;
  /**
   * The passages of the model's own answer that this page grounded
   * (groundingMetadata.groundingSupports), or the line of gathered facts a URL
   * appeared on. This is what lets a story be tied to the page that backs it
   * without asking a model which page that was.
   */
  supports?: string[];
  /** Where the page came from: enrichment grounding, the fact search, a URL in the facts, a Grok citation. */
  origin?: 'enrichment' | 'gemini_search' | 'facts_url' | 'grok' | 'repair';
}

/**
 * How a story's source URL was established.
 *  - tool: the URL is one a search tool returned (grounding chunk, Grok
 *    citation) or appeared in the gathered facts.
 *  - name-match: the model named the source; the URL was attached from a read
 *    page whose domain or title matches that name.
 *  - story-match: the story had no source; the URL is a read page whose
 *    grounded passage names the story (matchStoryToPages).
 *  - repair: the story named a publication but no page was traced; one bounded
 *    search found a page on that publication's own host, and the deterministic
 *    fact check (source-check.ts) found the story on it (source-repair.ts).
 *  - model: the URL appears only in the model's own JSON, in no tool metadata.
 *    Only briefs enriched before 2026-09-24 carry it: since then an untraced
 *    URL is dropped at enrichment (cleanStorySources with `traced`), and every
 *    read boundary withholds a 'model' URL (publishableSourceUrl).
 */
export type SourceOrigin = 'tool' | 'name-match' | 'story-match' | 'repair' | 'model';

export interface SourceRef {
  name: string;
  url?: string | null;
  origin?: SourceOrigin;
}

/**
 * The URL a reader may be shown for a source, or null. A URL with origin
 * 'model' was written by the enrichment model and appears in no tool's
 * metadata; 60 of 109 such URLs measured on 2026-09-24 were 404 or 410. It is
 * never published, including on briefs enriched before the enricher learned to
 * drop it.
 */
export function publishableSourceUrl(ref: { url?: string | null; origin?: string } | null | undefined): string | null {
  if (!ref || ref.origin === 'model') return null;
  return isHttpUrl(ref.url) ? ref.url.trim() : null;
}

/**
 * A copy of enriched_categories fit to leave the building: 'model' URLs
 * removed and the shadow-only droppedModelUrl field stripped. For the
 * syndication and licensee boundaries, which pass categories through whole.
 */
export function publishableCategories(categories: unknown): unknown {
  if (!Array.isArray(categories)) return categories;
  return categories.map((c) => {
    if (!c || typeof c !== 'object' || !Array.isArray((c as { stories?: unknown }).stories)) return c;
    const cat = c as { stories: Array<Record<string, unknown>> };
    return {
      ...cat,
      stories: cat.stories.map((s) => {
        if (!s || typeof s !== 'object') return s;
        const { droppedModelUrl: _dropped, ...rest } = s as Record<string, unknown> & { droppedModelUrl?: unknown };
        void _dropped;
        for (const key of ['source', 'secondarySource'] as const) {
          const ref = rest[key] as SourceRef | null | undefined;
          if (ref && ref.origin === 'model') rest[key] = { ...ref, url: null };
        }
        return rest;
      }),
    };
  });
}

const PLACEHOLDER_SOURCE_PATTERNS: RegExp[] = [
  /^user[\s-]*provided/i,
  /provided (content|context|information|data)/i,
  // Generic descriptions of where copy came from, rather than a publication.
  // The old pattern was anchored with room for one word only, so it caught
  // "Event Listing" and missed "Local Event Listing"; "Local News Compilation"
  // matched nothing at all. Both reached a published Newfoundland edition on
  // 2026-09-18, on pages shown to an agency whose stated objection is that this
  // looks like aggregation. A name like that proves their point for them.
  /^(local|regional|community|area|city|town)?\s*(news|event|events|media|press)?\s*(listings?|compilation|round-?up|digest|summary|aggregation|sources?)$/i,
  /^(local|regional|community) (news|media|press)$/i,
  /^listings?$/i,
  /^various( sources)?$/i,
  /^multiple sources$/i,
  /^n\/?a$/i,
  /^unknown( source)?$/i,
  /^none$/i,
  /^sources?$/i,
  /^x \(twitter\)$/i,
  /^google news$/i,
  /^google search$/i,
  /^web search$/i,
  /^search results?$/i,
  /^internal( source)?$/i,
  // "Internal Summary" and "Real Estate Listing" reached Newfoundland editions
  // shown to the Canadian Press on 2026-09-20 and 21. Neither is a publication.
  /^internal\s+(summary|notes?|data|research|compilation)$/i,
  /^(real estate|property|housing|rental|job|jobs|classified)\s+(listings?|ads?)$/i,
  // "Not listed" reached a Milan Look Ahead on 2026-09-23 as a source with no
  // URL; it is the model's answer for an unknown venue, not a publication.
  /^(not listed|not specified|not available|n\/a|none|tbd|tba)$/i,
  // "Local Market Data" was the only source on a Madrid brief on 2026-09-23,
  // found building the licensee feed. It names a kind of data, not a publisher.
  /^(local|regional|city|area)?\s*(market|property|price|sales)\s+(data|figures|statistics|stats|reports?)$/i,
  // Labels Gemini Pro gives a story it took from the supplied facts rather
  // than from a page it read. Counted on 2026-09-23 across 700 Pro-enriched
  // briefs: "Provided Context", "Internal Note", "Self-reported", "Local News
  // Researcher Notes", "Implicit", "Source Material" and the like. None names a
  // publication; each now gets a real page by story matching or stays empty.
  /^internal\s+(tips?|source(s|\s+document)?|briefing)$/i,
  /^self[- ]?reported$/i,
  /^implicit$/i,
  /^source material$/i,
  /^recent coverage( context)?$/i,
  /^local\s+(news\s+)?(researcher|research)(\s+notes)?$/i,
  /^local\s+(news\s+)?(input|accounts?|reports?|updates?|briefing|journalism|newswire|aggregator|tips?)$/i,
  /^(official|local)\s+(institutional\s+sources?|event\s+calendars?|events?\s+calendars?)$/i,
  /^events?\s+calendars?$/i,
  /^ai[- ]generated/i,
  /^grok/i,
  /^gemini/i,
  /^press release$/i,
  /^social media$/i,
];

/** True for names that are not a checkable publication, site or account. */
export function isPlaceholderSourceName(name: string | null | undefined): boolean {
  if (!name) return true;
  const n = name.trim();
  if (n.length < 2) return true;
  return PLACEHOLDER_SOURCE_PATTERNS.some(p => p.test(n));
}

const GROUNDING_REDIRECT_RE = /^https?:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//i;

export function isGroundingRedirect(url: string | null | undefined): boolean {
  return !!url && GROUNDING_REDIRECT_RE.test(url);
}

export function isHttpUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\/\S+$/i.test(url.trim());
}

/** In-process cache so the same redirect is never resolved twice in one run. */
const redirectCache = new Map<string, string | null>();

/**
 * Follow a grounding redirect to its final URL. Returns null when the redirect
 * is dead (404), times out, or lands on another Google host. Never throws.
 */
export async function resolveGroundingRedirect(url: string, timeoutMs = 6000): Promise<string | null> {
  if (!isGroundingRedirect(url)) return isHttpUrl(url) ? url : null;
  if (redirectCache.has(url)) return redirectCache.get(url) ?? null;

  let resolved: string | null = null;
  try {
    // The redirect host answers HEAD with a 302 + Location in under a second.
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const loc = res.headers.get('location');
    if (loc && isHttpUrl(loc) && !/google\.com|googleusercontent\.com|vertexaisearch/i.test(new URL(loc).hostname)) {
      resolved = loc;
    }
  } catch {
    resolved = null;
  }
  redirectCache.set(url, resolved);
  return resolved;
}

type GroundingMetadataLike = {
  groundingChunks?: Array<{ web?: { uri?: string; title?: string; domain?: string } }>;
  groundingSupports?: Array<{ segment?: { text?: string }; groundingChunkIndices?: number[] }>;
};

/** Longest passage kept per support, and most passages kept per page. */
const MAX_SUPPORT_CHARS = 400;
const MAX_SUPPORTS_PER_PAGE = 8;

function addSupport(chunk: GroundingChunk, text: string): void {
  const t = text.replace(/\s+/g, ' ').trim().slice(0, MAX_SUPPORT_CHARS);
  if (t.length < 8) return;
  chunk.supports = chunk.supports || [];
  if (chunk.supports.length >= MAX_SUPPORTS_PER_PAGE || chunk.supports.includes(t)) return;
  chunk.supports.push(t);
}

/**
 * Pull the grounding chunks out of a @google/genai GenerateContentResponse,
 * each with the passages of the answer it grounded (groundingSupports).
 */
export function extractGroundingChunks(response: unknown, origin?: GroundingChunk['origin']): GroundingChunk[] {
  const chunks: GroundingChunk[] = [];
  const candidates = (response as { candidates?: Array<{ groundingMetadata?: GroundingMetadataLike }> })?.candidates;
  const meta = candidates?.[0]?.groundingMetadata;
  const raw = meta?.groundingChunks || [];
  const byUri = new Map<string, GroundingChunk>();
  const byIndex: Array<GroundingChunk | undefined> = [];
  raw.forEach((c, i) => {
    const uri = c?.web?.uri;
    if (!isHttpUrl(uri)) return;
    let chunk = byUri.get(uri);
    if (!chunk) {
      chunk = { uri, title: c.web?.title, domain: c.web?.domain, ...(origin ? { origin } : {}) };
      byUri.set(uri, chunk);
      chunks.push(chunk);
    }
    byIndex[i] = chunk;
  });
  for (const sup of meta?.groundingSupports || []) {
    const text = sup?.segment?.text;
    if (!text) continue;
    for (const idx of sup.groundingChunkIndices || []) {
      const chunk = byIndex[idx];
      if (chunk) addSupport(chunk, text);
    }
  }
  return chunks;
}

/** Resolve every redirect chunk to its real URL, a few at a time. Drops dead ones. */
export async function resolveGroundingChunks(chunks: GroundingChunk[], concurrency = 6): Promise<GroundingChunk[]> {
  const out: GroundingChunk[] = [];
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async c => {
      const uri = await resolveGroundingRedirect(c.uri);
      if (!uri) return null;
      let domain = c.domain;
      try { domain = domain || new URL(uri).hostname.replace(/^www\./, ''); } catch { /* keep */ }
      return { ...c, uri, domain } as GroundingChunk;
    }));
    for (const r of results) {
      if (!r) continue;
      // Two redirects often land on the same page: keep one, with both sets of passages.
      const existing = out.find(o => o.uri === r.uri);
      if (existing) { for (const t of r.supports || []) addSupport(existing, t); }
      else out.push(r);
    }
  }
  return out;
}

const STOP_WORDS = new Set(['the', 'of', 'and', 'a', 'an', 'in', 'at', 'on', 'for', 'to', 'official', 'website', 'site', 'page', 'news', 'co', 'com', 'ie', 'uk', 'org', 'www']);

function significantWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Find the grounding chunk that a named source most plausibly refers to.
 * Two signals: the source name's letters run inside the chunk's domain
 * ("Visit Kilkenny" -> visitkilkenny.ie, "KCLR 96FM" -> kclr96fm.com), or
 * every significant word of the name appears in the chunk's title/domain.
 * Returns null rather than guess when neither signal is clear.
 */
export function matchSourceToChunk(name: string, chunks: GroundingChunk[]): GroundingChunk | null {
  if (!name || chunks.length === 0) return null;
  const compact = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const words = significantWords(name);
  if (compact.length < 4) return null;

  let best: { chunk: GroundingChunk; score: number } | null = null;
  for (const c of chunks) {
    let domain = c.domain || '';
    try { domain = domain || new URL(c.uri).hostname; } catch { /* ignore */ }
    const domainCompact = domain.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]/g, '');
    const domainRoot = domainCompact.replace(/(com|ie|couk|org|net|co|uk|eu|info|tv|fm)$/,'');
    const title = (c.title || '').toLowerCase();

    let score = 0;
    // Domain signal: the name compacts to the domain root or vice versa
    if (domainRoot.length >= 4 && (compact.includes(domainRoot) || domainRoot.includes(compact))) score += 3;
    // Title/domain word coverage
    if (words.length > 0) {
      const hay = `${title} ${domainCompact}`;
      const hits = words.filter(w => hay.includes(w)).length;
      if (hits === words.length) score += 2;
      else if (hits >= Math.ceil(words.length * 0.75) && words.length >= 2) score += 1;
    }
    if (score > (best?.score ?? 0)) best = { chunk: c, score };
  }
  return best && best.score >= 2 ? best.chunk : null;
}

/** Hostname of a URL without "www.", lowercased; '' when unparseable. */
export function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function foldAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * True when a page's host is plausibly the named publication's own site:
 * the name's letters run inside the host's registrable part or vice versa
 * ("Il Giorno" -> ilgiorno.it, "The Irish Times" -> irishtimes.com), or every
 * significant word of the name is in the host ("CBC News" -> cbc.ca). Page
 * titles are NOT consulted: a title can name any publication, the host is
 * the one thing a page cannot claim falsely. Used by the repair search.
 */
export function hostMatchesPublication(name: string | null | undefined, url: string): boolean {
  if (!name || isPlaceholderSourceName(name)) return false;
  const host = hostOf(url);
  if (!host) return false;
  const labels = host.split('.');
  // Drop the public suffix: the last label, and a second-level one like co.uk / com.au.
  const suffixLen = labels.length >= 3 && /^(co|com|org|net|gov|ac|gv|or|ne)$/.test(labels[labels.length - 2]) ? 2 : 1;
  const registrable = labels.slice(0, labels.length - suffixLen).filter(l => !/^(www|m|mobile|amp|www2)$/.test(l));
  const hostCompact = registrable.join('');
  const root = registrable[registrable.length - 1] || '';
  const compact = foldAccents(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (root.length >= 4 && compact.length >= 4 && (compact.includes(root) || root.includes(compact))) return true;
  const words = significantWords(foldAccents(name));
  if (words.length > 0 && words.every(w => hostCompact.includes(w))) return true;
  // Initials: "Vorarlberger Nachrichten" -> vn.at, "New York Times" -> nyt.com.
  return words.length >= 2 && root.length >= 2 && root === words.map(w => w[0]).join('');
}

// ─── Story-to-page matching ────────────────────────────────────────────────
//
// Why this exists (found 2026-09-23): a large share of stories reached
// enriched_categories with source: null. The facts a pilot edition runs on
// come almost entirely from the Gemini fact search ("ALSO NOTED"), which READ
// real pages through Google Search grounding, but searchNeighborhoodFacts kept
// only response.text and threw the grounding away, and Grok's citation URLs
// are stripped from the brief text. So the enrichment model got tips with no
// URLs, wrote the story from the tip, and labelled it "Provided Context" or
// "Internal Summary", which the placeholder filter then (correctly) nulled.
//
// The fix never asks a model for a source. A story gets a page only when the
// page was read by a search in this pipeline AND the passage it grounded (or
// the fact line the URL sat on) names the story's subject. Nothing clears
// that bar, nothing is attached.

/** Words that describe a story rather than name its subject. */
const DESCRIPTIVE_WORDS = new Set([
  'expansion', 'award', 'awards', 'update', 'updates', 'news', 'event', 'events', 'opening', 'openings', 'closing',
  'closure', 'reopening', 'season', 'price', 'prices', 'rent', 'rental', 'rents', 'hours', 'plan', 'plans', 'project',
  'proposal', 'meeting', 'exhibition', 'show', 'launch', 'sale', 'sales', 'market', 'report', 'week', 'weekend',
  'today', 'tomorrow', 'returns', 'return', 'announced', 'announcement', 'series', 'programme', 'program', 'schedule',
  'listings', 'listing', 'local', 'new', 'latest', 'upcoming', 'annual', 'free', 'public', 'community',
]);

const SOCIAL_HOST = /(^|[./])(facebook\.com|fb\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com|youtube\.com|linkedin\.com|reddit\.com|threads\.net)(\/|$)/i;

export interface StoryLike {
  entity?: string | null;
  context?: string | null;
}

export interface StoryPageMatch {
  chunk: GroundingChunk;
  score: number;
  /** The passage that tied the story to the page. */
  passage: string;
}

function tokenSet(text: string): Set<string> {
  return new Set(foldTokens(text).map(tokenStem));
}

/** Significant subject tokens of a story's entity, place names excluded. */
export function subjectTokens(entity: string, placeNames: string[] = []): string[] {
  const place = new Set(placeNames.flatMap(p => foldTokens(p)).map(tokenStem));
  const bare = entity.replace(/\s*\([^)]*\)\s*/g, ' ');
  const out: string[] = [];
  for (const t of foldTokens(bare)) {
    const s = tokenStem(t);
    if (t.length < 3 && !/^\d+$/.test(t)) continue;
    if (FUNCTION_WORDS.has(t) || DESCRIPTIVE_WORDS.has(t) || DESCRIPTIVE_WORDS.has(s) || place.has(s)) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Proper nouns and figures from a story's context, to confirm a match. */
function contextMarkers(context: string, exclude: Set<string>): Set<string> {
  const out = new Set<string>();
  const clean = context.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  for (const m of clean.matchAll(/(?<![\p{L}\p{N}])(\p{Lu}[\p{L}'’-]{2,}|\d[\d.,]*\d|\d{2,})/gu)) {
    for (const t of foldTokens(m[1])) {
      const s = tokenStem(t);
      if (t.length < 3 && !/^\d+$/.test(t)) continue;
      if (FUNCTION_WORDS.has(t) || exclude.has(s)) continue;
      out.add(s);
    }
  }
  return out;
}

/**
 * The page a story most plausibly rests on, from pages a search actually read.
 * A passage counts only if it names the story's subject: the entity as a
 * phrase, or every one of at least two subject tokens. A single-token subject
 * also needs a figure or proper noun from the story's context in the same
 * passage. Context markers break ties. Returns null rather than guess.
 */
export function matchStoryToPages(
  story: StoryLike,
  pages: GroundingChunk[],
  placeNames: string[] = [],
): StoryPageMatch | null {
  const entity = (story.entity || '').trim();
  if (!entity || pages.length === 0) return null;
  const subject = subjectTokens(entity, placeNames);
  if (subject.length === 0) return null;
  const phrase = foldText(entity.replace(/\s*\([^)]*\)\s*/g, ' '));
  const place = new Set(placeNames.flatMap(p => foldTokens(p)).map(tokenStem));
  const markers = contextMarkers(story.context || '', new Set([...subject, ...place]));

  let best: StoryPageMatch | null = null;
  for (const chunk of pages) {
    const passages = [...(chunk.supports || []), ...(chunk.title && /\s/.test(chunk.title) ? [chunk.title] : [])];
    for (const passage of passages) {
      const folded = foldText(passage);
      const toks = tokenSet(passage);
      const phraseHit = phrase.length >= 6 && ` ${folded} `.includes(` ${phrase} `);
      const allHit = subject.every(t => toks.has(t));
      let ctx = 0;
      markers.forEach(m => { if (toks.has(m)) ctx++; });
      let score = 0;
      if (phraseHit || (allHit && subject.length >= 2)) score = 2 + Math.min(ctx, 4) * 0.5;
      else if (allHit && subject.length === 1 && subject[0].length >= 5 && ctx >= 1) score = 2 + Math.min(ctx, 4) * 0.5 - 0.25;
      // On a tie, a publication's own page outranks a social post about it.
      if (score > 0 && !SOCIAL_HOST.test(chunk.domain || chunk.uri)) score += 0.1;
      if (score > (best?.score ?? 0)) best = { chunk, score, passage };
    }
  }
  return best && best.score >= 2 ? best : null;
}

/** A publication-style name for a page: its host, without "www.". */
export function sourceNameForPage(chunk: GroundingChunk): string {
  // An X post read from its own record carries the author's handle.
  if (chunk.title && /^@[A-Za-z0-9_]{1,30}$/.test(chunk.title)) return chunk.title;
  let host = (chunk.domain || '').replace(/^www\./, '');
  if (!host) {
    try { host = new URL(chunk.uri).hostname.replace(/^www\./, ''); } catch { host = chunk.uri; }
  }
  return host;
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"'\])]+/g;

/**
 * URLs written into the gathered facts, each carrying the line it appeared on
 * as its passage. Grounding redirects are kept for the caller to resolve.
 */
export function pagesFromText(text: string | null | undefined): GroundingChunk[] {
  const out: GroundingChunk[] = [];
  if (!text) return out;
  for (const line of text.split(/\n+/)) {
    for (const m of line.matchAll(URL_IN_TEXT)) {
      const uri = m[0].replace(/[.,;:!?]+$/, '');
      if (!isHttpUrl(uri) || /google\.com\/search/i.test(uri)) continue;
      let chunk = out.find(c => c.uri === uri);
      if (!chunk) {
        let domain: string | undefined;
        try { domain = new URL(uri).hostname.replace(/^www\./, ''); } catch { domain = undefined; }
        chunk = { uri, domain, origin: 'facts_url' };
        out.push(chunk);
      }
      addSupport(chunk, line.replace(URL_IN_TEXT, ' '));
    }
  }
  return out;
}

/** The shape pages are stored in on neighborhood_briefs.sources (alongside Grok citations). */
export interface StoredPage {
  title?: string;
  url?: string;
  domain?: string;
  origin?: GroundingChunk['origin'];
  supports?: string[];
}

export function pagesToStored(pages: GroundingChunk[]): StoredPage[] {
  return pages.map(p => ({
    title: p.title,
    url: p.uri,
    domain: p.domain,
    origin: p.origin,
    ...(p.supports?.length ? { supports: p.supports } : {}),
  }));
}

/** Read neighborhood_briefs.sources (Grok citations and stored search pages) back as pages. */
export function pagesFromStored(sources: unknown): GroundingChunk[] {
  if (!Array.isArray(sources)) return [];
  const out: GroundingChunk[] = [];
  for (const s of sources as StoredPage[]) {
    if (!s || !isHttpUrl(s.url) || isGroundingRedirect(s.url)) continue;
    const url = s.url;
    if (out.some(o => o.uri === url)) continue;
    let domain = s.domain;
    try { domain = domain || new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep */ }
    out.push({
      uri: url,
      title: s.title,
      domain,
      origin: s.origin || 'grok',
      supports: Array.isArray(s.supports) ? s.supports.filter(t => typeof t === 'string') : undefined,
    });
  }
  return out;
}

export interface AttachStats {
  placeholdersDropped: number;
  redirectsResolved: number;
  redirectsDropped: number;
  urlsAttached: number;
  /** Stories with no source URL that got one by story-to-page matching. */
  storiesMatched: number;
  /** Model-written URLs removed because no tool returned them (only with `traced`). */
  modelUrlsDropped: number;
}

export interface CleanStoryOptions {
  /**
   * Pages read earlier in the pipeline (the fact search's grounding, Grok's
   * citations, URLs in the gathered facts). Searched after the enrichment's
   * own chunks, for name matching and story matching alike.
   */
  gathered?: GroundingChunk[];
  /** Edition place names, ignored as subject words ("Lymington House Prices" -> house). */
  placeNames?: string[];
  /** Pages never to attach (blocked domains). */
  exclude?: (chunk: GroundingChunk) => boolean;
  /**
   * Every page a search tool in this pipeline returned, plus URLs written in
   * the gathered facts. When given, a story source URL that is none of these
   * was written by the enrichment model: it is removed (the name is kept for
   * matching) and recorded on the story as droppedModelUrl for the shadow
   * report. Measured 2026-09-24: 60 of 109 such URLs were 404 or 410.
   */
  traced?: GroundingChunk[];
}

/**
 * Clean the source refs on enrichment stories in place:
 * placeholder names -> null; redirect URLs -> resolved or dropped;
 * with `traced`, URLs no tool returned -> dropped (name kept);
 * missing URLs -> attached from pages read where the name match is clear;
 * still no URL -> a page the pipeline read whose grounded passage names the
 * story (matchStoryToPages), or none.
 */
export async function cleanStorySources(
  stories: Array<{ entity?: string; context?: string; source: SourceRef | null; secondarySource?: SourceRef; droppedModelUrl?: string }>,
  chunks: GroundingChunk[],
  options: CleanStoryOptions = {},
): Promise<AttachStats> {
  const stats: AttachStats = { placeholdersDropped: 0, redirectsResolved: 0, redirectsDropped: 0, urlsAttached: 0, storiesMatched: 0, modelUrlsDropped: 0 };
  const allPages = [...chunks, ...(options.gathered || [])]
    .filter(p => !isGroundingRedirect(p.uri))
    .filter(p => !options.exclude || !options.exclude(p));
  const traced = options.traced ? tracedUrlChecker(options.traced) : null;

  const clean = async (ref: SourceRef | null | undefined, story: StoryLike, onDrop: (url: string) => void): Promise<SourceRef | null> => {
    if (!ref || typeof ref !== 'object') return null;
    if (isPlaceholderSourceName(ref.name)) { stats.placeholdersDropped++; return null; }
    let url: string | null = isHttpUrl(ref.url) ? ref.url.trim() : null;
    if (url && isGroundingRedirect(url)) {
      const resolved = await resolveGroundingRedirect(url);
      if (resolved) { stats.redirectsResolved++; url = resolved; }
      else { stats.redirectsDropped++; url = null; }
    }
    let origin: SourceOrigin | undefined = ref.origin;
    if (url && traced && !traced(url)) {
      stats.modelUrlsDropped++;
      onDrop(url);
      url = null;
    }
    if (!url) {
      origin = undefined;
      // A read page from the named publication, and only one whose grounded
      // passage names this story. The publication's name alone is not enough:
      // measured 2026-09-24, name-only matching gave three different Irish
      // Examiner stories the same Cork section front, and two different
      // building permits one unrelated permit page.
      const onHost = allPages.filter(p => hostMatchesPublication(ref.name, p.uri) || matchSourceToChunk(ref.name, [p]));
      const m = matchStoryToPages(story, onHost, options.placeNames || []);
      if (m) { stats.urlsAttached++; url = m.chunk.uri; origin = 'name-match'; }
    }
    return { name: ref.name.trim(), url, ...(origin ? { origin } : {}) };
  };

  for (const story of stories) {
    story.source = await clean(story.source, story, (u) => { story.droppedModelUrl = u; });
    if (story.secondarySource) {
      const s = await clean(story.secondarySource, story, (u) => { story.droppedModelUrl = story.droppedModelUrl || u; });
      if (s) story.secondarySource = s; else delete story.secondarySource;
    }
    if (!story.source || !story.source.url) {
      const m = matchStoryToPages(story, allPages, options.placeNames || []);
      if (m) {
        // The page names the story. Keep the model's publication name only
        // when the page is on that publication's own host; otherwise the page
        // is what backs the story, so it is named for itself.
        const named = story.source?.name;
        const keepName = !!named && hostMatchesPublication(named, m.chunk.uri);
        story.source = { name: keepName ? (named as string) : sourceNameForPage(m.chunk), url: m.chunk.uri, origin: 'story-match' };
        stats.storiesMatched++;
      }
    }
  }
  return stats;
}

/**
 * A membership test for "a search tool returned this page": URLs compared by
 * urlKey, X posts by status id (the same post has several URL forms).
 */
export function tracedUrlChecker(pages: GroundingChunk[]): (url: string) => boolean {
  const keys = new Set<string>();
  for (const p of pages) {
    if (!p?.uri) continue;
    keys.add(urlKey(p.uri));
    const id = p.uri.match(/\/status\/(\d+)/)?.[1];
    if (id) keys.add(`xstatus:${id}`);
  }
  return (url: string) => {
    const id = url.match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i)?.[1];
    return keys.has(urlKey(url)) || (!!id && keys.has(`xstatus:${id}`));
  };
}

/** Comparable form of a URL: host without www, path without trailing slash, no query or hash. */
export function urlKey(url: string): string {
  let s = url.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[?#]/)[0];
  s = s.replace(/^(www|m|mobile)\./, '').replace(/^twitter\.com\//, 'x.com/');
  return s.replace(/\/+$/, '');
}

/**
 * Stamp each story source that has a URL but no origin: 'tool' when the URL
 * is one of the pages a search returned, 'model' when it is only in the
 * model's JSON. X posts compare by status id, since the same post has several
 * URL forms.
 */
export function markSourceOrigins(
  stories: Array<{ source?: SourceRef | null; secondarySource?: SourceRef | null }>,
  pages: GroundingChunk[],
): void {
  const known = tracedUrlChecker(pages);
  for (const s of stories) {
    for (const ref of [s.source, s.secondarySource]) {
      if (!ref || ref.origin || !isHttpUrl(ref.url)) continue;
      ref.origin = known(ref.url) ? 'tool' : 'model';
    }
  }
}

export interface ArticleSourceInput {
  source_name: string;
  source_type: 'publication' | 'x_user' | 'platform' | 'other';
  source_url?: string;
}

interface CategoryLike {
  stories?: Array<{ source?: SourceRef | null; secondarySource?: SourceRef | null }>;
}

/**
 * Turn a brief's enriched_categories into article_sources rows.
 *
 * One implementation for generate-brief-articles, generate-look-ahead, the
 * email assembler's fallback and the auto-fixer. Placeholder names are never
 * emitted, grounding redirects are resolved (or the URL dropped) so briefs
 * enriched before the enricher learned to do this still come out clean, and
 * an article with nothing checkable gets NO rows rather than the old
 * "X (Twitter)" / "Google News" platform placeholders. The article page
 * already renders "Synthesized from public news sources" for that case.
 */
export async function extractArticleSources(categories: unknown): Promise<ArticleSourceInput[]> {
  if (!Array.isArray(categories)) return [];
  const out: ArticleSourceInput[] = [];
  const seen = new Set<string>();

  for (const category of categories as CategoryLike[]) {
    for (const story of category?.stories || []) {
      for (const ref of [story.source, story.secondarySource]) {
        if (!ref?.name || isPlaceholderSourceName(ref.name)) continue;
        const key = ref.name.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        let url: string | undefined;
        // A 'model' URL (briefs enriched before 2026-09-24) is never published.
        if (ref.origin !== 'model' && isHttpUrl(ref.url) && !ref.url.includes('google.com/search')) {
          url = isGroundingRedirect(ref.url) ? (await resolveGroundingRedirect(ref.url)) || undefined : ref.url.trim();
        }
        const isX = ref.name.startsWith('@') || /(^|\.)(x|twitter)\.com/i.test(url || '');
        out.push({ source_name: ref.name.trim(), source_type: isX ? 'x_user' : 'publication', source_url: url });
      }
    }
  }
  return out;
}
