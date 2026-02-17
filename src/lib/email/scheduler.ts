/**
 * Daily Brief Email Scheduler
 * Resolves which recipients should receive emails at the current hour
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { EmailRecipient } from './types';

/**
 * Check if the current local hour matches the target hour for a timezone
 */
function isTargetHour(timezone: string, targetHour: number): boolean {
  try {
    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    return localTime.getHours() === targetHour;
  } catch {
    return false;
  }
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Resolve all recipients who should receive the daily brief right now
 * Merges profiles (logged-in users) and newsletter_subscribers (anonymous)
 * Filters by timezone (7 AM local) and deduplicates by email
 */
export async function resolveRecipients(
  supabase: SupabaseClient,
  targetHour: number = 7
): Promise<EmailRecipient[]> {
  const today = getTodayDateString();
  const recipients: EmailRecipient[] = [];
  const seenEmails = new Set<string>();

  // 1. Fetch logged-in users with neighborhood preferences
  const { data: profileRows } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      primary_city,
      primary_neighborhood_id,
      primary_timezone,
      email_unsubscribe_token,
      daily_email_enabled,
      paused_topics,
      referral_code
    `)
    .eq('daily_email_enabled', true)
    .not('primary_timezone', 'is', null)
    .not('email', 'is', null);

  if (profileRows) {
    for (const profile of profileRows) {
      if (!profile.email || !profile.primary_timezone) continue;
      if (!isTargetHour(profile.primary_timezone, targetHour)) continue;

      // Get user's subscribed neighborhoods
      const { data: prefs } = await supabase
        .from('user_neighborhood_preferences')
        .select('neighborhood_id')
        .eq('user_id', profile.id);

      const neighborhoodIds = prefs?.map(p => p.neighborhood_id) || [];
      if (neighborhoodIds.length === 0) continue;

      // Resolve primary: use exact neighborhood ID if set, fall back to city match
      let primaryId: string | null = null;
      if (profile.primary_neighborhood_id && neighborhoodIds.includes(profile.primary_neighborhood_id)) {
        primaryId = profile.primary_neighborhood_id;
      } else if (profile.primary_city) {
        // Fallback: find first subscribed neighborhood in primary_city
        const { data: neighborhoods } = await supabase
          .from('neighborhoods')
          .select('id, city')
          .in('id', neighborhoodIds);

        const match = neighborhoods?.find(
          n => n.city?.toLowerCase() === profile.primary_city?.toLowerCase()
        );
        primaryId = match?.id || neighborhoodIds[0];
      } else {
        primaryId = neighborhoodIds[0];
      }

      // Lazy-generate referral code if missing
      let referralCode = profile.referral_code;
      if (!referralCode) {
        const { data: codeResult } = await supabase.rpc('generate_referral_code');
        if (codeResult) {
          referralCode = codeResult;
          await supabase
            .from('profiles')
            .update({ referral_code: codeResult })
            .eq('id', profile.id);
        }
      }

      seenEmails.add(profile.email.toLowerCase());
      recipients.push({
        id: profile.id,
        email: profile.email,
        source: 'profile',
        timezone: profile.primary_timezone,
        primaryNeighborhoodId: primaryId,
        subscribedNeighborhoodIds: neighborhoodIds,
        unsubscribeToken: profile.email_unsubscribe_token,
        pausedTopics: profile.paused_topics || [],
        referralCode: referralCode || undefined,
      });
    }
  }

  // 2. Fetch anonymous newsletter subscribers
  const { data: subscriberRows } = await supabase
    .from('newsletter_subscribers')
    .select(`
      id,
      email,
      neighborhood_ids,
      timezone,
      unsubscribe_token,
      daily_email_enabled,
      email_verified,
      paused_topics,
      referral_code
    `)
    .eq('daily_email_enabled', true)
    .eq('email_verified', true)
    .not('timezone', 'is', null);

  if (subscriberRows) {
    for (const sub of subscriberRows) {
      if (!sub.email || !sub.timezone) continue;
      if (seenEmails.has(sub.email.toLowerCase())) continue; // Skip if already a profile
      if (!sub.neighborhood_ids || sub.neighborhood_ids.length === 0) continue;
      if (!isTargetHour(sub.timezone, targetHour)) continue;

      // Lazy-generate referral code if missing
      let subReferralCode = sub.referral_code;
      if (!subReferralCode) {
        const { data: codeResult } = await supabase.rpc('generate_referral_code');
        if (codeResult) {
          subReferralCode = codeResult;
          await supabase
            .from('newsletter_subscribers')
            .update({ referral_code: codeResult })
            .eq('id', sub.id);
        }
      }

      seenEmails.add(sub.email.toLowerCase());
      recipients.push({
        id: sub.id,
        email: sub.email,
        source: 'newsletter',
        timezone: sub.timezone,
        primaryNeighborhoodId: sub.neighborhood_ids[0],
        subscribedNeighborhoodIds: sub.neighborhood_ids,
        unsubscribeToken: sub.unsubscribe_token,
        pausedTopics: sub.paused_topics || [],
        referralCode: subReferralCode || undefined,
      });
    }
  }

  // 3. Exclude already-sent today
  if (recipients.length > 0) {
    const recipientIds = recipients.map(r => r.id);
    const { data: alreadySent } = await supabase
      .from('daily_brief_sends')
      .select('recipient_id')
      .eq('send_date', today)
      .in('recipient_id', recipientIds);

    const sentIds = new Set(alreadySent?.map(s => s.recipient_id) || []);
    return recipients.filter(r => !sentIds.has(r.id));
  }

  return recipients;
}
