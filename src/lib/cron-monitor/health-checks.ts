/**
 * Daily Content Health Monitor - Check Functions
 *
 * Seven health checks that audit today's content pipeline.
 * Each returns a HealthCheckResult with pass/warn/fail status.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { DetectedIssue } from './types';

export interface HealthCheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  total: number;
  passing: number;
  failing: number;
  details: string[];
  issues: DetectedIssue[];
}

/**
 * Check 1: Daily briefs for all neighborhoods (+ Sunday Editions on Sundays)
 */
export async function checkBriefCoverage(
  supabase: SupabaseClient
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    name: 'Brief Coverage',
    status: 'pass',
    total: 0,
    passing: 0,
    failing: 0,
    details: [],
    issues: [],
  };

  // Get all active neighborhoods (with timezone for per-local-day checking)
  const { data: neighborhoods, error: nhError } = await supabase
    .from('neighborhoods')
    .select('id, name, city, timezone')
    .eq('is_active', true);

  if (nhError || !neighborhoods) {
    result.status = 'fail';
    result.details.push(`Failed to fetch neighborhoods: ${nhError?.message}`);
    return result;
  }

  result.total = neighborhoods.length;

  // Use per-timezone local date check (matches sync-neighborhood-briefs cron logic).
  // UTC midnight misses APAC neighborhoods whose "today" started before UTC midnight.
  // Fetch last 36h of briefs and check each against its local "today".
  const recentCutoff = new Date(Date.now() - 36 * 60 * 60 * 1000);

  const { data: recentBriefs } = await supabase
    .from('neighborhood_briefs')
    .select('neighborhood_id, created_at')
    .gte('created_at', recentCutoff.toISOString());

  // Build map of neighborhood_id -> brief timestamps
  const briefsByNeighborhood = new Map<string, string[]>();
  for (const b of recentBriefs || []) {
    const existing = briefsByNeighborhood.get(b.neighborhood_id) || [];
    existing.push(b.created_at);
    briefsByNeighborhood.set(b.neighborhood_id, existing);
  }

  function hasBriefForLocalToday(neighborhoodId: string, timezone: string | null): boolean {
    const timestamps = briefsByNeighborhood.get(neighborhoodId);
    if (!timestamps || timestamps.length === 0) return false;
    const tz = timezone || 'UTC';
    const now = new Date();
    const localToday = now.toLocaleDateString('en-CA', { timeZone: tz });
    return timestamps.some(ts => {
      const briefLocalDate = new Date(ts).toLocaleDateString('en-CA', { timeZone: tz });
      return briefLocalDate === localToday;
    });
  }

  // Only count neighborhoods whose morning window (midnight-7 AM local) has passed
  // as "missing". Neighborhoods still in or before their window aren't late yet.
  function morningWindowPassed(timezone: string | null): boolean {
    if (!timezone) return true;
    try {
      const now = new Date();
      const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      return localTime.getHours() >= 7;
    } catch {
      return true;
    }
  }

  const missing = neighborhoods.filter(n =>
    morningWindowPassed(n.timezone) && !hasBriefForLocalToday(n.id, n.timezone)
  );

  result.passing = result.total - missing.length;
  result.failing = missing.length;

  for (const n of missing.slice(0, 10)) {
    result.details.push(`Missing brief: ${n.name} (${n.city})`);
    result.issues.push({
      issue_type: 'missing_brief',
      neighborhood_id: n.id,
      description: `${n.name} (${n.city}) is missing today's brief`,
      auto_fixable: true,
    });
  }

  // On Sundays, also check weekly briefs
  const isSunday = new Date().getUTCDay() === 0;
  if (isSunday) {
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const weekDate = todayUtc.toISOString().split('T')[0];
    const { data: weeklyBriefs } = await supabase
      .from('weekly_briefs')
      .select('neighborhood_id')
      .eq('week_date', weekDate);

    const weeklyCovered = new Set((weeklyBriefs || []).map(b => b.neighborhood_id));
    const missingWeekly = neighborhoods.filter(n => !weeklyCovered.has(n.id));

    if (missingWeekly.length > 0) {
      result.failing += missingWeekly.length;
      result.total += neighborhoods.length; // Sunday adds a second dimension
      result.passing += neighborhoods.length - missingWeekly.length;

      for (const n of missingWeekly.slice(0, 5)) {
        result.details.push(`Missing Sunday Edition: ${n.name} (${n.city})`);
        result.issues.push({
          issue_type: 'missing_sunday_edition',
          neighborhood_id: n.id,
          description: `${n.name} (${n.city}) is missing this week's Sunday Edition`,
          auto_fixable: false,
        });
      }
      if (missingWeekly.length > 5) {
        result.details.push(`...and ${missingWeekly.length - 5} more missing Sunday Editions`);
      }
    }
  }

  // Set status
  if (result.failing === 0) {
    result.status = 'pass';
  } else {
    const failRate = missing.length / neighborhoods.length;
    result.status = failRate >= 0.05 ? 'fail' : 'warn';
  }

  return result;
}

