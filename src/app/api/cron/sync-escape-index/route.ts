/**
 * Escape Index Sync Cron Job
 *
 * Injects "Vacation Conditions" (Snow, Surf, Weather) into feeder city feeds
 * to trigger travel decisions.
 *
 * Architecture: "The Feeder Map"
 * - Shows Aspen snow reports in New York (where the skiers are)
 * - Shows Byron Bay surf in Sydney (where the surfers are)
 * - Shows St. Barts weather in NYC/London (where the villa owners are)
 *
 * Data Sources:
 * - Open-Meteo API (Free): Snow, Weather, UV
 * - Open-Meteo Marine API (Free): Surf conditions
 *
 * Thresholds:
 * - Snow: >6 inches = Powder Day
 * - Surf: >4ft + >10s period = Firing
 * - Sun: >70°F + UV 5+ + 2+ good days = Perfect Weekend
 *
 * Schedule: Every 6 hours at :45 (7:45, 13:45, 19:45, 1:45 UTC)
 * Vercel Cron: 45 0/6 * * * (every 6 hours at :45)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processEscapeIndex,
  createSampleEscapeConditions,
  generateEscapeStory,
  EscapeStory,
  ESCAPE_ROUTES,
} from '@/lib/escape-index';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for multiple API calls

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
  const testType = url.searchParams.get('type') as 'snow' | 'surf' | 'sun' | null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    conditions_checked: 0,
    alerts_triggered: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_condition_type: {} as Record<string, number>,
    by_origin_city: {} as Record<string, number>,
    feeder_cities: Object.keys(ESCAPE_ROUTES).length,
    errors: [] as string[],
  };

  try {
    let stories: EscapeStory[];

    if (useSampleData) {
      console.log('Using sample escape conditions for testing');
      const sampleConditions = createSampleEscapeConditions();
      stories = [];

      // Generate stories for sample conditions
      for (const condition of sampleConditions) {
        // Find cities that target this destination
        for (const [cityName, config] of Object.entries(ESCAPE_ROUTES)) {
          if (config.targets.includes(condition.destination as any)) {
            const story = await generateEscapeStory(condition, cityName as any);
            if (story) stories.push(story);
          }
        }
      }

      results.conditions_checked = sampleConditions.length;
      results.alerts_triggered = sampleConditions.length;
      results.by_condition_type['sample'] = sampleConditions.length;
    } else {
      console.log('Processing escape index conditions');

      // Run the full pipeline
      const processResult = await processEscapeIndex();

      results.conditions_checked = processResult.conditionsChecked;
      results.alerts_triggered = processResult.alertsTriggered;
      results.stories_generated = processResult.storiesGenerated;
      results.by_condition_type = processResult.byConditionType;
      results.by_origin_city = processResult.byOriginCity;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by city if specified
    if (testCity) {
      const normalizedCity = testCity.replace(/-/g, '_');
      stories = stories.filter(
        (s) => s.originCity.toLowerCase() === normalizedCity.toLowerCase()
      );
    }

    // Filter by condition type if specified
    if (testType) {
      stories = stories.filter((s) => s.conditionType === testType);
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No escape stories generated (conditions may not meet thresholds)');
      return NextResponse.json({
        success: true,
        message: 'No escape alerts triggered (conditions below thresholds)',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for escape index (reused across all stories)
    const cachedImageUrl = await getCronImage('escape-index', supabase);

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const cleanDest = story.destination
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-');
          const cleanCity = story.originCity
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-');
          const dateStr = new Date().toISOString().split('T')[0];
          const slug = `escape-${story.conditionType}-${cleanDest}-${cleanCity}-${dateStr}-${neighborhoodId}`;

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
            ai_model: 'gemini-2.0-flash',
            ai_prompt: `Escape Index (${story.conditionType}): ${story.destination} for ${story.originCity}`,
            category_label: story.categoryLabel,
          });

          if (insertError) {
            results.errors.push(`${story.destination}/${neighborhoodId}: ${insertError.message}`);
            continue;
          }

          results.articles_created++;
        } catch (err) {
          results.errors.push(
            `${story.destination}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Escape Index: ${results.alerts_triggered} alerts, ${results.stories_generated} stories, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Escape index sync failed:', error);

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
