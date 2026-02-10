/**
 * NIMBY Alert Sync Cron Job
 *
 * Scrapes Community Board / Council Meeting agendas to alert residents
 * about controversial upcoming votes (liquor licenses, zoning changes, etc.)
 *
 * Strategy: "The Early Warning System"
 * - Controversy keywords in government PDFs
 * - Geofenced to Flâneur neighborhoods
 * - Informative, civic-engagement tone
 *
 * Data Sources:
 * - NYC Community Boards (CB 1-8 Manhattan, CB 1-6 Brooklyn)
 * - London Borough Councils (Westminster, Kensington & Chelsea, Camden)
 * - Sydney Councils (Woollahra, City of Sydney)
 *
 * Schedule: Weekly on Mondays at 6 AM UTC
 * Vercel Cron: 0 6 * * 1
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processNimbyAlerts,
  createSampleAlerts,
  generateNimbyStory,
  NimbyStory,
  COMMUNITY_BOARDS,
} from '@/lib/nimby-alert';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for scraping multiple boards

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
  const testCity = url.searchParams.get('city');
  const testCategory = url.searchParams.get('category');
  const testBoard = url.searchParams.get('board');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    boards_scraped: 0,
    agendas_found: 0,
    controversies_detected: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_city: {} as Record<string, number>,
    by_category: {} as Record<string, number>,
    total_boards: COMMUNITY_BOARDS.length,
    errors: [] as string[],
  };

  try {
    let stories: NimbyStory[];

    if (useSampleData) {
      console.log('Using sample NIMBY alert data for testing');
      const sampleAlerts = createSampleAlerts();
      stories = [];

      for (const alert of sampleAlerts) {
        const story = await generateNimbyStory(alert);
        if (story) stories.push(story);
      }

      results.controversies_detected = sampleAlerts.reduce((sum, a) => sum + a.items.length, 0);
      results.by_city['sample'] = sampleAlerts.length;
    } else {
      console.log('Processing NIMBY alerts from community boards');

      // Run the full pipeline
      const processResult = await processNimbyAlerts();

      results.boards_scraped = processResult.boardsScraped;
      results.agendas_found = processResult.agendasFound;
      results.controversies_detected = processResult.controversiesDetected;
      results.stories_generated = processResult.storiesGenerated;
      results.by_city = processResult.byCity;
      results.by_category = processResult.byCategory;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by city if specified
    if (testCity) {
      const normalizedCity = testCity.replace(/-/g, '_');
      stories = stories.filter(
        (s) => s.alert.board.city.toLowerCase() === normalizedCity.toLowerCase()
      );
    }

    // Filter by category if specified
    if (testCategory) {
      stories = stories.filter((s) =>
        s.alert.items.some((item) => item.category === testCategory)
      );
    }

    // Filter by board if specified
    if (testBoard) {
      stories = stories.filter((s) =>
        s.alert.board.id.toLowerCase().includes(testBoard.toLowerCase())
      );
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No NIMBY alert stories generated');
      return NextResponse.json({
        success: true,
        message: 'No controversial agenda items found',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for NIMBY alerts (reused across all stories)
    const cachedImageUrl = await getCronImage('nimby-alert', supabase);

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const cleanBoard = story.alert.board.id
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 20);
          const dateStr = story.alert.meeting.meetingDate.toISOString().split('T')[0];
          const primaryCategory = story.alert.items[0]?.category || 'civic';
          const slug = `nimby-alert-${cleanBoard}-${primaryCategory}-${dateStr}-${neighborhoodId}`;

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
            ai_prompt: `NIMBY Alert: ${story.alert.board.name} - ${story.alert.meeting.meetingType} (${story.alert.meeting.meetingDate.toLocaleDateString()})`,
            category_label: story.categoryLabel,
          });

          if (insertError) {
            results.errors.push(`${story.alert.board.name}/${neighborhoodId}: ${insertError.message}`);
            continue;
          }

          results.articles_created++;
        } catch (err) {
          results.errors.push(
            `${story.alert.board.name}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `NIMBY Alerts: ${results.controversies_detected} items detected, ${results.stories_generated} stories, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('NIMBY alert sync failed:', error);

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
