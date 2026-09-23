import {
  withLicensee,
  feedJson,
  feedError,
  getEdition,
  getDailyEdition,
  localDateIn,
  parseLang,
  FEED_VERSION,
  SUPPORTED_LANGUAGES,
} from '@/lib/licensee-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A first request in a language nobody has read yet translates on demand (about 10-20s).
export const maxDuration = 120;

/**
 * @swagger
 * /api/v1/editions/{id}/daily:
 *   get:
 *     summary: The finished daily edition for one place and one local date
 *     description: The Daily Brief (headline, subject teaser, body as markdown and as a list of stories with sources and place) and the Look Ahead (headline, body, structured events) for the given local date in the edition's own timezone. Spec for licensees is docs/licensee-feed-api.md.
 *     tags:
 *       - Licensee Feed
 *     security:
 *       - licenseeKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Edition id from /api/v1/editions
 *       - in: query
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Local date YYYY-MM-DD. Defaults to today in the edition's timezone.
 *       - in: query
 *         name: lang
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, de, fr, es, it, pt, sv, zh, ja]
 *         description: Language to return. Falls back to English when a translation fails; the response field "language" says which was returned.
 *     responses:
 *       200:
 *         description: The daily edition. daily_brief or look_ahead is null when not yet published for that date.
 *       400:
 *         description: Bad date or unsupported language
 *       401:
 *         description: Missing or invalid key
 *       404:
 *         description: Edition not licensed to this key
 *       429:
 *         description: More than 60 requests in a minute for this key
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLicensee(request, async (auth, db) => {
    const { id } = await params;
    const url = new URL(request.url);

    const edition = await getEdition(db, auth, id);
    if (!edition) return feedError(404, 'edition_not_found', `No edition "${id}" for this key.`);

    const lang = parseLang(url.searchParams.get('lang'), auth);
    if (!lang) {
      return feedError(400, 'bad_request', `"lang" must be one of: ${SUPPORTED_LANGUAGES.join(', ')}.`);
    }

    const today = localDateIn(edition.timezone);
    const date = url.searchParams.get('date') || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(`${date}T00:00:00Z`))) {
      return feedError(400, 'bad_request', '"date" must be YYYY-MM-DD.');
    }
    if (date > today) {
      return feedError(400, 'bad_request', `"date" is after today (${today}) in ${edition.timezone}.`);
    }

    const daily = await getDailyEdition(db, edition, date, lang);
    return feedJson({ version: FEED_VERSION, ...daily });
  });
}
