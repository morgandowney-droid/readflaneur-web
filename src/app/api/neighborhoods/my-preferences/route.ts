import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Server-side endpoint to fetch neighborhood preferences for the logged-in user.
// Bypasses GoTrue's navigator.locks deadlock on mobile Safari by using
// cookie-based auth (server-side) instead of client-side getSession().
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
