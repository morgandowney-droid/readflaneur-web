/**
 * Residency Radar Sync Cron Job
 *
 * Scrapes hospitality news to find "Seasonal Pop-ups" of major
 * luxury brands in vacation hotspots.
 *
 * Strategy: "Brand Migration"
 * - Luxury brands migrate with the seasons
 * - Winter: St. Moritz, Aspen, Courchevel
 * - Summer: Mykonos, St. Tropez, Hamptons
 * - Track when city brands open vacation outposts
 *
 * Data Sources:
 * - Eater Travel
 * - Robb Report
 * - WWD (Women's Wear Daily)
 * - Wallpaper*
 * - Departures
 *
 * Schedule: Weekly on Wednesdays at 8 AM UTC
 * Vercel Cron: 0 8 * * 3
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processResidencyRadar,
  createSampleAnnouncements,
  generateResidencyStory,
  ResidencyStory,
  SEASONAL_HOTSPOTS,
  MIGRATING_BRANDS,
  getCurrentSeason,
  getInSeasonHotspots,
} from '@/lib/residency-radar';
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
  const testLocation = url.searchParams.get('location');
  const testBrand = url.searchParams.get('brand');
  const testSeason = url.searchParams.get('season');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const currentSeason = getCurrentSeason();
  const inSeasonHotspots = getInSeasonHotspots();

  const results = {
    sources_scraped: 0,
    announcements_found: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    current_season: currentSeason,
    in_season_hotspots: inSeasonHotspots.map((h) => h.name),
    by_category: {} as Record<string, number>,
    by_season: {} as Record<string, number>,
    by_location: {} as Record<string, number>,
    total_hotspots: SEASONAL_HOTSPOTS.length,
    total_brands: MIGRATING_BRANDS.length,
    errors: [] as string[],
  };

  try {
    let stories: ResidencyStory[];

    if (useSampleData) {
      console.log('Using sample residency radar data for testing');
      const sampleAnnouncements = createSampleAnnouncements();
      stories = [];

      for (const announcement of sampleAnnouncements) {
        const story = await generateResidencyStory(announcement);
        if (story) stories.push(story);
      }

      results.announcements_found = sampleAnnouncements.length;
      results.by_location['sample'] = sampleAnnouncements.length;
    } else {
      console.log('Processing residency radar news sources');

      // Run the full pipeline
      const processResult = await processResidencyRadar();

      results.sources_scraped = processResult.sourcesScraped;
      results.announcements_found = processResult.announcementsFound;
      results.stories_generated = processResult.storiesGenerated;
      results.by_category = processResult.byCategory;
      results.by_season = processResult.bySeason;
      results.by_location = processResult.byLocation;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by location if specified
    if (testLocation) {
      stories = stories.filter((s) =>
        s.announcement.location.name.toLowerCase().includes(testLocation.toLowerCase())
      );
    }

    // Filter by brand if specified
    if (testBrand) {
      stories = stories.filter((s) =>
        s.announcement.brand.name.toLowerCase().includes(testBrand.toLowerCase())
      );
    }

    // Filter by season if specified
    if (testSeason) {
      stories = stories.filter(
        (s) => s.season.toLowerCase() === testSeason.toLowerCase()
      );
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No residency radar stories generated');
      return NextResponse.json({
        success: true,
        message: 'No seasonal pop-ups found',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const cleanBrand = story.announcement.brand.name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 15);
          const cleanLocation = story.announcement.location.name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 15);
          const dateStr = new Date().toISOString().split('T')[0];
          const slug = `scene-watch-${cleanBrand}-${cleanLocation}-${dateStr}-${neighborhoodId}`;

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

          // Create article
          // Create article with cached image
          const { error: insertError } = await supabase.from('articles').insert({
            neighborhood_id: finalNeighborhoodId,
            headline: story.headline,
            body_text: story.body,
            preview_text: story.previewText,
            image_url: await getCronImage('residency-radar', supabase, { neighborhoodId: finalNeighborhoodId }),
            slug,
            status: 'published',
            published_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: 'gemini-2.5-flash',
            ai_prompt: `Scene Watch: ${story.announcement.brand.name} opens ${story.announcement.residencyType.replace(/_/g, ' ')} in ${story.announcement.location.name}`,
            category_label: story.categoryLabel,
            enriched_at: new Date().toISOString(),
            enrichment_model: 'gemini-2.5-flash',
          });

          if (insertError) {
            results.errors.push(
              `${story.announcement.brand.name}/${neighborhoodId}: ${insertError.message}`
            );
            continue;
          }

          results.articles_created++;
        } catch (err) {
          results.errors.push(
            `${story.announcement.brand.name}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Residency Radar: ${results.announcements_found} announcements, ${results.stories_generated} stories, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Residency radar sync failed:', error);

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
