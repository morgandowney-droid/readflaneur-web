/**
 * Shadow model trial: would newer models write better-sourced briefs, or
 * search better, than the ones in production?
 *
 * For a fixed set of editions, each day's stored inputs are replayed through a
 * candidate model and the result is measured the same way as what production
 * actually published from the same inputs:
 *
 *  - writer: the brief's stored gathered facts and pages
 *    (neighborhood_briefs.content / sources) go through enrichBriefWithGemini
 *    with the candidate as modelOverride and every option production passes
 *    (continuity context, gathered pages, source repair, edition rules).
 *  - search: the Grok brief search runs with the candidate model and the same
 *    prompt, and its citations are captured the way production captures them.
 *    v1 measures citations only; nothing is enriched from them.
 *
 * Nothing here writes a brief, an article, a translation or a source row, and
 * nothing it produces is read by anything that publishes. The only writes are
 * model_trial_runs, cron_executions (by the cron) and ai_usage_events rows
 * filed under operation trial_writer / trial_search via the usage tap.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/config/ai-models';
import { enrichBriefWithGemini, stripLeakedTeasers, stripThinkingPreamble } from '@/lib/brief-enricher-gemini';
import { generateNeighborhoodBrief } from '@/lib/grok';
import { readXPost, X_STATUS } from '@/lib/grok-citations';
import { fetchContinuityContext } from '@/lib/enrichment-continuity';
import { pagesFromStored } from '@/lib/source-links';
import { checkStorySource, fetchPage, type PageText } from '@/lib/source-check';
import { isModelRefusal } from '@/lib/model-refusal';
import { rulesForEdition } from '@/lib/edition-rules';
import { searchCatchmentFor, searchCatchmentPlaces } from '@/lib/search-catchment';
import { tapCostUsd, withUsageTap, type TappedCall, type UsageTap } from '@/lib/ai-usage-tap';
import {
  bestVerdict,
  isHttp,
  mentionsPlace,
  parseEditorNoteRemovals,
  placeNamesFor,
  searchMetrics,
  trialStories,
  writerMetrics,
  type CitationCheck,
  type SearchMetrics,
  type Verdict,
  type WriterMetrics,
} from '@/lib/model-trial-metrics';

/**
 * Twelve editions across languages and markets: the four GEDI editions (with
 * publisher rules), two Vorarlberg areas (German), Gander (Canada), Warren
 * Township (US, for AP), one Birmingham district, Zaragoza (Spanish), Le
 * Marais and one Irish county.
 */
export const TRIAL_EDITION_IDS = [
  'milan-brera',
  'milan-porta-venezia',
  'rome-prati',
  'sicily-scicli',
  'vorarlberg-bregenz',
  'vorarlberg-dornbirn-nordwest',
  'newfoundland-gander',
  'newjersey-warren',
  'birmingham-harborne',
  'aragon-zaragoza',
  'paris-le-marais',
  'ie-county-cork',
] as const;

/** Newest GA Gemini on 2026-09-24. No 3.x Pro is GA (3.1 Pro is preview), so the newest GA Flash. */
export const TRIAL_WRITER_MODEL = AI_MODELS.GEMINI_WRITER_TRIAL;
/** xAI grok-4.5, the search candidate. */
export const TRIAL_SEARCH_MODEL = AI_MODELS.GROK_SEARCH_TRIAL;

/** Hard stop for the whole trial, both stages, per UTC day. */
export const TRIAL_DAILY_COST_CAP_USD = 3;
/** Assumed worst case for one unit of work, checked against the cap before starting it. */
// Measured 2026-09-24: a writer unit $0.006-0.008 (gemini-3.8-flash plus the
// edition-rules review); a search pair $0.44-0.66 (grok-4.5 billed $0.41-0.59
// by xAI, 14-22 x_search calls reading 58-99 posts, plus the grok-4-1-fast
// control at $0.03-0.09).
export const TRIAL_UNIT_RESERVE_USD = { writer: 0.05, search: 0.7 } as const;

/** Source pages fetched per brief per side (candidate, production) for the fact check. */
const MAX_STORY_PAGES = 12;
/** Citations fetched per search per side. */
const MAX_CITATION_CHECKS = 15;
const FETCH_CONCURRENCY = 6;

export type TrialStage = 'writer' | 'search';

export interface TrialEdition {
  id: string;
  name: string;
  city: string;
  country: string | null;
  timezone: string | null;
}

