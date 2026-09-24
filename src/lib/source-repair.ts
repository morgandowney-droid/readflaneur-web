/**
 * Source repair: find the page behind a story that names a publication but
 * has no page traced to it.
 *
 * Why (measured 2026-09-24 across 52 pilot editions): the enrichment model was
 * asked for a URL on every story and wrote one whether or not it had one. 109
 * story URLs appeared in no search tool's metadata and 60 of them were 404 or
 * 410. The enricher no longer asks for URLs and drops any it is given that no
 * tool returned (cleanStorySources with `traced`). That leaves stories with a
 * publication name and no page. This module finds that page, in code:
 *
 *  1. ONE search call per brief covers every eligible story (the caller
 *     supplies it; see source-repair-search.ts). Only the pages the search
 *     tool itself returned (grounding chunks) are used, never a URL the
 *     model writes in its answer.
 *  2. A candidate page must be on the named publication's own host
 *     (hostMatchesPublication) and be an article, not a section front
 *     (isListingUrl).
 *  3. The page is fetched and the deterministic fact matcher (source-check.ts)
 *     must find the story on it: verdict verified, or partial with the
 *     story's subject or at least two of its facts on the page (a single
 *     date on a section front is not a source).
 *
 * Bounded: at most REPAIR_MAX_STORIES stories per brief, four candidate pages
 * per story (up to two already read by this pipeline's searches), a total
 * time budget, and it never throws. Nothing is attached that failed any step;
 * the story keeps its name and no URL.
 */

import {
  hostMatchesPublication,
  isHttpUrl,
  isPlaceholderSourceName,
  type GroundingChunk,
  type SourceRef,
} from './source-links';
import { checkStoryAgainstText, fetchPage, type CheckVerdict, type PageText } from './source-check';

export const REPAIR_MAX_STORIES = 8;
export const REPAIR_BUDGET_MS = 25_000;
const CANDIDATES_PER_STORY = 4;
const KNOWN_PER_STORY = 2;
const FETCH_CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 8_000;

export interface RepairStory {
  entity?: string;
  context?: string;
  source: SourceRef | null;
}

export interface RepairRequest {
  /** 1-based, as listed in the search prompt. */
  n: number;
  publication: string;
  entity: string;
  context: string;
}

/** The search: one call for all requests, returning the pages the search tool read (resolved, not redirects). */
export type RepairSearch = (requests: RepairRequest[], signal: AbortSignal) => Promise<GroundingChunk[]>;

export interface RepairStats {
  eligible: number;
  attempted: number;
  searched: boolean;
  searchFailed: boolean;
  pagesReturned: number;
  candidatePages: number;
  pagesFetched: number;
  accepted: number;
  ms: number;
  timedOut: boolean;
  /** One line per attempted story, for logs and the local sample. */
  outcomes: Array<{ entity: string; publication: string; url: string | null; verdict: CheckVerdict | 'no_candidate' | 'rejected'; factsFound?: number; factsTotal?: number }>;
}

/**
 * A section front, tag page or listing rather than an article: the site root,
 * a single path segment ("/corknews/"), a last segment that names a section
 * ("/news/cork-news/", "/latest/", "/events/"), or a pager. Its text changes
 * daily, so a story found on it today is gone from it tomorrow.
 */
export function isListingUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return true; }
  if (/[?&](page|p|paged|offset)=/i.test(u.search)) return true;
  const segs = u.pathname.split('/').filter(Boolean).filter(s => !/^[a-z]{2}(-[a-z]{2})?$/i.test(s));
  if (segs.length <= 1 && !/\d{3,}|\.html?$|-.*-.*-/.test(segs[0] || '')) return true;
  const last = (segs[segs.length - 1] || '').toLowerCase();
  return /^(news|latest|local|category|categories|tag|tags|topic|topics|section|sections|events?|whats-on|archive|page|index(\.html?)?)$/.test(last) || /(^|-)news$/.test(last);
}

/** Stories a repair search may help: a real publication named, no URL. */
export function repairEligible<T extends RepairStory>(stories: T[]): T[] {
  return stories.filter(s =>
    !!s.source &&
    typeof s.source.name === 'string' &&
    !isPlaceholderSourceName(s.source.name) &&
    !isHttpUrl(s.source.url) &&
    !!(s.entity || '').trim());
}

/**
 * Try to attach a checked page to each eligible story, in place. The caller
 * decides whether repair runs at all (priority editions only).
 */
