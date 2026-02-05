/**
 * Art Fair Sync Cron Job
 *
 * Checks the static art fair calendar and generates special coverage
 * during Preview (7 days before) and Live (during) states.
 *
 * Live coverage is marked as Hero priority and pins to the top of feeds.
 *
 * Schedule: Daily at 8 AM UTC
 * Vercel Cron: 0 8 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processActiveFairs,
  distributeFairStory,
  createSampleActiveFair,
  FairStory,
} from '@/lib/art-fairs';
import { FairState, getActiveFairs } from '@/config/art-fairs';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes should be plenty

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
  const sampleState = (url.searchParams.get('state') as FairState) || 'Live';
  const testNeighborhood = url.searchParams.get('neighborhood');
  const testFairId = url.searchParams.get('fair');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    active_fairs: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    hero_articles: 0,
    neighborhoods_syndicated: 0,
    by_state: {
      Preview: 0,
      Live: 0,
      Wrap: 0,
      Dormant: 0,
    } as Record<FairState, number>,
    by_fair: {} as Record<string, string>, // fair name -> state
    errors: [] as string[],
  };

  try {
    let stories: FairStory[];

    if (useSampleData) {
      console.log(`Using sample fair data for testing (state: ${sampleState})`);
      // Generate a sample story directly
      const sampleFairs = createSampleActiveFair(sampleState);
      if (sampleFairs.length > 0) {
        const { fair, state, dates } = sampleFairs[0];
        const { generateFairStory } = await import('@/lib/art-fairs');
        const story = await generateFairStory(fair, state, {
          start: dates.start,
          end: dates.end,
        });
        stories = story ? [story] : [];
        results.by_fair[fair.name] = state;
        results.by_state[state]++;
      } else {
        stories = [];
      }
    } else {
      // Check for active fairs
      const currentDate = new Date();
      const activeFairsData = getActiveFairs(currentDate);

      results.active_fairs = activeFairsData.length;

      if (activeFairsData.length === 0) {
        console.log('No active art fairs at this time');
        return NextResponse.json({
          success: true,
          message: 'No active art fairs at this time',
          ...results,
          timestamp: new Date().toISOString(),
        });
      }

      // Filter by specific fair if testing
      let fairsToProcess = activeFairsData;
      if (testFairId) {
        fairsToProcess = activeFairsData.filter((af) => af.fair.id === testFairId);
      }

      // Log active fairs
      for (const { fair, state } of fairsToProcess) {
        console.log(`Active fair: ${fair.name} (${state})`);
        results.by_fair[fair.name] = state;
        results.by_state[state]++;
      }

      // Process active fairs
      const processResult = await processActiveFairs(currentDate);
      stories = processResult.stories;
      results.errors.push(...processResult.errors);
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No stories generated');
      return NextResponse.json({
        success: true,
        message: 'No stories generated for active fairs',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for art fairs (reused across all stories)
    const cachedImageUrl = await getCronImage('art-fair', supabase);

    // Distribute stories to target feeds
    for (const story of stories) {
      try {
        const distributions = distributeFairStory(story);

        // Filter by test neighborhood if specified
        let targetDistributions = distributions;
        if (testNeighborhood) {
          targetDistributions = distributions.filter(
            (d) => d.neighborhoodId === testNeighborhood
          );
        }

        for (const { neighborhoodId, slug } of targetDistributions) {
          try {
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
              // Try with common prefixes
              const prefixes = ['nyc-', 'london-', 'paris-', 'la-', 'miami-', 'hong-kong-'];
              let found = false;

              for (const prefix of prefixes) {
                const prefixedId = `${prefix}${neighborhoodId}`;
                const { data: prefixedNeighborhood } = await supabase
                  .from('neighborhoods')
                  .select('id')
                  .eq('id', prefixedId)
                  .single();

                if (prefixedNeighborhood) {
                  finalNeighborhoodId = prefixedId;
                  found = true;
                  break;
                }
              }

              if (!found) {
                // Skip if neighborhood doesn't exist
                continue;
              }
            }

            // Determine category label based on state
            let categoryLabel: string;
            switch (story.state) {
              case 'Live':
                categoryLabel = 'Art Fair: Live Coverage';
                break;
              case 'Preview':
                categoryLabel = 'Art Fair: VIP Preview';
                break;
              case 'Wrap':
                categoryLabel = 'Art Fair: Highlights';
                break;
              default:
                categoryLabel = 'Art Fair';
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
              ai_prompt: `Art Fair: ${story.fairName} (${story.state})`,
              category_label: categoryLabel,
              // Mark Hero priority for Live coverage
              ...(story.priority === 'Hero' && { is_pinned: true }),
            });

            if (insertError) {
              results.errors.push(
                `${story.fairId}/${neighborhoodId}: ${insertError.message}`
              );
              continue;
            }

            results.articles_created++;
            results.neighborhoods_syndicated++;

            if (story.priority === 'Hero') {
              results.hero_articles++;
            }
          } catch (err) {
            results.errors.push(
              `${story.fairId}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      } catch (err) {
        results.errors.push(
          `${story.fairId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(
      `Art Fair Sync: ${results.stories_generated} stories, ${results.articles_created} articles (${results.hero_articles} Hero)`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Art fair sync failed:', error);

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
