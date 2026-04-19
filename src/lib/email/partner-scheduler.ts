/**
 * Agent Partner Email Scheduler
 * Resolves branded email recipients for active agent partners.
 * Runs alongside (not replacing) the standard scheduler.
 *
 * Partner clients receive exactly ONE email: the branded Daily Brief, every day
 * at 7 AM local including Sundays. They never receive the Sunday Edition.
 * `resolveRecipients()` in scheduler.ts excludes subscribers with
 * `partner_agent_id IS NOT NULL` so partner clients don't double up on the
 * standard Daily Brief or Sunday Edition.
 *
 * Standard Flaneur subscribers NEVER receive branded emails.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { EmailRecipient } from './types';
import { AgentBranding } from './templates/BrandedDailyBriefTemplate';

function isTargetHour(timezone: string, targetHour: number): boolean {
  try {
    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    return localTime.getHours() === targetHour;
  } catch {
    return false;
  }
}

export interface BrandedRecipientGroup {
  partner: {
    id: string;
    neighborhood_id: string;
    neighborhood_slug: string;
    agent_slug: string;
  };
  branding: AgentBranding;
  recipients: EmailRecipient[];
}

/**
 * Resolve all branded email recipients for active agent partners.
 * Returns groups: one per active agent partner with their clients.
 */
export async function resolveBrandedRecipients(
  supabase: SupabaseClient,
  targetHour: number = 7
): Promise<BrandedRecipientGroup[]> {
  const today = new Date().toISOString().split('T')[0];
  const groups: BrandedRecipientGroup[] = [];

  // 1. Fetch all active agent partners
  const { data: partners } = await supabase
    .from('agent_partners')
    .select('id, agent_name, agent_title, agent_email, agent_phone, agent_photo_url, brokerage_name, neighborhood_id, agent_slug, listings, client_emails, status')
    .eq('status', 'active');

  if (!partners || partners.length === 0) return groups;

  // 2. For each partner, resolve neighborhood timezone and check if it's delivery time
  for (const partner of partners) {
    const { data: neighborhood } = await supabase
      .from('neighborhoods')
      .select('id, name, city, timezone')
      .eq('id', partner.neighborhood_id)
      .single();

    if (!neighborhood) continue;

    const tz = neighborhood.timezone || 'America/New_York';
    if (!isTargetHour(tz, targetHour)) continue;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';

    const branding: AgentBranding = {
      agentName: partner.agent_name,
      agentTitle: partner.agent_title || undefined,
      brokerageName: partner.brokerage_name || undefined,
      agentPhone: partner.agent_phone || undefined,
      agentPhotoUrl: partner.agent_photo_url || undefined,
      listings: partner.listings || [],
      subscribeUrl: `${appUrl}/r/${partner.agent_slug}`,
    };

    // 3. Collect all client emails from two sources:
    //    a) client_emails array on agent_partners (manually added by agent)
    //    b) newsletter_subscribers with partner_agent_id matching this agent
    const emailSet = new Set<string>();
    const recipients: EmailRecipient[] = [];

    // Source A: client_emails from agent record
    const manualEmails: string[] = partner.client_emails || [];
    for (const email of manualEmails) {
      const normalized = email.toLowerCase().trim();
      if (!normalized.includes('@') || emailSet.has(normalized)) continue;
      emailSet.add(normalized);

      // Check if this email has a newsletter_subscriber record for dedup tracking
      const { data: sub } = await supabase
        .from('newsletter_subscribers')
        .select('id, unsubscribe_token')
        .eq('email', normalized)
        .limit(1)
        .single();

      recipients.push({
        id: sub?.id || `manual-${normalized}`,
        email: normalized,
        source: 'newsletter',
        timezone: tz,
        primaryNeighborhoodId: partner.neighborhood_id,
        subscribedNeighborhoodIds: [partner.neighborhood_id],
        unsubscribeToken: sub?.unsubscribe_token || 'none',
        pausedTopics: [],
      });
    }

    // Source B: subscribers who signed up via /r/[slug]
    const { data: agentSubs } = await supabase
      .from('newsletter_subscribers')
      .select('id, email, unsubscribe_token, daily_email_enabled')
      .eq('partner_agent_id', partner.id)
      .eq('daily_email_enabled', true);

    if (agentSubs) {
      for (const sub of agentSubs) {
        if (!sub.email) continue;
        const normalized = sub.email.toLowerCase().trim();
        if (emailSet.has(normalized)) continue;
        emailSet.add(normalized);

        recipients.push({
          id: sub.id,
          email: normalized,
          source: 'newsletter',
          timezone: tz,
          primaryNeighborhoodId: partner.neighborhood_id,
          subscribedNeighborhoodIds: [partner.neighborhood_id],
          unsubscribeToken: sub.unsubscribe_token || 'none',
          pausedTopics: [],
        });
      }
    }

    if (recipients.length === 0) continue;

    // 4. Exclude already-sent today (branded sends tracked in daily_brief_sends)
    const recipientIds = recipients.map(r => r.id).filter(id => !id.startsWith('manual-'));
    if (recipientIds.length > 0) {
      const { data: alreadySent } = await supabase
        .from('daily_brief_sends')
        .select('recipient_id')
        .eq('send_date', today)
        .in('recipient_id', recipientIds);

      const sentIds = new Set(alreadySent?.map(s => s.recipient_id) || []);
      const filtered = recipients.filter(r => !sentIds.has(r.id));
      if (filtered.length === 0) continue;

      groups.push({
        partner: {
          id: partner.id,
          neighborhood_id: partner.neighborhood_id,
          neighborhood_slug: partner.neighborhood_id,
          agent_slug: partner.agent_slug,
        },
        branding,
        recipients: filtered,
      });
    } else {
      groups.push({
        partner: {
          id: partner.id,
          neighborhood_id: partner.neighborhood_id,
          neighborhood_slug: partner.neighborhood_id,
          agent_slug: partner.agent_slug,
        },
        branding,
        recipients,
      });
    }
  }

  return groups;
}
