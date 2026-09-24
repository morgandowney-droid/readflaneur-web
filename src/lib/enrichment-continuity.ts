/**
 * Recent coverage for an edition, given to the enrichment model as
 * continuity context. Moved out of the enrich-briefs route (unchanged) so the
 * shadow model trial (model-trial.ts) gives a candidate model the exact
 * context production gives its own.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContinuityItem } from '@/lib/brief-enricher-gemini';

/**
 * Truncate text to ~200 chars at a sentence boundary.
 */
function truncateToSentence(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  // Find last sentence-ending punctuation
  const lastPeriod = truncated.lastIndexOf('.');
  const lastExcl = truncated.lastIndexOf('!');
  const lastQ = truncated.lastIndexOf('?');
  const end = Math.max(lastPeriod, lastExcl, lastQ);
  if (end > 50) return truncated.slice(0, end + 1); // At least 50 chars
  // No sentence boundary - truncate at last space
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) + '...' : truncated;
}

/**
 * Fetch recent coverage history for a neighborhood to give Gemini continuity context.
 * Returns last 10 days of enriched briefs (headline + excerpt) and last 7 days of
 * non-brief articles (headline + article_type). Extended windows catch persistent
 * topics that repeat across 1-2 weeks.
 */
export async function fetchContinuityContext(
  supabase: SupabaseClient,
  neighborhoodId: string,
  excludeBriefId: string,
  timezone: string,
  /** Only coverage from before this instant (a replay of an earlier enrichment). Production omits it. */
  before?: string,
): Promise<ContinuityItem[]> {
  const items: ContinuityItem[] = [];

  try {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Query 1: Last 10 days of enriched briefs (exclude current) - extended
    // from 5 days to catch persistent topics that repeat across 1-2 weeks
    let briefQuery = supabase
      .from('neighborhood_briefs')
      .select('id, headline, enriched_content, generated_at')
      .eq('neighborhood_id', neighborhoodId)
      .neq('id', excludeBriefId)
      .not('enriched_content', 'is', null)
      .gte('generated_at', tenDaysAgo.toISOString())
      .order('generated_at', { ascending: false })
      .limit(10);
    if (before) briefQuery = briefQuery.lt('generated_at', before);
    const { data: recentBriefs } = await briefQuery;

    // Query 2: Last 7 days of published articles (exclude brief_summary) -
    // extended from 3 days to give Gemini broader awareness of recent coverage
    let articleQuery = supabase
      .from('articles')
      .select('headline, article_type, published_at')
      .eq('neighborhood_id', neighborhoodId)
      .eq('status', 'published')
      .neq('article_type', 'brief_summary')
      .gte('published_at', sevenDaysAgo.toISOString())
      .order('published_at', { ascending: false })
      .limit(20);
    if (before) articleQuery = articleQuery.lt('published_at', before);
    const { data: recentArticles } = await articleQuery;

    const tz = timezone || 'America/New_York';

    if (recentBriefs) {
      for (const b of recentBriefs) {
        const dateStr = new Date(b.generated_at).toLocaleDateString('en-US', {
          timeZone: tz,
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        // Strip section headers and clean for excerpt
        const cleanContent = (b.enriched_content || '')
          .replace(/\[\[[^\]]+\]\]/g, '')
          .replace(/\n+/g, ' ')
          .trim();
        items.push({
          date: dateStr,
          headline: b.headline || 'Daily Brief',
          excerpt: truncateToSentence(cleanContent),
          type: 'brief',
        });
      }
    }

    if (recentArticles) {
      for (const a of recentArticles) {
        const dateStr = new Date(a.published_at).toLocaleDateString('en-US', {
          timeZone: tz,
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        items.push({
          date: dateStr,
          headline: a.headline || 'Article',
          type: 'article',
          articleType: a.article_type || undefined,
        });
      }
    }
  } catch (err) {
    // Non-fatal: enrichment proceeds without context
    console.warn(`[enrich-briefs] Failed to fetch continuity context for ${neighborhoodId}:`, err);
  }

  return items;
}
