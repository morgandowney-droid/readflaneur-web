/**
 * Email Monitoring & Self-Healing
 *
 * Detects missed daily brief emails, diagnoses the root cause,
 * fixes the underlying issue, and resends the email.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { DetectedIssue, EmailDiagnosis, FIX_CONFIG, FixResult } from './types';

/**
 * Check if a recipient's 7 AM local time + grace period has passed
 */
function hasDeliveryWindowPassed(timezone: string): boolean {
  try {
    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const localHour = localTime.getHours();
    // 7 AM send + grace period = must be past 8 AM local
    return localHour >= 7 + FIX_CONFIG.EMAIL_DETECTION_GRACE_HOURS;
  } catch {
    return false;
  }
}

/**
 * Get the UTC hour range when a timezone's 7 AM would have fired
 */
function getExpectedCronHourUTC(timezone: string): number | null {
  try {
    // Create a date at today's 7 AM in the target timezone
    const now = new Date();
    const localDateStr = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
    // Parse out what UTC hour corresponds to 7 AM in this timezone
    const sevenAM = new Date(`${localDateStr}T07:00:00`);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    // Work backwards: find the UTC hour when local time was 7 AM
    // Simple approach: check each UTC hour to find when local = 7
    for (let utcHour = 0; utcHour < 24; utcHour++) {
      const testDate = new Date(now);
      testDate.setUTCHours(utcHour, 0, 0, 0);
      const localHour = parseInt(
        new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          hour12: false,
        }).format(testDate)
      );
      if (localHour === 7) return utcHour;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect recipients who should have received a daily brief today but didn't
 */
export async function detectMissedEmails(
  supabase: SupabaseClient
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];
  const today = new Date().toISOString().split('T')[0];

  // 1. Get all profile recipients with daily email enabled
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, primary_timezone, daily_email_enabled')
    .eq('daily_email_enabled', true)
    .not('email', 'is', null);

  // 2. Get all newsletter subscribers with daily email enabled
  const { data: subscribers } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, timezone, daily_email_enabled, email_verified, neighborhood_ids')
    .eq('daily_email_enabled', true)
    .eq('email_verified', true)
    .not('email', 'is', null);

  // 3. Get today's sends for dedup
  const { data: todaysSends } = await supabase
    .from('daily_brief_sends')
    .select('recipient_id')
    .eq('send_date', today);

  const sentIds = new Set((todaysSends || []).map(s => s.recipient_id));

  // 4. Check profiles
  if (profiles) {
    for (const profile of profiles) {
      if (!profile.email) continue;
      if (sentIds.has(profile.id)) continue; // Already sent today

      const tz = profile.primary_timezone;
      // If no timezone, they'd always be skipped — but only flag after noon UTC
      // to give the system time to process morning timezones
      if (!tz) {
        const currentUTCHour = new Date().getUTCHours();
        if (currentUTCHour < 12) continue; // Too early to flag

        const diagnosis = await diagnoseEmailFailure(
          supabase, profile.id, profile.email, 'profile', null
        );
        if (diagnosis.cause === 'disabled_by_user') continue;

        issues.push({
          issue_type: 'missed_email',
          job_name: profile.email, // Store email in job_name for dedup key
          description: JSON.stringify(diagnosis),
          auto_fixable: diagnosis.autoFixable,
        });
        continue;
      }

      // Check if delivery window has passed
      if (!hasDeliveryWindowPassed(tz)) continue;

      const diagnosis = await diagnoseEmailFailure(
        supabase, profile.id, profile.email, 'profile', tz
      );
      if (diagnosis.cause === 'disabled_by_user') continue;

      issues.push({
        issue_type: 'missed_email',
        job_name: profile.email,
        description: JSON.stringify(diagnosis),
        auto_fixable: diagnosis.autoFixable,
      });
    }
  }

  // 5. Check newsletter subscribers
  if (subscribers) {
    for (const sub of subscribers) {
      if (!sub.email) continue;
      if (sentIds.has(sub.id)) continue;

      const tz = sub.timezone;
      if (!tz) {
        const currentUTCHour = new Date().getUTCHours();
        if (currentUTCHour < 12) continue;

        const diagnosis = await diagnoseEmailFailure(
          supabase, sub.id, sub.email, 'newsletter', null
        );
        if (diagnosis.cause === 'disabled_by_user') continue;

        issues.push({
          issue_type: 'missed_email',
          job_name: sub.email,
          description: JSON.stringify(diagnosis),
          auto_fixable: diagnosis.autoFixable,
        });
        continue;
      }

      if (!hasDeliveryWindowPassed(tz)) continue;

      const diagnosis = await diagnoseEmailFailure(
        supabase, sub.id, sub.email, 'newsletter', tz
      );
      if (diagnosis.cause === 'disabled_by_user') continue;

      issues.push({
        issue_type: 'missed_email',
        job_name: sub.email,
        description: JSON.stringify(diagnosis),
        auto_fixable: diagnosis.autoFixable,
      });
    }
  }

  return issues;
}

