/**
 * Auction Calendar Sync Cron Job
 *
 * Scrapes the Big Three auction houses (Sotheby's, Christie's, Phillips)
 * and generates stories syndicated to the entire Northeast Luxury Corridor.
 *
 * Schedule: Weekly on Sundays at 11 PM UTC (6 PM EST)
 * Vercel Cron: 0 23 * * 0
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchAllAuctionCalendars,
  generateAuctionStory,
  createSampleAuctionEvents,
  ALL_AUCTION_TARGET_NEIGHBORHOODS,
  AuctionEvent,
  AuctionHouse,
  AuctionTier,
} from '@/lib/nyc-auctions';
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
    console.log(`Fetching auction calendars for next ${daysAhead} days`);

    // Fetch auctions (or use sample data for testing)
    let events: AuctionEvent[];

    if (useSampleData) {
      console.log('Using sample auction data for testing');
      events = createSampleAuctionEvents();
    } else {
      events = await fetchAllAuctionCalendars(daysAhead);
    }

    results.auctions_found = events.length;

    // Count by house and tier
    for (const event of events) {
      results.by_house[event.house]++;
      results.by_tier[event.tier]++;
    }

    if (events.length === 0) {
      console.log('No Blue Chip auctions found');
      return NextResponse.json({
        success: true,
        message: 'No Blue Chip auctions found for the period',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for auctions (reused across all stories)
    const cachedImageUrl = await getCronImage('auction', supabase);

    // Generate stories for top events (Mega first, then Standard)
    const megaEvents = events.filter((e) => e.tier === 'Mega').slice(0, 5);
    const standardEvents = events.filter((e) => e.tier === 'Standard').slice(0, 5);
    const topEvents = [...megaEvents, ...standardEvents];

    // Determine target neighborhoods
    let targetNeighborhoods: string[];
    if (testNeighborhood) {
      targetNeighborhoods = [testNeighborhood];
    } else {
      targetNeighborhoods = ALL_AUCTION_TARGET_NEIGHBORHOODS;
    }

    for (const event of topEvents) {
      try {
        // Generate story
        const story = await generateAuctionStory(event);
        if (!story) {
          results.errors.push(`${event.eventId}: Story generation returned null`);
          continue;
        }

        results.stories_generated++;

        // Create a base slug for this auction
        const cleanId = event.eventId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 30);
        const baseSlug = `auction-${cleanId}`;

        // Syndicate to all target neighborhoods
        for (const neighborhoodId of targetNeighborhoods) {
          try {
            // Create unique slug per neighborhood
            const slug = `${baseSlug}-${neighborhoodId}`;

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
              // Try with city prefix
              const prefixedId = neighborhoodId.includes('-')
                ? neighborhoodId
                : `nyc-${neighborhoodId}`;

              const { data: prefixedNeighborhood } = await supabase
                .from('neighborhoods')
                .select('id')
                .eq('id', prefixedId)
                .single();

              if (prefixedNeighborhood) {
                finalNeighborhoodId = prefixedId;
              } else {
                // Skip if neighborhood doesn't exist
                continue;
              }
            }

            // Determine category label based on tier
            const categoryLabel = event.tier === 'Mega'
              ? 'Auction: Marquee Sale'
              : 'Auction Watch';

            // Format auction date for prompt
            const auctionDate = new Date(event.date);
            const dateStr = auctionDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });

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
              ai_model: 'gemini-2.0-flash',
              ai_prompt: `Auction: ${event.house} ${event.title} (${dateStr})`,
              category_label: categoryLabel,
            });

            if (insertError) {
              results.errors.push(`${event.eventId}/${neighborhoodId}: ${insertError.message}`);
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

    console.log(
      `Auction Calendar Sync: ${results.stories_generated} stories, ${results.articles_created} articles across ${results.neighborhoods_syndicated} neighborhood slots`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Auction calendar sync failed:', error);

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
