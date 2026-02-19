/**
 * NYC Crime Blotter Sync Cron Job
 *
 * Uses Grok web + X search to find near-real-time crime/police/emergency
 * activity for each NYC neighborhood, then generates blotter articles.
 *
 * Schedule: Daily at 2 PM UTC (9 AM EST) — morning blotter
 * Vercel Cron: 0 14 * * *
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchBlotterIncidents,
  generateBlotterStory,
} from '@/lib/nyc-crime-blotter';
import {
  FLANEUR_NYC_CONFIG,
  NEIGHBORHOOD_ID_TO_CONFIG,
} from '@/config/nyc-locations';
import { getCronImage } from '@/lib/cron-images';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for all neighborhoods

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

  // Support ?test=neighborhood-id for testing a single neighborhood
  const url = new URL(request.url);
  const testNeighborhoodId = url.searchParams.get('test');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    neighborhoods_processed: 0,
    incidents_found: 0,
    articles_created: 0,
    articles_skipped: 0,
    errors: [] as string[],
  };

  try {
    // Determine which neighborhoods to process
    let configEntries: [string, string][];

    if (testNeighborhoodId) {
      const configValue = NEIGHBORHOOD_ID_TO_CONFIG[testNeighborhoodId];
      if (!configValue) {
        return NextResponse.json(
          { error: `Unknown neighborhood ID: ${testNeighborhoodId}` },
          { status: 400 }
        );
      }
      configEntries = [[testNeighborhoodId, configValue]];
    } else {
      // Process all non-combo, non-component NYC neighborhoods
      configEntries = Object.entries(NEIGHBORHOOD_ID_TO_CONFIG).filter(
        ([, configKey]) => {
          const config = FLANEUR_NYC_CONFIG[configKey];
          // Skip combo neighborhoods (they aggregate from components)
          if (config?.components) return false;
          return true;
        }
      );
    }

    console.log(
      `Crime blotter: processing ${configEntries.length} neighborhoods`
    );

    // Get cached image for crime blotter
    const cachedImageUrl = await getCronImage('crime-blotter', supabase, {
      usePlaceholderOnly: true,
    });

    const dateStr = new Date().toISOString().split('T')[0];

    for (const [configKey, configValue] of configEntries) {
      const dbNeighborhoodId = `nyc-${configKey}`;

      try {
        results.neighborhoods_processed++;

        // Verify neighborhood exists
        const { data: neighborhood } = await supabase
          .from('neighborhoods')
          .select('id, name, city')
          .eq('id', dbNeighborhoodId)
          .single();

        if (!neighborhood || neighborhood.city !== 'New York') {
          console.log(`Skipping ${dbNeighborhoodId} - not found`);
          results.articles_skipped++;
          continue;
        }

        // Check if blotter already exists for today
        const slug = `crime-blotter-${dbNeighborhoodId}-${dateStr}`;
        const { data: existingArticle } = await supabase
          .from('articles')
          .select('id')
          .eq('slug', slug)
          .single();

        if (existingArticle) {
          console.log(`Blotter already exists for ${dbNeighborhoodId} today`);
          results.articles_skipped++;
          continue;
        }

        // Get precinct info for the neighborhood
        const nycConfig = FLANEUR_NYC_CONFIG[configValue];
        const precincts = nycConfig?.precincts || [];

        // Fetch incidents via Grok
        const incidents = await fetchBlotterIncidents(
          neighborhood.name,
          precincts
        );

        if (incidents.length === 0) {
          console.log(`No incidents for ${dbNeighborhoodId}`);
          results.articles_skipped++;
          continue;
        }

        results.incidents_found += incidents.length;

        console.log(
          `${dbNeighborhoodId}: ${incidents.length} incidents found`
        );

        // Generate story
        const story = await generateBlotterStory(
          dbNeighborhoodId,
          neighborhood.name,
          incidents
        );

        if (!story) {
          results.errors.push(`${dbNeighborhoodId}: Story generation failed`);
          continue;
        }

        // Insert article
        const { error: insertError } = await supabase.from('articles').insert({
          neighborhood_id: dbNeighborhoodId,
          headline: story.headline,
          body_text: story.body,
          preview_text: story.previewText,
          image_url: cachedImageUrl,
          slug,
          status: 'published',
          published_at: new Date().toISOString(),
          author_type: 'ai',
          ai_model: 'gemini-2.5-flash',
          ai_prompt: `Crime Blotter: ${incidents.length} incidents in ${neighborhood.name}`,
          category_label: 'Blotter',
          enriched_at: new Date().toISOString(),
          enrichment_model: 'gemini-2.5-flash',
        });

        if (insertError) {
          results.errors.push(`${dbNeighborhoodId}: ${insertError.message}`);
          continue;
        }

        results.articles_created++;
        console.log(`Created blotter for ${dbNeighborhoodId}`);

        // Rate limiting between Grok calls
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch (err) {
        results.errors.push(
          `${dbNeighborhoodId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(
      `Crime Blotter: ${results.articles_created} created, ${results.incidents_found} total incidents`
    );

    return NextResponse.json({
      success: results.errors.length === 0 || results.articles_created > 0,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Crime blotter sync failed:', error);

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
