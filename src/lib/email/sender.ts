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
 * Format: "Daily Brief: {neighborhood}. {teaser}"
 * Under 70 characters total.
 * Prefers Gemini-generated "information gap" teaser (Morning Brew style),
 * falls back to headline-based teaser.
 */
function buildSubject(content: DailyBriefContent): string {
  const primary = content.primarySection?.neighborhoodName;

  if (!primary) {
    return 'Daily Brief';
  }

  const prefix = `Daily Brief: ${primary}. `;

  // Prefer Gemini-generated information gap teaser
  const geminiTeaser = content.primarySection?.subjectTeaser;
  if (geminiTeaser && geminiTeaser.length + prefix.length <= 70) {
    return `${prefix}${geminiTeaser}`;
  }

  // Fallback: headline-based teaser
  const stories = content.primarySection?.stories || [];

  if (stories.length === 0) {
    return `Daily Brief: ${primary}`;
  }

  const budget = 70 - prefix.length;
  const teaser = buildTeaser(stories.map(s => s.headline), budget);

  if (!teaser) {
    return `Daily Brief: ${primary}`;
  }

  return `${prefix}${teaser}`;
}

/**
 * Build enticing teaser from story headlines.
 * Uses the lead headline (as complete as possible) plus "& more" if room.
 */
function buildTeaser(headlines: string[], budget: number): string {
  if (headlines.length === 0 || budget < 15) return '';

  // Clean quotes from headlines
  const clean = headlines.map(h => h.replace(/["""'']/g, '').trim()).filter(h => h.length > 0);
  if (clean.length === 0) return '';

  // Use the lead headline as fully as possible - truncate at word boundary
  const lead = clean[0];
  let teaser = lead;
  if (teaser.length > budget) {
    // Truncate at last full word within budget
    teaser = lead.slice(0, budget).replace(/\s+\S*$/, '');
  }

  // If there are more stories, try to append "& more"
  if (clean.length > 1 && teaser.length + 7 <= budget) {
    teaser += ' & more';
  }

  return teaser.length <= budget ? teaser : '';
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

    // Send via existing Resend integration - always force "Flaneur News" display name
    const emailAddr = (process.env.EMAIL_FROM || 'hello@readflaneur.com').replace(/.*<([^>]+)>.*/, '$1').trim();
    const fromAddress = `Flaneur News <${emailAddr}>`;
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