export async function repairStorySources<T extends RepairStory>(
  stories: T[],
  opts: {
    search: RepairSearch;
    placeNames?: string[];
    exclude?: (url: string) => boolean;
    /**
     * Pages this pipeline's searches already read. Those on the named
     * publication's host are checked too (at most two per story), ahead of
     * the repair search's own pages.
     */
    knownPages?: GroundingChunk[];
    budgetMs?: number;
    maxStories?: number;
    /** Injectable for tests. */
    fetcher?: (url: string, timeoutMs: number) => Promise<PageText>;
  },
): Promise<RepairStats> {
  const start = Date.now();
  const budget = opts.budgetMs ?? REPAIR_BUDGET_MS;
  const deadline = start + budget;
  const remaining = () => deadline - Date.now();
  const stats: RepairStats = {
    eligible: 0, attempted: 0, searched: false, searchFailed: false, pagesReturned: 0,
    candidatePages: 0, pagesFetched: 0, accepted: 0, ms: 0, timedOut: false, outcomes: [],
  };
  try {
    const eligible = repairEligible(stories);
    stats.eligible = eligible.length;
    const targets = eligible.slice(0, opts.maxStories ?? REPAIR_MAX_STORIES);
    stats.attempted = targets.length;
    if (targets.length === 0) return stats;

    const requests: RepairRequest[] = targets.map((s, i) => ({
      n: i + 1,
      publication: (s.source as SourceRef).name.trim(),
      entity: (s.entity || '').trim(),
      context: (s.context || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 240),
    }));

    // The search gets most of the budget; fetches share what is left.
    const controller = new AbortController();
    const searchTimeout = Math.max(1000, Math.min(budget * 0.6, remaining() - 4000));
    const timer = setTimeout(() => controller.abort(), searchTimeout);
    let pages: GroundingChunk[] = [];
    try {
      pages = await Promise.race([
        opts.search(requests, controller.signal),
        new Promise<GroundingChunk[]>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('repair search timed out')));
        }),
      ]);
      stats.searched = true;
    } catch (err) {
      stats.searchFailed = true;
      if (controller.signal.aborted) stats.timedOut = true;
      console.warn(`[source-repair] search failed: ${err instanceof Error ? err.message : String(err)}`);
      pages = [];
    } finally {
      clearTimeout(timer);
    }
    pages = pages.filter(p => isHttpUrl(p.uri) && !(opts.exclude && opts.exclude(p.uri)));
    stats.pagesReturned = pages.length;

    // Candidates per story: pages on the named publication's own host.
    const known = (opts.knownPages || []).filter(p => isHttpUrl(p.uri) && !(opts.exclude && opts.exclude(p.uri)));
    const perStory = targets.map(s => {
      const name = (s.source as SourceRef).name;
      const seen = new Set<string>();
      const onHost = (list: GroundingChunk[]) => list.filter(p => {
        if (seen.has(p.uri) || !hostMatchesPublication(name, p.uri) || isListingUrl(p.uri)) return false;
        seen.add(p.uri);
        return true;
      });
      return [...onHost(known).slice(0, KNOWN_PER_STORY), ...onHost(pages)].slice(0, CANDIDATES_PER_STORY);
    });
    const urls = [...new Set(perStory.flat().map(p => p.uri))];
    stats.candidatePages = urls.length;

    // Fetch each candidate once, a few at a time, inside the budget.
    const fetcher = opts.fetcher ?? ((u: string, t: number) => fetchPage(u, t));
    const fetched = new Map<string, PageText>();
    let next = 0;
    const worker = async () => {
      while (next < urls.length) {
        const left = remaining();
        if (left < 1500) { stats.timedOut = true; return; }
        const u = urls[next++];
        stats.pagesFetched++;
        try { fetched.set(u, await fetcher(u, Math.min(FETCH_TIMEOUT_MS, left - 500))); } catch { /* unreadable */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, urls.length) }, worker));

    const rank = (v: CheckVerdict) => (v === 'verified' ? 2 : v === 'partial' ? 1 : 0);
    targets.forEach((story, i) => {
      const name = (story.source as SourceRef).name;
      const entity = (story.entity || '').trim();
      if (perStory[i].length === 0) {
        stats.outcomes.push({ entity, publication: name, url: null, verdict: 'no_candidate' });
        return;
      }
      let best: { url: string; verdict: CheckVerdict; found: number; total: number } | null = null;
      for (const p of perStory[i]) {
        const page = fetched.get(p.uri);
        if (!page || !page.ok || !page.text) continue;
        // A redirect can land off the publication's host (a consent wall, a
        // parked domain); then the text read is not the publication's page.
        if (page.finalUrl && (!hostMatchesPublication(name, page.finalUrl) || isListingUrl(page.finalUrl))) continue;
        const r = checkStoryAgainstText(story, page.text, opts.placeNames || []);
        if (rank(r.verdict) === 0) continue;
        const subjectFound = r.facts.some(f => f.kind === 'entity' && f.found);
        if (r.verdict === 'partial' && !subjectFound && r.factsFound < 2) continue;
        const url = page.finalUrl || p.uri;
        if (!best || rank(r.verdict) > rank(best.verdict) || (rank(r.verdict) === rank(best.verdict) && r.factsFound > best.found)) {
          best = { url, verdict: r.verdict, found: r.factsFound, total: r.factsTotal };
        }
      }
      if (!best) {
        stats.outcomes.push({ entity, publication: name, url: null, verdict: 'rejected' });
        return;
      }
      story.source = { name, url: best.url, origin: 'repair' };
      stats.accepted++;
      stats.outcomes.push({ entity, publication: name, url: best.url, verdict: best.verdict, factsFound: best.found, factsTotal: best.total });
    });
  } catch (err) {
    console.warn(`[source-repair] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  stats.ms = Date.now() - start;
  return stats;
}
