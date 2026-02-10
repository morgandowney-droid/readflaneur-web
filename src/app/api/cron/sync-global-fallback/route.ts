/**
 * Global Fallback Cron Job
 *
 * Ensures no neighborhood is ever empty by generating fallback content
 * for neighborhoods without custom adapter coverage.
 *
 * Runs after all other cron jobs and fills gaps with:
 * - Development Watch stories
 * - Lifestyle Watch stories
 * - Weather conditions (last resort)
 *
 * Schedule: Daily at 11 AM UTC (after all other services run)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getNeighborhoodsNeedingFallback,
  processFallbackForNeighborhood,
  getFallbackCoverageStats,
  FallbackStory,
} from '@/lib/global-fallback';
import { getCronImage } from '@/lib/cron-images';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

// Maximum fallback stories per run (to control costs)
const MAX_FALLBACK_PER_RUN = 10;

// Minimum hours since last article for a neighborhood to get fallback
const MIN_HOURS_SINCE_ARTICLE = 24;

interface ArticleInsert {
  neighborhood_id: string;
  headline: string;
  body_text: string;
  preview_text: string;
  image_url: string;
  status: string;
  published_at: string;
  author_type: string;
  ai_model: string;
  category_label: string;
  slug: string;
  editor_notes: string;
}

/**
 * Generate unique slug
 */
function generateSlug(headline: string, neighborhoodId: string): string {
  const base = headline
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  const timestamp = Date.now().toString(36);
  return `${base}-${neighborhoodId}-${timestamp}`;
}

/**
 * Convert fallback story to article
 */
function fallbackStoryToArticle(
  story: FallbackStory,
  imageUrl: string
): ArticleInsert {
  return {
    neighborhood_id: story.neighborhoodId,
    headline: story.headline,
    body_text: story.body,
    preview_text: story.previewText,
    image_url: imageUrl,
    status: 'published',
    published_at: new Date().toISOString(),
    author_type: 'ai',
    ai_model: 'gemini-2.5-flash',
    category_label: story.categoryLabel,
    slug: generateSlug(story.headline, story.neighborhoodId),
    editor_notes: `Generated via Global Fallback Service. Type: ${story.storyType}`,
  };
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const results = {
    coverageStats: getFallbackCoverageStats(),
    neighborhoodsChecked: 0,
    neighborhoodsNeedingContent: 0,
    storiesGenerated: 0,
    articlesCreated: 0,
    errors: [] as string[],
    processedNeighborhoods: [] as string[],
  };

  try {
    // Get all neighborhoods that might need fallback
    const fallbackNeighborhoods = getNeighborhoodsNeedingFallback();
    results.neighborhoodsChecked = fallbackNeighborhoods.length;

    console.log(
      `Checking ${fallbackNeighborhoods.length} neighborhoods for fallback needs...`
    );

    // Check which neighborhoods actually need content
    const neighborhoodsNeedingContent: string[] = [];

    for (const neighborhoodId of fallbackNeighborhoods) {
      // Check when the last article was published for this neighborhood
      const { data: recentArticles, error } = await supabase
        .from('articles')
        .select('published_at')
        .eq('neighborhood_id', neighborhoodId)
        .order('published_at', { ascending: false })
        .limit(1);

      if (error) {
        results.errors.push(`DB check error for ${neighborhoodId}: ${error.message}`);
        continue;
      }

      // If no recent articles or last article is old enough, add to list
      if (!recentArticles || recentArticles.length === 0) {
        neighborhoodsNeedingContent.push(neighborhoodId);
      } else {
        const lastPublished = new Date(recentArticles[0].published_at);
        const hoursSince =
          (Date.now() - lastPublished.getTime()) / (1000 * 60 * 60);

        if (hoursSince >= MIN_HOURS_SINCE_ARTICLE) {
          neighborhoodsNeedingContent.push(neighborhoodId);
        }
      }
    }

    results.neighborhoodsNeedingContent = neighborhoodsNeedingContent.length;
    console.log(
      `${neighborhoodsNeedingContent.length} neighborhoods need fallback content`
    );

    // Limit to prevent runaway costs
    const toProcess = neighborhoodsNeedingContent.slice(0, MAX_FALLBACK_PER_RUN);

    // Get cached images for fallback categories
    const developmentImage = await getCronImage('real-estate', supabase);
    const lifestyleImage = await getCronImage('civic-data', supabase);
    const defaultImage = '/images/placeholder-neighborhood.jpg';

    // Process each neighborhood
    for (const neighborhoodId of toProcess) {
      console.log(`Processing fallback for ${neighborhoodId}...`);

      try {
        const result = await processFallbackForNeighborhood(neighborhoodId);

        if (result.story) {
          results.storiesGenerated++;

          // Select appropriate image
          let imageUrl = defaultImage;
          if (result.story.storyType === 'development') {
            imageUrl = developmentImage || defaultImage;
          } else if (result.story.storyType === 'lifestyle') {
            imageUrl = lifestyleImage || defaultImage;
          }

          // Insert article
          const article = fallbackStoryToArticle(result.story, imageUrl);
          const { error: insertError } = await supabase
            .from('articles')
            .insert(article);

          if (insertError) {
            results.errors.push(
              `Insert error for ${neighborhoodId}: ${insertError.message}`
            );
          } else {
            results.articlesCreated++;
            results.processedNeighborhoods.push(neighborhoodId);
          }
        } else if (result.error) {
          results.errors.push(`${neighborhoodId}: ${result.error}`);
        }

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        results.errors.push(
          `${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log('Global fallback sync complete:', {
      storiesGenerated: results.storiesGenerated,
      articlesCreated: results.articlesCreated,
      errors: results.errors.length,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('Global fallback cron error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        results,
      },
      { status: 500 }
    );
  }
}
