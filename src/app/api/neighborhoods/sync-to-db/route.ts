import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// Push client-side neighborhood preferences to DB.
// Called when a logged-in user has neighborhoods in localStorage but DB is empty
// (e.g., they selected neighborhoods before creating an account, or DB sync
// was failing due to expired sessions).
export async function POST(request: NextRequest) {
  try {
    const { neighborhoodIds } = await request.json();

    if (!Array.isArray(neighborhoodIds) || neighborhoodIds.length === 0) {
      return NextResponse.json({ success: true });
    }

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

    // Check if DB already has prefs (race condition guard)
    const { data: existing } = await supabase
      .from('user_neighborhood_preferences')
      .select('id')
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true }); // DB not empty — don't overwrite
    }

    // Insert all neighborhood preferences from localStorage
    const rows = neighborhoodIds.map((id: string, i: number) => ({
      user_id: userId,
      neighborhood_id: id,
      sort_order: i,
    }));

    await supabase
      .from('user_neighborhood_preferences')
      .insert(rows);

    return NextResponse.json({ success: true, synced: rows.length });
  } catch {
    return NextResponse.json({ success: true }); // Silent fail
  }
}
