/**
 * Anglosphere Features Cron Job
 *
 * Syncs city-specific feature stories for the Anglosphere markets:
 * - Vancouver: View Cone Watch (height variance permits)
 * - Cape Town: Conditions Report (wind + load shedding)
 * - Singapore: Market Watch (COE + GCB transactions)
 * - Palm Beach: ARCOM Watch (architectural commission)
 *
 * Schedule: Daily at 8 AM UTC
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processViewConePermits, ViewConeStory } from '@/lib/vancouver-views';
import { getCapeTownConditions, ConditionAlert } from '@/lib/capetown-conditions';
import { getSingaporeMarketAlerts, SingaporeMarketAlert } from '@/lib/singapore-market';
import { processARCOMAgenda, ARCOMAlert } from '@/lib/palm-beach-arcom';
import { getCronImage } from '@/lib/cron-images';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

interface ArticleInsert {
  neighborhood_id: string;
  headline: string;
  body_text: string;
  preview_text: string;
  image_url: string;
  status: string;
  published_at: string;
  author_type: string;
  ai_model: string;
  category_label: string;
  slug: string;
  editor_notes: string;
}

/**
 * Generate unique slug
 */
function generateSlug(headline: string, neighborhoodId: string): string {
  const base = headline
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  const timestamp = Date.now().toString(36);
  return `${base}-${neighborhoodId}-${timestamp}`;
}

/**
 * Convert Vancouver View Cone story to article
 */
async function viewConeStoryToArticle(
  story: ViewConeStory,
  imageUrl: string
): Promise<ArticleInsert> {
  return {
    neighborhood_id: story.neighborhoodId,
    headline: story.headline,
    body_text: story.body,
    preview_text: story.previewText,
    image_url: imageUrl,
    status: 'published',
    published_at: new Date().toISOString(),
    author_type: 'ai',
    ai_model: 'gemini-2.0-flash',
    category_label: 'View Watch',
    slug: generateSlug(story.headline, story.neighborhoodId),
    editor_notes: `Source: Vancouver Open Data. Permit ID: ${story.permitId}`,
  };
}

/**
 * Convert Cape Town condition alert to article
 */
async function conditionAlertToArticle(
  alert: ConditionAlert,
  imageUrl: string
): Promise<ArticleInsert> {
  const categoryLabel = alert.type === 'calm' ? 'Beach Alert' : 'Grid Watch';
  return {
    neighborhood_id: alert.neighborhoodId,
    headline: alert.headline,
    body_text: alert.body,
    preview_text: alert.previewText,
    image_url: imageUrl,
    status: 'published',
    published_at: new Date().toISOString(),
    author_type: 'ai',
    ai_model: 'gemini-2.0-flash',
    category_label: categoryLabel,
    slug: generateSlug(alert.headline, alert.neighborhoodId),
    editor_notes: `Source: ${alert.type === 'calm' ? 'Open-Meteo Weather API' : 'EskomSePush API'}`,
  };
}

/**
 * Convert Singapore market alert to article
 */
async function singaporeAlertToArticle(
  alert: SingaporeMarketAlert,
  imageUrl: string
): Promise<ArticleInsert> {
  const categoryLabel = alert.type === 'coe' ? 'Motor Watch' : 'GCB Alert';
  const source = alert.type === 'coe' ? 'LTA DataMall' : 'URA Transactions';
  return {
    neighborhood_id: alert.neighborhoodId,
    headline: alert.headline,
    body_text: alert.body,
    preview_text: alert.previewText,
    image_url: imageUrl,
    status: 'published',
    published_at: new Date().toISOString(),
    author_type: 'ai',
    ai_model: 'gemini-2.0-flash',
    category_label: categoryLabel,
    slug: generateSlug(alert.headline, alert.neighborhoodId),
    editor_notes: `Source: ${source}`,
  };
}

/**
 * Convert Palm Beach ARCOM alert to article
 */
