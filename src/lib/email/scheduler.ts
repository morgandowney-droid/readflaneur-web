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
      primary_timezone,
      email_unsubscribe_token,
      daily_email_enabled
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

      // Resolve primary: first subscribed neighborhood in primary_city
      let primaryId: string | null = null;
      if (profile.primary_city) {
        // Try to find a subscribed neighborhood whose city matches
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

      seenEmails.add(profile.email.toLowerCase());
      recipients.push({
        id: profile.id,
        email: profile.email,
        source: 'profile',
        timezone: profile.primary_timezone,
        primaryNeighborhoodId: primaryId,
        subscribedNeighborhoodIds: neighborhoodIds,
        unsubscribeToken: profile.email_unsubscribe_token,
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
      email_verified
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

      seenEmails.add(sub.email.toLowerCase());
      recipients.push({
        id: sub.id,
        email: sub.email,
        source: 'newsletter',
        timezone: sub.timezone,
        primaryNeighborhoodId: sub.neighborhood_ids[0],
        subscribedNeighborhoodIds: sub.neighborhood_ids,
        unsubscribeToken: sub.unsubscribe_token,
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