export interface TrialBrief {
  id: string;
  neighborhood_id: string;
  brief_date: string;
  content: string | null;
  sources: unknown;
  headline: string | null;
  generated_at: string;
  enriched_at: string | null;
  enriched_content: string | null;
  enriched_categories: unknown;
  enrichment_model: string | null;
  model: string | null;
  subject_teaser: string | null;
  email_teaser: string | null;
}

export interface TrialRunRow {
  run_date: string;
  neighborhood_id: string;
  stage: TrialStage;
  model: string;
  baseline_model: string | null;
  output: Record<string, unknown> | null;
  metrics: WriterMetrics | SearchMetrics | null;
  baseline_metrics: WriterMetrics | SearchMetrics | null;
  cost_usd: number | null;
  latency_ms: number | null;
  error: string | null;
}

const BRIEF_COLUMNS =
  'id, neighborhood_id, brief_date, content, sources, headline, generated_at, enriched_at, enriched_content, enriched_categories, enrichment_model, model, subject_teaser, email_teaser';

/**
 * Each edition's most recent enriched brief in the last two days, or the brief
 * on `date`. run_date is the brief's own date, so a run is idempotent per
 * (brief_date, edition, stage, model).
 */
export async function loadTrialInputs(
  admin: SupabaseClient,
  ids: readonly string[],
  opts: { date?: string | null } = {},
): Promise<Array<{ edition: TrialEdition; brief: TrialBrief }>> {
  const { data: hoods, error: hoodErr } = await admin
    .from('neighborhoods')
    .select('id, name, city, country, timezone')
    .in('id', ids as string[]);
  if (hoodErr) throw new Error(`neighborhoods: ${hoodErr.message}`);

  let q = admin
    .from('neighborhood_briefs')
    .select(BRIEF_COLUMNS)
    .in('neighborhood_id', ids as string[])
    .not('enriched_content', 'is', null)
    .order('brief_date', { ascending: false });
  q = opts.date
    ? q.eq('brief_date', opts.date)
    : q.gte('brief_date', new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10));
  const { data: briefs, error: briefErr } = await q;
  if (briefErr) throw new Error(`neighborhood_briefs: ${briefErr.message}`);

  const latest = new Map<string, TrialBrief>();
  for (const b of (briefs || []) as TrialBrief[]) if (!latest.has(b.neighborhood_id)) latest.set(b.neighborhood_id, b);
  const out: Array<{ edition: TrialEdition; brief: TrialBrief }> = [];
  for (const id of ids) {
    const h = (hoods || []).find((x) => x.id === id);
    const b = latest.get(id);
    if (h && b) out.push({ edition: h as TrialEdition, brief: b });
  }
  return out;
}

// ─── Shared helpers ────────────────────────────────────────────────────────

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const t = items[i++];
      await fn(t);
    }
  }));
}

function thoughtsOf(calls: TappedCall[]): number | null {
  let n = 0;
  let seen = false;
  for (const c of calls) {
    const t = (c.metadata as { thoughtsTokens?: number } | null)?.thoughtsTokens;
    if (typeof t === 'number') { n += t; seen = true; }
  }
  return seen ? n : 0;
}

/**
 * The best source-check verdict per story, fetching at most MAX_STORY_PAGES
 * pages. A model-written URL is unverifiable_origin without a fetch, as in
 * shadow-source-checks.
 */
export async function checkStories(
  categories: unknown,
  placeNames: string[],
): Promise<{ verdicts: Verdict[]; pagesChecked: number }> {
  const stories = trialStories(categories);
  const urls: string[] = [];
  for (const s of stories) {
    for (const ref of [s.source, s.secondarySource]) {
      if (ref && isHttp(ref.url) && ref.origin && ref.origin !== 'model') {
        const u = ref.url.trim();
        if (!urls.includes(u)) urls.push(u);
      }
    }
  }
  const allowed = urls.slice(0, MAX_STORY_PAGES);
  const pages = new Map<string, PageText>();
  await pool(allowed, FETCH_CONCURRENCY, async (u) => { pages.set(u, await fetchPage(u)); });

  const verdicts: Verdict[] = [];
  for (const s of stories) {
    const vs: Verdict[] = [];
    for (const ref of [s.source, s.secondarySource]) {
      if (!ref || !isHttp(ref.url)) continue;
      if (!ref.origin || ref.origin === 'model') { vs.push('unverifiable_origin'); continue; }
      const page = pages.get(ref.url.trim());
      if (!page) { vs.push('unchecked'); continue; }
      const r = await checkStorySource(s, ref.url, { placeNames, page });
      vs.push(r.verdict as Verdict);
    }
    verdicts.push(vs.length ? bestVerdict(vs) : 'no_source');
  }
  return { verdicts, pagesChecked: allowed.length };
}

