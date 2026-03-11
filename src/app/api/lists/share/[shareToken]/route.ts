import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/lists/share/[shareToken] - Resolve a shared list
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shareToken: string }> }
) {
  try {
    const { shareToken } = await params;

    if (!shareToken || shareToken.length !== 8) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: list, error } = await admin
      .from('destination_lists')
      .select(`
        id, name, slug, is_public, share_token, created_at,
        user:profiles!user_id (full_name),
        destination_list_items (
          neighborhood_id,
          sort_order,
          neighborhood:neighborhoods (id, name, city, country, region, latitude, longitude)
        )
      `)
      .eq('share_token', shareToken)
      .eq('is_public', true)
      .single();

    if (error || !list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    return NextResponse.json({ list });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
