/**
 * API endpoint to enrich a brief with source links
 * POST /api/briefs/enrich-sources
 *
 * Body: { briefContent, neighborhoodName, neighborhoodSlug, city }
 * Returns: EnrichedBrief with stories and their sources
 */

import { NextResponse } from 'next/server';
import { findSourcesForBrief } from '@/lib/brief-sources';

/**
 * @swagger
 * /api/briefs/enrich-sources:
 *   post:
 *     summary: Enrich a brief with source links
 *     description: Finds and attaches source URLs to brief content. No authentication required.
 *     tags:
 *       - Briefs
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [briefContent, neighborhoodName, neighborhoodSlug]
 *             properties:
 *               briefContent:
 *                 type: string
 *               neighborhoodName:
 *                 type: string
 *               neighborhoodSlug:
 *                 type: string
 *               city:
 *                 type: string
 *               maxStories:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Enriched brief with stories and sources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stories:
 *                   type: array
 *                   items:
 *                     type: object
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Missing required fields
 */
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
