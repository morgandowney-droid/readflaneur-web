/**
 * Global Daily Email Limit
 *
 * Caps the total number of content emails (Daily Brief, Sunday Edition,
 * instant resends) any single recipient can receive per calendar day (UTC).
 * Transactional emails (password reset, ad confirmations, etc.) are exempt.
 */

import { SupabaseClient } from '@supabase/supabase-js';

const MAX_EMAILS_PER_DAY = 5;

/**
 * Count how many content emails a recipient has received today (UTC).
 * Checks both daily_brief_sends and weekly_brief_sends tables.
 *
 * Keyed on EMAIL, not recipient_id: every logged-in user also has a
 * newsletter_subscribers row (auto-created at login), so the same person has a
 * profile id AND a subscriber id. An id-keyed count would see them as two
 * people and let them double up (a Daily Brief to one id + a Sunday Edition to
 * the other on the same day). Counting by email collapses both identities.
 * Case-insensitive exact match via ilike (no wildcards).
 */
export async function checkDailyEmailLimit(
  supabase: SupabaseClient,
  email: string,
  max = MAX_EMAILS_PER_DAY
): Promise<{ allowed: boolean; count: number }> {
  const today = new Date().toISOString().split('T')[0];

  const [dailyResult, weeklyResult] = await Promise.all([
    supabase
      .from('daily_brief_sends')
      .select('*', { count: 'exact', head: true })
      .ilike('email', email)
      .eq('send_date', today),
    supabase
      .from('weekly_brief_sends')
      .select('*', { count: 'exact', head: true })
      .ilike('recipient_email', email)
      .gte('sent_at', `${today}T00:00:00Z`)
      .lt('sent_at', `${today}T23:59:59.999Z`),
  ]);

  if (dailyResult.error) {
    console.error('Error checking daily_brief_sends limit:', dailyResult.error);
    return { allowed: true, count: 0 };
  }
  if (weeklyResult.error) {
    console.error('Error checking weekly_brief_sends limit:', weeklyResult.error);
    return { allowed: true, count: 0 };
  }

  const totalCount = (dailyResult.count || 0) + (weeklyResult.count || 0);
  return { allowed: totalCount < max, count: totalCount };
}
