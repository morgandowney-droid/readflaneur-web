import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

/**
 * @swagger
 * /api/revalidate:
 *   get:
 *     summary: Revalidate Next.js cached paths
 *     description: Triggers on-demand revalidation of cached pages. If no path specified, revalidates all common paths.
 *     tags: [Internal]
 *     parameters:
 *       - in: query
 *         name: secret
 *         required: true
 *         schema:
 *           type: string
 *         description: Revalidation secret
 *       - in: query
 *         name: path
 *         schema:
 *           type: string
 *         description: Specific path to revalidate (e.g., /feed)
 *     responses:
 *       200:
 *         description: Revalidation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 revalidated:
 *                   type: boolean
 *                   example: true
 *                 path:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Invalid secret
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const path = searchParams.get('path');

  // Verify secret (check both possible env vars)
  const validSecret = process.env.CRON_SECRET || process.env.REVALIDATE_SECRET || 'flaneur-cron-secret-2026';
  if (secret !== validSecret) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  try {
    if (path) {
      // Revalidate specific path
      revalidatePath(path);
      return NextResponse.json({
        revalidated: true,
        path,
        timestamp: new Date().toISOString()
      });
    }

    // Revalidate all common paths
    const paths = [
      '/',
      '/new-york/west-village',
      '/london/notting-hill',
      '/san-francisco/pacific-heights',
      '/stockholm/ostermalm',
      '/sydney/paddington',
    ];

    for (const p of paths) {
      revalidatePath(p);
    }

    return NextResponse.json({
      revalidated: true,
      paths,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Revalidation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
