/**
 * Nuisance Watch Sync Cron Job
 *
 * Aggregates 311 complaints to detect quality of life hotspots
 * (Noise, Pests, Cleanliness) in Flâneur neighborhoods.
 *
 * Strategy: Report CLUSTERS and SPIKES, not individual complaints.
 * Only triggers when complaints exceed NUISANCE_THRESHOLD (5+).
 *
 * Schedule: Daily at 11 AM UTC
 * Vercel Cron: 0 11 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  processNuisanceWatch,
  generateNuisanceStory,
  createSampleCluster,
  NuisanceStory,
  ComplaintCategory,
  SeverityLevel,
  NUISANCE_THRESHOLD,
} from '@/lib/nuisance-watch';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 180; // 3 minutes for clustering + generation

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
  const daysBack = parseInt(url.searchParams.get('days') || '7', 10);
  const testNeighborhood = url.searchParams.get('neighborhood');
  const testCategory = url.searchParams.get('category') as ComplaintCategory | null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    complaints_scanned: 0,
    clusters_detected: 0,
    stories_generated: 0,
    articles_created: 0,
    articles_skipped: 0,
    threshold: NUISANCE_THRESHOLD,
    by_category: {
      'Noise - Commercial': 0,
      'Noise - Residential': 0,
      Rodent: 0,
      Pest: 0,
      'Homeless Encampment': 0,
      'Sidewalk Condition': 0,
      Trash: 0,
      Graffiti: 0,
      'Illegal Dumping': 0,
    } as Record<ComplaintCategory, number>,
    by_severity: {
      High: 0,
      Medium: 0,
      Low: 0,
    } as Record<SeverityLevel, number>,
    by_trend: {
      spike: 0,
      elevated: 0,
      normal: 0,
    } as Record<'spike' | 'elevated' | 'normal', number>,
    hotspots: [] as Array<{ location: string; category: string; count: number }>,
    errors: [] as string[],
  };

  try {
    let stories: NuisanceStory[];

    if (useSampleData) {
      console.log('Using sample nuisance data for testing');
      const sampleCluster = createSampleCluster();
      const sampleStory = await generateNuisanceStory(sampleCluster);
      stories = sampleStory ? [sampleStory] : [];
      results.complaints_scanned = sampleCluster.complaints.length;
      results.clusters_detected = 1;
      results.by_category[sampleCluster.category]++;
      results.by_severity[sampleCluster.severity]++;
      results.by_trend[sampleCluster.trend]++;
      results.hotspots.push({
        location: sampleCluster.displayLocation,
        category: sampleCluster.category,
        count: sampleCluster.count,
      });
    } else {
      // Calculate since date
      const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

      console.log(`Processing nuisance watch since ${since.toISOString()}`);

      // Run the full pipeline
      const processResult = await processNuisanceWatch(since);

      results.complaints_scanned = processResult.complaintsScanned;
      results.clusters_detected = processResult.clustersDetected;
      results.stories_generated = processResult.storiesGenerated;
      results.by_category = processResult.byCategory;
      results.by_severity = processResult.bySeverity;
      results.by_trend = processResult.byTrend;
      results.errors.push(...processResult.errors);

      stories = processResult.stories;

      // Build hotspots list for response
      for (const story of stories) {
        results.hotspots.push({
          location: story.displayLocation,
          category: story.category,
          count: story.complaintCount,
        });
      }
    }

    // Filter by test params if specified
    if (testCategory) {
      stories = stories.filter((s) => s.category === testCategory);
    }

    if (stories.length === 0) {
      console.log('No nuisance hotspots detected above threshold');
      return NextResponse.json({
        success: true,
        message: `No hotspots detected (threshold: ${NUISANCE_THRESHOLD}+ complaints)`,
        ...results,
        timestamp: new Date().toISOString(),
      });
    }

    // Get cached image for nuisance watch (reused across all stories)
    const cachedImageUrl = await getCronImage('nuisance-watch', supabase);

    // Create articles for each story
    for (const story of stories) {
      try {
        // Filter by test neighborhood if specified
        if (testNeighborhood && story.neighborhoodId !== testNeighborhood) {
          continue;
        }

        // Create unique slug
        const cleanCategory = story.category.toLowerCase().replace(/[^a-z]/g, '-');
        const cleanLocation = story.displayLocation.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30);
        const dateStr = new Date().toISOString().split('T')[0];
        const slug = `nuisance-${cleanCategory}-${cleanLocation}-${dateStr}`;

        // Check if we already have an article for this cluster today
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
            results.errors.push(`${story.category}: Neighborhood ${story.neighborhoodId} not found`);
            continue;
          }
        }

        // Determine category label based on severity and trend
        let categoryLabel: string;
        if (story.trend === 'spike' && story.severity === 'High') {
          categoryLabel = 'Community Alert';
        } else if (story.trend === 'spike') {
          categoryLabel = 'Nuisance Watch';
        } else {
          categoryLabel = 'Block Watch';
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
          ai_prompt: `Nuisance Watch: ${story.category} at ${story.displayLocation}`,
          category_label: categoryLabel,
        });

        if (insertError) {
          results.errors.push(`${story.category}/${story.displayLocation}: ${insertError.message}`);
          continue;
        }

        results.articles_created++;
      } catch (err) {
        results.errors.push(
          `${story.category}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(
      `Nuisance Watch: ${results.clusters_detected} clusters, ${results.articles_created} articles`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Nuisance watch sync failed:', error);

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
