/**
 * NYC Alfresco Permits Sync Cron Job
 *
 * Fetches recent outdoor dining approvals from NYC Open Data and generates
 * "Al Fresco Alert" stories for Flâneur neighborhoods.
 *
 * Schedule: Daily at 9 AM UTC (4 AM EST)
 * Vercel Cron: 0 9 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchAlfrescoPermits,
  generateAlfrescoStory,
  OutdoorDiningEvent,
} from '@/lib/nyc-alfresco';
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
  const daysBack = parseInt(url.searchParams.get('days') || '7', 10);

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
    chains_filtered: 0,
    by_neighborhood: {} as Record<string, number>,
    errors: [] as string[],
  };

  try {
    console.log(`Fetching NYC alfresco permits from last ${daysBack} days`);

    // Fetch all alfresco permits
    let events = await fetchAlfrescoPermits(daysBack);
    results.permits_fetched = events.length;

    // Filter by neighborhood if testing
    if (testNeighborhood) {
      events = events.filter((e) => e.neighborhoodId === testNeighborhood);
    }

    results.permits_in_coverage = events.length;

    if (events.length === 0) {
      console.log('No alfresco permits found in coverage areas');
      return NextResponse.json({
        success: true,
        message: 'No alfresco permits in coverage areas',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for alfresco watch (reused across all stories)
    const cachedImageUrl = await getCronImage('alfresco-watch', supabase);

    // Group events by neighborhood
    const eventsByNeighborhood: Record<string, OutdoorDiningEvent[]> = {};
    for (const event of events) {
      if (!eventsByNeighborhood[event.neighborhoodId]) {
        eventsByNeighborhood[event.neighborhoodId] = [];
      }
      eventsByNeighborhood[event.neighborhoodId].push(event);
    }

    // Process top events per neighborhood
    for (const [neighborhoodId, neighborhoodEvents] of Object.entries(eventsByNeighborhood)) {
      results.by_neighborhood[neighborhoodId] = neighborhoodEvents.length;

      // Take top 2 events per neighborhood (already sorted by priority)
      const topEvents = neighborhoodEvents.slice(0, 2);

      for (const event of topEvents) {
        try {
          // Create a slug from the event ID (clean it up)
          const cleanId = event.eventId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 30);
          const slug = `alfresco-${cleanId}`;

          // Check if we already have an article for this event
          const { data: existingArticle } = await supabase
            .from('articles')
            .select('id')
            .eq('slug', slug)
            .single();

          if (existingArticle) {
            console.log(`Article already exists for event ${event.eventId}`);
            results.articles_skipped++;
            continue;
          }

          // Generate story
          const story = await generateAlfrescoStory(event);
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

          // Create article with cached image
          const { error: insertError } = await supabase.from('articles').insert({
            neighborhood_id: finalNeighborhoodId,
            headline: story.headline,
            body_text: story.body,
            preview_text: story.previewText,
            image_url: cachedImageUrl, // Reuse cached category image
            slug,
            status: 'published',
            published_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: 'gemini-2.5-flash',
            ai_prompt: `Al Fresco Alert: ${event.restaurantName} (${event.seatingType})`,
            category_label: 'Al Fresco',
            editor_notes: 'Source: NYC Open Restaurants - https://data.cityofnewyork.us/Transportation/Open-Restaurant-Applications/pitm-atqc',
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
                image_url: cachedImageUrl, // Reuse cached category image
                slug,
                status: 'published',
                published_at: new Date().toISOString(),
                author_type: 'ai',
                ai_model: 'gemini-2.5-flash',
                ai_prompt: `Al Fresco Alert: ${event.restaurantName} (${event.seatingType})`,
                category_label: 'Al Fresco',
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
          console.log(`Created alfresco article for ${event.restaurantName} in ${neighborhoodId}`);

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
      `Alfresco Permits Sync: ${results.stories_generated} stories, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Alfresco permits sync failed:', error);

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
