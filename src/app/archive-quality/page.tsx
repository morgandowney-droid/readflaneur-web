import { createHash } from 'node:crypto';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

/**
 * Archive tier quality page (src/lib/archive/quality.ts): the nightly scorecard
 * per country and the daily side-by-side with production. Private: 404 without
 * the key (first 24 hex of sha256(`${CRON_SECRET}:archive-quality`)), noindex,
 * no-store, disallowed in robots.
 */

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Archive quality', robots: { index: false, follow: false } };

function keyFor(): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  return secret ? createHash('sha256').update(`${secret}:archive-quality`).digest('hex').slice(0, 24) : null;
}

type Row = { check_date: string; scope: 'scorecard' | 'pair'; key: string; metrics: Record<string, any> };

const pct = (v: unknown) => (typeof v === 'number' ? `${Math.round(v * 100)}%` : 'n/a');

export default async function ArchiveQualityPage({ searchParams }: { searchParams: Promise<{ key?: string; days?: string }> }) {
  const { key, days } = await searchParams;
  const expected = keyFor();
  if (!expected || key !== expected) notFound();
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const since = new Date(Date.now() - Number(days || 7) * 86400_000).toISOString().slice(0, 10);
  const { data } = await admin.from('archive_quality').select('check_date, scope, key, metrics').gte('check_date', since).order('check_date', { ascending: false });
  const rows = (data || []) as Row[];
  const cards = rows.filter((r) => r.scope === 'scorecard');
  const pairs = rows.filter((r) => r.scope === 'pair');
  const judged = pairs.filter((p) => p.metrics.judge?.preferred);
  const tally = { production: 0, archive: 0, tie: 0 } as Record<string, number>;
  for (const p of judged) tally[p.metrics.judge.preferred] = (tally[p.metrics.judge.preferred] || 0) + 1;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-sm text-fg">
      <h1 className="text-2xl font-semibold">Archive quality</h1>
      <p className="mt-1 text-fg-muted">
        The low-cost archive tier against the production engine, last {days || 7} days. Confirmed means production&apos;s fact matcher found the
        story&apos;s names, dates and figures on its source page. The judge is a different model family that sees both briefs unlabelled.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Scorecard by country</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-border text-left text-fg-muted">
            <th className="py-2 pr-3">Date</th><th className="pr-3">Map</th><th className="pr-3">With brief</th><th className="pr-3">Stories / brief</th>
            <th className="pr-3">Confirmed</th><th className="pr-3">Names its area</th><th className="pr-3">Dropped (stale / crime name / no source)</th><th className="pr-3">Cost / brief</th>
          </tr></thead>
          <tbody>{cards.map((r) => {
            const m = r.metrics;
            return (
              <tr key={r.check_date + r.key} className="border-b border-border">
                <td className="py-2 pr-3">{r.check_date}</td><td className="pr-3">{r.key}</td>
                <td className="pr-3">{m.with_brief} / {m.areas} ({pct(m.coverage)})</td><td className="pr-3">{m.stories_per_brief}</td>
                <td className="pr-3">{pct(m.confirmed_share)} <span className="text-fg-subtle">of {m.sample_checked}</span></td><td className="pr-3">{pct(m.story_names_area)}</td>
                <td className="pr-3">{m.dropped?.dropped_stale ?? 0} / {m.dropped?.dropped_crime_name ?? 0} / {m.dropped?.dropped_no_source ?? 0}</td>
                <td className="pr-3">${m.cost_per_brief ?? 'n/a'}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>

      <h2 className="mt-10 text-lg font-semibold">Side by side with production</h2>
      <p className="mt-1 text-fg-muted">Blind judge over {judged.length} pairs: production preferred {tally.production}, archive {tally.archive}, tie {tally.tie}.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-border text-left text-fg-muted">
            <th className="py-2 pr-3">Date</th><th className="pr-3">Place</th><th className="pr-3">Stories (prod / archive)</th><th className="pr-3">Confirmed (prod / archive)</th>
            <th className="pr-3">Shared (prod found in archive / archive found in prod)</th><th className="pr-3">Judge</th><th className="pr-3">Why / problems</th>
          </tr></thead>
          <tbody>{pairs.map((r) => {
            const m = r.metrics;
            const j = m.judge || {};
            return (
              <tr key={r.check_date + r.key} className="border-b border-border align-top">
                <td className="py-2 pr-3">{r.check_date}</td><td className="pr-3">{r.key}</td>
                <td className="pr-3">{m.production_stories} / {m.archive_stories}</td>
                <td className="pr-3">{pct(m.production_confirmed)} / {pct(m.archive_confirmed)}</td>
                <td className="pr-3">{m.overlap?.production_found_in_archive ?? 0} / {m.overlap?.archive_found_in_production ?? 0}</td>
                <td className="pr-3">{j.preferred || (j.error ? 'error' : 'n/a')}</td>
                <td className="pr-3 text-fg-muted">{j.why || ''}{(j.problems || []).length ? ` Problems: ${(j.problems as Array<{ side: string; story: number; issue: string }>).map((p) => `${p.side} #${p.story} ${p.issue}`).join('; ')}` : ''}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </main>
  );
}
