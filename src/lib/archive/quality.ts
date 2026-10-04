/**
 * Quality control for the archive tier against the production engine.
 *
 *  scorecard  every archive edition of one country for one local date: share of
 *             areas with a brief, stories per brief, where stories came from,
 *             what the checks dropped, cost, a namesake measure (does the story
 *             name the area?) and production's own fact matcher (source-check)
 *             on a sample of stories.
 *  pair       a place covered by both: production's brief and the archive's for
 *             the same date, measured the same way, with the overlap of stories
 *             and a blind judge from a different model family (Llama 3.3 70B)
 *             that does not know which brief is which.
 *
 * Writes archive_quality; nothing here changes any edition.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { checkStorySource } from '@/lib/source-check';
import { openRouterChat } from '@/lib/openrouter-chat';
import { trialStories, isTracedSource } from '@/lib/model-trial-metrics';
import { namesPlace, searchNames, type ArchiveArea } from '@/lib/archive/sources';

export const JUDGE_MODEL = 'meta-llama/llama-3.3-70b-instruct';
const SAMPLE_PER_COUNTRY = 60;
const CHECK_PER_SIDE = 6;

/** Production editions that cover the same place as archive areas. */
export const QUALITY_PAIRS: Array<{ production: string; archive: string[]; country: string }> = [
  { production: 'duesseldorf-oberkassel', archive: ['de-dusseldorf-oberkassel'], country: 'de' },
  { production: 'berlin-prenzlauer-berg', archive: ['de-berlin-prenzlauer-berg'], country: 'de' },
  { production: 'hamburg-eppendorf', archive: ['de-hamburg-eppendorf'], country: 'de' },
  { production: 'sauerland-balve', archive: ['de-balve'], country: 'de' },
  { production: 'nrw-neuss', archive: ['de-neuss-*'], country: 'de' },
  { production: 'thueringen-drei-gleichen', archive: ['de-gotha-drei-gleichen'], country: 'de' },
  { production: 'hampshire-lymington', archive: ['uk-new-forest-lymington'], country: 'uk' },
  { production: 'sussex-lewes', archive: ['uk-lewes-lewes'], country: 'uk' },
  { production: 'birmingham-harborne', archive: ['uk-birmingham-harborne'], country: 'uk' },
  { production: 'birmingham-moseley', archive: ['uk-birmingham-moseley'], country: 'uk' },
  { production: 'london-clerkenwell', archive: ['uk-islington-clerkenwell'], country: 'uk' },
  { production: 'dorset-christchurch', archive: ['uk-bournemouth-christchurch-and-poole-christchurch'], country: 'uk' },
  { production: 'cornwall-helston', archive: ['uk-cornwall-helston'], country: 'uk' },
  { production: 'lanarkshire-east-kilbride', archive: ['uk-south-lanarkshire-east-kilbride*'], country: 'uk' },
  { production: 'ie-county-clare', archive: ['ie-clare-*'], country: 'ie' },
  { production: 'victoria-greater-shepparton', archive: ['au-shepparton-*'], country: 'au' },
  { production: 'queensland-charters-towers', archive: ['au-charters-towers-ayr-ingham-charters-towers'], country: 'au' },
  { production: 'nyc-tribeca', archive: ['us-nyc-manhattan-tribeca-civic-center'], country: 'us-nyc' },
];

/** Where a story's source lives, by host: the platforms production reaches and the archive may not. */
export function platformOf(url: string | null | undefined): string {
  if (!url) return 'none';
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return 'none'; }
  if (/(^|\.)(x|twitter)\.com$/.test(host)) return 'x';
  if (/(^|\.)(facebook|fb)\.com$/.test(host)) return 'facebook';
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)threads\.(net|com)$/.test(host)) return 'threads';
  if (/(^|\.)reddit\.com$/.test(host)) return 'reddit';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'youtube';
  if (/(^|\.)bsky\.app$/.test(host)) return 'bluesky';
  if (/nextdoor\./.test(host)) return 'nextdoor';
  return 'web';
}

