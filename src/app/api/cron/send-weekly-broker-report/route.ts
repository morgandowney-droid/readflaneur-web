import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Weekly performance report for agent partners.
 *
 * Schedule: 0 * * * 1  (every hour on Mondays)
 * Sends at 9 AM local time per partner's neighborhood timezone.
 * Dedup: agent_partners.last_report_sent_at - skip if sent within last 6 days.
 *
 * Report includes: new subscribers this week, daily briefs sent, total clients,
 * active listings, and a link to the dashboard.
 */

function isTargetHour(timezone: string, targetHour: number): boolean {
  try {
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    return local.getHours() === targetHour;
  } catch {
    return false;
  }
}

interface Partner {
  id: string;
  agent_name: string;
  agent_email: string;
  agent_slug: string;
  neighborhood_id: string;
  client_emails: string[] | null;
  listings: unknown[] | null;
  last_report_sent_at: string | null;
}

interface Neighborhood {
  id: string;
  name: string;
  city: string;
  timezone: string | null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceRun = url.searchParams.get('force') === 'true';
  const testEmail = url.searchParams.get('test');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    partners_considered: 0,
    reports_sent: 0,
    skipped_not_9am: 0,
    skipped_already_sent: 0,
    errors: [] as string[],
  };

  const { data: partners } = await supabase
    .from('agent_partners')
    .select('id, agent_name, agent_email, agent_slug, neighborhood_id, client_emails, listings, last_report_sent_at')
    .eq('status', 'active');

  if (!partners || partners.length === 0) {
    return NextResponse.json({ ...results, message: 'No active partners' });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/[\n\r]+$/, '').replace(/\/$/, '')
    || 'https://readflaneur.com';
  const dashboardUrl = `${appUrl}/partner/dashboard`;

  const oneWeekAgoMs = Date.now() - 6.5 * 24 * 60 * 60 * 1000; // 6.5d guard
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const p of partners as Partner[]) {
    results.partners_considered++;

    // Neighborhood timezone for 9 AM gate
    const { data: neighborhood } = await supabase
      .from('neighborhoods')
      .select('id, name, city, timezone')
      .eq('id', p.neighborhood_id)
      .single<Neighborhood>();

    const tz = neighborhood?.timezone || 'America/New_York';
    const neighborhoodLabel = neighborhood
      ? `${neighborhood.name}, ${neighborhood.city}`
      : p.neighborhood_id;

    if (!forceRun && !testEmail && !isTargetHour(tz, 9)) {
      results.skipped_not_9am++;
      continue;
    }

    // Dedup: already sent within last 6.5 days
    if (!forceRun && p.last_report_sent_at) {
      const lastMs = new Date(p.last_report_sent_at).getTime();
      if (lastMs > oneWeekAgoMs) {
        results.skipped_already_sent++;
        continue;
      }
    }

    try {
      // New subscribers this week (via /r/[slug] signup)
      const { count: newSubsCount } = await supabase
        .from('newsletter_subscribers')
        .select('id', { count: 'exact', head: true })
        .eq('partner_agent_id', p.id)
        .gte('created_at', sevenDaysAgo);

      // Total subscribers: manual client_emails + /r/ signups
      const manualCount = (p.client_emails || []).length;
      const { count: allSubsCount } = await supabase
        .from('newsletter_subscribers')
        .select('id', { count: 'exact', head: true })
        .eq('partner_agent_id', p.id);
      const totalClients = manualCount + (allSubsCount || 0);

      // Daily briefs sent in the last 7 days (from daily_brief_sends)
      // Match by email since partner recipients are not the same id as profiles
      const { count: sendsCount } = await supabase
        .from('daily_brief_sends')
        .select('id', { count: 'exact', head: true })
        .eq('primary_neighborhood_id', p.neighborhood_id)
        .gte('send_date', sevenDaysAgo.split('T')[0]);

      const activeListings = Array.isArray(p.listings) ? p.listings.length : 0;

      const recipient = testEmail || p.agent_email;
      const html = renderWeeklyReport({
        agentName: p.agent_name,
        neighborhoodLabel,
        newSubs: newSubsCount || 0,
        totalClients,
        emailsSent: sendsCount || 0,
        activeListings,
        dashboardUrl,
      });

      const success = await sendEmail({
        to: recipient,
        subject: `Your ${neighborhoodLabel} weekly report`,
        html,
      });

      if (!success) {
        results.errors.push(`Send failed: ${p.agent_email}`);
        continue;
      }

      // Mark as sent
      if (!testEmail) {
        await supabase
          .from('agent_partners')
          .update({ last_report_sent_at: new Date().toISOString() })
          .eq('id', p.id);
      }

      results.reports_sent++;
    } catch (err) {
      results.errors.push(`Error for ${p.agent_email}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json(results);
}

function renderWeeklyReport(opts: {
  agentName: string;
  neighborhoodLabel: string;
  newSubs: number;
  totalClients: number;
  emailsSent: number;
  activeListings: number;
  dashboardUrl: string;
}): string {
  const { agentName, neighborhoodLabel, newSubs, totalClients, emailsSent, activeListings, dashboardUrl } = opts;
  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; color: #1c1917; line-height: 1.6;">
      <p style="font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #78716c; margin: 0 0 24px;">Weekly report</p>
      <h1 style="font-size: 26px; font-weight: 300; margin: 0 0 8px;">${neighborhoodLabel}</h1>
      <p style="color: #78716c; margin: 0 0 32px;">The past seven days, at a glance.</p>

      <p>${agentName},</p>

      <p>Here's how your branded newsletter performed this week:</p>

      <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 24px 0 32px;">
        <tr>
          <td style="padding: 16px; border-bottom: 1px solid #e7e5e4;">
            <p style="margin: 0; color: #78716c; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase;">New subscribers</p>
          </td>
          <td style="padding: 16px; border-bottom: 1px solid #e7e5e4; text-align: right;">
            <p style="margin: 0; font-size: 24px; font-weight: 600;">${newSubs}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px; border-bottom: 1px solid #e7e5e4;">
            <p style="margin: 0; color: #78716c; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase;">Total clients on your list</p>
          </td>
          <td style="padding: 16px; border-bottom: 1px solid #e7e5e4; text-align: right;">
            <p style="margin: 0; font-size: 24px; font-weight: 600;">${totalClients}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px; border-bottom: 1px solid #e7e5e4;">
            <p style="margin: 0; color: #78716c; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase;">Daily briefs sent</p>
          </td>
          <td style="padding: 16px; border-bottom: 1px solid #e7e5e4; text-align: right;">
            <p style="margin: 0; font-size: 24px; font-weight: 600;">${emailsSent}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px;">
            <p style="margin: 0; color: #78716c; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase;">Active listings shown in emails</p>
          </td>
          <td style="padding: 16px; text-align: right;">
            <p style="margin: 0; font-size: 24px; font-weight: 600;">${activeListings}</p>
          </td>
        </tr>
      </table>

      <p>Add more clients or update your listings anytime:</p>
      <p><a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #1c1917; color: #fafaf9; text-decoration: none; border-radius: 4px; font-size: 14px; letter-spacing: 0.05em; text-transform: uppercase;">Open Dashboard</a></p>

      <p style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #e7e5e4; color: #78716c; font-size: 14px;">
        Open and click tracking will be included in next week's report.
      </p>
    </div>
  `;
}
