import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import type { Edition } from '@/lib/licensee-feed';
import { AUDIO_EDITION_IDS, audioLanguageFor, azureConfigured, generateEditionAudio, type AudioResult } from '@/lib/edition-audio';

/**
 * The morning audio edition: GEDI's four quartieri in Italian, and US
 * editions in English (from 30 Sep 2026, for the AP towns). See
 * src/lib/edition-audio.ts; EDITION_VOICES lists every edition with audio.
 *
 * Schedule: vercel.json runs this at :10 and :40 past every hour. Each
 * edition is worked only between 06:30 and 07:29 in its OWN timezone, so two
 * runs make it (06:40 and 07:10 local) whatever the timezone and whatever the
 * clock change. A cron window written in UTC hours would silently choose which
 * timezones get audio (the Look Ahead lesson of 21 Sep). Other runs log a skip.
 *
 * The Daily Brief and Look Ahead articles publish at 07:00 local, so the job
 * reads them up to 45 minutes ahead of the clock (getDailyEdition asOf). An
 * edition that already has today's audio is skipped, unless a Look Ahead has
 * appeared since the audio was made or the brief article changed.
 *
 * Manual (CRON_SECRET as Bearer or ?secret=):
 *   ?test=<edition>        run one edition now, outside the time gate
 *   ?test=<edition>&force=1 regenerate even if today's audio exists
 *   ?date=YYYY-MM-DD       a local date other than today (with test=)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const JOB = 'generate-edition-audio';
const LOOKAHEAD_MS = 45 * 60_000;

function authorised(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron')) return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}` || request.nextUrl.searchParams.get('secret') === secret;
}

function localClock(timezone: string, at: Date = new Date()): { date: string; minutes: number } {
  const date = at.toLocaleDateString('en-CA', { timeZone: timezone });
  const [h, m] = at
    .toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
    .split(':')
    .map(Number);
  return { date, minutes: (h % 24) * 60 + m };
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
  const errors: string[] = [];
  let responseData: Record<string, unknown> = { test, force };
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
    const ids = test ? [test] : AUDIO_EDITION_IDS;
    const { data, error } = await admin.from('neighborhoods').select('id, name, city, country, timezone, broader_area').in('id', ids);
    if (error) throw new Error(`neighborhoods: ${error.message}`);

    // Editions whose local clock is in the 06:30-07:29 window (every edition under test=).
    const due = ids
      .map((id) => (data || []).find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => ({ row: r, clock: localClock(r.timezone || 'UTC') }))
      .filter(({ clock }) => test || (clock.minutes >= 6 * 60 + 30 && clock.minutes < 7 * 60 + 30));

    if (!due.length) {
      responseData = { ...responseData, skipped: 'no edition is between 06:30 and 07:29 local' };
      await log(true);
      return NextResponse.json({ success: true, ...responseData });
    }
    if (!azureConfigured()) throw new Error('AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set');
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    const genAI = new GoogleGenAI({ apiKey });

    const asOf = new Date(Date.now() + LOOKAHEAD_MS);
    const results: Array<AudioResult & { local_date?: string; language?: string }> = await Promise.all(
      due.map(async ({ row: r, clock }) => {
        const language = audioLanguageFor(r.id);
        const edition: Edition = {
          id: r.id, name: r.name, city: r.city, region: r.broader_area || null, country: r.country, timezone: r.timezone,
          language: 'en' as const, languages: (language === 'en' ? ['en'] : ['en', language]) as Edition['languages'],
        };
        const date = dateParam || clock.date;
        try {
          const res = await generateEditionAudio(admin, genAI, edition, date, { language, asOf, force, store: true });
          return { ...res, local_date: date, language };
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          errors.push(`${r.id}: ${reason}`);
          return { edition: r.id, status: 'failed' as const, reason, local_date: date, language };
        }
      }),
    );
    created = results.filter((r) => r.status === 'created').length;
    responseData = {
      ...responseData,
      created,
      editions: results.map((r) => ({
        edition: r.edition, local_date: r.local_date, language: r.language, status: r.status, reason: r.reason, voice: r.voice,
        provider: r.provider, voice_label: r.voice_label, voice_source: r.voice_source, fell_back: r.fell_back,
        duration_s: r.duration_s, words: r.words, characters: r.characters, cost_usd: r.cost_usd, attempts: r.attempts,
        rejected: r.rejected,
      })),
      cost_usd: Number(results.reduce((s, r) => s + (r.cost_usd || 0), 0).toFixed(4)),
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  await log(errors.length === 0);
  return NextResponse.json({ success: errors.length === 0, ...responseData, errors, duration_ms: Date.now() - startTime });
}