/**
 * Diagnose WHY a recipient missed their daily brief email.
 * Runs checks in priority order — first match wins.
 */
export async function diagnoseEmailFailure(
  supabase: SupabaseClient,
  recipientId: string,
  email: string,
  source: 'profile' | 'newsletter',
  timezone: string | null
): Promise<EmailDiagnosis> {
  const base = { recipientId, email, source };

  // 1. Check if email is disabled
  if (source === 'profile') {
    const { data } = await supabase
      .from('profiles')
      .select('daily_email_enabled')
      .eq('id', recipientId)
      .single();
    if (data && !data.daily_email_enabled) {
      return {
        ...base,
        cause: 'disabled_by_user',
        details: 'User has daily_email_enabled=false',
        autoFixable: false,
      };
    }
  } else {
    const { data } = await supabase
      .from('newsletter_subscribers')
      .select('daily_email_enabled')
      .eq('id', recipientId)
      .single();
    if (data && !data.daily_email_enabled) {
      return {
        ...base,
        cause: 'disabled_by_user',
        details: 'Subscriber has daily_email_enabled=false',
        autoFixable: false,
      };
    }
  }

  // 2. Check timezone
  if (!timezone) {
    return {
      ...base,
      cause: 'missing_timezone',
      details: source === 'profile'
        ? 'Profile has primary_timezone=NULL'
        : 'Subscriber has timezone=NULL',
      autoFixable: true,
    };
  }

  // 3. Check neighborhood subscriptions
  if (source === 'profile') {
    const { data: prefs } = await supabase
      .from('user_neighborhood_preferences')
      .select('neighborhood_id')
      .eq('user_id', recipientId);
    if (!prefs || prefs.length === 0) {
      return {
        ...base,
        cause: 'no_neighborhoods',
        details: 'User has no neighborhood subscriptions in user_neighborhood_preferences',
        autoFixable: false,
      };
    }
  } else {
    const { data: sub } = await supabase
      .from('newsletter_subscribers')
      .select('neighborhood_ids')
      .eq('id', recipientId)
      .single();
    if (!sub?.neighborhood_ids || sub.neighborhood_ids.length === 0) {
      return {
        ...base,
        cause: 'no_neighborhoods',
        details: 'Subscriber has empty neighborhood_ids array',
        autoFixable: false,
      };
    }
  }

  // 4. Check if cron ran during the expected hour
  const expectedHour = getExpectedCronHourUTC(timezone);
  if (expectedHour !== null) {
    const today = new Date();
    today.setUTCHours(expectedHour, 0, 0, 0);
    const hourStart = today.toISOString();
    today.setUTCHours(expectedHour + 1, 0, 0, 0);
    const hourEnd = today.toISOString();

    const { data: cronRuns } = await supabase
      .from('cron_executions')
      .select('id, status, items_processed, items_created, items_failed, error_message, metadata')
      .eq('job_name', 'send-daily-brief')
      .gte('started_at', hourStart)
      .lt('started_at', hourEnd)
      .limit(1);

    if (!cronRuns || cronRuns.length === 0) {
      return {
        ...base,
        cause: 'cron_not_run',
        details: `No send-daily-brief execution found for UTC hour ${expectedHour} (${timezone} 7 AM)`,
        autoFixable: true,
      };
    }

    // 5. Check if the cron run had failures or skips
    const run = cronRuns[0];
    if (run.items_failed && run.items_failed > 0) {
      return {
        ...base,
        cause: 'send_failed',
        details: `Cron ran but had ${run.items_failed} failures. Error: ${run.error_message || 'unknown'}`,
        autoFixable: true,
      };
    }

    const metadata = run.metadata as Record<string, unknown> | null;
    if (metadata && typeof metadata.emails_skipped === 'number' && metadata.emails_skipped > 0) {
      return {
        ...base,
        cause: 'rate_limit_overflow',
        details: `Cron ran but skipped ${metadata.emails_skipped} recipients due to rate limit`,
        autoFixable: true,
      };
    }
  }

  // 6. Unknown cause — still try to resend
  return {
    ...base,
    cause: 'unknown',
    details: 'All checks passed but email was not sent. Attempting resend.',
    autoFixable: true,
  };
}

