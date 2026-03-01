/**
 * Instant Email Resend
 *
 * When a user changes settings that affect their Daily Brief (timezone,
 * neighborhoods, paused topics), immediately re-send today's email with
 * the updated preferences. Rate limited to 3 resends per day.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { EmailRecipient } from './types';
import { assembleDailyBrief } from './assembler';
import { sendDailyBrief } from './sender';
import { sendEmail } from '@/lib/email';
import { checkDailyEmailLimit } from './daily-email-limit';

const MAX_RESENDS_PER_DAY = 3;

export type ResendTrigger = 'city_change' | 'neighborhood_change' | 'topic_change';

export interface ResendResult {
  success: boolean;
  reason: 'sent' | 'email_disabled' | 'no_recipient' | 'rate_limited' | 'send_failed' | 'error';
  error?: string;
}

/**
 * Check if a recipient has exceeded the daily resend limit
 */
async function checkResendRateLimit(
  supabase: SupabaseClient,
  recipientId: string,
  max = MAX_RESENDS_PER_DAY
): Promise<{ allowed: boolean; count: number }> {
  const { count, error } = await supabase
    .from('instant_resend_log')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .eq('send_date', new Date().toISOString().split('T')[0]);

  if (error) {
    console.error('Error checking resend rate limit:', error);
    // Allow on error — better to send than to block
    return { allowed: true, count: 0 };
  }

  const currentCount = count || 0;
  return { allowed: currentCount < max, count: currentCount };
}

/**
 * Delete existing daily_brief_sends row for today so the re-send can insert a new one
 */
async function deleteExistingDailyBriefSend(
  supabase: SupabaseClient,
  recipientId: string
): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase
    .from('daily_brief_sends')
    .delete()
    .eq('recipient_id', recipientId)
    .eq('send_date', today);

  if (error) {
    console.error('Error deleting existing daily_brief_sends:', error);
    return false;
  }
  return true;
}

/**
 * Build an EmailRecipient from a user's profile or newsletter subscription
 */
async function buildRecipientForResend(
  supabase: SupabaseClient,
  userId: string,
  source: 'profile' | 'newsletter'
): Promise<EmailRecipient | null> {
  if (source === 'profile') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, primary_city, primary_timezone, email_unsubscribe_token, paused_topics, daily_email_enabled')
      .eq('id', userId)
      .single();

    if (!profile || !profile.email) return null;
    if (profile.daily_email_enabled === false) return null;

    const { data: prefs } = await supabase
      .from('user_neighborhood_preferences')
      .select('neighborhood_id')
      .eq('user_id', profile.id);

    const neighborhoodIds = prefs?.map((p: any) => p.neighborhood_id) || [];
    if (neighborhoodIds.length === 0) return null;

    return {
      id: profile.id,
      email: profile.email,
      source: 'profile',
      timezone: profile.primary_timezone || 'America/New_York',
      primaryNeighborhoodId: neighborhoodIds[0] || null,
      subscribedNeighborhoodIds: neighborhoodIds,
      unsubscribeToken: profile.email_unsubscribe_token || 'no-token',
      pausedTopics: profile.paused_topics || [],
    };
  }

  // Newsletter subscriber
  const { data: sub } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, neighborhood_ids, timezone, unsubscribe_token, paused_topics, daily_email_enabled')
    .eq('id', userId)
    .single();

  if (!sub || !sub.email) return null;
  if (sub.daily_email_enabled === false) return null;

  const neighborhoodIds = sub.neighborhood_ids || [];
  if (neighborhoodIds.length === 0) return null;

  return {
    id: sub.id,
    email: sub.email,
    source: 'newsletter',
    timezone: sub.timezone || 'America/New_York',
    primaryNeighborhoodId: neighborhoodIds[0] || null,
    subscribedNeighborhoodIds: neighborhoodIds,
    unsubscribeToken: sub.unsubscribe_token || 'no-token',
    pausedTopics: sub.paused_topics || [],
  };
}

/**
 * Send a notice when rate limit is reached
 */
async function sendRateLimitNotice(email: string): Promise<void> {
  try {
    await sendEmail({
      to: email,
      subject: 'Settings saved — updated email tomorrow',
      from: 'Flaneur News <noreply@readflaneur.com>',
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-weight: 300; letter-spacing: 0.1em; font-size: 18px;">FLANEUR</h1>
          <p style="color: #333; line-height: 1.6;">Your settings have been saved successfully.</p>
          <p style="color: #333; line-height: 1.6;">You've reached the maximum of 3 updated emails per day. Your changes will be reflected in tomorrow morning's Daily Brief.</p>
          <p style="color: #999; font-size: 13px; margin-top: 30px;">This is an automated message from Flaneur.</p>
        </div>
      `,
    });
  } catch {
    // Fire-and-forget — swallow errors
  }
}

/**
 * Main orchestrator: check eligibility, delete old send, assemble + send new email
 */
export async function performInstantResend(
  supabase: SupabaseClient,
  params: { userId: string; source: 'profile' | 'newsletter'; trigger: ResendTrigger }
): Promise<ResendResult> {
  const { userId, source, trigger } = params;

  try {
    // 0. Skip on Sundays — Daily Brief doesn't send on Sundays (Sunday Edition does instead)
    if (new Date().getUTCDay() === 0) {
      console.log(`Instant resend skipped: Sunday (trigger: ${trigger})`);
      return { success: false, reason: 'email_disabled' };
    }

    // 1. Build recipient (also checks email_enabled and neighborhoods)
    const recipient = await buildRecipientForResend(supabase, userId, source);
    if (!recipient) {
      return { success: false, reason: 'no_recipient' };
    }

    // 2. Check resend-specific rate limit (3/day)
    const rateLimit = await checkResendRateLimit(supabase, recipient.id);
    if (!rateLimit.allowed) {
      await sendRateLimitNotice(recipient.email);
      return { success: false, reason: 'rate_limited' };
    }

    // 2b. Check global daily email limit (5/day across all email types)
    const globalLimit = await checkDailyEmailLimit(supabase, recipient.id);
    if (!globalLimit.allowed) {
      await sendRateLimitNotice(recipient.email);
      return { success: false, reason: 'rate_limited' };
    }

    // 3. Delete existing daily_brief_sends row for today
    await deleteExistingDailyBriefSend(supabase, recipient.id);

    // 4. Assemble fresh email content
    const content = await assembleDailyBrief(supabase, recipient);

    // 5. Send the email (also inserts into daily_brief_sends)
    const sent = await sendDailyBrief(supabase, content);
    if (!sent) {
      return { success: false, reason: 'send_failed' };
    }

    // 6. Log to rate limit table
    await supabase.from('instant_resend_log').insert({
      recipient_id: recipient.id,
      recipient_source: source,
      trigger,
    });

    console.log(`Instant resend success: ${recipient.email} (trigger: ${trigger})`);
    return { success: true, reason: 'sent' };
  } catch (error) {
    console.error('Instant resend error:', error);
    return { success: false, reason: 'error', error: (error as Error).message };
  }
}
