import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { render } from '@react-email/components';
import { sendEmail } from '@/lib/email';
import {
  GEDI_LIVE_FROM,
  GEDI_LIVE_RECIPIENTS,
  PREVIEW_RECIPIENT,
  REPLY_TO,
  buildGediMorning,
  buildGediSubject,
  romeNow,
} from '@/lib/email/gedi-morning';
import { GediMorningTemplate } from '@/lib/email/templates/GediMorningTemplate';

/**
 * The GEDI morning email: the four quartieri's Daily Brief and Look Ahead in
 * Italian, with the editor desk link. See src/lib/email/gedi-morning.ts.
 *
 * Schedule: vercel.json runs this at 05:30 and 06:30 UTC and the route only
 * sends when it is 07:xx in Rome, so it goes at 07:30 Rome in summer time
 * (05:30 UTC) and in winter time (06:30 UTC, from 25 Oct) alike. The other run
 * logs a skip. This is the house rule for local-time sends: gate on the local
 * hour inside the run rather than trusting a UTC schedule.
 *
 * Safety gate: the three GEDI recipients get it only when GEDI_MORNING_LIVE is
 * 'true' AND the Rome date is on or after GEDI_LIVE_FROM (2026-09-28).
 * Otherwise it goes to md@readflaneur.com only, with "[ANTEPRIMA]" in the
 * subject. One scheduled send per Rome date and mode, recorded in
 * cron_executions.response_data (sent_date, mode) and checked before sending.
 *
 * Manual use (CRON_SECRET as Bearer or ?secret=):
 *   ?preview=1            render and return the HTML; sends nothing
 *   ?to=md@readflaneur.com send one preview copy there (readflaneur.com addresses only)
 *   ?date=YYYY-MM-DD      a Rome date other than today (preview and ?to only)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const JOB = 'send-gedi-morning';

function authorised(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron')) return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}` || request.nextUrl.searchParams.get('secret') === secret;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const previewOnly = params.get('preview') === '1';
  const toOverride = params.get('to')?.trim().toLowerCase() || null;
  const dateParam = params.get('date');
  const manual = previewOnly || Boolean(toOverride);
  if (toOverride && !/^[^@\s]+@readflaneur\.com$/.test(toOverride)) {
    return NextResponse.json({ error: 'to= accepts readflaneur.com addresses only' }, { status: 400 });
  }
  if (dateParam && (!manual || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam))) {
    return NextResponse.json({ error: 'date= is YYYY-MM-DD and only for preview=1 or to=' }, { status: 400 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const now = romeNow();
  const date = dateParam || now.date;
  const liveAllowed = process.env.GEDI_MORNING_LIVE === 'true' && date >= GEDI_LIVE_FROM;
  const mode: 'live' | 'preview' | 'manual' | 'html' = previewOnly ? 'html' : toOverride ? 'manual' : liveAllowed ? 'live' : 'preview';
  const errors: string[] = [];
  let responseData: Record<string, unknown> = { mode, rome_date: date, rome_hour: now.hour };
  let html: string | null = null;

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
    // Scheduled runs send only in the 07:xx Rome hour.
    if (!manual && now.hour !== 7) {
      responseData = { ...responseData, skipped: `not 07:xx in Rome (hour ${now.hour})` };
      await log(true);
      return NextResponse.json({ success: true, ...responseData });
    }

    // One scheduled send per Rome date and mode.
    if (!manual) {
      const { data: prior, error: priorErr } = await admin
        .from('cron_executions')
        .select('id')
        .eq('job_name', JOB)
        .eq('response_data->>sent_date', date)
        .eq('response_data->>mode', mode)
        .limit(1);
      if (priorErr) throw new Error(`dedup check: ${priorErr.message}`);
      if (prior && prior.length > 0) {
        responseData = { ...responseData, skipped: `already sent (${mode}) for ${date}` };
        await log(true);
        return NextResponse.json({ success: true, ...responseData });
      }
    }

    const content = await buildGediMorning(admin, date);
    const isPreview = mode !== 'live';
    html = await render(GediMorningTemplate({ content, preview: isPreview && mode !== 'html' }));
    const subject = buildGediSubject(content, isPreview);
    const editions = content.editions.map((e) => ({
      id: e.id,
      brief: Boolean(e.brief),
      brief_stories: e.brief?.stories.length || 0,
      look_ahead: Boolean(e.lookAhead),
      look_ahead_events: e.lookAhead?.events.length || 0,
      english_fallback: e.english,
      error: e.error,
    }));
    for (const e of content.editions) if (e.error) errors.push(`${e.id}: ${e.error}`);
    if (!content.deskUrl) errors.push('CRON_SECRET missing: no editor desk link');
    responseData = { ...responseData, subject, editions };

    if (mode === 'html') {
      await log(errors.length === 0);
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    const to: string[] = mode === 'live' ? [...GEDI_LIVE_RECIPIENTS] : [toOverride || PREVIEW_RECIPIENT];
    const fromAddress = (process.env.EMAIL_FROM || 'noreply@readflaneur.com').replace(/.*<([^>]+)>.*/, '$1').trim();
    const ok = await sendEmail({ to, subject, html, from: `Flaneur <${fromAddress}>`, replyTo: REPLY_TO });
    if (!ok) errors.push('Resend send failed');
    responseData = {
      ...responseData,
      recipients: to.length,
      ...(ok && !manual ? { sent_date: date } : {}),
      sent: ok,
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  await log(errors.length === 0);
  return NextResponse.json({ success: errors.length === 0, ...responseData, errors, duration_ms: Date.now() - startTime });
}
