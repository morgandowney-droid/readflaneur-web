import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * @swagger
 * /api/comments/recent:
 *   get:
 *     summary: Fetch recent approved comments across all articles
 *     tags: [Comments]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *           maximum: 20
 *         description: Number of recent comments to return (max 20)
 *     responses:
 *       200:
 *         description: List of recent comments with article info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 comments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       content:
 *                         type: string
 *                       author_name:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                       article_headline:
 *                         type: string
 *                       article_url:
 *                         type: string
 *       500:
 *         description: Server error
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 20);

  const supabase = await createClient();

  const { data: comments, error } = await supabase
    .from('comments')
    .select(`
      id,
      content,
      author_name,
      created_at,
      article:articles(
        id,
        headline,
        slug,
        neighborhood:neighborhoods(
          name,
          city,
          slug
        )
      )
    `)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform the data to flatten article info
  const transformed = (comments || []).map((comment: any) => {
    const article = comment.article?.[0];
    const neighborhood = article?.neighborhood?.[0];

    // Build the article URL
    let articleUrl = '#';
    if (article && neighborhood) {
      const citySlug = neighborhood.city.toLowerCase().replace(/\s+/g, '-');
      const neighborhoodSlug = neighborhood.name.toLowerCase().replace(/\s+/g, '-');
      articleUrl = `/${citySlug}/${neighborhoodSlug}/${article.slug || article.id}`;
    }

    return {
      id: comment.id,
      content: comment.content,
      author_name: comment.author_name,
      created_at: comment.created_at,
      article_headline: article?.headline || 'Unknown article',
      article_url: articleUrl,
    };
  });

  return NextResponse.json({ comments: transformed });
}
