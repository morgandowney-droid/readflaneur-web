import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import deAreas from '../../../../../data/areas/de.json';
import { buildLookAhead, gatherEvents, localDate, localeFor, writeBrief } from '@/lib/archive/pipeline';
import type { ArchiveArea } from '@/lib/archive/sources';

/**
 * Archive tier (src/lib/archive/): a private shadow edition for every
 * ~25,000-person area in data/areas/*.json. Nothing here is read by a public
 * page or feed.
 *
 *   ?stage=brief       the daily brief for each area (default)
 *   ?stage=events      the weekly events gather
 *   ?stage=look_ahead  the daily Look Ahead listing from stored events (no model)
 *
 * Which areas: ?ids=a,b,c, or ?sample=N (a fixed spread across kinds), country
 * from ?country=de (only Germany so far). ?dry=1 writes nothing.
 * Runs on Vercel for testing; the full daily run moves to a dedicated server.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const START_BUDGET_MS = 230_000;
const CONCURRENCY = 3;
const COUNTRIES: Record<string, { country: string; areas: ArchiveArea[] }> = {
  de: { country: 'Germany', areas: (deAreas as unknown as { areas: ArchiveArea[] }).areas },
};

function sample(areas: ArchiveArea[], n: number): ArchiveArea[] {
  // a fixed spread: every k-th area of each kind, so reruns pick the same ones
  const kinds = ['city-district', 'town', 'cluster'];
  const out: ArchiveArea[] = [];
  for (const k of kinds) {
    const list = areas.filter((a) => a.kind === k);
    const take = Math.max(1, Math.round(n / kinds.length));
    const step = Math.max(1, Math.floor(list.length / take));
    for (let i = 0; i < list.length && out.filter((a) => a.kind === k).length < take; i += step) out.push(list[i]);
  }
  return out.slice(0, n);
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  if (!request.headers.get('x-vercel-cron') && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const stage = (url.searchParams.get('stage') || 'brief') as 'brief' | 'events' | 'look_ahead';
  const cc = url.searchParams.get('country') || 'de';
  const dry = url.searchParams.get('dry') === '1';
  const set = COUNTRIES[cc];
  if (!set) return NextResponse.json({ error: `no areas for ${cc}` }, { status: 400 });
  const ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const areas = ids.length ? set.areas.filter((a) => ids.includes(a.id)) : sample(set.areas, Number(url.searchParams.get('sample')) || 9);

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const results: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < areas.length) {
      if (Date.now() - started > START_BUDGET_MS) { errors.push(`time budget: ${areas.length - next} areas not started`); next = areas.length; return; }
      const area = { ...areas[next++], country: set.country };
      const loc = localeFor(area.country);
      const date = localDate(loc.timezone);
      try {
        if (stage === 'brief') {
          const r = await writeBrief(admin, area);
          results.push({ area: area.id, kind: area.kind, population: area.population, stories: r.stories.length, headline: r.headline, gathered: r.gathered, cost_usd: Number(r.costUsd.toFixed(5)), error: r.error || null, body: dry ? r.body : undefined });
          if (!dry && r.body) {
            const { error } = await admin.from('archive_editions').upsert({
              area_id: area.id, country: area.country, local_date: date, kind: 'brief', language: loc.code,
              headline: r.headline, body: r.body, stories: r.stories, sources: r.sources, gathered: r.gathered, cost_usd: r.costUsd,
            }, { onConflict: 'area_id,local_date,kind' });
            if (error) errors.push(`${area.id}: ${error.message}`);
          }
        } else if (stage === 'events') {
          const r = dry ? { stored: 0, costUsd: 0, error: 'dry' } : await gatherEvents(admin, area);
          results.push({ area: area.id, events: r.stored, cost_usd: Number(r.costUsd.toFixed(5)), error: r.error || null });
        } else {
          const r = await buildLookAhead(admin, area);
          results.push({ area: area.id, events: r.count, body: dry ? r.body : undefined });
          if (!dry && r.body) {
            const { error } = await admin.from('archive_editions').upsert({
              area_id: area.id, country: area.country, local_date: date, kind: 'look_ahead', language: loc.code,
              headline: null, body: r.body, sources: r.sources, cost_usd: 0,
            }, { onConflict: 'area_id,local_date,kind' });
            if (error) errors.push(`${area.id}: ${error.message}`);
          }
        }
      } catch (err) {
        errors.push(`${area.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const summary = {
    stage, country: set.country, areas: areas.length, done: results.length,
    with_content: results.filter((r) => (r.stories as number) > 0 || (r.events as number) > 0).length,
    cost_usd: Number(results.reduce((n, r) => n + Number(r.cost_usd || 0), 0).toFixed(5)),
  };
  if (!dry) {
    await admin.from('cron_executions').insert({
      job_name: 'archive-tier', started_at: new Date(started).toISOString(), completed_at: new Date().toISOString(),
      success: errors.length === 0, articles_created: 0, errors: errors.length ? errors.slice(0, 50) : null, response_data: { summary, results: results.slice(0, 50) },
    }).then(null, () => undefined);
  }
  return NextResponse.json({ success: errors.length === 0, summary, results, errors, duration_ms: Date.now() - started });
}
