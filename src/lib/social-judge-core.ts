/**
 * Pure parts of the Llama social-source judge (see social-judge.ts).
 *
 * X posts are searched and read by Grok. Posts on Meta's platforms (Facebook,
 * Instagram, Threads) and TikTok are judged by a Meta open-weight model,
 * Llama, from the text we fetched ourselves: the post's public caption and
 * page metadata. The model is never asked to find, name or supply a source or
 * a URL; it only says whether the text in front of it supports the story's
 * facts.
 *
 * No imports, so scripts/test-social-judge.mjs can compile and test this file
 * on its own.
 */

export type SocialPlatform = 'facebook' | 'instagram' | 'threads' | 'tiktok';
export type JudgeVerdict = 'supports' | 'contradicts' | 'unrelated' | 'unreadable';

export const JUDGE_VERDICTS: readonly JudgeVerdict[] = ['supports', 'contradicts', 'unrelated', 'unreadable'];

/** The platform a URL belongs to, or null when it is not one the Llama judge handles. */
export function socialPlatform(url: string | null | undefined): SocialPlatform | null {
  if (!url || !/^https?:\/\//i.test(url.trim())) return null;
  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
  const is = (d: string) => host === d || host.endsWith('.' + d);
  if (is('facebook.com') || is('fb.com') || is('fb.watch') || is('fb.me')) return 'facebook';
  if (is('instagram.com') || is('instagr.am')) return 'instagram';
  if (is('threads.net') || is('threads.com')) return 'threads';
  if (is('tiktok.com')) return 'tiktok';
  return null;
}

export const PLATFORM_LABEL: Record<SocialPlatform, { en: string; it: string }> = {
  facebook: { en: 'Facebook post', it: 'Post di Facebook' },
  instagram: { en: 'Instagram post', it: 'Post di Instagram' },
  threads: { en: 'Threads post', it: 'Post di Threads' },
  tiktok: { en: 'TikTok video', it: 'Video di TikTok' },
};

// ─── Reading what is public ────────────────────────────────────────────────

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function metaContent(html: string, key: string): string | null {
  // Attribute order varies and values can span lines (Facebook's captions do).
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const a = new RegExp(`<meta[^>]*?(?:property|name)\\s*=\\s*["']${esc}["'][^>]*?content\\s*=\\s*"([^"]*)"`, 'i').exec(html)
    || new RegExp(`<meta[^>]*?content\\s*=\\s*"([^"]*)"[^>]*?(?:property|name)\\s*=\\s*["']${esc}["']`, 'i').exec(html);
  return a ? decode(a[1]).trim() || null : null;
}

/** Captions and descriptions inside JSON-LD blocks. */
function jsonLdTexts(html: string): string[] {
  const out: string[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const walk = (v: unknown) => {
        if (!v || typeof v !== 'object') return;
        if (Array.isArray(v)) { v.forEach(walk); return; }
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
          if (typeof x === 'string' && ['articleBody', 'description', 'caption', 'text', 'headline', 'name'].includes(k)) out.push(decode(x));
          else walk(x);
        }
      };
      walk(JSON.parse(m[1]));
    } catch { /* not JSON */ }
  }
  return out;
}

/** Page text that says only "log in", with nothing of the post. */
const LOGIN_WALL = /^(facebook|instagram|threads|tiktok|log in|login|log into facebook|sign up|create an account or log in|error|page not found|this content isn'?t available|content not found)\b[\s.!|·-]*(facebook|instagram|tiktok|threads)?[\s.!]*$/i;

export interface PostText {
  /** Joined text handed to the judge, or '' when nothing readable. */
  text: string;
  /** Which fields it came from, for the record. */
  fields: string[];
}

/**
 * What a public post page says about itself: title, og/meta description,
 * twitter description and JSON-LD captions, de-duplicated. Login walls and
 * bare platform names come back empty.
 */
export function extractPostText(html: string | null | undefined, maxChars = 2500): PostText {
  if (!html) return { text: '', fields: [] };
  const parts: Array<[string, string | null]> = [
    ['og:title', metaContent(html, 'og:title')],
    ['og:description', metaContent(html, 'og:description')],
    ['description', metaContent(html, 'description')],
    ['twitter:description', metaContent(html, 'twitter:description')],
    ['title', (() => { const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html); return t ? decode(t[1]).trim() : null; })()],
  ];
  for (const t of jsonLdTexts(html)) parts.push(['ld+json', t]);
  const seen = new Set<string>();
  const kept: string[] = [];
  const fields: string[] = [];
  for (const [field, raw] of parts) {
    const v = (raw || '').replace(/\s+/g, ' ').trim();
    if (!v || v.length < 3 || LOGIN_WALL.test(v)) continue;
    const key = v.toLowerCase();
    // Skip a value already contained in one we kept (title vs description).
    if (seen.has(key) || kept.some((k) => k.toLowerCase().includes(key.replace(/\.\.\.$|…$/, '')))) continue;
    seen.add(key);
    kept.push(v);
    fields.push(field);
  }
  const text = kept.join('\n').slice(0, maxChars);
  return readable(text) ? { text, fields } : { text: '', fields: [] };
}

