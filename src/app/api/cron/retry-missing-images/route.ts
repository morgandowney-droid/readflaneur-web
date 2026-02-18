import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { selectLibraryImage, preloadUnsplashCache } from '@/lib/image-library';

/**
 * Retry Missing Images
 *
 * Finds published articles with empty image_url and fills them from the
 * pre-generated image library (Unsplash photos). No AI generation fallback —
 * if no library image exists, the article waits for the next refresh cycle.
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

  try {
    // Preload Unsplash cache for fast lookups
    await preloadUnsplashCache(supabase);

    // Find articles with missing images (empty string or null)
    const { data: articles, error: fetchError } = await supabase
      .from('articles')
      .select('id, neighborhood_id, article_type, category_label')
      .eq('status', 'published')
      .or('image_url.is.null,image_url.eq.')
      .order('published_at', { ascending: false })
      .limit(50);

    if (fetchError) {
      errors.push(`Fetch error: ${fetchError.message}`);
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
    }

    if (!articles || articles.length === 0) {
      success = true;
      return NextResponse.json({ success: true, message: 'No articles need images', filled: 0 });
    }

    // Try library image for each article
    for (const article of articles) {
      if (!article.neighborhood_id) continue;

      const libraryUrl = selectLibraryImage(
        article.neighborhood_id,
        article.article_type || 'standard',
        article.category_label || undefined,
      );

      if (!libraryUrl) continue;

      // For Unsplash URLs, no HEAD check needed — CDN is reliable
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
        libraryFilled++;
      } else {
        errors.push(`Update ${article.id}: ${updateError.message}`);
      }
    }

    success = true;

    return NextResponse.json({
      success: true,
      articles_found: articles.length,
      library_filled: libraryFilled,
      total_filled: libraryFilled,
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
      },
    }).then(null, (e: unknown) => console.error('Failed to log cron execution:', e));
  }
}
