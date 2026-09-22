import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getActiveNeighborhoodIds } from '@/lib/active-neighborhoods';
import { isPriorityNeighborhood } from '@/lib/generation-cadence';
import { briefStories, classifyBriefStories } from '@/lib/story-flags';

/**
 * Editor-first flags for each morning's brief stories. See src/lib/story-flags.ts.
 *
 * Runs a few minutes after enrich-briefs and classifies every recently enriched
 * brief that has no flags yet. Priority neighbourhoods only (subscribers, Irish
 * editions, publisher pilots): about one Flash call per edition per day.
 *
 * ?neighborhood=<id or prefix> limits scope and skips the priority filter (for
 * a manual run on a pilot group, e.g. ?neighborhood=vorarlberg-).
 * ?force=true re-classifies briefs that already have flags.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const LOOKBACK_HOURS = 36;
const BATCH_LIMIT = 60;
const CONCURRENCY = 4;
const TIME_BUDGET_MS = 240_000;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  if (!cronHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';
  const only = url.searchParams.get('neighborhood');

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const results = { briefs_flagged: 0, stories_flagged: 0, editor_first: 0, skipped_not_priority: 0, failed: 0, errors: [] as string[] };

  try {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();
    let query = admin
      .from('neighborhood_briefs')
      .select('id, neighborhood_id, enriched_categories, neighborhoods!inner(name, city, country)')
      .not('enriched_content', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(BATCH_LIMIT);
    if (!force) query = query.is('story_flags', null);
    if (only) query = only.endsWith('-') ? query.like('neighborhood_id', `${only}%`) : query.eq('neighborhood_id', only);

    const { data: briefs, error } = await query;
    if (error) throw new Error(`brief query: ${error.message}`);

    let todo = briefs || [];
    if (!only) {
      const subscribed = await getActiveNeighborhoodIds(admin);
      const before = todo.length;
      todo = todo.filter((b) => isPriorityNeighborhood(b.neighborhood_id, subscribed.has(b.neighborhood_id)));
      results.skipped_not_priority = before - todo.length;
    }

    const queue = [...todo];
    const worker = async () => {
      while (queue.length && Date.now() - startTime < TIME_BUDGET_MS) {
        const b = queue.shift()!;
        const hood = b.neighborhoods as unknown as { name: string; city: string | null; country: string | null };
        const place = [hood?.name, hood?.city].filter(Boolean).join(', ');
        const stories = briefStories(b.enriched_categories);
        const flags = await classifyBriefStories(place, hood?.country || '', stories, b.neighborhood_id);
        if (!flags) {
          results.failed++;
          results.errors.push(`classify ${b.neighborhood_id}`);
          continue;
        }
        const { error: upErr } = await admin.from('neighborhood_briefs').update({ story_flags: flags }).eq('id', b.id);
        if (upErr) {
          results.failed++;
          results.errors.push(`update ${b.neighborhood_id}: ${upErr.message}`);
          continue;
        }
        results.briefs_flagged++;
        results.stories_flagged += flags.stories.length;
        results.editor_first += flags.stories.filter((s) => s.editorFirst).length;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (queue.length) results.errors.push(`time budget reached, ${queue.length} left for the next run`);
  } catch (err) {
    results.errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    await admin.from('cron_executions').insert({
      job_name: 'flag-brief-stories',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      success: results.failed === 0 && results.errors.length === 0,
      articles_created: 0,
      errors: results.errors.length ? results.errors.slice(0, 10) : null,
      response_data: results,
    }).then(null, (e: Error) => console.error('[flag-brief-stories] log failed:', e.message));
  }

  return NextResponse.json({ success: results.failed === 0, ...results, duration_ms: Date.now() - startTime });
}
