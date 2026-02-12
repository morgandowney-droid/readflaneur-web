/**
 * Daily Community Neighborhood Rejection Digest
 *
 * Sends a batch email of all rejected community neighborhood creation attempts
 * that haven't been emailed yet.
 *
 * Schedule: Daily at 10 PM UTC (11 PM CET)
 * Vercel Cron: 0 22 * * *
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ADMIN_EMAIL = 'morgan.downey@gmail.com';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Auth check
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  try {
    // Fetch un-emailed rejections
    const { data: rejections, error } = await admin
      .from('community_creation_rejections')
      .select('id, input, rejection_reason, user_email, created_at')
      .eq('emailed', false)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch rejections:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!rejections || rejections.length === 0) {
      // Log cron execution even when nothing to send
      await admin.from('cron_executions').insert({
        job_name: 'email-community-rejections',
        status: 'success',
        items_processed: 0,
        duration_ms: Date.now() - startTime,
        metadata: { message: 'No rejections to email' },
      }).then(null, (e: unknown) => console.error('Failed to log cron:', e));

      return NextResponse.json({ sent: false, count: 0 });
    }

    // Build email
    const rows = rejections.map(r => {
      const date = new Date(r.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Stockholm',
      });
      return `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${r.input}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">${r.rejection_reason || '-'}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #999; font-size: 12px;">${r.user_email || 'Unknown'}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #999; font-size: 12px;">${date}</td>
        </tr>`;
    }).join('');

    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 700px; margin: 0 auto;">
        <h1 style="font-weight: 300; letter-spacing: 0.1em;">FLANEUR</h1>
        <h2 style="font-weight: 400;">Community Neighborhood Rejections</h2>
        <p style="color: #666;">${rejections.length} rejected creation attempt${rejections.length === 1 ? '' : 's'} today.</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Input</th>
              <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Reason</th>
              <th style="padding: 8px 12px; text-align: left; font-weight: 600;">User</th>
              <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Time</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <p style="color: #999; font-size: 12px; margin-top: 30px;">
          These names were rejected by AI validation. Consider adding popular ones manually if they represent valid neighborhoods.
        </p>
      </div>
    `;

    const sent = await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[Flaneur] ${rejections.length} Rejected Neighborhood Creation${rejections.length === 1 ? '' : 's'}`,
      html,
    });

    // Mark as emailed
    if (sent) {
      const ids = rejections.map(r => r.id);
      await admin
        .from('community_creation_rejections')
        .update({ emailed: true })
        .in('id', ids)
        .then(null, (e: unknown) => console.error('Failed to mark as emailed:', e));
    }

    // Log cron execution
    await admin.from('cron_executions').insert({
      job_name: 'email-community-rejections',
      status: sent ? 'success' : 'error',
      items_processed: rejections.length,
      duration_ms: Date.now() - startTime,
      metadata: { sent, count: rejections.length },
    }).then(null, (e: unknown) => console.error('Failed to log cron:', e));

    return NextResponse.json({ sent, count: rejections.length });
  } catch (err) {
    console.error('Email community rejections error:', err);

    await admin.from('cron_executions').insert({
      job_name: 'email-community-rejections',
      status: 'error',
      items_processed: 0,
      duration_ms: Date.now() - startTime,
      metadata: { error: String(err) },
    }).then(null, (e: unknown) => console.error('Failed to log cron:', e));

    return NextResponse.json({ error: 'Failed to send digest' }, { status: 500 });
  }
}
