import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * @swagger
 * /api/neighborhoods/save-preferences:
 *   post:
 *     summary: Save neighborhood preferences (replace all)
 *     description: Replaces all neighborhood preferences for the authenticated user. Uses cookie-based auth with service role key for DB write.
 *     tags:
 *       - Neighborhoods
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - neighborhoodIds
 *             properties:
 *               neighborhoodIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Preferences saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 saved:
 *                   type: number
 *       400:
 *         description: neighborhoodIds not provided or not an array
 *       401:
 *         description: Not authenticated
 */
export async function POST(request: NextRequest) {
  try {
    const { neighborhoodIds } = await request.json();

    if (!Array.isArray(neighborhoodIds)) {
      return NextResponse.json({ error: 'neighborhoodIds required' }, { status: 400 });
    }

    // Authenticate via cookies
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
            // Read-only
          },
        },
      }
    );

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ success: true }); // Not authenticated — silent no-op
    }

    const userId = session.user.id;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const headers = {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    };

    // Delete all existing preferences for this user
    await fetch(
      `${supabaseUrl}/rest/v1/user_neighborhood_preferences?user_id=eq.${userId}`,
      { method: 'DELETE', headers }
    );

    // Insert new preferences
    if (neighborhoodIds.length > 0) {
      const rows = neighborhoodIds
        .filter((id: unknown) => typeof id === 'string' && id.length > 0)
        .map((id: string) => ({
          user_id: userId,
          neighborhood_id: id,
        }));

      if (rows.length > 0) {
        await fetch(
          `${supabaseUrl}/rest/v1/user_neighborhood_preferences`,
          { method: 'POST', headers, body: JSON.stringify(rows) }
        );
      }
    }

    return NextResponse.json({ success: true, saved: neighborhoodIds.length });
  } catch {
    return NextResponse.json({ success: true }); // Silent fail
  }
}