/**
 * Fix the root cause of a missed email before resending
 */
export async function fixEmailRootCause(
  supabase: SupabaseClient,
  diagnosis: EmailDiagnosis
): Promise<FixResult> {
  switch (diagnosis.cause) {
    case 'missing_timezone': {
      // Resolve timezone from first subscribed neighborhood
      let neighborhoodId: string | null = null;

      if (diagnosis.source === 'profile') {
        const { data: prefs } = await supabase
          .from('user_neighborhood_preferences')
          .select('neighborhood_id')
          .eq('user_id', diagnosis.recipientId)
          .limit(1);
        neighborhoodId = prefs?.[0]?.neighborhood_id || null;
      } else {
        const { data: sub } = await supabase
          .from('newsletter_subscribers')
          .select('neighborhood_ids')
          .eq('id', diagnosis.recipientId)
          .single();
        neighborhoodId = sub?.neighborhood_ids?.[0] || null;
      }

      if (!neighborhoodId) {
        return { success: false, message: 'No neighborhood found to derive timezone from' };
      }

      const { data: neighborhood } = await supabase
        .from('neighborhoods')
        .select('timezone')
        .eq('id', neighborhoodId)
        .single();

      if (!neighborhood?.timezone) {
        return { success: false, message: `Neighborhood ${neighborhoodId} has no timezone` };
      }

      // Update the timezone
      if (diagnosis.source === 'profile') {
        const { error } = await supabase
          .from('profiles')
          .update({ primary_timezone: neighborhood.timezone })
          .eq('id', diagnosis.recipientId);
        if (error) {
          return { success: false, message: `Failed to update profile timezone: ${error.message}` };
        }
      } else {
        const { error } = await supabase
          .from('newsletter_subscribers')
          .update({ timezone: neighborhood.timezone })
          .eq('id', diagnosis.recipientId);
        if (error) {
          return { success: false, message: `Failed to update subscriber timezone: ${error.message}` };
        }
      }

      return {
        success: true,
        message: `Set timezone to ${neighborhood.timezone} from neighborhood ${neighborhoodId}`,
      };
    }

    case 'cron_not_run':
    case 'send_failed':
    case 'rate_limit_overflow':
    case 'unknown':
      // No DB fix needed — resend will handle it
      return { success: true, message: `No root cause DB fix needed for ${diagnosis.cause}` };

    case 'no_neighborhoods':
      return { success: false, message: 'Cannot fix: user has no neighborhood subscriptions' };

    case 'disabled_by_user':
      return { success: false, message: 'Cannot fix: user has disabled daily emails' };

    default:
      return { success: false, message: `Unknown cause: ${diagnosis.cause}` };
  }
}

/**
 * Resend a daily brief email to a specific recipient
 */
export async function resendEmail(
  email: string,
  baseUrl: string,
  cronSecret: string
): Promise<FixResult> {
  try {
    const response = await fetch(
      `${baseUrl}/api/cron/send-daily-brief?test=${encodeURIComponent(email)}&force=true`,
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

    if (data.emails_sent > 0) {
      return {
        success: true,
        message: `Email resent successfully to ${email}`,
      };
    }

    const errorMsg = data.errors?.join('; ') || 'No email sent';
    return { success: false, message: errorMsg };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
