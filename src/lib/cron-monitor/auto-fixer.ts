/**
 * Cron Monitoring System - Auto Fixer
 *
 * Attempts to automatically fix recoverable issues.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { CronIssue, FixResult, FIX_CONFIG, EmailDiagnosis } from './types';
import { fixEmailRootCause, resendEmail } from './email-monitor';
import { generateGrokNewsStories } from '@/lib/grok';

/**
 * Calculate the next retry time based on retry count
 */
function getNextRetryTime(retryCount: number): Date {
  const backoffIndex = Math.min(retryCount, FIX_CONFIG.RETRY_BACKOFF.length - 1);
  const delayMinutes = FIX_CONFIG.RETRY_BACKOFF[backoffIndex];
  const nextRetry = new Date();
  nextRetry.setMinutes(nextRetry.getMinutes() + delayMinutes);
  return nextRetry;
}

/**
 * Check if an issue can be retried
 */
export function canRetry(issue: CronIssue): boolean {
  // Check retry count
  if (issue.retry_count >= issue.max_retries) {
    return false;
  }

  // Check if auto-fixable
  if (!issue.auto_fixable) {
    return false;
  }

  // Check if enough time has passed since last retry
  if (issue.next_retry_at) {
    const nextRetry = new Date(issue.next_retry_at);
    if (nextRetry > new Date()) {
      return false;
    }
  }

  return true;
}

/**
 * Fix a missing or placeholder image by regenerating it
 */