async function arcomAlertToArticle(
  alert: ARCOMAlert,
  imageUrl: string
): Promise<ArticleInsert> {
  return {
    neighborhood_id: alert.neighborhoodId,
    headline: alert.headline,
    body_text: alert.body,
    preview_text: alert.previewText,
    image_url: imageUrl,
    status: 'published',
    published_at: new Date().toISOString(),
    author_type: 'ai',
    ai_model: 'gemini-2.0-flash',
    category_label: 'Design Watch',
    slug: generateSlug(alert.headline, alert.neighborhoodId),
    editor_notes: `Source: Town of Palm Beach ARCOM Agenda. Item: ${alert.itemId}`,
  };
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const results = {
    vancouver: { stories: 0, errors: [] as string[] },
    capeTown: { alerts: 0, errors: [] as string[] },
    singapore: { alerts: 0, errors: [] as string[] },
    palmBeach: { alerts: 0, errors: [] as string[] },
    articlesCreated: 0,
    totalErrors: [] as string[],
  };

  try {
    // =========================================================================
    // 1. VANCOUVER: View Cone Watch
    // =========================================================================
    console.log('Processing Vancouver View Cone permits...');
    try {
      const vancouverResult = await processViewConePermits(7);
      results.vancouver.stories = vancouverResult.stories.length;
      results.vancouver.errors = vancouverResult.errors;

      // Get cached image for real estate category
      const viewImage = await getCronImage('real-estate', supabase);

      for (const story of vancouverResult.stories) {
        const article = await viewConeStoryToArticle(
          story,
          viewImage || '/images/placeholder-neighborhood.jpg'
        );

        const { error } = await supabase.from('articles').insert(article);
        if (error) {
          results.totalErrors.push(`Vancouver insert: ${error.message}`);
        } else {
          results.articlesCreated++;
        }
      }
    } catch (err) {
      results.vancouver.errors.push(
        err instanceof Error ? err.message : String(err)
      );
    }

    // =========================================================================
    // 2. CAPE TOWN: Conditions Report (Wind + Load Shedding)
    // =========================================================================
    console.log('Processing Cape Town conditions...');
    try {
      const capeTownResult = await getCapeTownConditions();
      results.capeTown.alerts = capeTownResult.alerts.length;

      // Get cached images
      const beachImage = await getCronImage('escape-index', supabase);
      const gridImage = await getCronImage('civic-data', supabase);

      for (const alert of capeTownResult.alerts) {
        const imageUrl =
          alert.type === 'calm'
            ? beachImage || '/images/placeholder-neighborhood.jpg'
            : gridImage || '/images/placeholder-neighborhood.jpg';

        const article = await conditionAlertToArticle(alert, imageUrl);

        const { error } = await supabase.from('articles').insert(article);
        if (error) {
          results.totalErrors.push(`Cape Town insert: ${error.message}`);
        } else {
          results.articlesCreated++;
        }
      }
    } catch (err) {
      results.capeTown.errors.push(
        err instanceof Error ? err.message : String(err)
      );
    }

    // =========================================================================
    // 3. SINGAPORE: Market Watch (COE + GCB)
    // =========================================================================
    console.log('Processing Singapore market alerts...');
    try {
      const singaporeAlerts = await getSingaporeMarketAlerts();
      results.singapore.alerts = singaporeAlerts.length;

      const marketImage = await getCronImage('real-estate', supabase);

      for (const alert of singaporeAlerts) {
        const article = await singaporeAlertToArticle(
          alert,
          marketImage || '/images/placeholder-neighborhood.jpg'
        );

        const { error } = await supabase.from('articles').insert(article);
        if (error) {
          results.totalErrors.push(`Singapore insert: ${error.message}`);
        } else {
          results.articlesCreated++;
        }
      }
    } catch (err) {
      results.singapore.errors.push(
        err instanceof Error ? err.message : String(err)
      );
    }

    // =========================================================================
    // 4. PALM BEACH: ARCOM Watch
    // =========================================================================
    console.log('Processing Palm Beach ARCOM agenda...');
    try {
      const arcomResult = await processARCOMAgenda(14);
      results.palmBeach.alerts = arcomResult.alerts.length;
      results.palmBeach.errors = arcomResult.errors;

      const designImage = await getCronImage('real-estate', supabase);

      for (const alert of arcomResult.alerts) {
        const article = await arcomAlertToArticle(
          alert,
          designImage || '/images/placeholder-neighborhood.jpg'
        );

        const { error } = await supabase.from('articles').insert(article);
        if (error) {
          results.totalErrors.push(`Palm Beach insert: ${error.message}`);
        } else {
          results.articlesCreated++;
        }
      }
    } catch (err) {
      results.palmBeach.errors.push(
        err instanceof Error ? err.message : String(err)
      );
    }

    console.log('Anglosphere features sync complete:', results);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('Anglosphere features cron error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        results,
      },
      { status: 500 }
    );
  }
}
