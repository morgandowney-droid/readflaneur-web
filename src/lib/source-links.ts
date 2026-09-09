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

export interface GroundingChunk {
  uri: string;
  title?: string;
  domain?: string;
}

export interface SourceRef {
  name: string;
  url?: string | null;
}

const PLACEHOLDER_SOURCE_PATTERNS: RegExp[] = [
  /^user[\s-]*provided/i,
  /provided (content|context|information|data)/i,
  /^(local|event|events?) ?listings?$/i,
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

/** Pull the grounding chunks out of a @google/genai GenerateContentResponse. */
export function extractGroundingChunks(response: unknown): GroundingChunk[] {
  const chunks: GroundingChunk[] = [];
  const candidates = (response as { candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string; domain?: string } }> } }> })?.candidates;
  const raw = candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set<string>();
  for (const c of raw) {
    const uri = c?.web?.uri;
    if (!isHttpUrl(uri) || seen.has(uri)) continue;
    seen.add(uri);
    chunks.push({ uri, title: c.web?.title, domain: c.web?.domain });
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
      return { uri, title: c.title, domain } as GroundingChunk;
    }));
    for (const r of results) if (r) out.push(r);
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

export interface AttachStats {
  placeholdersDropped: number;
  redirectsResolved: number;
  redirectsDropped: number;
  urlsAttached: number;
}

/**
 * Clean the source refs on enrichment stories in place:
 * placeholder names -> null; redirect URLs -> resolved or dropped;
 * missing URLs -> attached from grounding chunks where the match is clear.
 */
export async function cleanStorySources(
  stories: Array<{ source: SourceRef | null; secondarySource?: SourceRef }>,
  chunks: GroundingChunk[],
): Promise<AttachStats> {
  const stats: AttachStats = { placeholdersDropped: 0, redirectsResolved: 0, redirectsDropped: 0, urlsAttached: 0 };

  const clean = async (ref: SourceRef | null | undefined): Promise<SourceRef | null> => {
    if (!ref) return null;
    if (isPlaceholderSourceName(ref.name)) { stats.placeholdersDropped++; return null; }
    let url: string | null = isHttpUrl(ref.url) ? ref.url.trim() : null;
    if (url && isGroundingRedirect(url)) {
      const resolved = await resolveGroundingRedirect(url);
      if (resolved) { stats.redirectsResolved++; url = resolved; }
      else { stats.redirectsDropped++; url = null; }
    }
    if (!url) {
      const m = matchSourceToChunk(ref.name, chunks);
      if (m) { stats.urlsAttached++; url = m.uri; }
    }
    return { name: ref.name.trim(), url };
  };

  for (const story of stories) {
    story.source = await clean(story.source);
    if (story.secondarySource) {
      const s = await clean(story.secondarySource);
      if (s) story.secondarySource = s; else delete story.secondarySource;
    }
  }
  return stats;
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
        if (isHttpUrl(ref.url) && !ref.url.includes('google.com/search')) {
          url = isGroundingRedirect(ref.url) ? (await resolveGroundingRedirect(ref.url)) || undefined : ref.url.trim();
        }
        const isX = ref.name.startsWith('@') || /(^|\.)(x|twitter)\.com/i.test(url || '');
        out.push({ source_name: ref.name.trim(), source_type: isX ? 'x_user' : 'publication', source_url: url });
      }
    }
  }
  return out;
}
