import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * @swagger
 * /api/neighborhoods/my-preferences:
 *   get:
 *     summary: Get user's neighborhood preferences
 *     description: Fetches neighborhood preferences for the logged-in user via cookie-based auth. Returns null ids for unauthenticated users.
 *     tags:
 *       - Neighborhoods
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User neighborhood preferences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ids:
 *                   type: array
 *                   nullable: true
 *                   items:
 *                     type: string
 *                 userId:
 *                   type: string
 */
export async function GET() {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // Read-only - no cookie mutations needed
          },
        },
      }
    );

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ ids: null }); // Not authenticated
    }

    const { data: prefs } = await supabase
      .from('user_neighborhood_preferences')
      .select('neighborhood_id');

    const ids = prefs?.map(p => p.neighborhood_id) || [];
    return NextResponse.json({ ids, userId: session.user.id });
  } catch {
    return NextResponse.json({ ids: null });
  }
}
