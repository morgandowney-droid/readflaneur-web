/**
 * Museum Watch Sync Cron Job
 *
 * Monitors Tier 1 Global Museums for "Blockbuster" exhibition openings
 * and Member Preview alerts.
 *
 * Strategy:
 * - Weekly scrape of museum calendars
 * - Filter for blockbuster shows (Retrospective, Major, Survey)
 * - Trigger stories 48h before Member Preview or Public Opening
 *
 * Schedule: Weekly on Mondays at 7 AM UTC
 * Vercel Cron: 0 7 * * 1
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processMuseumWatch,
  createSampleExhibitions,
  generateExhibitionStory,
  ExhibitionStory,
  MUSEUM_TARGETS,
  HubCity,
} from '@/lib/museum-watch';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for multiple museum scraping

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
  const daysAhead = parseInt(url.searchParams.get('days') || '7', 10);
  const useSampleData = url.searchParams.get('sample') === 'true';
  const testCity = url.searchParams.get('city') as HubCity | null;
  const testMuseum = url.searchParams.get('museum');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    museums_scanned: 0,
    exhibitions_found: 0,
    blockbusters_detected: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_city: {} as Record<string, number>,
    by_museum: {} as Record<string, number>,
    by_trigger_type: {
      member_preview: 0,
      public_opening: 0,
    } as Record<string, number>,
    total_museums: MUSEUM_TARGETS.length,
    errors: [] as string[],
  };

  try {
    let stories: ExhibitionStory[];

    if (useSampleData) {
      console.log('Using sample museum exhibition data for testing');
      const sampleExhibitions = createSampleExhibitions();
      stories = [];

      for (const { exhibition, museum } of sampleExhibitions) {
        // Filter by city if specified
        if (testCity && museum.city !== testCity) {
          continue;
        }

        // Filter by museum if specified
        if (testMuseum && museum.id !== testMuseum) {
          continue;
        }

        const story = await generateExhibitionStory(exhibition, museum);
        if (story) {
          stories.push(story);
          results.by_trigger_type[story.triggerType]++;
        }
      }

      results.museums_scanned = sampleExhibitions.length;
      results.exhibitions_found = sampleExhibitions.length;
      results.blockbusters_detected = sampleExhibitions.length;
      results.by_museum['sample'] = sampleExhibitions.length;
    } else {
      console.log(`Processing museum watch for next ${daysAhead} days`);

      // Run the full pipeline
      const processResult = await processMuseumWatch(daysAhead);

      results.museums_scanned = processResult.museumsScanned;
      results.exhibitions_found = processResult.exhibitionsFound;
      results.blockbusters_detected = processResult.blockbustersDetected;
      results.stories_generated = processResult.storiesGenerated;
      results.by_city = processResult.byCity as Record<string, number>;
      results.by_museum = processResult.byMuseum;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;

      // Count by trigger type
      for (const story of stories) {
        results.by_trigger_type[story.triggerType]++;
      }
    }

    // Filter by city if specified
    if (testCity) {
      stories = stories.filter((s) => s.city === testCity);
    }

    // Filter by museum if specified
    if (testMuseum) {
      stories = stories.filter((s) => s.museumId === testMuseum);
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No museum exhibition stories generated');
      return NextResponse.json({
        success: true,
        message: 'No blockbuster exhibitions opening in the next 48 hours',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for museum watch (reused across all stories)
    const cachedImageUrl = await getCronImage('museum-watch', supabase);

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const cleanExhibit = story.exhibitionTitle
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 25);
          const cleanMuseum = story.museumId;
          const dateStr = new Date().toISOString().split('T')[0];
          const slug = `museum-${cleanMuseum}-${cleanExhibit}-${dateStr}-${neighborhoodId}`;

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
            const cityPrefixes: Record<HubCity, string> = {
              New_York: 'nyc-',
              London: 'london-',
              Paris: 'paris-',
              Tokyo: 'tokyo-',
              Los_Angeles: 'la-',
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
            image_url: cachedImageUrl, // Reuse cached category image
            slug,
            status: 'published',
            published_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: 'gemini-2.5-flash',
            ai_prompt: `Museum Watch: ${story.exhibitionTitle} at ${story.museumName} (${story.triggerType})`,
            category_label: story.categoryLabel,
          });

          if (insertError) {
            results.errors.push(
              `${story.exhibitionTitle}/${neighborhoodId}: ${insertError.message}`
            );
            continue;
          }

          results.articles_created++;
        } catch (err) {
          results.errors.push(
            `${story.exhibitionTitle}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Museum Watch: ${results.blockbusters_detected} blockbusters, ${results.stories_generated} stories, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Museum watch sync failed:', error);

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
