import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PILOT_NEIGHBORHOOD_IDS } from '@/lib/generation-cadence';
import {
  flattenStories,
  isNewspaperOfRecord,
  isSocialSource,
  looksLikePersonName,
  hasNamedFacts,
  sourceKey,
  NEWSPAPERS_OF_RECORD,
  type RuleStory,
} from '@/lib/edition-rules';
import type { SourceRef } from '@/lib/source-links';

/**
 * Shadow run of the two-source rule.
 *
 * The rule was switched off for GEDI on 2026-09-23 before it ever ran: forcing
 * a second source pushes the model to invent one, and it looked likely to cut
 * most of an edition. This measures instead of guessing. Every day it scores
 * the stories already published for every pilot edition against two versions
 * of the rule and records what each WOULD have cut. It changes nothing, calls
 * no model, and costs nothing beyond one read.
 *
 *  - strict: a named person, date or figure needs two independent sources
 *    unless one is a newspaper of record (the rule as promised to GEDI).
 *  - loose: only a named person needs two sources; a newspaper of record or an
 *    official source (a Comune, a council, a public body) stands alone; dates
 *    and figures may rest on one non-social source.
 * Both: a story resting only on social media needs a non-social second source.
 *
 * Newspapers of record are only listed for Italy, so outside Italy the
 * exception never applies and both variants read stricter than they would with
 * a local list. The report says so.
 *
 * Results: cron_executions.response_data (job 'shadow-edition-rules').
 * ?date=YYYY-MM-DD scores that brief_date; default is yesterday and today UTC.
 */

export const runtime = 'nodejs';
export const maxDuration = 120;

const OFFICIAL_HOST = /(^|\.)(comune\.[a-z0-9-]+(\.[a-z0-9-]+)?\.it|regione\.[a-z0-9-]+\.it|provincia\.[a-z0-9-]+\.it|cittametropolitana\.[a-z0-9-]+\.it|gov\.it|governo\.it|[a-z0-9-]+\.gov(\.[a-z]{2})?|gov\.uk|gov\.ie|gv\.at|gouv\.fr|bund\.de|gc\.ca|canada\.ca|gov\.au|govt\.nz)$/i;
const OFFICIAL_NAME = /^(comune di|citt[aà] (di|metropolitana)|regione|provincia di|municipio|ministero|ayuntamiento|gemeinde|marktgemeinde|stadt|council|city of|town of|borough of|county council)\b/i;

function isOfficial(ref: SourceRef): boolean {
  let host: string | null = null;
  try { host = ref.url ? new URL(ref.url).hostname.replace(/^www\./, '') : null; } catch { host = null; }
  if (host) return OFFICIAL_HOST.test(host);
  return OFFICIAL_NAME.test((ref.name || '').trim());
}

type Verdict = 'kept' | 'no-source' | 'single-source' | 'social-only';

function score(story: RuleStory, country: string, variant: 'strict' | 'loose'): Verdict {
  const sources = story.sources;
  if (sources.length === 0) return 'no-source';
  const record = sources.some((r) => isNewspaperOfRecord(r, country));
  if (record) return 'kept';
  if (variant === 'loose' && sources.some(isOfficial)) return 'kept';
  const text = `${story.entity}\n${story.context}`;
  const allSocial = sources.every((r) => isSocialSource(r));
  const needsTwo = variant === 'strict' ? hasNamedFacts(text) || allSocial : looksLikePersonName(text) || allSocial;
  if (!needsTwo) return 'kept';
  const distinct = new Set(sources.map(sourceKey));
  if (distinct.size < 2) return allSocial ? 'social-only' : 'single-source';
  if (allSocial) return 'social-only';
  return 'kept';
}

interface EditionScore {
  edition: string;
  briefs: number;
  stories: number;
  strict_cut: number;
  loose_cut: number;
  strict_left: number;
  loose_left: number;
  reasons_strict: Record<string, number>;
  reasons_loose: Record<string, number>;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  if (!cronHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const dates = url.searchParams.get('date') ? [url.searchParams.get('date')!] : [yesterday, today];

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const errors: string[] = [];
  const editions: EditionScore[] = [];

  try {
    const ids = Array.from(PILOT_NEIGHBORHOOD_IDS);
    const { data: hoods, error: hoodErr } = await admin.from('neighborhoods').select('id, country').in('id', ids);
    if (hoodErr) throw new Error(hoodErr.message);
    const countryOf = new Map((hoods || []).map((h) => [h.id, (h.country || '').toLowerCase()]));

    const { data: briefs, error } = await admin
      .from('neighborhood_briefs')
      .select('id, neighborhood_id, brief_date, enriched_categories')
      .in('neighborhood_id', ids)
      .in('brief_date', dates)
      .not('enriched_categories', 'is', null);
    if (error) throw new Error(error.message);

    const byEdition = new Map<string, EditionScore>();
    for (const b of briefs || []) {
      const country = countryOf.get(b.neighborhood_id) || '';
      const e: EditionScore = byEdition.get(b.neighborhood_id) || {
        edition: b.neighborhood_id, briefs: 0, stories: 0, strict_cut: 0, loose_cut: 0,
        strict_left: 0, loose_left: 0, reasons_strict: {}, reasons_loose: {},
      };
      e.briefs++;
      for (const s of flattenStories(b.enriched_categories)) {
        e.stories++;
        const st = score(s, country, 'strict');
        const lo = score(s, country, 'loose');
        if (st !== 'kept') { e.strict_cut++; e.reasons_strict[st] = (e.reasons_strict[st] || 0) + 1; }
        if (lo !== 'kept') { e.loose_cut++; e.reasons_loose[lo] = (e.reasons_loose[lo] || 0) + 1; }
      }
      e.strict_left = e.stories - e.strict_cut;
      e.loose_left = e.stories - e.loose_cut;
      byEdition.set(b.neighborhood_id, e);
    }
    editions.push(...Array.from(byEdition.values()).sort((a, b) => a.edition.localeCompare(b.edition)));
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const sum = (k: keyof EditionScore) => editions.reduce((n, e) => n + (e[k] as number), 0);
  const stories = sum('stories');
  const summary = {
    dates,
    editions_scored: editions.length,
    briefs: sum('briefs'),
    stories,
    strict_cut: sum('strict_cut'),
    loose_cut: sum('loose_cut'),
    strict_cut_pct: stories ? Math.round((sum('strict_cut') / stories) * 100) : 0,
    loose_cut_pct: stories ? Math.round((sum('loose_cut') / stories) * 100) : 0,
    editions_emptied_strict: editions.filter((e) => e.stories > 0 && e.strict_left === 0).map((e) => e.edition),
    editions_emptied_loose: editions.filter((e) => e.stories > 0 && e.loose_left === 0).map((e) => e.edition),
    record_lists: Object.keys(NEWSPAPERS_OF_RECORD),
    note: 'Newspaper-of-record exception only applies where a list exists (record_lists). Shadow only: nothing was changed.',
  };

  await admin.from('cron_executions').insert({
    job_name: 'shadow-edition-rules',
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    success: errors.length === 0,
    articles_created: 0,
    errors: errors.length ? errors : null,
    response_data: { summary, editions },
  }).then(null, (e: Error) => console.error('[shadow-edition-rules] log failed:', e.message));

  return NextResponse.json({ success: errors.length === 0, summary, editions, errors, duration_ms: Date.now() - startTime });
}
