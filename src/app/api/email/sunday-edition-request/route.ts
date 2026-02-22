import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { render } from '@react-email/components';
import { SundayEditionTemplate, SundayEditionContent } from '@/lib/email/templates/SundayEditionTemplate';
import { sendEmail } from '@/lib/email';
import { checkDailyEmailLimit } from '@/lib/email/daily-email-limit';
import { resolveSundayAd } from '@/lib/email/sunday-ad-resolver';
import { fetchWeather } from '@/lib/email/weather';

/**
 * On-demand Sunday Edition request endpoint.
 *
 * Two-step confirmation flow (prevents email client prefetch triggers):
 * Step 1: GET ?token=xxx&neighborhood=yyy        - Show confirmation page
 * Step 2: GET ?token=xxx&neighborhood=yyy&confirm=1 - Send the email
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ON_DEMAND_PER_WEEK = 5;

/**
 * Build Sunday Edition subject line.
 * Format: "Sunday Edition: {name}. {teaser}" under 70 chars.
 */
function buildSundaySubject(name: string, content: SundayEditionContent): string {
  const prefix = `Sunday Edition: ${name}. `;
  const budget = 70 - prefix.length;

  const phrases: string[] = [];
  for (const s of (content.rearviewStories || []).slice(0, 3)) {
    if (s.headline) {
      const words = s.headline.replace(/["""'']/g, '').split(/\s+/);
      let phrase = '';
      for (let i = 0; i < Math.min(words.length, 4); i++) {
        const next = phrase ? `${phrase} ${words[i]}` : words[i];
        if (next.length > 25) break;
        phrase = next;
      }
      if (phrase.length >= 4) phrases.push(phrase);
    }
  }
  for (const e of (content.horizonEvents || []).slice(0, 2)) {
    if (e.name) {
      const words = e.name.replace(/["""'']/g, '').split(/\s+/);
      let phrase = '';
      for (let i = 0; i < Math.min(words.length, 4); i++) {
        const next = phrase ? `${phrase} ${words[i]}` : words[i];
        if (next.length > 25) break;
        phrase = next;
      }
      if (phrase.length >= 4) phrases.push(phrase);
    }
  }

  if (phrases.length === 0 || budget < 15) return `Sunday Edition: ${name}`;

  let result = phrases[0];
  for (let i = 1; i < phrases.length; i++) {
    const sep = i === phrases.length - 1 ? ' & ' : ', ';
    const candidate = result + sep + phrases[i];
    if (candidate.length > budget) break;
    result = candidate;
  }

  return result.length <= budget ? `${prefix}${result}` : `Sunday Edition: ${name}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const neighborhoodId = url.searchParams.get('neighborhood');
  const confirm = url.searchParams.get('confirm');

  if (!token || !neighborhoodId) {
    return new NextResponse(
      renderPage('Missing Parameters', 'error', 'This link is missing required parameters.'),
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Look up recipient by token (newsletter_subscribers first, then profiles)
  const { data: subscriber } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, timezone, neighborhood_ids, unsubscribe_token, referral_code')
    .eq('unsubscribe_token', token)
    .single();

  const { data: profile } = !subscriber ? await supabase
    .from('profiles')
    .select('id, email, primary_timezone, email_unsubscribe_token, referral_code')
    .eq('email_unsubscribe_token', token)
    .single() : { data: null };

  if (!subscriber && !profile) {
    return new NextResponse(
      renderPage('Link Expired', 'error', 'This link may have expired or is no longer valid.'),
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const recipientId = subscriber?.id || profile!.id;
  const recipientEmail = subscriber?.email || profile!.email;
  const timezone = subscriber?.timezone || profile!.primary_timezone || 'America/New_York';

  // Verify this neighborhood is in their subscriptions
  let subscribedIds: string[] = [];
  if (subscriber) {
    subscribedIds = subscriber.neighborhood_ids || [];
  } else {
    const { data: prefs } = await supabase
      .from('user_neighborhood_preferences')
      .select('neighborhood_id')
      .eq('user_id', profile!.id);
    subscribedIds = (prefs || []).map(p => p.neighborhood_id);
  }

  if (!subscribedIds.includes(neighborhoodId)) {
    return new NextResponse(
      renderPage('Neighborhood Not Found', 'error', 'This neighborhood is not in your subscriptions.'),
      { status: 403, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Fetch neighborhood info
  const { data: neighborhood } = await supabase
    .from('neighborhoods')
    .select('id, name, city, latitude, longitude, country')
    .eq('id', neighborhoodId)
    .single();

  if (!neighborhood) {
    return new NextResponse(
      renderPage('Neighborhood Not Found', 'error', 'Could not find this neighborhood.'),
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com').replace(/[\n\r]+$/, '').replace(/\/$/, '');

  // Step 1: Show confirmation page
  if (confirm !== '1') {
    const confirmUrl = `${appUrl}/api/email/sunday-edition-request?token=${token}&neighborhood=${neighborhoodId}&confirm=1`;
    return new NextResponse(
      renderConfirmPage(neighborhood.name, neighborhood.city, confirmUrl),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Step 2: Send the email

  // Calculate current week_date (the most recent Sunday)
  const today = new Date();
  const dayOfWeek = today.getUTCDay();
  const sundayOffset = dayOfWeek; // 0 for Sunday, 1 for Monday, etc.
  const sunday = new Date(today);
  sunday.setUTCDate(today.getUTCDate() - sundayOffset);
  const weekDate = sunday.toISOString().split('T')[0];

  // Dedup: check if already sent for this recipient + neighborhood + week
  const { data: existingSend } = await supabase
    .from('weekly_brief_sends')
    .select('id')
    .eq('recipient_id', recipientId)
    .eq('neighborhood_id', neighborhoodId)
    .eq('week_date', weekDate)
    .limit(1)
    .single();

  if (existingSend) {
    return new NextResponse(
      renderPage('Already Sent', 'success', `You've already received the ${neighborhood.name} Sunday Edition this week. Check your inbox.`),
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Rate limit: max N on-demand sends per recipient per week
  const { count: weekSendCount } = await supabase
    .from('weekly_brief_sends')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .eq('week_date', weekDate);

  if ((weekSendCount || 0) >= MAX_ON_DEMAND_PER_WEEK) {
    return new NextResponse(
      renderPage('Limit Reached', 'error', `You've reached the maximum of ${MAX_ON_DEMAND_PER_WEEK} Sunday Edition requests this week. Try again next Sunday.`),
      { status: 429, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Fetch the weekly brief for this neighborhood
  let brief;
  const { data: todayBrief } = await supabase
    .from('weekly_briefs')
    .select('*, neighborhoods(name, city, latitude, longitude, country), articles(slug)')
    .eq('neighborhood_id', neighborhoodId)
    .eq('week_date', weekDate)
    .single();

  brief = todayBrief;

  // Fall back to most recent brief if none for this week
  if (!brief) {
    const { data: recentBriefs } = await supabase
      .from('weekly_briefs')
      .select('*, neighborhoods(name, city, latitude, longitude, country), articles(slug)')
      .eq('neighborhood_id', neighborhoodId)
      .order('week_date', { ascending: false })
      .limit(1);
    brief = recentBriefs?.[0] || null;
  }

  if (!brief) {
    return new NextResponse(
      renderPage('No Edition Available', 'error', `There's no Sunday Edition available for ${neighborhood.name} this week. It may not have been generated yet.`),
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const hood = brief.neighborhoods as unknown as { name: string; city: string; latitude: number | null; longitude: number | null; country: string | null };
  const articleSlug = (brief.articles as unknown as { slug: string } | null)?.slug;

  // Format date
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });

  // Build article URL (verify article exists before including link)
  let articleUrl: string | null = null;
  if (articleSlug) {
    const { data: articleCheck } = await supabase
      .from('articles')
      .select('id')
      .eq('slug', articleSlug)
      .eq('status', 'published')
      .single();
    if (articleCheck) {
      const neighborhoodSlug = neighborhoodId.split('-').slice(1).join('-');
      const citySlug = hood.city.toLowerCase().replace(/\s+/g, '-');
      articleUrl = `${appUrl}/${citySlug}/${neighborhoodSlug}/${articleSlug}?ref=sunday-edition-request`;
    }
  }

  const emailContent: SundayEditionContent = {
    neighborhoodName: hood.name,
    cityName: hood.city,
    date: dateStr,
    rearviewNarrative: brief.rearview_narrative || '',
    rearviewStories: (brief.rearview_stories || []) as SundayEditionContent['rearviewStories'],
    horizonEvents: (brief.horizon_events || []) as SundayEditionContent['horizonEvents'],
    dataPoint: await (async () => {
      const dp = (brief.data_point || {
        type: 'real_estate',
        label: 'The Market',
        value: 'Data unavailable this week',
        context: '',
      }) as SundayEditionContent['dataPoint'];
      // Fix legacy briefs that stored AQI instead of temperature
      if (dp.type === 'environment' && /AQI/i.test(dp.value)) {
        if (hood.latitude && hood.longitude) {
          const weather = await fetchWeather(
            hood.latitude, hood.longitude,
            timezone,
            hood.country || 'USA'
          );
          if (weather) {
            const temp = weather.useFahrenheit
              ? `${weather.temperatureF}°F`
              : `${weather.temperatureC}°C`;
            dp.value = temp;
            dp.context = weather.description;
          }
        }
      }
      return dp;
    })(),
    holidaySection: brief.holiday_section || null,
    imageUrl: null,
    articleUrl,
    unsubscribeUrl: `${appUrl}/api/email/unsubscribe?token=${token}`,
    preferencesUrl: `${appUrl}/email/preferences?token=${token}`,
    referralUrl: (subscriber?.referral_code || profile?.referral_code)
      ? `${appUrl}/invite?ref=${subscriber?.referral_code || profile?.referral_code}`
      : undefined,
    // No secondary neighborhoods in on-demand emails (no recursion)
  };

  // Check global daily email limit (5/day across all email types)
  const dailyLimit = await checkDailyEmailLimit(supabase, recipientId);
  if (!dailyLimit.allowed) {
    return new NextResponse(
      renderPage('Limit Reached', 'error', `You've reached the maximum of 5 emails per day. Your Sunday Edition will be available tomorrow.`),
      { status: 429, headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Resolve sponsor ad
  const sundayAd = await resolveSundayAd(supabase, neighborhoodId);
  emailContent.sponsorAd = {
    sponsorLabel: sundayAd.sponsorLabel,
    imageUrl: sundayAd.imageUrl,
    headline: sundayAd.headline,
    body: sundayAd.body,
    clickUrl: sundayAd.clickUrl,
  };

  try {
    const html = await render(SundayEditionTemplate(emailContent));
    const subject = buildSundaySubject(hood.name, emailContent);
    const emailAddr = (process.env.EMAIL_FROM || 'hello@readflaneur.com').replace(/.*<([^>]+)>.*/, '$1').trim();
    const from = `Flaneur News <${emailAddr}>`;

    const sent = await sendEmail({ from, to: recipientEmail, subject, html });

    if (sent) {
      // Track the send
      await supabase.from('weekly_brief_sends').insert({
        recipient_id: recipientId,
        recipient_email: recipientEmail,
        neighborhood_id: neighborhoodId,
        week_date: weekDate,
      }).then(null, () => {});

      // Track ad impression
      if (sundayAd.adId) {
        const { error: rpcErr } = await supabase.rpc('increment_ad_impressions', { ad_id: sundayAd.adId });
        if (rpcErr) {
          const { data: adRow } = await supabase.from('ads').select('impressions').eq('id', sundayAd.adId).single();
          if (adRow) {
            await supabase.from('ads').update({ impressions: (adRow.impressions || 0) + 1 }).eq('id', sundayAd.adId).then(null, () => {});
          }
        }
      }

      // Find primary neighborhood name for the success message
      const primaryId = subscribedIds[0];
      let primaryName = '';
      if (primaryId && primaryId !== neighborhoodId) {
        const { data: primaryHood } = await supabase
          .from('neighborhoods')
          .select('name')
          .eq('id', primaryId)
          .single();
        primaryName = primaryHood?.name || '';
      }

      const preferencesUrl = `${appUrl}/email/preferences?token=${token}`;
      const primaryNote = primaryName
        ? ` If you'd like to make ${neighborhood.name} your primary instead of ${primaryName}, <a href="${preferencesUrl}" style="color: #C9A96E;">change your preferences</a>.`
        : '';

      return new NextResponse(
        renderPage(
          'On Its Way',
          'success',
          `The ${neighborhood.name} Sunday Edition has been sent to ${recipientEmail}. Check your inbox.${primaryNote}`
        ),
        { headers: { 'Content-Type': 'text/html' } }
      );
    } else {
      return new NextResponse(
        renderPage('Send Failed', 'error', 'We couldn\'t send the email right now. Please try again later.'),
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      );
    }
  } catch (err) {
    console.error('Sunday Edition request send error:', err);
    return new NextResponse(
      renderPage('Send Failed', 'error', 'Something went wrong. Please try again later.'),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// ─── HTML Renderers ───

function renderConfirmPage(neighborhoodName: string, cityName: string, confirmUrl: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com').replace(/[\n\r]+$/, '').replace(/\/$/, '');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sunday Edition: ${neighborhoodName} - Flaneur</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 480px;
      margin: 60px auto;
      padding: 0 20px;
      color: #333;
    }
    .masthead {
      font-weight: 300;
      letter-spacing: 0.15em;
      font-size: 24px;
      margin-bottom: 32px;
      text-align: center;
    }
    .masthead a { color: #000; text-decoration: none; }
    h2 {
      font-weight: 500;
      font-size: 22px;
      margin-bottom: 8px;
      text-align: center;
    }
    .subtitle {
      font-size: 14px;
      color: #666;
      text-align: center;
      margin-bottom: 32px;
      line-height: 1.5;
    }
    .send-btn {
      display: block;
      width: 100%;
      padding: 16px;
      background: #000;
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      transition: background 0.2s;
    }
    .send-btn:hover { background: #222; }
    .back-link {
      display: block;
      text-align: center;
      color: #999;
      font-size: 13px;
      margin-top: 20px;
    }
    .back-link a { color: #999; }
  </style>
</head>
<body>
  <div class="masthead"><a href="${appUrl}">FLANEUR</a></div>
  <h2>The Sunday Edition</h2>
  <p class="subtitle">Send me this week's edition for <strong>${neighborhoodName}, ${cityName}</strong>?</p>
  <a href="${confirmUrl}" class="send-btn">Send it to me</a>
  <p class="back-link"><a href="${appUrl}">Back to Flaneur</a></p>
</body>
</html>`;
}

function renderPage(title: string, type: 'success' | 'error', message: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com').replace(/[\n\r]+$/, '').replace(/\/$/, '');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Flaneur</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 480px;
      margin: 60px auto;
      padding: 0 20px;
      color: #333;
    }
    .masthead {
      font-weight: 300;
      letter-spacing: 0.15em;
      font-size: 24px;
      margin-bottom: 32px;
      text-align: center;
    }
    .masthead a { color: #000; text-decoration: none; }
    h2 {
      font-weight: 500;
      font-size: 20px;
      margin-bottom: 16px;
      text-align: center;
    }
    p {
      font-size: 15px;
      line-height: 1.6;
      color: #555;
      text-align: center;
    }
    p a { color: #C9A96E; }
    .cta {
      display: block;
      text-align: center;
      margin-top: 24px;
      color: #000;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="masthead"><a href="${appUrl}">FLANEUR</a></div>
  <h2>${title}</h2>
  <p>${message}</p>
  <a class="cta" href="${appUrl}">Return to Flaneur</a>
</body>
</html>`;
}
