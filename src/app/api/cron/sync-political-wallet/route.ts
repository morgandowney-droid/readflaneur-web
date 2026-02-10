/**
 * Political Wallet Sync Cron Job
 *
 * Aggregates political contribution data to show residents
 * "Who the neighborhood is betting on."
 *
 * Strategy: "Follow the Money"
 * - Power Donors only ($1,000+)
 * - Aggregate trends, never individual names
 * - $10k threshold triggers story generation
 *
 * Data Sources:
 * - US: FEC API (Federal Election Commission)
 * - UK: Electoral Commission API
 *
 * Schedule: Weekly on Tuesdays at 7 AM UTC
 * Vercel Cron: 0 7 * * 2
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processPoliticalWallet,
  createSampleTrends,
  generatePoliticalStory,
  PoliticalStory,
  NEIGHBORHOOD_ZIPS,
  POWER_DONOR_THRESHOLD,
  STORY_TRIGGER_THRESHOLD,
} from '@/lib/political-wallet';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for API calls

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
  const testNeighborhood = url.searchParams.get('neighborhood');
  const testRegion = url.searchParams.get('region');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    neighborhoods_scanned: 0,
    donations_found: 0,
    trends_analyzed: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_region: {} as Record<string, number>,
    by_party: {} as Record<string, number>,
    total_neighborhoods: Object.keys(NEIGHBORHOOD_ZIPS).length,
    thresholds: {
      power_donor: POWER_DONOR_THRESHOLD,
      story_trigger: STORY_TRIGGER_THRESHOLD,
    },
    errors: [] as string[],
  };

  try {
    let stories: PoliticalStory[];

    if (useSampleData) {
      console.log('Using sample political wallet data for testing');
      const sampleTrends = createSampleTrends();
      stories = [];

      for (const trend of sampleTrends) {
        const story = await generatePoliticalStory(trend);
        if (story) stories.push(story);
      }

      results.trends_analyzed = sampleTrends.length;
      results.donations_found = sampleTrends.reduce((sum, t) => sum + t.donorCount, 0);
      results.by_region['sample'] = sampleTrends.length;
    } else {
      console.log('Processing political wallet data from APIs');

      // Run the full pipeline
      const processResult = await processPoliticalWallet();

      results.neighborhoods_scanned = processResult.neighborhoodsScanned;
      results.donations_found = processResult.donationsFound;
      results.trends_analyzed = processResult.trendsAnalyzed;
      results.stories_generated = processResult.storiesGenerated;
      results.by_region = processResult.byRegion;
      results.by_party = processResult.byParty;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by neighborhood if specified
    if (testNeighborhood) {
      stories = stories.filter((s) =>
        s.trend.neighborhoodId.toLowerCase().includes(testNeighborhood.toLowerCase())
      );
    }

    // Filter by region if specified
    if (testRegion) {
      const regionNeighborhoods = Object.entries(NEIGHBORHOOD_ZIPS)
        .filter(([, config]) => config.region === testRegion.toUpperCase())
        .map(([id]) => id);
      stories = stories.filter((s) => regionNeighborhoods.includes(s.trend.neighborhoodId));
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No political wallet stories generated');
      return NextResponse.json({
        success: true,
        message: 'No significant donation trends found',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for political wallet (reused across all stories)
    const cachedImageUrl = await getCronImage('political-wallet', supabase);

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const cleanRecipient = story.topRecipient.recipientName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 30);
          const dateStr = new Date().toISOString().split('T')[0];
          const slug = `donor-watch-${cleanRecipient}-${dateStr}-${neighborhoodId}`;

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
            ai_prompt: `Political Wallet: ${story.trend.neighborhoodName} - ${story.topRecipient.recipientName} ($${story.topRecipient.totalAmount.toLocaleString()})`,
            category_label: story.categoryLabel,
          });

          if (insertError) {
            results.errors.push(`${story.trend.neighborhoodName}/${neighborhoodId}: ${insertError.message}`);
            continue;
          }

          results.articles_created++;
        } catch (err) {
          results.errors.push(
            `${story.trend.neighborhoodName}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Political Wallet: ${results.donations_found} donations, ${results.trends_analyzed} trends, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Political wallet sync failed:', error);

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
