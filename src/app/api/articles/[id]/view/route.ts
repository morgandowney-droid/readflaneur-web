import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * @swagger
 * /api/articles/{id}/view:
 *   post:
 *     summary: Increment the view count for an article
 *     tags: [Articles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The article ID
 *     responses:
 *       200:
 *         description: View count incremented
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       500:
 *         description: Server error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    // Try to use atomic increment function if it exists
    const { error: rpcError } = await supabase.rpc('increment_article_views', {
      article_id: id,
    });

    if (rpcError) {
      // Fallback: fetch current value and update
      const { data: article } = await supabase
        .from('articles')
        .select('views')
        .eq('id', id)
        .single();

      if (article) {
        await supabase
          .from('articles')
          .update({ views: (article.views || 0) + 1 })
          .eq('id', id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('View tracking error:', err);
    return NextResponse.json({ error: 'Failed to track view' }, { status: 500 });
  }
}
