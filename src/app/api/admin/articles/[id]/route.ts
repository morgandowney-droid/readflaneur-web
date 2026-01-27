import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Fetch article
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select(`
        *,
        author:profiles!articles_author_id_fkey(email, full_name),
        neighborhood:neighborhoods(name, city)
      `)
      .eq('id', id)
      .single();

    if (articleError || !article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    // Fetch neighborhoods for dropdown
    const { data: neighborhoods } = await supabase
      .from('neighborhoods')
      .select('id, name, city')
      .order('city')
      .order('name');

    return NextResponse.json({
      article,
      neighborhoods: neighborhoods || [],
    });
  } catch (err) {
    console.error('Admin article GET error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const body = await request.json();
    const {
      headline,
      preview_text,
      body_text,
      images,
      image_url,
      neighborhood_id,
      status,
      scheduled_for,
    } = body;

    // Build update object
    const updateData: Record<string, unknown> = {
      headline,
      preview_text,
      body_text,
      images,
      image_url,
      neighborhood_id,
      status,
      updated_at: new Date().toISOString(),
    };

    // Handle scheduling
    if (scheduled_for) {
      updateData.scheduled_for = scheduled_for;
      if (status === 'scheduled') {
        updateData.status = 'scheduled';
      }
    } else {
      updateData.scheduled_for = null;
    }

    // If publishing, set published_at
    if (status === 'published') {
      const { data: existingArticle } = await supabase
        .from('articles')
        .select('published_at')
        .eq('id', id)
        .single();

      if (!existingArticle?.published_at) {
        updateData.published_at = new Date().toISOString();
      }
    }

    const { error: updateError } = await supabase
      .from('articles')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Admin article PUT error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
