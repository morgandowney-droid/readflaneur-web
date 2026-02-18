/**
 * Retail Watch Sync Cron Job
 *
 * Monitors signage and advertisement permits to detect upcoming
 * luxury retail openings in Flâneur neighborhoods.
 *
 * Strategy: Signage permits reveal WHO is moving in, typically
 * 3-4 months before opening.
 *
 * Schedule: Daily at 9 AM UTC
 * Vercel Cron: 0 9 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processRetailWatch,
  generateRetailStory,
  createSampleRetailOpening,
  RetailStory,
  BrandCategory,
} from '@/lib/retail-watch';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes

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
  const daysBack = parseInt(url.searchParams.get('days') || '30', 10);
  const testNeighborhood = url.searchParams.get('neighborhood');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    permits_scanned: 0,
    openings_detected: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_category: {
      Fashion: 0,
      'Watches & Jewelry': 0,
      'Beauty & Fragrance': 0,
      'Fitness & Wellness': 0,
      'Private Clubs': 0,
      Hospitality: 0,
      'Home & Design': 0,
    } as Record<BrandCategory, number>,
    by_tier: {
      Ultra: 0,
      Aspirational: 0,
    } as Record<'Ultra' | 'Aspirational', number>,
    brands_detected: [] as string[],
    errors: [] as string[],
  };

  try {
    let stories: RetailStory[];

    if (useSampleData) {
      console.log('Using sample retail data for testing');
      const sampleOpening = createSampleRetailOpening();
      const sampleStory = await generateRetailStory(sampleOpening);
      stories = sampleStory ? [sampleStory] : [];
      results.permits_scanned = 1;
      results.openings_detected = 1;
      results.by_category[sampleOpening.brand.category]++;
      results.by_tier[sampleOpening.brand.tier]++;
      results.brands_detected.push(sampleOpening.brand.name);
    } else {
      // Calculate since date
      const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

      console.log(`Processing retail watch since ${since.toISOString()}`);

      // Run the full pipeline
      const processResult = await processRetailWatch(since);

      results.permits_scanned = processResult.permitsScanned;
      results.openings_detected = processResult.openingsDetected;
      results.stories_generated = processResult.storiesGenerated;
      results.by_category = processResult.byCategory;
      results.by_tier = processResult.byTier;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
      results.brands_detected = stories.map((s) => s.brandName);
    }

    if (stories.length === 0) {
      console.log('No luxury retail openings detected');
      return NextResponse.json({
        success: true,
        message: 'No luxury retail openings detected in signage permits',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for retail watch (reused across all stories)
    const cachedImageUrl = await getCronImage('retail-watch', supabase);

    // Create articles for each story
    for (const story of stories) {
      try {
        // Filter by test neighborhood if specified
        if (testNeighborhood && story.neighborhoodId !== testNeighborhood) {
          continue;
        }

        // Create unique slug
        const cleanBrand = story.brandName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const cleanAddress = story.address.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20);
        const slug = `retail-${cleanBrand}-${cleanAddress}-${story.permitId}`;

        // Check if we already have an article for this permit
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
        let finalNeighborhoodId = story.neighborhoodId;

        const { data: neighborhood } = await supabase
          .from('neighborhoods')
          .select('id')
          .eq('id', story.neighborhoodId)
          .single();

        if (!neighborhood) {
          // Try without city prefix
          const shortId = story.neighborhoodId.replace(/^nyc-/, '');
          const { data: shortNeighborhood } = await supabase
            .from('neighborhoods')
            .select('id')
            .eq('id', shortId)
            .single();

          if (shortNeighborhood) {
            finalNeighborhoodId = shortId;
          } else {
            results.errors.push(`${story.brandName}: Neighborhood ${story.neighborhoodId} not found`);
            continue;
          }
        }

        // Determine category label based on brand tier
        const categoryLabel =
          story.brandTier === 'Ultra' ? 'Retail Watch: Luxury' : 'Retail Watch';

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
          ai_prompt: `Retail Watch: ${story.brandName} at ${story.address}`,
          category_label: categoryLabel,
          editor_notes: 'Source: NYC DOB Signage Permits - https://data.cityofnewyork.us/Housing-Development/DOB-Permit-Issuance/ipu4-2q9a',
          enriched_at: new Date().toISOString(),
          enrichment_model: 'gemini-2.5-flash',
        });

        if (insertError) {
          results.errors.push(`${story.brandName}: ${insertError.message}`);
          continue;
        }

        results.articles_created++;
      } catch (err) {
        results.errors.push(
          `${story.brandName}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(
      `Retail Watch: ${results.openings_detected} detected, ${results.articles_created} articles created`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Retail watch sync failed:', error);

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
