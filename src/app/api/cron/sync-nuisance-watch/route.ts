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
  ComplaintCluster,
  ComplaintCategory,
  SeverityLevel,
  NUISANCE_THRESHOLD,
  generateNuisanceRoundup,
} from '@/lib/nuisance-watch';
import { selectLibraryImage, getLibraryReadyIds, preloadUnsplashCache } from '@/lib/image-library';

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

  // Preload Unsplash image cache for neighborhood photos
  const libraryReadyIds = await getLibraryReadyIds(supabase);
  await preloadUnsplashCache(supabase);

  try {
    let stories: NuisanceStory[];
    let allClusters: ComplaintCluster[] = [];

    if (useSampleData) {
      console.log('Using sample nuisance data for testing');
      const sampleCluster = createSampleCluster();
      const sampleStory = await generateNuisanceStory(sampleCluster);
      stories = sampleStory ? [sampleStory] : [];
      allClusters = [sampleCluster];
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
      allClusters = processResult.clusters;

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

    // Group stories by neighborhood for consolidation
    const storiesByNeighborhood = new Map<string, NuisanceStory[]>();
    const clustersByNeighborhood = new Map<string, ComplaintCluster[]>();

    for (const story of stories) {
      if (testNeighborhood && story.neighborhoodId !== testNeighborhood) continue;
      const existing = storiesByNeighborhood.get(story.neighborhoodId) || [];
      existing.push(story);
      storiesByNeighborhood.set(story.neighborhoodId, existing);
    }

    for (const cluster of allClusters) {
      if (testNeighborhood && cluster.neighborhoodId !== testNeighborhood) continue;
      const existing = clustersByNeighborhood.get(cluster.neighborhoodId) || [];
      existing.push(cluster);
      clustersByNeighborhood.set(cluster.neighborhoodId, existing);
    }

    // Process each neighborhood: roundup for 2+, single article for 1
    for (const [neighborhoodId, neighborhoodStories] of storiesByNeighborhood.entries()) {
      try {
        const dateStr = new Date().toISOString().split('T')[0];

        // Determine the final story to publish
        let finalStory: NuisanceStory;

        if (neighborhoodStories.length >= 2) {
          // Consolidate into a roundup
          const neighborhoodClusters = clustersByNeighborhood.get(neighborhoodId) || [];
          const roundup = await generateNuisanceRoundup(
            neighborhoodClusters.length >= 2 ? neighborhoodClusters : neighborhoodStories.map((s) => ({
              id: s.clusterId,
              location: s.location,
              displayLocation: s.displayLocation,
              street: '',
              neighborhood: s.neighborhood,
              neighborhoodId: s.neighborhoodId,
              category: s.category,
              severity: s.severity,
              count: s.complaintCount,
              complaints: [],
              isCommercial: s.category.includes('Commercial'),
              trend: s.trend,
            })),
            neighborhoodStories[0].neighborhood,
            neighborhoodId
          );

          if (!roundup) {
            // Fallback: just use the first story
            finalStory = neighborhoodStories[0];
          } else {
            finalStory = roundup;
          }

          console.log(`Consolidated ${neighborhoodStories.length} stories into roundup for ${neighborhoodId}`);
        } else {
          finalStory = neighborhoodStories[0];
        }

        // Build slug
        const slug = neighborhoodStories.length >= 2
          ? `nuisance-roundup-${neighborhoodId}-${dateStr}`
          : `nuisance-${finalStory.category.toLowerCase().replace(/[^a-z]/g, '-')}-${finalStory.displayLocation.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30)}-${dateStr}`;

        // Check if article already exists
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
          const shortId = neighborhoodId.replace(/^nyc-/, '');
          const { data: shortNeighborhood } = await supabase
            .from('neighborhoods')
            .select('id')
            .eq('id', shortId)
            .single();

          if (shortNeighborhood) {
            finalNeighborhoodId = shortId;
          } else {
            results.errors.push(`Neighborhood ${neighborhoodId} not found`);
            continue;
          }
        }

        // Determine category label
        let categoryLabel: string;
        if (finalStory.trend === 'spike' && finalStory.severity === 'High') {
          categoryLabel = 'Community Alert';
        } else if (finalStory.trend === 'spike') {
          categoryLabel = 'Nuisance Watch';
        } else {
          categoryLabel = 'Block Watch';
        }

        // Create article
        const { error: insertError } = await supabase.from('articles').insert({
          neighborhood_id: finalNeighborhoodId,
          headline: finalStory.headline,
          body_text: finalStory.body,
          preview_text: finalStory.previewText,
          image_url: selectLibraryImage(finalNeighborhoodId, 'rss-story', categoryLabel, libraryReadyIds, results.articles_created),
          slug,
          status: 'published',
          published_at: new Date().toISOString(),
          author_type: 'ai',
          ai_model: 'gemini-2.5-flash',
          ai_prompt: neighborhoodStories.length >= 2
            ? `Nuisance Roundup: ${neighborhoodStories.length} hotspots in ${finalStory.neighborhood}`
            : `Nuisance Watch: ${finalStory.category} at ${finalStory.displayLocation}`,
          category_label: categoryLabel,
          editor_notes: 'Source: NYC 311 Open Data - https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9',
          enriched_at: new Date().toISOString(),
          enrichment_model: 'gemini-2.5-flash',
        });

        if (insertError) {
          results.errors.push(`${neighborhoodId}: ${insertError.message}`);
          continue;
        }

        results.articles_created++;
      } catch (err) {
        results.errors.push(
          `${neighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
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
