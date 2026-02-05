/**
 * Cron Monitoring System - Issue Detector
 *
 * Detects articles with missing images, failed cron jobs, and other issues.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { DetectedIssue, FIX_CONFIG, CronIssue } from './types';
import { isMissingImage, isPlaceholderImage } from './image-validator';

/**
 * Detect articles with missing or placeholder images
 */
export async function detectImageIssues(
  supabase: SupabaseClient
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];

  // Calculate time window
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() - FIX_CONFIG.ISSUE_DETECTION_WINDOW_HOURS);

  // Find articles created recently with missing or empty images
  const { data: articlesWithMissingImages, error: missingError } = await supabase
    .from('articles')
    .select('id, headline, image_url, created_at')
    .gte('created_at', windowStart.toISOString())
    .eq('status', 'published')
    .or('image_url.is.null,image_url.eq.')
    .order('created_at', { ascending: false })
    .limit(50);

  if (missingError) {
    console.error('Error detecting missing images:', missingError);
  } else if (articlesWithMissingImages) {
    for (const article of articlesWithMissingImages) {
      issues.push({
        issue_type: 'missing_image',
        article_id: article.id,
        description: `Article "${article.headline?.substring(0, 50)}..." is missing an image`,
        auto_fixable: true,
      });
    }
  }

  // Find articles with placeholder SVG images
  const { data: articlesWithPlaceholders, error: placeholderError } = await supabase
    .from('articles')
    .select('id, headline, image_url, created_at')
    .gte('created_at', windowStart.toISOString())
    .eq('status', 'published')
    .ilike('image_url', '%.svg')
    .order('created_at', { ascending: false })
    .limit(50);

  if (placeholderError) {
    console.error('Error detecting placeholder images:', placeholderError);
  } else if (articlesWithPlaceholders) {
    for (const article of articlesWithPlaceholders) {
      if (isPlaceholderImage(article.image_url)) {
        issues.push({
          issue_type: 'placeholder_image',
          article_id: article.id,
          description: `Article "${article.headline?.substring(0, 50)}..." has a placeholder image`,
          auto_fixable: true,
        });
      }
    }
  }

  return issues;
}

/**
 * Detect failed cron job executions
 */
export async function detectFailedJobs(
  supabase: SupabaseClient
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];

  // Calculate time window (last 6 hours)
  const windowStart = new Date();
  windowStart.setHours(windowStart.getHours() - FIX_CONFIG.ISSUE_DETECTION_WINDOW_HOURS);

  // Find failed cron executions
  const { data: failedJobs, error } = await supabase
    .from('cron_executions')
    .select('id, job_name, started_at, errors')
    .gte('started_at', windowStart.toISOString())
    .eq('success', false)
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error detecting failed jobs:', error);
    return issues;
  }

  if (failedJobs) {
    for (const job of failedJobs) {
      const errors = Array.isArray(job.errors) ? job.errors : [];
      const errorSummary = errors.length > 0
        ? errors.slice(0, 2).join('; ')
        : 'Unknown error';

      issues.push({
        issue_type: 'job_failure',
        job_name: job.job_name,
        description: `Cron job "${job.job_name}" failed: ${errorSummary.substring(0, 100)}`,
        auto_fixable: false, // Job re-runs need manual review
      });
    }
  }

  return issues;
}

/**
 * Get existing open issues to avoid duplicates
 */
export async function getExistingOpenIssues(
  supabase: SupabaseClient
): Promise<Map<string, CronIssue>> {
  const { data: openIssues, error } = await supabase
    .from('cron_issues')
    .select('*')
    .in('status', ['open', 'retrying'])
    .order('created_at', { ascending: false });

  const issueMap = new Map<string, CronIssue>();

  if (error) {
    console.error('Error fetching open issues:', error);
    return issueMap;
  }

  if (openIssues) {
    for (const issue of openIssues) {
      // Create unique key for deduplication
      const key = issue.article_id
        ? `${issue.issue_type}:${issue.article_id}`
        : `${issue.issue_type}:${issue.job_name}`;
      issueMap.set(key, issue as CronIssue);
    }
  }

  return issueMap;
}

/**
 * Get issues that are ready for retry
 */
export async function getRetryableIssues(
  supabase: SupabaseClient
): Promise<CronIssue[]> {
  const now = new Date().toISOString();

  const { data: retryableIssues, error } = await supabase
    .from('cron_issues')
    .select('*')
    .eq('status', 'open')
    .eq('auto_fixable', true)
    .lt('retry_count', FIX_CONFIG.MAX_RETRIES)
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(FIX_CONFIG.MAX_IMAGES_PER_RUN * 2);

  if (error) {
    console.error('Error fetching retryable issues:', error);
    return [];
  }

  return (retryableIssues || []) as CronIssue[];
}

/**
 * Create new issues in the database
 */
export async function createIssues(
  supabase: SupabaseClient,
  issues: DetectedIssue[]
): Promise<number> {
  if (issues.length === 0) return 0;

  // Get existing issues to avoid duplicates
  const existingIssues = await getExistingOpenIssues(supabase);
  const newIssues: DetectedIssue[] = [];

  for (const issue of issues) {
    const key = issue.article_id
      ? `${issue.issue_type}:${issue.article_id}`
      : `${issue.issue_type}:${issue.job_name}`;

    if (!existingIssues.has(key)) {
      newIssues.push(issue);
    }
  }

  if (newIssues.length === 0) return 0;

  const { data, error } = await supabase
    .from('cron_issues')
    .insert(
      newIssues.map(issue => ({
        issue_type: issue.issue_type,
        article_id: issue.article_id || null,
        job_name: issue.job_name || null,
        description: issue.description,
        auto_fixable: issue.auto_fixable,
        status: 'open',
        retry_count: 0,
        max_retries: FIX_CONFIG.MAX_RETRIES,
      }))
    )
    .select();

  if (error) {
    console.error('Error creating issues:', error);
    return 0;
  }

  return data?.length || 0;
}
