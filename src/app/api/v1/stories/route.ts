import { withLicensee, feedJson, feedError, listStories, parseStoriesQuery, FEED_VERSION, approvalScope } from '@/lib/licensee-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/v1/stories:
 *   get:
 *     summary: Story-by-story feed across editions, newest first
 *     description: Each item is one story from a published Daily Brief, with its edition, place, header, text, sources, published_at and a stable id. Page with the returned next_cursor. Spec for licensees is docs/licensee-feed-api.md.
 *     tags:
 *       - Licensee Feed
 *     security:
 *       - licenseeKey: []
 *     parameters:
 *       - in: query
 *         name: editions
 *         required: false
 *         schema:
 *           type: string
 *         description: Comma-separated edition ids. Defaults to every edition licensed to the key.
 *       - in: query
 *         name: since
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Only stories published at or after this time. Defaults to 48 hours ago; at most 30 days back.
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *       - in: query
 *         name: cursor
 *         required: false
 *         schema:
 *           type: string
 *         description: next_cursor from the previous page
 *     responses:
 *       200:
 *         description: A page of stories and next_cursor (null on the last page)
 *       400:
 *         description: Bad since, limit or cursor
 *       401:
 *         description: Missing or invalid key
 *       404:
 *         description: An edition in "editions" is not licensed to this key
 *       429:
 *         description: More than 60 requests in a minute for this key
 */
export async function GET(request: Request) {
  return withLicensee(request, async (auth, db) => {
    const parsed = parseStoriesQuery(new URL(request.url), auth);
    if (!parsed.ok) return feedError(parsed.status, parsed.code, parsed.message);
    const page = await listStories(db, parsed.query, approvalScope(auth));
    return feedJson({ version: FEED_VERSION, ...page });
  });
}
