/**
 * Gala Watch Sync Cron Job
 *
 * Aggregates high-society charity events using the "Hub Broadcast" model:
 * - Scrapes city hubs (NYC, London, Paris, LA, Sydney, etc.)
 * - Broadcasts events to associated wealthy residential neighborhoods
 *
 * Data Sources:
 * 1. Eventbrite API with "High Ticket" filter (>$500 USD equivalent)
 * 2. Society Pages: NY Social Diary, Tatler UK
 *
 * Schedule: Daily at 6 AM UTC (before morning feeds)
 * Vercel Cron: 0 6 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processGalaWatch,
  createSampleGalaEvents,
  generateGalaStory,
  GalaStory,
  GALA_HUBS,
} from '@/lib/gala-watch';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for multiple source scraping

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
  const daysAhead = parseInt(url.searchParams.get('days') || '30', 10);
  const useSampleData = url.searchParams.get('sample') === 'true';
  const testHub = url.searchParams.get('hub');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    events_found: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_hub: {} as Record<string, number>,
    by_source: {} as Record<string, number>,
    hubs_processed: Object.keys(GALA_HUBS).length,
    errors: [] as string[],
  };

  try {
    let stories: GalaStory[];

    if (useSampleData) {
      console.log('Using sample gala data for testing');
      const sampleEvents = createSampleGalaEvents();
      stories = [];

      for (const event of sampleEvents) {
        const story = await generateGalaStory(event);
        if (story) stories.push(story);
      }

      results.events_found = sampleEvents.length;
      results.by_hub['sample'] = sampleEvents.length;
      results.by_source['sample'] = sampleEvents.length;
    } else {
      console.log(`Processing gala events for next ${daysAhead} days`);

      // Run the full pipeline
      const processResult = await processGalaWatch(daysAhead);

      results.events_found = processResult.eventsFound;
      results.stories_generated = processResult.storiesGenerated;
      results.by_hub = processResult.byHub;
      results.by_source = processResult.bySource;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by hub if specified
    if (testHub) {
      stories = stories.filter(
        (s) => s.hub.toLowerCase().replace(/_/g, '-') === testHub.toLowerCase()
      );
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No gala stories generated');
      return NextResponse.json({
        success: true,
        message: 'No gala events found for the period',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const cleanEvent = story.event.name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 30);
          const cleanVenue = story.event.venue
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 20);
          const dateStr = story.event.date.toISOString().split('T')[0];
          const slug = `social-calendar-${cleanEvent}-${cleanVenue}-${dateStr}-${neighborhoodId}`;

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
            const shortId = neighborhoodId.split('-').slice(1).join('-');
            const { data: altNeighborhood } = await supabase
              .from('neighborhoods')
              .select('id')
              .eq('id', shortId)
              .single();

            if (altNeighborhood) {
              finalNeighborhoodId = shortId;
            } else {
              // Skip if neighborhood doesn't exist
              continue;
            }
          }

          // Create article with cached image
          const { error: insertError } = await supabase.from('articles').insert({
            neighborhood_id: finalNeighborhoodId,
            headline: story.headline,
            body_text: story.body,
            preview_text: story.previewText,
            image_url: await getCronImage('gala-watch', supabase, { neighborhoodId: finalNeighborhoodId }),
            slug,
            status: 'published',
            published_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: 'gemini-2.5-flash',
            ai_prompt: `Gala Watch (${story.hub}): ${story.event.name} at ${story.event.venue}`,
            category_label: story.categoryLabel,
            enriched_at: new Date().toISOString(),
            enrichment_model: 'gemini-2.5-flash',
          });

          if (insertError) {
            results.errors.push(`${story.event.name}/${neighborhoodId}: ${insertError.message}`);
            continue;
          }

          results.articles_created++;
        } catch (err) {
          results.errors.push(
            `${story.event.name}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Gala Watch: ${results.events_found} events, ${results.stories_generated} stories, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Gala watch sync failed:', error);

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
