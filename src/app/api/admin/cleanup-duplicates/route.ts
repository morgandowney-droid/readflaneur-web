import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Duplicate Article Cleanup
 *
 * GET ?dry-run=true  — Preview what would be archived (default: dry run)
 * GET ?dry-run=false — Actually archive duplicates
 * GET ?mode=tight    — Fuzzy matching (word overlap + combo cross-component)
 * GET ?mode=standard — First-40-char matching (default)
 *
 * Standard mode: Groups by neighborhood_id + first 40 chars of normalized headline
 * Tight mode: Three passes:
 *   Pass 1: Exact headline match (same neighborhood, same headline text)
 *   Pass 2: Word-overlap similarity > 0.65 (same neighborhood, 48h window)
 *   Pass 3: Combo cross-component dedup (same headline across component neighborhoods)
 */

export const maxDuration = 120;

type Article = {
  id: string;
  neighborhood_id: string;
  headline: string;
  image_url: string | null;
  enriched_at: string | null;
  body_text: string | null;
  created_at: string;
  slug: string;
};

function normalizeHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .substring(0, 40);
}

/** Extract significant words (3+ chars, no stopwords) */
function extractWords(headline: string): Set<string> {
  const stopwords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has',
    'her', 'was', 'one', 'our', 'out', 'its', 'his', 'how', 'new', 'now',
    'old', 'see', 'way', 'who', 'did', 'get', 'let', 'say', 'she', 'too',
    'use', 'from', 'with', 'this', 'that', 'have', 'been', 'will', 'more',
    'when', 'what', 'your', 'than', 'them', 'then', 'into', 'just', 'also',
    'amid', 'near', 'over', 'daily', 'brief',
  ]);
  return new Set(
    headline
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopwords.has(w))
  );
}

