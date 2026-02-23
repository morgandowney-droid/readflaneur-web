/**
 * Global Auction Calendar Sync Cron Job
 *
 * Scrapes the Big Three auction houses across Global Art Hubs
 * (London, Paris, Hong Kong, Los Angeles, Geneva) and generates
 * stories syndicated to spoke neighborhoods.
 *
 * Schedule: Weekly on Sundays at 10 PM UTC (before NYC sync at 11 PM)
 * Vercel Cron: 0 22 * * 0
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchAllGlobalAuctionCalendars,
  generateGlobalAuctionStory,
  createSampleGlobalAuctionEvents,
  distributeStory,
  ART_HUBS,
  ArtHub,
  GlobalAuctionEvent,
} from '@/lib/global-auctions';
import { AuctionHouse, AuctionTier } from '@/lib/nyc-auctions';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for scraping + generation

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
  const daysAhead = parseInt(url.searchParams.get('days') || '14', 10);
  const useSampleData = url.searchParams.get('sample') === 'true';
  const testHub = url.searchParams.get('hub') as ArtHub | null;
  const testNeighborhood = url.searchParams.get('neighborhood');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    auctions_found: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    neighborhoods_syndicated: 0,
    by_hub: {
      London: 0,
      Paris: 0,
      Hong_Kong: 0,
      Los_Angeles: 0,
      Geneva: 0,
      New_York: 0,
    } as Record<ArtHub, number>,
    by_house: {
      Sothebys: 0,
      Christies: 0,
      Phillips: 0,
    } as Record<AuctionHouse, number>,
    by_tier: {
      Mega: 0,
      Standard: 0,
    } as Record<AuctionTier, number>,
    errors: [] as string[],
  };

  try {
    // Determine target hubs
    const targetHubs: ArtHub[] = testHub
      ? [testHub]
      : ['London', 'Paris', 'Hong_Kong', 'Los_Angeles', 'Geneva'];

    console.log(`Fetching global auction calendars for hubs: ${targetHubs.join(', ')}`);

    // Fetch auctions (or use sample data for testing)
    let events: GlobalAuctionEvent[];

    if (useSampleData) {
      console.log('Using sample global auction data for testing');
      events = createSampleGlobalAuctionEvents();
      // Filter to test hub if specified
      if (testHub) {
        events = events.filter((e) => e.hub === testHub);
      }
    } else {
      events = await fetchAllGlobalAuctionCalendars(daysAhead, targetHubs);
    }

    results.auctions_found = events.length;

    // Count by hub, house, and tier
    for (const event of events) {
      results.by_hub[event.hub]++;
      results.by_house[event.house]++;
      results.by_tier[event.tier]++;
    }

    if (events.length === 0) {
      console.log('No Blue Chip global auctions found');
      return NextResponse.json({
        success: true,
        message: 'No Blue Chip global auctions found for the period',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Process events by hub
    for (const hub of targetHubs) {
      const hubEvents = events.filter((e) => e.hub === hub);
      const hubConfig = ART_HUBS[hub];

      // Get top events for this hub
      const megaEvents = hubEvents.filter((e) => e.tier === 'Mega').slice(0, 3);
      const standardEvents = hubEvents.filter((e) => e.tier === 'Standard').slice(0, 2);
      const topEvents = [...megaEvents, ...standardEvents];

      for (const event of topEvents) {
        try {
          // Generate story
          const story = await generateGlobalAuctionStory(event);
          if (!story) {
            results.errors.push(`${event.eventId}: Story generation returned null`);
            continue;
          }

          results.stories_generated++;

          // Get distribution targets
          const { distributions } = distributeStory(story);

          // Determine target neighborhoods
          let targetDistributions = distributions;
          if (testNeighborhood) {
            targetDistributions = distributions.filter(
              (d) => d.neighborhoodId === testNeighborhood
            );
          }

          // Syndicate to all target neighborhoods
          for (const { neighborhoodId, slug } of targetDistributions) {
            try {
              // Check if we already have an article for this event in this neighborhood
              const { data: existingArticle } = await supabase
                .from('articles')
                .select('id')
                .eq('slug', slug)
                .single();

              if (existingArticle) {
                results.articles_skipped++;
                continue;
              }

              // Verify neighborhood exists (try multiple ID formats)
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
                  const { data: shortNeighborhood } = await supabase
                    .from('neighborhoods')
                    .select('id')
                    .eq('id', shortId)
                    .single();

                  if (shortNeighborhood) {
                    finalNeighborhoodId = shortId;
                  } else {
                    // Skip if neighborhood doesn't exist
                    continue;
                  }
                } else {
                  continue;
                }
              }

              // Determine category label based on tier
              const categoryLabel =
                event.tier === 'Mega' ? 'Auction: Marquee Sale' : 'Auction Watch';

              // Format auction date for prompt
              const auctionDate = new Date(event.date);
              const dateStr = auctionDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });

              // Create article with Unsplash image
              const { error: insertError } = await supabase.from('articles').insert({
                neighborhood_id: finalNeighborhoodId,
                headline: story.headline,
                body_text: story.body,
                preview_text: story.previewText,
                image_url: await getCronImage('auction', supabase, { neighborhoodId: finalNeighborhoodId }),
                slug,
                status: 'published',
                published_at: new Date().toISOString(),
                author_type: 'ai',
                ai_model: 'gemini-2.5-flash',
                ai_prompt: `Global Auction: ${event.house} ${event.title} @ ${event.location} (${dateStr})`,
                category_label: categoryLabel,
                enriched_at: new Date().toISOString(),
                enrichment_model: 'gemini-2.5-flash',
              });

              if (insertError) {
                results.errors.push(
                  `${event.eventId}/${neighborhoodId}: ${insertError.message}`
                );
                continue;
              }

              results.articles_created++;
              results.neighborhoods_syndicated++;
            } catch (err) {
              results.errors.push(
                `${event.eventId}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
              );
            }
          }

          // Rate limiting between events
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (err) {
          results.errors.push(
            `${event.eventId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Global Auction Calendar Sync: ${results.stories_generated} stories, ${results.articles_created} articles across ${results.neighborhoods_syndicated} neighborhood slots`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Global auction calendar sync failed:', error);

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
