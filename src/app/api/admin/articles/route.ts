import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * @swagger
 * /api/admin/articles:
 *   get:
 *     summary: Get articles for admin review
 *     tags: [Admin]
 *     security:
 *       - supabaseAuth: []
 *     parameters:
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *           default: pending
 *         description: Filter articles by status (e.g. pending)
 *     responses:
 *       200:
 *         description: Filtered list of articles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 articles:
 *                   type: array
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin role required)
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'pending';

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

    // Check authentication and admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Fetch articles
    let query = supabase
      .from('articles')
      .select(`
        *,
        author:profiles!articles_author_id_fkey(email, full_name),
        neighborhood:neighborhoods(name, city)
      `)
      .order('created_at', { ascending: false });

    if (filter === 'pending') {
      query = query.eq('status', 'pending');
    }

    const { data: articles, error } = await query;

    if (error) {
      console.error('Fetch articles error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ articles: articles || [] });
  } catch (err) {
    console.error('Admin articles API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
