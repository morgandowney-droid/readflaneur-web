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

// POST /api/lists/[listId]/items - Add a neighborhood to a list
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const { neighborhoodId } = await request.json();

    if (!neighborhoodId || typeof neighborhoodId !== 'string') {
      return NextResponse.json({ error: 'neighborhoodId required' }, { status: 400 });
    }

    const supabase = getAuthClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = getAdminClient();

    // Verify ownership
    const { data: list } = await admin
      .from('destination_lists')
      .select('id, user_id, is_default')
      .eq('id', listId)
      .single();

    if (!list || list.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Get next sort_order
    const { count } = await admin
      .from('destination_list_items')
      .select('*', { count: 'exact', head: true })
      .eq('list_id', listId);

    const sortOrder = (count || 0);

    // Insert item (unique constraint prevents duplicates)
    const { error } = await admin
      .from('destination_list_items')
      .insert({
        list_id: listId,
        neighborhood_id: neighborhoodId,
        sort_order: sortOrder,
      });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: true, alreadyExists: true });
      }
      console.error('Failed to add item:', error);
      return NextResponse.json({ error: 'Failed to add' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE /api/lists/[listId]/items - Remove a neighborhood from a list
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const { neighborhoodId } = await request.json();

    if (!neighborhoodId || typeof neighborhoodId !== 'string') {
      return NextResponse.json({ error: 'neighborhoodId required' }, { status: 400 });
    }

    const supabase = getAuthClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = getAdminClient();

    // Verify ownership
    const { data: list } = await admin
      .from('destination_lists')
      .select('id, user_id, is_default')
      .eq('id', listId)
      .single();

    if (!list || list.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { error } = await admin
      .from('destination_list_items')
      .delete()
      .eq('list_id', listId)
      .eq('neighborhood_id', neighborhoodId);

    if (error) {
      return NextResponse.json({ error: 'Failed to remove' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
