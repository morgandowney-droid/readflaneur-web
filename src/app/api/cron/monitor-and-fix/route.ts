import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  detectImageIssues,
  detectFailedJobs,
  detectMissingBriefs,
  createIssues,
  getRetryableIssues,
  attemptFix,
  canRetry,
  FIX_CONFIG,
  MonitorRunResult,
  CronIssue,
} from '@/lib/cron-monitor';

/**
 * Cron Job Monitor and Auto-Fix
 *
 * Self-healing system that:
 * 1. Scans recently created articles for missing/placeholder images
 * 2. Detects failed cron job executions
 * 3. Attempts auto-fixes for recoverable issues
 * 4. Tracks issues with retry limits to prevent infinite loops
 *
 * Schedule: Every 30 minutes
 */

export const runtime = 'nodejs';
export const maxDuration = 120;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function GET(request: Request) {
  const startTime = new Date();

  // Verify cron authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

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

  // Get base URL for internal API calls
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const result: MonitorRunResult = {
    started_at: startTime.toISOString(),
    completed_at: '',
    issues_detected: 0,
    issues_fixed: 0,
    issues_failed: 0,
    issues_skipped: 0,
    details: {
      new_issues: [],
      fix_attempts: [],
    },
  };

  try {
    console.log('[Monitor] Starting cron monitor run...');

    // Step 1: Detect new issues
    console.log('[Monitor] Detecting image issues...');
    const imageIssues = await detectImageIssues(supabase);
    console.log(`[Monitor] Found ${imageIssues.length} image issues`);

    console.log('[Monitor] Detecting failed jobs...');
    const jobIssues = await detectFailedJobs(supabase);
    console.log(`[Monitor] Found ${jobIssues.length} failed job issues`);

    console.log('[Monitor] Detecting missing briefs...');
    const briefIssues = await detectMissingBriefs(supabase);
    console.log(`[Monitor] Found ${briefIssues.length} missing brief issues`);

    const allNewIssues = [...imageIssues, ...jobIssues, ...briefIssues];
    result.details.new_issues = allNewIssues;

    // Step 2: Create new issues in database
    const createdCount = await createIssues(supabase, allNewIssues);
    result.issues_detected = createdCount;
    console.log(`[Monitor] Created ${createdCount} new issues`);

    // Step 3: Get issues ready for retry (both new and existing)
    const retryableIssues = await getRetryableIssues(supabase);
    console.log(`[Monitor] Found ${retryableIssues.length} retryable issues`);

    // Step 4: Attempt fixes (with rate limiting)
    let imageFixCount = 0;
    let briefFixCount = 0;

    for (const issue of retryableIssues) {
      // Check if can retry
      if (!canRetry(issue)) {
        result.issues_skipped++;
        continue;
      }

      // Handle image issues
      if (issue.issue_type === 'missing_image' || issue.issue_type === 'placeholder_image') {
        if (imageFixCount >= FIX_CONFIG.MAX_IMAGES_PER_RUN) {
          result.issues_skipped++;
          console.log(`[Monitor] Image rate limit reached`);
          continue;
        }

        console.log(`[Monitor] Attempting image fix for issue ${issue.id}`);
        const fixResult = await attemptFix(supabase, issue, baseUrl, cronSecret!);

        result.details.fix_attempts.push({
          issue_id: issue.id,
          issue_type: issue.issue_type,
          result: fixResult,
        });

        if (fixResult.success) {
          result.issues_fixed++;
          console.log(`[Monitor] Fixed: ${fixResult.message}`);
        } else {
          result.issues_failed++;
          console.log(`[Monitor] Failed: ${fixResult.message}`);
        }

        imageFixCount++;
        await delay(FIX_CONFIG.IMAGE_GEN_DELAY_MS);
      }
      // Handle brief issues
      else if (issue.issue_type === 'missing_brief') {
        if (briefFixCount >= FIX_CONFIG.MAX_BRIEFS_PER_RUN) {
          result.issues_skipped++;
          console.log(`[Monitor] Brief rate limit reached`);
          continue;
        }

        console.log(`[Monitor] Attempting brief fix for issue ${issue.id}`);
        const fixResult = await attemptFix(supabase, issue, baseUrl, cronSecret!);

        result.details.fix_attempts.push({
          issue_id: issue.id,
          issue_type: issue.issue_type,
          result: fixResult,
        });

        if (fixResult.success) {
          result.issues_fixed++;
          console.log(`[Monitor] Fixed: ${fixResult.message}`);
        } else {
          result.issues_failed++;
          console.log(`[Monitor] Failed: ${fixResult.message}`);
        }

        briefFixCount++;
        await delay(FIX_CONFIG.BRIEF_GEN_DELAY_MS);
      }
      // Skip non-auto-fixable issues
      else {
        result.issues_skipped++;
      }
    }

    // Record this execution
    const completedTime = new Date();
    result.completed_at = completedTime.toISOString();

    await supabase.from('cron_executions').insert({
      job_name: 'monitor-and-fix',
      started_at: startTime.toISOString(),
      completed_at: completedTime.toISOString(),
      success: true,
      articles_created: 0,
      errors: [],
      response_data: {
        issues_detected: result.issues_detected,
        issues_fixed: result.issues_fixed,
        issues_failed: result.issues_failed,
        issues_skipped: result.issues_skipped,
      },
      triggered_by: 'vercel_cron',
    });

    console.log('[Monitor] Completed successfully', {
      detected: result.issues_detected,
      fixed: result.issues_fixed,
      failed: result.issues_failed,
      skipped: result.issues_skipped,
    });

    return NextResponse.json(result);
  } catch (error) {
    const completedTime = new Date();
    result.completed_at = completedTime.toISOString();

    // Record failed execution
    await supabase.from('cron_executions').insert({
      job_name: 'monitor-and-fix',
      started_at: startTime.toISOString(),
      completed_at: completedTime.toISOString(),
      success: false,
      articles_created: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      response_data: result,
      triggered_by: 'vercel_cron',
    });

    console.error('[Monitor] Error:', error);
    return NextResponse.json(
      { error: 'Monitor job failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
