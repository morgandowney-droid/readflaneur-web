/**
 * Metrics for the shadow model trial (model-trial.ts), computed the same way
 * for a candidate model's output and for what production actually published
 * that day. Everything here is pure: no network, no database, no model. The
 * page fetches and source checks that feed it live in model-trial.ts.
 *
 * Tests: node scripts/test-model-trial-metrics.mjs
 */

export type Verdict = 'verified' | 'partial' | 'not_found' | 'fetch_failed' | 'no_source' | 'unverifiable_origin' | 'unchecked';

export const VERDICTS: Verdict[] = ['verified', 'partial', 'not_found', 'fetch_failed', 'unverifiable_origin', 'no_source', 'unchecked'];

/** Best first: a story's verdict is the best across its sources. */
const VERDICT_RANK: Verdict[] = ['verified', 'partial', 'not_found', 'unverifiable_origin', 'fetch_failed', 'unchecked', 'no_source'];

export interface TrialSourceRef {
  name?: string | null;
  url?: string | null;
  origin?: string | null;
}

export interface TrialStory {
  entity?: string | null;
  context?: string | null;
  source?: TrialSourceRef | null;
  secondarySource?: TrialSourceRef | null;
  droppedModelUrl?: string | null;
}

/**
 * Stories in reading order. Same skip rule as flattenStories() in
 * edition-rules.ts and storiesOf() in shadow-source-checks: a story with
 * neither entity nor context is not a story.
 */
export function trialStories(categories: unknown): TrialStory[] {
  if (!Array.isArray(categories)) return [];
  const out: TrialStory[] = [];
  for (const cat of categories as Array<{ stories?: TrialStory[] }>) {
    for (const s of cat?.stories || []) {
      if (!s || (!(s.entity || '').trim() && !(s.context || '').trim())) continue;
      out.push(s);
    }
  }
  return out;
}

export function isHttp(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\/\S+$/i.test(url.trim());
}

/**
 * A source whose URL a search tool returned: it has a URL and an origin other
 * than 'model'. An unstamped URL counts as model-written, as in the shadow
 * source check (briefs before 2026-09-23 carry no stamp).
 */
export function isTracedSource(ref: TrialSourceRef | null | undefined): boolean {
  if (!ref || !isHttp(ref.url)) return false;
  return !!ref.origin && ref.origin !== 'model';
}

/** Words a reader sees: headers, link targets and bare URLs removed. */
export function bodyWords(body: string | null | undefined): number {
  if (!body) return 0;
  const text = body
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ');
  return text.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
}

export function tracedShare(stories: TrialStory[]): { traced: number; share: number | null } {
  const traced = stories.filter(s => isTracedSource(s.source) || isTracedSource(s.secondarySource)).length;
  return { traced, share: stories.length ? round(traced / stories.length) : null };
}

/** The rule family: "blocked-source: x.com" and "blocked-source: y" count together. */
export function ruleKey(rule: string): string {
  return (rule || 'unknown').split(':')[0].trim() || 'unknown';
}

export function removalsByRule(removals: Array<{ rule: string }> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of removals || []) {
    const k = ruleKey(r.rule);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/** Rules production's enricher recorded on the brief's article (formatRemovals in edition-rules.ts). */
export function parseEditorNoteRemovals(notes: string | null | undefined): Array<{ rule: string }> {
  if (!notes) return [];
  const out: Array<{ rule: string }> = [];
  for (const m of notes.matchAll(/^- ".*": (.+)$/gm)) out.push({ rule: m[1].trim() });
  return out;
}

export function bestVerdict(verdicts: Verdict[]): Verdict {
  return VERDICT_RANK.find(v => verdicts.includes(v)) || 'no_source';
}

export function verdictMix(storyVerdicts: Verdict[]): Record<Verdict, number> {
  const out = Object.fromEntries(VERDICTS.map(v => [v, 0])) as Record<Verdict, number>;
  for (const v of storyVerdicts) out[v]++;
  return out;
}

/** Lowercase, accents off, punctuation to spaces. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * The names a page must contain to count as about the edition: the edition
 * name, its catchment places with qualifiers removed, and "Cork" for
 * "County Cork". Names of two letters or fewer are dropped.
 */
export function placeNamesFor(name: string, catchment: string[] = []): string[] {
  const out = new Set<string>();
  const add = (n: string) => {
    const t = normalizeForMatch(n.replace(/\([^)]*\)/g, ' '));
    if (t.length > 2) out.add(t);
  };
  for (const n of [name, ...catchment]) {
    add(n);
    const bare = n.replace(/^(county|co\.?|township of|city of|town of)\s+/i, '').replace(/\s+(township|county)$/i, '');
    if (bare !== n) add(bare);
  }
  return Array.from(out);
}

