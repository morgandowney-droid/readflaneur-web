/**
 * Specialty Auction Sync Cron Job
 *
 * Dual-engine service for Tier 2 and Tier 3 auction markets:
 *
 * 1. TIER 2 - National Champions: Direct scraping of regional auction houses
 *    (Bukowskis, Bruun Rasmussen, Dorotheum, Finarte, SBI Art, etc.)
 *
 * 2. TIER 3 - Vacation Mappings: Filters Tier 1 global events for vacation feeds
 *    (St. Barts, Aspen, Hamptons, Sylt, Marbella, etc.)
 *
 * Schedule: Weekly on Sundays at 9 PM UTC (before global auction sync at 10 PM)
 * Vercel Cron: 0 21 * * 0
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processSpecialtyAuctions,
  generateNationalChampionStory,
  generateVacationMappedStory,
  createSampleSpecialtyEvents,
  SpecialtyAuctionStory,
  REGIONAL_TARGETS,
  VACATION_MAPPINGS,
} from '@/lib/specialty-auctions';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for multiple house scraping

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
  const testRegion = url.searchParams.get('region');
  const testVacation = url.searchParams.get('vacation');
  const modeFilter = url.searchParams.get('mode') as 'national' | 'vacation' | null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    regional_events_found: 0,
    vacation_events_found: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_region: {} as Record<string, number>,
    by_vacation: {} as Record<string, number>,
    by_mode: {
      national: 0,
      vacation: 0,
    },
    houses_scraped: REGIONAL_TARGETS.length,
    vacation_markets: VACATION_MAPPINGS.length,
    errors: [] as string[],
  };

  try {
    let stories: SpecialtyAuctionStory[];

    if (useSampleData) {
      console.log('Using sample specialty auction data for testing');
      const { regional, vacation } = createSampleSpecialtyEvents();

      stories = [];

      // Generate sample regional story
      if (!modeFilter || modeFilter === 'national') {
        for (const event of regional) {
          const story = await generateNationalChampionStory(event);
          if (story) stories.push(story);
        }
      }

      // Generate sample vacation story
      if (!modeFilter || modeFilter === 'vacation') {
        for (const event of vacation) {
          const story = await generateVacationMappedStory(event);
          if (story) stories.push(story);
        }
      }

      results.regional_events_found = regional.length;
      results.vacation_events_found = vacation.length;
      results.by_region['sample'] = regional.length;
      results.by_vacation['sample'] = vacation.length;
    } else {
      console.log(`Processing specialty auctions for next ${daysAhead} days`);

      // Run the full pipeline
      const processResult = await processSpecialtyAuctions(daysAhead);

      results.regional_events_found = processResult.regionalEventsFound;
      results.vacation_events_found = processResult.vacationEventsFound;
      results.stories_generated = processResult.storiesGenerated;
      results.by_region = processResult.byRegion;
      results.by_vacation = processResult.byVacation;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by mode if specified
    if (modeFilter) {
      stories = stories.filter((s) => s.mode === modeFilter);
    }

    // Filter by region if specified
    if (testRegion) {
      stories = stories.filter(
        (s) => s.mode === 'national' && s.city.toLowerCase().includes(testRegion.toLowerCase())
      );
    }

    // Filter by vacation destination if specified
    if (testVacation) {
      stories = stories.filter(
        (s) => s.mode === 'vacation' && s.city.toLowerCase().includes(testVacation.toLowerCase())
      );
    }

    // Count by mode
    for (const story of stories) {
      results.by_mode[story.mode]++;
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No specialty auction stories generated');
      return NextResponse.json({
        success: true,
        message: 'No specialty auction events found for the period',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const modePrefix = story.mode === 'national' ? 'local-gavel' : 'market-watch';
          const cleanHouse = story.house.toLowerCase().replace(/[^a-z0-9]/g, '-');
          const cleanTitle = story.title.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20);
          const slug = `${modePrefix}-${cleanHouse}-${cleanTitle}-${neighborhoodId}`;

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
            // Try common prefixes
            const prefixes = [
              'stockholm-',
              'copenhagen-',
              'berlin-',
              'milan-',
              'tokyo-',
              'sydney-',
              'toronto-',
              'chicago-',
              'sf-',
              '',
            ];

            let found = false;
            for (const prefix of prefixes) {
              const tryId = prefix
                ? neighborhoodId.replace(/^[a-z]+-/, prefix)
                : neighborhoodId.split('-').pop();

              if (tryId) {
                const { data: prefixedNeighborhood } = await supabase
                  .from('neighborhoods')
                  .select('id')
                  .eq('id', tryId)
                  .single();

                if (prefixedNeighborhood) {
                  finalNeighborhoodId = tryId;
                  found = true;
                  break;
                }
              }
            }

            if (!found) {
              // Skip if neighborhood doesn't exist
              continue;
            }
          }

          // Determine category label
          let categoryLabel: string;
          if (story.mode === 'national') {
            categoryLabel = story.tier === 'Mega' ? 'Auction: Local Gavel' : 'Auction Watch';
          } else {
            categoryLabel = 'Market Watch';
          }

          // Format auction date
          const auctionDate = new Date(story.generatedAt);
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
            ai_prompt: `Specialty Auction (${story.mode}): ${story.house} - ${story.title}`,
            category_label: categoryLabel,
            enriched_at: new Date().toISOString(),
            enrichment_model: 'gemini-2.5-flash',
          });

          if (insertError) {
            results.errors.push(`${story.house}/${neighborhoodId}: ${insertError.message}`);
            continue;
          }

          results.articles_created++;
        } catch (err) {
          results.errors.push(
            `${story.house}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Specialty Auctions: ${results.stories_generated} stories, ${results.articles_created} articles (National: ${results.by_mode.national}, Vacation: ${results.by_mode.vacation})`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Specialty auction sync failed:', error);

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
