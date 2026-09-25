import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { LICENSEES } from '@/lib/licensees';
import type { Edition } from '@/lib/licensee-feed';
import { AUDIO_EDITION_IDS, azureConfigured, generateEditionAudio, type AudioResult } from '@/lib/edition-audio';
import { GEDI_GROUP, GEDI_TIMEZONE, romeNow } from '@/lib/email/gedi-morning';

/**
 * The audio edition for GEDI's four quartieri, in Italian. See
 * src/lib/edition-audio.ts.
 *
 * Schedule: vercel.json runs this at :10 and :40 past 04, 05 and 06 UTC. The
 * route works only between 06:30 and 07:29 Rome time, so exactly two runs do
 * the work in both summer time (04:40 and 05:10 UTC) and winter time from
 * 25 Oct (05:40 and 06:10 UTC): 06:40 and 07:10 Rome, before the 07:30 GEDI
 * morning email. The other runs log a skip.
 *
 * The Daily Brief and Look Ahead articles publish at 07:00 Rome, so the job
 * reads them up to 45 minutes ahead of the clock (getDailyEdition asOf). An
 * edition that already has today's audio is skipped, unless a Look Ahead has
 * appeared since the audio was made or the brief article changed.
 *
 * Manual (CRON_SECRET as Bearer or ?secret=):
 *   ?test=<edition>        run one edition now, outside the time gate
 *   ?test=<edition>&force=1 regenerate even if today's audio exists
 *   ?date=YYYY-MM-DD       a Rome date other than today (with test=)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const JOB = 'generate-edition-audio';
const LANGUAGE = 'it' as const;
const LOOKAHEAD_MS = 45 * 60_000;

function authorised(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron')) return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}` || request.nextUrl.searchParams.get('secret') === secret;
}

function romeMinutes(at: Date = new Date()): number {
  const [h, m] = at
    .toLocaleTimeString('en-GB', { timeZone: GEDI_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false })
    .split(':')
    .map(Number);
  return (h % 24) * 60 + m;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const test = params.get('test')?.trim() || null;
  const force = params.get('force') === '1';
  const dateParam = params.get('date');
  if (test && !AUDIO_EDITION_IDS.includes(test)) {
    return NextResponse.json({ error: `test= must be one of ${AUDIO_EDITION_IDS.join(', ')}` }, { status: 400 });
  }
  if (dateParam && (!test || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam))) {
    return NextResponse.json({ error: 'date= is YYYY-MM-DD and only with test=' }, { status: 400 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const now = romeNow();
  const minutes = romeMinutes();
  const date = dateParam || now.date;
  const errors: string[] = [];
  let responseData: Record<string, unknown> = { rome_date: date, rome_time: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`, test, force };
  let created = 0;

  const log = async (success: boolean) => {
    await admin.from('cron_executions').insert({
      job_name: JOB,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      success,
      articles_created: 0,
      errors: errors.length ? errors.slice(0, 20) : null,
      response_data: responseData,
    }).then(null, (e: Error) => console.error(`[${JOB}] log failed:`, e.message));
  };

  try {
    if (!test && (minutes < 6 * 60 + 30 || minutes >= 7 * 60 + 30)) {
      responseData = { ...responseData, skipped: 'outside 06:30-07:29 Rome' };
      await log(true);
      return NextResponse.json({ success: true, ...responseData });
    }
    if (!azureConfigured()) throw new Error('AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set');
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    const genAI = new GoogleGenAI({ apiKey });

    const ids = test ? [test] : (LICENSEES[GEDI_GROUP].editions as string[]).filter((id) => AUDIO_EDITION_IDS.includes(id));
    const { data, error } = await admin.from('neighborhoods').select('id, name, city, country, timezone, broader_area').in('id', ids);
    if (error) throw new Error(`neighborhoods: ${error.message}`);
    const editions: Edition[] = ids
      .map((id) => (data || []).find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => ({
        id: r.id, name: r.name, city: r.city, region: r.broader_area || null, country: r.country, timezone: r.timezone,
        language: 'en' as const, languages: ['en', LANGUAGE] as const,
      }));

    const asOf = new Date(Date.now() + LOOKAHEAD_MS);
    const results: AudioResult[] = await Promise.all(
      editions.map(async (e) => {
        try {
          return await generateEditionAudio(admin, genAI, e, date, { language: LANGUAGE, asOf, force, store: true });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          errors.push(`${e.id}: ${reason}`);
          return { edition: e.id, status: 'failed' as const, reason };
        }
      }),
    );
    created = results.filter((r) => r.status === 'created').length;
    responseData = {
      ...responseData,
      created,
      editions: results.map((r) => ({
        edition: r.edition, status: r.status, reason: r.reason, voice: r.voice, duration_s: r.duration_s,
        words: r.words, characters: r.characters, cost_usd: r.cost_usd, attempts: r.attempts, rejected: r.rejected,
      })),
      cost_usd: Number(results.reduce((s, r) => s + (r.cost_usd || 0), 0).toFixed(4)),
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  await log(errors.length === 0);
  return NextResponse.json({ success: errors.length === 0, ...responseData, errors, duration_ms: Date.now() - startTime });
}
