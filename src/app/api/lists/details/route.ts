import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * @swagger
 * /api/lists/details:
 *   get:
 *     summary: Get neighborhood details for list items
 *     description: Returns neighborhood details and thumbnail images for the wishlist dropdown. No auth required. 5-minute cache.
 *     tags:
 *       - Lists
 *     parameters:
 *       - in: query
 *         name: ids
 *         required: true
 *         schema:
 *           type: string
 *         description: Comma-separated neighborhood IDs (max 50)
 *         example: "nyc-tribeca,nyc-soho,paris-marais"
 *     responses:
 *       200:
 *         description: Neighborhood details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       city:
 *                         type: string
 *                       country:
 *                         type: string
 *                       imageUrl:
 *                         type: string
 */
export async function GET(request: NextRequest) {
  try {
    const idsParam = request.nextUrl.searchParams.get('ids');
    if (!idsParam) {
      return NextResponse.json({ items: [] });
    }

    const ids = idsParam.split(',').filter(Boolean).slice(0, 50);
    if (!ids.length) {
      return NextResponse.json({ items: [] });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch neighborhoods and images in parallel
    const [{ data: neighborhoods }, { data: images }] = await Promise.all([
      admin
        .from('neighborhoods')
        .select('id, name, city, country')
        .in('id', ids),
      admin
        .from('image_library_status')
        .select('neighborhood_id, unsplash_photos')
        .in('neighborhood_id', ids),
    ]);

    const imageMap: Record<string, string> = {};
    if (images) {
      for (const row of images) {
        if (!row.unsplash_photos) continue;
        const cats = ['daily-brief-1', 'daily-brief-2', 'look-ahead-1', 'sunday-edition', 'rss-story'];
        for (const cat of cats) {
          const photo = (row.unsplash_photos as Record<string, { url?: string }>)[cat];
          if (photo?.url) {
            const url = photo.url.includes('?')
              ? photo.url.replace(/&w=\d+/, '&w=200')
              : `${photo.url}&w=200&q=80&fm=webp`;
            imageMap[row.neighborhood_id] = url;
            break;
          }
        }
      }
    }

    const items = (neighborhoods || []).map(n => ({
      id: n.id,
      name: n.name,
      city: n.city,
      country: n.country,
      imageUrl: imageMap[n.id] || null,
    }));

    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
