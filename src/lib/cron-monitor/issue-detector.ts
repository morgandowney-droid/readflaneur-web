/**
 * Cron Monitoring System - Issue Detector
 *
 * Detects articles with missing images, failed cron jobs, and other issues.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { DetectedIssue, FIX_CONFIG, CronIssue } from './types';
import { isMissingImage, isPlaceholderImage } from './image-validator';
import { getActiveNeighborhoodIds } from '@/lib/active-neighborhoods';
import { shouldGenerateToday } from '@/lib/generation-cadence';

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
 * Detect neighborhoods missing today's brief.
 *
 * "Today" is each edition's own local date (brief_date), and only editions
 * that publish today (shouldGenerateToday) and whose morning window has
 * passed count. Until 2 Oct 2026 this read created_at >= UTC midnight: a
 * European edition's brief is made at its local midnight, 22:00 or 23:00 UTC
 * the evening before, so after 12:00 UTC every European edition looked
 * missing, and monitor-and-fix re-ran its Grok search every 30 minutes, all
 * afternoon, about 290 wasted searches a day (Bregenz: 22 in one day).
 */
export async function detectMissingBriefs(
  supabase: SupabaseClient
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];
  const now = new Date();

  const { data: activeNeighborhoods, error: neighborhoodError } = await supabase
    .from('neighborhoods')
    .select('id, name, city, timezone')
    .eq('is_active', true);
  if (neighborhoodError) {
    console.error('Error fetching neighborhoods:', neighborhoodError);
    return issues;
  }

  const subscribedIds = await getActiveNeighborhoodIds(supabase);
  const localDate = (tz: string | null) => now.toLocaleDateString('en-CA', { timeZone: tz || 'UTC' });
  const localHour = (tz: string | null) => Number(now.toLocaleTimeString('en-GB', { timeZone: tz || 'UTC', hour: '2-digit', hour12: false }).slice(0, 2)) % 24;

  // Editions due today whose midnight-to-7am window has passed (9am gives the pipeline slack).
  const due = (activeNeighborhoods || []).filter((n) =>
    localHour(n.timezone) >= 9 && shouldGenerateToday(n.id, localDate(n.timezone), subscribedIds.has(n.id)));
  if (due.length === 0) return issues;

  const dates = Array.from(new Set(due.map((n) => localDate(n.timezone))));
  const covered = new Set<string>();
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: page, error: briefError } = await supabase
      .from('neighborhood_briefs')
      .select('neighborhood_id, brief_date')
      .in('brief_date', dates)
      .order('brief_date', { ascending: true })
      .range(offset, offset + 999);
    if (briefError) {
      console.error('Error fetching today\'s briefs:', briefError);
      return issues;
    }
    if (!page || page.length === 0) break;
    for (const b of page) covered.add(`${b.neighborhood_id}::${b.brief_date}`);
    if (page.length < 1000) break;
    offset += 1000;
  }

  for (const n of due) {
    if (covered.has(`${n.id}::${localDate(n.timezone)}`)) continue;
    issues.push({
      issue_type: 'missing_brief',
      neighborhood_id: n.id,
      description: `${n.name} (${n.city}) is missing today's brief`,
      auto_fixable: true,
    });
  }

  return issues;
}

/**
 * Regions that don't have regular RSS article flow.
 * These neighborhoods get Grok briefs but no RSS-sourced articles,
 * so 0 articles is the expected state — not an issue to flag.
 */
const THIN_CONTENT_EXEMPT_REGIONS = new Set([
  'test',
  'us-vacation',
  'europe-vacation',
  'caribbean-vacation',
]);

/**
 * Detect neighborhoods with thin/zero content in the last 24 hours.
 * Only flags neighborhoods that have RSS sources configured for their city,
 * since neighborhoods without RSS feeds are expected to have 0 articles.
 */
