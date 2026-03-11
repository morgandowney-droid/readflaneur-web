import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

function getAuthClient() {
  const cookieStore = cookies();
  return createServerClient(
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
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET /api/lists - Fetch all lists for the authenticated user
export async function GET() {
  try {
    const supabase = getAuthClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ lists: [] });
    }

    const admin = getAdminClient();
    const { data: lists, error } = await admin
      .from('destination_lists')
      .select(`
        id, name, slug, is_default, is_public, share_token, created_at, updated_at,
        destination_list_items (
          neighborhood_id, sort_order, added_at
        )
      `)
      .eq('user_id', session.user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch lists:', error);
      return NextResponse.json({ lists: [] });
    }

    return NextResponse.json({ lists: lists || [] });
  } catch {
    return NextResponse.json({ lists: [] });
  }
}

// POST /api/lists - Create a new list
export async function POST(request: NextRequest) {
  try {
    const { name, isDefault } = await request.json();

    if (!name || typeof name !== 'string' || name.length > 50) {
      return NextResponse.json({ error: 'Name required (max 50 chars)' }, { status: 400 });
    }

    const supabase = getAuthClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = getAdminClient();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'list';

    // Check for slug collision, append suffix if needed
    const { count } = await admin
      .from('destination_lists')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('slug', slug);

    const finalSlug = (count && count > 0) ? `${slug}-${Date.now().toString(36).slice(-4)}` : slug;

    // Generate share token
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let shareToken = '';
    for (let i = 0; i < 8; i++) {
      shareToken += chars[Math.floor(Math.random() * chars.length)];
    }

    const { data: list, error } = await admin
      .from('destination_lists')
      .insert({
        user_id: session.user.id,
        name,
        slug: finalSlug,
        is_default: isDefault || false,
        share_token: shareToken,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create list:', error);
      return NextResponse.json({ error: 'Failed to create list' }, { status: 500 });
    }

    return NextResponse.json({ list });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
