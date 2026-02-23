/**
 * Review Watch Sync Cron Job
 *
 * Monitors major food publications for new restaurant reviews in Flâneur neighborhoods.
 * We are curators - only positive/notable reviews are surfaced.
 *
 * Data Sources:
 * - NYT Dining/Pete Wells (NYC)
 * - The Infatuation (Global)
 * - Eater (City-Specific)
 * - The Guardian (London)
 * - Time Out (NYC, London)
 *
 * Matching Logic:
 * 1. Parse RSS feeds for new reviews
 * 2. Extract restaurant name and match to neighborhood
 * 3. Filter for positive reviews (Critic's Pick, score > 8.0, etc.)
 * 4. Generate "Validation" tone story via Gemini
 *
 * Schedule: Every 4 hours (matches news cycle)
 * Vercel Cron: 0 2,6,10,14,18,22 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processReviewWatch,
  createSampleReviews,
  generateReviewStory,
  ReviewStory,
  REVIEW_SOURCES,
  CITY_NEIGHBORHOODS,
} from '@/lib/review-watch';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for RSS parsing and story generation

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
  const testSource = url.searchParams.get('source');
  const testCity = url.searchParams.get('city');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    feeds_checked: 0,
    reviews_detected: 0,
    reviews_matched: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_source: {} as Record<string, number>,
    by_city: {} as Record<string, number>,
    total_sources: REVIEW_SOURCES.length,
    errors: [] as string[],
  };

  try {
    let stories: ReviewStory[];

    if (useSampleData) {
      console.log('Using sample review data for testing');
      const sampleReviews = createSampleReviews();
      stories = [];

      for (const review of sampleReviews) {
        const story = await generateReviewStory(review);
        if (story) stories.push(story);
      }

      results.reviews_detected = sampleReviews.length;
      results.reviews_matched = sampleReviews.length;
      results.by_source['sample'] = sampleReviews.length;
    } else {
      console.log('Processing review feeds');

      // Run the full pipeline
      const processResult = await processReviewWatch();

      results.feeds_checked = processResult.feedsChecked;
      results.reviews_detected = processResult.reviewsDetected;
      results.reviews_matched = processResult.reviewsMatched;
      results.stories_generated = processResult.storiesGenerated;
      results.by_source = processResult.bySource;
      results.by_city = processResult.byCity;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by source if specified
    if (testSource) {
      stories = stories.filter(
        (s) => s.review.source.toLowerCase().includes(testSource.toLowerCase())
      );
    }

    // Filter by city if specified
    if (testCity) {
      const normalizedCity = testCity.replace(/-/g, '_');
      stories = stories.filter(
        (s) => s.review.city.toLowerCase() === normalizedCity.toLowerCase()
      );
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No review stories generated');
      return NextResponse.json({
        success: true,
        message: 'No new restaurant reviews found in Flâneur neighborhoods',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const cleanRestaurant = story.review.restaurantName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 30);
          const cleanSource = story.review.source
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-');
          const dateStr = new Date().toISOString().split('T')[0];
          const slug = `review-${cleanSource}-${cleanRestaurant}-${dateStr}-${neighborhoodId}`;

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

          // Create article with Unsplash image
          const { error: insertError } = await supabase.from('articles').insert({
            neighborhood_id: finalNeighborhoodId,
            headline: story.headline,
            body_text: story.body,
            preview_text: story.previewText,
            image_url: await getCronImage('review-watch', supabase, { neighborhoodId: finalNeighborhoodId }),
            slug,
            status: 'published',
            published_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: 'gemini-2.5-flash',
            ai_prompt: `Review Watch: ${story.review.sourceDisplayName} reviews ${story.review.restaurantName}`,
            category_label: story.categoryLabel,
            enriched_at: new Date().toISOString(),
            enrichment_model: 'gemini-2.5-flash',
          });

          if (insertError) {
            results.errors.push(`${story.review.restaurantName}/${neighborhoodId}: ${insertError.message}`);
            continue;
          }

          results.articles_created++;
        } catch (err) {
          results.errors.push(
            `${story.review.restaurantName}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Review Watch: ${results.reviews_matched} reviews matched, ${results.stories_generated} stories, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Review watch sync failed:', error);

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
