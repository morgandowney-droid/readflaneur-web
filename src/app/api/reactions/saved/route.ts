import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * @swagger
 * /api/reactions/saved:
 *   get:
 *     summary: Get saved/bookmarked articles for a user
 *     tags: [Reactions]
 *     description: Returns articles the user has reacted to. Uses authenticated session or anonymous ID.
 *     parameters:
 *       - in: query
 *         name: anonymousId
 *         schema:
 *           type: string
 *         description: Anonymous user ID (from localStorage) when not authenticated
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           default: bookmark
 *         description: Reaction type to filter by
 *     responses:
 *       200:
 *         description: List of saved articles with neighborhood info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 articles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       headline:
 *                         type: string
 *                       preview_text:
 *                         type: string
 *                       slug:
 *                         type: string
 *                       neighborhood_id:
 *                         type: string
 *                       image_url:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                       neighborhood:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           city:
 *                             type: string
 *       500:
 *         description: Server error
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const anonymousId = searchParams.get('anonymousId');
  const reactionType = searchParams.get('type') || 'bookmark';

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;

  if (!userId && !anonymousId) {
    return NextResponse.json({ articles: [] });
  }

  let query = supabase
    .from('article_reactions')
    .select(`
      reaction_type,
      created_at,
      article:articles(id, headline, preview_text, slug, neighborhood_id, image_url, created_at,
        neighborhood:neighborhoods(name, city)
      )
    `)
    .eq('reaction_type', reactionType)
    .order('created_at', { ascending: false })
    .limit(50);

  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('anonymous_id', anonymousId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const articles = (data || [])
    .filter((r: any) => r.article)
    .map((r: any) => r.article);

  return NextResponse.json({ articles });
}
