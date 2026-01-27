import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
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
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    // Check authentication and admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { articleId, action, reason } = await request.json();

    if (!articleId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (action === 'publish') {
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq('id', articleId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    } else if (action === 'reject') {
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          status: 'rejected',
          rejection_reason: reason || null,
          reviewed_by: user.id,
        })
        .eq('id', articleId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    } else if (action === 'request_changes') {
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          status: 'draft',
          editor_notes: reason || null,
          reviewed_by: user.id,
        })
        .eq('id', articleId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    } else if (action === 'suspend') {
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          status: 'suspended',
          reviewed_by: user.id,
        })
        .eq('id', articleId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    } else if (action === 'republish') {
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          status: 'published',
          reviewed_by: user.id,
        })
        .eq('id', articleId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Review article API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