export async function detectThinContent(
  supabase: SupabaseClient
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];

  // Only check after 12:00 UTC to give morning crons time to run
  const currentHour = new Date().getUTCHours();
  if (currentHour < 12) {
    console.log(`[ThinContentDetector] Skipping - only ${currentHour}:00 UTC, waiting until 12:00 UTC`);
    return issues;
  }

  // Get all active non-combo neighborhoods (include region and city)
  const { data: activeNeighborhoods, error: neighborhoodError } = await supabase
    .from('neighborhoods')
    .select('id, name, city, region')
    .eq('is_active', true)
    .eq('is_combo', false);

  if (neighborhoodError || !activeNeighborhoods) {
    console.error('Error fetching neighborhoods for thin content check:', neighborhoodError);
    return issues;
  }

  // Get cities that have active RSS sources
  const { data: rssSources, error: rssError } = await supabase
    .from('rss_sources')
    .select('city')
    .eq('is_active', true);

  const citiesWithRss = new Set(
    (rssError ? [] : rssSources || []).map((s: { city: string }) => s.city)
  );

  // Filter to neighborhoods that should have article flow:
  // 1. Not in an exempt region (vacation, test)
  // 2. Their city has at least one active RSS source
  const monitoredNeighborhoods = activeNeighborhoods.filter(n => {
    if (THIN_CONTENT_EXEMPT_REGIONS.has(n.region || '')) return false;
    if (!citiesWithRss.has(n.city)) return false;
    return true;
  });

  console.log(`[ThinContentDetector] Monitoring ${monitoredNeighborhoods.length}/${activeNeighborhoods.length} neighborhoods (${activeNeighborhoods.length - monitoredNeighborhoods.length} exempt)`);

  // Count published articles per neighborhood in the last 24 hours
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const { data: recentArticles, error: articlesError } = await supabase
    .from('articles')
    .select('neighborhood_id')
    .eq('status', 'published')
    .gte('published_at', twentyFourHoursAgo.toISOString());

  if (articlesError) {
    console.error('Error fetching recent articles for thin content check:', articlesError);
    return issues;
  }

  // Count articles per neighborhood
  const articleCounts: Record<string, number> = {};
  for (const article of recentArticles || []) {
    if (article.neighborhood_id) {
      articleCounts[article.neighborhood_id] = (articleCounts[article.neighborhood_id] || 0) + 1;
    }
  }

  // Flag monitored neighborhoods below threshold
  for (const neighborhood of monitoredNeighborhoods) {
    const count = articleCounts[neighborhood.id] || 0;
    if (count < FIX_CONFIG.THIN_CONTENT_THRESHOLD) {
      issues.push({
        issue_type: 'thin_content',
        neighborhood_id: neighborhood.id,
        description: `${neighborhood.name} (${neighborhood.city}) has ${count} articles in the last 24h`,
        auto_fixable: true,
      });
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
      let key: string;
      if (issue.article_id) {
        key = `${issue.issue_type}:article:${issue.article_id}`;
      } else if (issue.neighborhood_id) {
        key = `${issue.issue_type}:neighborhood:${issue.neighborhood_id}`;
      } else {
        key = `${issue.issue_type}:job:${issue.job_name}`;
      }
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

  // Only fetch issues from the last N days - older issues are stale
  const maxAge = new Date();
  maxAge.setDate(maxAge.getDate() - FIX_CONFIG.MAX_ISSUE_AGE_DAYS);

  const { data: retryableIssues, error } = await supabase
    .from('cron_issues')
    .select('*')
    .eq('status', 'open')
    .eq('auto_fixable', true)
    .lt('retry_count', FIX_CONFIG.MAX_RETRIES)
    .gte('created_at', maxAge.toISOString())
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order('created_at', { ascending: false })
    .limit(50);

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
    let key: string;
    if (issue.article_id) {
      key = `${issue.issue_type}:article:${issue.article_id}`;
    } else if (issue.neighborhood_id) {
      key = `${issue.issue_type}:neighborhood:${issue.neighborhood_id}`;
    } else {
      key = `${issue.issue_type}:job:${issue.job_name}`;
    }

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
        neighborhood_id: issue.neighborhood_id || null,
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
