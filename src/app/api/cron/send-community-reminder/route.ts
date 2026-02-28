/**
 * Community Neighborhood 1-Week Reminder
 *
 * Sends a reminder email to users who created a community neighborhood
 * exactly 7 days ago, linking to the most recent daily brief article.
 *
 * Uses a 24-hour time window (7-8 days ago) so each neighborhood is
 * matched exactly once regardless of creation hour. No migration needed.
 *
 * Schedule: Daily at 9 AM UTC
 * Vercel Cron: 0 9 * * *
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { getCitySlugFromId, getNeighborhoodSlugFromId } from '@/lib/neighborhood-utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Auth check
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const results = {
    found: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // Find community neighborhoods created 7-8 days ago (24h window = each hit once)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

    const { data: neighborhoods, error: fetchError } = await admin
      .from('neighborhoods')
      .select('id, name, city, country, created_by, created_at')
      .eq('is_community', true)
      .eq('community_status', 'active')
      .gte('created_at', eightDaysAgo)
      .lt('created_at', sevenDaysAgo);

    if (fetchError) {
      console.error('Failed to fetch community neighborhoods:', fetchError);
      throw new Error(`DB error: ${fetchError.message}`);
    }

    if (!neighborhoods || neighborhoods.length === 0) {
      await logCron(admin, startTime, results);
      return NextResponse.json({ message: 'No 1-week-old community neighborhoods', ...results });
    }

    results.found = neighborhoods.length;

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com')
      .replace(/\n$/, '').replace(/\/$/, '');

    for (const hood of neighborhoods) {
      try {
        if (!hood.created_by) {
          results.skipped++;
          continue;
        }

        // Get creator's email from profiles
        const { data: profile } = await admin
          .from('profiles')
          .select('email')
          .eq('id', hood.created_by)
          .single();

        if (!profile?.email) {
          results.skipped++;
          results.errors.push(`${hood.name}: no email for creator ${hood.created_by}`);
          continue;
        }

        // Find the most recent published daily brief article for this neighborhood
        const { data: article } = await admin
          .from('articles')
          .select('slug, headline, published_at')
          .eq('status', 'published')
          .eq('neighborhood_id', hood.id)
          .eq('article_type', 'brief_summary')
          .order('published_at', { ascending: false })
          .limit(1)
          .single();

        if (!article) {
          results.skipped++;
          results.errors.push(`${hood.name}: no published daily brief articles`);
          continue;
        }

        // Build URLs
        const citySlug = getCitySlugFromId(hood.id);
        const neighborhoodSlug = getNeighborhoodSlugFromId(hood.id);
        const feedUrl = `${appUrl}/${citySlug}/${neighborhoodSlug}`;
        const articleUrl = `${feedUrl}/${article.slug}`;

        // Build and send email
        const html = buildReminderEmail(hood.name, hood.city, feedUrl, articleUrl);
        const sent = await sendEmail({
          to: profile.email,
          subject: `Your ${hood.name} edition is one week old`,
          html,
        });

        if (sent) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push(`${hood.name}: email send failed`);
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`${hood.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await logCron(admin, startTime, results);
    return NextResponse.json({ success: true, ...results });
  } catch (err) {
    console.error('Community reminder error:', err);
    results.errors.push(String(err));

    await logCron(admin, startTime, results, true);
    return NextResponse.json({ error: 'Failed', ...results }, { status: 500 });
  }
}

function buildReminderEmail(
  neighborhoodName: string,
  city: string,
  feedUrl: string,
  articleUrl: string
): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="text-align: center; padding: 40px 0 20px;">
        <h1 style="font-weight: 300; letter-spacing: 0.3em; font-size: 28px; margin: 0;">FLANEUR</h1>
      </div>

      <div style="padding: 0 20px;">
        <h2 style="font-weight: 400; font-size: 22px; margin-bottom: 16px;">
          Your ${neighborhoodName} edition is one week old
        </h2>

        <p style="color: #444; line-height: 1.6; font-size: 15px;">
          One week ago you created the ${neighborhoodName}, ${city} edition on Flaneur.
          Since then, we've been generating daily briefs covering what's happening in your neighborhood.
        </p>

        <p style="color: #444; line-height: 1.6; font-size: 15px;">
          Here's your latest Daily Brief:
        </p>

        <div style="margin: 28px 0; text-align: center;">
          <a href="${articleUrl}" style="background: #000; color: #fff; padding: 14px 32px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px; display: inline-block;">
            Read Today's Brief
          </a>
        </div>

        <p style="color: #444; line-height: 1.6; font-size: 15px;">
          You can also <a href="${feedUrl}" style="color: #000; font-weight: 600; text-decoration: underline;">browse all ${neighborhoodName} stories</a>
          or share the link with friends and neighbors.
        </p>

        <p style="color: #999; font-size: 13px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          You're receiving this because you created the ${neighborhoodName} edition on Flaneur.
        </p>
      </div>
    </div>
  `;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logCron(
  admin: any,
  startTime: number,
  results: { found: number; sent: number; skipped: number; failed: number; errors: string[] },
  isError = false
) {
  await admin.from('cron_executions').insert({
    job_name: 'send-community-reminder',
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    success: !isError && results.failed === 0,
    articles_created: results.sent,
    errors: results.errors.length > 0 ? results.errors.slice(0, 10) : null,
    response_data: {
      found: results.found,
      sent: results.sent,
      skipped: results.skipped,
      failed: results.failed,
    },
  }).then(null, (e: unknown) => console.error('Failed to log cron:', e));
}
