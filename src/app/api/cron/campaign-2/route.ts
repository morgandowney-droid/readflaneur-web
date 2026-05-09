import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const maxDuration = 300;

const PER_TOUCH_LIMIT = 40;
const SEND_DELAY_MS = 2000;
const PITCH_FROM = 'Morgan Downey <md@outreach.readflaneur.com>';
const PITCH_REPLY_TO = 'md@readflaneur.com';

type Row = {
  id: string;
  broker_email: string;
  broker_name: string | null;
  brokerage_name: string | null;
  neighborhood_id: string;
  unsub_token: string;
};

type NbhMap = Map<string, { id: string; name: string; city: string }>;

/**
 * Campaign 2 daily cron. Runs once per day and pipelines all three touches:
 *   - Touch 1: send today's branded daily brief sample to up to 40 brokers
 *     who have not yet received c2_sample_1.
 *   - Touch 2: send sample to up to 40 brokers whose c2_sample_1 fired 20+
 *     hours ago and who have not yet received c2_sample_2.
 *   - Touch 3: send the marketing pitch to up to 40 brokers whose c2_sample_2
 *     fired 20+ hours ago and who have not yet received c2_pitch.
 *
 * The 20-hour gap guard means running this cron at the same time daily
 * naturally pipelines: each broker gets touch 1 on day N, touch 2 on day N+1,
 * touch 3 on day N+2.
 *
 * Excludes brokers in terminal states (unsubscribed/bounced/etc.) and
 * brokers whose neighborhood now has an active partner.
 *
 * Schedule: daily at 06:00 UTC (08:00 Stockholm summer / 07:00 winter).
 */
