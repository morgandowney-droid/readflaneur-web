/**
 * Shadow second-source search for HIGH-stakes stories (source-standard.ts).
 *
 * A HIGH story with exactly one confirmed source needs a second, independent
 * one to meet the tiered standard. This tries to find it, in code, the same
 * way source repair works (source-repair.ts):
 *
 *  1. ONE batched search call per brief for at most SECOND_MAX_STORIES
 *     stories (the caller supplies the search; see
 *     geminiSecondSourceSearch in source-repair-search.ts). Only the pages
 *     the search tool read (grounding chunks) are candidates; the model's
 *     own text is thrown away and it is never asked for a URL.
 *  2. A candidate must be an http article page on a different registrable
 *     domain from every source the story already has, not social, not an
 *     aggregator, not a section front (acceptableSecondCandidate).
 *  3. The page is fetched and the deterministic fact matcher must find the
 *     story on it: verified, or partial with the story's subject present.
 *
 * Shadow only: the result is recorded, never attached to a story, and the
 * writing step is never asked to find or supply a second source.
 * Bounded (stories, pages, time) and never throws.
 */
import { checkStoryAgainstText, fetchPage, type CheckVerdict, type PageText } from './source-check';
import { isListingUrl, type RepairRequest, type RepairSearch } from './source-repair';
import { acceptableSecondCandidate } from './source-standard';
import type { GroundingChunk } from './source-links';

export const SECOND_MAX_STORIES = 4;
export const SECOND_MAX_PAGES = 12;
export const SECOND_BUDGET_MS = 30_000;
const FETCH_TIMEOUT_MS = 8_000;
const FETCH_CONCURRENCY = 6;

export interface SecondSourceTarget {
  /** Caller's id for the story (e.g. "<briefId>:<index>"). */
  key: string;
  entity: string;
  context: string;
  /** The publication already confirming the story, for the prompt. */
  firstPublication: string;
  /** Every URL the story already cites; a candidate may share none of their domains. */
  existingUrls: string[];
}

export interface SecondSourceOutcome {
  key: string;
  found: boolean;
  url: string | null;
  verdict: CheckVerdict | 'no_candidate' | 'rejected' | 'not_tried';
  factsFound?: number;
  factsTotal?: number;
  subjectFound?: boolean;
  /** The page read, for the caller to archive. */
  page?: PageText;
}

export interface SecondSourceStats {
  attempted: number;
  searched: boolean;
  searchFailed: boolean;
  pagesReturned: number;
  candidatePages: number;
  pagesFetched: number;
  found: number;
  timedOut: boolean;
  ms: number;
  outcomes: SecondSourceOutcome[];
}

export async function findSecondSources(
  targets: SecondSourceTarget[],
  opts: {
    search: RepairSearch;
    placeNames?: string[];
    budgetMs?: number;
    maxStories?: number;
    maxPages?: number;
    fetcher?: (url: string, timeoutMs: number) => Promise<PageText>;
  },
): Promise<SecondSourceStats> {
  const start = Date.now();
  const budget = opts.budgetMs ?? SECOND_BUDGET_MS;
  const remaining = () => budget - (Date.now() - start);
  const stats: SecondSourceStats = {
    attempted: 0, searched: false, searchFailed: false, pagesReturned: 0, candidatePages: 0,
    pagesFetched: 0, found: 0, timedOut: false, ms: 0, outcomes: [],
  };
  try {
    const chosen = targets.slice(0, opts.maxStories ?? SECOND_MAX_STORIES);
    stats.attempted = chosen.length;
    for (const t of targets.slice(chosen.length)) stats.outcomes.push({ key: t.key, found: false, url: null, verdict: 'not_tried' });
    if (chosen.length === 0) return stats;

    const requests: RepairRequest[] = chosen.map((t, i) => ({
      n: i + 1,
      publication: t.firstPublication,
      entity: t.entity,
      context: t.context.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 240),
    }));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(budget * 0.6, remaining() - 4000)));
    let pages: GroundingChunk[] = [];
    try {
      pages = await Promise.race([
        opts.search(requests, controller.signal),
        new Promise<GroundingChunk[]>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('second-source search timed out')));
        }),
      ]);
      stats.searched = true;
    } catch {
      stats.searchFailed = true;
      if (controller.signal.aborted) stats.timedOut = true;
    } finally {
      clearTimeout(timer);
    }
    stats.pagesReturned = pages.length;

    // Candidate pages per story, then one capped list of pages to fetch.
    const perStory = chosen.map((t) => pages.filter((p) => acceptableSecondCandidate(p.uri, t.existingUrls, isListingUrl)).map((p) => p.uri));
    const urls: string[] = [];
    for (const list of perStory) for (const u of list) if (!urls.includes(u)) urls.push(u);
    const toFetch = urls.slice(0, opts.maxPages ?? SECOND_MAX_PAGES);
    stats.candidatePages = urls.length;

    const fetcher = opts.fetcher ?? ((u: string, t: number) => fetchPage(u, t));
    const fetched = new Map<string, PageText>();
    let next = 0;
    const worker = async () => {
      while (next < toFetch.length) {
        const left = remaining();
        if (left < 1500) { stats.timedOut = true; return; }
        const u = toFetch[next++];
        stats.pagesFetched++;
        try { fetched.set(u, await fetcher(u, Math.min(FETCH_TIMEOUT_MS, left - 500))); } catch { /* unreadable */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, toFetch.length) }, worker));

    const rank = (v: CheckVerdict) => (v === 'verified' ? 2 : v === 'partial' ? 1 : 0);
    chosen.forEach((t, i) => {
      const cands = perStory[i].filter((u) => fetched.has(u));
      if (perStory[i].length === 0) {
        stats.outcomes.push({ key: t.key, found: false, url: null, verdict: 'no_candidate' });
        return;
      }
      let best: SecondSourceOutcome | null = null;
      for (const u of cands) {
        const page = fetched.get(u)!;
        if (!page.ok || !page.text) continue;
        const finalUrl = page.finalUrl || u;
        // A redirect can land back on the first source's site, or on a wall.
        if (!acceptableSecondCandidate(finalUrl, t.existingUrls, isListingUrl)) continue;
        const r = checkStoryAgainstText({ entity: t.entity, context: t.context }, page.text, opts.placeNames || []);
        const subjectFound = r.facts.some((f) => f.kind === 'entity' && f.found);
        const ok = r.verdict === 'verified' || (r.verdict === 'partial' && subjectFound);
        if (!ok) continue;
        if (!best || rank(r.verdict) > rank(best.verdict as CheckVerdict) || (rank(r.verdict) === rank(best.verdict as CheckVerdict) && r.factsFound > (best.factsFound || 0))) {
          best = { key: t.key, found: true, url: finalUrl, verdict: r.verdict, factsFound: r.factsFound, factsTotal: r.factsTotal, subjectFound, page };
        }
      }
      if (best) { stats.found++; stats.outcomes.push(best); }
      else stats.outcomes.push({ key: t.key, found: false, url: null, verdict: 'rejected' });
    });
  } catch {
    // never throws
  }
  stats.ms = Date.now() - start;
  return stats;
}
