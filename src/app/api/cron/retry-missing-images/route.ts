import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { selectLibraryImage, preloadUnsplashCache, swapNegativeImage } from '@/lib/image-library';

/**
 * Retry Missing Images
 *
 * Finds published articles with empty image_url OR AI-generated cron-cache
 * images and fills/replaces them with Unsplash library photos.
 * No AI generation fallback - if no library image exists, the article waits
 * for the next refresh cycle.
 *
 * Schedule: Every 2 hours
 */

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    request.headers.get('x-vercel-cron') === '1' ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const startedAt = new Date().toISOString();
  let success = false;
  const errors: string[] = [];
  let libraryFilled = 0;
  let aiReplaced = 0;
  let negativeSwapped = 0;

  try {
    // Preload Unsplash cache for fast lookups
    await preloadUnsplashCache(supabase);

    // Phase 1: Find articles with missing images (empty string or null)
    const { data: missingArticles, error: fetchError } = await supabase
      .from('articles')
      .select('id, neighborhood_id, article_type, category_label, image_url')
      .eq('status', 'published')
      .or('image_url.is.null,image_url.eq.')
      .order('published_at', { ascending: false })
      .limit(50);

    if (fetchError) {
      errors.push(`Fetch error: ${fetchError.message}`);
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
    }

    // Phase 2: Find articles with AI-generated cron-cache images to replace
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const cronCachePattern = `${supabaseUrl}/storage/v1/object/public/images/cron-cache/%`;
    const { data: aiArticles, error: aiError } = await supabase
      .from('articles')
      .select('id, neighborhood_id, article_type, category_label, image_url')
      .eq('status', 'published')
      .like('image_url', cronCachePattern)
      .order('published_at', { ascending: false })
      .limit(100);

    if (aiError) {
      errors.push(`AI fetch error: ${aiError.message}`);
    }

    const allArticles = [
      ...(missingArticles || []),
      ...(aiArticles || []),
    ];

    if (allArticles.length === 0) {
      success = true;
      return NextResponse.json({ success: true, message: 'No articles need images', filled: 0, ai_replaced: 0 });
    }

    // Process all articles
    for (let i = 0; i < allArticles.length; i++) {
      const article = allArticles[i];
      if (!article.neighborhood_id) continue;

      const libraryUrl = selectLibraryImage(
        article.neighborhood_id,
        article.article_type || 'standard',
        article.category_label || undefined,
        undefined,
        i,
      );

      if (!libraryUrl) continue;

      // Skip if the article already has this exact Unsplash URL
      if (article.image_url === libraryUrl) continue;

      // For Unsplash URLs, no HEAD check needed - CDN is reliable
      // For legacy Supabase URLs, verify existence
      const isUnsplash = libraryUrl.includes('images.unsplash.com');
      if (!isUnsplash) {
        try {
          const headResp = await fetch(libraryUrl, { method: 'HEAD' });
          if (!headResp.ok) continue;
        } catch {
          continue;
        }
      }

      const { error: updateError } = await supabase
        .from('articles')
        .update({ image_url: libraryUrl })
        .eq('id', article.id);

      if (!updateError) {
        const isCronCache = article.image_url && article.image_url.includes('cron-cache/');
        if (isCronCache) {
          aiReplaced++;
        } else {
          libraryFilled++;
        }
      } else {
        errors.push(`Update ${article.id}: ${updateError.message}`);
      }
    }

    // Phase 3: Swap negatively-scored Unsplash images
    try {
      const { data: negativeImages, error: rpcError } = await supabase
        .rpc('get_negative_images', { threshold: -2 });

      if (rpcError) {
        errors.push(`Negative images RPC: ${rpcError.message}`);
      } else if (negativeImages && negativeImages.length > 0) {
        for (const { image_url } of negativeImages) {
          // Find which neighborhood owns this image via articles table
          const { data: article } = await supabase
            .from('articles')
            .select('neighborhood_id')
            .eq('image_url', image_url)
            .limit(1)
            .single();

          if (!article?.neighborhood_id) continue;

          const result = await swapNegativeImage(supabase, article.neighborhood_id, image_url);
          if (result) {
            negativeSwapped++;
            console.log(`[retry-missing-images] Swapped ${result.oldUrl} -> ${result.newUrl} (${result.articlesUpdated} articles, photographer: ${result.newPhotographer})`);
          }
        }
      }
    } catch (err) {
      errors.push(`Phase 3: ${err instanceof Error ? err.message : String(err)}`);
    }

    success = true;

    return NextResponse.json({
      success: true,
      missing_found: (missingArticles || []).length,
      ai_found: (aiArticles || []).length,
      library_filled: libraryFilled,
      ai_replaced: aiReplaced,
      negative_swapped: negativeSwapped,
      total_updated: libraryFilled + aiReplaced + negativeSwapped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    errors.push(message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await supabase.from('cron_executions').insert({
      job_name: 'retry-missing-images',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success,
      errors: errors.length > 0 ? errors : null,
      response_data: {
        library_filled: libraryFilled,
        ai_replaced: aiReplaced,
        negative_swapped: negativeSwapped,
      },
    }).then(null, (e: unknown) => console.error('Failed to log cron execution:', e));
  }
}
