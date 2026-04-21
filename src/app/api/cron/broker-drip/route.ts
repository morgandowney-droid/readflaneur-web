import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

/**
 * Broker drip cron. Runs daily. Two responsibilities:
 *
 * 1. Subscriber sync - for any broker_outreach row whose broker_email now
 *    appears in newsletter_subscribers, flip drip_status to 'subscribed'.
 *    Captures brokers who subscribed to the consumer newsletter via any path
 *    (clicking the touch 2 link, typing in the URL directly, etc.) without
 *    requiring URL-param plumbing.
 *
 * 2. Touch 2 + Touch 3 sending - walks pending and subscribed rows and fires
 *    the appropriate follow-up when their time window hits. Volume-capped at
 *    100 sends/day. Auto-stops on unsub, bounce, conversion, or
 *    neighborhood-taken.
 *
 * Schedule: once a day at 8 AM UTC (Vercel cron entry in vercel.json).
 *
 * Auth: x-vercel-cron header (Vercel-initiated) or CRON_SECRET (manual trigger).
 */

export const maxDuration = 300;

const OUTREACH_FROM = 'Morgan Downey <md@outreach.readflaneur.com>';
const REPLY_TO = 'md@readflaneur.com';

const TOUCH_2_WAIT_DAYS = 2;  // touch 2 fires 2+ days after touch 1
const TOUCH_3_WAIT_DAYS = 14; // touch 3 fires 14+ days after subscription
const DAILY_VOLUME_CAP = 100; // subdomain protection during warming

