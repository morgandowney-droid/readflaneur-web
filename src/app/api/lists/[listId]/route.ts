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

// GET /api/lists/[listId] - Get a specific list with items
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const admin = getAdminClient();

    const { data: list, error } = await admin
      .from('destination_lists')
      .select(`
        id, user_id, name, slug, is_default, is_public, share_token, created_at, updated_at,
        destination_list_items (
          neighborhood_id, sort_order, added_at
        )
      `)
      .eq('id', listId)
      .single();

    if (error || !list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    // Check access: owner or public
    const supabase = getAuthClient();
    const { data: { session } } = await supabase.auth.getSession();
    const isOwner = session?.user?.id === list.user_id;

    if (!isOwner && !list.is_public) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ list, isOwner });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH /api/lists/[listId] - Update list name, visibility, etc.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const updates = await request.json();

    const supabase = getAuthClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = getAdminClient();

    // Verify ownership
    const { data: existing } = await admin
      .from('destination_lists')
      .select('id, user_id, is_default')
      .eq('id', listId)
      .single();

    if (!existing || existing.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Build safe update object
    const safeUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof updates.name === 'string' && updates.name.length <= 50) {
      safeUpdates.name = updates.name;
      if (!existing.is_default) {
        safeUpdates.slug = updates.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'list';
      }
    }
    if (typeof updates.is_public === 'boolean') safeUpdates.is_public = updates.is_public;

    const { data: list, error } = await admin
      .from('destination_lists')
      .update(safeUpdates)
      .eq('id', listId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ list });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE /api/lists/[listId] - Delete a list (cannot delete default)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;

    const supabase = getAuthClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = getAdminClient();

    // Verify ownership and not default
    const { data: existing } = await admin
      .from('destination_lists')
      .select('id, user_id, is_default')
      .eq('id', listId)
      .single();

    if (!existing || existing.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (existing.is_default) {
      return NextResponse.json({ error: 'Cannot delete default list' }, { status: 400 });
    }

    // Cascade delete removes items automatically
    const { error } = await admin
      .from('destination_lists')
      .delete()
      .eq('id', listId);

    if (error) {
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