/** Whole-word, accent-insensitive: does the text name any of the places? */
export function mentionsPlace(text: string | null | undefined, placeNames: string[]): boolean {
  if (!text || placeNames.length === 0) return false;
  const hay = ` ${normalizeForMatch(text)} `;
  return placeNames.some(p => p && hay.includes(` ${normalizeForMatch(p)} `));
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function distinctDomains(urls: string[]): number {
  return new Set(urls.map(hostOf).filter(Boolean)).size;
}

export interface CitationCheck {
  url: string;
  loaded: boolean;
  mentionsPlace: boolean;
}

export interface SearchMetrics {
  citations: number;
  x_posts: number;
  distinct_domains: number;
  checked: number;
  loaded: number;
  load_share: number | null;
  mentions_place: number;
  /** Of the citations checked, not of those that loaded. */
  mentions_place_share: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  /** The search call errored or returned nothing. */
  failed: boolean;
  /** X posts the search tool read (xAI usage), whether or not it cited them. */
  posts_read: number | null;
  /** Words of the gathered facts the search returned. */
  content_words: number;
  /** The result opens by saying nothing was found ("Quiet day...", "No major..."). */
  opens_empty: boolean;
}

/** The first lines of a search result say it found nothing. */
export const OPENS_EMPTY = /\b(?:quiet (?:day|week|weekend|morning|thursday|friday|monday|tuesday|wednesday|saturday|sunday)|no (?:major|new|notable|significant) (?:news|events?|openings?|stories|developments|restaurant)|nothing (?:major|much|new|notable)|not much (?:going on|happening)|no confirmed events)\b/i;

export function opensEmpty(headline: string | null | undefined, content: string | null | undefined): boolean {
  return OPENS_EMPTY.test(`${headline || ''}\n${content || ''}`.slice(0, 240));
}

export function searchMetrics(
  urls: string[],
  checks: CitationCheck[],
  extra: {
    latencyMs: number | null;
    costUsd: number | null;
    failed?: boolean;
    postsRead?: number | null;
    headline?: string | null;
    content?: string | null;
  },
): SearchMetrics {
  const loaded = checks.filter(c => c.loaded).length;
  const mentions = checks.filter(c => c.mentionsPlace).length;
  return {
    citations: urls.length,
    x_posts: urls.filter(u => /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[^/]+\/status\/\d+/i.test(u)).length,
    distinct_domains: distinctDomains(urls),
    checked: checks.length,
    loaded,
    load_share: checks.length ? round(loaded / checks.length) : null,
    mentions_place: mentions,
    mentions_place_share: checks.length ? round(mentions / checks.length) : null,
    latency_ms: extra.latencyMs,
    cost_usd: extra.costUsd === null ? null : round(extra.costUsd, 6),
    failed: !!extra.failed,
    posts_read: typeof extra.postsRead === 'number' ? extra.postsRead : null,
    content_words: bodyWords(extra.content),
    opens_empty: !extra.failed && opensEmpty(extra.headline, extra.content),
  };
}

export interface WriterInput {
  body: string | null;
  categories: unknown;
  /** Best verdict per story, in trialStories() order. */
  storyVerdicts: Verdict[];
  pagesChecked: number;
  removals: Array<{ rule: string }> | null;
  refusal: boolean;
  jsonParseFailed: boolean | null;
  thinkingLeakStripped: boolean | null;
  teaserLeakStripped: boolean | null;
  residualThinkingLeak: boolean;
  residualTeaserLeak: boolean;
  modelUrlsWritten: number | null;
  groundingQueries: number | null;
  latencyMs: number | null;
  costUsd: number | null;
  thoughtsTokens: number | null;
}

export interface WriterMetrics {
  stories: number;
  words: number;
  traced_source_stories: number;
  traced_source_share: number | null;
  verdicts: Record<Verdict, number>;
  verified_share: number | null;
  verified_or_partial_share: number | null;
  pages_checked: number;
  model_urls_written: number | null;
  model_urls_dropped: number;
  edition_rules_removed: number | null;
  edition_rules_by_rule: Record<string, number> | null;
  refusal: boolean;
  json_parse_failed: boolean | null;
  thinking_leak_stripped: boolean | null;
  teaser_leak_stripped: boolean | null;
  residual_thinking_leak: boolean;
  residual_teaser_leak: boolean;
  grounding_queries: number | null;
  thoughts_tokens: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
}

export function writerMetrics(input: WriterInput): WriterMetrics {
  const stories = trialStories(input.categories);
  const { traced, share } = tracedShare(stories);
  const mix = verdictMix(input.storyVerdicts);
  const n = stories.length;
  return {
    stories: n,
    words: bodyWords(input.body),
    traced_source_stories: traced,
    traced_source_share: share,
    verdicts: mix,
    verified_share: n ? round(mix.verified / n) : null,
    verified_or_partial_share: n ? round((mix.verified + mix.partial) / n) : null,
    pages_checked: input.pagesChecked,
    model_urls_written: input.modelUrlsWritten,
    model_urls_dropped: stories.filter(s => isHttp(s.droppedModelUrl)).length,
    edition_rules_removed: input.removals ? input.removals.length : null,
    edition_rules_by_rule: input.removals ? removalsByRule(input.removals) : null,
    refusal: input.refusal,
    json_parse_failed: input.jsonParseFailed,
    thinking_leak_stripped: input.thinkingLeakStripped,
    teaser_leak_stripped: input.teaserLeakStripped,
    residual_thinking_leak: input.residualThinkingLeak,
    residual_teaser_leak: input.residualTeaserLeak,
    grounding_queries: input.groundingQueries,
    thoughts_tokens: input.thoughtsTokens,
    latency_ms: input.latencyMs,
    cost_usd: input.costUsd === null ? null : round(input.costUsd, 6),
  };
}

// ─── Comparison ────────────────────────────────────────────────────────────

/** The scalar metrics a summary compares (booleans become 0 or 1, nested counts are flattened). */
export function scalarMetrics(m: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!m) return out;
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (typeof v2 === 'number' && Number.isFinite(v2)) out[`${k}.${k2}`] = v2;
      }
    }
  }
  return out;
}