/** Jaccard similarity between two word sets */
function wordSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function scoreArticle(article: Article): number {
  let score = 0;
  if (article.image_url && article.image_url.length > 5 && !article.image_url.endsWith('.svg')) score += 100;
  if (article.enriched_at) score += 50;
  if (article.body_text && article.body_text.length > 500) score += 25;
  // Older articles get a small bonus (they were first)
  score += Math.max(0, 10 - Math.floor((Date.now() - new Date(article.created_at).getTime()) / (1000 * 60 * 60 * 24)));
  return score;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry-run') !== 'false';
  const daysBack = parseInt(url.searchParams.get('days') || '30');
  const mode = url.searchParams.get('mode') || 'standard';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  // Fetch all published articles in the window
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, neighborhood_id, headline, image_url, enriched_at, body_text, created_at, slug')
    .eq('status', 'published')
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!articles || articles.length === 0) {
    return NextResponse.json({ message: 'No articles found', duplicates: 0 });
  }

  const toArchive = new Set<string>();
  const duplicateGroups: Array<{
    pass: string;
    headline_kept: string;
    headline_archived: string;
    keep: string;
    archive: string[];
  }> = [];

  if (mode === 'tight') {
    // ─── Pass 1: Exact headline match (same neighborhood) ───
    const exactGroups = new Map<string, Article[]>();
    for (const article of articles) {
      if (!article.headline || toArchive.has(article.id)) continue;
      const key = `${article.neighborhood_id}::${article.headline.toLowerCase().trim()}`;
      const group = exactGroups.get(key) || [];
      group.push(article);
      exactGroups.set(key, group);
    }

    for (const [, group] of exactGroups) {
      if (group.length <= 1) continue;
      group.sort((a, b) => scoreArticle(b) - scoreArticle(a));
      const keeper = group[0];
      const dupes = group.slice(1);
      for (const d of dupes) toArchive.add(d.id);
      duplicateGroups.push({
        pass: 'exact',
        headline_kept: keeper.headline,
        headline_archived: dupes[0].headline,
        keep: keeper.id,
        archive: dupes.map(d => d.id),
      });
    }

    // ─── Pass 2: Word-overlap similarity (same neighborhood, 48h window) ───
    // Group articles by neighborhood first, then compare within each group
    const byNeighborhood = new Map<string, Article[]>();
    for (const article of articles) {
      if (!article.headline || toArchive.has(article.id)) continue;
      const group = byNeighborhood.get(article.neighborhood_id) || [];
      group.push(article);
      byNeighborhood.set(article.neighborhood_id, group);
    }

    for (const [, neighborhoodArticles] of byNeighborhood) {
      // Pre-compute word sets
      const wordSets = neighborhoodArticles.map(a => ({
        article: a,
        words: extractWords(a.headline),
      }));

      for (let i = 0; i < wordSets.length; i++) {
        if (toArchive.has(wordSets[i].article.id)) continue;

        for (let j = i + 1; j < wordSets.length; j++) {
          if (toArchive.has(wordSets[j].article.id)) continue;

          const a = wordSets[i];
          const b = wordSets[j];

          // Only compare articles within 48h of each other
          const timeDiff = Math.abs(
            new Date(a.article.created_at).getTime() - new Date(b.article.created_at).getTime()
          );
          if (timeDiff > 48 * 60 * 60 * 1000) continue;

          const similarity = wordSimilarity(a.words, b.words);
          if (similarity >= 0.70) {
            // Archive the lower-scored one
            const scoreA = scoreArticle(a.article);
            const scoreB = scoreArticle(b.article);
            const [keeper, dupe] = scoreA >= scoreB
              ? [a.article, b.article]
              : [b.article, a.article];

            toArchive.add(dupe.id);
            duplicateGroups.push({
              pass: `fuzzy(${similarity.toFixed(2)})`,
              headline_kept: keeper.headline,
              headline_archived: dupe.headline,
              keep: keeper.id,
              archive: [dupe.id],
            });
          }
        }
      }
    }

    // ─── Pass 3: Combo cross-component dedup ───
    // Find combo neighborhoods and their components
    const { data: combos } = await supabase
      .from('combo_neighborhoods')
      .select('combo_id, component_id');

    if (combos && combos.length > 0) {
      // Build combo_id -> component_ids map
      const comboComponents = new Map<string, string[]>();
      for (const c of combos) {
        const existing = comboComponents.get(c.combo_id) || [];
        existing.push(c.component_id);
        comboComponents.set(c.combo_id, existing);
      }

      // For each combo, find articles with identical headlines across components
      for (const [comboId, componentIds] of comboComponents) {
        const allIds = [comboId, ...componentIds];
        const comboArticles = articles.filter(
          a => allIds.includes(a.neighborhood_id) && !toArchive.has(a.id) && a.headline
        );

        // Group by exact headline
        const headlineGroups = new Map<string, Article[]>();
        for (const a of comboArticles) {
          const key = a.headline.toLowerCase().trim();
          const group = headlineGroups.get(key) || [];
          group.push(a);
          headlineGroups.set(key, group);
        }

        for (const [, group] of headlineGroups) {
          if (group.length <= 1) continue;
          group.sort((a, b) => scoreArticle(b) - scoreArticle(a));
          const keeper = group[0];
          const dupes = group.slice(1);
          for (const d of dupes) toArchive.add(d.id);
          duplicateGroups.push({
            pass: 'combo-cross',
            headline_kept: `${keeper.headline} (${keeper.neighborhood_id})`,
            headline_archived: dupes.map(d => d.neighborhood_id).join(', '),
            keep: keeper.id,
            archive: dupes.map(d => d.id),
          });
        }
      }
    }
  } else {
    // Standard mode: first-40-char matching
    const groups = new Map<string, Article[]>();
    for (const article of articles) {
      if (!article.headline) continue;
      const key = `${article.neighborhood_id}::${normalizeHeadline(article.headline)}`;
      const group = groups.get(key) || [];
      group.push(article);
      groups.set(key, group);
    }

    for (const [, group] of groups) {
      if (group.length <= 1) continue;
      group.sort((a, b) => scoreArticle(b) - scoreArticle(a));
      const keeper = group[0];
      const dupes = group.slice(1);
      for (const d of dupes) toArchive.add(d.id);
      duplicateGroups.push({
        pass: 'standard',
        headline_kept: keeper.headline,
        headline_archived: dupes[0].headline,
        keep: keeper.id,
        archive: dupes.map(d => d.id),
      });
    }
  }

  const archiveIds = Array.from(toArchive);

  const results = {
    dry_run: dryRun,
    mode,
    total_articles_scanned: articles.length,
    duplicate_groups_found: duplicateGroups.length,
    articles_to_archive: archiveIds.length,
    archived: 0,
    errors: [] as string[],
    groups: duplicateGroups.slice(0, 30),
  };

  if (!dryRun && archiveIds.length > 0) {
    for (let i = 0; i < archiveIds.length; i += 100) {
      const batch = archiveIds.slice(i, i + 100);
      const { error: archiveError, count } = await supabase
        .from('articles')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .in('id', batch);

      if (archiveError) {
        results.errors.push(`Batch ${i}: ${archiveError.message}`);
      } else {
        results.archived += count || batch.length;
      }
    }
  }

  return NextResponse.json(results);
}
