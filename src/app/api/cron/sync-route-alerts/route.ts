/**
 * Route Alert Sync Cron Job
 *
 * Monitors airline schedules to alert residents when new
 * "Direct Premium Routes" launch from their local hub.
 *
 * Strategy: "The Hub Map"
 * - Map neighborhoods to hub airports
 * - Track new direct premium routes
 * - Filter for leisure destinations and legacy carriers
 *
 * Data Sources:
 * - Routes Online / The Points Guy (new route news)
 * - Airline Press Rooms (Delta, United, BA, Emirates, Qantas)
 *
 * Schedule: Weekly on Thursdays at 7 AM UTC
 * Vercel Cron: 0 7 * * 4
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processRouteAlerts,
  createSampleAnnouncements,
  generateRouteStory,
  RouteStory,
  AIRPORT_HUBS,
  LEGACY_AIRLINES,
  LEISURE_DESTINATIONS,
} from '@/lib/route-alert';
import { getCronImage } from '@/lib/cron-images';

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
  const testAirline = url.searchParams.get('airline');
  const testHub = url.searchParams.get('hub');
  const testDestination = url.searchParams.get('destination');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    sources_scraped: 0,
    announcements_found: 0,
    premium_routes_count: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_airline: {} as Record<string, number>,
    by_destination_type: {} as Record<string, number>,
    by_hub: {} as Record<string, number>,
    total_hubs: Object.keys(AIRPORT_HUBS).length,
    total_airlines: LEGACY_AIRLINES.length,
    total_destinations: LEISURE_DESTINATIONS.length,
    errors: [] as string[],
  };

  try {
    let stories: RouteStory[];

    if (useSampleData) {
      console.log('Using sample route alert data for testing');
      const sampleAnnouncements = createSampleAnnouncements();
      stories = [];

      for (const announcement of sampleAnnouncements) {
        const story = await generateRouteStory(announcement);
        if (story) stories.push(story);
      }

      results.announcements_found = sampleAnnouncements.length;
      results.premium_routes_count = sampleAnnouncements.length;
      results.by_hub['sample'] = sampleAnnouncements.length;
    } else {
      console.log('Processing route alert news sources');

      // Run the full pipeline
      const processResult = await processRouteAlerts();

      results.sources_scraped = processResult.sourcesScraped;
      results.announcements_found = processResult.announcementsFound;
      results.premium_routes_count = processResult.premiumRoutesCount;
      results.stories_generated = processResult.storiesGenerated;
      results.by_airline = processResult.byAirline;
      results.by_destination_type = processResult.byDestinationType;
      results.by_hub = processResult.byHub;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by airline if specified
    if (testAirline) {
      stories = stories.filter((s) =>
        s.announcement.airline.name.toLowerCase().includes(testAirline.toLowerCase()) ||
        s.announcement.airline.code.toLowerCase() === testAirline.toLowerCase()
      );
    }

    // Filter by hub if specified
    if (testHub) {
      stories = stories.filter((s) =>
        s.announcement.originAirport.code.toLowerCase() === testHub.toLowerCase()
      );
    }

    // Filter by destination if specified
    if (testDestination) {
      stories = stories.filter((s) =>
        s.announcement.destination.city.toLowerCase().includes(testDestination.toLowerCase()) ||
        s.announcement.destination.code.toLowerCase() === testDestination.toLowerCase()
      );
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No route alert stories generated');
      return NextResponse.json({
        success: true,
        message: 'No new premium routes found',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const cleanAirline = story.announcement.airline.code.toLowerCase();
          const cleanDest = story.announcement.destination.code.toLowerCase();
          const cleanHub = story.announcement.originAirport.code.toLowerCase();
          const dateStr = new Date().toISOString().split('T')[0];
          const slug = `flight-check-${cleanAirline}-${cleanHub}-${cleanDest}-${dateStr}-${neighborhoodId}`;

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
          let finalNeighborhoodId = neighborhoodId;

          const { data: neighborhood } = await supabase
            .from('neighborhoods')
            .select('id')
            .eq('id', neighborhoodId)
            .single();

          if (!neighborhood) {
            // Try without city prefix
            const parts = neighborhoodId.split('-');
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

          // Create article with cached image
          const { error: insertError } = await supabase.from('articles').insert({
            neighborhood_id: finalNeighborhoodId,
            headline: story.headline,
            body_text: story.body,
            preview_text: story.previewText,
            image_url: await getCronImage('route-alert', supabase, { neighborhoodId: finalNeighborhoodId }),
            slug,
            status: 'published',
            published_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: 'gemini-2.5-flash',
            ai_prompt: `Flight Check: ${story.announcement.airline.name} ${story.announcement.originAirport.code}-${story.announcement.destination.code}`,
            category_label: story.categoryLabel,
            enriched_at: new Date().toISOString(),
            enrichment_model: 'gemini-2.5-flash',
          });

          if (insertError) {
            results.errors.push(
              `${story.announcement.airline.code}/${neighborhoodId}: ${insertError.message}`
            );
            continue;
          }

          results.articles_created++;
        } catch (err) {
          results.errors.push(
            `${story.announcement.airline.code}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Route Alerts: ${results.announcements_found} announcements, ${results.premium_routes_count} premium, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Route alert sync failed:', error);

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
