/**
 * API endpoint to enrich a brief using Gemini with Google Search grounding
 * POST /api/briefs/enrich-gemini
 *
 * Body: { briefId } - Enrich existing brief by ID
 * OR:   { briefContent, neighborhoodName, neighborhoodSlug, city, country } - Direct enrichment
 *
 * Returns: EnrichedBriefOutput with categories, sources, and rich context
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enrichBriefWithGemini } from '@/lib/brief-enricher-gemini';

export const maxDuration = 120; // Allow up to 120 seconds for Gemini API

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { briefId, briefContent, neighborhoodName, neighborhoodSlug, city, country } = body;

    // If briefId provided, fetch the brief and its neighborhood
    if (briefId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Get the brief with neighborhood info and generated_at timestamp
      const { data: brief, error: briefError } = await supabase
        .from('neighborhood_briefs')
        .select(`
          id,
          content,
          headline,
          neighborhood_id,
          generated_at,
          neighborhoods (
            name,
            id,
            city,
            country
          )
        `)
        .eq('id', briefId)
        .single();

      if (briefError || !brief) {
        return NextResponse.json(
          { error: 'Brief not found', details: briefError?.message },
          { status: 404 }
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hood = brief.neighborhoods as unknown as { name: string; id: string; city: string; country: string };

      // Enrich with Gemini, passing the brief's generation timestamp for correct time context
      const result = await enrichBriefWithGemini(
        brief.content,
        hood.name,
        hood.id,
        hood.city,
        hood.country || 'USA',
        {
          briefGeneratedAt: brief.generated_at,
        }
      );

      // Store the enriched data back to the database
      const { error: updateError } = await supabase
        .from('neighborhood_briefs')
        .update({
          enriched_content: result.rawResponse || null,
          enriched_categories: result.categories,
          enriched_at: new Date().toISOString(),
          enrichment_model: result.model,
        })
        .eq('id', briefId);

      if (updateError) {
        console.error('Failed to save enriched data:', updateError);
        // Still return the result even if save failed
      }

      return NextResponse.json({
        success: true,
        briefId,
        enrichedAt: result.processedAt,
        model: result.model,
        categoriesCount: result.categories.length,
        storiesCount: result.categories.reduce((sum, cat) => sum + cat.stories.length, 0),
        result,
      });
    }

    // Direct enrichment without storing
    if (!briefContent || !neighborhoodName || !neighborhoodSlug) {
      return NextResponse.json(
        { error: 'Missing required fields: briefContent, neighborhoodName, neighborhoodSlug (or briefId)' },
        { status: 400 }
      );
    }

    const result = await enrichBriefWithGemini(
      briefContent,
      neighborhoodName,
      neighborhoodSlug,
      city || 'New York',
      country || 'USA'
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error enriching brief with Gemini:', error);
    return NextResponse.json(
      { error: 'Failed to enrich brief', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
