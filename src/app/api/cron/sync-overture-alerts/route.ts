/**
 * Overture Alert Sync Cron Job
 *
 * Monitors Opera, Ballet, and Symphony calendars for Opening Nights
 * and Premieres at Tier 1 performance venues.
 *
 * Strategy: "The Premiere Filter"
 * - Filter for: Opening Night, New Production, Premiere, Gala
 * - Optional Star Power detection for notable conductors/performers
 * - Trigger stories 48h before performance
 *
 * Schedule: Daily at 10 AM UTC
 * Vercel Cron: 0 10 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processOvertureAlerts,
  createSamplePerformances,
  generateOvertureStory,
  OvertureStory,
  PERFORMANCE_HUBS,
  PerformanceCity,
  PerformanceType,
} from '@/lib/overture-alert';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for multiple venue scraping

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
  const hoursAhead = parseInt(url.searchParams.get('hours') || '48', 10);
  const useSampleData = url.searchParams.get('sample') === 'true';
  const testCity = url.searchParams.get('city') as PerformanceCity | null;
  const testVenue = url.searchParams.get('venue');
  const testType = url.searchParams.get('type') as PerformanceType | null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    venues_scanned: 0,
    performances_found: 0,
    premieres_detected: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_city: {} as Record<string, number>,
    by_type: {} as Record<string, number>,
    by_premiere_type: {} as Record<string, number>,
    total_venues: PERFORMANCE_HUBS.length,
    errors: [] as string[],
  };

  try {
    let stories: OvertureStory[];

    if (useSampleData) {
      console.log('Using sample performance data for testing');
      const samplePerformances = createSamplePerformances();
      stories = [];

      for (const { performance, venue } of samplePerformances) {
        // Filter by city if specified
        if (testCity && venue.city !== testCity) {
          continue;
        }

        // Filter by venue if specified
        if (testVenue && venue.id !== testVenue) {
          continue;
        }

        // Filter by type if specified
        if (testType && performance.performanceType !== testType) {
          continue;
        }

        const story = await generateOvertureStory(performance, venue);
        if (story) {
          stories.push(story);
          results.by_premiere_type[story.premiereType] =
            (results.by_premiere_type[story.premiereType] || 0) + 1;
        }
      }

      results.venues_scanned = samplePerformances.length;
      results.performances_found = samplePerformances.length;
      results.premieres_detected = samplePerformances.length;
    } else {
      console.log(`Processing overture alerts for next ${hoursAhead} hours`);

      // Run the full pipeline
      const processResult = await processOvertureAlerts(hoursAhead);

      results.venues_scanned = processResult.venuesScanned;
      results.performances_found = processResult.performancesFound;
      results.premieres_detected = processResult.premieresDetected;
      results.stories_generated = processResult.storiesGenerated;
      results.by_city = processResult.byCity as Record<string, number>;
      results.by_type = processResult.byType as Record<string, number>;
      results.by_premiere_type = processResult.byPremiereType;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by city if specified
    if (testCity) {
      stories = stories.filter((s) => s.city === testCity);
    }

    // Filter by type if specified
    if (testType) {
      stories = stories.filter((s) => s.performanceType === testType);
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No overture stories generated');
      return NextResponse.json({
        success: true,
        message: 'No opening nights or premieres in the next 48 hours',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const cleanTitle = story.title
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 25);
          const cleanVenue = story.venueId;
          const dateStr = story.performanceDate;
          const slug = `overture-${cleanVenue}-${cleanTitle}-${dateStr}-${neighborhoodId}`;

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
            // Try with common city prefixes
            const cityPrefixes: Record<PerformanceCity, string> = {
              New_York: 'nyc-',
              London: 'london-',
              Paris: 'paris-',
              Milan: 'milan-',
              Sydney: 'sydney-',
            };

            const prefix = cityPrefixes[story.city];
            const prefixedId = prefix ? `${prefix}${neighborhoodId}` : neighborhoodId;

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

          // Create article with cached image
          const { error: insertError } = await supabase.from('articles').insert({
            neighborhood_id: finalNeighborhoodId,
            headline: story.headline,
            body_text: story.body,
            preview_text: story.previewText,
            image_url: await getCronImage('overture-alert', supabase, { neighborhoodId: finalNeighborhoodId }),
            slug,
            status: 'published',
            published_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: 'gemini-2.5-flash',
            ai_prompt: `Overture Alert: ${story.title} at ${story.venueName} (${story.premiereType})`,
            category_label: story.categoryLabel,
            enriched_at: new Date().toISOString(),
            enrichment_model: 'gemini-2.5-flash',
          });

          if (insertError) {
            results.errors.push(
              `${story.title}/${neighborhoodId}: ${insertError.message}`
            );
            continue;
          }

          results.articles_created++;
        } catch (err) {
          results.errors.push(
            `${story.title}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Overture Alert: ${results.premieres_detected} premieres, ${results.stories_generated} stories, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Overture alert sync failed:', error);

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
