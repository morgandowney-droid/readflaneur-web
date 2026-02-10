import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  generateRealEstateWeekly,
  formatRealEstateArticle,
} from '@/lib/real-estate-gemini';
import { getCronImage } from '@/lib/cron-images';

// Extended timeout for multiple Gemini calls
export const maxDuration = 300;

// Neighborhoods to generate real estate reports for
// Start with key markets, can expand later
const REAL_ESTATE_NEIGHBORHOODS = [
  // US - Major Markets
  'nyc-tribeca',
  'nyc-west-village',
  'nyc-soho',
  'nyc-upper-east-side',
  'sf-pacific-heights',
  'sf-nob-hill',
  'la-beverly-hills',
  'la-bel-air',
  'miami-south-beach',
  'miami-brickell',
  // US - Vacation
  'us-hamptons',
  'us-nantucket',
  'us-marthas-vineyard',
  'us-aspen',
  // Europe
  'london-mayfair',
  'london-chelsea',
  'paris-marais',
  'paris-saint-germain',
  'stockholm-ostermalm',
  // European Vacation
  'europe-saint-tropez',
  'europe-marbella',
];

interface NeighborhoodData {
  id: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const neighborhoodId = searchParams.get('neighborhood'); // Optional: run for specific neighborhood

  // Auth check
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Create Supabase client inside the handler to avoid build-time issues
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results: {
    success: string[];
    failed: string[];
    skipped: string[];
  } = {
    success: [],
    failed: [],
    skipped: [],
  };

  try {
    // Get neighborhoods to process
    let neighborhoodsToProcess: string[];

    if (neighborhoodId) {
      // Single neighborhood mode
      neighborhoodsToProcess = [neighborhoodId];
    } else {
      // Full batch mode
      neighborhoodsToProcess = REAL_ESTATE_NEIGHBORHOODS;
    }

    // Fetch neighborhood data
    const { data: neighborhoods, error: fetchError } = await supabase
      .from('neighborhoods')
      .select('id, name, city, country, timezone')
      .in('id', neighborhoodsToProcess)
      .eq('is_active', true);

    if (fetchError) {
      throw new Error(`Failed to fetch neighborhoods: ${fetchError.message}`);
    }

    if (!neighborhoods || neighborhoods.length === 0) {
      return NextResponse.json({
        message: 'No neighborhoods found to process',
        results,
      });
    }

    // Get cached image for real estate (reused across all articles)
    const cachedImageUrl = await getCronImage('real-estate', supabase);

    // Process each neighborhood
    for (const neighborhood of neighborhoods as NeighborhoodData[]) {
      try {
        console.log(`Generating real estate weekly for ${neighborhood.name}...`);

        // Check if we already have an article for this week
        const weekStart = getWeekStart();
        const { data: existingArticle } = await supabase
          .from('articles')
          .select('id')
          .eq('neighborhood_id', neighborhood.id)
          .eq('category_label', 'Real Estate Weekly')
          .gte('published_at', weekStart.toISOString())
          .single();

        if (existingArticle) {
          console.log(`Skipping ${neighborhood.name} - already has article this week`);
          results.skipped.push(neighborhood.id);
          continue;
        }

        // Generate the report
        const report = await generateRealEstateWeekly(
          neighborhood.id,
          neighborhood.name,
          neighborhood.city,
          neighborhood.country
        );

        // Format the article body
        const articleBody = formatRealEstateArticle(report);

        // Generate slug
        const dateStr = new Date().toISOString().split('T')[0];
        const slug = `${neighborhood.id}-real-estate-weekly-${dateStr}`;

        // Create preview text
        const previewText = `This week's top listings and sales in ${neighborhood.name}. See the most expensive properties on the market and recent closings.`;

        // Insert article with cached image
        const { error: insertError } = await supabase.from('articles').insert({
          neighborhood_id: neighborhood.id,
          headline: report.headline,
          slug,
          body_text: articleBody,
          preview_text: previewText,
          image_url: cachedImageUrl, // Reuse cached category image
          category_label: 'Real Estate Weekly',
          status: 'published',
          published_at: new Date().toISOString(),
          article_type: 'real-estate-weekly',
          ai_model: 'gemini-2.5-flash',
          author_type: 'ai',
        });

        if (insertError) {
          throw new Error(`Failed to insert article: ${insertError.message}`);
        }

        console.log(`Created real estate weekly for ${neighborhood.name}`);
        results.success.push(neighborhood.id);

        // Small delay between API calls
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`Error processing ${neighborhood.name}:`, error);
        results.failed.push(neighborhood.id);
      }
    }

    return NextResponse.json({
      message: 'Real estate weekly generation complete',
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Real estate weekly cron error:', error);
    return NextResponse.json(
      { error: String(error), results },
      { status: 500 }
    );
  }
}

function getWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek; // Sunday = 0
  const weekStart = new Date(now.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}
