/**
 * The pages Grok's search actually read, recovered from its API response.
 *
 * Found 2026-09-23: every Grok brief stored `sources: []` and
 * `source_count: 0`, because grok.ts read `data.citations`, a field the xAI
 * Responses API does not return. The citations are there, as `url_citation`
 * annotations on the assistant message's `output_text` part. Their
 * start_index/end_index are 0, so they do not say which sentence each post
 * supports, and the x_search tool does not return the post text. Two
 * deterministic ways back to a claim:
 *
 *  1. An inline marker in the prose, `[[n]](url)` (rare: 1 in 262 recent pilot
 *     briefs). The sentence before it is the claim.
 *  2. The post itself. X's public syndication endpoint returns a post's text
 *     by id without a login, so each cited post can be read the way Grok read
 *     it, and the post text becomes the passage a story is matched against.
 *
 * Neither step asks a model for anything. No prompt is changed.
 */

import type { GroundingChunk } from './source-links';

export interface GrokCitation {
  url: string;
  title?: string;
  /** Claims tied to this URL by an inline marker, or the post's own text. */
  supports?: string[];
  origin?: 'grok';
}

interface AnnotationLike { type?: string; url?: string; title?: string; start_index?: number; end_index?: number }
interface ContentPartLike { type?: string; text?: string; annotations?: AnnotationLike[] }
interface OutputLike { type?: string; role?: string; content?: unknown }

const HTTP = /^https?:\/\/\S+$/i;

function pushSupport(c: GrokCitation, text: string): void {
  const t = text.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (t.length < 8) return;
  c.supports = c.supports || [];
  if (c.supports.length < 8 && !c.supports.includes(t)) c.supports.push(t);
}

/** The sentence (or line) ending just before `index` in `text`. */
function claimBefore(text: string, index: number): string {
  const head = text.slice(0, index);
  const lineStart = head.lastIndexOf('\n') + 1;
  const line = head.slice(lineStart);
  // Back to the previous sentence end within the line, keeping the sentence
  // the marker closes.
  const trimmed = line.replace(/[\s.]+$/, '');
  const prevEnd = Math.max(trimmed.lastIndexOf('. '), trimmed.lastIndexOf('! '), trimmed.lastIndexOf('? '));
  return (prevEnd >= 0 ? trimmed.slice(prevEnd + 2) : trimmed).replace(/\[\[\d+\]\]\([^)]*\)/g, '').trim();
}

/**
 * Every URL the response cites, in order, with any claim an inline marker or
 * a positioned annotation ties to it. Reads the legacy top-level `citations`
 * too, in case the API returns it again.
 */
export function extractGrokCitations(data: unknown, rawText?: string): GrokCitation[] {
  const out: GrokCitation[] = [];
  const byUrl = new Map<string, GrokCitation>();
  const add = (url: unknown, title?: unknown): GrokCitation | null => {
    if (typeof url !== 'string' || !HTTP.test(url.trim())) return null;
    const u = url.trim();
    let c = byUrl.get(u);
    if (!c) {
      c = { url: u, origin: 'grok' };
      if (typeof title === 'string' && title.trim() && title.trim() !== u) c.title = title.trim();
      byUrl.set(u, c);
      out.push(c);
    }
    return c;
  };

  const d = data as { citations?: unknown[]; output?: OutputLike[] } | null;
  for (const c of d?.citations || []) {
    if (typeof c === 'string') add(c);
    else if (c && typeof c === 'object') add((c as { url?: string }).url, (c as { title?: string }).title);
  }
  for (const o of d?.output || []) {
    if (o?.type !== 'message' || !Array.isArray(o.content)) continue;
    for (const part of o.content as ContentPartLike[]) {
      for (const a of part?.annotations || []) {
        if (a?.type && a.type !== 'url_citation') continue;
        const c = add(a.url, a.title);
        if (c && part.text && typeof a.start_index === 'number' && typeof a.end_index === 'number' && a.end_index > a.start_index) {
          pushSupport(c, part.text.slice(a.start_index, a.end_index));
        }
      }
    }
  }

  if (rawText) {
    for (const m of rawText.matchAll(/\[\[(\d+)\]\]\((https?:\/\/[^)\s]+)\)/g)) {
      const c = add(m[2]);
      if (c && typeof m.index === 'number') pushSupport(c, claimBefore(rawText, m.index));
    }
  }
  return out;
}

export const X_STATUS = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i;

function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

export interface XPost {
  id: string;
  handle: string | null;
  name: string | null;
  text: string;
  quotedText: string | null;
  createdAt: string | null;
  /** The endpoint's JSON as returned, for archiving. */
  raw: string;
  status: number;
}

/**
 * One X post's public record from X's syndication endpoint (no login). The
 * endpoint is unofficial and can change; callers treat null as "could not
 * read". Never throws.
 */
export async function readXPost(id: string, timeoutMs = 5000): Promise<XPost | null> {
  try {
    const res = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${syndicationToken(id)}&lang=en`,
      { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'FlaneurSourceCheck/1.0 (+https://readflaneur.com/standards)' } },
    );
    if (!res.ok) return null;
    const raw = await res.text();
    const j = JSON.parse(raw) as { text?: string; created_at?: string; user?: { screen_name?: string; name?: string }; quoted_tweet?: { text?: string } };
    if (!j.text) return null;
    const strip = (t: string) => t.replace(/https:\/\/t\.co\/\S+/g, '').trim();
    return {
      id,
      handle: j.user?.screen_name || null,
      name: j.user?.name || null,
      text: strip(j.text),
      quotedText: j.quoted_tweet?.text ? strip(j.quoted_tweet.text) : null,
      createdAt: j.created_at || null,
      raw,
      status: res.status,
    };
  } catch {
    return null;
  }
}

/**
 * Read each cited X post's text from X's public syndication endpoint and add
 * it as the citation's passage, with the author's handle as its title and the
 * canonical post URL. Best effort and bounded: a failed read leaves the
 * citation as it was. Never throws.
 */
export async function hydrateXPosts(
  citations: GrokCitation[],
  opts: { max?: number; timeoutMs?: number; concurrency?: number } = {},
): Promise<number> {
  const max = opts.max ?? 30;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const concurrency = opts.concurrency ?? 8;
  const targets = citations.filter(c => X_STATUS.test(c.url)).slice(0, max);
  let read = 0;
  for (let i = 0; i < targets.length; i += concurrency) {
    await Promise.all(targets.slice(i, i + concurrency).map(async (c) => {
      const id = (c.url.match(X_STATUS) || [])[2];
      if (!id) return;
      const post = await readXPost(id, timeoutMs);
      if (!post || !post.text) return;
      if (post.handle) {
        c.title = `@${post.handle}`;
        c.url = `https://x.com/${post.handle}/status/${id}`;
      }
      pushSupport(c, post.text);
      if (post.quotedText) pushSupport(c, post.quotedText);
      read++;
    }));
  }
  return read;
}

/** As pages for story matching. */
export function citationsToPages(citations: GrokCitation[] | null | undefined): GroundingChunk[] {
  return (citations || []).map(c => {
    let domain: string | undefined;
    try { domain = new URL(c.url).hostname.replace(/^www\./, ''); } catch { domain = undefined; }
    return { uri: c.url, title: c.title, domain, supports: c.supports, origin: 'grok' as const };
  });
}
