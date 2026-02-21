import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/neighborhoods/add
 *
 * Adds a neighborhood to the authenticated user's preferences in the DB.
 * Anonymous users just get { success: true } (localStorage-only is fine).
 * Called fire-and-forget from AddToCollectionCTA.
 *
 * Body: { neighborhoodId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { neighborhoodId } = body;

    if (!neighborhoodId || typeof neighborhoodId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'neighborhoodId is required' },
        { status: 400 }
      );
    }

    // Use getSession() - instant, no network call
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
              try { cookieStore.set(name, value, options); } catch { /* read-only in RSC */ }
            });
          },
        },
      }
    );

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      // Anonymous - localStorage-only is fine
      return NextResponse.json({ success: true });
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('user_neighborhood_preferences')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('neighborhood_id', neighborhoodId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true });
    }

    // Insert new preference
    await supabase
      .from('user_neighborhood_preferences')
      .insert({
        user_id: session.user.id,
        neighborhood_id: neighborhoodId,
      });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true }); // Silent fail - localStorage is the source of truth
  }
}
