/**
 * Fashion Week Sync Cron Job
 *
 * Special Event engine that triggers high-alert coverage during
 * Global Fashion Weeks (NYFW, LFW, MFW, PFW).
 *
 * Architecture: "Calendar Override"
 * - Detects active Fashion Week windows
 * - Scrapes official show schedules daily
 * - Generates "Runway Watch" and "Traffic Alert" stories
 * - Switches neighborhood briefs into "Fashion Mode"
 *
 * Schedule: Daily at 5 AM UTC (runs year-round, only generates during active weeks)
 * Vercel Cron: 0 5 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processFashionWeeks,
  createSampleSummaries,
  generateFashionWeekStory,
  detectFashionWeekWindow,
  FashionWeekStory,
} from '@/lib/fashion-week';
import { FASHION_CALENDAR } from '@/config/fashion-weeks';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for scraping

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

  // Support query params for testing
  const url = new URL(request.url);
  const useSampleData = url.searchParams.get('sample') === 'true';
  const testCity = url.searchParams.get('city');
  const forceActive = url.searchParams.get('force') === 'true'; // Force processing even if no active week

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check current fashion week status
  const currentWindows = detectFashionWeekWindow();
  const activeWeeks = currentWindows.filter((w) => w.state === 'active');
  const upcomingWeeks = currentWindows.filter((w) => w.state === 'upcoming');

  const results = {
    fashion_week_status: {
      active: activeWeeks.map((w) => ({
        name: w.config.shortName,
        day: w.currentDay,
        ends: w.endDate.toISOString().split('T')[0],
      })),
      upcoming: upcomingWeeks.map((w) => ({
        name: w.config.shortName,
        starts_in_days: w.daysUntilStart,
        starts: w.startDate.toISOString().split('T')[0],
      })),
    },
    shows_scraped: 0,
    stories_generated: 0,
    neighborhoods_covered: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_city: {} as Record<string, number>,
    traffic_alerts: [] as string[],
    total_fashion_weeks: FASHION_CALENDAR.length,
    errors: [] as string[],
  };

  // If no active fashion week and not forcing, return early
  if (activeWeeks.length === 0 && !useSampleData && !forceActive) {
    console.log('No active fashion weeks - skipping');
    return NextResponse.json({
      success: true,
      message: 'No active fashion weeks',
      ...results,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    let stories: FashionWeekStory[];

    if (useSampleData) {
      console.log('Using sample fashion week data for testing');
      const sampleSummaries = createSampleSummaries();
      stories = [];

      for (const summary of sampleSummaries) {
        for (const neighborhoodId of Object.keys(summary.showsByNeighborhood)) {
          const story = await generateFashionWeekStory(summary, neighborhoodId);
          if (story) stories.push(story);
        }
        results.shows_scraped += summary.totalShows;
        results.traffic_alerts.push(...summary.trafficAlerts);
      }
    } else {
      console.log('Processing active fashion weeks');

      // Run the full pipeline
      const processResult = await processFashionWeeks();

      results.shows_scraped = processResult.showsScraped;
      results.stories_generated = processResult.storiesGenerated;
      results.neighborhoods_covered = processResult.neighborhoodsCovered;
      results.by_city = processResult.byCity;
      results.traffic_alerts = processResult.trafficAlerts;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by city if specified
    if (testCity) {
      const normalizedCity = testCity.replace(/-/g, '_');
      stories = stories.filter(
        (s) => s.fashionWeek.city.toLowerCase() === normalizedCity.toLowerCase()
      );
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No fashion week stories generated');
      return NextResponse.json({
        success: true,
        message: 'No stories generated (may be off-peak day)',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Create articles for each story
    for (const story of stories) {
      try {
        // Create unique slug
        const dateStr = story.summary.date.toISOString().split('T')[0];
        const slug = `fashion-week-${story.fashionWeek.shortName.toLowerCase()}-day${story.summary.dayNumber}-${dateStr}-${story.neighborhoodId}`;

        // Check if we already have an article with this slug
        const { data: existingArticle } = await supabase
          .from('articles')
          .select('id')
          .eq('slug', slug)
          .single();

        if (existingArticle) {
          results.articles_skipped++;
          continue;
        }

        // Verify neighborhood exists
        let finalNeighborhoodId = story.neighborhoodId;

        const { data: neighborhood } = await supabase
          .from('neighborhoods')
          .select('id')
          .eq('id', story.neighborhoodId)
          .single();

        if (!neighborhood) {
          // Try without city prefix
          const parts = story.neighborhoodId.split('-');
          if (parts.length > 1) {
            const shortId = parts.slice(1).join('-');
            const { data: altNeighborhood } = await supabase
              .from('neighborhoods')
              .select('id')
              .eq('id', shortId)
              .single();

            if (altNeighborhood) {
              finalNeighborhoodId = shortId;
            } else {
              continue;
            }
          } else {
            continue;
          }
        }

        // Create article with appropriate priority
        const { error: insertError } = await supabase.from('articles').insert({
          neighborhood_id: finalNeighborhoodId,
          headline: story.headline,
          body_text: story.body,
          preview_text: story.previewText,
          slug,
          status: 'published',
          published_at: new Date().toISOString(),
          author_type: 'ai',
          ai_model: 'gemini-2.0-flash',
          ai_prompt: `Fashion Week: ${story.fashionWeek.name} Day ${story.summary.dayNumber} - ${story.neighborhoodId}`,
          category_label: story.categoryLabel,
          // Hero priority articles could be pinned at top of feed
          // is_featured: story.priority === 'hero',
        });

        if (insertError) {
          results.errors.push(`${story.fashionWeek.shortName}/${story.neighborhoodId}: ${insertError.message}`);
          continue;
        }

        results.articles_created++;
      } catch (err) {
        results.errors.push(
          `${story.fashionWeek.shortName}/${story.neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(
      `Fashion Week: ${results.shows_scraped} shows, ${results.stories_generated} stories, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Fashion week sync failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        ...results,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
