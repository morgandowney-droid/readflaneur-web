/**
 * Does the Grok (X) search earn its place for an edition?
 *
 * Measured 2 Oct 2026 over 914 briefs (scripts/measure-grok-contribution.mjs):
 * the Grok brief search found nothing reportable in 64% of briefs, and only
 * 12% of published stories came from Grok alone. By market: USA 25%, Spain
 * 19%, Ireland 13%, UK 11%, Canada 11%, but Austria 1%, Germany 3%, Italy 4%,
 * Norway 3%, Portugal 0%, Australia 5%, New Zealand 6%. Grok is about 60% of
 * the AI bill (its search fee, which no token discount touches), so at OECD
 * scale it should run where it adds stories.
 *
 * The rule (Morgan, options 2 and 3):
 *  - an edition where Grok was the only source of at least 8% of its stories
 *    (and at least two) in the last 14 days keeps Grok, whatever its country;
 *  - otherwise, in a market where Grok rarely adds (GROK_OFF_COUNTRIES), and in
 *    any market for an edition with at least 7 Grok searches and nothing to
 *    show for them, Grok runs only on a weekly probe day, so a source that
 *    starts posting local news is noticed and the edition earns Grok back.
 * Only priority editions run Grok at all (unchanged).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Markets where Grok added 0-6% of published stories (2 Oct 2026). */
export const GROK_OFF_COUNTRIES: ReadonlySet<string> = new Set([
  'austria', 'germany', 'italy', 'norway', 'portugal', 'australia', 'new zealand',
]);

const WINDOW_DAYS = 14;
const MIN_HISTORY = 7;
const PROBE_INTERVAL_DAYS = 7;
/**
 * Grok earns its place when, over the window, it was the only source of at
 * least this share of the edition's stories, and of at least two of them. One
 * stray match is almost certain across ~70 stories, so a single story is not
 * enough (2 Oct: that bar kept Grok on 83 of 92 editions; this one keeps 46).
 */
const MIN_GROK_SHARE = 0.08;
const MIN_GROK_STORIES = 2;

const STOP = new Set(['the', 'this', 'that', 'with', 'from', 'today', 'tonight', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'local', 'residents', 'city', 'town', 'council', 'street', 'road', 'free', 'new', 'event', 'festival', 'market']);

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function distinctive(text: string, placeWords: Set<string>): string[] {
  const caps = (text.match(/\b[\p{Lu}][\p{L}'’-]{3,}/gu) || []).map(fold).filter((w) => !STOP.has(w) && !placeWords.has(w));
  const nums = (text.match(/\b\d{2,}\b/g) || []).filter((n) => !/^(19|20)\d\d$/.test(n));
  return Array.from(new Set([...caps, ...nums]));
}

function coverage(words: string[], hay: string): number {
  return words.length ? words.filter((w) => hay.includes(w)).length / words.length : 0;
}

export interface Contribution { grokOnly: number; geminiOnly: number; both: number; neither: number; stories: number }

interface StoryLike { entity?: string; context?: string }

/**
 * Where each published story's facts came from. The stored brief content holds
 * Grok's text first and the Gemini facts after "ALSO NOTED:"; a story counts
 * for a search when at least half its distinctive words (capitalised words and
 * figures, place names excluded) appear in that search's text.
 */
export function storyContributions(
  content: string | null | undefined,
  categories: unknown,
  place: { name: string; city: string; country?: string | null },
): Contribution {
  const out: Contribution = { grokOnly: 0, geminiOnly: 0, both: 0, neither: 0, stories: 0 };
  const split = (content || '').split(/\n\s*ALSO NOTED:\s*\n/);
  const grokText = fold(split[0] || '');
  const geminiText = fold(split.slice(1).join(' '));
  const placeWords = new Set(fold(`${place.name} ${place.city} ${place.country || ''}`).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const cats = Array.isArray(categories) ? categories : ((categories as { categories?: unknown[] } | null)?.categories || []);
  for (const c of cats as Array<{ stories?: StoryLike[] }>) {
    for (const st of c?.stories || []) {
      const words = distinctive(`${st.entity || ''} ${st.context || ''}`, placeWords);
      if (!words.length) continue;
      const g = coverage(words, grokText) >= 0.5;
      const m = coverage(words, geminiText) >= 0.5;
      out.stories++;
      if (g && m) out.both++;
      else if (g) out.grokOnly++;
      else if (m) out.geminiOnly++;
      else out.neither++;
    }
  }
  return out;
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** True on the edition's weekly probe day (spread across editions by id). */
export function isGrokProbeDay(editionId: string, localDate: string): boolean {
  const day = Math.floor(Date.parse(`${localDate}T12:00:00Z`) / 86_400_000);
  return djb2(editionId) % PROBE_INTERVAL_DAYS === day % PROBE_INTERVAL_DAYS;
}

export interface GrokDecision { useGrok: boolean; reason: string }

/** Decide from history already loaded: the last 14 days' briefs on which Grok ran. */
export function decideGrok(
  edition: { id: string; name: string; city: string; country?: string | null },
  localDate: string,
  grokBriefs: Array<{ content: string | null; enriched_categories: unknown }>,
): GrokDecision {
  let grokOnly = 0;
  let stories = 0;
  for (const b of grokBriefs) {
    const c = storyContributions(b.content, b.enriched_categories, edition);
    grokOnly += c.grokOnly;
    stories += c.stories;
  }
  if (grokOnly >= MIN_GROK_STORIES && stories > 0 && grokOnly / stories >= MIN_GROK_SHARE) {
    return { useGrok: true, reason: `grok-only-${Math.round((100 * grokOnly) / stories)}pct-of-stories` };
  }
  const offMarket = GROK_OFF_COUNTRIES.has((edition.country || '').toLowerCase());
  const provenEmpty = grokBriefs.length >= MIN_HISTORY;
  if (!offMarket && !provenEmpty) return { useGrok: true, reason: 'grok-market' };
  if (isGrokProbeDay(edition.id, localDate)) return { useGrok: true, reason: 'weekly-probe' };
  return { useGrok: false, reason: offMarket ? 'off-market-no-recent-grok-story' : 'no-grok-story-in-14-days' };
}

/** Load the edition's recent Grok briefs and decide. Never throws: on a read error, Grok runs. */
export async function grokDecision(
  supabase: SupabaseClient,
  edition: { id: string; name: string; city: string; country?: string | null },
  localDate: string,
): Promise<GrokDecision> {
  try {
    const since = new Date(Date.parse(`${localDate}T12:00:00Z`) - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('neighborhood_briefs')
      .select('content, enriched_categories')
      .eq('neighborhood_id', edition.id)
      .like('model', 'grok%')
      .gte('brief_date', since)
      .lt('brief_date', localDate)
      .not('enriched_content', 'is', null)
      .limit(WINDOW_DAYS);
    if (error) return { useGrok: true, reason: `history-unreadable: ${error.message}` };
    return decideGrok(edition, localDate, data || []);
  } catch (e) {
    return { useGrok: true, reason: `history-unreadable: ${e instanceof Error ? e.message : String(e)}` };
  }
}
