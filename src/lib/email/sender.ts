/**
 * Daily Brief Email Sender
 * Renders the React Email template and sends via Resend
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { render } from '@react-email/components';
import { sendEmail } from '@/lib/email';
import { DailyBriefContent } from './types';
import { DailyBriefTemplate } from './templates/DailyBriefTemplate';
import { checkDailyEmailLimit } from './daily-email-limit';

/**
 * Build the email subject line
 * Format: "Daily Brief: {neighborhood}. {teaser from story headlines}"
 * Under 70 characters total, referencing several stories to entice opens.
 */
function buildSubject(content: DailyBriefContent): string {
  const primary = content.primarySection?.neighborhoodName;

  if (!primary) {
    return 'Daily Brief';
  }

  const prefix = `Daily Brief: ${primary}. `;
  const stories = content.primarySection?.stories || [];

  if (stories.length === 0) {
    return `Daily Brief: ${primary}`;
  }

  // Build teaser from story headlines - take short phrases from each
  const budget = 70 - prefix.length;
  const teaser = buildTeaser(stories.map(s => s.headline), budget);

  if (!teaser) {
    return `Daily Brief: ${primary}`;
  }

  return `${prefix}${teaser}`;
}

/**
 * Extract short key phrases from headlines and join into a teaser.
 * Aims to reference 2-3 stories within the character budget.
 */
function buildTeaser(headlines: string[], budget: number): string {
  if (headlines.length === 0 || budget < 15) return '';

  // Take first few words from each headline as a short phrase
  const phrases: string[] = [];
  for (const h of headlines.slice(0, 4)) {
    const words = h.replace(/["""'']/g, '').split(/\s+/);
    // Take 2-4 words depending on word length
    let phrase = '';
    for (let i = 0; i < Math.min(words.length, 4); i++) {
      const next = phrase ? `${phrase} ${words[i]}` : words[i];
      if (next.length > 25) break;
      phrase = next;
    }
    if (phrase.length >= 4) phrases.push(phrase);
  }

  if (phrases.length === 0) return '';

  // Join phrases: "A, B & C" format, fitting within budget
  let result = phrases[0];
  for (let i = 1; i < phrases.length; i++) {
    const sep = i === phrases.length - 1 ? ' & ' : ', ';
    const candidate = result + sep + phrases[i];
    if (candidate.length > budget) break;
    result = candidate;
  }

  return result.length <= budget ? result : '';
}

/**
 * Send a daily brief email to one recipient
 * Returns true on success
 */
export async function sendDailyBrief(
  supabase: SupabaseClient,
  content: DailyBriefContent
): Promise<boolean> {
  try {
    // Check global daily email limit (5/day across all email types)
    const limit = await checkDailyEmailLimit(supabase, content.recipient.id);
    if (!limit.allowed) {
      console.log(`Daily email limit reached for ${content.recipient.email} (${limit.count} sent today)`);
      return false;
    }

    // Render the React Email template to HTML
    const html = await render(DailyBriefTemplate(content));
    const subject = buildSubject(content);

    // Send via existing Resend integration with proper display name
    const fromAddress = process.env.EMAIL_FROM?.replace(/^[^<]*$/, 'Flaneur News <$&>')
      || 'Flaneur News <hello@readflaneur.com>';
    const success = await sendEmail({
      to: content.recipient.email,
      subject,
      html,
      from: fromAddress,
    });

    if (success) {
      // Log send to tracking table
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('daily_brief_sends').insert({
        recipient_id: content.recipient.id,
        recipient_source: content.recipient.source,
        email: content.recipient.email,
        timezone: content.recipient.timezone,
        primary_neighborhood_id: content.primarySection?.neighborhoodId || null,
        neighborhood_count:
          (content.primarySection ? 1 : 0) + content.satelliteSections.length,
        story_count:
          (content.primarySection?.stories.length || 0) +
          content.satelliteSections.reduce((sum, s) => sum + s.stories.length, 0),
        had_header_ad: content.headerAd !== null,
        had_native_ad: content.nativeAd !== null,
        send_date: today,
      });

      // Increment ad impressions if ads were included (non-critical)
      if (content.headerAd) {
        try {
          const adId = content.headerAd.id;
          const { data: ad } = await supabase
            .from('ads')
            .select('impressions')
            .eq('id', adId)
            .single();
          if (ad) {
            await supabase
              .from('ads')
              .update({ impressions: (ad.impressions || 0) + 1 })
              .eq('id', adId);
          }
        } catch {
          // Non-critical, ignore
        }
      }
    }

    return success;
  } catch (error) {
    console.error(`Failed to send daily brief to ${content.recipient.email}:`, error);
    return false;
  }
}