function residualLeaks(body: string | null, subject: string | null, email: string | null) {
  const text = body || '';
  return {
    thinking: !!text && stripThinkingPreamble(text, 'daily_brief') !== text,
    teaser: !!text && stripLeakedTeasers(text, subject, email) !== text,
  };
}

async function baselineRemovals(admin: SupabaseClient, editionId: string, briefId: string): Promise<Array<{ rule: string }> | null> {
  if (!rulesForEdition(editionId)) return null;
  const { data } = await admin
    .from('articles')
    .select('editor_notes')
    .eq('brief_id', briefId)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return parseEditorNoteRemovals(data.editor_notes as string | null);
}

/** Summed estimated cost of production's own calls for this brief, from ai_usage_events. */
async function baselineCost(
  admin: SupabaseClient,
  label: string,
  operations: string[],
  around: string | null,
  beforeMs: number,
  afterMs: number,
): Promise<number | null> {
  if (!around) return null;
  const t = new Date(around).getTime();
  const { data, error } = await admin
    .from('ai_usage_events')
    .select('estimated_cost_usd')
    .eq('label', label)
    .in('operation', operations)
    .gte('created_at', new Date(t - beforeMs).toISOString())
    .lte('created_at', new Date(t + afterMs).toISOString());
  if (error || !data || data.length === 0) return null;
  return data.reduce((n, r) => n + Number(r.estimated_cost_usd || 0), 0);
}

// ─── Writer stage ──────────────────────────────────────────────────────────