/**
 * Check 2: Content quality - enriched and multi-paragraph
 */
export async function checkContentQuality(
  supabase: SupabaseClient
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    name: 'Content Quality',
    status: 'pass',
    total: 0,
    passing: 0,
    failing: 0,
    details: [],
    issues: [],
  };

  // Get today's briefs with enrichment status
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: briefs, error } = await supabase
    .from('neighborhood_briefs')
    .select('id, neighborhood_id, enriched_content, created_at, neighborhood:neighborhoods(name, city)')
    .gte('created_at', todayStart.toISOString());

  if (error || !briefs) {
    result.status = 'fail';
    result.details.push(`Failed to fetch briefs: ${error?.message}`);
    return result;
  }

  result.total = briefs.length;
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  let unenrichedCount = 0;
  let thinCount = 0;

  for (const brief of briefs) {
    const nh = brief.neighborhood as unknown as { name: string; city: string } | null;
    const label = nh ? `${nh.name} (${nh.city})` : brief.neighborhood_id;

    if (!brief.enriched_content) {
      // Only flag if older than 30 minutes (give enrichment cron time)
      if (brief.created_at < thirtyMinAgo) {
        unenrichedCount++;
        if (result.details.length < 10) {
          result.details.push(`Unenriched (${Math.round((Date.now() - new Date(brief.created_at).getTime()) / 60000)}min old): ${label}`);
        }
        result.issues.push({
          issue_type: 'unenriched_brief',
          neighborhood_id: brief.neighborhood_id,
          description: `Brief for ${label} still unenriched after 30+ minutes`,
          auto_fixable: true,
        });
      }
      continue;
    }

    // Check paragraph count
    const paragraphs = brief.enriched_content.split('\n\n').filter((p: string) => p.trim().length > 0);
    if (paragraphs.length < 2) {
      thinCount++;
      if (result.details.length < 10) {
        result.details.push(`Thin content (${paragraphs.length} paragraph${paragraphs.length === 1 ? '' : 's'}): ${label}`);
      }
      result.issues.push({
        issue_type: 'thin_brief',
        neighborhood_id: brief.neighborhood_id,
        description: `Brief for ${label} has only ${paragraphs.length} paragraph(s)`,
        auto_fixable: false,
      });
    }
  }

  result.failing = unenrichedCount + thinCount;
  result.passing = result.total - result.failing;

  if (result.failing === 0) {
    result.status = 'pass';
  } else if (unenrichedCount > 0 && result.total > 0 && unenrichedCount / result.total > 0.1) {
    result.status = 'fail';
  } else {
    result.status = 'warn';
  }

  return result;
}

/**
 * Check 3: Hyperlinks present in enriched content
 */
export async function checkHyperlinks(
  supabase: SupabaseClient
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    name: 'Hyperlinks',
    status: 'pass',
    total: 0,
    passing: 0,
    failing: 0,
    details: [],
    issues: [],
  };

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: briefs, error } = await supabase
    .from('neighborhood_briefs')
    .select('id, neighborhood_id, enriched_content, neighborhood:neighborhoods(name, city)')
    .gte('created_at', todayStart.toISOString())
    .not('enriched_content', 'is', null);

  if (error || !briefs) {
    result.status = 'fail';
    result.details.push(`Failed to fetch enriched briefs: ${error?.message}`);
    return result;
  }

  result.total = briefs.length;
  const linkRegex = /\[[^\]]+\]\(https?:\/\/[^)]+\)/;

  for (const brief of briefs) {
    const hasLinks = linkRegex.test(brief.enriched_content || '');
    if (hasLinks) {
      result.passing++;
    } else {
      result.failing++;
      const nh = brief.neighborhood as unknown as { name: string; city: string } | null;
      const label = nh ? `${nh.name} (${nh.city})` : brief.neighborhood_id;

      if (result.details.length < 10) {
        result.details.push(`No hyperlinks: ${label}`);
      }
      result.issues.push({
        issue_type: 'missing_hyperlinks',
        neighborhood_id: brief.neighborhood_id,
        description: `Enriched brief for ${label} contains no markdown hyperlinks`,
        auto_fixable: true,
      });
    }
  }

  if (result.failing === 0) {
    result.status = 'pass';
  } else if (result.total > 0 && result.failing / result.total > 0.2) {
    result.status = 'fail';
  } else {
    result.status = 'warn';
  }

  return result;
}