type OutreachRow = {
  id: string;
  broker_email: string;
  broker_name: string | null;
  brokerage_name: string | null;
  neighborhood_id: string;
  unsub_token: string;
  drip_status: string;
  touch_1_sent_at: string | null;
  touch_2_sent_at: string | null;
  touch_3_sent_at: string | null;
  subscribed_to_newsletter_at: string | null;
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isAuthed = isVercelCron || authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isAuthed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '') || 'https://readflaneur.com';

  const stats = {
    subscriber_sync_new: 0,
    neighborhood_taken_stopped: 0,
    touch_2_sent: 0,
    touch_3_sent: 0,
    errors: [] as string[],
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Subscriber sync
  // ──────────────────────────────────────────────────────────────────────────
  try {
    // Eligible rows: still in the funnel (pending/active), not yet subscribed
    const { data: eligibleForSync } = await supabase
      .from('broker_outreach')
      .select('id, broker_email')
      .in('drip_status', ['pending', 'active'])
      .is('subscribed_to_newsletter_at', null);

    if (eligibleForSync && eligibleForSync.length > 0) {
      const emails = eligibleForSync.map((r) => r.broker_email);
      // Chunk in batches to avoid URL length limits
      const BATCH = 50;
      for (let i = 0; i < emails.length; i += BATCH) {
        const chunk = emails.slice(i, i + BATCH);
        const { data: subs } = await supabase
          .from('newsletter_subscribers')
          .select('email, created_at')
          .in('email', chunk);

        if (subs && subs.length > 0) {
          const subsByEmail = new Map(subs.map((s) => [s.email.toLowerCase(), s.created_at]));
          for (const row of eligibleForSync) {
            if (emails.indexOf(row.broker_email) < i || emails.indexOf(row.broker_email) >= i + BATCH) continue;
            const subDate = subsByEmail.get(row.broker_email.toLowerCase());
            if (subDate) {
              await supabase
                .from('broker_outreach')
                .update({ drip_status: 'subscribed', subscribed_to_newsletter_at: subDate })
                .eq('id', row.id);
              stats.subscriber_sync_new++;
            }
          }
        }
      }
    }
  } catch (err) {
    stats.errors.push(`subscriber_sync: ${(err as Error).message}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Neighborhood-taken auto-stop
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const { data: activePartners } = await supabase
      .from('agent_partners')
      .select('neighborhood_id')
      .eq('status', 'active');

    if (activePartners && activePartners.length > 0) {
      const takenIds = activePartners.map((p) => p.neighborhood_id);
      const { data: toStop, count } = await supabase
        .from('broker_outreach')
        .update({ drip_status: 'neighborhood_taken' })
        .in('neighborhood_id', takenIds)
        .in('drip_status', ['pending', 'active', 'subscribed', 'warm'])
        .select('id');
      stats.neighborhood_taken_stopped = toStop?.length || 0;
    }
  } catch (err) {
    stats.errors.push(`neighborhood_taken: ${(err as Error).message}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Touch 2 sends (pending -> active)
  // ──────────────────────────────────────────────────────────────────────────
  let sentToday = 0;

  try {
    const cutoff = new Date(Date.now() - TOUCH_2_WAIT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: touch2Candidates } = await supabase
      .from('broker_outreach')
      .select('*')
      .eq('drip_status', 'pending')
      .lt('touch_1_sent_at', cutoff)
      .is('touch_2_sent_at', null)
      .order('touch_1_sent_at', { ascending: true })
      .limit(DAILY_VOLUME_CAP);

    for (const row of (touch2Candidates as OutreachRow[]) || []) {
      if (sentToday >= DAILY_VOLUME_CAP) break;

      try {
        const { data: nbh } = await supabase
          .from('neighborhoods')
          .select('name, city, country')
          .eq('id', row.neighborhood_id)
          .single();

        const subscribeUrl = nbh
          ? `${appUrl}/${slugify(nbh.city || '')}/${slugify(nbh.name || '')}`
          : `${appUrl}`;
        const unsubUrl = `${appUrl}/api/broker-drip/unsub?token=${row.unsub_token}`;
        const neighborhoodDisplay = nbh ? `${nbh.name}, ${nbh.city}` : row.neighborhood_id;
        const firstName = (row.broker_name || '').split(' ')[0] || 'there';

        const html = buildTouch2Html({
          firstName,
          neighborhoodDisplay,
          subscribeUrl,
          unsubUrl,
        });

        const res = await resend.emails.send({
          from: OUTREACH_FROM,
          to: row.broker_email,
          subject: `Did Monday's email miss you?`,
          html,
          replyTo: REPLY_TO,
          headers: {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });

        if (res.error) {
          stats.errors.push(`touch_2 send failed for ${row.broker_email}: ${res.error.message}`);
          continue;
        }

        await supabase
          .from('broker_outreach')
          .update({
            drip_status: 'active',
            touch_2_sent_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        stats.touch_2_sent++;
        sentToday++;
      } catch (err) {
        stats.errors.push(`touch_2 loop error for ${row.broker_email}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    stats.errors.push(`touch_2: ${(err as Error).message}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Touch 3 sends (subscribed -> warm, pitches paid product)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const cutoff3 = new Date(Date.now() - TOUCH_3_WAIT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: touch3Candidates } = await supabase
      .from('broker_outreach')
      .select('*')
      .eq('drip_status', 'subscribed')
      .lt('subscribed_to_newsletter_at', cutoff3)
      .is('touch_3_sent_at', null)
      .order('subscribed_to_newsletter_at', { ascending: true })
      .limit(Math.max(0, DAILY_VOLUME_CAP - sentToday));

    for (const row of (touch3Candidates as OutreachRow[]) || []) {
      if (sentToday >= DAILY_VOLUME_CAP) break;

      try {
        const { data: nbh } = await supabase
          .from('neighborhoods')
          .select('name, city')
          .eq('id', row.neighborhood_id)
          .single();

        const setupUrl = `${appUrl}/partner/setup?neighborhood=${encodeURIComponent(row.neighborhood_id)}`
          + `&name=${encodeURIComponent(row.broker_name || '')}`
          + `&email=${encodeURIComponent(row.broker_email)}`
          + (row.brokerage_name ? `&brokerage=${encodeURIComponent(row.brokerage_name)}` : '');
        const unsubUrl = `${appUrl}/api/broker-drip/unsub?token=${row.unsub_token}`;
        const neighborhoodDisplay = nbh ? `${nbh.name}, ${nbh.city}` : row.neighborhood_id;
        const firstName = (row.broker_name || '').split(' ')[0] || 'there';

        const html = buildTouch3Html({
          firstName,
          neighborhoodDisplay,
          setupUrl,
          unsubUrl,
        });

        const res = await resend.emails.send({
          from: OUTREACH_FROM,
          to: row.broker_email,
          subject: `Branded ${neighborhoodDisplay} brief, if you want it`,
          html,
          replyTo: REPLY_TO,
          headers: {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });

        if (res.error) {
          stats.errors.push(`touch_3 send failed for ${row.broker_email}: ${res.error.message}`);
          continue;
        }

        await supabase
          .from('broker_outreach')
          .update({
            drip_status: 'warm',
            touch_3_sent_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        stats.touch_3_sent++;
        sentToday++;
      } catch (err) {
        stats.errors.push(`touch_3 loop error for ${row.broker_email}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    stats.errors.push(`touch_3: ${(err as Error).message}`);
  }

  return NextResponse.json({ ok: true, stats });
}

// ──────────────────────────────────────────────────────────────────────────
// Email templates
// ──────────────────────────────────────────────────────────────────────────

function buildTouch2Html(p: {
  firstName: string;
  neighborhoodDisplay: string;
  subscribeUrl: string;
  unsubUrl: string;
}): string {
  return `
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.7; font-size: 16px;">
  <p>${p.firstName},</p>

  <p>Emailed you Monday about our broker product. On reflection I should have led differently.</p>

  <p>Simpler version: Flaneur publishes a free morning brief about ${p.neighborhoodDisplay}. Restaurant openings, cultural events, market moves. Subscribe as a regular reader to see what it is:</p>

  <p style="margin: 24px 0;"><a href="${p.subscribeUrl}" style="color: #b45309; border-bottom: 1px dotted #b45309; text-decoration: none;">${p.subscribeUrl.replace(/^https?:\/\//, '')}</a></p>

  <p>Read it for a couple of weeks. Judge the quality on real mornings. If you end up thinking your clients should see it, the branded-for-you version makes sense. Until then, just read it.</p>

  <p style="margin-top: 32px;">Best,<br>Morgan Downey<br>Founder, Flaneur</p>

  <p style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e7e5e4; color: #78716c; font-size: 13px;">
    Not for you? Reply "no thanks" and I will remove you. Or <a href="${p.unsubUrl}" style="color: #78716c;">click here to unsubscribe</a>.
  </p>
</div>
`;
}

function buildTouch3Html(p: {
  firstName: string;
  neighborhoodDisplay: string;
  setupUrl: string;
  unsubUrl: string;
}): string {
  return `
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.7; font-size: 16px;">
  <p>${p.firstName},</p>

  <p>Glad you have been reading the ${p.neighborhoodDisplay} Daily. You have seen the product for a few weeks now.</p>

  <p>Quick FYI: we offer a branded version where your name sits on top of the same editorial, sent to your client list every morning. Exclusive to one broker per neighborhood.</p>

  <p>Want to see what it would look like? Reply with your best email and I will send tomorrow's ${p.neighborhoodDisplay} Daily with your name on it - the actual product, not a mockup.</p>

  <p>Or start setup directly: <a href="${p.setupUrl}" style="color: #b45309;">${p.setupUrl.replace(/^https?:\/\//, '')}</a></p>

  <p>14-day free trial, no charge until day 14, cancel anytime.</p>

  <p style="margin-top: 32px;">Best,<br>Morgan</p>

  <p style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e7e5e4; color: #78716c; font-size: 13px;">
    Not for you? <a href="${p.unsubUrl}" style="color: #78716c;">Unsubscribe here</a>.
  </p>
</div>
`;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