export async function runWriterTrial(
  admin: SupabaseClient,
  edition: TrialEdition,
  brief: TrialBrief,
  opts: { model?: string; isPriority: boolean; suppressWrite?: boolean },
): Promise<TrialRunRow> {
  const model = opts.model || TRIAL_WRITER_MODEL;
  const placeNames = [edition.name, edition.city];
  const tap: UsageTap = { operation: 'trial_writer', calls: [], suppressWrite: opts.suppressWrite };
  const continuity = await fetchContinuityContext(admin, edition.id, brief.id, edition.timezone || 'UTC', brief.enriched_at || brief.generated_at);

  let result: Awaited<ReturnType<typeof enrichBriefWithGemini>> | null = null;
  let error: string | null = null;
  const t0 = Date.now();
  try {
    result = await withUsageTap(tap, () => enrichBriefWithGemini(
      brief.content || '',
      edition.name,
      edition.id,
      edition.city,
      edition.country || 'USA',
      {
        briefGeneratedAt: brief.generated_at,
        timezone: edition.timezone || undefined,
        modelOverride: model,
        continuityContext: continuity.length > 0 ? continuity : undefined,
        gatheredPages: pagesFromStored(brief.sources),
        sourceRepair: opts.isPriority,
      },
    ));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const latencyMs = Date.now() - t0;
  const costUsd = tapCostUsd(tap.calls);

  // Candidate. A refusal and "no structured stories" throw in the enricher, so
  // they are read from the error; neither publishes in production either.
  const refusal = !!error && /model refusal/i.test(error);
  const body = result?.rawResponse || null;
  const cand = result ? await checkStories(result.categories, placeNames) : { verdicts: [], pagesChecked: 0 };
  const candLeaks = residualLeaks(body, result?.subjectTeaser || null, result?.emailTeaser || null);
  const d = result?.diagnostics;
  const metrics = writerMetrics({
    body,
    categories: result?.categories || [],
    storyVerdicts: cand.verdicts,
    pagesChecked: cand.pagesChecked,
    removals: rulesForEdition(edition.id) ? (result?.editionRules?.removals || []) : null,
    refusal: refusal || isModelRefusal(body),
    jsonParseFailed: d ? (!d.jsonFound || d.jsonParseFailed) : (error && /no structured stories/i.test(error) ? true : null),
    thinkingLeakStripped: d ? d.thinkingPreambleStripped : null,
    teaserLeakStripped: d ? d.teaserLeakStripped : null,
    residualThinkingLeak: candLeaks.thinking,
    residualTeaserLeak: candLeaks.teaser,
    modelUrlsWritten: d ? d.modelUrlsWritten : null,
    groundingQueries: d ? d.groundingQueries : null,
    latencyMs,
    costUsd,
    thoughtsTokens: thoughtsOf(tap.calls),
  });

  // Production, from what it stored. Leak "stripped" flags and latency were
  // never recorded, so they are null; residual leaks are checked on the text.
  const base = await checkStories(brief.enriched_categories, placeNames);
  const baseLeaks = residualLeaks(brief.enriched_content, brief.subject_teaser, brief.email_teaser);
  const baseCost = await baselineCost(admin, edition.name, ['enrich_daily_brief', 'source_repair', 'edition_rules_review'], brief.enriched_at, 15 * 60_000, 60_000);
  const baseCategories = Array.isArray(brief.enriched_categories) ? brief.enriched_categories : [];
  const baselineMetrics = writerMetrics({
    body: brief.enriched_content,
    categories: baseCategories,
    storyVerdicts: base.verdicts,
    pagesChecked: base.pagesChecked,
    removals: await baselineRemovals(admin, edition.id, brief.id),
    refusal: isModelRefusal(brief.enriched_content),
    jsonParseFailed: baseCategories.length === 0,
    thinkingLeakStripped: null,
    teaserLeakStripped: null,
    residualThinkingLeak: baseLeaks.thinking,
    residualTeaserLeak: baseLeaks.teaser,
    modelUrlsWritten: null,
    groundingQueries: null,
    latencyMs: null,
    costUsd: baseCost,
    thoughtsTokens: null,
  });

  return {
    run_date: brief.brief_date,
    neighborhood_id: edition.id,
    stage: 'writer',
    model,
    baseline_model: brief.enrichment_model,
    output: result
      ? {
          brief_id: brief.id,
          body,
          categories: result.categories,
          subject_teaser: result.subjectTeaser,
          email_teaser: result.emailTeaser,
          source_settling: result.sourceSettling || null,
          edition_rules: result.editionRules || null,
          diagnostics: result.diagnostics || null,
          calls: tap.calls,
        }
      : { brief_id: brief.id, calls: tap.calls },
    metrics,
    baseline_metrics: baselineMetrics,
    cost_usd: Number(costUsd.toFixed(6)),
    latency_ms: latencyMs,
    error,
  };
}

// ─── Search stage ──────────────────────────────────────────────────────────

/** Load each citation the way a reader would: X posts through the public syndication endpoint, the rest as pages. */
export async function checkCitations(urls: string[], placeNames: string[]): Promise<CitationCheck[]> {
  const targets = urls.slice(0, MAX_CITATION_CHECKS);
  const out: CitationCheck[] = [];
  await pool(targets, FETCH_CONCURRENCY, async (url) => {
    const id = (url.match(X_STATUS) || [])[2];
    if (id) {
      const post = await readXPost(id);
      const text = post ? [post.name, post.handle, post.text, post.quotedText].filter(Boolean).join(' ') : null;
      out.push({ url, loaded: !!post, mentionsPlace: mentionsPlace(text, placeNames) });
      return;
    }
    const page = await fetchPage(url);
    out.push({ url, loaded: page.ok && !!page.text, mentionsPlace: mentionsPlace(page.text, placeNames) });
  });
  return out;
}

function grokUrls(sources: unknown): string[] {
  if (!Array.isArray(sources)) return [];
  const out: string[] = [];
  for (const s of sources as Array<{ url?: string; origin?: string }>) {
    if (s?.origin !== 'grok' || !isHttp(s.url)) continue;
    if (!out.includes(s.url.trim())) out.push(s.url.trim());
  }
  return out;
}

function postsRead(usage: unknown): number | null {
  const n = (usage as { server_side_tool_usage_details?: { x_posts_fetched?: number } } | null)?.server_side_tool_usage_details?.x_posts_fetched;
  return typeof n === 'number' ? n : null;
}

interface SearchSide {
  model: string;
  result: Awaited<ReturnType<typeof generateNeighborhoodBrief>>;
  error: string | null;
  latencyMs: number;
  calls: TappedCall[];
  costUsd: number;
}

async function searchOnce(
  model: string,
  args: { searchName: string; edition: TrialEdition; recentTopics: string[]; suppressWrite?: boolean },
): Promise<SearchSide> {
  const tap: UsageTap = { operation: 'trial_search', calls: [], suppressWrite: args.suppressWrite };
  const { searchName, edition, recentTopics } = args;
  let result: SearchSide['result'] = null;
  let error: string | null = null;
  const t0 = Date.now();
  try {
    result = await withUsageTap(tap, () => generateNeighborhoodBrief(
      searchName, edition.city, edition.country || undefined, undefined, edition.timezone || undefined, recentTopics, edition.id, { model, stream: true },
    ));
    if (!result) error = 'search returned nothing';
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return { model, result, error, latencyMs: Date.now() - t0, calls: tap.calls, costUsd: tapCostUsd(tap.calls) };
}

/**
 * The candidate and a same-time control run of production's own model, in
 * parallel on the same prompt. The control is the baseline: what production
 * stored was searched hours earlier, and X at 03:00 local is not X at 11:00,
 * so comparing against it alone would measure the clock as much as the
 * model. What production stored is kept in the output for reference.
 */
export async function runSearchTrial(
  admin: SupabaseClient,
  edition: TrialEdition,
  brief: TrialBrief,
  opts: { model?: string; controlModel?: string; suppressWrite?: boolean },
): Promise<TrialRunRow> {
  const model = opts.model || TRIAL_SEARCH_MODEL;
  const controlModel = opts.controlModel || AI_MODELS.GROK_FAST;
  const searchName = searchCatchmentFor(edition.id, edition.name);
  const placeNames = placeNamesFor(edition.name, [...searchCatchmentPlaces(edition.id)]);

  // The anti-repetition list production gave Grok: recent headlines, newest first.
  const { data: recent } = await admin
    .from('neighborhood_briefs')
    .select('headline')
    .eq('neighborhood_id', edition.id)
    .lt('brief_date', brief.brief_date)
    .gte('brief_date', new Date(new Date(brief.brief_date).getTime() - 7 * 86400_000).toISOString().slice(0, 10))
    .order('generated_at', { ascending: false })
    .limit(10);
  const recentTopics = (recent || []).map((r) => r.headline as string).filter(Boolean);

  const args = { searchName, edition, recentTopics, suppressWrite: opts.suppressWrite };
  const [cand, control] = await Promise.all([searchOnce(model, args), searchOnce(controlModel, args)]);

  const measure = async (side: SearchSide) => {
    const urls = (side.result?.sources || []).map((s) => s.url).filter(isHttp);
    const checks = side.result ? await checkCitations(urls, placeNames) : [];
    return {
      checks,
      metrics: searchMetrics(urls, checks, {
        latencyMs: side.latencyMs,
        costUsd: side.calls.length ? side.costUsd : null,
        failed: !side.result,
        postsRead: postsRead(side.result?.usage),
        headline: side.result?.headline,
        content: side.result?.content,
      }),
    };
  };
  const [c, k] = await Promise.all([measure(cand), measure(control)]);

  // What production actually stored that day (Grok citations only). When the
  // brief's model is not Grok, Grok failed that day and there is none.
  const storedIsGrok = (brief.model || '').startsWith('grok');
  const storedUrls = storedIsGrok ? grokUrls(brief.sources) : [];
  const storedChecks = storedIsGrok ? await checkCitations(storedUrls, placeNames) : [];
  const storedCost = storedIsGrok
    ? await baselineCost(admin, `${searchName}, ${edition.city}`, ['neighborhood_brief'], brief.generated_at, 5 * 60_000, 60_000)
    : null;
  const storedMetrics = storedIsGrok ? searchMetrics(storedUrls, storedChecks, { latencyMs: null, costUsd: storedCost, failed: false, headline: brief.headline, content: null }) : null;

  const sideOutput = (side: SearchSide, checks: CitationCheck[]) => ({
    model: side.model,
    headline: side.result?.headline ?? null,
    content: side.result?.content ?? null,
    citations: side.result?.sources ?? [],
    usage: side.result?.usage ?? null,
    estimated_cost_usd: Number(side.calls.reduce((n, x) => n + x.estimatedCostUsd, 0).toFixed(6)),
    billed_cost_usd: Number(side.costUsd.toFixed(6)),
    checks,
    error: side.error,
  });

  return {
    run_date: brief.brief_date,
    neighborhood_id: edition.id,
    stage: 'search',
    model,
    baseline_model: controlModel,
    output: {
      brief_id: brief.id,
      candidate: sideOutput(cand, c.checks),
      control: sideOutput(control, k.checks),
      stored: { model: brief.model, generated_at: brief.generated_at, metrics: storedMetrics, checks: storedChecks },
      searched_at: new Date().toISOString(),
    },
    metrics: c.metrics,
    baseline_metrics: k.metrics,
    cost_usd: Number(cand.costUsd.toFixed(6)),
    latency_ms: cand.latencyMs,
    error: cand.error,
  };
}