/**
 * Check 4: No HTML artifacts in article bodies
 */
export async function checkHtmlArtifacts(
  supabase: SupabaseClient
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    name: 'HTML Artifacts',
    status: 'pass',
    total: 0,
    passing: 0,
    failing: 0,
    details: [],
    issues: [],
  };

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, headline, body_text, neighborhood_id')
    .eq('status', 'published')
    .gte('published_at', todayStart.toISOString());

  if (error || !articles) {
    result.status = 'fail';
    result.details.push(`Failed to fetch articles: ${error?.message}`);
    return result;
  }

  result.total = articles.length;

  const htmlTagRegex = /<(div|span|p|br|a|h[1-6]|img|ul|ol|li|table|tr|td|strong|em|b|i)\b[^>]*>/i;
  const grokLeakRegex = /\{['"](?:title|url|snippet)['"]:/;

  for (const article of articles) {
    const body = article.body_text || '';
    const hasHtml = htmlTagRegex.test(body);
    const hasGrokLeak = grokLeakRegex.test(body);

    if (hasHtml || hasGrokLeak) {
      result.failing++;
      const headline = (article.headline || '').substring(0, 50);
      const issue = hasHtml ? 'HTML tags' : 'Grok data leak';

      if (result.details.length < 10) {
        result.details.push(`${issue} in: "${headline}..."`);
      }
      result.issues.push({
        issue_type: 'html_artifact',
        article_id: article.id,
        neighborhood_id: article.neighborhood_id,
        description: `Article "${headline}..." contains ${issue}`,
        auto_fixable: false,
      });
    } else {
      result.passing++;
    }
  }

  result.status = result.failing > 0 ? 'fail' : 'pass';

  return result;
}

/**
 * Check 5: Translation coverage for today's content
 */
export async function checkTranslationCoverage(
  supabase: SupabaseClient
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    name: 'Translation Coverage',
    status: 'pass',
    total: 0,
    passing: 0,
    failing: 0,
    details: [],
    issues: [],
  };

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Get today's article IDs
  const { data: articles } = await supabase
    .from('articles')
    .select('id')
    .eq('status', 'published')
    .gte('published_at', todayStart.toISOString());

  const articleIds = (articles || []).map(a => a.id);

  // Get today's brief IDs
  const { data: briefs } = await supabase
    .from('neighborhood_briefs')
    .select('id')
    .gte('created_at', todayStart.toISOString());

  const briefIds = (briefs || []).map(b => b.id);

  result.total = articleIds.length + briefIds.length;

  if (result.total === 0) {
    result.details.push('No content published today yet');
    return result;
  }

  // Check article translations
  let articlesWithTranslations = 0;
  if (articleIds.length > 0) {
    const { data: articleTranslations } = await supabase
      .from('article_translations')
      .select('article_id')
      .in('article_id', articleIds.slice(0, 500));

    const translatedArticleIds = new Set((articleTranslations || []).map(t => t.article_id));
    articlesWithTranslations = translatedArticleIds.size;
  }

  // Check brief translations
  let briefsWithTranslations = 0;
  if (briefIds.length > 0) {
    const { data: briefTranslations } = await supabase
      .from('brief_translations')
      .select('brief_id')
      .in('brief_id', briefIds.slice(0, 500));

    const translatedBriefIds = new Set((briefTranslations || []).map(t => t.brief_id));
    briefsWithTranslations = translatedBriefIds.size;
  }

  result.passing = articlesWithTranslations + briefsWithTranslations;
  result.failing = result.total - result.passing;

  result.details.push(`Articles: ${articlesWithTranslations}/${articleIds.length} translated`);
  result.details.push(`Briefs: ${briefsWithTranslations}/${briefIds.length} translated`);

  // No issues created - translate-content cron handles this
  const coverageRate = result.total > 0 ? result.passing / result.total : 0;
  if (coverageRate > 0.5) {
    result.status = 'pass';
  } else if (coverageRate >= 0.1) {
    result.status = 'warn';
  } else {
    result.status = 'fail';
  }

  return result;
}

