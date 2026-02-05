/**
 * Archive Hunter Sync Cron Job
 *
 * Monitors in-store inventory of high-end resale boutiques
 * to alert residents when "Investment Grade" pieces arrive.
 *
 * Strategy: "Digital to Physical"
 * - Focus on specific neighborhood stores
 * - Filter for trophy items ($3,000+)
 * - Alert collectors before items sell online
 *
 * Target Resellers:
 * - The RealReal (Madison Ave, SoHo, Melrose, Westbourne Grove)
 * - What Goes Around Comes Around (SoHo, Beverly Hills)
 * - Rebag (SoHo, Miami)
 * - Fashionphile (Chelsea, Beverly Hills)
 *
 * Schedule: Twice daily at 9 AM and 5 PM UTC
 * Vercel Cron: 0 9,17 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processArchiveHunter,
  createSampleItems,
  generateArchiveStory,
  ArchiveStory,
  STORE_LOCATIONS,
  TROPHY_PRICE_THRESHOLD,
  INVESTMENT_BRANDS,
} from '@/lib/archive-hunter';
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
  const testStore = url.searchParams.get('store');
  const testBrand = url.searchParams.get('brand');
  const testNeighborhood = url.searchParams.get('neighborhood');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    stores_scanned: 0,
    items_found: 0,
    investment_grade_count: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_store: {} as Record<string, number>,
    by_brand: {} as Record<string, number>,
    by_category: {} as Record<string, number>,
    total_stores: STORE_LOCATIONS.length,
    total_brands: Object.keys(INVESTMENT_BRANDS).length,
    price_threshold: TROPHY_PRICE_THRESHOLD,
    errors: [] as string[],
  };

  try {
    let stories: ArchiveStory[];

    if (useSampleData) {
      console.log('Using sample archive hunter data for testing');
      const sampleItems = createSampleItems();
      stories = [];

      for (const item of sampleItems) {
        const story = await generateArchiveStory(item);
        if (story) stories.push(story);
      }

      results.items_found = sampleItems.length;
      results.investment_grade_count = sampleItems.length;
      results.by_store['sample'] = sampleItems.length;
    } else {
      console.log('Processing archive hunter inventory');

      // Run the full pipeline
      const processResult = await processArchiveHunter();

      results.stores_scanned = processResult.storesScanned;
      results.items_found = processResult.itemsFound;
      results.investment_grade_count = processResult.investmentGradeCount;
      results.stories_generated = processResult.storiesGenerated;
      results.by_store = processResult.byStore;
      results.by_brand = processResult.byBrand;
      results.by_category = processResult.byCategory;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;
    }

    // Filter by store if specified
    if (testStore) {
      stories = stories.filter((s) =>
        s.item.storeLocation.store.toLowerCase().includes(testStore.toLowerCase())
      );
    }

    // Filter by brand if specified
    if (testBrand) {
      stories = stories.filter((s) =>
        s.item.brand.toLowerCase().includes(testBrand.toLowerCase())
      );
    }

    // Filter by neighborhood if specified
    if (testNeighborhood) {
      stories = stories.filter((s) =>
        s.item.storeLocation.neighborhoodId.toLowerCase().includes(testNeighborhood.toLowerCase())
      );
    }

    results.stories_generated = stories.length;

    if (stories.length === 0) {
      console.log('No archive hunter stories generated');
      return NextResponse.json({
        success: true,
        message: 'No investment grade items found',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for archive hunter (reused across all stories)
    const cachedImageUrl = await getCronImage('archive-hunter', supabase);

    // Create articles for each story
    for (const story of stories) {
      for (const neighborhoodId of story.targetNeighborhoods) {
        try {
          // Create unique slug
          const cleanBrand = story.item.brand
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 15);
          const cleanStore = story.item.storeLocation.store
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .substring(0, 15);
          const dateStr = new Date().toISOString().split('T')[0];
          const slug = `archive-alert-${cleanBrand}-${cleanStore}-${dateStr}-${neighborhoodId}`;

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
            image_url: cachedImageUrl, // Reuse cached category image
            slug,
            status: 'published',
            published_at: new Date().toISOString(),
            author_type: 'ai',
            ai_model: 'gemini-2.0-flash',
            ai_prompt: `Archive Alert: ${story.item.brand} ${story.item.name} at ${story.item.storeLocation.name} ($${story.item.price.toLocaleString()})`,
            category_label: story.categoryLabel,
          });

          if (insertError) {
            results.errors.push(`${story.item.brand}/${neighborhoodId}: ${insertError.message}`);
            continue;
          }

          results.articles_created++;
        } catch (err) {
          results.errors.push(
            `${story.item.brand}/${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    console.log(
      `Archive Hunter: ${results.items_found} items, ${results.investment_grade_count} investment grade, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Archive hunter sync failed:', error);

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