export function matchesPattern(id: string, patterns: string[]): boolean {
  return patterns.some((p) => (p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : id === p));
}

interface ArchiveStoryRow { header: string; text: string; sources: number[]; crime?: boolean }
interface ArchiveEditionRow { area_id: string; body: string | null; stories: ArchiveStoryRow[] | null; sources: Array<{ n: number; url: string; kind: string; publisher: string | null }> | null; gathered: Record<string, unknown> | null; cost_usd: number | null }

async function editions(admin: SupabaseClient, country: string, date: string): Promise<ArchiveEditionRow[]> {
  const out: ArchiveEditionRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('archive_editions').select('area_id, body, stories, sources, gathered, cost_usd')
      .eq('country', country).eq('local_date', date).eq('kind', 'brief').range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data as ArchiveEditionRow[]));
    if (data.length < 1000) break;
  }
  return out;
}

function hashOrder<T>(items: T[], key: (t: T) => string, seed: string): T[] {
  return [...items].sort((a, b) => createHash('md5').update(seed + key(a)).digest('hex').localeCompare(createHash('md5').update(seed + key(b)).digest('hex')));
}

type Verdict = 'verified' | 'partial' | 'not_found' | 'fetch_failed' | 'no_source';

async function confirm(stories: Array<{ entity: string; context: string; url: string | null }>, placeNames: string[]): Promise<Record<Verdict, number>> {
  const tally: Record<Verdict, number> = { verified: 0, partial: 0, not_found: 0, fetch_failed: 0, no_source: 0 };
  await Promise.all(stories.map(async (s) => {
    if (!s.url) { tally.no_source++; return; }
    const r = await checkStorySource({ entity: s.entity, context: s.context } as never, s.url, { placeNames, timeoutMs: 8000 }).catch(() => null);
    const v = (r?.verdict || 'fetch_failed') as Verdict;
    tally[v in tally ? v : 'fetch_failed']++;
  }));
  return tally;
}

function confirmedShare(t: Record<Verdict, number>): number | null {
  const checked = t.verified + t.partial + t.not_found;
  return checked ? Number(((t.verified + t.partial) / checked).toFixed(3)) : null;
}

// ─── Country scorecard ─────────────────────────────────────────────────────

export async function scorecard(admin: SupabaseClient, country: string, areas: ArchiveArea[], date: string) {
  const rows = await editions(admin, country, date);
  const byId = new Map(areas.map((a) => [a.id, a]));
  const kinds: Record<string, number> = {};
  const drops: Record<string, number> = {};
  let stories = 0, words = 0, cost = 0, naming = 0, crimeLast = 0;
  const sample: Array<{ entity: string; context: string; url: string | null; names: string[] }> = [];
  for (const e of rows) {
    const area = byId.get(e.area_id);
    const names = area ? [...searchNames(area), area.city || '', area.kreis || ''].filter(Boolean) : [];
    stories += (e.stories || []).length;
    words += (e.body || '').split(/\s+/).length;
    cost += Number(e.cost_usd || 0);
    for (const s of e.sources || []) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
    for (const [k, v] of Object.entries(e.gathered || {})) if (k.startsWith('dropped_') && typeof v === 'number') drops[k] = (drops[k] || 0) + v;
    const ss = e.stories || [];
    if (ss.length && ss.findIndex((s) => s.crime) >= 0 && ss.slice(ss.findIndex((s) => s.crime)).every((s) => s.crime)) crimeLast++;
    for (const s of ss) {
      if (namesPlace(`${s.header} ${s.text}`, names)) naming++;
      const src = (e.sources || []).find((x) => x.n === s.sources?.[0]);
      sample.push({ entity: s.header, context: s.text, url: src?.url || null, names });
    }
  }
  const picked = hashOrder(sample, (s) => s.entity, date).slice(0, SAMPLE_PER_COUNTRY);
  const tally: Record<Verdict, number> = { verified: 0, partial: 0, not_found: 0, fetch_failed: 0, no_source: 0 };
  for (let i = 0; i < picked.length; i += 10) {
    const part = await Promise.all(picked.slice(i, i + 10).map((s) => confirm([s], s.names)));
    for (const t of part) for (const k of Object.keys(tally) as Verdict[]) tally[k] += t[k];
  }
  return {
    date, country,
    areas: areas.length, with_brief: rows.length, coverage: Number((rows.length / Math.max(1, areas.length)).toFixed(3)),
    stories, stories_per_brief: rows.length ? Number((stories / rows.length).toFixed(2)) : 0,
    median_words: rows.length ? rows.map((e) => (e.body || '').split(/\s+/).length).sort((a, b) => a - b)[Math.floor(rows.length / 2)] : 0,
    story_names_area: stories ? Number((naming / stories).toFixed(3)) : null,
    source_kinds: kinds, dropped: drops,
    sample_checked: picked.length, sample_verdicts: tally, confirmed_share: confirmedShare(tally),
    cost_usd: Number(cost.toFixed(4)), cost_per_brief: rows.length ? Number((cost / rows.length).toFixed(5)) : null,
    words_total: words, crime_stories_last: crimeLast,
  };
}