export interface ComparisonRow {
  metric: string;
  candidate_mean: number | null;
  baseline_mean: number | null;
  /** Rows where both sides had the metric. */
  paired: number;
}

/**
 * Mean per metric for candidate and baseline over the same runs. A metric
 * only one side reports (latency, where production kept none) is still listed
 * with the other mean null.
 */
export function compareRuns(
  runs: Array<{ metrics: Record<string, unknown> | null; baseline_metrics: Record<string, unknown> | null }>,
): ComparisonRow[] {
  const cand = new Map<string, number[]>();
  const base = new Map<string, number[]>();
  const paired = new Map<string, number>();
  for (const r of runs) {
    const c = scalarMetrics(r.metrics);
    const b = scalarMetrics(r.baseline_metrics);
    for (const [k, v] of Object.entries(c)) cand.set(k, [...(cand.get(k) || []), v]);
    for (const [k, v] of Object.entries(b)) base.set(k, [...(base.get(k) || []), v]);
    for (const k of Object.keys(c)) if (k in b) paired.set(k, (paired.get(k) || 0) + 1);
  }
  const keys = Array.from(new Set([...cand.keys(), ...base.keys()])).sort();
  return keys.map(k => ({
    metric: k,
    candidate_mean: mean(cand.get(k)),
    baseline_mean: mean(base.get(k)),
    paired: paired.get(k) || 0,
  }));
}

export function mean(xs: number[] | undefined): number | null {
  if (!xs || xs.length === 0) return null;
  return round(xs.reduce((a, b) => a + b, 0) / xs.length, 4);
}

export function round(x: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(x * f) / f;
}
