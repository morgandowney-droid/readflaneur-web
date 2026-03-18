import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * @swagger
 * /api/neighborhoods/my-community-count:
 *   get:
 *     summary: Get count of user's community neighborhoods
 *     description: Returns the number of active community neighborhoods created by the authenticated user. Returns 0 for anonymous users.
 *     tags:
 *       - Community
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Community neighborhood count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: number
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ count: 0 });
    }

    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { count, error } = await admin
      .from('neighborhoods')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', session.user.id)
      .eq('is_community', true)
      .eq('community_status', 'active');

    if (error) {
      console.error('Community count error:', error);
      return NextResponse.json({ count: 0 });
    }

    return NextResponse.json({ count: count || 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
