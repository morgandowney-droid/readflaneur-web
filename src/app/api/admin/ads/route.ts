import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'pending_review';

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

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Fetch ads
    let query = supabase
      .from('ads')
      .select(`
        *,
        advertiser:profiles!ads_advertiser_id_fkey(email),
        neighborhood:neighborhoods(name, city)
      `)
      .order('created_at', { ascending: false });

    if (filter === 'pending_review') {
      query = query.eq('status', 'pending_review');
    } else if (filter === 'needs_design') {
      query = query.eq('needs_design_service', true).eq('status', 'pending_review');
    } else if (filter === 'active') {
      query = query.eq('status', 'active');
    }

    const { data: ads, error: adsError } = await query;

    if (adsError) {
      return NextResponse.json({ error: adsError.message }, { status: 500 });
    }

    return NextResponse.json({ ads: ads || [], isAdmin: true });
  } catch (err) {
    console.error('Admin ads API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
