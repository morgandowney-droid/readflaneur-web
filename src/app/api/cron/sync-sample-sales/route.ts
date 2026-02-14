/**
 * Sample Sale Sync Cron Job
 *
 * Scrapes fashion event aggregators to alert residents about high-end
 * sample sales and trunk shows in Flâneur neighborhoods.
 *
 * Strategy: "Insider Access"
 * - Time-sensitive events (3-4 days)
 * - Luxury brands only (via LUXURY_BRANDS whitelist)
 * - "Secret Intel" tone
 *
 * Data Sources:
 * - Chicmi (Global - NYC/London/LA/Paris)
 * - 260 Sample Sale (NYC)
 * - Arlettie (Paris/London - often "Invite Only")
 *
 * Schedule: Daily at 8 AM UTC (morning fashion alert)
 * Vercel Cron: 0 8 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processSampleSales,
  createSampleSales,
  generateSampleSaleStory,
  SampleSaleStory,
  SAMPLE_SALE_SOURCES,
  CITY_NEIGHBORHOODS,
} from '@/lib/sample-sale';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for scraping multiple sources

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
  const testBrand = url.searchParams.get('brand');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    sources_scraped: 0,
    sales_detected: 0,
    sales_matched: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_source: {} as Record<string, number>,
    by_city: {} as Record<string, number>,
    by_brand_tier: {} as Record<string, number>,
    total_sources: SAMPLE_SALE_SOURCES.length,
    errors: [] as string[],
  };

  try {
    let stories: SampleSaleStory[];

    if (useSampleData) {
      console.log('Using sample sale data for testing');
      const sampleSales = createSampleSales();
      stories = [];

      for (const sale of sampleSales) {
        const story = await generateSampleSaleStory(sale);
        if (story) stories.push(story);
      }

      results.sales_detected = sampleSales.length;
      results.sales_matched = sampleSales.length;
      results.by_source['sample'] = sampleSales.length;
    } else {
      console.log('Processing sample sale sources');

      // Run the full pipeline
      const processResult = await processSampleSales();

      results.sources_scraped = processResult.sourcesScraped;
      results.sales_detected = processResult.salesDetected;
      results.sales_matched = processResult.salesMatched;
      results.stories_generated = processResult.storiesGenerated;
      results.by_source = processResult.bySource;
      results.by_city = processResult.byCity;
      results.by_brand_tier = processResult.byBrandTier;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by source if specified
    if (testSource) {
      stories = stories.filter(
        (s) => s.sale.source.toLowerCase().includes(testSource.toLowerCase())
      );
    }

    // Filter by city if specified
    if (testCity) {
      const normalizedCity = testCity.replace(/-/g, '_');
      stories = stories.filter(
        (s) => s.sale.city.toLowerCase() === normalizedCity.toLowerCase()
      );
    }

    // Filter by brand if specified
    if (testBrand) {
      stories = stories.filter(
        (s) => s.sale.brand.toLowerCase().includes(testBrand.toLowerCase())
      );
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No sample sale stories generated');
      return NextResponse.json({
        success: true,
        message: 'No luxury sample sales found',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for sample sales (reused across all stories)
    const cachedImageUrl = await getCronImage('sample-sale', supabase);

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const cleanBrand = story.sale.brand
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 20);
          const cleanSource = story.sale.source
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-');
          const dateStr = story.sale.startDate.toISOString().split('T')[0];
          const slug = `sample-sale-${cleanBrand}-${cleanSource}-${dateStr}-${neighborhoodId}`;

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
            ai_prompt: `Sample Sale: ${story.sale.brand} at ${story.sale.venue} (${story.sale.city})`,
            category_label: story.categoryLabel,
            enriched_at: new Date().toISOString(),
            enrichment_model: 'gemini-2.5-flash',
          });

          if (insertError) {
            results.errors.push(`${story.sale.brand}/${neighborhoodId}: ${insertError.message}`);
            continue;
          }

          results.articles_created++;
        } catch (err) {
          results.errors.push(
            `${story.sale.brand}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Sample Sales: ${results.sales_matched} sales matched, ${results.stories_generated} stories, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Sample sale sync failed:', error);

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
