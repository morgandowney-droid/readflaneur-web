/**
 * Design Week Sync Cron Job
 *
 * Triggers coverage during Global Design Weeks (Salone del Mobile, LDF,
 * Design Miami, 3 Days of Design, etc.).
 *
 * Architecture: Static Calendar
 * - Design Weeks are fixed annual events
 * - Daily highlights focus on different neighborhoods/hubs
 * - Live coverage gets Hero priority
 *
 * Schedule: Daily at 6 AM UTC
 * Vercel Cron: 0 6 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processDesignWeek,
  createSampleDesignEvent,
  generateDesignStory,
  getActiveDesignEvents,
  DesignStory,
  DESIGN_EVENTS,
  DesignCity,
  EventState,
} from '@/lib/design-week';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 180; // 3 minutes

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
  const sampleState = (url.searchParams.get('state') as EventState) || 'Live';
  const testCity = url.searchParams.get('city') as DesignCity | null;
  const testEvent = url.searchParams.get('event');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    active_events: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    hero_articles: 0,
    by_city: {} as Record<string, number>,
    by_state: {} as Record<string, number>,
    total_events: DESIGN_EVENTS.length,
    errors: [] as string[],
  };

  try {
    let stories: DesignStory[];

    if (useSampleData) {
      console.log(`Using sample design week data for testing (state: ${sampleState})`);
      const sampleEvents = createSampleDesignEvent(sampleState);

      if (sampleEvents.length > 0) {
        const { event, state, dayOfEvent, todaysFocus } = sampleEvents[0];
        const story = await generateDesignStory(event, state, dayOfEvent, todaysFocus);
        stories = story ? [story] : [];
        results.active_events = 1;
        results.by_state[state] = 1;
        results.by_city[event.city] = 1;
      } else {
        stories = [];
      }
    } else {
      console.log('Processing active design weeks');

      // Check for active events first
      const activeEvents = getActiveDesignEvents();
      results.active_events = activeEvents.length;

      if (activeEvents.length === 0) {
        console.log('No active design weeks at this time');
        return NextResponse.json({
          success: true,
          message: 'No active design weeks at this time',
          ...results,
          timestamp: new Date().toISOString(),
        });
      }

      // Log active events
      for (const { event, state, dayOfEvent, todaysFocus } of activeEvents) {
        console.log(
          `Active: ${event.name} (${state})${dayOfEvent ? ` - Day ${dayOfEvent}` : ''}${todaysFocus ? ` - ${todaysFocus.name}` : ''}`
        );
      }

      // Run the full pipeline
      const processResult = await processDesignWeek();

      results.stories_generated = processResult.storiesGenerated;
      results.by_city = processResult.byCity as Record<string, number>;
      results.by_state = processResult.byState as Record<string, number>;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by city if specified
    if (testCity) {
      stories = stories.filter((s) => s.city === testCity);
    }

    // Filter by event if specified
    if (testEvent) {
      stories = stories.filter((s) => s.eventId === testEvent);
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No design week stories generated');
      return NextResponse.json({
        success: true,
        message: 'No design week stories generated',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for design week (reused across all stories)
    const cachedImageUrl = await getCronImage('design-week', supabase);

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const cleanEvent = story.eventId;
          const dateStr = new Date().toISOString().split('T')[0];
          const dayStr = story.dayOfEvent ? `-day${story.dayOfEvent}` : '';
          const slug = `design-${cleanEvent}${dayStr}-${dateStr}-${neighborhoodId}`;

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
            const cityPrefixes: Record<DesignCity, string> = {
              Milan: 'milan-',
              London: 'london-',
              Miami: 'miami-',
              Copenhagen: 'copenhagen-',
              Stockholm: 'stockholm-',
              New_York: 'nyc-',
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
            ai_model: 'gemini-2.0-flash',
            ai_prompt: `Design Week: ${story.eventName} (${story.state})${story.dailyFocus ? ` - ${story.dailyFocus}` : ''}`,
            category_label: story.categoryLabel,
            // Mark Hero priority for Live coverage
            ...(story.priority === 'Hero' && { is_pinned: true }),
          });

          if (insertError) {
            results.errors.push(
              `${story.eventId}/${neighborhoodId}: ${insertError.message}`
            );
            continue;
          }

          results.articles_created++;

          if (story.priority === 'Hero') {
            results.hero_articles++;
          }
        } catch (err) {
          results.errors.push(
            `${story.eventId}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Design Week: ${results.active_events} active events, ${results.stories_generated} stories, ${results.articles_created} articles (${results.hero_articles} Hero)`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Design week sync failed:', error);

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
