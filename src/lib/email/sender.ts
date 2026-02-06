/**
 * Daily Brief Email Sender
 * Renders the React Email template and sends via Resend
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { render } from '@react-email/components';
import { sendEmail } from '@/lib/email';
import { DailyBriefContent } from './types';
import { DailyBriefTemplate } from './templates/DailyBriefTemplate';

/**
 * Build the email subject line
 */
function buildSubject(content: DailyBriefContent): string {
  const primary = content.primarySection?.neighborhoodName;
  const satelliteCount = content.satelliteSections.length;

  if (!primary) {
    return 'Daily Brief';
  }

  if (satelliteCount > 0) {
    return `Daily Brief: ${primary}+`;
  }

  return `Daily Brief: ${primary}`;
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
    // Render the React Email template to HTML
    const html = await render(DailyBriefTemplate(content));
    const subject = buildSubject(content);

    // Send via existing Resend integration with proper display name
    const fromAddress = process.env.EMAIL_FROM?.replace(/^[^<]*$/, 'Flaneur <$&>')
      || 'Flaneur <hello@readflaneur.com>';
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
