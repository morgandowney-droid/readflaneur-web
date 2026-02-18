/**
 * NYC Liquor License Watch Cron Job
 *
 * Fetches pending and newly granted liquor licenses from NY State Open Data
 * and generates "Last Call" articles for Flâneur neighborhoods.
 *
 * Data sources:
 * - Pending licenses (f8i8-k2gm): New applications
 * - Active licenses (9s3h-dpkz): Recently granted
 *
 * Schedule: Weekly on Mondays at 7 AM UTC (2 AM EST)
 * Vercel Cron: 0 7 * * 1
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processLiquorLicenses, LiquorStory } from '@/lib/nyc-liquor';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
  const daysBack = parseInt(url.searchParams.get('days') || '90', 10);
  const testNeighborhood = url.searchParams.get('neighborhood');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    pending_fetched: 0,
    active_fetched: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    by_neighborhood: {} as Record<string, number>,
    errors: [] as string[],
  };

  try {
    const processResult = await processLiquorLicenses(daysBack);

    results.pending_fetched = processResult.pendingFetched;
    results.active_fetched = processResult.activeFetched;
    results.stories_generated = processResult.storiesGenerated;
    results.errors.push(...processResult.errors);

    const stories: LiquorStory[] = processResult.stories;

    if (stories.length === 0) {
      console.log('No newsworthy liquor license events detected');
      return NextResponse.json({
        success: true,
        message: 'No newsworthy liquor license events in coverage areas',
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for liquor watch
    const cachedImageUrl = await getCronImage('liquor-watch', supabase);

    // Create articles for each story
    for (const story of stories) {
      try {
        // Filter by test neighborhood if specified
        if (testNeighborhood && story.neighborhoodId !== testNeighborhood) {
          continue;
        }

        // Dedup slug based on business name + address (not application ID)
        const cleanName = story.businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30);
        const cleanAddress = story.address.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20);
        const slug = `liquor-${cleanName}-${cleanAddress}`;

        // Check if we already have an article for this business+address
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
          // Try without nyc- prefix, or with it if missing
          const altId = story.neighborhoodId.startsWith('nyc-')
            ? story.neighborhoodId.replace(/^nyc-/, '')
            : `nyc-${story.neighborhoodId}`;
          const { data: altNeighborhood } = await supabase
            .from('neighborhoods')
            .select('id')
            .eq('id', altId)
            .single();

          if (altNeighborhood) {
            finalNeighborhoodId = altId;
          } else {
            results.errors.push(`${story.businessName}: Neighborhood ${story.neighborhoodId} not found`);
            continue;
          }
        }

        const categoryLabel = story.status === 'pending' ? 'Last Call: Application' : 'Last Call: Approved';

        const { error: insertError } = await supabase.from('articles').insert({
          neighborhood_id: finalNeighborhoodId,
          headline: story.headline,
          body_text: story.body,
          preview_text: story.previewText,
          image_url: cachedImageUrl,
          slug,
          status: 'published',
          published_at: new Date().toISOString(),
          author_type: 'ai',
          ai_model: 'gemini-2.5-flash',
          ai_prompt: `Liquor Watch: ${story.businessName} at ${story.address}`,
          category_label: categoryLabel,
          editor_notes: `Source: NY State Liquor Authority - https://data.ny.gov/Economic-Development/Current-Liquor-Authority-Active-Licenses/9s3h-dpkz`,
          enriched_at: new Date().toISOString(),
          enrichment_model: 'gemini-2.5-flash',
        });

        if (insertError) {
          results.errors.push(`${story.businessName}: ${insertError.message}`);
          continue;
        }

        results.articles_created++;
        results.by_neighborhood[finalNeighborhoodId] =
          (results.by_neighborhood[finalNeighborhoodId] || 0) + 1;
      } catch (err) {
        results.errors.push(
          `${story.businessName}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(
      `Liquor Watch: ${results.stories_generated} stories, ${results.articles_created} articles created`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Liquor watch sync failed:', error);

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
