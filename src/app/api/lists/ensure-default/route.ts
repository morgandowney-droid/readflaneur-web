import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * @swagger
 * /api/lists/ensure-default:
 *   post:
 *     summary: Ensure a default Favourites list exists
 *     description: Creates a default "Favourites" list if one doesn't exist. Requires authenticated session.
 *     tags:
 *       - Lists
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Default list ensured
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 listId:
 *                   type: string
 *                 created:
 *                   type: boolean
 *       401:
 *         description: Not authenticated
 */
export async function POST() {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          async getAll() {
            return (await cookieStore).getAll();
          },
          setAll() {},
        },
      }
    );

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if default list already exists
    const { data: existing } = await admin
      .from('destination_lists')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('is_default', true)
      .single();

    if (existing) {
      return NextResponse.json({ listId: existing.id, created: false });
    }

    // Generate share token
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let shareToken = '';
    for (let i = 0; i < 8; i++) {
      shareToken += chars[Math.floor(Math.random() * chars.length)];
    }

    // Create default list with share token
    const { data: list, error } = await admin
      .from('destination_lists')
      .insert({
        user_id: session.user.id,
        name: 'My News Feed',
        slug: 'my-news-feed',
        is_default: true,
        share_token: shareToken,
      })
      .select('id')
      .single();

    if (error) {
      // Unique constraint - another request already created it
      if (error.code === '23505') {
        const { data: retry } = await admin
          .from('destination_lists')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('is_default', true)
          .single();
        return NextResponse.json({ listId: retry?.id, created: false });
      }
      return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
    }

    return NextResponse.json({ listId: list.id, created: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
