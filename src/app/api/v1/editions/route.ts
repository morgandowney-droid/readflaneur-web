import { withLicensee, feedJson, listEditions, FEED_VERSION } from '@/lib/licensee-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/v1/editions:
 *   get:
 *     summary: List the editions a licensee key may read
 *     description: Returns every edition licensed to the calling key, in the order configured for that licensee. Spec for licensees is docs/licensee-feed-api.md.
 *     tags:
 *       - Licensee Feed
 *     security:
 *       - licenseeKey: []
 *     responses:
 *       200:
 *         description: Editions licensed to this key (id, name, city, region, country, timezone, language, languages)
 *       401:
 *         description: Missing or invalid key
 *       429:
 *         description: More than 60 requests in a minute for this key
 */
export async function GET(request: Request) {
  return withLicensee(request, async (auth, db) => {
    const editions = await listEditions(db, auth);
    return feedJson({ version: FEED_VERSION, editions });
  });
}
