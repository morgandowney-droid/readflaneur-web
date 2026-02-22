import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { render } from '@react-email/components';
import { SundayEditionTemplate, SundayEditionContent } from '@/lib/email/templates/SundayEditionTemplate';
import { resolveSundayAd } from '@/lib/email/sunday-ad-resolver';
import { fetchWeather } from '@/lib/email/weather';

/**
 * Preview a Sunday Edition email for a given neighborhood and date.
 *
 * GET /api/admin/preview-sunday-edition?neighborhood={id}&date={YYYY-MM-DD}
 *
 * Auth: Bearer CRON_SECRET
 * Returns: { subject, html, briefWeekDate, articleExists, articleUrl, warning? }
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Build Sunday Edition subject line (duplicated from send cron for admin preview).
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
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const neighborhoodId = url.searchParams.get('neighborhood');
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

  if (!neighborhoodId) {
    return NextResponse.json({ error: 'Missing neighborhood parameter' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch the weekly brief for this neighborhood + date
  let brief;
  let warning: string | undefined;

  const { data: exactBrief } = await supabase
    .from('weekly_briefs')
    .select('*, neighborhoods(name, city, latitude, longitude, country), articles(slug)')
    .eq('neighborhood_id', neighborhoodId)
    .eq('week_date', date)
    .single();

  brief = exactBrief;

  // Fall back to most recent brief
  if (!brief) {
    const { data: recentBriefs } = await supabase
      .from('weekly_briefs')
      .select('*, neighborhoods(name, city, latitude, longitude, country), articles(slug)')
      .eq('neighborhood_id', neighborhoodId)
      .order('week_date', { ascending: false })
      .limit(1);

    brief = recentBriefs?.[0] || null;
    if (brief) {
      warning = `No brief found for ${date}. Using most recent brief from ${brief.week_date}.`;
    }
  }

  if (!brief) {
    return NextResponse.json({
      error: `No weekly brief found for ${neighborhoodId}. Generate one first.`,
    }, { status: 404 });
  }

  const hood = brief.neighborhoods as unknown as {
    name: string;
    city: string;
    latitude: number | null;
    longitude: number | null;
    country: string | null;
  };
  const articleSlug = (brief.articles as unknown as { slug: string } | null)?.slug;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com')
    .replace(/[\n\r]+$/, '').replace(/\/$/, '');

  // Build article URL with existence check
  let articleUrl: string | null = null;
  let articleExists = false;
  if (articleSlug) {
    const { data: articleCheck } = await supabase
      .from('articles')
      .select('id')
      .eq('slug', articleSlug)
      .eq('status', 'published')
      .single();

    if (articleCheck) {
      articleExists = true;
      const neighborhoodSlug = neighborhoodId.split('-').slice(1).join('-');
      const citySlug = hood.city.toLowerCase().replace(/\s+/g, '-');
      articleUrl = `${appUrl}/${citySlug}/${neighborhoodSlug}/${articleSlug}?ref=sunday-edition`;
    }
  }

  // Format date
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });

  // Fetch Look Ahead URL
  let lookAheadUrl: string | null = null;
  try {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48);
    const { data: lookAheadArticles } = await supabase
      .from('articles')
      .select('slug')
      .eq('neighborhood_id', neighborhoodId)
      .eq('status', 'published')
      .eq('article_type', 'look_ahead')
      .gte('published_at', cutoff.toISOString())
      .order('published_at', { ascending: false })
      .limit(1);
    if (lookAheadArticles && lookAheadArticles.length > 0) {
      const neighborhoodSlug = neighborhoodId.split('-').slice(1).join('-');
      const citySlug = hood.city.toLowerCase().replace(/\s+/g, '-');
      lookAheadUrl = `${appUrl}/${citySlug}/${neighborhoodSlug}/${lookAheadArticles[0].slug}`;
    }
  } catch {}

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
      if (dp.type === 'environment' && /AQI/i.test(dp.value)) {
        if (hood.latitude && hood.longitude) {
          const weather = await fetchWeather(
            hood.latitude, hood.longitude,
            'America/New_York',
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
    unsubscribeUrl: `${appUrl}/email/preferences`,
    preferencesUrl: `${appUrl}/email/preferences`,
    referralUrl: undefined,
    lookAheadUrl,
  };

  // Resolve sponsor ad
  const sundayAd = await resolveSundayAd(supabase, neighborhoodId);
  emailContent.sponsorAd = {
    sponsorLabel: sundayAd.sponsorLabel,
    imageUrl: sundayAd.imageUrl,
    headline: sundayAd.headline,
    body: sundayAd.body,
    clickUrl: sundayAd.clickUrl,
  };

  const html = await render(SundayEditionTemplate(emailContent));
  const subject = buildSundaySubject(hood.name, emailContent);

  return NextResponse.json({
    subject,
    html,
    briefWeekDate: brief.week_date,
    articleExists,
    articleUrl,
    warning,
  });
}
