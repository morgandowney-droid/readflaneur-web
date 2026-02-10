import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveRecipients } from '@/lib/email/scheduler';
import { assembleDailyBrief } from '@/lib/email/assembler';
import { sendDailyBrief } from '@/lib/email/sender';

/**
 * Daily Brief Email Cron Job
 *
 * Runs every hour and sends daily brief emails to recipients
 * whose local time is 7 AM.
 *
 * Schedule: 0 * * * * (every hour)
 *
 * Query params:
 *   ?test=email@example.com  - Send test email to specific address
 *   ?force=true              - Bypass timezone check (use with test)
 *   ?dry=true                - Preview assembled content without sending
 *
 * Cost estimate: ~$0.01 per email (Resend free tier: 100/day, $20/mo: 50k/mo)
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_EMAILS_PER_RUN = 80;
const DELAY_BETWEEN_SENDS_MS = 500;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET(request: Request) {
  // Verify cron authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const testEmail = url.searchParams.get('test');
  const forceRun = url.searchParams.get('force') === 'true';
  const dryRun = url.searchParams.get('dry') === 'true';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const startedAt = new Date().toISOString();
  const results = {
    success: true,
    recipients_found: 0,
    emails_sent: 0,
    emails_failed: 0,
    emails_skipped: 0,
    errors: [] as string[],
    dry_run: dryRun,
    test_mode: !!testEmail,
    started_at: startedAt,
    timestamp: new Date().toISOString(),
    preview: null as any,
  };

  try {
    // Test mode: send to a specific email address
    if (testEmail) {
      const recipient = await buildTestRecipient(supabase, testEmail, forceRun);
      if (!recipient) {
        return NextResponse.json({
          ...results,
          success: false,
          errors: [`No subscriber found for ${testEmail}. The email must exist in profiles or newsletter_subscribers.`],
        });
      }

      results.recipients_found = 1;
      const content = await assembleDailyBrief(supabase, recipient);

      if (dryRun) {
        results.preview = {
          email: recipient.email,
          timezone: recipient.timezone,
          primaryNeighborhood: content.primarySection?.neighborhoodName || null,
          primaryStoryCount: content.primarySection?.stories.length || 0,
          satelliteCount: content.satelliteSections.length,
          hasWeather: !!content.primarySection?.weather,
          hasHeaderAd: !!content.headerAd,
          hasNativeAd: !!content.nativeAd,
          stories: [
            ...(content.primarySection?.stories.map(s => s.headline) || []),
            ...content.satelliteSections.flatMap(s => s.stories.map(st => `[${s.neighborhoodName}] ${st.headline}`)),
          ],
        };
        return NextResponse.json(results);
      }

      const sent = await sendDailyBrief(supabase, content);
      if (sent) {
        results.emails_sent = 1;
      } else {
        results.emails_failed = 1;
        results.errors.push(`Failed to send to ${testEmail}`);
      }

      return NextResponse.json(results);
    }

    // Normal mode: resolve recipients by timezone
    const recipients = await resolveRecipients(supabase, 7);
    results.recipients_found = recipients.length;

    if (recipients.length === 0) {
      // Log cron execution even when no recipients
      await logCronExecution(supabase, results);
      return NextResponse.json(results);
    }

    // Process recipients sequentially with rate limiting
    const batch = recipients.slice(0, MAX_EMAILS_PER_RUN);
    if (recipients.length > MAX_EMAILS_PER_RUN) {
      results.emails_skipped = recipients.length - MAX_EMAILS_PER_RUN;
    }

    for (const recipient of batch) {
      try {
        const content = await assembleDailyBrief(supabase, recipient);

        if (dryRun) {
          results.emails_sent++;
          continue;
        }

        const sent = await sendDailyBrief(supabase, content);
        if (sent) {
          results.emails_sent++;
        } else {
          results.emails_failed++;
          results.errors.push(`Failed: ${recipient.email}`);
        }

        // Rate limit delay
        await sleep(DELAY_BETWEEN_SENDS_MS);
      } catch (error) {
        results.emails_failed++;
        results.errors.push(`Error for ${recipient.email}: ${(error as Error).message}`);
      }
    }

    // Log cron execution
    await logCronExecution(supabase, results);

    return NextResponse.json(results);
  } catch (error) {
    results.success = false;
    results.errors.push((error as Error).message);
    await logCronExecution(supabase, results).catch(() => {});
    return NextResponse.json(results, { status: 500 });
  }
}

/**
 * Build a test recipient from an existing profile or subscriber
 */
async function buildTestRecipient(
  supabase: any,
  email: string,
  forceTimezone: boolean
) {
  // Try profiles first
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, primary_city, primary_timezone, email_unsubscribe_token, paused_topics')
    .eq('email', email)
    .single();

  if (profile) {
    const { data: prefs } = await supabase
      .from('user_neighborhood_preferences')
      .select('neighborhood_id')
      .eq('user_id', profile.id);

    const neighborhoodIds = prefs?.map((p: any) => p.neighborhood_id) || [];

    // If no neighborhoods, pick some defaults
    if (neighborhoodIds.length === 0) {
      const { data: defaults } = await supabase
        .from('neighborhoods')
        .select('id')
        .eq('is_active', true)
        .limit(3);
      neighborhoodIds.push(...(defaults?.map((n: any) => n.id) || []));
    }

    return {
      id: profile.id,
      email: profile.email,
      source: 'profile' as const,
      timezone: profile.primary_timezone || 'America/New_York',
      primaryNeighborhoodId: neighborhoodIds[0] || null,
      subscribedNeighborhoodIds: neighborhoodIds,
      unsubscribeToken: profile.email_unsubscribe_token || 'test-token',
      pausedTopics: profile.paused_topics || [],
    };
  }

  // Try newsletter_subscribers
  const { data: sub } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, neighborhood_ids, timezone, unsubscribe_token, paused_topics')
    .eq('email', email)
    .single();

  if (sub) {
    const neighborhoodIds = sub.neighborhood_ids || [];

    if (neighborhoodIds.length === 0) {
      const { data: defaults } = await supabase
        .from('neighborhoods')
        .select('id')
        .eq('is_active', true)
        .limit(3);
      neighborhoodIds.push(...(defaults?.map((n: any) => n.id) || []));
    }

    return {
      id: sub.id,
      email: sub.email,
      source: 'newsletter' as const,
      timezone: sub.timezone || 'America/New_York',
      primaryNeighborhoodId: neighborhoodIds[0] || null,
      subscribedNeighborhoodIds: neighborhoodIds,
      unsubscribeToken: sub.unsubscribe_token || 'test-token',
      pausedTopics: sub.paused_topics || [],
    };
  }

  return null;
}

/**
 * Log cron execution for monitoring
 */
async function logCronExecution(supabase: any, results: any) {
  await supabase.from('cron_executions').insert({
    job_name: 'send-daily-brief',
    started_at: results.started_at || results.timestamp,
    completed_at: new Date().toISOString(),
    success: results.success,
    articles_created: results.emails_sent,
    errors: results.errors.length > 0 ? results.errors.slice(0, 10) : null,
    response_data: {
      recipients_found: results.recipients_found,
      emails_sent: results.emails_sent,
      emails_failed: results.emails_failed,
      emails_skipped: results.emails_skipped,
      dry_run: results.dry_run,
      test_mode: results.test_mode,
    },
  }).then(null, (e: unknown) => console.error('Failed to log cron execution:', e));
}