/** Enough words to judge anything: a page name alone ("Kilbryde Hospice") is not. */
export function readable(text: string): boolean {
  return text.replace(/\s+/g, ' ').trim().split(' ').filter((w) => /\p{L}/u.test(w)).length >= 6;
}

// ─── The judge's prompt and verdict ────────────────────────────────────────

export interface JudgeFact {
  kind: string;
  text: string;
}

export function buildJudgePrompt(args: {
  platform: SocialPlatform;
  entity: string;
  context: string;
  facts: JudgeFact[];
  postText: string;
}): string {
  const facts = args.facts.map((f, i) => `${i + 1}. [${f.kind}] ${f.text}`).join('\n');
  return `You are checking a local news story against the public text of one ${PLATFORM_LABEL[args.platform].en.toLowerCase()}. You judge only the text below. Do not search, do not use outside knowledge, and do not suggest any other source, account, page or URL.

STORY
Subject: ${args.entity || '(none)'}
Story text: ${args.context || '(none)'}

FACTS TO CHECK (numbered)
${facts || '(none: judge the story text as a whole)'}

PUBLIC TEXT OF THE POST (fetched by us; may be truncated, may be in another language)
"""
${args.postText}
"""

Decide:
- "supports": the post is about the same subject and states at least one of the facts.
- "contradicts": the post is about the same subject but states something different for a fact (another date, time, place, price or name).
- "unrelated": the post is about something else, or says nothing that bears on the facts.
- "unreadable": the text is a login page, an error, or too little to judge.

Reply with JSON only, no prose, in exactly this shape:
{"verdict": "supports", "supported_facts": [1, 3], "contradicted_facts": [], "reason": "one short sentence"}
"supported_facts" and "contradicted_facts" list fact numbers from the numbered list above; a fact the post does not mention is in neither list.`;
}

export interface ParsedJudgement {
  verdict: JudgeVerdict;
  supportedFacts: number[];
  contradictedFacts: number[];
  reason: string | null;
}

function factList(v: unknown, factCount: number): number[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<number>();
  for (const x of v) {
    const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d+$/.test(x.trim()) ? Number(x.trim()) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= factCount) out.add(n);
  }
  return Array.from(out).sort((a, b) => a - b);
}

/**
 * Parse the model's reply. Returns null when there is no usable verdict, so
 * the caller records a failure rather than guessing. Fact numbers out of
 * range are dropped; a fact claimed as both supported and contradicted counts
 * as contradicted; a "supports" with contradicted facts and none supported
 * becomes "contradicts".
 */
export function parseJudgement(raw: string | null | undefined, factCount: number): ParsedJudgement | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  s = s.slice(start, end + 1);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(s);
  } catch {
    return null;
  }
  const v = String(obj.verdict ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
  const verdict = (JUDGE_VERDICTS as readonly string[]).includes(v) ? (v as JudgeVerdict) : null;
  if (!verdict) return null;
  const contradicted = factList(obj.contradicted_facts, factCount);
  const supported = factList(obj.supported_facts, factCount).filter((n) => !contradicted.includes(n));
  let final: JudgeVerdict = verdict;
  if (verdict === 'supports' && supported.length === 0 && contradicted.length > 0) final = 'contradicts';
  const reason = typeof obj.reason === 'string' ? obj.reason.replace(/\s+/g, ' ').trim().slice(0, 300) || null : null;
  if (final === 'unreadable' || final === 'unrelated') {
    return { verdict: final, supportedFacts: [], contradictedFacts: [], reason };
  }
  return { verdict: final, supportedFacts: supported, contradictedFacts: contradicted, reason };
}

/** "Facebook post, checked by Llama: supports 2 of 3 facts", for the editor desk. */
export function judgeLabel(
  j: { platform: SocialPlatform | null; verdict: JudgeVerdict; supported: number; total: number },
  lang: 'en' | 'it' = 'en',
): string {
  const what = j.platform ? PLATFORM_LABEL[j.platform][lang] : lang === 'it' ? 'Post social' : 'Social post';
  if (lang === 'it') {
    const v = {
      supports: j.total ? `conferma ${j.supported} ${j.supported === 1 ? 'fatto' : 'fatti'} su ${j.total}` : 'conferma la notizia',
      contradicts: 'contraddice la notizia',
      unrelated: 'non riguarda la notizia',
      unreadable: 'non leggibile',
    }[j.verdict];
    return `${what}, verificato da Llama: ${v}`;
  }
  const v = {
    supports: j.total ? `supports ${j.supported} of ${j.total} fact${j.total === 1 ? '' : 's'}` : 'supports the story',
    contradicts: 'contradicts the story',
    unrelated: 'unrelated to the story',
    unreadable: 'could not be read',
  }[j.verdict];
  return `${what}, checked by Llama: ${v}`;
}
