import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { selectLibraryImage } from '@/lib/image-library';

/**
 * Retry Missing Images
 *
 * Finds published articles with empty image_url and fills them from the
 * pre-generated image library. Falls back to the internal generate-image
 * endpoint for articles without library coverage (e.g., new community
 * neighborhoods whose library hasn't been generated yet).
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
  let fallbackFilled = 0;

  try {
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

      // Verify the library image exists via HEAD check
      let exists = false;
      try {
        const headResp = await fetch(libraryUrl, { method: 'HEAD' });
        exists = headResp.ok;
      } catch {
        // Library image doesn't exist
      }

      if (exists) {
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
      // If library image doesn't exist, leave it for the internal
      // generate-image endpoint which still handles Gemini fallback
    }

    // For articles that couldn't be filled from library, call generate-image
    // to handle via Gemini fallback (community neighborhoods, etc.)
    const remainingCount = articles.length - libraryFilled;
    if (remainingCount > 0) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\n$/, '').replace(/\/$/, '')
          || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

        const res = await fetch(`${baseUrl}/api/internal/generate-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': cronSecret || '',
          },
          body: JSON.stringify({ limit: Math.min(remainingCount, 10) }),
        });

        if (res.ok) {
          const data = await res.json();
          fallbackFilled = data.successful || 0;
        }
      } catch (err) {
        errors.push(`Fallback generation: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    success = true;

    return NextResponse.json({
      success: true,
      articles_found: articles.length,
      library_filled: libraryFilled,
      fallback_filled: fallbackFilled,
      total_filled: libraryFilled + fallbackFilled,
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
        fallback_filled: fallbackFilled,
      },
    }).then(null, (e: unknown) => console.error('Failed to log cron execution:', e));
  }
}
