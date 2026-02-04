/**
 * API endpoint to enrich a brief with source links
 * POST /api/briefs/enrich-sources
 *
 * Body: { briefContent, neighborhoodName, neighborhoodSlug, city }
 * Returns: EnrichedBrief with stories and their sources
 */

import { NextResponse } from 'next/server';
import { findSourcesForBrief } from '@/lib/brief-sources';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { briefContent, neighborhoodName, neighborhoodSlug, city, maxStories } = body;

    if (!briefContent || !neighborhoodName || !neighborhoodSlug) {
      return NextResponse.json(
        { error: 'Missing required fields: briefContent, neighborhoodName, neighborhoodSlug' },
        { status: 400 }
      );
    }

    const result = await findSourcesForBrief(
      briefContent,
      neighborhoodName,
      neighborhoodSlug,
      city || 'New York',
      { maxStories: maxStories || 6 }
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error enriching brief sources:', error);
    return NextResponse.json(
      { error: 'Failed to enrich brief sources', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