// ─── Pairs ─────────────────────────────────────────────────────────────────

/**
 * What a story is about, in a form that survives translation: names, places,
 * numbers and titles. Production writes its German editions in English and
 * the archive writes in German, so ordinary words do not match across them.
 */
function anchors(s: string): Set<string> {
  const out = new Set<string>();
  // Capitalised words that are not the first word of a sentence, and numbers.
  for (const m of s.matchAll(/(?<![.!?]\s)(?<!^)\b([A-ZÄÖÜ][\p{L}'-]{2,})/gu)) out.add(m[1].toLowerCase());
  for (const m of s.matchAll(/\b\d[\d.,:]*\b/g)) if (m[0].length >= 2) out.add(m[0]);
  for (const m of s.matchAll(/[„"“«]([^"“”»]{3,60})["”»]/g)) out.add(m[1].toLowerCase());
  return out;
}
const COMMON = new Set(['the', 'this', 'that', 'city', 'council', 'stadt', 'police', 'polizei', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag', 'october', 'oktober', 'september', 'november', 'good', 'morning', 'guten', 'morgen']);
function similar(a: string, b: string, placeNames: string[]): boolean {
  const skip = new Set([...COMMON, ...placeNames.map((p) => p.toLowerCase())]);
  const x = [...anchors(a)].filter((w) => !skip.has(w)), y = new Set([...anchors(b)].filter((w) => !skip.has(w)));
  if (!x.length || !y.size) return false;
  const both = x.filter((w) => y.has(w)).length;
  return both >= 2 || (both >= 1 && Math.min(x.length, y.size) <= 2);
}

export async function comparePair(admin: SupabaseClient, pair: typeof QUALITY_PAIRS[number], areas: ArchiveArea[], archiveCountry: string, date: string) {
  const { data: prodRows } = await admin.from('neighborhood_briefs').select('enriched_content, enriched_categories, enrichment_model')
    .eq('neighborhood_id', pair.production).eq('brief_date', date).not('enriched_content', 'is', null).limit(1);
  const prod = prodRows?.[0];
  const archRows = (await editions(admin, archiveCountry, date)).filter((e) => matchesPattern(e.area_id, pair.archive));
  const archAreas = areas.filter((a) => matchesPattern(a.id, pair.archive));
  const names = Array.from(new Set(archAreas.flatMap((a) => [...searchNames(a), a.city || '', a.kreis || '']).filter(Boolean)));

  const prodStories = trialStories(prod?.enriched_categories).map((s) => ({
    entity: s.entity || '', context: s.context || '', url: isTracedSource(s.source) ? s.source!.url!.trim() : null,
    // Any URL production recorded (traced or not), for where the story came from.
    anyUrl: (s.source?.url || '').trim() || null,
  }));
  const archStories = archRows.flatMap((e) => (e.stories || []).map((s) => ({
    entity: s.header, context: s.text, url: (e.sources || []).find((x) => x.n === s.sources?.[0])?.url || null,
    anyUrl: (e.sources || []).find((x) => x.n === s.sources?.[0])?.url || null,
  })));

  const [prodCheck, archCheck] = await Promise.all([
    confirm(prodStories.slice(0, CHECK_PER_SIDE), names), confirm(archStories.slice(0, CHECK_PER_SIDE), names),
  ]);
  const prodMatched = prodStories.map((p) => archStories.some((a) => similar(`${p.entity} ${p.context}`, `${a.entity} ${a.context}`, names)));
  const prodFoundInArch = prodMatched.filter(Boolean).length;
  // The social gap: production's stories the archive missed, by the platform production sourced them from.
  const missedByPlatform: Record<string, number> = {};
  const prodByPlatform: Record<string, number> = {};
  prodStories.forEach((p, i) => {
    const pl = platformOf(p.anyUrl);
    prodByPlatform[pl] = (prodByPlatform[pl] || 0) + 1;
    if (!prodMatched[i]) missedByPlatform[pl] = (missedByPlatform[pl] || 0) + 1;
  });
  const archFoundInProd = archStories.filter((a) => prodStories.some((p) => similar(`${p.entity} ${p.context}`, `${a.entity} ${a.context}`, names))).length;

  let judge: Record<string, unknown> | null = null;
  if (prodStories.length && archStories.length) {
    // Blind: which brief is "A" depends on a hash of the date and place, not on the system.
    const prodIsA = createHash('md5').update(date + pair.production).digest()[0] % 2 === 0;
    const fmt = (ss: typeof prodStories) => ss.slice(0, 8).map((s, i) => `${i + 1}. ${s.entity}: ${s.context}`).join('\n');
    const A = prodIsA ? prodStories : archStories, B = prodIsA ? archStories : prodStories;
    const prompt = `Two local morning news briefs for ${names[0] || pair.production} on ${date}. You are an experienced local editor. Judge them as a resident reader would.

BRIEF A:
${fmt(A)}

BRIEF B:
${fmt(B)}

Answer in JSON only:
{"preferred": "A" or "B" or "tie", "why": "one sentence", "problems": [{"brief": "A" or "B", "story": number, "issue": "wrong_place" or "stale" or "not_news" or "national_not_local" or "sensitive_named"}]}
List a problem only when you are confident. The two briefs may be in different languages; judge the news, not the language, the style or the number of stories.`;
    try {
      const r = await openRouterChat({ model: JUDGE_MODEL, prompt, operation: 'archive_quality_judge', label: pair.production, maxTokens: 600, temperature: 0, json: true, timeoutMs: 60_000 });
      const raw = r.text.replace(/```(?:json)?/g, '').trim();
      const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      const side = (x: string) => (x === 'tie' ? 'tie' : (x === 'A') === prodIsA ? 'production' : 'archive');
      judge = {
        preferred: side(String(j.preferred)), why: j.why || null,
        problems: (Array.isArray(j.problems) ? j.problems : []).map((p: { brief: string; story: number; issue: string }) => ({ side: side(p.brief), story: p.story, issue: p.issue })),
        cost_usd: r.costUsd,
      };
    } catch (err) {
      judge = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    date, production: pair.production, archive: archRows.map((e) => e.area_id),
    production_stories: prodStories.length, archive_stories: archStories.length,
    production_sourced: prodStories.filter((s) => s.url).length, archive_sourced: archStories.filter((s) => s.url).length,
    production_confirmed: confirmedShare(prodCheck), archive_confirmed: confirmedShare(archCheck),
    production_checks: prodCheck, archive_checks: archCheck,
    overlap: { production_found_in_archive: prodFoundInArch, archive_found_in_production: archFoundInProd },
    production_by_platform: prodByPlatform, production_missed_by_platform: missedByPlatform,
    judge, production_model: prod?.enrichment_model || null,
  };
}