export async function fixImageIssue(
  articleId: string,
  baseUrl: string,
  cronSecret: string
): Promise<FixResult> {
  try {
    const response = await fetch(`${baseUrl}/api/internal/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
      body: JSON.stringify({ article_id: articleId }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.error || `HTTP ${response.status}`,
      };
    }

    // Check if the image was successfully generated
    const result = data.results?.[0];
    if (result?.success) {
      return {
        success: true,
        message: 'Image regenerated successfully',
        imageUrl: result.imageUrl,
      };
    }

    return {
      success: false,
      message: result?.error || 'No image generated',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fix a missing brief by triggering generation for the neighborhood
 */
export async function fixMissingBrief(
  neighborhoodId: string,
  baseUrl: string,
  cronSecret: string
): Promise<FixResult> {
  try {
    // Call the sync-neighborhood-briefs endpoint with test mode for specific neighborhood
    const response = await fetch(
      `${baseUrl}/api/cron/sync-neighborhood-briefs?test=${neighborhoodId}&force=true`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.error || `HTTP ${response.status}`,
      };
    }

    // Check if the brief was successfully generated
    if (data.briefs_generated > 0) {
      return {
        success: true,
        message: `Brief generated successfully for neighborhood`,
      };
    }

    return {
      success: false,
      message: data.errors?.[0] || 'No brief generated',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fix thin content by generating Grok articles AND a fresh brief.
 * 1. Generates 3 Grok news articles inserted directly into `articles` table
 * 2. Triggers image generation for each article
 * 3. Also generates a fresh Grok brief for the "What's Happening Today" section
 */
export async function fixThinContent(
  supabase: SupabaseClient,
  neighborhoodId: string,
  baseUrl: string,
  cronSecret: string
): Promise<FixResult> {
  try {
    // Look up neighborhood details
    const { data: neighborhood, error: nhError } = await supabase
      .from('neighborhoods')
      .select('id, name, city, country')
      .eq('id', neighborhoodId)
      .single();

    if (nhError || !neighborhood) {
      return { success: false, message: `Neighborhood ${neighborhoodId} not found` };
    }

    let articlesCreated = 0;
    let briefGenerated = false;

    // Step 1: Generate Grok news articles
    try {
      const stories = await generateGrokNewsStories(
        neighborhood.name,
        neighborhood.city,
        neighborhood.country,
        3 // Generate 3 articles
      );

      for (const story of stories) {
        const slug = `grok-${neighborhoodId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

        const { data: inserted, error: insertError } = await supabase
          .from('articles')
          .insert({
            neighborhood_id: neighborhoodId,
            headline: story.headline,
            slug,
            preview_text: story.previewText,
            body_text: story.body,
            image_url: '',
            status: 'published',
            published_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: 'grok-4.1-fast',
            category_label: 'Daily Brief',
            editor_notes: `Auto-generated by thin content fixer. Category: ${story.category}`,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error(`[ThinContent] Failed to insert article for ${neighborhood.name}:`, insertError.message);
          continue;
        }

        articlesCreated++;

        // Trigger image generation (fire-and-forget)
        if (inserted?.id) {
          fetch(`${baseUrl}/api/internal/generate-image`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cron-secret': cronSecret,
            },
            body: JSON.stringify({ article_id: inserted.id, provider: 'gemini' }),
          }).catch(() => {}); // Non-blocking
        }

        // Small delay between inserts
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (grokError) {
      console.error(`[ThinContent] Grok article generation failed for ${neighborhood.name}:`, grokError);
    }

    // Step 2: Generate a fresh brief (non-blocking HTTP call)
    try {
      const briefResponse = await fetch(
        `${baseUrl}/api/cron/sync-neighborhood-briefs?test=${neighborhoodId}&force=true`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${cronSecret}` },
        }
      );
      const briefData = await briefResponse.json();
      briefGenerated = briefData.briefs_generated > 0;
    } catch {
      // Brief generation is secondary — articles are the priority
    }

    if (articlesCreated > 0) {
      return {
        success: true,
        message: `Generated ${articlesCreated} articles${briefGenerated ? ' + brief' : ''} for ${neighborhood.name}`,
      };
    }

    return {
      success: false,
      message: `No articles generated for ${neighborhood.name}`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Attempt to fix an issue
 */
export async function attemptFix(
  supabase: SupabaseClient,
  issue: CronIssue,
  baseUrl: string,
  cronSecret: string
): Promise<FixResult> {
  let result: FixResult;

  // Update status to retrying
  await supabase
    .from('cron_issues')
    .update({
      status: 'retrying',
      fix_attempted_at: new Date().toISOString(),
    })
    .eq('id', issue.id);

  // Attempt fix based on issue type
  switch (issue.issue_type) {
    case 'missing_image':
    case 'placeholder_image':
      if (!issue.article_id) {
        result = { success: false, message: 'No article ID provided' };
      } else {
        result = await fixImageIssue(issue.article_id, baseUrl, cronSecret);
      }
      break;

    case 'missing_brief':
      if (!issue.neighborhood_id) {
        result = { success: false, message: 'No neighborhood ID provided' };
      } else {
        result = await fixMissingBrief(issue.neighborhood_id, baseUrl, cronSecret);
      }
      break;

    case 'job_failure':
      // Job failures are not auto-fixable
      result = { success: false, message: 'Job failures require manual review' };
      break;

    case 'missed_email': {
      // Parse diagnosis from description
      let diagnosis: EmailDiagnosis;
      try {
        diagnosis = JSON.parse(issue.description);
      } catch {
        result = { success: false, message: 'Could not parse email diagnosis from issue description' };
        break;
      }

      if (!diagnosis.autoFixable) {
        result = { success: false, message: `Not auto-fixable: ${diagnosis.cause}` };
        break;
      }

      // Step 1: Fix root cause
      const rootCauseResult = await fixEmailRootCause(supabase, diagnosis);
      if (!rootCauseResult.success) {
        result = rootCauseResult;
        break;
      }

      // Step 2: Resend the email
      result = await resendEmail(diagnosis.email, baseUrl, cronSecret);
      if (result.success) {
        result.message = `Root cause (${diagnosis.cause}) fixed. ${result.message}`;
      }
      break;
    }

    case 'thin_content':
      if (!issue.neighborhood_id) {
        result = { success: false, message: 'No neighborhood ID provided' };
      } else {
        result = await fixThinContent(supabase, issue.neighborhood_id, baseUrl, cronSecret);
      }
      break;

    case 'api_rate_limit':
    case 'external_service_down':
      result = { success: false, message: 'External issues cannot be auto-fixed' };
      break;

    default:
      result = { success: false, message: `Unknown issue type: ${issue.issue_type}` };
  }

  // Update issue based on result
  const newRetryCount = issue.retry_count + 1;
  const isExhausted = newRetryCount >= issue.max_retries;

  if (result.success) {
    // Mark as resolved
    await supabase
      .from('cron_issues')
      .update({
        status: 'resolved',
        fix_result: result.message,
        resolved_at: new Date().toISOString(),
        retry_count: newRetryCount,
      })
      .eq('id', issue.id);
  } else if (isExhausted) {
    // Mark as needs manual intervention
    await supabase
      .from('cron_issues')
      .update({
        status: 'needs_manual',
        fix_result: result.message,
        retry_count: newRetryCount,
      })
      .eq('id', issue.id);
  } else {
    // Schedule next retry
    const nextRetryTime = getNextRetryTime(newRetryCount);
    await supabase
      .from('cron_issues')
      .update({
        status: 'open',
        fix_result: result.message,
        retry_count: newRetryCount,
        next_retry_at: nextRetryTime.toISOString(),
      })
      .eq('id', issue.id);
  }

  return result;
}

/**
 * Manually mark an issue as resolved
 */
export async function markResolved(
  supabase: SupabaseClient,
  issueId: string,
  resolution: string = 'Manually resolved'
): Promise<boolean> {
  const { error } = await supabase
    .from('cron_issues')
    .update({
      status: 'resolved',
      fix_result: resolution,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', issueId);

  return !error;
}

/**
 * Force retry an issue immediately
 */
export async function forceRetry(
  supabase: SupabaseClient,
  issueId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('cron_issues')
    .update({
      status: 'open',
      next_retry_at: new Date().toISOString(),
    })
    .eq('id', issueId);

  return !error;
}
