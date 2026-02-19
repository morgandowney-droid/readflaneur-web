import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  detectImageIssues,
  detectFailedJobs,
  detectMissingBriefs,
  detectThinContent,
  detectMissedEmails,
  createIssues,
  getRetryableIssues,
  attemptFix,
  batchFixMissingBriefs,
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
export const maxDuration = 300;

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
  // IMPORTANT: Use NEXT_PUBLIC_APP_URL (production) first, NOT VERCEL_URL
  // VERCEL_URL points to preview deployments which return 404 for internal APIs
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\\n$/, '').replace(/\/$/, '')
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

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

    console.log('[Monitor] Detecting thin content...');
    const thinContentIssues = await detectThinContent(supabase);
    console.log(`[Monitor] Found ${thinContentIssues.length} thin content issues`);

    console.log('[Monitor] Detecting missed emails...');
    const emailIssues = await detectMissedEmails(supabase);
    console.log(`[Monitor] Found ${emailIssues.length} missed email issues`);

    const allNewIssues = [...imageIssues, ...jobIssues, ...briefIssues, ...thinContentIssues, ...emailIssues];
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
    let thinContentFixCount = 0;
    let emailFixCount = 0;

    // Collect missing brief issues for batch processing
    const briefIssuesToFix: CronIssue[] = [];
    const nonBriefIssues: CronIssue[] = [];

    for (const issue of retryableIssues) {
      if (!canRetry(issue)) {
        result.issues_skipped++;
        continue;
      }
      if (issue.issue_type === 'missing_brief' && issue.neighborhood_id) {
        if (briefIssuesToFix.length < FIX_CONFIG.MAX_BRIEFS_PER_RUN) {
          briefIssuesToFix.push(issue);
        } else {
          result.issues_skipped++;
        }
      } else {
        nonBriefIssues.push(issue);
      }
    }

    // Step 4a: Batch-fix missing briefs directly via Grok (no HTTP round-trips)
    if (briefIssuesToFix.length > 0) {
      console.log(`[Monitor] Batch-fixing ${briefIssuesToFix.length} missing briefs directly via Grok...`);

      // Mark all as retrying
      const briefIssueIds = briefIssuesToFix.map(i => i.id);
      await supabase
        .from('cron_issues')
        .update({ status: 'retrying', fix_attempted_at: new Date().toISOString() })
        .in('id', briefIssueIds);

      const neighborhoodIds = briefIssuesToFix.map(i => i.neighborhood_id!);
      // Time budget: 240s (leave 60s for other fixes + logging)
      const batchResult = await batchFixMissingBriefs(supabase, neighborhoodIds, 240_000);

      console.log(`[Monitor] Batch brief result: ${batchResult.generated} generated, ${batchResult.failed} failed`);

      // Build a set of neighborhoods that got briefs
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { data: newBriefs } = await supabase
        .from('neighborhood_briefs')
        .select('neighborhood_id')
        .in('neighborhood_id', neighborhoodIds)
        .gte('created_at', todayStart.toISOString());

      const generatedIds = new Set((newBriefs || []).map(b => b.neighborhood_id));

      // Update each issue based on whether its neighborhood got a brief
      for (const issue of briefIssuesToFix) {
        const succeeded = generatedIds.has(issue.neighborhood_id!);
        const newRetryCount = issue.retry_count + 1;
        const isExhausted = newRetryCount >= issue.max_retries;

        if (succeeded) {
          await supabase.from('cron_issues').update({
            status: 'resolved',
            fix_result: 'Brief generated via batch fix',
            resolved_at: new Date().toISOString(),
            retry_count: newRetryCount,
          }).eq('id', issue.id);
          result.issues_fixed++;
        } else if (isExhausted) {
          await supabase.from('cron_issues').update({
            status: 'needs_manual',
            fix_result: 'Batch brief generation failed - retries exhausted',
            retry_count: newRetryCount,
          }).eq('id', issue.id);
          result.issues_failed++;
        } else {
          const nextRetry = new Date();
          nextRetry.setMinutes(nextRetry.getMinutes() + 15);
          await supabase.from('cron_issues').update({
            status: 'open',
            fix_result: 'Batch brief generation failed - will retry',
            retry_count: newRetryCount,
            next_retry_at: nextRetry.toISOString(),
          }).eq('id', issue.id);
          result.issues_failed++;
        }

        result.details.fix_attempts.push({
          issue_id: issue.id,
          issue_type: 'missing_brief',
          result: {
            success: succeeded,
            message: succeeded ? 'Brief generated via batch fix' : 'Batch brief generation failed',
          },
        });
      }
    }

    // Step 4b: Handle non-brief issues one at a time
    for (const issue of nonBriefIssues) {
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
      // Handle thin content issues
      else if (issue.issue_type === 'thin_content') {
        if (thinContentFixCount >= FIX_CONFIG.MAX_THIN_CONTENT_PER_RUN) {
          result.issues_skipped++;
          console.log(`[Monitor] Thin content rate limit reached`);
          continue;
        }

        console.log(`[Monitor] Attempting thin content fix for issue ${issue.id}`);
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

        thinContentFixCount++;
        await delay(FIX_CONFIG.THIN_CONTENT_DELAY_MS);
      }
      // Handle missed email issues
      else if (issue.issue_type === 'missed_email') {
        if (emailFixCount >= FIX_CONFIG.MAX_EMAILS_PER_RUN) {
          result.issues_skipped++;
          console.log(`[Monitor] Email rate limit reached`);
          continue;
        }

        console.log(`[Monitor] Attempting email fix for issue ${issue.id}`);
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

        emailFixCount++;
        await delay(FIX_CONFIG.EMAIL_RESEND_DELAY_MS);
      }
      // Handle missing sources issues
      else if (issue.issue_type === 'missing_sources') {
        console.log(`[Monitor] Attempting source fix for issue ${issue.id}`);
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
      }
      // Handle URL-encoded text issues
      else if (issue.issue_type === 'url_encoded_text') {
        console.log(`[Monitor] Attempting URL-decode fix for issue ${issue.id}`);
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
