/**
 * NYC Heritage Filings Sync Cron Job
 *
 * Fetches recent DOB filings for demolitions, landmark alterations, and tree removal,
 * then generates heritage alerts for Flâneur neighborhoods.
 *
 * Schedule: Daily at 8 AM UTC (3 AM EST)
 * Vercel Cron: 0 8 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchHeritageFilings,
  generateHeritageStory,
  HeritageEvent,
  HeritageEventType,
} from '@/lib/nyc-heritage';
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
  // Support ?type=Demolition for filtering by type
  const url = new URL(request.url);
  const testNeighborhood = url.searchParams.get('neighborhood');
  const testType = url.searchParams.get('type') as HeritageEventType | null;
  const hoursBack = parseInt(url.searchParams.get('hours') || '24', 10);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    filings_fetched: 0,
    filings_in_coverage: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_type: {
      Demolition: 0,
      Landmark: 0,
      Tree: 0,
    } as Record<HeritageEventType, number>,
    by_neighborhood: {} as Record<string, number>,
    errors: [] as string[],
  };

  try {
    console.log(`Fetching NYC heritage filings from last ${hoursBack} hours`);

    // Fetch all heritage filings
    let events = await fetchHeritageFilings(hoursBack);
    results.filings_fetched = events.length;

    // Count by type
    for (const event of events) {
      results.by_type[event.type]++;
    }

    // Filter by neighborhood if testing
    if (testNeighborhood) {
      events = events.filter((e) => e.neighborhoodId === testNeighborhood);
    }

    // Filter by type if testing
    if (testType) {
      events = events.filter((e) => e.type === testType);
    }

    results.filings_in_coverage = events.length;

    if (events.length === 0) {
      console.log('No heritage filings found in coverage areas');
      return NextResponse.json({
        success: true,
        message: 'No heritage filings in coverage areas',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Group events by neighborhood
    const eventsByNeighborhood: Record<string, HeritageEvent[]> = {};
    for (const event of events) {
      if (!eventsByNeighborhood[event.neighborhoodId]) {
        eventsByNeighborhood[event.neighborhoodId] = [];
      }
      eventsByNeighborhood[event.neighborhoodId].push(event);
    }

    // Process events per neighborhood
    // Prioritize: All demolitions, top landmarks, some trees
    for (const [neighborhoodId, neighborhoodEvents] of Object.entries(eventsByNeighborhood)) {
      results.by_neighborhood[neighborhoodId] = neighborhoodEvents.length;

      // Get prioritized events for this neighborhood
      const demolitions = neighborhoodEvents.filter((e) => e.type === 'Demolition').slice(0, 3);
      const landmarks = neighborhoodEvents.filter((e) => e.type === 'Landmark').slice(0, 2);
      const trees = neighborhoodEvents.filter((e) => e.type === 'Tree').slice(0, 1);

      const topEvents = [...demolitions, ...landmarks, ...trees];

      for (const event of topEvents) {
        try {
          // Create a slug from the job number
          const cleanId = event.jobNumber.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 30);
          const slug = `heritage-${cleanId}`;

          // Check if we already have an article for this event
          const { data: existingArticle } = await supabase
            .from('articles')
            .select('id')
            .eq('slug', slug)
            .single();

          if (existingArticle) {
            console.log(`Article already exists for job ${event.jobNumber}`);
            results.articles_skipped++;
            continue;
          }

          // Generate story
          const story = await generateHeritageStory(event);
          if (!story) {
            results.errors.push(`${event.eventId}: Story generation returned null`);
            continue;
          }

          results.stories_generated++;

          // Determine category label based on event type
          const categoryLabel =
            event.type === 'Demolition'
              ? 'Teardown Alert'
              : event.type === 'Landmark'
                ? 'Facade Watch'
                : 'Green Loss';

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

          // Create article with Unsplash image
          const imageUrl = await getCronImage('heritage-watch', supabase, { neighborhoodId: finalNeighborhoodId });
          const { error: insertError } = await supabase.from('articles').insert({
            neighborhood_id: finalNeighborhoodId,
            headline: story.headline,
            body_text: story.body,
            preview_text: story.previewText,
            image_url: imageUrl,
            slug,
            status: 'published',
            published_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: 'gemini-2.5-flash',
            ai_prompt: `Heritage Alert: ${event.type} at ${event.address}`,
            category_label: categoryLabel,
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
                slug,
                status: 'published',
                published_at: new Date().toISOString(),
                author_type: 'ai',
                ai_model: 'gemini-2.5-flash',
                ai_prompt: `Heritage Alert: ${event.type} at ${event.address}`,
                category_label: categoryLabel,
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
          console.log(`Created heritage article for ${event.type} at ${event.address} in ${neighborhoodId}`);

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
      `Heritage Filings Sync: ${results.stories_generated} stories, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Heritage filings sync failed:', error);

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