export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isAuthed = isVercelCron || request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '')
    || 'https://readflaneur.com';

  // Active partners -> their neighborhood IDs are excluded
  const { data: partners } = await supabase
    .from('agent_partners')
    .select('neighborhood_id')
    .eq('status', 'active');
  const takenIds = new Set((partners || []).map((p) => p.neighborhood_id));

  const stats: Record<string, { sent: number; failed: number; errors: string[] }> = {
    touch_1: { sent: 0, failed: 0, errors: [] },
    touch_2: { sent: 0, failed: 0, errors: [] },
    touch_3: { sent: 0, failed: 0, errors: [] },
  };

  for (const touch of [1, 2, 3] as const) {
    const TOUCH_COL = touch === 1 ? 'c2_sample_1_sent_at' : touch === 2 ? 'c2_sample_2_sent_at' : 'c2_pitch_sent_at';
    const PREREQ_COL = touch === 2 ? 'c2_sample_1_sent_at' : touch === 3 ? 'c2_sample_2_sent_at' : null;

    let q = supabase
      .from('broker_outreach')
      .select('id, broker_email, broker_name, brokerage_name, neighborhood_id, unsub_token')
      .not('drip_status', 'in', '(unsubscribed,bounced,neighborhood_taken,not_interested,ooo)')
      .is(TOUCH_COL, null)
      .order('created_at', { ascending: true });

    if (PREREQ_COL) {
      const cutoff = new Date(Date.now() - 20 * 3600_000).toISOString();
      q = q.not(PREREQ_COL, 'is', null).lt(PREREQ_COL, cutoff);
    }

    const { data: rows } = await q;
    const eligible = (rows || []).filter((r) => !takenIds.has(r.neighborhood_id)).slice(0, PER_TOUCH_LIMIT);
    if (eligible.length === 0) continue;

    // Look up neighborhood names for this batch
    const nbhIds = [...new Set(eligible.map((r) => r.neighborhood_id))];
    const { data: nbhRows } = await supabase
      .from('neighborhoods')
      .select('id, name, city')
      .in('id', nbhIds);
    const nbhMap: NbhMap = new Map((nbhRows || []).map((n) => [n.id, n]));

    const key = `touch_${touch}` as const;
    for (const row of eligible) {
      try {
        if (touch <= 2) {
          await sendSample(row, nbhMap, appUrl);
        } else {
          await sendPitch(row, nbhMap, appUrl, resend);
        }
        await supabase
          .from('broker_outreach')
          .update({ [TOUCH_COL]: new Date().toISOString() })
          .eq('id', row.id);
        stats[key].sent++;
      } catch (err) {
        stats[key].failed++;
        stats[key].errors.push(`${row.broker_email}: ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
    }
  }

  return NextResponse.json({ ok: true, stats });
}

async function sendSample(row: Row, nbhMap: NbhMap, appUrl: string): Promise<void> {
  const subscribeUrl = `${appUrl}/partner/setup?email=${encodeURIComponent(row.broker_email)}&neighborhood=${encodeURIComponent(row.neighborhood_id)}`
    + (row.broker_name ? `&name=${encodeURIComponent(row.broker_name)}` : '')
    + (row.brokerage_name ? `&brokerage=${encodeURIComponent(row.brokerage_name)}` : '');
  const res = await fetch(`${appUrl}/api/partner/pitch-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({
      agentName: row.broker_name || 'Your Name',
      agentEmail: row.broker_email,
      neighborhoodId: row.neighborhood_id,
      brokerageName: row.brokerage_name || undefined,
      subscribeUrl,
      isSampleCampaign: true,
      senderDisplayName: 'Flaneur Sample',
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `pitch-preview HTTP ${res.status}`);
  }
}

async function sendPitch(row: Row, nbhMap: NbhMap, appUrl: string, resend: Resend): Promise<void> {
  const nbh = nbhMap.get(row.neighborhood_id);
  const neighborhoodLabel = nbh ? `${nbh.name}, ${nbh.city}` : row.neighborhood_id;
  const firstName = (row.broker_name || '').split(' ')[0] || 'there';
  const setupUrl = `${appUrl}/partner/setup?email=${encodeURIComponent(row.broker_email)}&neighborhood=${encodeURIComponent(row.neighborhood_id)}`
    + (row.broker_name ? `&name=${encodeURIComponent(row.broker_name)}` : '')
    + (row.brokerage_name ? `&brokerage=${encodeURIComponent(row.brokerage_name)}` : '');
  const unsubUrl = `${appUrl}/api/broker-drip/unsub?token=${row.unsub_token}`;

  const html = `
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.7; font-size: 16px;">
  <p>${firstName},</p>
  <p>I sent you the past two mornings of the ${neighborhoodLabel} Daily so you could judge the editorial on real days, not a marketing mockup.</p>
  <p>Two things you have not seen yet:</p>
  <p style="margin: 20px 0 20px 16px;">
    <strong>1. Pricing came down.</strong> The branded version is now <strong>US$299/month</strong>, dropped from $999. Same product. We listened to brokers who said the original price was a non-starter and made it reachable.<br><br>
    <strong>2. ${neighborhoodLabel} is still available.</strong> One agent per neighborhood, first to activate keeps it. Most luxury markets have not been claimed yet, but a few have moved this past week.
  </p>
  <p>If the past two mornings looked like something your clients would actually open, the branded version takes about 5 minutes to set up. Your name, photo, and listings would replace the placeholders, sent to your client list at 7 AM local time, every day.</p>
  <p style="margin: 32px 0;">
    <a href="${setupUrl}" style="display: inline-block; padding: 14px 28px; background: #1c1917; color: #fafaf9; text-decoration: none; border-radius: 4px; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase;">Claim ${nbh ? nbh.name : 'My Neighborhood'} - Free Trial</a>
  </p>
  <p style="color: #57534e; font-size: 14px;"><strong>14-day free trial. No charge today.</strong> Card on file, charged on day 14, cancel anytime before then at no cost.</p>
  <p style="margin-top: 32px;">Best,<br>Morgan Downey<br>Founder, Flaneur</p>
  <p style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e7e5e4; color: #78716c; font-size: 13px;">
    Not for you? Reply "no thanks" and I will remove you. Or <a href="${unsubUrl}" style="color: #78716c;">click here to unsubscribe</a>.
  </p>
</div>
`;
  const result = await resend.emails.send({
    from: PITCH_FROM,
    to: row.broker_email,
    subject: `${neighborhoodLabel} - new pricing + your slot is still open`,
    html,
    replyTo: PITCH_REPLY_TO,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
  if (result.error) throw new Error(result.error.message || 'Resend send failed');
}
