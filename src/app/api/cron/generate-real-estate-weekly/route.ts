import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  generateRealEstateWeekly,
  formatRealEstateArticle,
} from '@/lib/real-estate-gemini';

// Extended timeout for multiple Gemini calls
export const maxDuration = 300;

// Neighborhood-specific streetscape images from Unsplash
const NEIGHBORHOOD_IMAGES: Record<string, string> = {
  // NYC
  'nyc-tribeca': 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=800&q=80', // Tribeca streets
  'nyc-west-village': 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800&q=80', // West Village brownstones
  'nyc-soho': 'https://images.unsplash.com/photo-1587162146766-e06b1189b907?w=800&q=80', // SoHo cast iron buildings
  'nyc-upper-east-side': 'https://images.unsplash.com/photo-1568515387631-8b650bbcdb90?w=800&q=80', // UES architecture
  // SF
  'sf-pacific-heights': 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=800&q=80', // SF Victorian homes
  'sf-nob-hill': 'https://images.unsplash.com/photo-1521747116042-5a810fda9664?w=800&q=80', // Nob Hill cable car
  // LA
  'la-beverly-hills': 'https://images.unsplash.com/photo-1580655653885-65763b2597d0?w=800&q=80', // Beverly Hills palm trees
  'la-bel-air': 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80', // Bel Air luxury home
  // Miami
  'miami-south-beach': 'https://images.unsplash.com/photo-1535498730771-e735b998cd64?w=800&q=80', // South Beach art deco
  'miami-brickell': 'https://images.unsplash.com/photo-1506966953602-c20cc11f75e3?w=800&q=80', // Brickell skyline
  // US Vacation
  'us-hamptons': 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80', // Hamptons beach house
  'us-nantucket': 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80', // Nantucket cottage
  'us-marthas-vineyard': 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80', // Martha's Vineyard
  'us-aspen': 'https://images.unsplash.com/photo-1602002418082-a4443e081dd1?w=800&q=80', // Aspen mountains
  // London
  'london-mayfair': 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80', // London townhouses
  'london-chelsea': 'https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=800&q=80', // Chelsea street
  // Paris
  'paris-marais': 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80', // Paris architecture
  'paris-saint-germain': 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&q=80', // Saint-Germain
  // Stockholm
  'stockholm-ostermalm': 'https://images.unsplash.com/photo-1509356843151-3e7d96241e11?w=800&q=80', // Stockholm waterfront
  // European Vacation
  'europe-saint-tropez': 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=800&q=80', // Saint-Tropez harbor
  'europe-marbella': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80', // Marbella beach
};

// Default fallback image
const DEFAULT_REAL_ESTATE_IMAGE = 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80';

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

        // Get neighborhood-specific streetscape image
        const imageUrl = NEIGHBORHOOD_IMAGES[neighborhood.id] || DEFAULT_REAL_ESTATE_IMAGE;

        // Insert article with neighborhood-specific image
        const { error: insertError } = await supabase.from('articles').insert({
          neighborhood_id: neighborhood.id,
          headline: report.headline,
          slug,
          body_text: articleBody,
          preview_text: previewText,
          image_url: imageUrl,
          category_label: 'Real Estate Weekly',
          status: 'published',
          published_at: new Date().toISOString(),
          article_type: 'real-estate-weekly',
          ai_model: 'gemini-2.0-flash',
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