/**
 * Check 6: Email delivery for today
 */
export async function checkEmailDelivery(
  supabase: SupabaseClient
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    name: 'Email Delivery',
    status: 'pass',
    total: 0,
    passing: 0,
    failing: 0,
    details: [],
    issues: [],
  };

  const today = new Date().toISOString().split('T')[0];

  // Count daily brief sends for today
  const { count: dailySendCount } = await supabase
    .from('daily_brief_sends')
    .select('*', { count: 'exact', head: true })
    .eq('send_date', today);

  // Count total eligible recipients (profiles + newsletter subscribers with neighborhoods)
  const { count: profileCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .not('primary_city', 'is', null);

  const { count: subscriberCount } = await supabase
    .from('newsletter_subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  const totalRecipients = (profileCount || 0) + (subscriberCount || 0);
  const totalSent = dailySendCount || 0;

  result.total = totalRecipients;
  result.passing = totalSent;
  result.failing = Math.max(0, totalRecipients - totalSent);

  result.details.push(`${totalSent} emails sent today out of ~${totalRecipients} recipients`);

  // On Sundays, also check weekly sends
  const isSunday = new Date().getUTCDay() === 0;
  if (isSunday) {
    const { count: weeklySendCount } = await supabase
      .from('weekly_brief_sends')
      .select('*', { count: 'exact', head: true })
      .eq('week_date', today);

    result.details.push(`Sunday Edition: ${weeklySendCount || 0} sent`);
  }

  // No issues created - existing missed_email detection in monitor-and-fix handles individuals
  if (totalRecipients === 0) {
    result.status = 'pass';
  } else {
    const deliveryRate = totalSent / totalRecipients;
    if (deliveryRate >= 0.95) {
      result.status = 'pass';
    } else if (deliveryRate >= 0.90) {
      result.status = 'warn';
    } else {
      result.status = 'fail';
    }
  }

  return result;
}

/**
 * Check 7: Story images - all published articles have images
 */
export async function checkStoryImages(
  supabase: SupabaseClient
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    name: 'Story Images',
    status: 'pass',
    total: 0,
    passing: 0,
    failing: 0,
    details: [],
    issues: [],
  };

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Count total articles today
  const { count: totalCount } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .gte('published_at', todayStart.toISOString());

  result.total = totalCount || 0;

  // Find articles missing images
  const { data: missingImages, error } = await supabase
    .from('articles')
    .select('id, headline, neighborhood_id')
    .eq('status', 'published')
    .gte('published_at', todayStart.toISOString())
    .or('image_url.is.null,image_url.eq.')
    .limit(20);

  if (error) {
    result.status = 'fail';
    result.details.push(`Failed to query: ${error.message}`);
    return result;
  }

  result.failing = (missingImages || []).length;
  result.passing = result.total - result.failing;

  for (const article of (missingImages || []).slice(0, 10)) {
    const headline = (article.headline || '').substring(0, 50);
    result.details.push(`Missing image: "${headline}..."`);
    result.issues.push({
      issue_type: 'missing_image',
      article_id: article.id,
      neighborhood_id: article.neighborhood_id,
      description: `Article "${headline}..." is missing an image`,
      auto_fixable: true,
    });
  }

  if (result.failing === 0) {
    result.status = 'pass';
  } else {
    const failRate = result.total > 0 ? result.failing / result.total : 0;
    result.status = failRate >= 0.05 ? 'fail' : 'warn';
  }

  return result;
}

/**
 * Run all 7 health checks and return results
 */
export async function runAllHealthChecks(
  supabase: SupabaseClient
): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];

  const checks = [
    checkBriefCoverage,
    checkContentQuality,
    checkHyperlinks,
    checkHtmlArtifacts,
    checkTranslationCoverage,
    checkEmailDelivery,
    checkStoryImages,
  ];

  for (const check of checks) {
    try {
      const result = await check(supabase);
      results.push(result);
    } catch (err) {
      results.push({
        name: check.name.replace('check', ''),
        status: 'fail',
        total: 0,
        passing: 0,
        failing: 0,
        details: [`Check threw error: ${err instanceof Error ? err.message : String(err)}`],
        issues: [],
      });
    }
  }

  return results;
}
