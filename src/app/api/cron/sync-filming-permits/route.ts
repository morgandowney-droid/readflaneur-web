/**
 * NYC Filming Permits Sync Cron Job
 *
 * Fetches upcoming film shoots from NYC Open Data and generates
 * "Set Life" stories for Flâneur neighborhoods.
 *
 * Schedule: Every 6 hours (30 minutes past)
 * Vercel Cron: 30 0,6,12,18 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchFilmingPermits,
  generateFilmingStory,
  FilmingEvent,
  FilmingStory,
} from '@/lib/nyc-filming';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 120;

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

  // Support ?neighborhood=west-village for testing single neighborhood
  const url = new URL(request.url);
  const testNeighborhood = url.searchParams.get('neighborhood');
  const hoursAhead = parseInt(url.searchParams.get('hours') || '168', 10);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    permits_fetched: 0,
    permits_in_coverage: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_neighborhood: {} as Record<string, number>,
    errors: [] as string[],
  };

  try {
    console.log(`Fetching NYC film permits for next ${hoursAhead} hours`);

    // Fetch all filming permits
    let events = await fetchFilmingPermits(hoursAhead);
    results.permits_fetched = events.length;

    // Filter by neighborhood if testing
    if (testNeighborhood) {
      events = events.filter((e) => e.neighborhoodId === testNeighborhood);
    }

    results.permits_in_coverage = events.length;

    if (events.length === 0) {
      console.log('No filming permits found in coverage areas');
      return NextResponse.json({
        success: true,
        message: 'No filming permits in coverage areas',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Group events by neighborhood
    const eventsByNeighborhood: Record<string, FilmingEvent[]> = {};
    for (const event of events) {
      if (!eventsByNeighborhood[event.neighborhoodId]) {
        eventsByNeighborhood[event.neighborhoodId] = [];
      }
      eventsByNeighborhood[event.neighborhoodId].push(event);
    }

    // Process top events per neighborhood
    for (const [neighborhoodId, neighborhoodEvents] of Object.entries(eventsByNeighborhood)) {
      results.by_neighborhood[neighborhoodId] = neighborhoodEvents.length;

      // Take top 3 events per neighborhood (prioritized by known production, impact)
      const topEvents = neighborhoodEvents.slice(0, 3);

      for (const event of topEvents) {
        try {
          // Check if we already have an article for this event
          const { data: existingArticle } = await supabase
            .from('articles')
            .select('id')
            .eq('slug', `filming-${event.eventId}`)
            .single();

          if (existingArticle) {
            console.log(`Article already exists for event ${event.eventId}`);
            results.articles_skipped++;
            continue;
          }

          // Generate story
          const story = await generateFilmingStory(event);
          if (!story) {
            results.errors.push(`${event.eventId}: Story generation returned null`);
            continue;
          }

          results.stories_generated++;

          // Verify neighborhood exists
          const { data: neighborhood } = await supabase
            .from('neighborhoods')
            .select('id')
            .eq('id', `nyc-${neighborhoodId}`)
            .single();

          // Try alternative ID format
          const finalNeighborhoodId = neighborhood
            ? `nyc-${neighborhoodId}`
            : neighborhoodId;

          // Create article
          const shootDate = new Date(event.startDate);
          const dateStr = shootDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });

          // Create article with Unsplash image
          const imageUrl = await getCronImage('filming-permit', supabase, { neighborhoodId: finalNeighborhoodId });
          const { error: insertError } = await supabase.from('articles').insert({
            neighborhood_id: finalNeighborhoodId,
            headline: story.headline,
            body_text: story.body,
            preview_text: story.previewText,
            image_url: imageUrl,
            slug: `filming-${event.eventId}`,
            status: 'published',
            published_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: 'gemini-2.5-flash',
            ai_prompt: `Set Life: ${event.projectName} on ${dateStr}`,
            category_label: 'Set Life',
            editor_notes: 'Source: NYC Film Permits Open Data - https://data.cityofnewyork.us/City-Government/Film-Permits/tg4x-b46p',
            enriched_at: new Date().toISOString(),
            enrichment_model: 'gemini-2.5-flash',
          });

          if (insertError) {
            // If neighborhood ID issue, try without prefix
            if (insertError.message.includes('foreign key')) {
              const { error: retryError } = await supabase.from('articles').insert({
                neighborhood_id: neighborhoodId,
                headline: story.headline,
                body_text: story.body,
                preview_text: story.previewText,
                image_url: imageUrl,
                slug: `filming-${event.eventId}`,
                status: 'published',
                published_at: new Date().toISOString(),
                author_type: 'ai',
                ai_model: 'gemini-2.5-flash',
                ai_prompt: `Set Life: ${event.projectName} on ${dateStr}`,
                category_label: 'Set Life',
                enriched_at: new Date().toISOString(),
                enrichment_model: 'gemini-2.5-flash',
              });

              if (retryError) {
                results.errors.push(`${event.eventId}: ${retryError.message}`);
                continue;
              }
            } else {
              results.errors.push(`${event.eventId}: ${insertError.message}`);
              continue;
            }
          }

          results.articles_created++;
          console.log(`Created filming article for ${event.projectName} in ${neighborhoodId}`);

          // Rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (err) {
          results.errors.push(
            `${event.eventId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Filming Permits Sync: ${results.stories_generated} stories, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Filming permits sync failed:', error);

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
