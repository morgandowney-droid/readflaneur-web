/**
 * Daily Content Health Monitor
 *
 * Runs 7 health checks on today's content pipeline,
 * creates cron_issues for auto-fixable problems, and
 * emails an admin summary report.
 *
 * Schedule: 0 10 * * * (10:00 AM UTC daily)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runAllHealthChecks } from '@/lib/cron-monitor/health-checks';
import { buildHealthReportEmail, getHealthReportSubject } from '@/lib/cron-monitor/health-report-email';
import { createIssues } from '@/lib/cron-monitor/issue-detector';
import { sendEmail } from '@/lib/email';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const startTime = new Date();
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let results;
  let issuesCreated = 0;
  let emailSent = false;

  try {
    // Run all 7 health checks
    results = await runAllHealthChecks(supabase);

    // Collect all auto-fixable issues and create them
    const allIssues = results.flatMap(r => r.issues);
    if (allIssues.length > 0) {
      issuesCreated = await createIssues(supabase, allIssues);
    }

    // Build and send the health report email
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startTime.getTime();

    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const html = buildHealthReportEmail(results, startTime, durationMs);
      const subject = getHealthReportSubject(results, startTime);
      emailSent = await sendEmail({ to: adminEmail, subject, html });
    }

    // Log to cron_executions
    const completedTime = new Date();
    await supabase.from('cron_executions').insert({
      job_name: 'check-daily-health',
      started_at: startTime.toISOString(),
      completed_at: completedTime.toISOString(),
      success: true,
      articles_created: 0,
      errors: [],
      response_data: {
        checks: results.map(r => ({
          name: r.name,
          status: r.status,
          total: r.total,
          passing: r.passing,
          failing: r.failing,
        })),
        issues_created: issuesCreated,
        email_sent: emailSent,
        duration_ms: completedTime.getTime() - startTime.getTime(),
      },
      triggered_by: 'vercel_cron',
    }).then(null, (e: Error) => console.error('Failed to log cron execution:', e));

    return NextResponse.json({
      success: true,
      checks: results.map(r => ({
        name: r.name,
        status: r.status,
        passing: r.passing,
        failing: r.failing,
        total: r.total,
      })),
      issues_created: issuesCreated,
      email_sent: emailSent,
      duration_ms: completedTime.getTime() - startTime.getTime(),
    });
  } catch (error) {
    const completedTime = new Date();
    await supabase.from('cron_executions').insert({
      job_name: 'check-daily-health',
      started_at: startTime.toISOString(),
      completed_at: completedTime.toISOString(),
      success: false,
      articles_created: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      response_data: {
        checks: results?.map(r => ({ name: r.name, status: r.status })) || [],
        issues_created: issuesCreated,
      },
      triggered_by: 'vercel_cron',
    }).then(null, (e: Error) => console.error('Failed to log cron execution:', e));

    return NextResponse.json(
      { error: 'Health check failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
